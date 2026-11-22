import json
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [390,1440]:
  p=b.new_page(viewport={'width':width,'height':1000});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  p.goto('http://127.0.0.1:5199/scripts/fixtures/thai-work-ai-offers.html')
  expect(p.get_by_role('radio',name='โปร 89 บาท',exact=True)).to_be_visible();expect(p.get_by_role('radio',name='โปร 159 บาท',exact=True)).to_have_count(0)
  p.get_by_role('button',name='ปลดล็อกใช้งานมากขึ้น ไปที่สตูดิโอ →',exact=True).click()
  expect(p.get_by_role('radio',name='โปร 159 บาท',exact=True)).to_be_visible();expect(p.get_by_text('ใช้ AI 10 ครั้ง สำหรับรูปนี้',exact=True).first).to_be_visible()
  card=p.locator('.offer-card.premium');assert card.locator('.offer-features').inner_text().strip()==''
  p.get_by_role('radio',name='โปร 159 บาท',exact=True).check();p.get_by_role('button',name='ดำเนินการต่อ · ฿159',exact=True).click();assert p.evaluate('offerActions.checkout[0]==="159"&&offerActions.studio===1')
  assert not errors,errors;p.close()
  p=b.new_page(viewport={'width':width,'height':1000});p.goto('http://127.0.0.1:5199/scripts/fixtures/thai-work-ai-offers.html?studio=1&ready=0')
  expect(p.get_by_role('radio',name='โปร 159 บาท',exact=True)).to_be_disabled();expect(p.get_by_role('radio',name='โปร 89 บาท',exact=True)).to_be_disabled();expect(p.locator('.idprom-thai-checkout-next')).to_be_disabled();assert p.evaluate('offerActions.checkout.length===0');p.close()
  print(json.dumps({'width':width,'easyOnly89':True,'studioAi10':True,'requiresReadyPhoto':True}))
 b.close()
