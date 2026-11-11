"""English: selecting a pattern overlays its native PNG; AI editing stays explicit."""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('SELECTION_BASE','http://127.0.0.1:5173')
OUT=Path(os.environ.get('SELECTION_OUTPUT','/tmp/english-template-selection'))
OUT.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [1440,390]:
  page=browser.new_page(viewport={'width':width,'height':1000 if width>600 else 844},has_touch=width<600)
  page.set_default_timeout(25000)
  errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.route('**/*',lambda route:route.continue_() if route.request.url.startswith(BASE+'/')and'/api/' not in route.request.url else route.abort())
  try:
   page.goto(BASE+'/scripts/fixtures/english-portrait-flow.html?lang=en&fresh&stretch',wait_until='domcontentloaded')
   page.get_by_role('heading',name='Choose how to edit',exact=True).wait_for()
   page.get_by_role('button',name='Create with AI').click()
   page.locator('.english-flow-outfits button').first.click()
   page.get_by_role('button',name='Makeup',exact=True).click()
   page.locator('.english-flow-hair-grid button').nth(2).click()
   page.get_by_role('button',name='Create portrait',exact=True).click()
   page.wait_for_function('bodyCalls.some(c=>c.committed)')
   assert page.evaluate("bodySnapshot.current().layers.find(l=>l.kind==='head').portraitComposition")=='en-outfit-body-v1'
   assert page.evaluate("bodySnapshot.current().layers.filter(l=>l.kind==='suit'&&l.visible!==false).length")==0
   assert page.evaluate('bodyCalls.filter(c=>c.committed).length')==1
   # Tapping the picture must place a visible, native-aspect PNG in Studio.
   page.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
   card=page.locator('.english-outfit-card').filter(has=page.locator('img[src*="female-job-navy-notch-white-shirt"]'))
   card.locator('button').first.click()
   page.wait_for_function("bodySnapshot.current().layers.some(l=>l.kind==='suit'&&l.visible!==false&&l.templatePath?.includes('female-job-navy-notch-white-shirt'))")
   assert page.locator('.english-inline-ai').count()==0,'Outfit thumbnail must not open AI flow'
   assert page.evaluate('bodyCalls.filter(c=>c.committed).length')==1,'A PNG selection must not regenerate the face'
   first=page.evaluate("()=>{const ls=bodySnapshot.current().layers;const s=ls.find(l=>l.kind==='suit');const h=ls.find(l=>l.kind==='head');return {frame:s.sourceFrame,headFrame:h.sourceFrame,templatePath:s.templatePath,visible:s.visible,maskPresent:Boolean(h.englishNeckClipMask)}}")
   assert first['frame']['w']>0 and first['frame']['h']>0
   # Switching outfit changes the PNG, not the already completed head.
   search=page.locator('.uniform-search-field input')
   search.fill('ivory bow')
   next_card=page.locator('.english-outfit-card').filter(has=page.locator('img[src*="female-job-ivory-bow-blouse"]'))
   next_card.locator('button').first.click()
   page.wait_for_function("bodySnapshot.current().layers.some(l=>l.kind==='suit'&&l.visible!==false&&l.templatePath?.includes('female-job-ivory-bow-blouse'))")
   second=page.evaluate("()=>{const ls=bodySnapshot.current().layers;const s=ls.find(l=>l.kind==='suit');const h=ls.find(l=>l.kind==='head');return {frame:s.sourceFrame,headFrame:h.sourceFrame,templatePath:s.templatePath,visible:s.visible,maskPresent:Boolean(h.englishNeckClipMask)}}")
   assert second['headFrame']==first['headFrame'],'Selecting a native garment must not resize or move the generated head'
   assert page.evaluate('bodyCalls.filter(c=>c.committed).length')==1
   assert second['templatePath']!=first['templatePath'],'The selected pattern should change'
   assert page.evaluate("""async()=>{const suit=bodySnapshot.current().layers.find(l=>l.kind==='suit');const img=new Image();img.src=suit.templatePath;await img.decode();return Math.abs(suit.sourceFrame.w/suit.sourceFrame.h-img.naturalWidth/img.naturalHeight)<.00001}"""),'Pattern should keep native aspect ratio'
   # Only the explicit AI button may regenerate the complete portrait.
   next_card.get_by_role('button',name='Edit with AI').click()
   page.locator('.english-inline-ai').wait_for()
   page.get_by_role('button',name='Create portrait',exact=True).click()
   page.wait_for_function('bodyCalls.filter(c=>c.committed).length===2')
   assert page.evaluate("bodySnapshot.current().layers.filter(l=>l.kind==='suit'&&l.visible!==false).length")==0
   assert not errors,errors
   page.screenshot(path=str(OUT/(str(width)+'.png')),full_page=True)
   results.append({'width':width,'passed':True,'thumbnailPlacesNativeOverlay':True,'noImplicitAi':True,'sameHeadFrame':True,'explicitAiStillAvailable':True})
   print(json.dumps(results[-1]),flush=True)
  finally:page.close()
 page=browser.new_page()
 page.route('**/*',lambda route:route.continue_() if route.request.url.startswith(BASE+'/')and'/api/' not in route.request.url else route.abort())
 page.goto(BASE+'/scripts/fixtures/english-portrait-flow.html?lang=th&fresh&standard',wait_until='domcontentloaded')
 page.wait_for_function('!!window.bodySnapshot?.current')
 assert page.locator('.english-outfit-ai,.english-inline-ai').count()==0
 assert page.evaluate('bodyCalls.length')==0
 page.close()
 browser.close()
(OUT/'results.json').write_text(json.dumps(results,indent=2))
