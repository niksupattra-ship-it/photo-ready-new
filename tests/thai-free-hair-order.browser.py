"""Real Thai picker order and Diamond badges; callbacks are inert, no AI provider calls."""
import os,json
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('THAI_HAIR_ORDER_BASE','http://127.0.0.1:5202')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [1440,390]:
  for gender in ['female','male']:
   page=b.new_page(viewport={'width':width,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(BASE+'/scripts/fixtures/government-result-insignia.html?studio=1&fullbody=1&basic89=1&uploadedHair=1&gender='+gender,wait_until='domcontentloaded')
   page.get_by_role('button',name='ทรงผม',exact=True).click()
   if gender=='female':
    options=page.locator('button[aria-label^="เลือกทรงผมหญิง "]');expect(options.nth(2)).to_be_visible()
    assert options.nth(1).get_attribute('aria-label')=='เลือกทรงผมหญิง ทรงผมหญิง 3'
    chosen=options.nth(1);expect(chosen.locator('svg[role="img"]')).to_have_count(0)
    former=page.get_by_role('button',name='เลือกทรงผมหญิง ทรงผม 16',exact=True);expect(former.locator('svg[role="img"]')).to_have_count(1)
    expected='seedream-42'
   else:
    options=page.locator('button[aria-label^="เลือกทรงผมชาย "]');expect(options.first).to_be_visible()
    chosen=options.first;assert chosen.get_attribute('aria-label')=='เลือกทรงผมชาย ผมชายอัตโนมัติ'
    assert 'thai-male-auto' in chosen.locator('img').get_attribute('src');expect(chosen.locator('svg[role="img"]')).to_have_count(0)
    expect(page.get_by_role('button',name='AI เลือกให้',exact=True)).to_have_count(0)
    expect(page.get_by_role('button',name='เลือกทรงผมชาย ทรงผม 1',exact=True)).to_have_count(0)
    expected='thai-male-auto'
   chosen.click();page.get_by_role('button',name='สร้างภาพ',exact=True).click();page.wait_for_function('insigniaFixture.hairRequest!==undefined',timeout=15000)
   assert page.evaluate('insigniaFixture.hairRequest.id')==expected
   assert page.evaluate('insigniaFixture.paymentCalls')==0
   assert not errors,errors
   print(json.dumps({'width':width,'gender':gender,'freeChoice':expected,'mockHairRequest':True,'paymentCalls':0,'realAiCalls':0}))
   page.close()
 b.close()
