"""Browser regression for account modal layers. Run against Vite with Python Playwright.
All API requests are fulfilled locally; no real account, payment, or email is used.
ACCOUNT_FLOW_BASE and ACCOUNT_FLOW_OUTPUT select the server and artifact directory.
Optional WEBKIT_EXECUTABLE enables the WebKit matrix alongside Chromium.
"""
import json, os, pathlib, traceback
from playwright.sync_api import sync_playwright
BASE=os.environ.get('ACCOUNT_FLOW_BASE','http://127.0.0.1:5192')
OUT=pathlib.Path(os.environ.get('ACCOUNT_FLOW_OUTPUT','/tmp/account-flow-dialog-browser'))
OUT.mkdir(parents=True,exist_ok=True)
SEED="""async()=>{localStorage.setItem('idprom_wallet_id','wallet_fixture');localStorage.setItem('idprom_auth_token','token_fixture');const c=document.createElement('canvas');c.width=900;c.height=1200;const x=c.getContext('2d');x.fillStyle='#cbe7ff';x.fillRect(0,0,900,1200);x.fillStyle='#b37f61';x.fillRect(300,100,300,500);x.fillStyle='#334466';x.fillRect(100,600,700,600);const png=c.toDataURL(),blob=await(await fetch(png)).blob();const draft={walletId:'wallet_fixture',jobId:'job_fixture',isTrial:true,originalFile:blob,studio:{layers:[{id:'head_fixture',name:'หัว · คอ · ผม',kind:'head',source:png,jobId:'job_fixture',restrictedTrial:true,x:0,y:0,scale:1,rotation:0,opacity:1,visible:true,locked:false}],placement:{W:900,H:1200,uX:0,uY:600,uW:900,uH:600}}};await(await import('/src/purchase-draft.js')).savePurchaseDraft(draft);localStorage.setItem('idprom_pending_qr_v1',JSON.stringify({walletId:'wallet_fixture',jobId:'job_fixture',paymentIntentId:'pi_fixture',packageId:'89',amount:89,status:'canceled'}))}"""
class Case:
 def __init__(self,browser,name,viewport,touch=False):
  self.name=name;self.ctx=browser.new_context(viewport=viewport,has_touch=touch);self.p=self.ctx.new_page();self.p.set_default_timeout(15000);self.calls=[];self.errors=[];self.state={'status':'canceled','package':'89','deferAuth':False};self.deferred=None
  self.p.on('pageerror',lambda e:self.errors.append(str(e)))
  self.p.route('**/api/**',self.api)
  # Test-only access to the retained legacy screen and the hidden legacy 119 flow.
  # Account requests, auth forms, portals, and dialog behavior use production code.
  self.p.route('**/src/main.jsx*',self.instrument)
 def instrument(self,r):
  response=r.fetch();body=response.text();needle='const easyLanding ='
  assert needle in body,'Vite App fixture insertion point changed'
  body=body.replace(needle,'window.__accountFlowFixture={legacy:()=>{setStudioData(null);setScreen("process")},startCheckout};\n'+needle,1)
  r.fulfill(response=response,body=body)
 def wallet(self):return {'walletId':'wallet_fixture','processRemaining':0,'trialRemaining':0,'canSave':True,'unlockedJobIds':[],'editableJobIds':[]}
 def payment(self):return {'paymentIntentId':'pi_fixture','walletId':'wallet_fixture','jobId':'job_fixture','status':self.state['status'],'ok':False,'amount':int(self.state['package']),'packageId':self.state['package'],'expiresAt':1999999999,'qrImage':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='}
 def api(self,r):
  u=r.request.url.split(BASE)[-1];self.calls.append({'url':u,'method':r.request.method})
  if '/api/auth/' in u:
   assert u in ['/api/auth/login','/api/auth/register'],'Email/reset requests must not be sent'
   if self.state['deferAuth']:self.deferred=r;return
   d={'token':'token_renewed_fixture',**self.wallet()}
  elif u.startswith('/api/wallet'):d=self.wallet()
  elif u=='/api/private-trial':d={'active':False}
  elif u=='/api/payments/promptpay' and r.request.method=='POST':self.state.update(status='requires_action',package=json.loads(r.request.post_data)['packageId']);d=self.payment()
  elif u.startswith('/api/payments/promptpay/'):d=self.payment()
  elif u.endswith('/rights'):d={'checked':True,'unlocked':False,'fullEdit':False,'premiumHair':False}
  elif u.endswith('/suits'):d={'limited':False,'choices':[]}
  else:d={'ok':True}
  r.fulfill(content_type='application/json',body=json.dumps(d))
 def top(self):
  p=self.p;p.locator('#idprom-auth-email').wait_for()
  result=p.locator('#idprom-auth-email').evaluate("el=>{const r=el.getBoundingClientRect();return {count:document.querySelectorAll('#idprom-auth-email').length,top:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el,focus:document.activeElement===el,portal:el.closest('dialog')?.parentElement===document.body,modal:el.closest('dialog')?.matches(':modal'),fits:r.x>=0&&r.right<=innerWidth}}")
  assert result=={'count':1,'top':True,'focus':True,'portal':True,'modal':True,'fits':True},result
  return result
 def home(self):
  p=self.p;p.goto(BASE,wait_until='domcontentloaded');p.get_by_role('button',name='เข้าสู่ระบบหรือสมัครสมาชิก',exact=True).click();self.top()
  p.get_by_label('อีเมล',exact=True).fill('fixture@example.invalid');p.get_by_label('รหัสผ่าน',exact=True).fill('fixture-only-password')
  for _ in range(12):
   p.keyboard.press('Tab');assert p.evaluate("document.activeElement===document.body||!!document.activeElement.closest('dialog.idprom-account-flow-dialog:modal')")
  p.get_by_role('button',name='ยังไม่มีบัญชี? สมัครสมาชิก',exact=True).click();assert p.locator('#idprom-auth-email').input_value()=='fixture@example.invalid'
  p.screenshot(path=str(OUT/(self.name+'-home.png')))
  p.get_by_role('button',name='ปิดเข้าสู่ระบบหรือสมัครสมาชิก',exact=True).click();assert p.get_by_role('button',name='เข้าสู่ระบบหรือสมัครสมาชิก',exact=True).evaluate('el=>el===document.activeElement')
  # Native existing dialog stays mounted beneath newly requested auth.
  p.get_by_role('button',name='ช่วยเหลือและติดต่อ',exact=True).click()
  p.locator('[aria-label="เข้าสู่ระบบหรือสมัครสมาชิก"]').evaluate('(el)=>el.click()');self.top();assert p.locator('dialog:modal').count()==2
  p.keyboard.press('Escape');assert p.locator('dialog.idprom-support-dialog:modal').count()==1;assert p.locator('#idprom-auth-email').count()==0
  p.keyboard.press('Escape');p.get_by_role('button',name='เข้าสู่ระบบหรือสมัครสมาชิก',exact=True).click();self.top()
  p.get_by_role('button',name='ลืมรหัสผ่าน?',exact=True).click();reset=p.get_by_role('dialog',name='ลืมรหัสผ่าน',exact=True);reset.wait_for();assert p.locator('dialog:modal').count()==2
  assert reset.evaluate('el=>el.contains(document.activeElement)')
  p.keyboard.press('Escape');assert p.locator('#idprom-auth-email').count()==1;assert p.get_by_role('button',name='ลืมรหัสผ่าน?',exact=True).evaluate('el=>el===document.activeElement')
  p.keyboard.press('Escape');assert p.locator('dialog:modal').count()==0
 def studio_easy_legacy(self):
  p=self.p;p.locator('.easy-studio').click();p.get_by_role('button',name='โหมดง่าย',exact=True).wait_for();p.get_by_role('button',name='เมนู',exact=True).click();p.locator('dialog.idprom-account-dialog:modal').wait_for();p.evaluate("window.__accountFlowFixture.startCheckout('89')");self.top();assert p.locator('dialog:modal').count()==2
  p.screenshot(path=str(OUT/(self.name+'-studio-embedded.png')));p.keyboard.press('Escape');assert p.locator('#idprom-auth-email').count()==0;assert p.locator('dialog.idprom-account-dialog:modal').count()==1;p.keyboard.press('Escape')
  p.get_by_role('button',name='โหมดง่าย',exact=True).click();p.locator('.easy-mode').wait_for();p.get_by_role('button',name='เข้าสู่ระบบหรือสมัครสมาชิก',exact=True).click();self.top();p.keyboard.press('Escape')
  p.evaluate('window.__accountFlowFixture.legacy()');p.locator('.adaptive-editor').wait_for();p.get_by_role('button',name='เข้าสู่ระบบหรือสมัครสมาชิก',exact=True).click();self.top();p.screenshot(path=str(OUT/(self.name+'-legacy.png')));p.keyboard.press('Escape')
 def checkout(self,pkg):
  p=self.p;p.goto(BASE,wait_until='domcontentloaded');p.evaluate(SEED);p.reload(wait_until='domcontentloaded');p.get_by_role('button',name='เปิดงานเดิมและตรวจสอบการชำระเงิน',exact=True).click();p.get_by_role('button',name='เลือกโปร 89 บาท',exact=True).wait_for();p.evaluate("localStorage.removeItem('idprom_auth_token')")
  if pkg=='119':p.evaluate("window.__accountFlowFixture.startCheckout('119')")
  else:p.get_by_role('button',name='เลือกโปร '+pkg+' บาท',exact=True).click()
  self.top();assert p.locator('.checkout-flow-auth').count()==1;assert p.locator('dialog:modal').count()==1
  # Submit a local fixture and verify busy Escape does not dismiss the auth step.
  self.state['deferAuth']=True;p.get_by_label('อีเมล',exact=True).fill('fixture@example.invalid');p.get_by_label('รหัสผ่าน',exact=True).fill('fixture-only-password');p.get_by_role('button',name='สมัครสมาชิกและเปิด QR',exact=True).click()
  p.wait_for_function("document.querySelector('#idprom-auth-email')?.disabled");p.keyboard.press('Escape');assert p.locator('dialog:modal').count()==1;assert p.locator('#idprom-auth-email').count()==1
  p.wait_for_timeout(100);assert self.deferred is not None
  self.deferred.fulfill(content_type='application/json',body=json.dumps({'token':'token_renewed_fixture',**self.wallet()}));self.deferred=None;self.state['deferAuth']=False
  p.locator('.idprom-qr-panel').wait_for();assert p.locator('#idprom-auth-email').count()==0
  p.evaluate("window.__originalQrNode=document.querySelector('.idprom-qr-panel')");p.keyboard.press('Escape');assert p.locator('dialog:modal').count()==0
  assert p.evaluate("document.querySelector('.idprom-qr-panel')===window.__originalQrNode&&!!localStorage.getItem('idprom_pending_qr_v1')")
  before=len([c for c in self.calls if c['url']=='/api/payments/promptpay/pi_fixture']);p.evaluate("window.dispatchEvent(new Event('focus'))");p.wait_for_timeout(300);after=len([c for c in self.calls if c['url']=='/api/payments/promptpay/pi_fixture']);assert after>before
  p.evaluate("window.dispatchEvent(new Event('idprom-buy'))");p.locator('.idprom-qr-panel').wait_for();assert p.evaluate("document.querySelector('.idprom-qr-panel')===window.__originalQrNode")
  self.state['status']='canceled';p.get_by_role('button',name='ตรวจสอบการชำระเงิน',exact=True).click();p.get_by_text('QR หมดอายุแล้ว กรุณาตรวจสอบยอดก่อนสร้างรายการใหม่',exact=True).wait_for()
  before=len(self.calls);p.get_by_role('button',name='ตรวจสอบการชำระเงิน',exact=True).click();p.wait_for_timeout(100);assert len(self.calls)>before
  p.screenshot(path=str(OUT/(self.name+'-checkout-'+pkg+'.png')));assert not self.errors,self.errors
 def finish(self):
  assert not self.errors,self.errors;self.ctx.close()
results=[]
with sync_playwright() as pw:
 engines=[('chromium',pw.chromium,'/usr/bin/chromium')]
 if os.environ.get('WEBKIT_EXECUTABLE'):engines.append(('webkit',pw.webkit,os.environ['WEBKIT_EXECUTABLE']))
 for engine,launcher,executable in engines:
  browser=launcher.launch(executable_path=executable,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'] if engine=='chromium' else [])
  for width,height in [(1440,1000),(820,1180),(390,844)]:
   name=engine+'-'+str(width);case=Case(browser,name,{'width':width,'height':height},width<1100)
   try:
    case.home();case.studio_easy_legacy();case.finish();results.append({'case':name,'passed':True})
   except Exception as e:
    case.p.screenshot(path=str(OUT/(name+'-error.png')));results.append({'case':name,'passed':False,'error':str(e),'traceback':traceback.format_exc(),'pageErrors':case.errors});case.ctx.close()
   print(json.dumps(results[-1],ensure_ascii=False),flush=True)
  for pkg in ['89','119','159']:
   name=engine+'-payment-'+pkg;case=Case(browser,name,{'width':390,'height':844},True)
   try:case.checkout(pkg);case.finish();results.append({'case':name,'passed':True})
   except Exception as e:
    case.p.screenshot(path=str(OUT/(name+'-error.png')));results.append({'case':name,'passed':False,'error':str(e),'traceback':traceback.format_exc(),'pageErrors':case.errors});case.ctx.close()
   print(json.dumps(results[-1],ensure_ascii=False),flush=True)
  browser.close()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
assert all(r['passed'] for r in results), 'Browser account dialog regression failed'
