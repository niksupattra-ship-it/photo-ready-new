"""Direct credit redemption from the actual Download button, without an offer.
All APIs are local fixtures. A test-only App hook switches owned work IDs;
production rights, redemption, crop and delivery handlers remain unchanged.
No customer account, AI provider, real charge or email is contacted.
"""
import hashlib,json,os,pathlib,re,traceback
from playwright.sync_api import sync_playwright
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE=os.environ.get('DIRECT_CREDIT_BASE','http://127.0.0.1:5199')
OUT=pathlib.Path(os.environ.get('DIRECT_CREDIT_OUTPUT','/tmp/direct-credit-browser'));OUT.mkdir(parents=True,exist_ok=True)
SEED=re.search(r'SEED="""(.*?)"""',(ROOT/'tests/premium-download-credits.browser.py').read_text(),re.S).group(1)
SEED=SEED.replace("restrictedTrial:true,x:0", "restrictedTrial:true,portraitMode:'female',femaleEyeStyle:'natural',hairId:'',x:0")
TRACKED=['src/main.jsx','src/studio-editor.jsx'];hashes=lambda:{n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest()for n in TRACKED}
START=hashes();results=[]
class Case:
 def __init__(self,browser,width,mode):
  self.width=width;self.mode=mode;self.name=str(width)+'-'+mode;self.remaining=2;self.unlocked=set();self.calls=[];self.downloads=[];self.errors=[]
  self.ctx=browser.new_context(viewport={'width':width,'height':1000 if width>1100 else 844},has_touch=width<1100,accept_downloads=True)
  self.p=self.ctx.new_page();self.p.set_default_timeout(15000);self.p.on('pageerror',lambda e:self.errors.append(str(e)));self.p.on('download',lambda d:self.downloads.append(d))
  self.p.route('**/*',lambda r:r.continue_()if r.request.url.startswith((BASE+'/','blob:','data:'))else r.abort())
  self.p.route('**/api/**',self.api);self.p.route('**/src/main.jsx*',self.instrument)
 def wallet(self):return {'walletId':'wallet_fixture','processRemaining':0,'trialRemaining':2,'premiumDownloadRemaining':self.remaining,'canSave':False,'unlockedJobIds':list(self.unlocked),'editableJobIds':list(self.unlocked)}
 def api(self,r):
  u=r.request.url.split(BASE)[-1];method=r.request.method;record={'url':u,'method':method};self.calls.append(record);status=200
  if u.startswith('/api/wallet'):d=self.wallet()
  elif u=='/api/private-trial':d={'active':False}
  elif u.startswith('/api/payments/promptpay/'):d={'paymentIntentId':'pi_fixture','walletId':'wallet_fixture','jobId':'job_fixture','packageId':'89','amount':89,'status':'canceled','ok':False}
  elif u.endswith('/unlock'):
   job=u.split('/')[3];assert json.loads(r.request.post_data)['premium']is True,'Support credit must preserve pro159 conditions'
   if job not in self.unlocked:
    if self.remaining<1:status=402
    else:self.remaining-=1;self.unlocked.add(job)
   record['remaining']=self.remaining;d={'ok':status==200,**self.wallet()}
  elif u.endswith('/rights'):
   yes=u.split('/')[3]in self.unlocked;d={'checked':True,'unlocked':yes,'fullEdit':yes,'premiumHair':yes,'paidDownload':yes}
  elif u.endswith('/suits'):
   yes=u.split('/')[3]in self.unlocked;d={'limited':True,'limit':5 if yes else 3,'choices':[]};record['limit']=d['limit']
  elif u=='/api/payments/promptpay'and method=='POST':raise AssertionError('Existing credits must never create a payment')
  elif '/api/auth/'in u:raise AssertionError('Fixture must not send credentials or email')
  elif u.startswith('/api/ai-')or u.startswith('/api/hairstyle/'):raise AssertionError('No AI or processing request should run during download')
  else:d={'ok':True}
  r.fulfill(status=status,content_type='application/json',body=json.dumps(d))
 def instrument(self,r):
  response=r.fetch();body=response.text();needle='const easyLanding =';assert needle in body
  fixture="""window.__directCreditFixture={setJob:id=>{currentOutputJobRef.current=id;currentOutputTrialRef.current=true;setOutputJobId(id);savedWorkOpenRequestRef.current++;setStudioData(prev=>prev?.map(layer=>layer.kind==='head'?{...layer,jobId:id,restrictedTrial:true,outputUnlocked:false,fullEditUnlocked:false}:layer));setSavedWorkRevision(v=>v+1);setSavedWorkUnlocked(false);setTrialPreview(true);setDownloadUnlockSignal(null)},refresh:refreshWallet};\n"""
  r.fulfill(response=response,body=body.replace(needle,fixture+needle,1))
 def setup(self):
  p=self.p;p.goto(BASE,wait_until='domcontentloaded');p.evaluate(SEED);p.reload(wait_until='domcontentloaded');p.get_by_role('button',name='เปิดงานเดิมและตรวจสอบการชำระเงิน',exact=True).click();p.locator('.paired-offers').wait_for();p.keyboard.press('Escape');self.ensure_mode();assert self.remaining==2
 def ensure_mode(self):
  p=self.p;p.get_by_role('button',name='โหมดง่าย',exact=True).wait_for()
  if self.mode=='easy':p.get_by_role('button',name='โหมดง่าย',exact=True).click();p.locator('.easy-mode').wait_for()
  p.locator('.studio-stage>canvas').wait_for(state='attached');p.wait_for_timeout(100)
 def switch_job(self,id):
  self.p.evaluate('(id)=>window.__directCreditFixture.setJob(id)',id);self.ensure_mode()
 def normal_download(self,name):
  p=self.p;before=len(self.downloads);unlock_before=len([c for c in self.calls if c['url'].endswith('/unlock')]);p.get_by_role('button',name='ดาวน์โหลดรูป',exact=True).filter(visible=True).first.click();p.get_by_role('dialog',name='ขนาดรูป',exact=True).wait_for()
  assert p.locator('.paired-offers').count()==0,'Available credits incorrectly opened package offer'
  assert len(self.downloads)==before,'An unwanted original-size auto download happened before the size choice'
  p.get_by_role('group',name='เลือกขนาดรูป',exact=True).get_by_role('button',name='2 นิ้ว',exact=False).click();p.wait_for_timeout(150)
  if self.width<1100:
   p.locator('.photo-size-apply').click();p.get_by_role('link',name='บันทึกรูป',exact=True).wait_for();assert len(self.downloads)==before
   with p.expect_download()as event:p.get_by_role('link',name='บันทึกรูป',exact=True).click()
   p.get_by_role('button',name='ปิด',exact=True).click()
  else:
   with p.expect_download()as event:p.locator('.photo-size-apply').click()
  path=OUT/(self.name+'-'+name+'.png');event.value.save_as(str(path));p.wait_for_timeout(200);assert len(self.downloads)==before+1,'One user download produced multiple files'
  with Image.open(path)as img:
   assert img.size==(944,1252),('Selected size was replaced by original',img.size)
   colors=img.convert('RGB').crop((35,35,130,130)).getcolors(2);assert colors==[(95*95,(203,231,255))],('Unexpected watermark in a solid image region',colors)
  assert p.locator('.paired-offers').count()==0
  return len([c for c in self.calls if c['url'].endswith('/unlock')])-unlock_before
 def premium_visible(self):
  p=self.p
  if self.mode=='easy':
   p.locator('.easy-tabs').get_by_role('button',name='ทรงผม',exact=True).click();button=p.locator('.easy-rail button').filter(has=p.locator('img[src$="/previews/7.webp"]')).first
  else:
   p.locator('.studio-bottom-choices').get_by_role('button',name='ทรงผม',exact=True).click();button=p.locator('.studio-hair-panel button').filter(has=p.locator('img[src$="/previews/7.webp"]')).first
  button.wait_for();assert button.locator('svg[role="img"]').count()==0,'Redeemed pro159 work lost premium hair at zero'
 def run(self):
  p=self.p;self.setup();assert self.normal_download('first')==1;assert self.remaining==1
  assert self.normal_download('repeat')==0;assert self.remaining==1
  self.switch_job('job_second');assert self.normal_download('second')==1;assert self.remaining==0;self.premium_visible()
  assert any(c['url']=='/api/images/job_second/suits'and c.get('limit')==5 for c in self.calls),'Redeemed work did not retain five suit policy'
  self.switch_job('job_third');p.get_by_role('button',name='ดาวน์โหลดรูป',exact=True).filter(visible=True).first.click();p.locator('.paired-offers').wait_for();assert p.locator('.photo-size-dialog').count()==0;assert len(self.downloads)==3;assert self.remaining==0
  assert 'job_third'not in self.unlocked;assert len([c for c in self.calls if c['url'].endswith('/unlock')])==2
  assert not self.errors,self.errors
  p.screenshot(path=str(OUT/(self.name+'-exhausted.png')))
  return {'name':self.name,'passed':True,'balance':[2,1,1,0],'normalDownloadNoPackageAtPositiveBalance':True,'selectedPngSize':[944,1252],'actualDownloads':3,'unwantedOriginalDownloads':0,'cleanImageRegionVerified':True,'repeatDebit':0,'unlockRequests':2,'premiumHairRetainedAtZero':True,'fiveSuitsRetained':True,'thirdWorkRequiresPackage':True,'paymentCreates':0,'pageErrors':self.errors}
with sync_playwright()as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [1440,390]:
  for mode in ['studio','easy']:
   case=Case(browser,width,mode)
   try:r=case.run()
   except Exception as e:case.p.screenshot(path=str(OUT/(case.name+'-error.png')));r={'name':case.name,'passed':False,'error':str(e),'traceback':traceback.format_exc(),'calls':case.calls,'pageErrors':case.errors}
   results.append(r);print(json.dumps(r,ensure_ascii=False),flush=True);case.ctx.close()
 browser.close()
proof={'passed':sum(r['passed']for r in results),'failed':sum(not r['passed']for r in results),'sourceHashesBefore':START,'sourceHashesAfter':hashes(),'scope':'Actual App direct Download, credit redemption, rights/crop and file delivery. All HTTP APIs mocked and external requests blocked. Test-only App hook switches owned work IDs; no test bypass of download/credit authorization, no AI/customer/payment writes.','results':results}
(OUT/'results.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2));assert proof['failed']==0;assert START==hashes()
