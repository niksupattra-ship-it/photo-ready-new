import json
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for pro in [0,1]:
  p=b.new_page(viewport={'width':1440,'height':1000});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  p.goto(f'http://127.0.0.1:5199/scripts/fixtures/government-result-insignia.html?studio=1&femaleSuits=1&pro={pro}')
  panel=p.locator('#studio-suit-choices');expect(panel).to_be_visible(timeout=30000)
  names=panel.locator('.english-outfit-card > button:first-child').evaluate_all('(els)=>els.map(e=>e.getAttribute("aria-label"))')
  assert names==['เลือกชุด ฟรี 1','เลือกชุด ฟรี 2','เลือกชุด ฟรี 3','เลือกชุด ฟรี 4','เลือกชุด ชุดโปร'],names
  premium=panel.get_by_role('button',name='เลือกชุด ชุดโปร',exact=True);premium.click()
  if not pro:
   p.wait_for_function('insigniaFixture.paymentCalls===1');assert p.evaluate('insigniaFixture.offer.reason')=='diamond-suit'
   assert p.evaluate('!insigniaLayers().some(l=>l.templatePath==="/assets/job-uniforms/female-job-taupe-cream-blouse.png")')
   panel.get_by_role('button',name='ใส่ชุดด้วย AI ชุดโปร',exact=True).click();p.wait_for_function('insigniaFixture.paymentCalls===2')
  else:p.wait_for_function('insigniaLayers().some(l=>l.templatePath==="/assets/job-uniforms/female-job-taupe-cream-blouse.png")')
  panel.get_by_role('button',name='เลือกชุด ฟรี 4',exact=True).click()
  p.wait_for_function('insigniaLayers().some(l=>l.templatePath==="/assets/job-uniforms/female-job-ivory-bow-blouse.png")')
  assert p.evaluate('insigniaFixture.aiCalls===0');assert not errors,errors
  print(json.dumps({'pro':bool(pro),'fourFreeFirst':True,'premiumGate':True,'noAiCalls':True}));p.close()
 p=b.new_page(viewport={'width':390,'height':900})
 p.goto('http://127.0.0.1:5199/scripts/fixtures/mobile-result-actions.html?femaleSuits=1')
 p.get_by_role('button',name='ทรง 1',exact=True).click()
 assert all('ทรง ' not in card.inner_text() for card in p.locator('.thai-mobile-hair-row button').all())
 panel=p.get_by_role('region',name='เลือกชุด',exact=True)
 buttons=panel.locator('.thai-mobile-choice-outfit-grid button')
 # Use visible labels to assert screenshot order before expanding paid choices.
 for i,name in enumerate(['female-job-navy-notch-white-shirt','female-job-navy-double-breasted-cream-blouse','female-job-navy-white-collar','female-job-ivory-bow-blouse']):
  expect(panel.get_by_role('button',name=name,exact=True)).to_be_visible()
 expect(panel.get_by_label('สมัครโปรเพื่อปลดล็อกชุด')).to_have_count(0)
 panel.get_by_role('button',name='ดูชุดเพิ่มเติม (5)',exact=True).click()
 locked=panel.get_by_role('button',name='female-job-taupe-cream-blouse',exact=False);expect(locked).to_be_visible();locked.click()
 assert p.evaluate('resultActions.suits.length===1&&resultActions.suits[0].locked===true')
 expect(locked).to_have_attribute('aria-pressed','false')
 expect(panel.get_by_label('สมัครโปรเพื่อปลดล็อกชุด')).to_have_count(1)
 print(json.dumps({'mobileEasy':True,'fourFreeFirst':True,'lockedDoesNotSelect':True}));p.close()
 b.close()
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [390,1440]:
  p=b.new_page(viewport={'width':width,'height':1000})
  p.goto('http://127.0.0.1:5199/scripts/fixtures/government-result-insignia.html?studio=1&maleSuits=1&gender=male')
  if width<=720:p.get_by_role('navigation',name='หมวดองค์ประกอบ').get_by_role('button',name='ชุด',exact=True).click()
  panel=p.locator('#studio-suit-choices');expect(panel).to_be_visible(timeout=30000)
  cards=panel.locator('.english-outfit-card > button:first-child');assert cards.evaluate_all('(els)=>els.map(e=>e.getAttribute("aria-label"))')==['เลือกชุด ฟรีชาย 1','เลือกชุด ฟรีชาย 2','เลือกชุด ฟรีชาย 3','เลือกชุด ฟรีชาย 4','เลือกชุด ชุดโปรชาย']
  assert all('ฟรีชาย' not in card.inner_text() and 'ชุดโปรชาย' not in card.inner_text() for card in cards.all())
  panel.get_by_role('button',name='เลือกชุด ชุดโปรชาย',exact=True).click();p.wait_for_function('insigniaFixture.paymentCalls===1');assert p.evaluate('insigniaFixture.offer.reason')=='diamond-suit'
  panel.get_by_role('button',name='เลือกชุด ฟรีชาย 3',exact=True).click();p.wait_for_function('insigniaLayers().some(l=>l.templatePath==="/assets/job-uniforms/male-open-collar-suit.png")')
  print(json.dumps({'male':True,'width':width,'fourFreeFirst':True,'noNames':True,'proGate':True}));p.close()
 b.close()
