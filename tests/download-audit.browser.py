"""Actual App image export with background download evidence.

Every API is an inert local fixture. No customer, payment provider, issued code,
AI service, or production database is contacted. Downloaded PNG bytes and user
interface behavior are real; payment/entitlement fixtures are not live charges.
"""
import hashlib,json,os,pathlib,re,time,traceback
from playwright.sync_api import sync_playwright
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE=os.environ.get('DOWNLOAD_AUDIT_BASE','http://127.0.0.1:5202')
OUT=pathlib.Path(os.environ.get('DOWNLOAD_AUDIT_OUTPUT','/tmp/download-audit-browser'));OUT.mkdir(parents=True,exist_ok=True)
SEED=re.search(r'SEED="""(.*?)"""',(ROOT/'tests/premium-download-credits.browser.py').read_text(),re.S).group(1)
SEED=SEED.replace("restrictedTrial:true,x:0", "restrictedTrial:true,portraitMode:'female',femaleEyeStyle:'natural',hairId:'',x:0")
TRACKED=['src/main.jsx','src/studio-editor.jsx','src/image-download.js','src/download-audit.js']
hashes=lambda:{n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest()for n in TRACKED if(ROOT/n).exists()}
START=hashes();results=[]
def clean_background(img,box):
 # WebKit's color pipeline can dither a flat canvas by one RGB value. This
 # tight bound still detects the substantially brighter tiled watermark.
 colors=img.convert('RGB').crop(box).getcolors(30)
 return colors is not None and all(max(abs(a-b)for a,b in zip(color,(203,231,255)))<=1 for _,color in colors)

