import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.environ.get('SELECTION_BASE','http://127.0.0.1:5193')
Path('work').mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 errors=[]
 def page(width=1440,fresh=True):
  p=b.new_page(viewport={'width':width,'height':1000},is_mobile=width<640,has_touch=width<640)
  p.on('pageerror',lambda e:errors.append(str(e)))
  p.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base+'/') and '/api/' not in r.request.url else r.abort())
  p.goto(base+'/scripts/fixtures/english-portrait-flow.html?lang=en'+('&fresh&stretch' if fresh else '&standard&stale'),wait_until='domcontentloaded')
  if fresh:p.get_by_role('heading',name='Choose how to edit',exact=True).wait_for()
  p.wait_for_function('!!window.bodySnapshot?.current')
  return p
 def ai(p,card):
  card.hover();card.get_by_role('button',name='Edit with AI',exact=True).click()
  p.locator('.english-inline-ai').wait_for()
  assert p.locator('.english-flow-overlay').count()==0
 p=page()
 p.get_by_role('button',name='Create with AI').click()
 p.locator('.english-flow-outfits button').first.click()
 p.get_by_role('button',name='Makeup',exact=True).click()
 p.locator('.english-flow-hair-grid button').nth(1).click()
 assert p.evaluate('bodyCalls.length')==0
 p.get_by_role('button',name='Create portrait',exact=True).click()
 p.wait_for_function('bodyCalls.some(c=>c.committed)')
 assert p.evaluate('bodyCalls[0].hair')=='seedream-40'
 assert p.locator('.english-workflow-bar').count()==0
 p.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
 card=p.locator('.english-outfit-card').filter(has=p.locator('img[src*="female-job-navy-notch-white-shirt"]'))
 card.locator('button').first.click()
 p.wait_for_function("bodySnapshot.current().layers.some(l=>l.kind==='suit'&&l.visible!==false&&l.templatePath.endsWith('female-job-navy-notch-white-shirt.png'))")
 dimensions=p.evaluate('''async()=>{const s=bodySnapshot.current().layers.find(l=>l.kind==='suit');const im=await (await import('/src/studio-image-cache.js')).decodedStudioImage(s.source);const c=Object.assign(document.createElement('canvas'),{width:im.width,height:im.height}),ctx=c.getContext('2d');ctx.drawImage(im,0,0);const {measureUniformAnchors}=await import('/src/portrait-uniform-fit.js'),anchor=measureUniformAnchors(ctx.getImageData(0,0,c.width,c.height).data,c.width,c.height);return {frame:s.sourceFrame,collarSceneY:s.sourceFrame.y+anchor.collarTopY*s.sourceFrame.h/im.height,ratio:im.width/im.height,sx:s.squeezeX,sy:s.squeezeY,scale:s.scale,x:s.x,y:s.y,rotation:s.rotation,version:s.manualOutfitFitVersion}}''')
 assert abs(dimensions['frame']['w']/dimensions['frame']['h']-dimensions['ratio'])<1e-9
 assert abs(dimensions['collarSceneY']-600)<1,dimensions  # Transparent PNG padding is not the visible collar.
 assert dimensions['sx']==1 and dimensions['sy']==1
 assert dimensions['scale']==1 and dimensions['x']==0 and dimensions['y']==0 and dimensions['rotation']==0
 p.screenshot(path='work/english-manual-outfit-fixed.png',full_page=True)

 assert p.locator('.english-flow-overlay').count()==0
 ai(p,card)
 assert p.evaluate('bodyCalls.filter(c=>c.template).length')==1
 assert p.locator('.studio-none-choice[aria-pressed=true]').count()==1
 p.get_by_role('button',name='Cancel',exact=True).click()
 assert p.locator('.english-inline-ai').count()==0
 # Identical outfit and current hairstyle reuse the completed result.
 p.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
 original_id=Path(p.evaluate('bodyCalls.find(c=>c.template).template')).stem
 original=p.locator('.english-outfit-card').filter(has=p.locator('img[src*="'+original_id+'"]'))
 ai(p,original)
 p.get_by_role('button',name='Create portrait',exact=True).click()
 p.locator('.english-inline-ai').wait_for(state='hidden')
 assert p.evaluate('bodyCalls.filter(c=>c.template).length')==1
 # A new native outfit reuses the completed head/pair without another AI job.
 p.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
 ai(p,card)
 p.screenshot(path='work/english-inline-hair-desktop.png',full_page=True)
 p.get_by_role('button',name='Create portrait',exact=True).click()
 p.locator('.english-inline-ai').wait_for(state='hidden')
 assert p.evaluate('bodyCalls.filter(c=>c.template).length')==1
 assert p.evaluate("bodySnapshot.current().layers.find(l=>l.kind==='suit').templatePath").endswith('female-job-navy-notch-white-shirt.png')
 assert p.evaluate("bodySnapshot.current().layers.find(l=>l.kind==='head').jobId")=='fixture-new'
 assert p.evaluate("bodySnapshot.current().layers.find(l=>l.kind==='suit').visible") is True
 # Selecting a new hairstyle does not open a modal or submit until confirmed.
 p.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
 ai(p,original)
 p.get_by_role('button',name='เลือกทรงผมหญิง ทรงผมหญิง 2',exact=True).click()
 assert p.locator('.english-flow-overlay').count()==0
 assert p.evaluate('bodyCalls.filter(c=>c.template).length')==1
 p.get_by_role('button',name='Create portrait',exact=True).click()
 p.wait_for_function('bodyCalls.filter(c=>c.committed).length===2')
 assert p.evaluate('bodyCalls.filter(c=>c.template)[1].hair')
 assert p.evaluate('bodyCalls.filter(c=>c.template)[1].options.keepCurrentHair') is False
 p.close()
 # An explicit create must regenerate a portrait made with an old prompt policy.
 p=page(fresh=False)
 p.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
 old=p.locator('.english-outfit-card').first
 ai(p,old);p.get_by_role('button',name='Create portrait',exact=True).click()
 p.wait_for_function('bodyCalls.some(c=>c.committed)')
 assert p.evaluate('bodyCalls.filter(c=>c.template).length')==1
 assert p.evaluate("bodySnapshot.current().layers.find(l=>l.kind==='head').portraitFramingVersion")!='old-layout'
 p.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
 ai(p,p.locator('.english-outfit-card').first);p.get_by_role('button',name='Create portrait',exact=True).click()
 p.locator('.english-inline-ai').wait_for(state='hidden')
 assert p.evaluate('bodyCalls.filter(c=>c.template).length')==1,'current policy should still reuse its matching output'
 p.close()
 p=page(390)
 p.get_by_role('dialog').get_by_role('button',name='Edit manually').click()
 p.wait_for_function("bodySnapshot.current().layers.some(l=>l.kind==='source-photo')")
 card=p.locator('.english-outfit-card').first
 card.get_by_role('button',name='Edit with AI',exact=True).click()
 p.locator('.english-inline-ai').wait_for()
 assert p.locator('.english-flow-overlay').count()==0
 assert p.evaluate('bodyCalls.length')==0
 p.screenshot(path='work/english-inline-hair-mobile.png',full_page=True)
 p.get_by_role('button',name='Cancel',exact=True).click()
 assert p.locator('.english-inline-ai').count()==0
 assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
 # Thai continues to use its existing photo/finish choices and return buttons.
 thai=b.new_page()
 thai.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base+'/') and '/api/' not in r.request.url else r.abort())
 thai.goto(base+'/scripts/fixtures/english-portrait-flow.html?lang=th&fresh&standard',wait_until='domcontentloaded')
 thai.wait_for_function('!!window.bodySnapshot?.current')
 assert thai.locator('.english-outfit-ai,.english-inline-ai').count()==0
 thai.locator('.studio-bottom-choices').get_by_role('button',name='ทรงผม',exact=True).click()
 thai.locator('.studio-catalog-grid button').filter(has=thai.locator('img')).first.click()
 thai.get_by_role('heading',name='กรุณาเลือกชนิดรูป').wait_for()
 thai.get_by_role('button',name='กลับ Studio').click()
 thai.get_by_role('heading',name='กรุณาเลือกชนิดรูป').wait_for(state='hidden')
 assert thai.evaluate('bodyCalls.length')==0
 assert not errors,errors
 b.close()
 print(json.dumps({'passed':True,'checks':['local outfit placement','inline AI hair selector without popup','cancel without AI','keep processed hairstyle','explicit new hairstyle submit','same output reused','old prompt version regenerated only on explicit create','mobile layout','Thai isolation']}))
