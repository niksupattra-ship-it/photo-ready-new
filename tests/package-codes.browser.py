"""Actual code-entry UI and selected-size downloads, with inert HTTP fixtures.
No production coupon, account, email, image provider or payment is used. Test
codes below are fixture strings only; no actual issued-code list is read.
"""
import hashlib,json,os,pathlib,re,traceback
from playwright.sync_api import sync_playwright
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE=os.environ.get('PACKAGE_CODES_BASE','http://127.0.0.1:5200')
OUT=pathlib.Path(os.environ.get('PACKAGE_CODES_OUTPUT','/tmp/package-codes-browser'));OUT.mkdir(parents=True,exist_ok=True)
SEED=re.search(r'SEED="""(.*?)"""',(ROOT/'tests/premium-download-credits.browser.py').read_text(),re.S).group(1)
SEED=SEED.replace("restrictedTrial:true,x:0", "restrictedTrial:true,portraitMode:'female',femaleEyeStyle:'natural',hairId:'',x:0")
TRACKED=['src/main.jsx','src/studio-editor.jsx','src/package-offers.jsx','src/package-code-dialog.jsx','src/package-code-dialog.css']
hashes=lambda:{n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest()for n in TRACKED if(ROOT/n).exists()}
START=hashes();results=[]
INVALID='FIXTURE-CODE-INVALID';USED='FIXTURE-CODE-USED'
class Case:
 def __init__(self,browser,width,package='89',mode='studio'):
  self.width=width;self.package=package;self.mode=mode;self.name=str(width)+'-'+package+'-'+mode;self.unlocked=False;self.premium=False;self.calls=[];self.downloads=[];self.errors=[];self.defer_valid=package=='159'and width==390;self.pending=None
  self.ctx=browser.new_context(viewport={'width':width,'height':1000 if width>1100 else 844},has_touch=width<1100,accept_downloads=True)
  self.p=self.ctx.new_page();self.p.set_default_timeout(15000);self.p.on('pageerror',lambda e:self.errors.append(str(e)));self.p.on('download',lambda d:self.downloads.append(d))
  self.p.route('**/*',lambda r:r.continue_()if r.request.url.startswith((BASE+'/','blob:','data:'))else r.abort());self.p.route('**/api/**',self.api)
 def wallet(self):return {'walletId':'wallet_fixture','processRemaining':0,'trialRemaining':2,'premiumDownloadRemaining':0,'canSave':False,'unlockedJobIds':['job_fixture']if self.unlocked else [],'editableJobIds':['job_fixture']if self.unlocked else []}
 def reply(self,r,d,status=200):r.fulfill(status=status,content_type='application/json',body=json.dumps(d))
 def api(self,r):
  u=r.request.url.split(BASE)[-1];method=r.request.method;record={'url':u,'method':method};self.calls.append(record)
  if u.startswith('/api/wallet'):d=self.wallet()
  elif u=='/api/private-trial':d={'active':False}
  elif u.startswith('/api/payments/promptpay/'):d={'paymentIntentId':'pi_fixture','walletId':'wallet_fixture','jobId':'job_fixture','packageId':'89','amount':89,'status':'canceled','ok':False}
  elif u=='/api/package-codes/redeem':
   assert method=='POST';body=json.loads(r.request.post_data);record['jobId']=body.get('jobId');assert body['jobId']=='job_fixture';assert r.request.headers.get('authorization'),'Code application requires a verified session header'
   code=body['code'].strip().upper()
   if code==INVALID:self.reply(r,{'ok':False,'error':'invalid_code','message':'โค้ดไม่ถูกต้อง'},400);return
   if code==USED:self.reply(r,{'ok':False,'error':'code_used','message':'โค้ดนี้ถูกใช้แล้ว'},409);return
   assert code=='FIXTURE-PACKAGE-'+self.package,'Unexpected fixture code';self.unlocked=True;self.premium=self.package=='159';d={'ok':True,'packageId':self.package,'jobId':'job_fixture','workScope':'work_fixture','reused':False}
   if self.defer_valid:self.pending=(r,d);return
  elif u.endswith('/rights'):d={'checked':True,'unlocked':self.unlocked,'fullEdit':self.unlocked,'premiumHair':self.premium,'paidDownload':self.unlocked}
  elif u.endswith('/suits'):d={'limited':True,'limit':5 if self.premium else 3,'choices':[]};record['limit']=d['limit']
  elif u=='/api/auth/login':
   body=json.loads(r.request.post_data);assert body['email']=='fixture@example.invalid';d={'token':'token_fixture',**self.wallet()}
  elif '/api/auth/'in u:raise AssertionError('Unexpected auth or email request')
  elif u.endswith('/claim'):d={'ok':True}
  elif u.endswith('/unlock'):raise AssertionError('A package code must not spend support or old download credits')
  elif u=='/api/payments/promptpay'and method=='POST':raise AssertionError('Package-code use must never create a charge')
  elif u.startswith('/api/ai-')or u.startswith('/api/hairstyle/'):raise AssertionError('No AI request should run during code redemption/download')
  else:d={'ok':True}
  self.reply(r,d)
 def code_calls(self):return [c for c in self.calls if c['url']=='/api/package-codes/redeem']
 def setup(self):
  p=self.p;p.goto(BASE,wait_until='domcontentloaded');p.evaluate(SEED);p.reload(wait_until='domcontentloaded');p.get_by_role('button',name='เปิดงานเดิมและตรวจสอบการชำระเงิน',exact=True).click();p.locator('.paired-offers').wait_for();p.get_by_role('button',name='ใส่โค้ด',exact=True).filter(visible=True).first.wait_for()
 def open_code(self):
  p=self.p;offer=p.locator('.paired-offers');opener=offer.get_by_role('button',name='ใส่โค้ด',exact=True)if offer.count()and offer.is_visible()else p.get_by_role('button',name='ใส่โค้ด',exact=True).filter(visible=True).first;opener.click();p.get_by_role('dialog',name='ใส่โค้ด',exact=True).wait_for();p.get_by_label('โค้ด',exact=True).wait_for()
  observed=p.get_by_label('โค้ด',exact=True).evaluate("""el=>{const r=el.getBoundingClientRect();return {modal:el.closest('dialog')?.matches(':modal'),portal:el.closest('dialog')?.parentElement===document.body,focused:document.activeElement===el,top:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el,fits:r.x>=0&&r.right<=innerWidth}}""")
  assert observed=={'modal':True,'portal':True,'focused':True,'top':True,'fits':True},observed
  p.screenshot(path=str(OUT/(self.name+'-code-form.png')))
  return observed
 def ensure_mode(self):
  p=self.p;p.get_by_role('button',name='โหมดง่าย',exact=True).wait_for()
  if self.mode=='easy':p.get_by_role('button',name='โหมดง่าย',exact=True).click();p.locator('.easy-mode').wait_for()
 def verify_hair(self):
  p=self.p
  if self.mode=='easy':p.locator('.easy-tabs').get_by_role('button',name='ทรงผม',exact=True).click();button=p.locator('.easy-rail button').filter(has=p.locator('img[src$="/previews/7.webp"]')).first
  else:p.locator('.studio-bottom-choices').get_by_role('button',name='ทรงผม',exact=True).click();button=p.locator('.studio-hair-panel button').filter(has=p.locator('img[src$="/previews/7.webp"]')).first
  button.wait_for();assert bool(button.locator('svg[role="img"]').count())is not self.premium,'Package hair entitlement differs from normal paid package'
 def download(self,label):
  p=self.p;before=len(self.downloads);p.get_by_role('button',name='ดาวน์โหลดรูป',exact=True).filter(visible=True).first.click();p.get_by_role('dialog',name='ขนาดรูป',exact=True).wait_for();assert p.locator('.paired-offers').count()==0;assert len(self.downloads)==before
  p.get_by_role('group',name='เลือกขนาดรูป',exact=True).get_by_role('button',name='2 นิ้ว',exact=False).click()
  if self.width<1100:
   p.locator('.photo-size-apply').click();p.get_by_role('link',name='บันทึกรูป',exact=True).wait_for()
   with p.expect_download()as event:p.get_by_role('link',name='บันทึกรูป',exact=True).click()
   p.get_by_role('button',name='ปิด',exact=True).click()
  else:
   with p.expect_download()as event:p.locator('.photo-size-apply').click()
  path=OUT/(self.name+'-'+label+'.png');event.value.save_as(str(path));p.wait_for_timeout(150);assert len(self.downloads)==before+1
  with Image.open(path)as img:
   assert img.size==(944,1252),img.size;assert img.convert('RGB').crop((35,35,130,130)).getcolors(2)==[(95*95,(203,231,255))],'Downloaded image has a preview watermark'
 def run(self):
  p=self.p;self.setup();observed=self.open_code();code=p.get_by_label('โค้ด',exact=True)
  for value,message in [(INVALID,'โค้ดไม่ถูกต้อง'),(USED,'โค้ดนี้ถูกใช้แล้ว')]:code.fill(value);p.get_by_role('button',name='ใช้โค้ด',exact=True).click();p.get_by_text(message,exact=True).wait_for();assert not self.unlocked;assert len(self.downloads)==0
  code.fill('FIXTURE-PACKAGE-'+self.package)
  if self.defer_valid:
   p.get_by_role('button',name='ใช้โค้ด',exact=True).evaluate('(e)=>{e.click();e.click()}');p.wait_for_timeout(150);assert self.pending is not None;assert len(self.code_calls())==3;p.keyboard.press('Escape');assert p.get_by_role('dialog',name='ใส่โค้ด',exact=True).count()==1;assert len(self.downloads)==0;r,d=self.pending;self.pending=None;self.reply(r,d)
  else:p.get_by_role('button',name='ใช้โค้ด',exact=True).click()
  p.get_by_role('heading',name='ใช้โค้ดสำเร็จ',exact=True).wait_for();assert len(self.downloads)==0,'Code entry must not auto-download an original-size file';p.get_by_role('button',name='กลับไปดาวน์โหลดรูป',exact=True).click();self.ensure_mode();p.wait_for_timeout(100)
  assert p.locator('.easy-watermark'if self.mode=='easy'else'.studio-trial-watermark').count()==0,'Authoritatively redeemed work still displays preview watermark'
  self.verify_hair();self.download('first');self.download('repeat');assert len(self.code_calls())==3;assert any(c['url'].endswith('/suits')and c.get('limit')==(5 if self.premium else 3)for c in self.calls);assert not self.errors,self.errors
  p.screenshot(path=str(OUT/(self.name+'-success.png')))
  recovery=False
  if self.width==1440 and self.package=='89':
   saved=p.evaluate("""async()=>{const d=await(await import('/src/purchase-draft.js')).loadPurchaseDraft();return {unlockSource:d?.unlockSource,hasPlaintext:JSON.stringify(d).includes('FIXTURE-PACKAGE-89'),hasLocalPlaintext:JSON.stringify(Object.entries(localStorage)).includes('FIXTURE-PACKAGE-89')}}""");assert saved=={'unlockSource':'package-code','hasPlaintext':False,'hasLocalPlaintext':False},saved
   count=len(self.code_calls());p.reload(wait_until='domcontentloaded');p.locator('.easy-home-shell').wait_for();p.get_by_role('button',name='เปิดรูปที่ใช้โค้ดล่าสุด',exact=True).wait_for();assert p.locator('.studio-stage>canvas').count()==0;p.get_by_role('button',name='เปิดรูปที่ใช้โค้ดล่าสุด',exact=True).click();p.locator('.studio-stage>canvas').wait_for(state='attached');p.locator('.studio-trial-watermark').wait_for(state='detached');assert p.locator('.paired-offers').count()==0;assert len(self.code_calls())==count;recovery=True;p.screenshot(path=str(OUT/(self.name+'-recovered.png')))
  return {'name':self.name,'passed':True,'packageId':self.package,'mode':self.mode,'explicitReloadRecovery':recovery,'nativeModal':observed,'invalidAndUsedCodesRetryable':True,'successfulCodeApplications':1,'automaticDownloads':0,'actualDownloads':2,'selectedSize':[944,1252],'cleanImageRegion':True,'suitLimit':5 if self.premium else 3,'premiumHair':self.premium,'repeatRedeemCalls':0,'paymentCreates':0,'creditDebits':0,'pageErrors':self.errors}
 def raw_home(self,guest=False):
  p=self.p;p.goto(BASE,wait_until='domcontentloaded')
  if not guest:p.evaluate("localStorage.setItem('idprom_auth_token','token_fixture');localStorage.setItem('idprom_wallet_id','wallet_fixture')");p.reload(wait_until='domcontentloaded')
  p.locator('.easy-home-shell').wait_for();opener=p.get_by_role('button',name='ใส่โค้ด',exact=True).filter(visible=True).first;button=opener.evaluate('e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,scroll:e.scrollWidth,client:e.clientWidth}}');assert button['left']>=0 and button['right']<=self.width and button['scroll']<=button['client']+1,('Code button clipped or overflowing',button);self.open_code();p.get_by_label('โค้ด',exact=True).fill('FIXTURE-PACKAGE-89')
  if guest:
   p.get_by_role('button',name='เข้าสู่ระบบเพื่อใช้โค้ด',exact=True).click();p.locator('#idprom-auth-email').wait_for();p.get_by_label('อีเมล',exact=True).fill('fixture@example.invalid');p.get_by_label('รหัสผ่าน',exact=True).fill('fixture-only-password');p.get_by_role('button',name='เข้าสู่ระบบ',exact=True).click();p.wait_for_function("localStorage.getItem('idprom_auth_token')==='token_fixture'");p.locator('.easy-home-shell').wait_for();p.get_by_role('dialog',name='ใส่โค้ด',exact=True).wait_for();assert p.get_by_label('โค้ด',exact=True).input_value()=='FIXTURE-PACKAGE-89'
  p.get_by_text('กรุณาสร้างรูปให้สำเร็จก่อนใช้โค้ด',exact=True).wait_for();assert p.get_by_role('button',name='ใช้โค้ด',exact=True).is_disabled();assert len(self.code_calls())==0;assert not self.errors,self.errors;p.screenshot(path=str(OUT/(self.name+'-raw.png')))
  return {'name':self.name,'passed':True,'homeRawApplyDisabled':True,'unusedCodePreserved':True,'codeRedeemRequests':0,'guestLoginStaysHome':guest,'noAutomaticRedeemAfterLogin':guest,'pageErrors':self.errors}