class Case:
 def __init__(self,browser,width,mode,source='payment',package='89',audit='ok',browser_name='chromium'):
  self.width=width;self.mode=mode;self.source=source;self.package=package;self.audit=audit
  self.name='-'.join(map(str,[browser_name,width,mode,source,package,audit]));self.remaining=2 if source=='support'else 0
  self.unlocked=set();self.calls=[];self.posts=[];self.downloads=[];self.errors=[];self.held=[]
  self.ctx=browser.new_context(viewport={'width':width,'height':1000 if width>1100 else 844},has_touch=width<1100,accept_downloads=True)
  self.p=self.ctx.new_page();self.p.set_default_timeout(20000)
  self.p.on('pageerror',lambda e:self.errors.append(str(e)));self.p.on('download',lambda d:self.downloads.append(d))
  self.p.route('**/*',lambda r:r.continue_()if r.request.url.startswith((BASE+'/','blob:','data:'))else r.abort())
  self.p.route('**/api/**',self.api);self.p.route('**/src/main.jsx*',self.instrument)
 def wallet(self):return {'walletId':'wallet_fixture','processRemaining':0,'trialRemaining':2,'premiumDownloadRemaining':self.remaining,'canSave':False,'unlockedJobIds':list(self.unlocked),'editableJobIds':list(self.unlocked)}
 def reply(self,r,d,status=200):r.fulfill(status=status,content_type='application/json',body=json.dumps(d))
 def api(self,r):
  u=r.request.url.split(BASE)[-1];method=r.request.method;record={'url':u,'method':method};self.calls.append(record)
  if u=='/api/download-events':
   body=json.loads(r.request.post_data or '{}');self.posts.append(body)
   assert r.request.headers.get('authorization')=='Bearer token_fixture','Telemetry must use its own captured account auth'
   assert body.get('expectedWalletId')=='wallet_fixture','Telemetry must fence the wallet'
   assert body.get('jobIds')==['job_fixture'],'Audit must refer to current processed work'
   encoded=json.dumps(body)
   for forbidden in ['token_fixture','data:image','fixture@example','FIXTURE-PACKAGE','password']:
    assert forbidden not in encoded,'Sensitive data included in audit payload'
   if self.audit=='abort':r.abort('internetdisconnected');return
   if self.audit=='stall':self.held.append(r);return
   if self.audit in ['401','429','503']:self.reply(r,{'error':'fixture_audit_unavailable'},int(self.audit));return
   self.reply(r,{'ok':True,'accepted':[e['eventId']for e in body.get('events',[])]});return
  if u.startswith('/api/wallet'):d=self.wallet()
  elif u=='/api/private-trial':d={'active':False}
  elif u.startswith('/api/payments/promptpay/'):d={'paymentIntentId':'pi_fixture','walletId':'wallet_fixture','jobId':'job_fixture','packageId':'89','amount':89,'status':'canceled','ok':False}
  elif u=='/api/package-codes/redeem':
   assert self.source=='code';body=json.loads(r.request.post_data);assert body=={'code':'FIXTURE-PACKAGE-'+self.package,'jobId':'job_fixture'}
   self.unlocked.add('job_fixture');d={'ok':True,'packageId':self.package,'jobId':'job_fixture','workScope':'work_fixture','reused':False}
  elif u.endswith('/unlock'):
   assert self.source=='support','Verified paid/code work must not spend a credit'
   job=u.split('/')[3];assert json.loads(r.request.post_data)['premium']is True
   if job not in self.unlocked:
    assert self.remaining>0;self.remaining-=1;self.unlocked.add(job)
   d={'ok':True,**self.wallet()}
  elif u.endswith('/rights'):
   yes=u.split('/')[3]in self.unlocked;premium=yes and self.package=='159'
   d={'checked':True,'unlocked':yes,'fullEdit':yes,'premiumHair':premium,'paidDownload':yes}
  elif u.endswith('/suits'):
   yes=u.split('/')[3]in self.unlocked;d={'limited':True,'limit':5 if yes and self.package=='159'else 3,'choices':[]};record['limit']=d['limit']
  elif u=='/api/payments/promptpay'and method=='POST':raise AssertionError('Entitled fixture must not create a charge')
  elif '/api/auth/'in u:raise AssertionError('Audit failures must not cause authentication calls')
  elif u.startswith('/api/ai-')or u.startswith('/api/hairstyle/'):raise AssertionError('An export must not send a new AI job')
  else:d={'ok':True}
  self.reply(r,d)
 def instrument(self,r):
  response=r.fetch();body=response.text();needle='const easyLanding =';assert needle in body
  # Access only public App refresh so fixtures can settle a previously paid
  # entitlement. No test replacement of export, rights checks, or delivery.
  r.fulfill(response=response,body=body.replace(needle,'window.__downloadAuditFixture={refresh:refreshWallet};\n'+needle,1))
 def setup(self):
  p=self.p;p.goto(BASE,wait_until='domcontentloaded');p.evaluate(SEED);p.reload(wait_until='domcontentloaded')
  p.get_by_role('button',name='เปิดงานเดิมและตรวจสอบการชำระเงิน',exact=True).click();p.locator('.paired-offers').wait_for()
  if self.source=='code':
   p.locator('.paired-offers').get_by_role('button',name='ใส่โค้ด',exact=True).click();p.get_by_role('dialog',name='ใส่โค้ด',exact=True).wait_for()
   p.get_by_label('โค้ด',exact=True).fill('FIXTURE-PACKAGE-'+self.package);p.get_by_role('button',name='ใช้โค้ด',exact=True).click()
   p.get_by_role('heading',name='ใช้โค้ดสำเร็จ',exact=True).wait_for();p.get_by_role('button',name='กลับไปดาวน์โหลดรูป',exact=True).click()
  else:
   p.keyboard.press('Escape')
   if self.source=='payment':self.unlocked.add('job_fixture');p.evaluate('window.__downloadAuditFixture.refresh()')
  p.get_by_role('button',name='โหมดง่าย',exact=True).wait_for()
  if self.mode=='easy':p.get_by_role('button',name='โหมดง่าย',exact=True).click();p.locator('.easy-mode').wait_for()
  p.locator('.studio-stage>canvas').wait_for(state='attached');p.wait_for_timeout(200)
  assert len(self.downloads)==0,'Opening an entitlement fixture must not automatically export'
 def sent_events(self):return [e for body in self.posts for e in body.get('events',[])]
 def events(self):
  # Failure cases deliberately retain events locally without delivery. Include
  # this bounded outbox only for emission/label assertions, never as evidence
  # that a server received them. Reports separate sent and queued event types.
  queued=self.p.evaluate("JSON.parse(localStorage.getItem('idprom_download_audit_v1')||'[]').map(row=>row.event)")
  return self.sent_events()+queued
 def types(self):return set(e.get('type')for e in self.events())
 def wait_type(self,value,timeout=6000):
  deadline=time.monotonic()+timeout/1000
  while value not in self.types()and time.monotonic()<deadline:self.p.wait_for_timeout(60)
  assert value in self.types(),(value,self.types(),self.posts)
 def prepare_download(self):
  p=self.p;p.get_by_role('button',name='ดาวน์โหลดรูป',exact=True).filter(visible=True).first.click()
  p.get_by_role('dialog',name='ขนาดรูป',exact=True).wait_for();assert p.locator('.paired-offers').count()==0
  p.get_by_role('group',name='เลือกขนาดรูป',exact=True).get_by_role('button',name='2 นิ้ว',exact=False).click()
 def save_and_check(self,label,panel=None):
  p=self.p;before=len(self.downloads)
  if panel is None:panel=self.width<1100
  started=time.monotonic()
  if panel:
   p.locator('.photo-size-apply').click();p.get_by_role('link',name='บันทึกรูป',exact=True).wait_for()
   self.wait_type('save_panel_opened');assert len(self.downloads)==before
   assert 'save_clicked'not in self.types(),'Panel open was mislabeled as a real save click'
   with p.expect_download()as event:p.get_by_role('link',name='บันทึกรูป',exact=True).click()
   p.get_by_role('button',name='ปิด',exact=True).click()
   self.wait_type('save_clicked')
  else:
   with p.expect_download()as event:p.locator('.photo-size-apply').click()
   self.wait_type('download_requested')
  elapsed=time.monotonic()-started
  path=OUT/(self.name+'-'+label+'.png');event.value.save_as(str(path));p.wait_for_timeout(150)
  assert len(self.downloads)==before+1,'A single save action created multiple files'
  with Image.open(path)as img:
   assert img.size==(944,1252),img.size
   assert clean_background(img,(35,35,130,130)),'Downloaded PNG contains preview watermark'
  return elapsed
 def assert_account_and_policy(self):
  p=self.p;assert p.evaluate("localStorage.getItem('idprom_auth_token')")=='token_fixture','Logging failure logged out the user'
  assert p.locator('.paired-offers').count()==0,'Logging failure opened a package offer'
  assert p.locator('#idprom-auth-email').count()==0,'Logging failure opened login'
  assert not [c for c in self.calls if c['url']=='/api/payments/promptpay'and c['method']=='POST']
  assert not self.errors,self.errors
  assert any(c['url'].endswith('/suits')and c.get('limit')==(5 if self.package=='159'else 3)for c in self.calls)
 def run(self,panel=None):
  self.setup();self.prepare_download();self.wait_type('download_clicked');elapsed=self.save_and_check('download',panel)
  self.wait_type('file_prepared');self.assert_account_and_policy()
  unique={e['eventId']:e for e in self.events()};clicks=[e for e in unique.values()if e['type']=='download_clicked']
  assert len(clicks)==1,'Retry or crop confirmation duplicated user download click'
  assert all(body['mode']==self.mode and body['initiator']=='user'for body in self.posts)
  prepared=[e for e in unique.values()if e['type']=='file_prepared'];assert prepared
  assert any(e.get('byteSize',0)>0 and e.get('fileType')=='image/png'for e in prepared)
  debits=len([c for c in self.calls if c['url'].endswith('/unlock')]);assert debits==(1 if self.source=='support'else 0)
  if self.audit=='stall':assert elapsed<6,'Stalled observer must not wait on an audit request before delivering'
  p=self.p;p.screenshot(path=str(OUT/(self.name+'-success.png')))
  return {'name':self.name,'passed':True,'source':self.source,'packageId':self.package,'auditBehavior':self.audit,'actualImageDownloads':len(self.downloads),'selectedSize':[944,1252],'cleanImageRegion':True,'creditDebits':debits,'remainingCredits':self.remaining,'emittedTypes':sorted(self.types()),'sentPostTypes':sorted(set(e['type']for e in self.sent_events())),'uniqueEvents':len(unique),'auditPosts':len(self.posts),'deliverySeconds':round(elapsed,3),'noAccountOrPackageSideEffects':True,'pageErrors':self.errors}
 def share_run(self,cancelled=False):
  self.name+='-share-'+('cancelled'if cancelled else'handoff')
  script="""Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});Object.defineProperty(navigator,'share',{value:input=>{window.__shareCalled={freshGesture:navigator.userActivation?.isActive===true,image:input.files?.[0]?.type};return SHARE_RESULT},configurable:true})"""
  self.ctx.add_init_script(script.replace('SHARE_RESULT',"Promise.reject(new DOMException('Fixture cancel','AbortError'))"if cancelled else'Promise.resolve()'))
  self.setup();self.prepare_download();self.p.locator('.photo-size-apply').click();self.p.get_by_role('button',name='แชร์รูป',exact=True).wait_for()
  self.wait_type('save_panel_opened');assert not {'save_clicked','share_handoff','share_clicked','download_requested'}&self.types()
  self.p.get_by_role('button',name='แชร์รูป',exact=True).click();self.wait_type('share_cancelled'if cancelled else'share_handoff')
  gesture=self.p.evaluate('window.__shareCalled');assert gesture=={'freshGesture':True,'image':'image/png'},gesture
  assert len(self.downloads)==0,'A share action must not create a separate anchor download'
  assert 'save_clicked'not in self.types()and'download_requested'not in self.types()
  if cancelled:assert 'download_failed'not in self.types(),'User cancellation is not a system failure'
  self.p.get_by_role('button',name='ปิด',exact=True).click();self.wait_type('panel_closed');self.assert_account_and_policy()
  return {'name':self.name,'passed':True,'actualImageDownloads':0,'emittedTypes':sorted(self.types()),'freshShareGesture':True,'sharedFileType':'image/png','shareResolvedMeansHandoffOnly':True,'cancelledIsNotFailure':cancelled,'noAccountOrPackageSideEffects':True,'pageErrors':self.errors}
 def cancel_run(self):
  self.name+='-crop-cancel';self.setup();self.prepare_download();self.p.get_by_role('button',name='ปิดเลือกขนาดรูป',exact=True).click();self.wait_type('crop_cancelled')
  assert not {'file_prepared','save_panel_opened','download_requested','save_clicked'}&self.types()
  assert len(self.downloads)==0;self.assert_account_and_policy()
  return {'name':self.name,'passed':True,'actualImageDownloads':0,'emittedTypes':sorted(self.types()),'cropCancelledBeforeFileDelivery':True,'noAccountOrPackageSideEffects':True,'pageErrors':self.errors}
 def automatic_run(self):
  self.name+='-automatic';self.setup();p=self.p;p.evaluate("window.dispatchEvent(new Event('idprom-buy'))");p.locator('.paired-offers').wait_for()
  if self.width<1100:
   p.get_by_role('button',name='ใช้ 1 สิทธิ์โปร 159',exact=True).click();p.get_by_role('link',name='บันทึกรูป',exact=True).wait_for()
   self.wait_type('save_panel_opened');assert len(self.downloads)==0
   with p.expect_download()as event:p.get_by_role('link',name='บันทึกรูป',exact=True).click()
   p.get_by_role('button',name='ปิด',exact=True).click()
  else:
   with p.expect_download()as event:p.get_by_role('button',name='ใช้ 1 สิทธิ์โปร 159',exact=True).click()
  path=OUT/(self.name+'-original.png');event.value.save_as(str(path));self.wait_type('file_prepared')
  with Image.open(path)as img:
   assert img.size==(2256,3072),img.size
   assert clean_background(img,(50,50,130,130)),'Automatic PNG contains a preview watermark'
  assert 'download_clicked'not in self.types(),'Automatic after-unlock export was recorded as a separate download button click'
  assert all(body['initiator']=='automatic_after_unlock'for body in self.posts),self.posts
  assert len(self.downloads)==1 and self.remaining==1
  assert len([c for c in self.calls if c['url'].endswith('/unlock')])==1
  self.assert_account_and_policy()
  return {'name':self.name,'passed':True,'actualImageDownloads':1,'size':[2256,3072],'cleanImageRegion':True,'emittedTypes':sorted(self.types()),'automaticInitiatorSeparate':True,'fakeUserClicks':0,'creditDebits':1,'remainingCredits':1,'pageErrors':self.errors}
 def close(self):
  for route in self.held:
   try:route.abort()
   except:pass
  self.ctx.close()

