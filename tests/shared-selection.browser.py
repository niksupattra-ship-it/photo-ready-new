"""One real selection component/state machine across locales, entry modes and screen sizes.
All generation callbacks are inert; no paid provider or customer records are touched.
"""
import os,json
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('THAI_AI_BASE','http://127.0.0.1:5194')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [390,1440]:
  for easy in [False,True]:
   for female in [False,True]:
    for english in [False,True]:
     page=browser.new_page(viewport={'width':width,'height':1000},has_touch=width<600)
     errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
     page.route('**/api/**',lambda r:r.abort())
     query=f'?fresh=1&easy={int(easy)}&female={int(female)}&lang={"en" if english else "th"}'
     page.goto(BASE+'/scripts/fixtures/thai-ai-edit.html'+query,wait_until='domcontentloaded')
     flow=page.locator('.english-flow');expect(flow).to_be_visible()
     route='Create with AI' if english else 'สร้างด้วย AI'
     flow.get_by_role('button',name=route,exact=True).click()
     expect(flow.locator('.english-flow-outfits button').first).to_be_visible()
     assert flow.locator('.english-flow-hair').count()==0
     assert flow.locator('fieldset').count()==(2 if female else 1)
     flow.locator('.english-flow-outfits button').first.click()
     if female:flow.get_by_role('button',name='Makeup' if english else 'แต่งหน้า',exact=True).click()
     assert page.evaluate('thaiAiCalls.length')==0
     flow.get_by_role('button',name='Create portrait' if english else 'สร้างรูป',exact=True).click()
     page.wait_for_function('thaiAiCalls.length===1')
     call=page.evaluate('thaiAiCalls[0]')
     assert call['gender']==('female' if female else 'male')
     assert call['finish']==('makeup' if female else 'natural')
     assert call['hair']==''
     assert call['options']['thaiOutfitAi']==(not english)
     assert not errors,errors
     print(json.dumps({'width':width,'easy':easy,'female':female,'english':english,'oneExplicitRequest':True}),flush=True)
     page.close()
 # Manual route and back preserve the draft, without generation.
 for english in [False,True]:
  page=browser.new_page(viewport={'width':1440,'height':1000});page.route('**/api/**',lambda r:r.abort())
  page.goto(BASE+'/scripts/fixtures/thai-ai-edit.html?fresh=1&female=1&lang='+('en' if english else 'th'))
  flow=page.locator('.english-flow')
  flow.get_by_role('button',name='Create with AI' if english else 'สร้างด้วย AI',exact=True).click()
  flow.locator('.english-flow-outfits button').first.click()
  flow.get_by_role('button',name='← Change editing method' if english else '← เปลี่ยนวิธีแก้ไข',exact=True).click()
  flow.get_by_role('button',name='Edit manually' if english else 'แก้ไขเอง',exact=True).click()
  expect(flow).to_have_count(0)
  assert page.evaluate('thaiAiCalls.length')==0
  page.close()
 # Replacing a Studio source reselects photo type, then opens the same method chooser.
 for english in [False,True]:
  page=browser.new_page(viewport={'width':390,'height':1000},has_touch=True);page.route('**/api/**',lambda r:r.abort())
  page.goto(BASE+'/scripts/fixtures/thai-ai-edit.html?lang='+('en' if english else 'th'))
  page.wait_for_function("document.querySelector('.studio-stage canvas')?.width>0")
  page.on('dialog',lambda dialog:dialog.accept())
  photo=page.evaluate("async()=>Array.from(new Uint8Array(await (await fetch('/assets/seedream-hairstyles/previews/14.webp')).arrayBuffer()))")
  page.locator('input[type=file][accept*=image]').set_input_files({'name':'replacement.webp','mimeType':'image/webp','buffer':bytes(photo)})
  page.locator('.paid-work-warning-proceed').click()
  page.get_by_role('button',name='Women' if english else 'รูปผู้หญิง',exact=True).click()
  expect(page.locator('.english-flow-routes')).to_be_visible()
  assert page.evaluate('thaiAiCalls.length')==0
  page.close()
 browser.close()
