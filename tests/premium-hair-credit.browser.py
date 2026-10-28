"""Premium-support hair availability through the actual App and Studio/Easy UI.
All HTTP APIs are local fixtures; the two expensive AI callbacks stop at a
recorded fixture boundary, so no AI/provider, payment, customer, or email is used.
"""
import base64, hashlib, json, os, pathlib, re, traceback
from playwright.sync_api import sync_playwright
BASE=os.environ.get('PREMIUM_HAIR_BASE','http://127.0.0.1:5196')
OUT=pathlib.Path(os.environ.get('PREMIUM_HAIR_OUTPUT','/tmp/premium-hair-browser'));OUT.mkdir(parents=True,exist_ok=True)
ROOT=pathlib.Path(__file__).resolve().parent.parent
SEED=re.search(r'SEED="""(.*?)"""',(ROOT/'tests/premium-download-credits.browser.py').read_text(),re.S).group(1)
SEED=SEED.replace("restrictedTrial:true,x:0", "restrictedTrial:true,portraitMode:'female',femaleEyeStyle:'natural',hairId:'',x:0")
TRACKED=['src/main.jsx','src/studio-editor.jsx','account-feature-policy.js','server.js']
hashes=lambda:{n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest()for n in TRACKED}
START=hashes();results=[]
class Case:
 def __init__(self,browser,width,mode):
  self.width=width;self.mode=mode;self.name=str(width)+'-'+mode;self.remaining=2;self.premium=False;self.guest=False;self.calls=[];self.errors=[]
  self.ctx=browser.new_context(viewport={'width':width,'height':1000 if width>1100 else 844},has_touch=width<1100)
  self.p=self.ctx.new_page();self.p.set_default_timeout(12000);self.p.on('pageerror',lambda e:self.errors.append(str(e)))
  self.p.route('**/*',lambda r:r.continue_()if r.request.url.startswith((BASE+'/','blob:','data:'))else r.abort())
  self.p.route('**/api/**',self.api);self.p.route('**/src/main.jsx*',self.main);self.p.route('**/src/studio-editor.jsx*',self.studio)
 def api(self,r):
  u=r.request.url.split(BASE)[-1];self.calls.append({'url':u,'method':r.request.method})
  if u.startswith('/api/wallet'):d={'walletId':r.request.headers.get('x-wallet-id','wallet_fixture'),'processRemaining':0,'trialRemaining':2,'premiumDownloadRemaining':0 if self.guest else self.remaining,'canSave':False,'unlockedJobIds':['job_fixture']if self.premium and not self.guest else [],'editableJobIds':['job_fixture']if self.premium and not self.guest else []}
  elif u=='/api/private-trial':d={'active':False}
  elif u.endswith('/rights'):d={'checked':True,'unlocked':self.premium and not self.guest,'fullEdit':self.premium and not self.guest,'paidDownload':self.premium and not self.guest,'premiumHair':self.premium and not self.guest}
  elif u.endswith('/suits'):d={'limited':True,'limit':5 if self.premium else 3,'choices':[]}
  elif u.startswith('/api/payments/promptpay/'):d={'paymentIntentId':'pi_fixture','walletId':'wallet_fixture','jobId':'job_fixture','packageId':'89','amount':89,'status':'canceled','ok':False}
  elif u.endswith('/unlock')or(u=='/api/payments/promptpay'and r.request.method=='POST'):raise AssertionError('Selecting hair must never redeem download credit or create a payment')
  elif '/api/auth/'in u:raise AssertionError('Fixture must not submit credentials or email')
  else:d={'ok':True}
  r.fulfill(content_type='application/json',body=json.dumps(d))
 def main(self,r):
  response=r.fetch();s=response.text();needle='const easyLanding =';assert needle in s
  fixture="""window.__hairApp={refresh:refreshWallet,creditAvailable:premiumHairCreditAvailable};window.__hairAiCalls ||= [];const hairFixtureChange=async(...args)=>{window.__hairAiCalls.push({kind:'change',args});throw Error('FIXTURE_AI_BOUNDARY')};const hairFixtureProcess=async(...args)=>{window.__hairAiCalls.push({kind:'process',args:[args[2],args[3]]});throw Error('FIXTURE_AI_BOUNDARY')};\n"""
  s=s.replace(needle,fixture+needle,1)
  assert 'onChangeHair: changeStudioHair' in s;assert 'onProcessPhoto: processStudioPhoto' in s
  s=s.replace('onChangeHair: changeStudioHair','onChangeHair: hairFixtureChange').replace('onProcessPhoto: processStudioPhoto','onProcessPhoto: hairFixtureProcess')
  r.fulfill(response=response,body=s)
 def studio(self,r):
  response=r.fetch();s=response.text();needle='const easyUi =';assert needle in s
  fixture="""window.__hairStudio={allowed:premiumHairAllowed,clear:()=>{setAppearanceError(null);setPortraitProcessError(null)},raw:()=>{const h=state.current.find(l=>l.kind==='head');const l={...h,id:'raw_fixture',name:'รูปต้นฉบับ',kind:'source-photo',jobId:undefined};sourceLayerRef.current=l.id;setLayers([l]);setProcessHairPending(true);setPortraitMode('female');setHairGender('female');setEasyPhotoTypeSelected(true);if(sourcePhoto)sourcePhoto.idpromFemaleEyeStyle='natural';setSelectedHair('');setPortraitProcessError(null);setAppearanceError(null)}};\n"""
  s=s.replace(needle,fixture+needle,1);r.fulfill(response=response,body=s)
 def setup(self):
  p=self.p;p.goto(BASE,wait_until='domcontentloaded');p.evaluate(SEED);p.reload(wait_until='domcontentloaded');p.get_by_role('button',name='เปิดงานเดิมและตรวจสอบการชำระเงิน',exact=True).click();p.locator('.paired-offers').wait_for();p.keyboard.press('Escape');p.get_by_role('button',name='โหมดง่าย',exact=True).wait_for();p.wait_for_function('window.__hairStudio?.allowed===true&&window.__hairApp?.creditAvailable===true')
  if self.mode=='easy':p.get_by_role('button',name='โหมดง่าย',exact=True).click();p.locator('.easy-mode').wait_for()
 def hair(self):
  p=self.p
  if self.mode=='easy':
   button=p.locator('.easy-rail button').filter(has=p.locator('img[src$="/previews/7.webp"]')).first
   if not button.is_visible():p.locator('.easy-tabs').get_by_role('button',name='ทรงผม',exact=True).click()
   return button
  button=p.locator('.studio-hair-panel button').filter(has=p.locator('img[src$="/previews/7.webp"]')).first
  if not button.is_visible():p.locator('.studio-bottom-choices').get_by_role('button',name='ทรงผม',exact=True).click()
  return button
 def refresh(self):self.p.evaluate('window.__hairApp.refresh()')
 def count(self):return self.p.evaluate('window.__hairAiCalls.length')
 def attempt(self,expect_allowed=True,raw=False):
  p=self.p;n=self.count();button=self.hair();button.wait_for()
  badge=button.locator('svg[role="img"]');assert bool(badge.count())is(not expect_allowed),(self.name,expect_allowed,button.inner_html())
  button.click()
  if raw and self.mode=='easy'and expect_allowed:
   # The actual easy wizard keeps the chosen style while going to the final step.
   for i in range(3):
    nxt=p.get_by_role('button',name='ถัดไป',exact=True)
    if nxt.count()and nxt.is_visible():nxt.click()
   p.get_by_role('button',name='ประมวลผลรูป',exact=True).click()
  if expect_allowed:
   p.wait_for_function('(n)=>window.__hairAiCalls.length===n+1',arg=n);assert p.locator('.paired-offers').count()==0
   p.wait_for_timeout(120);p.evaluate('window.__hairStudio.clear()');assert self.remaining>=0
  else:p.locator('.paired-offers').wait_for();assert self.count()==n;p.keyboard.press('Escape')
 def run(self):
  p=self.p;self.setup();self.attempt();assert self.count()==1
  assert p.locator('.easy-watermark'if self.mode=='easy'else'.studio-trial-watermark').count()==1,'unused credit cannot remove watermark'
  self.remaining=1;self.refresh();p.wait_for_function('window.__hairApp.creditAvailable===true');self.attempt();assert self.count()==2
  self.remaining=0;self.refresh();p.wait_for_function('window.__hairApp.creditAvailable===false&&window.__hairStudio.allowed===false');self.attempt(False)
  self.premium=True;self.refresh();p.wait_for_function('window.__hairStudio.allowed===true');self.attempt();assert self.count()==3
  # Previously-unlocked work keeps hair at zero, but a new raw source does not.
  p.evaluate('window.__hairStudio.raw()');p.wait_for_function('window.__hairStudio.allowed===false');self.attempt(False,raw=True)
  self.remaining=2;self.premium=False;self.refresh();p.wait_for_function('window.__hairStudio.allowed===true');self.attempt(True,raw=True);assert self.count()==4
  p.screenshot(path=str(OUT/(self.name+'-hair-available.png')))
  # Actual account-menu signout must immediately remove residual account balance.
  self.guest=True
  if self.mode=='studio':p.get_by_role('button',name='โหมดง่าย',exact=True).click()
  collapse=p.get_by_role('button',name='ย่อรายการเลือก',exact=True)
  if collapse.count()and collapse.is_visible():collapse.click()
  p.get_by_role('button',name='บัญชีสมาชิก',exact=True).filter(visible=True).first.click();p.get_by_role('button',name='ลงชื่อออก',exact=True).click();p.wait_for_function('window.__hairApp.creditAvailable===false&&window.__hairStudio.allowed===false')
  if self.mode=='studio':p.locator('.easy-studio').click()
  self.attempt(False,raw=True)
  assert not self.errors,self.errors
  assert not [c for c in self.calls if c['url'].endswith('/unlock')or(c['url']=='/api/payments/promptpay'and c['method']=='POST')]
  return {'name':self.name,'passed':True,'remaining':[2,1,0],'existingPremiumWorkRetained':True,'newRawDeniedAtZero':True,'firstPremiumProcessingAtTwo':True,'actualLogoutClearsHair':True,'aiCallbackBoundaries':self.count(),'unlockRequests':0,'paymentCreates':0,'watermarkPreservedBeforeRedemption':True}
with sync_playwright()as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [1440,390]:
  for mode in ['studio','easy']:
   case=Case(browser,width,mode)
   try:result=case.run()
   except Exception as e:
    case.p.screenshot(path=str(OUT/(case.name+'-error.png')));result={'name':case.name,'passed':False,'error':str(e),'traceback':traceback.format_exc(),'pageErrors':case.errors,'calls':case.calls}
   results.append(result);print(json.dumps(result,ensure_ascii=False),flush=True);case.ctx.close()
 browser.close()
proof={'passed':sum(r['passed']for r in results),'failed':sum(not r['passed']for r in results),'sourceHashesBefore':START,'sourceHashesAfter':hashes(),'scope':'Actual App and Studio/Easy handlers. All APIs mocked; expensive AI callbacks record boundary then reject. No actual provider render, production balance, payment or customer mutation verified.','results':results}
(OUT/'results.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2));assert proof['failed']==0
