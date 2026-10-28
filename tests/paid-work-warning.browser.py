"""Full-App paid-work warnings: local-only API fixtures and actual browser UI.
Run Vite on PAID_WARNING_BASE (default localhost:5195); optionally set WEBKIT_EXECUTABLE.
No customer authentication, provider call, email, charge, or production write occurs.
"""
import hashlib, json, os, pathlib, re, traceback
from playwright.sync_api import sync_playwright
BASE=os.environ.get('PAID_WARNING_BASE','http://127.0.0.1:5195')
OUT=pathlib.Path(os.environ.get('PAID_WARNING_OUTPUT','/tmp/paid-work-warning-browser'));OUT.mkdir(parents=True,exist_ok=True)
SEED=re.search(r'SEED="""(.*?)"""',(pathlib.Path(__file__).with_name('account-flow-dialog.browser.py')).read_text(),re.S).group(1)
SEED=SEED.replace('const png=c.toDataURL(),blob=', 'const png=c.toDataURL();window.__warningFixturePng=png;const blob=')
ROOT=pathlib.Path(__file__).resolve().parent.parent
TRACKED=['src/main.jsx','src/studio-editor.jsx','src/paid-work-guard.js','src/paid-work-warning.jsx','src/paid-work-warning.css']
source_hashes=lambda:{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest()for name in TRACKED}
FROZEN=source_hashes();(OUT/'source-hashes.json').write_text(json.dumps(FROZEN,indent=2))
if os.environ.get('PAID_WARNING_EXPECTED_STUDIO_SHA256'):assert FROZEN['src/studio-editor.jsx']==os.environ['PAID_WARNING_EXPECTED_STUDIO_SHA256'],'Studio source differs from expected frozen revision'
results=[]
class Case:
 def __init__(self,browser,name,width,height,paid=True,credits=0,owner=False,private=False,can_save=False,pkg='159'):
  self.missing_current=False;self.missing_reads=0;self.downloads=[];self.hold_next_right=False;self.held_right=None;self.rights_online=True;self.name=name;self.width=width;self.paid=paid;self.credits=credits;self.owner=owner;self.private=private;self.can_save=can_save;self.pkg=pkg;self.calls=[];self.errors=[];self.choosers=[]
  self.ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1100,accept_downloads=True);self.p=self.ctx.new_page();self.p.set_default_timeout(12000)
  self.p.on('download',lambda download:self.downloads.append(download));self.p.on('pageerror',lambda e:self.errors.append(str(e)));self.p.on('filechooser',lambda chooser:self.choosers.append(chooser));self.p.route('**/*',lambda route:route.continue_()if route.request.url.startswith((BASE+'/','blob:','data:'))else route.abort());self.p.route('**/api/**',self.api);self.p.route('**/src/main.jsx*',self.main_fixture);self.p.route('**/src/studio-editor.jsx*',self.studio_fixture);self.p.route('**/src/photo-input.js*',self.photo_fixture)
 def wallet(self):
  return {'walletId':'wallet_fixture','processRemaining':self.credits,'trialRemaining':2,'canSave':self.can_save,'hasPurchased':True,'ownerAccess':self.owner,'unlimitedDownloads':self.owner,'allFeatures':self.owner,'unlockedJobIds':['job_fixture'] if self.paid else ['older_paid_job'],'editableJobIds':['job_fixture'] if self.paid else []}
 def api(self,r):
  u=r.request.url.split(BASE)[-1];method=r.request.method;self.calls.append({'url':u,'method':method})
  if u.startswith('/api/wallet'):d=self.wallet()
  elif u=='/api/private-trial':d={'active':self.private}
  elif u.endswith('/rights'):
   if self.missing_current:self.missing_reads+=1;r.fulfill(status=404,content_type='application/json',body=json.dumps({'error':'output_not_found'}));return
   if self.hold_next_right:self.hold_next_right=False;self.held_right=r;return
   if not self.rights_online:r.fulfill(status=503,content_type='application/json',body=json.dumps({'error':'fixture_offline'}));return
   current=u.split('/')[3]=='job_fixture';paid=self.paid and current;yes=paid or self.owner or self.private
   d={'unlocked':yes,'paidDownload':paid,'fullEdit':yes,'premiumHair':yes and self.pkg=='159'}
  elif u.endswith('/suits'):d={'limited':True,'limit':5 if self.pkg=='159' else 3,'choices':[]}
  elif u.startswith('/api/payments/promptpay/'):
   d={'paymentIntentId':'pi_fixture','walletId':'wallet_fixture','jobId':'job_fixture','packageId':self.pkg,'amount':int(self.pkg),'status':'canceled','ok':False}
  elif u=='/api/payments/promptpay' and method=='POST':raise AssertionError('Warning flow must never create a payment')
  elif '/api/auth/' in u:raise AssertionError('Warning flow must never submit credentials or email')
  elif u.startswith('/api/saved-work'):
   d={'id':'saved_fixture','createdAt':'2026-10-28T00:00:00Z','expiresAt':'2026-12-12T00:00:00Z','ok':True}
  else:d={'ok':True}
  r.fulfill(content_type='application/json',body=json.dumps(d))
 def main_fixture(self,r):
  response=r.fetch();body=response.text();needle='const easyLanding =';assert needle in body,'App insertion point changed'
  inject='''window.__paidWarningFixture={refresh:refreshWallet,downloadMissing:async()=>{editCache.current={master:{fixture:true},lock:{W:900,H:1200}};await downloadCurrentFinal()},legacy:()=>{setStudioData(null);setScreen("process");const c=document.createElement("canvas");c.width=900;c.height=1200;const x=c.getContext("2d");x.fillStyle="#cbe7ff";x.fillRect(0,0,900,1200);const png=c.toDataURL();window.__warningFixturePng=png;setA(png);setB(png);currentOutputJobRef.current="job_fixture";setOutputJobId("job_fixture");setF(new File(["fixture"],"fixture.png",{type:"image/png"}))}};\n'''
  body=body.replace(needle,inject+needle,1);r.fulfill(response=response,body=body)
 def studio_fixture(self,r):
  response=r.fetch();body=response.text();needle='const easyUi =';assert needle in body,'Studio insertion point changed'
  body=body.replace(needle,'window.__paidStudioFixture={heads:()=>outputHeads(state.current).map(layer=>layer.jobId),setJob:id=>setLayers(previous=>previous.map(layer=>layer.kind==="head"?{...layer,jobId:id}:layer))};\n'+needle,1);r.fulfill(response=response,body=body)
 def photo_fixture(self,r):
  response=r.fetch();body=response.text()
  pattern=r'(function preparePhotoInput\(file\)\s*\{)'
  assert re.search(pattern,body),'Photo preparation fixture point changed'
  pause="if(window.__warningPausePrepare&&file?.name==='replacement-fixture.png'){window.__warningPrepareEntered=true;return new Promise(resolve=>{window.__warningReleasePrepare=()=>{window.__warningPausePrepare=false;resolve(preparePhotoInput(file))}})}"
  body=re.sub(pattern,lambda match:match.group(1)+pause,body,count=1);r.fulfill(response=response,body=body)
 def setup(self):
  p=self.p;p.goto(BASE,wait_until='domcontentloaded');p.evaluate(SEED);p.reload(wait_until='domcontentloaded');p.get_by_role('button',name='เปิดงานเดิมและตรวจสอบการชำระเงิน',exact=True).click();p.locator('.paired-offers').wait_for();p.keyboard.press('Escape');p.get_by_role('button',name='โหมดง่าย',exact=True).wait_for();p.wait_for_function('!!window.__paidStudioFixture')
  # The actual current-job request is authoritative; wait until its effect ran.
  p.wait_for_timeout(250)
 def unload(self):return self.p.evaluate("(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented})()")
 def warning(self,title):
  dialog=self.p.get_by_role('dialog',name=title,exact=True);dialog.wait_for();assert dialog.evaluate("el=>el.matches(':modal')&&el.parentElement===document.body")
  assert dialog.locator('.paid-work-warning-loss,.paid-work-warning-exit-copy').count()==1
  assert 'ขอเงินคืน' in dialog.inner_text();return dialog
 def upload(self):
  return self.p.get_by_role('button',name='เปลี่ยนรูปต้นฉบับ' if self.width>1100 else 'เปลี่ยนรูป',exact=True)
 def easy(self):self.p.get_by_role('button',name='โหมดง่าย',exact=True).click();self.p.locator('.easy-mode').wait_for();assert self.p.locator('.paid-work-warning').count()==0
 def studio(self):self.p.locator('.easy-studio').click();self.p.get_by_role('button',name='โหมดง่าย',exact=True).wait_for();assert self.p.locator('.paid-work-warning').count()==0
 def file(self):
  # Actual valid PNG file, generated in the local browser without an asset dependency.
  import base64
  png=self.p.evaluate("(()=>{const c=document.createElement('canvas');c.width=120;c.height=160;const x=c.getContext('2d');x.fillStyle='#11aa66';x.fillRect(0,0,120,160);return c.toDataURL().split(',')[1]})()")
  return {'name':'replacement-fixture.png','mimeType':'image/png','buffer':base64.b64decode(png)}
 def screenshot(self,suffix):self.p.screenshot(path=str(OUT/(self.name+'-'+suffix+'.png')))
 def finish(self):
  assert not self.errors,self.errors
  assert not [c for c in self.calls if c['url']=='/api/payments/promptpay' and c['method']=='POST']
  self.ctx.close()
 def paid_flow(self,native=False):
  p=self.p;self.setup();assert self.unload() is True
  if native:
   dialogs=[];p.once('dialog',lambda d:(dialogs.append(d.type),d.dismiss()));p.evaluate('setTimeout(()=>location.reload(),0)');p.wait_for_timeout(300);assert dialogs==['beforeunload'],dialogs
   closing=[];p.once('dialog',lambda d:(closing.append(d.type),d.dismiss()));p.close(run_before_unload=True);p.wait_for_timeout(200);assert closing==['beforeunload'] and not p.is_closed(),closing
  self.easy();before=len(self.choosers);p.locator('.easy-change').click();self.warning('เพิ่มรูปใหม่?');assert len(self.choosers)==before
  self.screenshot('easy-replace');p.keyboard.press('Escape');assert self.unload() is True
  p.locator('.easy-brand').click();self.warning('ออกจากหน้านี้?');p.get_by_role('button',name='กลับไปแก้ไขรูป',exact=True).click();assert self.unload() is True
  self.studio();self.upload().click();self.warning('เพิ่มรูปใหม่?');assert len(self.choosers)==before
  p.get_by_role('button',name='ดาวน์โหลดรูปเดิม',exact=True).click();p.get_by_role('dialog',name='ขนาดรูป',exact=True).wait_for();assert p.locator('.paid-work-warning').count()==0;assert len(self.choosers)==before
  p.get_by_role('button',name='ยกเลิก',exact=True).click();assert self.unload() is True
  self.upload().click();self.warning('เพิ่มรูปใหม่?');self.screenshot('studio-replace')
  with p.expect_file_chooser()as event:p.get_by_role('button',name='เพิ่มรูปใหม่',exact=True).click()
  event.value.set_files(self.file());p.wait_for_function("!document.querySelector('.paid-work-warning')");p.wait_for_function("document.querySelector('.studio-source-preview')?.getAttribute('src')")
  p.wait_for_timeout(250);assert self.unload() is False
  if p.locator('.studio-portrait-choice-overlay').count():p.locator('.studio-portrait-choice-overlay').click(position={'x':4,'y':4})
  with p.expect_file_chooser()as event:self.upload().click()
  event.value.set_files([]);assert p.locator('.paid-work-warning').count()==0
  return {'paidBeforeUnload':True,'replaceBeforeChooser':True,'downloadPreservesWork':True,'modeToggleRetainsWork':True,'newRawHasNoWarning':True,'nativeBeforeUnload':native}
 def unpaid_flow(self):
  p=self.p;self.setup();assert self.unload() is False
  with p.expect_file_chooser()as event:self.upload().click()
  assert p.locator('.paid-work-warning').count()==0;event.value.set_files([])
  self.easy()
  with p.expect_file_chooser()as event:p.locator('.easy-change').click()
  assert p.locator('.paid-work-warning').count()==0;event.value.set_files([])
  p.locator('.easy-brand').click();p.locator('.profile-home').wait_for();assert p.locator('.paid-work-warning').count()==0;assert self.unload() is False
  return {'noWarningForUnpaid':True,'credits':self.credits,'owner':self.owner,'private':self.private}
 def exit_flow(self):
  p=self.p;self.setup();p.get_by_role('button',name='กลับหน้าหลัก',exact=True).click();dialog=self.warning('ออกจากหน้านี้?')
  assert dialog.get_by_role('button',name='บันทึกและออก',exact=True).count()==int(self.can_save)
  self.screenshot('exit');p.get_by_role('button',name='ออกจากหน้า',exact=True).click();p.locator('.profile-home').wait_for();assert self.unload() is False
  return {'paidExitWarning':True,'explicitExitHome':True,'saveOptionMatchesPermission':True}
 def fallback_scope(self):
  p=self.p;self.setup();p.locator('input[type="file"][accept*="image/jpeg"]').set_input_files(self.file());self.warning('เพิ่มรูปใหม่?');assert len(self.choosers)==0
  p.get_by_role('button',name='กลับไปแก้ไขรูป',exact=True).click();assert self.unload() is True
  self.upload().click();self.warning('เพิ่มรูปใหม่?');p.evaluate("window.__paidStudioFixture.setJob('replacement_unpaid_job')");p.wait_for_function("!document.querySelector('.paid-work-warning')");p.wait_for_timeout(250);assert self.unload() is False
  with p.expect_file_chooser()as event:self.upload().click()
  event.value.set_files([]);assert p.locator('.paid-work-warning').count()==0
  return {'programmaticFileGuarded':True,'staleWorkWarningDismissed':True,'consentNotCarriedToNewWork':True}
 def legacy_flow(self):
  p=self.p;self.setup();p.evaluate('window.__paidWarningFixture.legacy()');p.locator('.adaptive-editor').wait_for();p.wait_for_timeout(250);assert self.unload() is self.paid
  label=p.locator('label[for="process-photo-input"]:visible').first
  if self.paid:
   before=len(self.choosers);label.click();self.warning('เพิ่มรูปใหม่?');assert len(self.choosers)==before;p.keyboard.press('Escape');p.get_by_role('button',name='กลับหน้าก่อนหน้า',exact=True).click();self.warning('ออกจากหน้านี้?');p.get_by_role('button',name='ออกจากหน้า',exact=True).click()
  else:
   with p.expect_file_chooser()as event:label.click()
   event.value.set_files([]);assert p.locator('.paid-work-warning').count()==0;p.get_by_role('button',name='กลับหน้าก่อนหน้า',exact=True).click()
  p.locator('.profile-home').wait_for();assert self.unload() is False
  return {'legacyPaidOnly':True,'legacyPaid':self.paid,'labelBeforeChooser':True,'legacyExitHome':True}
 def logout_flow(self):
  p=self.p;self.setup();native=[]
  p.get_by_role('button',name='เมนู',exact=True).click();p.locator('dialog.idprom-account-dialog:modal').wait_for()
  if self.paid:
   p.on('dialog',lambda dialog:(native.append(dialog.message),dialog.dismiss()))
   p.get_by_role('button',name='ออกจากระบบ',exact=True).click();self.warning('ออกจากหน้านี้?');p.get_by_role('button',name='ออกจากหน้า',exact=True).click();p.locator('.profile-home').wait_for();assert native==[],native
  else:
   p.once('dialog',lambda dialog:(native.append(dialog.message),dialog.accept()))
   p.get_by_role('button',name='ออกจากระบบ',exact=True).click();p.locator('.profile-home').wait_for();assert native==['ออกจากระบบ?'],native
  assert p.locator('.paid-work-warning').count()==0;assert self.unload() is False
  return {'paidLogout':self.paid,'singleConfirmation':True,'noPaidWarningForUnpaidLogout':not self.paid}
 def payment_during_prepare(self,legacy=False):
  p=self.p;self.setup()
  if legacy:p.evaluate('window.__paidWarningFixture.legacy()');p.locator('.adaptive-editor').wait_for();p.wait_for_timeout(250)
  assert self.unload() is False;p.evaluate('window.__warningPausePrepare=true')
  target=p.locator('label[for="process-photo-input"]:visible').first if legacy else self.upload()
  with p.expect_file_chooser()as event:target.click()
  event.value.set_files(self.file());p.wait_for_function('window.__warningPrepareEntered===true')
  self.paid=True;p.evaluate('window.__paidWarningFixture.refresh()')
  p.wait_for_function("(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented})()")
  p.evaluate('window.__warningReleasePrepare()');self.warning('เพิ่มรูปใหม่?')
  if not legacy:assert p.evaluate("window.__paidStudioFixture.heads().includes('job_fixture')")
  p.get_by_role('button',name='กลับไปแก้ไขรูป',exact=True).click();assert self.unload() is True
  return {'paymentDuringPrepareGuarded':True,'legacy':legacy,'oldPaidWorkRetained':True}
 def terminal_missing_after_logout(self,legacy=False):
  p=self.p;self.setup()
  if legacy:p.evaluate('window.__paidWarningFixture.legacy()');p.locator('.adaptive-editor').wait_for();p.wait_for_timeout(150)
  else:self.easy()
  assert self.unload() is True
  # This is the retained AccountUI logout path, not StudioAccountMenu's exit path.
  # The old head stays visible but its authenticated ownership no longer exists.
  self.paid=False;self.missing_current=True
  p.get_by_role('button',name='บัญชีสมาชิก',exact=True).click();p.get_by_role('button',name='ลงชื่อออก',exact=True).click()
  p.wait_for_function("!localStorage.getItem('idprom_auth_token')")
  for attempt in range(30):
   if self.missing_reads:break
   p.wait_for_timeout(30)
  assert self.missing_reads>0;p.wait_for_timeout(100);assert self.unload() is False
  if not legacy:self.studio()
  target=p.locator('label[for="process-photo-input"]:visible').first if legacy else self.upload()
  with p.expect_file_chooser()as event:target.click()
  event.value.set_files([]);assert p.locator('.paid-work-warning').count()==0
  before=self.missing_reads
  if legacy:
   p.evaluate('window.__paidWarningFixture.downloadMissing()');assert self.missing_reads>before
  else:
   p.get_by_role('button',name='ดาวน์โหลดรูป',exact=True).click();p.get_by_role('dialog',name='ขนาดรูป',exact=True).wait_for();p.locator('.photo-size-apply').click();p.get_by_text('ไม่พบงานของบัญชีนี้ กรุณาเปิดงานด้วยบัญชีเดิมแล้วลองอีกครั้ง',exact=True).first.wait_for();assert self.missing_reads>before
   if p.get_by_role('dialog',name='ขนาดรูป',exact=True).count():p.get_by_role('dialog',name='ขนาดรูป',exact=True).get_by_role('button',name='ยกเลิก',exact=True).click()
   if p.get_by_role('button',name='ตกลง',exact=True).count():p.get_by_role('button',name='ตกลง',exact=True).click()
  assert self.downloads==[];assert p.locator('.paired-offers').count()==0
  p.get_by_role('button',name='กลับหน้าก่อนหน้า' if legacy else 'กลับหน้าหลัก',exact=True).click();p.locator('.profile-home').wait_for();assert self.unload() is False
  return {'terminal404AfterLogout':True,'legacy':legacy,'canChooseReplacement':True,'canExitHome':True,'noDownloadRightGranted':True}
 def stale_prepaid_reply(self,legacy=False):
  p=self.p;self.rights_online=False;self.setup()
  if legacy:p.evaluate('window.__paidWarningFixture.legacy()');p.locator('.adaptive-editor').wait_for();p.wait_for_timeout(150)
  self.hold_next_right=True
  if legacy:p.locator('label[for="process-photo-input"]:visible').first.click()
  else:self.upload().click()
  for attempt in range(20):
   if self.held_right is not None:break
   p.wait_for_timeout(30)
  assert self.held_right is not None,'Unknown-rights action did not launch retry'
  self.rights_online=True;self.paid=True;p.evaluate('window.__paidWarningFixture.refresh()')
  p.wait_for_function("(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented})()")
  self.held_right.fulfill(content_type='application/json',body=json.dumps({'unlocked':False,'paidDownload':False,'fullEdit':False,'premiumHair':False}));self.held_right=None;p.wait_for_timeout(200)
  assert self.unload() is True,'A stale prepayment reply removed paid-work protection'
  if legacy:p.locator('label[for="process-photo-input"]:visible').first.click()
  else:self.upload().click()
  self.warning('เพิ่มรูปใหม่?');assert len(self.choosers)==0;p.keyboard.press('Escape')
  return {'latePrepaymentReplyIgnored':True,'legacy':legacy,'paidProtectionRetained':True}
 def offline_recovery(self,legacy=False,exit=False):
  p=self.p;self.rights_online=False;self.setup()
  if legacy:p.evaluate('window.__paidWarningFixture.legacy()');p.locator('.adaptive-editor').wait_for();p.wait_for_timeout(250)
  calls=lambda:len([call for call in self.calls if call['url'].endswith('/rights')]);before=calls();chooser_count=len(self.choosers)
  def click():
   if exit:p.get_by_role('button',name='กลับหน้าก่อนหน้า' if legacy else 'กลับหน้าหลัก',exact=True).click()
   elif legacy:p.locator('label[for="process-photo-input"]:visible').first.click()
   else:self.upload().click()
  click();p.wait_for_timeout(120);assert calls()>before,'Unknown-rights action did not retry verification';assert len(self.choosers)==chooser_count;assert p.locator('.paid-work-warning').count()==0
  self.rights_online=True
  for attempt in range(3):
   click();p.wait_for_timeout(150)
   if (exit and p.locator('.profile-home').count())or(not exit and len(self.choosers)>chooser_count):break
  if exit:p.locator('.profile-home').wait_for()
  else:assert len(self.choosers)==chooser_count+1;self.choosers[-1].set_files([])
  assert self.unload() is False;assert p.locator('.paid-work-warning').count()==0
  return {'offlineVerificationRetries':True,'recoversAfterNetwork':True,'legacy':legacy,'exit':exit,'noFalsePaidWarning':True}
