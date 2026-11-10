import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.environ.get('SELECTION_BASE','http://127.0.0.1:5193')
Path('work').mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 errors=[]
 def page(width=1440):
  p=b.new_page(viewport={'width':width,'height':1000})
  p.on('pageerror',lambda e:errors.append(str(e)))
  p.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base+'/') and '/api/' not in r.request.url else r.abort())
  p.goto(base+'/scripts/fixtures/english-portrait-flow.html?lang=en&fresh',wait_until='domcontentloaded')
  p.get_by_role('heading',name='Choose how to edit',exact=True).wait_for()
  p.wait_for_function('!!window.bodySnapshot?.current')
  return p
 p=page()
 assert p.evaluate('bodyCalls.length')==0
 p.screenshot(path='work/english-flow-choose.png',full_page=True)
 p.get_by_role('button',name='AI outfit').click()
 p.get_by_role('heading',name='Choose outfit & look').wait_for()
 outfits=p.locator('.english-flow-outfits button');outfits.nth(0).click()
 p.get_by_role('button',name='Makeup',exact=True).click()
 assert p.evaluate('bodyCalls.length')==0,'Selecting outfit or look must not generate'
 p.screenshot(path='work/english-flow-setup.png',full_page=True)
 p.get_by_role('button',name='Create portrait',exact=True).click()
 p.wait_for_function('bodyCalls.some(c=>c.committed)')
 assert p.evaluate('bodyCalls.filter(c=>c.template).length')==1
 assert p.evaluate('bodyCalls[0].finish')=='makeup'
 # Changing outfits after an AI result also waits for explicit confirmation.
 p.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
 card=p.locator('.studio-catalog-grid button').filter(has=p.locator('img[src*="female-lapel-suit"]'))
 card.scroll_into_view_if_needed();card.click()
 p.get_by_role('heading',name='Choose outfit & look').wait_for()
 assert p.evaluate('bodyCalls.filter(c=>c.template).length')==1
 p.get_by_role('button',name='Change editing method').click()
 p.get_by_role('dialog').get_by_role('button',name='Edit manually').click()

 p.get_by_role('heading',name='Choose outfit & look').wait_for(state='hidden')
 assert p.evaluate('bodyCalls.filter(c=>c.template).length')==1
 manual_card=p.locator('.studio-catalog-grid button').filter(has=p.locator('img')).last
 manual_card.scroll_into_view_if_needed();manual_card.click()
 p.wait_for_function("bodySnapshot.current().layers.some(l=>l.kind==='suit'&&l.visible!==false)")
 assert p.locator('.english-flow-overlay').count()==0
 assert p.evaluate('bodyCalls.filter(c=>c.template).length')==1
 p.close()
 # Manual entry inserts the original into Studio with no AI request.
 p=page(390)
 assert p.locator('.english-route-preview').count()==2
 assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
 p.screenshot(path='work/english-flow-choose-mobile.png',full_page=True)
 p.get_by_role('dialog').get_by_role('button',name='Edit manually').click()
 p.wait_for_function("bodySnapshot.current().layers.some(l=>l.kind==='source-photo')")
 assert p.evaluate('bodyCalls.length')==0
 assert p.evaluate("bodySnapshot.current().layers.some(l=>l.kind==='suit'&&l.visible!==false)")
 assert p.locator('.english-flow-overlay').count()==0
 p.screenshot(path='work/english-flow-manual-mobile.png',full_page=True)
 assert p.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Mobile page overflows'
 p.locator('.english-workflow-bar').get_by_role('button',name='Create with AI').click()
 p.get_by_role('button',name='Men',exact=True).click()
 assert p.get_by_role('button',name='Create portrait',exact=True).is_disabled()
 p.locator('.english-flow-outfits button').first.click()
 assert p.evaluate('bodyCalls.length')==0
 p.screenshot(path='work/english-flow-setup-mobile.png',full_page=True)
 p.get_by_role('button',name='Create portrait',exact=True).click()
 p.wait_for_function('bodyCalls.some(c=>c.committed)')
 assert p.evaluate('bodyCalls[0].mode')=='male'
 assert p.evaluate('bodyCalls[0].finish')=='natural'
 # Thai keeps its original Easy Mode and does not get English workflow controls.
 thai=b.new_page()
 thai.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base+'/') and '/api/' not in r.request.url else r.abort())
 thai.goto(base+'/scripts/fixtures/english-portrait-flow.html?lang=th&fresh',wait_until='domcontentloaded')
 thai.wait_for_selector('.easy-mode')
 assert thai.locator('.english-flow-overlay,.english-workflow-bar').count()==0
 assert not errors,errors
 b.close()
 print(json.dumps({'passed':True,'checks':['AI explicit submit only','selected finish reaches processing','manual retains upload with zero AI','manual to AI','male defaults natural','mobile layout','no browser errors']}))
