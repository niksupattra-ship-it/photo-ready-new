"""Actual editor -> offers -> login -> QR -> receipt -> account history.
All API calls are intercepted, including auth/payment/storage. No real charges.
Run PURCHASE_DELIVERY_BASE=http://127.0.0.1:5173 python3 tests/purchase-delivery.browser.py
"""
import base64, email, hashlib, io, json, os, pathlib, re, traceback
from datetime import datetime, timedelta, timezone
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE=os.environ.get('PURCHASE_DELIVERY_BASE','http://127.0.0.1:5173')
OUT=pathlib.Path('/tmp/purchase-delivery-browser');OUT.mkdir(exist_ok=True)
SEED=re.search(r'SEED="""(.*?)"""',(ROOT/'tests/account-flow-dialog.browser.py').read_text(),re.S).group(1)
png=io.BytesIO();Image.new('RGB',(60,80),'#cbe7ff').save(png,format='PNG');PNG=png.getvalue()
class Case:
 def __init__(self,browser,width,pkg,guest,block_auto=False):
  self.name=f'{width}-{pkg}-'+('guest'if guest else'member')+('-blocked-auto'if block_auto else'');self.block_auto=block_auto;self.downloads=[];self.width=width;self.pkg=pkg;self.guest=guest;self.paid=False;self.started=False;self.items=[];self.files={};self.archives=[];self.defer_next_archive=False;self.deferred_archive=None;self.calls=[];self.errors=[];self.storage_error=False
  self.ctx=browser.new_context(viewport={'width':width,'height':1000 if width>1000 else 844},has_touch=width<1000,accept_downloads=True,permissions=['clipboard-read','clipboard-write']);self.p=self.ctx.new_page();self.p.set_default_timeout(15000)
  self.p.on('pageerror',lambda e:self.errors.append(str(e)));self.p.on('download',lambda d:self.downloads.append(d))
  if block_auto:self.ctx.add_init_script("document.addEventListener('click',e=>{if(e.target.closest?.('.idprom-automatic-photo-download')){e.preventDefault();window.__blockedAutoDownloads=(window.__blockedAutoDownloads||0)+1}},true)")
  self.p.route('**/*',lambda r:r.continue_()if r.request.url.startswith((BASE+'/','blob:','data:'))else r.abort())
  self.p.route('**/api/**',self.api)
 def wallet(self):return {'walletId':'wallet_fixture','processRemaining':0,'trialRemaining':0,'canSave':False,'unlockedJobIds':['job_fixture']if self.paid else[],'editableJobIds':['job_fixture']if self.paid else[]}
 def payment(self):return {'paymentIntentId':'pi_fixture','walletId':'wallet_fixture','jobId':'job_fixture','packageId':self.pkg,'amount':int(self.pkg),'status':'succeeded'if self.paid else('requires_action'if self.started else'canceled'),'ok':self.paid,'expiresAt':1999999999,'qrImage':'data:image/png;base64,'+base64.b64encode(PNG).decode()}
 def api(self,r):
  path=r.request.url.split(BASE)[-1];method=r.request.method;self.calls.append((method,path));status=200
  if path.startswith('/api/auth/'):
   assert path in ['/api/auth/login','/api/auth/register'];d={'token':'token_fixture',**self.wallet()}
  elif path.startswith('/api/wallet'):d=self.wallet()
  elif path=='/api/private-trial':d={'active':False}
  elif path=='/api/payments/promptpay'and method=='POST':
   body=json.loads(r.request.post_data);assert body['packageId']==self.pkg;self.started=True;d=self.payment()
  elif path.endswith('/image')and path.startswith('/api/payments/'):
   r.fulfill(content_type='image/png',body=PNG);return
  elif path.startswith('/api/payments/promptpay/'):
   d=self.payment();d.update(self.wallet());d['ok']=self.paid
  elif path.endswith('/rights'):d={'checked':True,'unlocked':self.paid,'fullEdit':self.paid,'premiumHair':self.paid and self.pkg=='159'}
  elif path=='/api/purchased-photos'and method=='POST':
   assert self.paid,'Unpaid pixels must not be uploaded as a purchased file'
   if self.storage_error:r.fulfill(status=503,content_type='application/json',body=json.dumps({'message':'ยังเก็บลิงก์รับรูปไม่ได้ ยังดาวน์โหลดไฟล์ด้านบนได้'}));return
   mime=email.message_from_bytes(('Content-Type: '+r.request.headers['content-type']+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+r.request.post_data_buffer)
   fields={part.get_param('name',header='content-disposition'):part.get_payload(decode=True)for part in mime.walk()if part.get_content_disposition()=='form-data'}
   assert json.loads(fields['jobIds'])==['job_fixture'];data=fields['image'];assert data.startswith(b'\x89PNG')
   now=datetime.now(timezone.utc);token=hashlib.sha256(data).hexdigest();photo_id='photo_'+token[:12];item={'id':photo_id,'jobIds':['job_fixture'],'packageId':self.pkg,'receiveUrl':'/receive/'+token,'imageUrl':'/api/purchased-photos/'+photo_id+'/image','previewUrl':'/api/purchased-photos/'+photo_id+'/preview','purchasedAt':now.isoformat(),'createdAt':now.isoformat(),'expiresAt':(now+timedelta(days=7)).isoformat(),'serverNow':now.isoformat()};self.items=[item];self.files[item['imageUrl']]=data;self.files[item['previewUrl']]=PNG;self.archives.append({'item':item,'data':data});d=item
  elif path=='/api/purchased-photos':d={'items':self.items,'serverNow':datetime.now(timezone.utc).isoformat(),'days':7}
  elif path in self.files:r.fulfill(content_type='image/png',body=self.files[path]);return
  elif path.endswith('/suits'):d={'limited':False,'choices':[]}
  elif path.startswith(('/api/ai-','/api/hairstyle/')):raise AssertionError('Download must not generate another AI image')
  else:d={'ok':True}
  if path=='/api/purchased-photos'and method=='POST'and self.defer_next_archive:self.defer_next_archive=False;self.deferred_archive=(r,d);return
  r.fulfill(status=status,content_type='application/json',body=json.dumps(d))
 def run(self):
  p=self.p;p.goto(BASE,wait_until='domcontentloaded');p.evaluate(SEED);p.reload(wait_until='domcontentloaded');p.get_by_role('button',name='เปิดงานเดิมและตรวจสอบการชำระเงิน',exact=True).click();p.locator('.paired-offers').wait_for();p.keyboard.press('Escape')
  p.get_by_role('button',name='ดาวน์โหลดรูป',exact=True).filter(visible=True).first.click();offers=p.locator('.paired-offers');offers.wait_for();offers.locator('img[alt="รูปที่จะซื้อ"]').wait_for()
  for amount in ['89','159']:assert offers.get_by_role('button',name='เลือกโปร '+amount+' บาท',exact=True).is_visible()
  preview=offers.locator('img[alt="รูปที่จะซื้อ"]').get_attribute('src');p.screenshot(path=str(OUT/(self.name+'-offers.png')))
  if self.guest:p.evaluate("localStorage.removeItem('idprom_auth_token')")
  offers.get_by_role('button',name='เลือกโปร '+self.pkg+' บาท',exact=True).click()
  if self.guest:
   p.locator('#idprom-auth-email').wait_for();assert p.locator('.purchase-summary img').get_attribute('src')==preview;assert self.pkg+' บาท'in p.locator('.purchase-summary').inner_text()
   p.get_by_role('button',name='ยังไม่มีบัญชี? สมัครสมาชิก',exact=True).click();assert p.locator('.purchase-summary img').get_attribute('src')==preview;p.get_by_role('button',name='มีบัญชีแล้ว? เข้าสู่ระบบ',exact=True).click()
   p.screenshot(path=str(OUT/(self.name+'-auth.png')));p.get_by_label('อีเมล',exact=True).fill('fixture@example.invalid');p.get_by_label('รหัสผ่าน',exact=True).fill('fixture-password');p.get_by_role('button',name='เข้าสู่ระบบและเปิด QR',exact=True).click()
  qr=p.locator('.idprom-qr-panel');qr.wait_for();assert p.locator('#idprom-auth-email').count()==0;assert p.locator('.paired-offers').count()==0;assert p.locator('.purchase-summary img').get_attribute('src')==preview
  assert qr.get_by_alt_text('QR ชำระเงิน '+self.pkg+' บาท').is_visible();assert len([c for c in self.calls if c==('POST','/api/payments/promptpay')])==1
  qr.get_by_role('button',name='บันทึก QR',exact=True).click();p.wait_for_timeout(100)
  if p.get_by_role('link',name='บันทึกรูป',exact=True).count():p.get_by_role('button',name='ปิด',exact=True).click()
  p.screenshot(path=str(OUT/(self.name+'-qr.png')))
  assert not[d for d in self.downloads if d.suggested_filename.startswith('IDPROM-Studio')],'An unpaid photo downloaded automatically'
  self.storage_error=self.pkg=='159'and self.guest;self.paid=True;p.evaluate("window.dispatchEvent(new Event('focus'))")
  receipt=p.get_by_role('dialog',name='รับรูป',exact=True);receipt.wait_for();receipt.get_by_text('ชำระเงินสำเร็จ',exact=False).wait_for();
  # The full original is requested once after verified payment, before any tap on Download.
  if self.block_auto:
   p.wait_for_function('window.__blockedAutoDownloads===1');assert not[d for d in self.downloads if d.suggested_filename.startswith('IDPROM-Studio')]
  else:
   for _ in range(100):
    automatic=[d for d in self.downloads if d.suggested_filename.startswith('IDPROM-Studio')]
    if automatic:break
    p.wait_for_timeout(50)
   assert len(automatic)==1,'Payment did not request exactly one original image automatically';automatic[0].save_as(str(OUT/(self.name+'-automatic.png')))
   with Image.open(OUT/(self.name+'-automatic.png'))as img:
    assert img.size==(2256,3072),'Automatic delivery used the preview or a cropped file'
    assert img.convert('RGB').crop((40,40,120,120)).getcolors(2)==[(80*80,(203,231,255))],'Automatic file has an unexpected watermark'
  photo_count=len([d for d in self.downloads if d.suggested_filename.startswith('IDPROM-Studio')]);p.evaluate("window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))");p.wait_for_timeout(250)
  assert len([d for d in self.downloads if d.suggested_filename.startswith('IDPROM-Studio')])==photo_count,'Repeated payment checks duplicated the download'
  if self.storage_error:
   receipt.get_by_role('button',name='ลองเก็บลิงก์อีกครั้ง',exact=True).wait_for();assert receipt.get_by_role('button',name='คัดลอกลิงก์รับรูป',exact=True).is_disabled();assert receipt.get_by_role('link',name='ดาวน์โหลดรูป',exact=True).is_visible();self.storage_error=False;receipt.get_by_role('button',name='ลองเก็บลิงก์อีกครั้ง',exact=True).click()
  receipt.get_by_role('button',name='คัดลอกลิงก์รับรูป',exact=True).wait_for(state='visible');p.wait_for_function("!!document.querySelector('.purchase-receipt .purchase-receive-link')")
  receipt.get_by_role('button',name='คัดลอกลิงก์รับรูป',exact=True).click();assert p.evaluate('navigator.clipboard.readText()')==BASE+self.items[0]['receiveUrl']
  assert receipt.get_by_role('link',name='เปิดรูปเพื่อบันทึก',exact=True).get_attribute('target')=='_blank'
  p.screenshot(path=str(OUT/(self.name+'-receipt.png')))
  with p.expect_download()as event:receipt.get_by_role('link',name='ดาวน์โหลดรูป',exact=True).click()
  path=OUT/(self.name+'.png');event.value.save_as(str(path));assert Image.open(path).size==(2256,3072)
  # Size, position and all delivery actions share one native dialog and file.
  assert receipt.get_by_role('group',name='เลือกขนาดรูป',exact=True).is_visible();assert p.get_by_role('dialog',name='ขนาดรูป',exact=True).count()==0
  original_link=self.items[0]['receiveUrl'];receipt_node=receipt.locator('.purchase-page').element_handle()
  for size_label,dimensions in [('2 นิ้ว',(944,1252)),('1.5 นิ้ว',(708,944)),('ขนาดเดิม',(2256,3072))]:
   receipt.get_by_role('group',name='เลือกขนาดรูป',exact=True).get_by_role('button',name=re.compile('^'+re.escape(size_label))).click()
   p.wait_for_function("document.querySelector('.purchase-receipt .purchase-primary')?.getAttribute('aria-disabled')==='false'&&!!document.querySelector('.purchase-receipt .purchase-receive-link')")
   assert receipt_node.evaluate('el=>el===document.querySelector(".purchase-page")'),'Resizing replaced the receipt with another page'
   assert p.locator('.photo-size-overlay').count()==0
   receipt.get_by_role('button',name='คัดลอกลิงก์รับรูป',exact=True).click();assert p.evaluate('navigator.clipboard.readText()')==BASE+self.items[0]['receiveUrl']
   if size_label!='ขนาดเดิม':assert self.items[0]['receiveUrl']!=original_link
   with p.expect_download()as event:receipt.get_by_role('link',name='ดาวน์โหลดรูป',exact=True).click()
   selected=OUT/(self.name+'-'+str(dimensions[0])+'.png');event.value.save_as(str(selected));assert Image.open(selected).size==dimensions
   assert selected.read_bytes()==self.files[self.items[0]['imageUrl']],'Copied link contains different pixels from the selected file'
   assert p.evaluate("async()=>{const img=new Image();img.src=document.querySelector('.purchase-secondary[href]').href;await img.decode();return [img.naturalWidth,img.naturalHeight]}")==list(dimensions),'Open-image action used the previous size'
  p.screenshot(path=str(OUT/(self.name+'-combined-size.png')))
  delivered_before_reopen=len(self.downloads)
  receipt.get_by_role('button',name='กลับไปแต่งรูป',exact=True).click();p.get_by_role('button',name='ดาวน์โหลดรูป',exact=True).filter(visible=True).first.click();receipt.wait_for();assert p.locator('.paired-offers').count()==0
  receipt.get_by_role('button',name='ดูรูปที่ซื้อแล้ว · เก็บไฟล์รับรูป 7 วัน',exact=True).click();history=p.get_by_role('dialog',name='รูปที่ซื้อแล้ว',exact=True);history.wait_for();history.get_by_role('button',name='รับรูป',exact=True).click();receipt.wait_for();assert receipt.get_by_role('button',name='คัดลอกลิงก์รับรูป',exact=True).is_enabled()
  receipt.get_by_role('button',name='ปิดหน้ารับรูป',exact=True).click();p.screenshot(path=str(OUT/(self.name+'-history.png')))
  # Closing and reloading must retain access through the actual account menu.
  p.reload(wait_until='domcontentloaded');p.get_by_role('button',name='บัญชีสมาชิก',exact=True).filter(visible=True).first.click();p.get_by_role('button',name='รูปที่ซื้อแล้ว',exact=True).click();history=p.get_by_role('dialog',name='รูปที่ซื้อแล้ว',exact=True);history.wait_for();history.get_by_role('button',name='รับรูป',exact=True).click();receipt.wait_for()
  assert len(self.downloads)==delivered_before_reopen,'Reopening or history requested another automatic image'
  if self.block_auto:assert p.evaluate('window.__blockedAutoDownloads||0')==0,'Reload unexpectedly requested another automatic file'
  assert len([c for c in self.calls if c==('POST','/api/payments/promptpay')])==1;assert not self.errors,self.errors
 def check_position_and_late_link(self):
  p=self.p;receipt=p.get_by_role('dialog',name='รับรูป',exact=True);sizes=receipt.get_by_role('group',name='เลือกขนาดรูป',exact=True)
  self.defer_next_archive=True;sizes.get_by_role('button',name=re.compile('^2 นิ้ว')).click()
  for _ in range(100):
   if self.deferred_archive:break
   p.wait_for_timeout(50)
  assert self.deferred_archive,'Resize upload never started';assert receipt.get_by_role('button',name='คัดลอกลิงก์รับรูป',exact=True).is_disabled()
  sizes.get_by_role('button',name=re.compile(r'^1\.5 นิ้ว')).click();p.wait_for_function("document.querySelector('.purchase-receipt .purchase-primary')?.getAttribute('aria-disabled')==='false'&&!!document.querySelector('.purchase-receipt .purchase-receive-link')")
  current_link=self.items[0]['receiveUrl'];late,data=self.deferred_archive;late.fulfill(content_type='application/json',body=json.dumps(data));self.deferred_archive=None;p.wait_for_timeout(100)
  receipt.get_by_role('button',name='คัดลอกลิงก์รับรูป',exact=True).click();assert p.evaluate('navigator.clipboard.readText()')==BASE+current_link,'Late upload restored an older-size link'
  initial_pixels=self.files[self.items[0]['imageUrl']];receipt.get_by_role('slider',name='ซูมครอป',exact=True).press('End')
  p.wait_for_function("document.querySelector('.purchase-receipt .purchase-primary')?.getAttribute('aria-disabled')==='false'&&!!document.querySelector('.purchase-receipt .purchase-receive-link')")
  assert self.files[self.items[0]['imageUrl']]!=initial_pixels,'Zoom did not affect the delivered image'
  zoomed=self.files[self.items[0]['imageUrl']];box=receipt.locator('.photo-size-canvas-wrap').bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2;p.mouse.move(x,y);p.mouse.down();p.mouse.move(x,y+25,steps=5);p.mouse.up()
  p.wait_for_function("document.querySelector('.purchase-receipt .purchase-primary')?.getAttribute('aria-disabled')==='false'&&!!document.querySelector('.purchase-receipt .purchase-receive-link')")
  assert self.files[self.items[0]['imageUrl']]!=zoomed,'Position changes did not affect the delivered image'
  with p.expect_popup()as opened:receipt.get_by_role('link',name='เปิดรูปเพื่อบันทึก',exact=True).click()
  popup=opened.value;popup.locator('img').wait_for();assert popup.locator('img').evaluate('async el=>{await el.decode();return [el.naturalWidth,el.naturalHeight]}')==[708,944];popup.close()
  assert p.get_by_role('dialog',name='ขนาดรูป',exact=True).count()==0;assert len([c for c in self.calls if c==('POST','/api/payments/promptpay')])==1
  p.screenshot(path=str(OUT/(self.name+'-position-and-late-link.png')))
results=[]
with sync_playwright()as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,pkg,guest,block_auto in [(390,'89',True,False),(390,'159',True,False),(1440,'89',False,False),(820,'159',False,False),(390,'89',True,True)]:
  case=Case(browser,width,pkg,guest,block_auto)
  try:
   case.run()
   if width==390 and pkg=='89'and not block_auto:case.check_position_and_late_link()
   result={'case':case.name,'passed':True}
  except Exception as e:
   case.p.screenshot(path=str(OUT/(case.name+'-error.png')));result={'case':case.name,'passed':False,'error':str(e),'traceback':traceback.format_exc(),'pageErrors':case.errors}
  results.append(result);print(json.dumps(result,ensure_ascii=False),flush=True);case.ctx.close()
 browser.close()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));assert all(r['passed']for r in results)
