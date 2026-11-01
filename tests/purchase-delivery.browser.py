"""Actual editor -> offers -> login -> QR -> receipt -> account history.
All API calls are intercepted, including auth/payment/storage. No real charges.
Run PURCHASE_DELIVERY_BASE=http://127.0.0.1:5173 python3 tests/purchase-delivery.browser.py
"""
import base64, email, io, json, os, pathlib, re, traceback
from datetime import datetime, timedelta, timezone
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE=os.environ.get('PURCHASE_DELIVERY_BASE','http://127.0.0.1:5173')
OUT=pathlib.Path('/tmp/purchase-delivery-browser');OUT.mkdir(exist_ok=True)
SEED=re.search(r'SEED="""(.*?)"""',(ROOT/'tests/account-flow-dialog.browser.py').read_text(),re.S).group(1)
png=io.BytesIO();Image.new('RGB',(60,80),'#cbe7ff').save(png,format='PNG');PNG=png.getvalue()
class Case:
 def __init__(self,browser,width,pkg,guest):
  self.name=f'{width}-{pkg}-'+('guest'if guest else'member');self.width=width;self.pkg=pkg;self.guest=guest;self.paid=False;self.started=False;self.items=[];self.files={};self.calls=[];self.errors=[];self.storage_error=False
  self.ctx=browser.new_context(viewport={'width':width,'height':1000 if width>1000 else 844},has_touch=width<1000,accept_downloads=True,permissions=['clipboard-read','clipboard-write']);self.p=self.ctx.new_page();self.p.set_default_timeout(15000)
  self.p.on('pageerror',lambda e:self.errors.append(str(e)))
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
   now=datetime.now(timezone.utc);item={'id':'photo_fixture','jobIds':['job_fixture'],'packageId':self.pkg,'receiveUrl':'/receive/'+'a'*64,'imageUrl':'/api/purchased-photos/photo_fixture/image','previewUrl':'/api/purchased-photos/photo_fixture/preview','purchasedAt':now.isoformat(),'createdAt':now.isoformat(),'expiresAt':(now+timedelta(days=7)).isoformat(),'serverNow':now.isoformat()};self.items=[item];self.files[item['imageUrl']]=data;self.files[item['previewUrl']]=PNG;d=item
  elif path=='/api/purchased-photos':d={'items':self.items,'serverNow':datetime.now(timezone.utc).isoformat(),'days':7}
  elif path in self.files:r.fulfill(content_type='image/png',body=self.files[path]);return
  elif path.endswith('/suits'):d={'limited':False,'choices':[]}
  elif path.startswith(('/api/ai-','/api/hairstyle/')):raise AssertionError('Download must not generate another AI image')
  else:d={'ok':True}
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
  self.storage_error=self.pkg=='159'and self.guest;self.paid=True;p.evaluate("window.dispatchEvent(new Event('focus'))")
  receipt=p.get_by_role('dialog',name='รับรูป',exact=True);receipt.wait_for();receipt.get_by_text('ชำระเงินสำเร็จ',exact=False).wait_for();
  if self.storage_error:
   receipt.get_by_role('button',name='ลองเก็บลิงก์อีกครั้ง',exact=True).wait_for();assert receipt.get_by_role('button',name='คัดลอกลิงก์รับรูป',exact=True).is_disabled();assert receipt.get_by_role('link',name='ดาวน์โหลดรูป',exact=True).is_visible();self.storage_error=False;receipt.get_by_role('button',name='ลองเก็บลิงก์อีกครั้ง',exact=True).click()
  receipt.get_by_role('button',name='คัดลอกลิงก์รับรูป',exact=True).wait_for(state='visible');p.wait_for_function("!!document.querySelector('.purchase-receive-link')")
  receipt.get_by_role('button',name='คัดลอกลิงก์รับรูป',exact=True).click();assert p.evaluate('navigator.clipboard.readText()')==BASE+'/receive/'+'a'*64
  assert receipt.get_by_role('link',name='เปิดรูปเพื่อบันทึก',exact=True).get_attribute('target')=='_blank'
  p.screenshot(path=str(OUT/(self.name+'-receipt.png')))
  with p.expect_download()as event:receipt.get_by_role('link',name='ดาวน์โหลดรูป',exact=True).click()
  path=OUT/(self.name+'.png');event.value.save_as(str(path));assert Image.open(path).size==(2256,3072)
  receipt.get_by_role('button',name='กลับไปแต่งรูป',exact=True).click();p.get_by_role('button',name='ดาวน์โหลดรูป',exact=True).filter(visible=True).first.click();receipt.wait_for();assert p.locator('.paired-offers').count()==0
  receipt.get_by_role('button',name='ดูรูปที่ซื้อแล้ว · เก็บไฟล์รับรูป 7 วัน',exact=True).click();history=p.get_by_role('dialog',name='รูปที่ซื้อแล้ว',exact=True);history.wait_for();history.get_by_role('button',name='รับรูป',exact=True).click();receipt.wait_for();assert receipt.get_by_role('button',name='คัดลอกลิงก์รับรูป',exact=True).is_enabled()
  receipt.get_by_role('button',name='ปิดหน้ารับรูป',exact=True).click();p.screenshot(path=str(OUT/(self.name+'-history.png')))
  # Closing and reloading must retain access through the actual account menu.
  p.reload(wait_until='domcontentloaded');p.get_by_role('button',name='บัญชีสมาชิก',exact=True).filter(visible=True).first.click();p.get_by_role('button',name='รูปที่ซื้อแล้ว',exact=True).click();history=p.get_by_role('dialog',name='รูปที่ซื้อแล้ว',exact=True);history.wait_for();history.get_by_role('button',name='รับรูป',exact=True).click();receipt.wait_for()
  assert len([c for c in self.calls if c==('POST','/api/payments/promptpay')])==1;assert not self.errors,self.errors
results=[]
with sync_playwright()as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,pkg,guest in [(390,'89',True),(390,'159',True),(1440,'89',False),(820,'159',False)]:
  case=Case(browser,width,pkg,guest)
  try:case.run();result={'case':case.name,'passed':True}
  except Exception as e:
   case.p.screenshot(path=str(OUT/(case.name+'-error.png')));result={'case':case.name,'passed':False,'error':str(e),'traceback':traceback.format_exc(),'pageErrors':case.errors}
  results.append(result);print(json.dumps(result,ensure_ascii=False),flush=True);case.ctx.close()
 browser.close()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));assert all(r['passed']for r in results)
