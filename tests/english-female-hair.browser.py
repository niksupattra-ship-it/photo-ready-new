"""Exercise the replacement English choices with inert AI; Thai keeps its choices."""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE=os.environ.get('SELECTION_BASE','http://127.0.0.1:5173')
OUT=Path(os.environ.get('SELECTION_OUTPUT','/tmp/english-female-hair'))
OUT.mkdir(parents=True,exist_ok=True)
results=[]
def check_photo_actions(page):
 actions=page.locator('.english-photo-actions .english-inline-ai')
 actions.wait_for()
 assert page.locator('.studio-picker-drawer .english-inline-ai').count()==0
 photo=page.locator('.studio-stage canvas').bounding_box()
 box=actions.bounding_box()
 assert box['x']>=photo['x']-1 and box['y']>=photo['y']-1
 assert box['x']+box['width']<=photo['x']+photo['width']+1
 assert box['y']+box['height']<=photo['y']+photo['height']+1
 for selector in ['.studio-picker-drawer','nav.studio-tools']:
  blocked=page.locator(selector).bounding_box()
  if blocked and blocked['x']<box['x']+box['width'] and blocked['x']+blocked['width']>box['x'] and blocked['y']>box['y']:
   assert box['y']+box['height']<=blocked['y'],'Actions cover editor controls'
 for label in ['Create','Cancel']:
  button=actions.get_by_role('button',name=label,exact=True)
  assert button.is_enabled()
  assert button.evaluate('(button)=>{const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}'),label+' is covered'
 return actions
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
   choice_count=choices.count()
   if lang=='en':
    previous=page.evaluate('JSON.stringify(bodySnapshot.current().layers)')
    photo_pixels=page.locator('.studio-stage canvas').evaluate('(canvas)=>canvas.toDataURL()')
    submitted=page.evaluate('bodyCalls.length')
    names=choices.evaluate_all('(buttons)=>buttons.map(b=>b.getAttribute("aria-label"))')
    for index,name in enumerate(names):
     choice=page.get_by_role('button',name=name,exact=True)
     choice.click()
     check_photo_actions(page)
     assert choice.get_attribute('aria-pressed')=='true'
     image=choice.locator('img')
     image.wait_for()
     assert '/previews/'+str(44+index)+'.webp' in image.get_attribute('src')
     image.evaluate('(img)=>img.decode()')
     assert image.evaluate('(img)=>img.naturalWidth')==400
    assert page.evaluate('bodyCalls.length')==submitted,'Selecting references must not start a paid generation'
    assert page.locator('.studio-stage canvas').evaluate('(canvas)=>canvas.toDataURL()')==photo_pixels,'Controls never enter exported photo pixels'
    page.screenshot(path=str(OUT/('pending-'+str(width)+'.png')))
    page.locator('.english-inline-ai').get_by_role('button',name='Cancel',exact=True).click()
    assert page.evaluate('JSON.stringify(bodySnapshot.current().layers)')==previous,'Cancel preserves the current portrait'
    assert page.locator('.english-photo-actions').count()==0
    page.get_by_role('button',name=names[0],exact=True).click()
    actions=check_photo_actions(page)
    # Mouse wheel zoom must keep the controls on the visible photo.
    stage=page.locator('.studio-stage').bounding_box()
    page.mouse.move(stage['x']+stage['width']/2,stage['y']+60)
    page.mouse.wheel(0,-90)
    page.wait_for_timeout(250)
    actions=check_photo_actions(page)
    create=actions.get_by_role('button',name='Create',exact=True)
    if width>600:create.click()
    else:create.tap()
    page.wait_for_function('(count)=>bodyCalls.filter(c=>c.committed).length===count',arg=2)
    assert page.evaluate('bodyCalls.length')==submitted+2,'One Create starts one generation and one commit'
    assert page.evaluate('bodyCalls.findLast(c=>!c.committed).hair')=='seedream-44'
    assert page.locator('.english-photo-actions').count()==0
    if width>600:
     if not page.locator('.studio-hair-panel').is_visible():page.locator('.studio-bottom-choices').get_by_role('button',name='ทรงผม',exact=True).click()
     page.get_by_role('button',name=names[1],exact=True).click()
     check_photo_actions(page).get_by_role('button',name='Create',exact=True).focus()
     page.keyboard.press('Enter')
     page.wait_for_function('bodyCalls.filter(c=>c.committed).length===3')
     assert page.evaluate('bodyCalls.findLast(c=>!c.committed).hair')=='seedream-45'
   else:
    assert page.locator('.studio-hair-face-preview img[src*="/previews/44.webp"]').count()==0
    assert choices.first.get_attribute('aria-label')=='เลือกทรงผมหญิง ทรงผมหญิง 1'
   assert not errors,errors
   page.screenshot(path=str(OUT/(lang+'-'+str(width)+'.png')))
   results.append({'language':lang,'width':width,'femaleChoices':choice_count,'ok':True})
   page.close()
 browser.close()
(OUT/'results.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