with sync_playwright()as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 cases=[(1440,'studio','payment','89','ok'),(390,'easy','payment','159','ok'),(1440,'easy','code','159','ok'),(390,'studio','code','89','ok'),(1440,'studio','support','159','503'),(390,'easy','support','159','401'),(1440,'easy','payment','89','stall'),(390,'studio','payment','159','abort')]
 for args in cases:
  case=Case(browser,*args)
  try:r=case.run()
  except Exception as e:
   try:case.p.screenshot(path=str(OUT/(case.name+'-error.png')))
   except:pass
   r={'name':case.name,'passed':False,'error':str(e),'traceback':traceback.format_exc(),'calls':case.calls,'auditPosts':case.posts,'pageErrors':case.errors}
  results.append(r);print(json.dumps(r,ensure_ascii=False),flush=True);case.close()
 for kind in ['share','share_cancel','crop_cancel']:
  case=Case(browser,390,'easy','payment','159','ok')
  try:r=case.cancel_run()if kind=='crop_cancel'else case.share_run(kind=='share_cancel')
  except Exception as e:r={'name':case.name,'passed':False,'error':str(e),'traceback':traceback.format_exc(),'calls':case.calls,'auditPosts':case.posts,'pageErrors':case.errors}
  results.append(r);print(json.dumps(r,ensure_ascii=False),flush=True);case.close()
 for width in [1440,390]:
  case=Case(browser,width,'studio','support','159','ok')
  try:r=case.automatic_run()
  except Exception as e:r={'name':case.name,'passed':False,'error':str(e),'traceback':traceback.format_exc(),'calls':case.calls,'auditPosts':case.posts,'pageErrors':case.errors}
  results.append(r);print(json.dumps(r,ensure_ascii=False),flush=True);case.close()
 browser.close()
 # Safari always uses its explicit save panel, including desktop Safari. A local
 # WebKit installation is optional; never fetch a browser during a test run.
 webkit=os.environ.get('DOWNLOAD_AUDIT_WEBKIT')
 if webkit:
  browser=pw.webkit.launch(executable_path=webkit,headless=True)
  case=Case(browser,390,'easy','payment','159','ok','webkit')
  try:r=case.run(panel=True)
  except Exception as e:r={'name':case.name,'passed':False,'error':str(e),'traceback':traceback.format_exc(),'calls':case.calls,'auditPosts':case.posts,'pageErrors':case.errors}
  results.append(r);print(json.dumps(r,ensure_ascii=False),flush=True);case.close();browser.close()
proof={'passed':sum(r['passed']for r in results),'failed':sum(not r['passed']for r in results),'sourceHashesBefore':START,'sourceHashesAfter':hashes(),'scope':'Actual App export handlers, crop UI, PNG creation and browser delivery. Existing payment entitlement and support-credit APIs, and real code entry UI, use inert local HTTP fixtures. Telemetry API success/401/503/stall/network errors are simulated independently. No real payment, customer account, production data or issued code is used. Client evidence is not proof of a file saved on a physical device.','results':results}
(OUT/'results.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2));assert proof['failed']==0;assert START==hashes(),'Source changed during tests; rerun against stable integration'
