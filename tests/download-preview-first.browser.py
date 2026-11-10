"""Actual App download: marked adjustment first, authorization on final click.
Every API is a local fixture; no AI, real account, charge or email is contacted.
"""
import hashlib,json,os,pathlib,re,subprocess,traceback
from playwright.sync_api import sync_playwright
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE=os.environ.get('DOWNLOAD_PREVIEW_BASE','http://127.0.0.1:5173')
OUT=pathlib.Path(os.environ.get('DOWNLOAD_PREVIEW_OUTPUT','/tmp/download-preview-first'));OUT.mkdir(parents=True,exist_ok=True)
SEED=re.search(r'SEED="""(.*?)"""',(ROOT/'tests/premium-download-credits.browser.py').read_text(),re.S).group(1)
SEED=SEED.replace("restrictedTrial:true,x:0","restrictedTrial:true,portraitMode:'female',femaleEyeStyle:'natural',hairId:'',x:0")
TRACKED=['src/main.jsx','src/studio-editor.jsx'];hashes=lambda:{n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest()for n in TRACKED}
START=hashes();results=[]
class Case:
 def __init__(self,browser,lang,width):
  self.lang=lang;self.en=lang=='en';self.width=width;self.mobile=width<600;self.name=lang+'-'+str(width);self.remaining=0;self.unlocked=set();self.calls=[];self.downloads=[];self.errors=[];self.archives=[]
  self.ctx=browser.new_context(viewport={'width':width,'height':900 if not self.mobile else 844},has_touch=self.mobile,accept_downloads=True)
  self.p=self.ctx.new_page();self.p.set_default_timeout(18000);self.p.on('pageerror',lambda e:self.errors.append(str(e)));self.p.on('download',lambda d:self.downloads.append(d))
  self.p.route('**/*',lambda r:r.continue_()if r.request.url.startswith((BASE+'/','blob:','data:'))else r.abort())
  self.p.route('**/api/**',self.api);self.p.route('**/src/main.jsx*',self.instrument)
 def wallet(self):return {'walletId':'wallet_fixture','processRemaining':0,'trialRemaining':2,'premiumDownloadRemaining':self.remaining,'canSave':False,'unlockedJobIds':list(self.unlocked),'editableJobIds':list(self.unlocked)}
 def api(self,r):
  u=r.request.url.split(BASE)[-1];method=r.request.method;record={'url':u,'method':method};self.calls.append(record);status=200
  if u.startswith('/api/wallet'):d=self.wallet()
  elif u=='/api/private-trial':d={'active':False}
  elif u.startswith('/api/payments/promptpay/'):d={'paymentIntentId':'pi_fixture','walletId':'wallet_fixture','jobId':'job_fixture','packageId':'89','amount':89,'status':'canceled','ok':False}
  elif u.endswith('/unlock'):
   job=u.split('/')[3];assert json.loads(r.request.post_data)['premium']is True
   if job not in self.unlocked:
    if self.remaining<1:status=402
    else:self.remaining-=1;self.unlocked.add(job)
   d={'ok':status==200,**self.wallet()}
  elif u.endswith('/rights'):
   yes=u.split('/')[3]in self.unlocked;d={'checked':True,'unlocked':yes,'fullEdit':yes,'premiumHair':yes,'paidDownload':yes}
  elif u.endswith('/suits'):d={'limited':True,'limit':5 if u.split('/')[3]in self.unlocked else 3,'choices':[]}
  elif u=='/api/purchased-photos'and method=='POST':
   assert b'image/png' in r.request.post_data_buffer,'Archive must receive the selected photo, not PDF';self.archives.append(record);d={'id':'archive_fixture','receiveUrl':'/receive/'+'a'*64}
  elif u=='/api/payments/promptpay'and method=='POST':raise AssertionError('A preview must never create a real payment')
  elif '/api/auth/'in u:raise AssertionError('No credentials/email should be sent')
  elif u.startswith('/api/ai-')or u.startswith('/api/hairstyle/'):raise AssertionError('No AI request during download')
  else:d={'ok':True}
  r.fulfill(status=status,content_type='application/json',body=json.dumps(d))
 def instrument(self,r):
  response=r.fetch();body=response.text();needle='const easyLanding =';assert needle in body
  fixture="""window.__downloadPreviewFixture={snapshot:()=>paymentStudioRef.current?.(),refresh:refreshWallet,restore:restorePurchaseDraft,resume:async()=>{setBuyOpen(false);return savePaidCheckout('pi_preview_fixture',{jobId:currentOutputJobRef.current})},persist:async()=>{const {savePurchaseDraft}=await import('/src/purchase-draft.js');return savePurchaseDraft({walletId:currentWalletId(),jobId:currentOutputJobRef.current,isTrial:true,studio:paymentStudioRef.current?.()})},setJob:id=>{currentOutputJobRef.current=id;currentOutputTrialRef.current=true;setOutputJobId(id);savedWorkOpenRequestRef.current++;setStudioData(prev=>prev?.map(layer=>layer.kind==='head'?{...layer,jobId:id,restrictedTrial:true,outputUnlocked:false,fullEditUnlocked:false}:layer));setSavedWorkRevision(v=>v+1);setSavedWorkUnlocked(false);setTrialPreview(true);setDownloadUnlockSignal(null)}};\n"""
  r.fulfill(response=response,body=body.replace(needle,fixture+needle,1))
 def setup(self):
  p=self.p;p.goto(BASE+'/?lang='+self.lang,wait_until='domcontentloaded');p.evaluate(SEED);p.reload(wait_until='domcontentloaded');p.get_by_role('button',name='Open project and review payment'if self.en else'เปิดงานเดิมและตรวจสอบการชำระเงิน',exact=True).click();p.locator('.paired-offers').wait_for();p.keyboard.press('Escape');p.locator('main.idstudio .studio-stage>canvas').wait_for(state='attached');p.wait_for_timeout(150)
 def open_preview(self):
  p=self.p;before=len(self.downloads);debits=self.debits();p.locator('main.idstudio').get_by_role('button',name='Download photo'if self.en else'ดาวน์โหลดรูป',exact=True).filter(visible=True).first.click();p.locator('.en-download').wait_for();p.wait_for_function("document.querySelector('.en-download canvas')?.width>1 && !document.querySelector('.en-download-primary').disabled")
  assert p.locator('.paired-offers').count()==0,'Package appeared before adjustments';assert len(self.downloads)==before;assert self.debits()==debits,'Opening preview consumed a credit'
 def debits(self):return len([c for c in self.calls if c['url'].endswith('/unlock')])
 def choice(self):return self.p.evaluate('window.__downloadPreviewFixture.snapshot().downloadChoice')
 def save_download(self,filename):
  p=self.p;before=len(self.downloads)
  if self.mobile:
   p.locator('.en-download-primary').click();p.locator('dialog[open]').wait_for();link=p.locator('dialog[open] #save')
   with p.expect_download()as event:link.click()
   p.locator('dialog[open] #close').click()
  else:
   with p.expect_download()as event:p.locator('.en-download-primary').click()
  event.value.save_as(str(OUT/(self.name+'-'+filename)));p.wait_for_timeout(150);assert len(self.downloads)==before+1,'Extra original file or duplicate download';assert p.locator('.en-download').count()==0,'Second size dialog opened';return OUT/(self.name+'-'+filename)
 def run(self):
  p=self.p;self.setup();self.open_preview();assert p.locator('.en-download canvas').get_attribute('data-watermarked')=='true'
  size='intl-2x2-inch'if self.en else'2-inch';p.locator('.en-download-size select').select_option(size);zoom=p.locator('.en-download input[type=range]');zoom.fill('1.2');preview=p.locator('.en-download canvas');preview.scroll_into_view_if_needed();p.wait_for_timeout(100);before=preview.evaluate('c=>c.toDataURL()');box=preview.bounding_box();cx=box['x']+box['width']/2;cy=box['y']+box['height']/2;p.mouse.move(cx,cy);p.mouse.down();p.mouse.move(cx+25,cy+15,steps=5);p.mouse.up();p.wait_for_timeout(100);assert preview.evaluate('c=>c.toDataURL()')!=before
  p.get_by_role('button',name='Print sheet (PDF)'if self.en else'PDF สำหรับพิมพ์',exact=True).click();p.locator('.en-download-copies input').fill('4');p.wait_for_timeout(100)
  remembered=self.choice();assert remembered['choice']['sizeId']==size and remembered['choice']['format']=='pdf'and remembered['choice']['copies']==4;assert not remembered['requested'];assert self.debits()==0
  p.screenshot(path=str(OUT/(self.name+'-marked-before-package.png')),full_page=True)
  p.locator('.en-download-primary').click();p.locator('.paired-offers').wait_for();assert p.locator('.en-download').count()==0;assert self.choice()['requested'];assert not self.downloads and self.debits()==0
  p.keyboard.press('Escape');self.open_preview();assert p.locator('.en-download-size select').input_value()==size;assert p.locator('.en-download-copies input').input_value()=='4';assert self.choice()['choice']==remembered['choice']
  p.locator('.en-download-primary').click();p.locator('.paired-offers').wait_for();assert p.evaluate('window.__downloadPreviewFixture.persist()');p.evaluate('window.__downloadPreviewFixture.restore()');p.locator('main.idstudio .studio-stage>canvas').wait_for(state='attached');p.wait_for_timeout(200);assert self.choice()['requested'];assert self.choice()['choice']==remembered['choice'],'Checkout draft lost adjustment choice'
  self.unlocked.add('job_fixture');p.evaluate('window.__downloadPreviewFixture.refresh()');
  if not self.mobile:
   with p.expect_download()as event:assert p.evaluate('window.__downloadPreviewFixture.resume()')is True
   event.value.save_as(str(OUT/(self.name+'-paid.pdf')))
  else:assert p.evaluate('window.__downloadPreviewFixture.resume()')is True
  if self.mobile:
   p.get_by_role('heading',name='Save your PDF'if self.en else'บันทึก PDF',exact=True).wait_for();assert not self.downloads
   with p.expect_download()as event:p.get_by_role('link',name='Save PDF'if self.en else'บันทึก PDF',exact=True).click()
   p.get_by_role('button',name='Close'if self.en else'ปิด',exact=True).click();event.value.save_as(str(OUT/(self.name+'-paid.pdf')))
  else:
   p.wait_for_function("document.querySelector('.en-download')===null");p.wait_for_timeout(150);assert len(self.downloads)==1;self.downloads[0].save_as(str(OUT/(self.name+'-paid.pdf')))
  pdf=OUT/(self.name+'-paid.pdf');assert pdf.read_bytes().startswith(b'%PDF');assert '612 x 792 pts'in subprocess.check_output(['pdfinfo',str(pdf)],text=True);assert pdf.read_bytes().count(b'/Subtype /Image')==1;assert len(self.downloads)==1;assert self.debits()==0;assert p.locator('.en-download').count()==0
  # Repeated settlement does not generate a second automatic original or PDF.
  assert p.evaluate('window.__downloadPreviewFixture.resume()')is True;p.wait_for_timeout(200);assert len(self.downloads)==1
  # New work with a credit: first click must not redeem; final click redeems once.
  self.remaining=1;p.evaluate("window.__downloadPreviewFixture.setJob('job_credit')");p.evaluate('window.__downloadPreviewFixture.refresh()');p.locator('main.idstudio .studio-stage>canvas').wait_for(state='attached');p.wait_for_timeout(150);self.open_preview();assert self.remaining==1 and self.debits()==0;assert p.locator('.en-download canvas').get_attribute('data-watermarked')=='true';p.locator('.en-download-size select').select_option(size)
  path=self.save_download('credit.png');assert self.remaining==0 and self.debits()==1
  with Image.open(path)as im:
   assert im.size==((1200,1200)if self.en else(944,1252)),im.size
   assert im.convert('RGB').crop((35,35,130,130)).getcolors(2)==[(95*95,(203,231,255))],'Paid file contains watermark'
  self.open_preview();assert p.locator('.en-download canvas').get_attribute('data-watermarked')=='false';p.locator('.en-download-size select').select_option(size);self.save_download('paid-repeat.png');assert self.debits()==1 and self.remaining==0
  p.wait_for_timeout(200);assert len(self.archives)==3,('PDF/PNG archive count',self.archives);assert p.locator('.paired-offers').count()==0;assert p.locator('.en-download').count()==0;assert p.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not self.errors,self.errors
  return {'name':self.name,'passed':True,'previewBeforePackage':True,'markedPreview':True,'retainedCropSizePdfCopiesAfterRestore':True,'paidAutomaticSelectedPdf':True,'noExtraOriginal':True,'creditOnlyAtFinalClick':True,'oneDebitRepeatedDownload':True,'cleanPng':True,'pdfArchivedAsPng':True,'actualDownloads':len(self.downloads),'pageErrors':self.errors}
with sync_playwright()as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for lang in ['th','en']:
  for width in [1440,390]:
   case=Case(browser,lang,width)
   try:r=case.run()
   except Exception as e:case.p.screenshot(path=str(OUT/(case.name+'-error.png')));r={'name':case.name,'passed':False,'error':str(e),'traceback':traceback.format_exc(),'calls':case.calls,'pageErrors':case.errors}
   results.append(r);print(json.dumps(r,ensure_ascii=False),flush=True);case.ctx.close()
 browser.close()
proof={'passed':sum(r['passed']for r in results),'failed':sum(not r['passed']for r in results),'sourceHashesBefore':START,'sourceHashesAfter':hashes(),'scope':'Actual App and Studio handlers; mock APIs, checkout snapshot/draft restore and verified rights. No real AI, account writes, payment or email.','results':results};(OUT/'results.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2));assert proof['failed']==0;assert START==hashes()
