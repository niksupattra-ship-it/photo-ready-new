"""Exercise the replacement English choices with inert AI; Thai keeps its choices."""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE=os.environ.get('SELECTION_BASE','http://127.0.0.1:5173')
OUT=Path(os.environ.get('SELECTION_OUTPUT','/tmp/english-female-hair'))
OUT.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for lang in ['en','th']:
  for width in [1440,390]:
   page=browser.new_page(viewport={'width':width,'height':1000 if width>600 else 844},has_touch=width<600)
   page.set_default_timeout(20000)
   errors=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   page.route('**/*',lambda route:route.continue_() if route.request.url.startswith(BASE+'/') and '/api/' not in route.request.url else route.abort())
   suffix='&fresh&stretch' if lang=='en' else '&standard'
   page.goto(BASE+'/scripts/fixtures/english-portrait-flow.html?lang='+lang+suffix,wait_until='domcontentloaded')
   if lang=='en':
    page.get_by_role('button',name='Create with AI',exact=True).click()
    page.locator('.english-flow-outfits button').first.click()
    page.get_by_role('button',name='Create portrait',exact=True).click()
    page.wait_for_function('bodyCalls.some(c=>c.committed)')
   hair=page.locator('.studio-bottom-choices').get_by_role('button',name='ทรงผม',exact=True)
   hair.click()
   page.locator('.studio-hair-gender button').nth(1).click()
   assert page.locator('button[aria-label^="เลือกทรงผมชาย "]').count()==4,'Male fixture choices remain intact'
   page.locator('.studio-hair-gender button').first.click()
   choices=page.locator('button[aria-label^="เลือกทรงผมหญิง "]')
   assert choices.count()==(10 if lang=='en' else 4)
   if lang=='en':
    previous=page.evaluate('JSON.stringify(bodySnapshot.current().layers)')
    submitted=page.evaluate('bodyCalls.length')
    names=choices.evaluate_all('(buttons)=>buttons.map(b=>b.getAttribute("aria-label"))')
    for index,name in enumerate(names):
     choice=page.get_by_role('button',name=name,exact=True)
     choice.click()
     page.locator('.english-inline-ai').wait_for()
     assert choice.get_attribute('aria-pressed')=='true'
     image=choice.locator('img')
     image.wait_for()
     assert '/previews/'+str(44+index)+'.webp' in image.get_attribute('src')
     image.evaluate('(img)=>img.decode()')
     assert image.evaluate('(img)=>img.naturalWidth')==400
    assert page.evaluate('bodyCalls.length')==submitted,'Selecting references must not start a paid generation'
    page.locator('.english-inline-ai').get_by_role('button',name='Cancel',exact=True).click()
    assert page.evaluate('JSON.stringify(bodySnapshot.current().layers)')==previous,'Cancel preserves the current portrait'
   else:
    assert page.locator('.studio-hair-face-preview img[src*="/previews/44.webp"]').count()==0
    assert choices.first.get_attribute('aria-label')=='เลือกทรงผมหญิง ทรงผมหญิง 1'
   assert not errors,errors
   page.screenshot(path=str(OUT/(lang+'-'+str(width)+'.png')))
   results.append({'language':lang,'width':width,'femaleChoices':choices.count(),'ok':True})
   page.close()
 browser.close()
(OUT/'results.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
