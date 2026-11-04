"""New transparent paint layers, explicit retargeting and undo/redo in real Studio.
Local fixtures only. Every external/service request is blocked.
"""
import json,os,pathlib
from playwright.sync_api import sync_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parent.parent;BASE=os.environ.get('SELECTION_BASE','http://127.0.0.1:5192');OUT=ROOT/'work/paint-layer';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright()as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);results=[]
 for width,height in [(1440,1000),(390,844)]:
  ctx=b.new_context(viewport={'width':width,'height':height},has_touch=width<600);p=ctx.new_page();p.set_default_timeout(20000);errors=[];api=[]
  p.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   if not r.request.url.startswith(BASE+'/'):r.abort();return
   if '/api/'in r.request.url:api.append(r.request.url);r.abort();return
   r.continue_()
  p.route('**/*',route);p.goto(BASE+'/scripts/fixtures/selection-response.html',wait_until='domcontentloaded');p.wait_for_function('!!window.selectionSnapshot?.current');p.wait_for_function("!document.querySelector('.studio-bottom-choices button')?.disabled")
  def layers():return p.evaluate('selectionSnapshot.current().layers.map(l=>({id:l.id,kind:l.kind,source:l.source,jobId:l.jobId}))')
  original=layers()
  if width>600:
   order=p.locator('.studio-tools>button').evaluate_all('buttons=>buttons.map(b=>b.getAttribute("aria-label"))')
   assert order[:2]==['ย้าย','ปรับคอเสื้อ'],order
  def select_paint():
   if width<600:p.get_by_role('button',name='เปิดเครื่องมือ',exact=True).click()
   p.locator('.studio-tools').get_by_role('button',name='บรัชระบายสี',exact=True).click()
  select_paint();p.wait_for_function("selectionSnapshot.current().layers.filter(l=>l.kind==='paint').length===1")
  fresh=layers();paint=next(l for l in fresh if l['kind']=='paint');assert len(fresh)==len(original)+1
  for layer in original:assert next(l for l in fresh if l['id']==layer['id'])['source']==layer['source']
  transparent=p.evaluate('''async source=>{const im=new Image();im.src=source;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);const d=x.getImageData(0,0,c.width,c.height).data;for(let i=3;i<d.length;i+=4)if(d[i])return false;return true}''',paint['source']);assert transparent
  def stroke(y):
   box=p.locator('.studio-stage canvas').bounding_box();p.mouse.move(box['x']+box['width']*.3,box['y']+box['height']*y);p.mouse.down();p.mouse.move(box['x']+box['width']*.5,box['y']+box['height']*y,steps=8);p.mouse.up()
  stroke(.2);p.wait_for_function('([id,before])=>selectionSnapshot.current().layers.find(l=>l.id===id).source!==before',arg=[paint['id'],paint['source']])
  painted=layers()
  for layer in original:assert next(l for l in painted if l['id']==layer['id'])['source']==layer['source'],'Painting leaked to an original layer'
  painted_source=next(l for l in painted if l['id']==paint['id'])['source']
  if width>600:p.get_by_role('button',name='เลเยอร์',exact=True).click()
  else:p.get_by_role('button',name='เลือกเลเยอร์',exact=True).click()
  p.locator('.studio-layers .studio-layer-name').filter(has_text='หัว · คอ · ผม').click()
  head=next(l for l in original if l['kind']=='head');stroke(.32)
  p.wait_for_function('([id,before])=>selectionSnapshot.current().layers.find(l=>l.id===id).source!==before',arg=[head['id'],head['source']])
  changed=layers();assert len(changed)==len(fresh);assert next(l for l in changed if l['id']==paint['id'])['source']==painted_source
  assert next(l for l in changed if l['id']==head['id'])['jobId']=='fixture'
  controls=p.locator('.studio-touch-history'if width<600 else'.studio-design-history')
  controls.get_by_role('button',name='ย้อนกลับ',exact=True).click();p.wait_for_function('([id,expected])=>selectionSnapshot.current().layers.find(l=>l.id===id).source===expected',arg=[head['id'],head['source']])
  controls.get_by_role('button',name='ทำซ้ำ',exact=True).click();p.wait_for_function('([id,expected])=>selectionSnapshot.current().layers.find(l=>l.id===id).source===expected',arg=[head['id'],next(l for l in changed if l['id']==head['id'])['source']])
  select_paint();p.wait_for_function("selectionSnapshot.current().layers.filter(l=>l.kind==='paint').length===2")
  valid=p.evaluate('''async()=>{const {makeSavedProject,validateSavedProject}=await import('/src/saved-project.js');const snapshot=selectionSnapshot.current(),project=await makeSavedProject(snapshot);validateSavedProject(JSON.parse(JSON.stringify(project)));return project.layers.filter(l=>l.kind==='paint').length===2}''');assert valid
  p.screenshot(path=str(OUT/f'paint-{width}.png'));assert not errors,errors;assert not api,api
  results.append({'width':width,'newTransparentLayer':True,'oldLayersPreserved':True,'retargetExistingLayer':True,'undoRedo':True,'secondActivationNewLayer':True,'savedProjectValid':True,'neckAfterMove':width>600});ctx.close()
 b.close()
(OUT/'browser-results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
