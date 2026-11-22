"""Current real Studio picker with original uploaded preview and inert provider callbacks."""
import os,json
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('UPLOADED_HAIR_BASE','http://127.0.0.1:5202')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [1440,390]:
  page=b.new_page(viewport={'width':width,'height':1100});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(BASE+'/scripts/fixtures/government-result-insignia.html?studio=1&fullbody=1&basic89=1&uploadedHair=1',wait_until='domcontentloaded')
  page.get_by_role('button',name='ทรงผม',exact=True).click()
  buttons=page.locator('button[aria-label^="เลือกทรงผมหญิง "]')
  expect(buttons.nth(2)).to_be_visible()
  assert buttons.nth(2).get_attribute('aria-label')=='เลือกทรงผมหญิง ผมรวบเรียบ'
  expect(page.get_by_role('button',name='เลือกทรงผมหญิง ทรงผมหญิง 2',exact=True)).to_have_count(0)
  new=page.get_by_role('button',name='เลือกทรงผมหญิง ผมรวบเรียบ',exact=True)
  expect(new).to_be_enabled();assert new.locator('img').get_attribute('src').find('79')>=0
  new.click();page.get_by_role('button',name='สร้างภาพ',exact=True).click()
  page.wait_for_function('insigniaFixture.aiCalls===1',timeout=15000)
  assert page.evaluate('insigniaFixture.hairRequest.id')=='seedream-79'
  assert page.evaluate('insigniaFixture.paymentCalls')==0
  assert not errors,errors
  print(json.dumps({'width':width,'freeThirdSlot':'seedream-79','oldTileRemoved':True,'paid89HairCallback':True,'paymentCalls':0,'realAiCalls':0}))
  page.close()
 b.close()
