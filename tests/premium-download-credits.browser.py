"""Full-App finite pro159 credit regression, with every API fulfilled locally.
Run with Vite at PREMIUM_CREDIT_BASE; no payment provider or customer is contacted.
"""
import json, os, pathlib, traceback
from playwright.sync_api import sync_playwright
from PIL import Image
BASE=os.environ.get('PREMIUM_CREDIT_BASE','http://127.0.0.1:5192')
OUT=pathlib.Path(os.environ.get('PREMIUM_CREDIT_OUTPUT','/tmp/premium-download-browser'));OUT.mkdir(parents=True,exist_ok=True)
SEED="""async()=>{localStorage.setItem('idprom_wallet_id','wallet_fixture');localStorage.setItem('idprom_auth_token','token_fixture');const c=document.createElement('canvas');c.width=900;c.height=1200;const x=c.getContext('2d');x.fillStyle='#cbe7ff';x.fillRect(0,0,900,1200);x.fillStyle='#b37f61';x.fillRect(300,100,300,500);x.fillStyle='#334466';x.fillRect(100,600,700,600);const png=c.toDataURL(),blob=await(await fetch(png)).blob();const draft={walletId:'wallet_fixture',jobId:'job_fixture',isTrial:true,originalFile:blob,studio:{layers:[{id:'head_fixture',name:'หัว · คอ · ผม',kind:'head',source:png,jobId:'job_fixture',restrictedTrial:true,x:0,y:0,scale:1,rotation:0,opacity:1,visible:true,locked:false}],placement:{W:900,H:1200,uX:0,uY:600,uW:900,uH:600}}};await(await import('/src/purchase-draft.js')).savePurchaseDraft(draft);localStorage.setItem('idprom_pending_qr_v1',JSON.stringify({walletId:'wallet_fixture',jobId:'job_fixture',paymentIntentId:'pi_fixture',packageId:'89',amount:89,status:'canceled'}))}"""
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,height in [(1440,1000),(390,844)]:
  ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1100,accept_downloads=True);p=ctx.new_page();p.set_default_timeout(15000);state={'remaining':2,'unlocked':set(),'calls':[],'downloads':[]};errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.on('download',lambda d:state['downloads'].append(d))
  def wallet():return {'walletId':'wallet_fixture','processRemaining':0,'trialRemaining':0,'premiumDownloadRemaining':state['remaining'],'canSave':False,'unlockedJobIds':list(state['unlocked']),'editableJobIds':list(state['unlocked'])}
  def api(r):
   u=r.request.url.split(BASE)[-1];method=r.request.method;state['calls'].append({'url':u,'method':method});status=200
   if u.startswith('/api/wallet'):d=wallet()
   elif u=='/api/private-trial':d={'active':False}
   elif u.startswith('/api/payments/promptpay/'):d={'paymentIntentId':'pi_fixture','walletId':'wallet_fixture','jobId':'job_fixture','packageId':'89','amount':89,'status':'canceled','ok':False}
   elif u.endswith('/unlock'):
    job=u.split('/')[3];assert json.loads(r.request.post_data)['premium'] is True
    if job not in state['unlocked']:
     if state['remaining']==0:status=402
     else:state['remaining']-=1;state['unlocked'].add(job)
    d={'ok':status==200,**wallet()}
   elif u.endswith('/rights'):
    yes=u.split('/')[3] in state['unlocked'];d={'checked':True,'unlocked':yes,'fullEdit':yes,'premiumHair':yes}
   elif u.endswith('/suits'):d={'limited':True,'limit':5,'choices':[]}
   elif u=='/api/payments/promptpay' and method=='POST':raise AssertionError('Available support credits must never create a charge')
   else:d={'ok':True}
   r.fulfill(status=status,content_type='application/json',body=json.dumps(d))
  def instrument(r):
   response=r.fetch();body=response.text();needle='const easyLanding =';assert needle in body
   body=body.replace(needle,'window.__premiumFixture={useDownloadCredit,setJob:id=>{currentOutputJobRef.current=id;setOutputJobId(id);savedWorkOpenRequestRef.current++;setStudioData(prev=>prev?.map(layer=>layer.kind==="head"?{...layer,jobId:id,restrictedTrial:true,outputUnlocked:false,fullEditUnlocked:false}:layer));setSavedWorkRevision(v=>v+1);setSavedWorkUnlocked(false);setTrialPreview(true);setDownloadUnlockSignal(null)}};\n'+needle,1);r.fulfill(response=response,body=body)
  p.route('**/api/**',api);p.route('**/src/main.jsx*',instrument)
  def open_offer():p.evaluate("window.dispatchEvent(new Event('idprom-buy'))");p.locator('.paired-offers').wait_for()
  def save_delivery(action,filename):
   if width<1100:
    action();p.get_by_role('link',name='บันทึกรูป',exact=True).wait_for()
    with p.expect_download() as event:p.get_by_role('link',name='บันทึกรูป',exact=True).click()
    p.get_by_role('button',name='ปิด',exact=True).click()
   else:
    with p.expect_download() as event:action()
   event.value.save_as(str(OUT/(str(width)+'-'+filename+'.png')))
   with Image.open(OUT/(str(width)+'-'+filename+'.png')) as image:
    # A broad solid-background region would reveal the tiled preview watermark.
    colors=image.convert('RGB').crop((100,100,450,800)).getcolors(2);assert colors==[(350*700,(203,231,255))],colors
  def use_and_download(filename):
   save_delivery(lambda:p.get_by_role('button',name='ใช้ 1 สิทธิ์โปร 159',exact=True).click(),filename);p.wait_for_function("!document.querySelector('dialog.idprom-account-flow-dialog:modal')")
  def repeat_and_download():
   # The identical settled signal is deliberately deduplicated. Re-download via
   # the normal size picker; it verifies rights without using another credit.
   p.get_by_role('button',name='ใช้ 1 สิทธิ์โปร 159',exact=True).click();p.wait_for_function("!document.querySelector('dialog.idprom-account-flow-dialog:modal')")
   p.get_by_role('button',name='ดาวน์โหลดรูป',exact=True).click();p.get_by_role('dialog',name='ขนาดรูป',exact=True).wait_for()
   save_delivery(lambda:p.locator('.photo-size-apply').click(),'same-work-repeat')
  try:
   p.goto(BASE,wait_until='domcontentloaded');p.evaluate(SEED);p.reload(wait_until='domcontentloaded');p.get_by_role('button',name='เปิดงานเดิมและตรวจสอบการชำระเงิน',exact=True).click();p.get_by_role('button',name='ใช้ 1 สิทธิ์โปร 159',exact=True).wait_for();assert state['remaining']==2
   use_and_download('first');assert state['remaining']==1
   open_offer();p.get_by_text('สิทธิ์ดาวน์โหลดคงเหลือ',exact=False).filter(has_text='โปร 159 จำนวน 1 งาน').wait_for();repeat_and_download();assert state['remaining']==1
   p.evaluate("window.__premiumFixture.setJob('job_second')");open_offer();use_and_download('second');assert state['remaining']==0
   p.evaluate("window.__premiumFixture.setJob('job_third')");open_offer();p.get_by_role('button',name='เลือกโปร 159 บาท',exact=True).wait_for();assert p.get_by_role('button',name='ใช้ 1 สิทธิ์โปร 159',exact=True).count()==0
   p.evaluate('window.__premiumFixture.useDownloadCredit({premium:true})');p.get_by_text('สิทธิ์ดาวน์โหลดหมดแล้ว กรุณาชำระเงินเพื่อปลดล็อกงานนี้',exact=True).wait_for();assert state['remaining']==0;assert 'job_third' not in state['unlocked'];assert len(state['downloads'])==3;assert not errors,errors
   assert not [c for c in state['calls'] if c['url']=='/api/payments/promptpay' and c['method']=='POST']
   p.screenshot(path=str(OUT/(str(width)+'-exhausted.png')));results.append({'width':width,'passed':True,'credits':[2,1,1,0,0],'actualDownloads':len(state['downloads']),'cleanImageRegionVerified':True,'paymentCreates':0,'unlockRequests':len([c for c in state['calls'] if c['url'].endswith('/unlock')]),'scope':'Full actual App; test-only state switch between owned work fixtures and all API responses mocked; browser emitted original PNG downloads.'})
  except Exception as e:
   p.screenshot(path=str(OUT/(str(width)+'-error.png')));results.append({'width':width,'passed':False,'error':str(e),'traceback':traceback.format_exc(),'errors':errors,'calls':state['calls']})
  print(json.dumps(results[-1],ensure_ascii=False),flush=True);ctx.close()
 browser.close()
(OUT/'browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));assert all(r['passed'] for r in results)