with sync_playwright()as pw:
 engines=[('chromium',pw.chromium,'/usr/bin/chromium')]
 if os.environ.get('WEBKIT_EXECUTABLE'):engines.append(('webkit',pw.webkit,os.environ['WEBKIT_EXECUTABLE']))
 if os.environ.get('PAID_WARNING_ENGINE'):engines=[entry for entry in engines if entry[0]==os.environ['PAID_WARNING_ENGINE']]
 for engine,launcher,executable in engines:
  browser=launcher.launch(executable_path=executable,headless=True,args=['--no-sandbox','--disable-dev-shm-usage']if engine=='chromium'else[])
  plans=[('paid-desktop',1440,1000,{'paid':True,'pkg':'89'},'paid_flow'),('paid-tablet',820,1180,{'paid':True},'paid_flow'),('paid-phone',390,844,{'paid':True},'paid_flow'),('unpaid-credits',1440,1000,{'paid':False,'credits':5},'unpaid_flow'),('unpaid-owner',390,844,{'paid':False,'owner':True},'unpaid_flow'),('unpaid-private',820,1180,{'paid':False,'private':True},'unpaid_flow'),('paid-exit',390,844,{'paid':True},'exit_flow'),('paid-save-exit',1440,1000,{'paid':True,'can_save':True},'exit_flow'),('source-scope',1440,1000,{'paid':True},'fallback_scope'),('legacy-paid',1440,1000,{'paid':True},'legacy_flow'),('legacy-unpaid',390,844,{'paid':False,'credits':3},'legacy_flow')]
  plans += [('terminal404-logout',1440,1000,{'paid':True},'terminal_missing_after_logout'),('legacy-terminal404-logout',1440,1000,{'paid':True},'legacy_terminal_missing_after_logout'),('stale-prepay',1440,1000,{'paid':False},'stale_prepaid_reply'),('legacy-stale-prepay',1440,1000,{'paid':False},'legacy_stale_prepaid_reply'),('logout-paid',1440,1000,{'paid':True},'logout_flow'),('logout-unpaid',390,844,{'paid':False},'logout_flow'),('payment-race',1440,1000,{'paid':False},'payment_during_prepare'),('legacy-payment-race',1440,1000,{'paid':False},'legacy_payment_race'),('offline-upload',1440,1000,{'paid':False},'offline_recovery'),('offline-exit',390,844,{'paid':False},'offline_exit'),('legacy-offline-upload',1440,1000,{'paid':False},'legacy_offline_upload'),('legacy-offline-exit',390,844,{'paid':False},'legacy_offline_exit')]
  if os.environ.get('PAID_WARNING_CASE'):plans=[plan for plan in plans if plan[0]in os.environ['PAID_WARNING_CASE'].split(',')]
  for name,width,height,options,method in plans:
   full=engine+'-'+name;case=Case(browser,full,width,height,**options)
   try:
    if method=='paid_flow':details=case.paid_flow(native=engine=='chromium'and name=='paid-desktop')
    elif method=='legacy_terminal_missing_after_logout':details=case.terminal_missing_after_logout(legacy=True)
    elif method=='legacy_stale_prepaid_reply':details=case.stale_prepaid_reply(legacy=True)
    elif method=='legacy_payment_race':details=case.payment_during_prepare(legacy=True)
    elif method=='offline_exit':details=case.offline_recovery(exit=True)
    elif method=='legacy_offline_upload':details=case.offline_recovery(legacy=True)
    elif method=='legacy_offline_exit':details=case.offline_recovery(legacy=True,exit=True)
    else:details=getattr(case,method)()
    case.finish();results.append({'case':full,'passed':True,**details})
   except Exception as error:
    try:case.screenshot('error')
    except Exception:pass
    results.append({'case':full,'passed':False,'error':str(error),'traceback':traceback.format_exc(),'pageErrors':case.errors,'calls':case.calls});case.ctx.close()
   print(json.dumps(results[-1],ensure_ascii=False),flush=True)
  browser.close()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));assert source_hashes()==FROZEN,'Production source changed during browser regression';assert all(result['passed']for result in results),'Paid warning browser regression failed'
