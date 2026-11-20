"""Restored Thai offers and workflow; callbacks are inert and no real payment/AI is used."""
import os,json
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('THAI_AI_BASE','http://127.0.0.1:5196')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [390,1440]:
  page=browser.new_page(viewport={'width':width,'height':1000},has_touch=width<600)
  page.route('**/api/**',lambda r:r.abort());page.goto(BASE+'/scripts/fixtures/thai-ai-edit.html?offers=1')
  expect(page.get_by_role('radio',name='โปร 89 บาท',exact=True)).to_be_visible()
  expect(page.get_by_role('radio',name='โปร 159 บาท',exact=True)).to_be_visible()
  expect(page.get_by_text('เลือกชุด 3 ชุด',exact=True)).to_be_visible()
  expect(page.get_by_text('เลือกชุด 5 ชุด',exact=True)).to_be_visible()
  assert 'AI 10 ครั้ง' not in page.locator('body').inner_text()
  page.get_by_role('button',name='เลือกโปร 159 บาท',exact=True).click()
  assert page.evaluate('thaiCheckout')==['159'];page.close()
  page=browser.new_page(viewport={'width':width,'height':1000},has_touch=width<600)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('**/api/**',lambda r:r.abort())
  page.goto(BASE+'/scripts/fixtures/thai-ai-edit.html?easy=1&fresh=1&female=1')
  page.evaluate('thaiAiAllowed=false') # the removed daily-access hook cannot block the restored workflow
  easy=page.locator('.easy-mode');easy.get_by_role('button',name='รูปผู้หญิง',exact=True).click()
  easy.get_by_role('button',name='แต่งหน้า',exact=True).click()
  easy.get_by_role('button',name='เลือกผมแสกกลาง',exact=True).click()
  easy.get_by_role('button',name='ถัดไป',exact=True).click()
  easy.locator('.easy-suit-category-grid').get_by_role('button',name='ข้าราชการ',exact=True).click()
  easy.locator('.easy-suit-grid').get_by_role('button',name='ข้าราชการหญิง',exact=True).click()
  assert page.evaluate('thaiAiCalls.length')==0
  expect(easy.get_by_role('button',name='แก้ไขด้วย AI',exact=True)).to_have_count(0)
  easy.get_by_role('button',name='ถัดไป',exact=True).click()
  easy.get_by_role('button',name='สร้างรูป',exact=True).click()
  page.wait_for_function('thaiAiCalls.length===1');call=page.evaluate('thaiAiCalls[0]')
  assert call['finish']=='makeup' and call['hair']=='seedream-14'
  assert not call['options'].get('thaiOutfitAi') and page.evaluate('thaiAiOffers')==0
  assert not errors,errors;page.close()
  page=browser.new_page(viewport={'width':width,'height':1000},has_touch=width<600);page.route('**/api/**',lambda r:r.abort())
  page.goto(BASE+'/scripts/fixtures/thai-ai-edit.html?female=1')
  page.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
  page.locator('button').filter(has=page.locator('img[src*="female-operational"]')).first.click()
  expect(page.get_by_role('button',name='แก้ไขด้วย AI',exact=True)).to_have_count(0)
  assert page.evaluate('thaiAiCalls.length')==0
  assert 'วันละ 2 ครั้ง' not in page.locator('body').inner_text();page.close()
  print(json.dumps({'width':width,'originalOffers':True,'originalEasyWorkflow':True,'nativeStudioSuits':True,'noDailyAiGate':True}),flush=True)
 browser.close()