with sync_playwright()as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,package,mode in [(1440,'89','studio'),(1440,'159','easy'),(390,'89','easy'),(390,'159','studio')]:
  case=Case(browser,width,package,mode)
  try:r=case.run()
  except Exception as e:case.p.screenshot(path=str(OUT/(case.name+'-error.png')));r={'name':case.name,'passed':False,'error':str(e),'traceback':traceback.format_exc(),'calls':case.calls,'pageErrors':case.errors}
  results.append(r);print(json.dumps(r,ensure_ascii=False),flush=True);case.ctx.close()
 for width,guest in [(1440,False),(390,True)]:
  case=Case(browser,width,'89','guest-home'if guest else'raw-home')
  try:r=case.raw_home(guest)
  except Exception as e:case.p.screenshot(path=str(OUT/(case.name+'-error.png')));r={'name':case.name,'passed':False,'error':str(e),'traceback':traceback.format_exc(),'calls':case.calls,'pageErrors':case.errors}
  results.append(r);print(json.dumps(r,ensure_ascii=False),flush=True);case.ctx.close()
 browser.close()
proof={'passed':sum(r['passed']for r in results),'failed':sum(not r['passed']for r in results),'sourceHashesBefore':START,'sourceHashesAfter':hashes(),'scope':'Actual App native code form, login, authoritative rights refresh and normal selected-size downloads, with no source instrumentation. All APIs mocked and external hosts blocked. Fixture strings only, never reads or consumes real issued codes. No production account, email, AI, Stripe or customer write.','results':results}
(OUT/'results.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2));assert proof['failed']==0;assert START==hashes()
