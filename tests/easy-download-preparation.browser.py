import json
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [390,1440]:
  p=b.new_page(viewport={'width':width,'height':1000});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  p.route('**/api/**',lambda r:r.abort())
  p.goto('http://127.0.0.1:5199/scripts/fixtures/government-result-insignia.html?unpaid=1&fullbody=1')
  if width<=720:p.get_by_role('navigation',name='เครื่องมือรูปที่เสร็จแล้ว').get_by_role('button',name='ดาวน์โหลด',exact=True).click()
  else:p.locator('.thai-mobile-result-download').click()
  dialog=p.get_by_role('dialog',name='ดาวน์โหลดรูป',exact=True);expect(dialog).to_be_visible(timeout=30000)
  expect(dialog.get_by_role('button',name='PNG',exact=True)).to_be_visible();expect(dialog.get_by_role('button',name='PDF',exact=True)).to_be_visible();expect(dialog.get_by_label('ขนาดรูป',exact=True)).to_be_visible()
  assert p.evaluate('insigniaFixture.paymentCalls===0&&insigniaFixture.aiCalls===0&&insigniaFixture.exports.length===0')
  dialog.get_by_role('button',name='PDF',exact=True).click();expect(dialog.get_by_label('จำนวนรูป',exact=True)).to_be_visible()
  dialog.get_by_role('button',name='ดาวน์โหลด PDF',exact=True).click();p.wait_for_function('insigniaFixture.paymentCalls===1')
  assert p.evaluate('insigniaFixture.exports.length===0&&insigniaFixture.aiCalls===0'),'Unpaid user cannot receive an unwatermarked file'
  assert not errors,errors
  print(json.dumps({'width':width,'unpaidPngPdfPreparationFirst':True,'purchaseOnlyOnConfirm':True,'noUnauthorizedFile':True}));p.close()
 b.close()
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 p=b.new_page(viewport={'width':1440,'height':1000});p.route('**/api/**',lambda r:r.abort())
 p.goto('http://127.0.0.1:5199/scripts/fixtures/government-result-insignia.html?fullbody=1')
 p.locator('.thai-mobile-result-download').click();dialog=p.get_by_role('dialog',name='ดาวน์โหลดรูป',exact=True);expect(dialog).to_be_visible(timeout=30000)
 dialog.locator('.en-download-primary').click();p.wait_for_function('insigniaFixture.exports.length===1')
 assert p.evaluate('insigniaFixture.exports[0].type==="image/png"&&insigniaFixture.exports[0].size>0&&insigniaFixture.paymentCalls===0&&insigniaFixture.aiCalls===0')
 print(json.dumps({'paidPngStillDelivered':True,'noRepeatPayment':True}));b.close()
