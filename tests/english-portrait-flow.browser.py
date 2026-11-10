import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.environ.get('SELECTION_BASE','http://127.0.0.1:5193')
Path('work').mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 errors=[]
 def page(width=1440):
  p=b.new_page(viewport={'width':width,'height':1000},is_mobile=width<640,has_touch=width<640)
  p.on('pageerror',lambda e:errors.append(str(e)))
  p.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base+'/') and '/api/' not in r.request.url else r.abort())
  p.goto(base+'/scripts/fixtures/english-portrait-flow.html?lang=en&fresh',wait_until='domcontentloaded')
  p.get_by_role('heading',name='Choose how to edit',exact=True).wait_for()
  p.wait_for_function('!!window.bodySnapshot?.current')
  return p
 def outfits(p):
  p.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
 def ai(p,card):
  card.hover()
  card.get_by_role('button',name='Edit with AI',exact=True).click()
  p.get_by_role('heading',name='Choose outfit & look').wait_for()
 p=page()
 assert p.evaluate('bodyCalls.length')==0
 p.get_by_role('button',name='AI outfit').click()
 p.locator('.english-flow-outfits button').first.click()
 p.get_by_role('button',name='Makeup',exact=True).click()
 p.locator('.english-flow-hair-grid button').nth(1).click()
 p.wait_for_function("document.querySelectorAll('.english-flow-hair-grid img')[1].naturalWidth>0")
 assert p.evaluate('bodyCalls.length')==0
 p.get_by_role('button',name='Create portrait',exact=True).click()
 p.wait_for_function('bodyCalls.some(c=>c.committed)')
 assert p.evaluate('bodyCalls.filter(c=>c.template).length')==1
 assert p.evaluate('bodyCalls[0].finish')=='makeup'
 assert p.evaluate('bodyCalls[0].hair')=='seedream-40'
 assert p.locator('.english-workflow-bar').count()==0
 outfits(p)
 card=p.locator('.english-outfit-card').filter(has=p.locator('img[src*="female-lapel-suit"]'))
 card.locator('button').first.click()
 p.wait_for_function("bodySnapshot.current().layers.some(l=>l.kind==='suit'&&l.visible!==false&&l.templatePath.endsWith('female-lapel-suit.png'))")
 assert p.locator('.english-flow-overlay').count()==0
 assert p.evaluate('bodyCalls.filter(c=>c.template).length')==1
 ai(p,card)
 assert p.locator('.english-flow-outfits button[aria-pressed=true] img').get_attribute('src').endswith('female-lapel-suit.png')
 p.locator('.english-flow-hair-grid button').nth(2).click()
 chosen=p.locator('.english-flow-hair-grid button[aria-pressed=true]').get_attribute('aria-label')
 p.get_by_role('button',name='Back to Studio').click()
 p.locator('.english-flow-overlay').wait_for(state='hidden')
 assert p.evaluate('bodyCalls.filter(c=>c.template).length')==1
 # Return without losing pending hair selection.
 ai(p,card)
 assert p.locator('.english-flow-hair-grid button[aria-pressed=true]').get_attribute('aria-label')==chosen
 assert p.locator('.english-flow-hair').evaluate('(e)=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}')
 p.screenshot(path='work/english-outfit-ai-hair.png',full_page=True)
 p.keyboard.press('Escape');p.locator('.english-flow-overlay').wait_for(state='hidden')
 # Hovering the original outfit and submitting identical choices reuses its AI result.
 original=p.locator('.english-outfit-card').first
 ai(p,original)
 p.locator('.english-flow-hair-grid button').nth(1).click()
 p.get_by_role('button',name='Create portrait',exact=True).click()
 p.locator('.english-flow-overlay').wait_for(state='hidden')
 assert p.evaluate('bodyCalls.filter(c=>c.template).length')==1
 assert not p.evaluate("bodySnapshot.current().layers.some(l=>l.kind==='suit'&&l.visible!==false)")
 p.screenshot(path='work/english-studio-outfit-hover.png',full_page=True)
 p.close()
 # Touch users get a visible AI action, alongside normal local placement.
 p=page(390)
 p.get_by_role('dialog').get_by_role('button',name='Edit manually').click()
 p.wait_for_function("bodySnapshot.current().layers.some(l=>l.kind==='source-photo')")
 assert p.evaluate('bodyCalls.length')==0
 assert p.locator('.english-workflow-bar').count()==0
 card=p.locator('.english-outfit-card').first
 card.locator('button').first.click()
 assert p.locator('.english-flow-overlay').count()==0
 card.get_by_role('button',name='Edit with AI',exact=True).click()
 p.get_by_role('heading',name='Choose outfit & look').wait_for()
 p.get_by_role('button',name='Men',exact=True).click()
 assert p.get_by_role('button',name='Create portrait',exact=True).is_disabled()
 p.locator('.english-flow-outfits button').first.click()
 assert p.evaluate('bodyCalls.length')==0
 p.get_by_role('button',name='Create portrait',exact=True).click()
 p.wait_for_function('bodyCalls.some(c=>c.committed)')
 assert p.evaluate('bodyCalls[0].mode')=='male'
 assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
 # Thai keeps its normal chooser; both Thai dialogs can return to Studio.
 thai=b.new_page()
 thai.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base+'/') and '/api/' not in r.request.url else r.abort())
 thai.goto(base+'/scripts/fixtures/english-portrait-flow.html?lang=th&fresh&standard',wait_until='domcontentloaded')
 thai.wait_for_function('!!window.bodySnapshot?.current')
 assert thai.locator('.english-outfit-ai,.english-flow-overlay').count()==0
 thai.locator('.studio-bottom-choices').get_by_role('button',name='ทรงผม',exact=True).click()
 thai.locator('.studio-catalog-grid button').filter(has=thai.locator('img')).first.click()
 thai.get_by_role('heading',name='กรุณาเลือกชนิดรูป').wait_for()
 thai.get_by_role('button',name='กลับ Studio').click()
 thai.get_by_role('heading',name='กรุณาเลือกชนิดรูป').wait_for(state='hidden')
 thai.locator('.studio-catalog-grid button').filter(has=thai.locator('img')).first.click()
 thai.get_by_role('button',name='รูปผู้หญิง').click()
 thai.get_by_role('heading',name='เลือกรูปแบบใบหน้า').wait_for()
 thai.get_by_role('button',name='กลับ Studio').click()
 assert thai.evaluate('bodyCalls.length')==0
 assert not errors,errors
 b.close()
 print(json.dumps({'passed':True,'checks':['AI and manual entry','local outfit placement without AI or popup','hover AI opens selected outfit and hair','dismiss preserves choices','identical AI output reused','no duplicate toolbar','mobile layout','Thai isolation']}))
