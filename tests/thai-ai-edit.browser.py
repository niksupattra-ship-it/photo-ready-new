"""Studio repeat edits retain Thai rights while following the English selection order."""
import os,json
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('THAI_AI_BASE','http://127.0.0.1:5194')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [390,1440]:
  for female in [False,True]:
   page=browser.new_page(viewport={'width':width,'height':1000},has_touch=width<600)
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('**/api/**',lambda r:r.abort())
   page.goto(BASE+'/scripts/fixtures/thai-ai-edit.html?female='+str(int(female)))
   page.wait_for_function("document.querySelector('.studio-stage canvas')?.width>0")
   page.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
   card=page.locator('.english-outfit-card').filter(has=page.locator('img[src*="'+('female-operational' if female else 'male-job-blue-navy-tie')+'"]'))
   card.get_by_role('button',name='แก้ไขด้วย AI',exact=True).click()
   if female:
    page.locator('.studio-hair-panel').get_by_role('button',name='เลือกทรงผมหญิง ผมแสกกลาง',exact=True).click()
    page.get_by_role('button',name='ไม่แต่งหน้า',exact=True).click()
   create=page.locator('.english-inline-ai').get_by_role('button',name='สร้างภาพ',exact=True)
   expect(create).to_be_visible()
   assert page.evaluate('thaiAiCalls.length')==0
   create.click();page.wait_for_function('thaiAiCalls.length===1')
   call=page.evaluate('thaiAiCalls[0]');assert call['options']['thaiOutfitAi'] is True
   assert call['gender']==('female' if female else 'male')
   if female:assert call['hair']=='seedream-14'
   assert not errors,errors
   print(json.dumps({'width':width,'female':female,'oneExplicitRequest':True}),flush=True);page.close()
 for fresh in [False,True]:
  page=browser.new_page(viewport={'width':1440,'height':1000});page.route('**/api/**',lambda r:r.abort())
  page.goto(BASE+'/scripts/fixtures/thai-ai-edit.html?fresh='+str(int(fresh)))
  page.wait_for_function("document.querySelector('.studio-stage canvas')?.width>0");page.evaluate('thaiAiAllowed=false')
  if fresh:
   flow=page.locator('.english-flow');flow.get_by_role('button',name='สร้างด้วย AI',exact=True).click()
   flow.locator('.english-flow-outfits button').first.click();flow.get_by_role('button',name='สร้างรูป',exact=True).click()
  else:
   page.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
   page.get_by_role('button',name='แก้ไขด้วย AI',exact=True).first.click()
  page.wait_for_function('thaiAiOffers===1');assert page.evaluate('thaiAiCalls.length')==0;page.close()
 browser.close()
