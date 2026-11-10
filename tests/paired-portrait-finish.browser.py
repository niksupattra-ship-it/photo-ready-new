import os,json
from playwright.sync_api import sync_playwright
base=os.environ.get('SELECTION_BASE','http://127.0.0.1:5193')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for lang in ['th','en']:
  for width in [1440,390]:
   p=b.new_page(viewport={'width':width,'height':1000},is_mobile=width<640,has_touch=width<640);errors=[]
   p.on('pageerror',lambda e:errors.append(str(e)))
   p.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base+'/') and '/api/' not in r.request.url else r.abort())
   p.goto(base+'/scripts/fixtures/paired-portrait-finish.html?lang='+lang,wait_until='domcontentloaded')
   p.wait_for_function('!!pairedSnapshot.current')
   # This restored project deliberately has no original upload or App generation cache.
   p.locator('.studio-bottom-choices').get_by_role('button',name='Makeup' if lang=='en' else 'เมคอัพ',exact=True).click()
   choices=p.locator('.studio-original-makeup-choices button');assert choices.count()==2
   before=p.evaluate("JSON.stringify(pairedSnapshot.current().layers.find(l=>l.kind==='head').sourceFrame)")
   for selected in [0,0,1,0,1]:
    choices.nth(selected).click()
    expected='makeup' if selected==0 else 'natural'
    p.wait_for_function("finish=>pairedSnapshot.current().layers.find(l=>l.kind==='head').femaleEyeStyle===finish",arg=expected)
    p.wait_for_function("finish=>pairedSnapshot.current().layers.find(l=>l.kind==='head').source===pairedSources[finish]",arg=expected)
    assert choices.nth(selected).get_attribute('aria-pressed')=='true'
    assert p.evaluate('pairedCalls.ai')==0
    pose=p.evaluate("()=>{const h=pairedSnapshot.current().layers.find(l=>l.kind==='head');return [h.x,h.y,h.scale,h.rotation,JSON.stringify(h.sourceFrame),h.jobId]}")
    assert pose==[17,12,.85,2,before,'paired-fixture'],pose
   assert not errors,errors
   p.close()
 b.close()
 print(json.dumps({'passed':True,'checks':['Thai and English','desktop and mobile','restored project without upload','repeated exact pair switching','same selection can be restored','no AI or credit calls','placement unchanged']}))
