import json,os
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('THAI_AI_BASE','http://127.0.0.1:5193')
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [390,1440]:
  for easy in [False,True]:
   print('CASE',width,easy,flush=True)
   page=browser.new_page(viewport={'width':width,'height':1000},has_touch=width<600)
   errors=[];page.on('pageerror',lambda e:errors.append(e.stack))
   page.route('**/api/**',lambda r:r.abort())
   page.goto(BASE+'/scripts/fixtures/thai-ai-edit.html'+('?easy=1&fresh=1' if easy else ''),wait_until='domcontentloaded')
   page.wait_for_function("document.querySelector('.studio-stage canvas')?.width>0")
   if easy:
    expect(page.locator('.easy-mode').get_by_role('button',name='แก้ไขด้วย AI',exact=True)).to_have_count(0)
    category=page.locator('.easy-suit-category-grid').get_by_role('button',name='สมัครงาน',exact=True)
    if category.count(): category.click()
   else:
    page.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
   if easy:
    page.locator('.easy-suit-grid').get_by_role('button',name='สูทสมัครงาน',exact=True).click()
    page.locator('.easy-no-hair').click()
    create=page.locator('.easy-mode').get_by_role('button',name='สร้างรูป',exact=True)
   else:
    ai=page.locator('.english-outfit-card').filter(has=page.locator('img[src*="male-job-blue-navy-tie"]')).get_by_role('button',name='แก้ไขด้วย AI',exact=True)
    expect(ai.first).to_be_visible();ai.first.click()
    expect(page.locator('.english-inline-ai')).to_have_count(0)
    page.get_by_role('button',name='ใช้ทรงผมเดิม',exact=True).click()
    create=page.locator('.english-inline-ai').get_by_role('button',name='สร้างภาพ',exact=True)
   expect(create).to_be_visible(timeout=15000)
   assert page.evaluate('thaiAiCalls.length')==0,'Selecting AI only stages the request'
   create.click()
   page.wait_for_function('thaiAiCalls.length===1')
   call=page.evaluate('thaiAiCalls[0]');assert call['options']['thaiOutfitAi'] is True
   assert call['template'].startswith('/assets/job-uniforms/')
   assert not errors,errors
   results.append({'width':width,'easy':easy,'call':call});page.close()
 # First Easy female selection stays in Easy; no AI button or premature Create.
 for width in [390,1440]:
  page=browser.new_page(viewport={'width':width,'height':1000},has_touch=width<600);page.route('**/api/**',lambda r:r.abort())
  page.goto(BASE+'/scripts/fixtures/thai-ai-edit.html?easy=1&fresh=1&female=1',wait_until='domcontentloaded')
  page.wait_for_function("document.querySelector('.studio-stage canvas')?.width>0")
  expect(page.locator('.easy-mode').get_by_role('button',name='แก้ไขด้วย AI',exact=True)).to_have_count(0)
  page.locator('.easy-suit-category-grid').get_by_role('button',name='ข้าราชการ',exact=True).click()
  page.locator('.easy-suit-grid').get_by_role('button',name='ข้าราชการหญิง',exact=True).click()
  expect(page.locator('.easy-mode').get_by_role('button',name='สร้างรูป',exact=True)).to_have_count(0)
  page.locator('.easy-rail').get_by_role('button',name='เลือกผมแสกกลาง',exact=True).click()
  assert page.evaluate('thaiAiCalls.length')==0
  page.get_by_role('button',name='แต่งหน้า',exact=True).click()
  create=page.locator('.easy-mode').get_by_role('button',name='สร้างรูป',exact=True);expect(create).to_be_visible();create.click()
  page.wait_for_function('thaiAiCalls.length===1');call=page.evaluate('thaiAiCalls[0]')
  assert call['finish']=='makeup' and call['gender']=='female' and call['options']['thaiOutfitAi'] is True
  results.append({'width':width,'easyFemaleFirst':True,'call':call});page.close()
 # Female stages hair and Makeup before creating, on the actual Thai UI.
 page=browser.new_page(viewport={'width':1440,'height':1000});page.route('**/api/**',lambda r:r.abort())
 page.goto(BASE+'/scripts/fixtures/thai-ai-edit.html?female=1',wait_until='domcontentloaded')
 page.wait_for_function("document.querySelector('.studio-stage canvas')?.width>0")
 page.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
 page.locator('.english-outfit-card').filter(has=page.locator('img[src*="female-operational"]')).get_by_role('button',name='แก้ไขด้วย AI',exact=True).click()
 page.locator('.studio-hair-panel').get_by_role('button',name='เลือกทรงผมหญิง ผมแสกกลาง',exact=True).click()
 page.get_by_role('button',name='ไม่แต่งหน้า',exact=True).click()
 page.locator('.english-inline-ai').get_by_role('button',name='สร้างภาพ',exact=True).click()
 page.wait_for_function('thaiAiCalls.length===1');call=page.evaluate('thaiAiCalls[0]');assert call['gender']=='female' and call['hair']=='seedream-14'
 results.append({'female':True,'call':call});page.close()
 page=browser.new_page(viewport={'width':1440,'height':1000});page.route('**/api/**',lambda r:r.abort())
 page.goto(BASE+'/scripts/fixtures/thai-ai-edit.html',wait_until='domcontentloaded')
 page.wait_for_function("document.querySelector('.studio-stage canvas')?.width>0");page.evaluate('thaiAiAllowed=false')
 page.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
 page.get_by_role('button',name='แก้ไขด้วย AI',exact=True).first.click()
 page.wait_for_function('thaiAiOffers===1');assert page.evaluate('thaiAiCalls.length')==0
 results.append({'exhausted':True,'newAiCalls':0});page.close()
 browser.close()
print(json.dumps(results,ensure_ascii=False))
