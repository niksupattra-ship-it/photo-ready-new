"""Real Studio UI/raw PNG delivery with local account and payment fixtures only.
Run Vite first; SOURCE_DOWNLOAD_BASE defaults to http://127.0.0.1:5173.
No AI, payment provider, customer or production API is contacted.
"""
import base64,json,os,pathlib,re
from playwright.sync_api import sync_playwright,expect
from PIL import Image

ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE=os.environ.get('SOURCE_DOWNLOAD_BASE','http://127.0.0.1:5173')
OUT=pathlib.Path('/tmp/source-download-browser');OUT.mkdir(exist_ok=True)
SEED=re.search(r'SEED="""(.*?)"""',(ROOT/'tests/premium-download-credits.browser.py').read_text(),re.S).group(1)
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,height in [(1440,1000),(390,844)]:
  ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<1100,accept_downloads=True)
  p=ctx.new_page();p.set_default_timeout(15000)
  state={'remaining':1,'registered':[],'unlocked':{'job_fixture'},'debits':[],'calls':[]};errors=[]
  p.on('pageerror',lambda e:errors.append(str(e)))
  p.route('**/*',lambda r:r.continue_() if r.request.url.startswith((BASE+'/','data:','blob:')) else r.abort())
  def api(r):
   u=r.request.url.split(BASE)[-1];state['calls'].append(u)
   if u.startswith('/api/wallet'):
    d={'walletId':'wallet_fixture','processRemaining':0,'premiumDownloadRemaining':state['remaining'],'trialRemaining':0,'canSave':False,'unlockedJobIds':list(state['unlocked']),'editableJobIds':list(state['unlocked'])}
   elif u=='/api/source-downloads':
    assert r.request.headers.get('x-idprom-source-key')
    assert r.request.headers.get('x-wallet-id')=='wallet_fixture'
    assert 'multipart/form-data' in r.request.headers['content-type']
    job='job_source_'+str(len(state['registered'])+1);state['registered'].append(job)
    d={'jobId':job,'downloadWorkId':'dwork_'+job}
   elif u.endswith('/rights'):
    job=u.split('/')[3];paid=job in state['unlocked'];d={'unlocked':paid,'fullEdit':paid,'paidDownload':paid,'premiumHair':paid}
   elif u.endswith('/unlock'):
    job=u.split('/')[3];assert job in state['registered'];assert state['remaining']>0
    state['remaining']-=1;state['debits'].append(job);state['unlocked'].add(job)
    d={'ok':True,'walletId':'wallet_fixture','processRemaining':0,'premiumDownloadRemaining':state['remaining'],'unlockedJobIds':list(state['unlocked']),'editableJobIds':list(state['unlocked'])}
   elif u.endswith('/suits'):d={'limited':True,'choices':[],'limit':5}
   elif u=='/api/private-trial':d={'active':False}
   elif u=='/api/download-events':d={'ok':True,'accepted':[e['eventId'] for e in json.loads(r.request.post_data or '{}').get('events',[])]}
   elif u.startswith('/api/payments/promptpay/'):
    d={'paymentIntentId':'pi_fixture','walletId':'wallet_fixture','jobId':'job_fixture','packageId':'89','amount':89,'status':'canceled','ok':False}
   elif u.startswith(('/api/ai-','/api/hairstyle/','/api/makeup/')):raise AssertionError('Raw export must never process a portrait: '+u)
   elif u=='/api/payments/promptpay':raise AssertionError('No payment may be created without explicit checkout')
   else:d={'ok':True}
   r.fulfill(content_type='application/json',body=json.dumps(d))
  p.route('**/api/**',api)
  p.goto(BASE,wait_until='domcontentloaded');p.evaluate(SEED);p.reload(wait_until='domcontentloaded')
  p.get_by_role('button',name='เปิดงานเดิมและตรวจสอบการชำระเงิน',exact=True).click()
  p.locator('.paired-offers').wait_for();p.keyboard.press('Escape')
  p.get_by_role('button',name='โหมดง่าย',exact=True).wait_for()
  upload=lambda:p.get_by_role('button',name='เปลี่ยนรูปต้นฉบับ' if width>1100 else 'เปลี่ยนรูป',exact=True)
  def file(color):
   value=p.evaluate('''color=>{const c=document.createElement('canvas');c.width=120;c.height=160;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,120,160);return c.toDataURL().split(',')[1]}''',color)
   return {'name':'manual.png','mimeType':'image/png','buffer':base64.b64decode(value)}
  def replace(color):
   upload().click();p.get_by_role('dialog',name='เพิ่มรูปใหม่?',exact=True).wait_for()
   with p.expect_file_chooser() as chosen:p.get_by_role('button',name='เพิ่มรูปใหม่',exact=True).click()
   chosen.value.set_files(file(color))
   p.wait_for_function("!!document.querySelector('.studio-source-preview')?.getAttribute('src')")
   p.locator('.studio-portrait-choice-overlay').wait_for()
   p.get_by_role('button',name='รูปผู้ชาย',exact=True).click()
  replace('#36a688')
  if width>1100:
   expect(p.get_by_text('กรุณาเลือกทรงผมเพื่อปรับภาพหน้าตรงอัตโนมัติ',exact=True)).to_be_visible()
   compare=p.get_by_role('button',name='ก่อน/หลัง',exact=True)
   assert compare.inner_text()=='';assert compare.locator('svg').count()==1
  download=lambda:p.get_by_role('button',name='ดาวน์โหลดรูป',exact=True)
  def deliver():
   if width<1100:
    p.locator('.photo-size-apply').click()
    p.get_by_role('link',name='บันทึกรูป',exact=True).wait_for()
    with p.expect_download() as event:p.get_by_role('link',name='บันทึกรูป',exact=True).click()
    p.get_by_role('button',name='ปิด',exact=True).click()
   else:
    with p.expect_download() as event:p.locator('.photo-size-apply').click()
   return event.value
  download().click();p.get_by_role('dialog',name='ขนาดรูป',exact=True).wait_for()
  downloaded=deliver()
  target=OUT/('raw-'+str(width)+'.png');downloaded.save_as(target)
  image=Image.open(target);assert image.format=='PNG';assert image.width>0 and image.height>0
  assert state['registered']==['job_source_1'];assert state['debits']==['job_source_1'];assert state['remaining']==0
  p.wait_for_timeout(150)
  # Repeated delivery uses the same work and never spends a second credit.
  download().click();p.get_by_role('dialog',name='ขนาดรูป',exact=True).wait_for()
  deliver()
  assert state['registered']==['job_source_1'];assert state['debits']==['job_source_1']
  # Raw paid work retains the existing replacement warning and new-work boundary.
  replace('#b68966')
  download().click();p.locator('.paired-offers').wait_for()
  assert state['registered']==['job_source_1','job_source_2'];assert state['debits']==['job_source_1'];assert 'job_source_2' not in state['unlocked']
  p.keyboard.press('Escape');p.screenshot(path=str(OUT/('studio-'+str(width)+'.png')))
  assert not errors,errors
  results.append({'width':width,'rawPNG':list(image.size),'oneCreditPerWork':True,'repeatFree':True,'replacementWarning':True,'replacementUnpaid':True,'aiCalls':0})
  ctx.close()
 browser.close()
print(json.dumps({'passed':results},ensure_ascii=False))
