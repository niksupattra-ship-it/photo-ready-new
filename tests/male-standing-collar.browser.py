"""Real Easy result, including restored native buttons, must use the measured collar."""
import os,json
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('MALE_COLLAR_BASE','http://127.0.0.1:5202')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [1280,390]:
  page=b.new_page(viewport={'width':width,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(BASE+'/scripts/fixtures/government-result-insignia.html?fullbody=1&gender=male',wait_until='domcontentloaded')
  page.wait_for_function('insigniaFixture.snapshot()?.layers.filter(l=>l.realUniformDetail).length===5',timeout=30000)
  original=page.evaluate('insigniaFixture.snapshot().layers.find(l=>l.kind==="head").source')
  fit=page.evaluate('''async()=>{const {governmentReferenceLandmarkFit}=await import('/src/government-insignia-fit.js');const c=insigniaCanvas(),fit=governmentReferenceLandmarkFit(c.getContext('2d').getImageData(0,0,c.width,c.height),'male',insigniaFixture.template);if(!fit?.measuredStandingCollar)throw Error('Actual native button must be measurable');return {y:(fit.frame.y+fit.frame.h*fit.preset.collar.y)/c.height*1200,button:fit.measuredStandingCollar.button.y/c.height*1200}}''')
  # Mobile initially shows the compact result toolbar rather than a panel.
  if width<600:page.get_by_role('button',name='เครื่องหมาย',exact=True).click()
  page.get_by_role('button',name='มท.',exact=True).click()
  page.wait_for_function('insigniaFixture.snapshot().layers.some(l=>l.kind==="collar")')
  placed=page.evaluate('''async()=>{const a=await insigniaAlpha('collar');return {y:a.frame.y+(a.bounds.y+a.bounds.h/2)/a.height*a.frame.h,pixels:a.pixels}}''')
  assert abs(placed['y']-fit['y'])<3,(fit,placed)
  assert placed['y']<fit['button']
  assert page.evaluate('insigniaFixture.snapshot().layers.find(l=>l.kind==="head").source')==original
  assert page.evaluate('insigniaFixture.aiCalls')==0
  assert not errors,errors
  print(json.dumps({'width':width,'standingCollarMeasured':True,'expectedY':fit['y'],'placedY':placed['y'],'nativeSourceUnchanged':True,'aiCalls':0}))
  page.close()
 b.close()
