"""Login stays on the actual Home/Easy/Studio UI; only HTTP APIs are fixtures.
No production account, email, AI provider or payment is contacted. Studio's
actual sign-in opener is its package checkout, which creates one inert QR.
"""
import hashlib,json,os,pathlib,re,time,traceback
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE=os.environ.get('AUTH_LOCATION_BASE','http://127.0.0.1:5198')
OUT=pathlib.Path(os.environ.get('AUTH_LOCATION_OUTPUT','/tmp/auth-location-browser'));OUT.mkdir(parents=True,exist_ok=True)
SEED=re.search(r'SEED="""(.*?)"""',(ROOT/'tests/account-flow-dialog.browser.py').read_text(),re.S).group(1)
TRACKED=['src/main.jsx','src/studio-editor.jsx'];hashes=lambda:{n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest()for n in TRACKED}
START=hashes();results=[]
class Case:
 def __init__(self,browser,width,mode,retained=False):
  self.retained=retained;self.after_logout=False;self.width=width;self.mode=mode;self.name=str(width)+'-'+mode+('-after-logout'if retained else'');self.logged=False;self.invalid=True;self.calls=[];self.errors=[]
  self.ctx=browser.new_context(viewport={'width':width,'height':1000 if width>1100 else 844},has_touch=width<1100)
  self.p=self.ctx.new_page();self.p.set_default_timeout(12000);self.p.on('pageerror',lambda e:self.errors.append(str(e)))
  self.p.route('**/*',lambda r:r.continue_()if r.request.url.startswith((BASE+'/','blob:','data:'))else r.abort());self.p.route('**/api/**',self.api)
 def wallet(self,r=None):
  token=(r.request.headers.get('authorization','')if r else '')
  return {'walletId':'member_wallet'if 'member_fixture'in token else 'guest_after_logout'if self.after_logout and not token else 'wallet_fixture','processRemaining':0,'trialRemaining':2,'premiumDownloadRemaining':0,'canSave':False,'unlockedJobIds':[],'editableJobIds':[]}
 def payment(self,old=False):
  return {'paymentIntentId':'pi_fixture'if old else'pi_authfixture','walletId':'wallet_fixture'if old else'member_wallet','jobId':'job_fixture','packageId':'89','amount':89,'status':'canceled'if old else'requires_action','ok':False,'expiresAt':int(time.time())+1800,'qrImage':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='}
 def api(self,r):
  u=r.request.url.split(BASE)[-1];method=r.request.method;self.calls.append({'url':u,'method':method})
  if u=='/api/auth/login':
   assert json.loads(r.request.post_data)['email']=='fixture@example.invalid'
   if self.invalid:self.invalid=False;r.fulfill(status=401,content_type='application/json',body=json.dumps({'message':'รหัสผ่านทดสอบไม่ถูกต้อง'}));return
   self.logged=True;d={'token':'member_fixture','walletId':'member_wallet','processRemaining':0,'trialRemaining':2,'premiumDownloadRemaining':0,'canSave':False,'unlockedJobIds':[],'editableJobIds':[]}
  elif '/api/auth/'in u:raise AssertionError('Unexpected auth/email call: '+u)
  elif u.startswith('/api/wallet'):d=self.wallet(r)
  elif u=='/api/private-trial':d={'active':False}
  elif u.endswith('/rights'):d={'checked':True,'unlocked':False,'fullEdit':False,'premiumHair':False,'paidDownload':False}
  elif u.endswith('/suits'):d={'limited':True,'limit':3,'choices':[]}
  elif u.endswith('/claim'):
   if self.retained:r.fulfill(status=403,content_type='application/json',body=json.dumps({'error':'image_account_mismatch'}));return
   d={'ok':True}
  elif u=='/api/payments/promptpay'and method=='POST':
   assert self.mode=='studio','Ordinary login must not create a QR';assert json.loads(r.request.post_data)['packageId']=='89';d=self.payment()
  elif u.startswith('/api/payments/promptpay/'):d=self.payment(old=u.endswith('/pi_fixture'))
  elif '/unlock'in u:raise AssertionError('Login must never spend a download credit')
  else:d={'ok':True}
  r.fulfill(content_type='application/json',body=json.dumps(d))
 def actual_mode(self):return self.p.evaluate("()=>document.querySelector('.easy-home-shell')?'home':document.querySelector('.easy-mode')?'easy':document.querySelector('.studio-stage')?'studio':'other'")
 def setup(self):
  p=self.p;p.goto(BASE,wait_until='domcontentloaded')
  if self.mode=='home'and not self.retained:p.locator('.easy-home-shell').wait_for();return
  # Explicit local work recovery preserves a nonempty processed canvas. Fixture
  # storage is seeded through the unchanged production draft codec, not App hooks.
  p.evaluate(SEED);p.reload(wait_until='domcontentloaded');p.get_by_role('button',name='เปิดงานเดิมและตรวจสอบการชำระเงิน',exact=True).click();p.locator('.paired-offers').wait_for();p.keyboard.press('Escape');p.get_by_role('button',name='โหมดง่าย',exact=True).wait_for();p.get_by_role('button',name='โหมดง่าย',exact=True).click();p.locator('.easy-mode').wait_for()
  if self.retained:self.after_logout=True
  p.get_by_role('button',name='บัญชีสมาชิก',exact=True).filter(visible=True).first.click();p.get_by_role('button',name='ลงชื่อออก',exact=True).click();p.get_by_role('button',name='เมนูสมาชิก',exact=True).filter(visible=True).first.wait_for()
  if self.retained:
   p.locator('.easy-brand').click();p.locator('.easy-home-shell').wait_for();return
  if self.mode=='studio':p.locator('.easy-studio').click();p.get_by_role('button',name='เมนู',exact=True).wait_for()
  p.locator('.studio-stage>canvas').wait_for(state='attached');p.wait_for_timeout(200)
 def capture(self):
  return self.p.evaluate("""()=>{const root=document.querySelector('.easy-home-shell')||document.querySelector('main.idstudio');const canvas=document.querySelector('.studio-stage>canvas');window.__authLocationRoot=root;window.__authLocationCanvas=canvas;return {canvas:canvas?.toDataURL()||null,source:document.querySelector('.studio-source-preview')?.getAttribute('src')||null}}""")
 def open_login(self):
  p=self.p
  if self.mode=='studio':
   p.get_by_role('button',name='เมนู',exact=True).click();p.get_by_role('button',name='สิทธิ์ดาวน์โหลด ดูสิทธิ์คงเหลือและแพ็กเกจ').click();p.get_by_role('button',name='ปลดล็อกดาวน์โหลด',exact=True).click();p.get_by_role('button',name='เลือกโปร 89 บาท',exact=True).click();p.get_by_role('button',name='มีบัญชีแล้ว? เข้าสู่ระบบ',exact=True).click()
  else:
   p.get_by_role('button',name='เมนูสมาชิก',exact=True).filter(visible=True).first.click()
   p.get_by_role('button',name='เข้าสู่ระบบ / สมัครสมาชิก',exact=True).click()
  p.locator('#idprom-auth-email').wait_for();p.get_by_label('อีเมล',exact=True).fill('fixture@example.invalid');p.get_by_label('รหัสผ่าน',exact=True).fill('fixture-only-password')
 def submit(self):self.p.get_by_role('button',name='เข้าสู่ระบบและเปิด QR'if self.mode=='studio'else'เข้าสู่ระบบ',exact=True).click()
 def run(self):
  p=self.p;self.setup();assert self.actual_mode()==self.mode;before=self.capture();self.open_login();self.submit();p.get_by_text('รหัสผ่านทดสอบไม่ถูกต้อง',exact=True).wait_for();assert self.actual_mode()==self.mode;assert p.locator('#idprom-auth-email').count()==1;assert not self.logged
  self.submit();p.wait_for_function("!document.querySelector('#idprom-auth-email')");p.wait_for_function("localStorage.getItem('idprom_auth_token')==='member_fixture'")
  if self.mode=='studio':p.locator('.idprom-qr-panel').wait_for();p.get_by_role('button',name='ปิดแพ็กเกจ',exact=True).click()
  p.wait_for_timeout(250);assert self.actual_mode()==self.mode
  after=p.evaluate("""()=>{const root=document.querySelector('.easy-home-shell')||document.querySelector('main.idstudio');const canvas=document.querySelector('.studio-stage>canvas');return {sameRoot:root===window.__authLocationRoot,sameCanvas:canvas===window.__authLocationCanvas,canvas:canvas?.toDataURL()||null,source:document.querySelector('.studio-source-preview')?.getAttribute('src')||null}}""")
  assert after['sameRoot'];assert after['sameCanvas'];assert after['canvas']==before['canvas'],'Canvas pixels changed during login';assert after['source']==before['source']
  creates=[c for c in self.calls if c['url']=='/api/payments/promptpay'and c['method']=='POST'];assert len(creates)==int(self.mode=='studio')
  assert len([c for c in self.calls if c['url']=='/api/auth/login'])==2
  if self.retained:
   assert not [call for call in self.calls if call['url'].endswith('/claim')],'Home login tried to move an old account photo'
   assert p.get_by_text('เข้าสู่ระบบแล้ว แต่ยังเตรียมรูปไม่สำเร็จ',exact=True).count()==0
  assert not self.errors,self.errors
  p.screenshot(path=str(OUT/(self.name+'-after-login.png')))
  return {'name':self.name,'passed':True,'modeBefore':self.mode,'modeAfter':self.actual_mode(),'invalidLoginRetainedForm':True,'sameRoot':True,'sameCanvas':True,'canvasPixelsUnchanged':True,'sourceUnchanged':True,'authRequests':2,'qrCreates':len(creates),'studioOpener':'actual menu/rights/package89/embeddedlogin'if self.mode=='studio'else'actual member icon','pageErrors':self.errors}
with sync_playwright()as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [1440,390]:
  for mode,retained in [('home',False),('easy',False),('studio',False),('home',True)]:
   case=Case(browser,width,mode,retained=retained)
   try:r=case.run()
   except Exception as e:case.p.screenshot(path=str(OUT/(case.name+'-error.png')));r={'name':case.name,'passed':False,'error':str(e),'traceback':traceback.format_exc(),'calls':case.calls,'pageErrors':case.errors}
   results.append(r);print(json.dumps(r,ensure_ascii=False),flush=True);case.ctx.close()
 browser.close()
proof={'passed':sum(r['passed']for r in results),'failed':sum(not r['passed']for r in results),'sourceHashesBefore':START,'sourceHashesAfter':hashes(),'scope':'Actual full App and UI login forms, no source instrumentation. All HTTP APIs mocked and external requests blocked; work recovery uses a local fixture draft. Studio uses its actual89 checkout auth opener and one inert QR. No real account, email, AI, payment or customer writes.','results':results}
(OUT/'results.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2));assert proof['failed']==0;assert START==hashes()
