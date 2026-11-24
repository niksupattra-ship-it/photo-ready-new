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
  fit=page.evaluate('''async()=>{const {governmentReferenceLandmarkFit}=await import('/src/government-insignia-fit.js');const c=insigniaCanvas(),fit=governmentReferenceLandmarkFit(c.getContext('2d').getImageData(0,0,c.width,c.height),'male',insigniaFixture.template);if(!fit?.measuredStandingCollar)throw Error('Actual native button must be measurable');window.testCollarFit=fit;return {y:(fit.frame.y+fit.frame.h*fit.preset.collar.y)/c.height*1200,button:fit.measuredStandingCollar.button.y/c.height*1200,breastY:(fit.frame.y+fit.frame.h*fit.preset.chest.y)/c.height*1200,chestHeight:fit.frame.w*fit.preset.chest.height/c.width*900,ribbonWidth:fit.frame.w*fit.preset.ribbon.width/c.width*900,bandTop:Math.max(...Object.values(fit.preset.collar.bands).map(b=>fit.frame.y+fit.frame.h*b.top))/c.height*1200,bandBottom:Math.min(...Object.values(fit.preset.collar.bands).map(b=>fit.frame.y+fit.frame.h*b.bottom))/c.height*1200,bands:Object.fromEntries(Object.entries(fit.preset.collar.bands).map(([side,b])=>[side,{top:(fit.frame.y+fit.frame.h*b.top)/c.height*1200,bottom:(fit.frame.y+fit.frame.h*b.bottom)/c.height*1200}])),span:fit.frame.w/c.width*900}}''')
  # Mobile initially shows the compact result toolbar rather than a panel.
  if width<600:page.get_by_role('button',name='เครื่องหมาย',exact=True).click()
  page.get_by_role('button',name='มท.',exact=True).click()
  page.wait_for_function('insigniaFixture.snapshot().layers.some(l=>l.kind==="collar")')
  placed=page.evaluate('''async()=>{const a=await insigniaAlpha('collar');return {y:a.frame.y+(a.bounds.y+a.bounds.h/2)/a.height*a.frame.h,pixels:a.pixels,top:a.frame.y+a.bounds.y/a.height*a.frame.h,bottom:a.frame.y+(a.bounds.y+a.bounds.h)/a.height*a.frame.h}}''')
  assert abs(placed['y']-fit['y'])<3,(fit,placed)
  assert placed['y']<fit['button']
  parts=page.evaluate("""async()=>{const {nativeAsset}=await import('/src/studio-source.js');const {governmentReferenceLandmarkFit}=await import('/src/government-insignia-fit.js');const c=insigniaCanvas(),fit=window.testCollarFit;const a=await nativeAsset('collar',{left:'/assets/government-insignia/garuda-left.png',right:'/assets/government-insignia/garuda-right.png'},{x:fit.frame.x/c.width*900,y:fit.frame.y/c.height*1200,w:fit.frame.w/c.width*900,h:fit.frame.h/c.height*1200},fit.preset);return Object.fromEntries(Object.entries(a.collarParts).map(([side,part])=>{const d=part.getContext('2d').getImageData(0,0,part.width,part.height).data;let top=part.height,bottom=0;for(let i=3;i<d.length;i+=4)if(d[i]>8){const y=Math.floor((i-3)/4/part.width);top=Math.min(top,y);bottom=Math.max(bottom,y)}return [side,{top:a.sourceFrame.y+top/part.height*a.sourceFrame.h,bottom:a.sourceFrame.y+(bottom+1)/part.height*a.sourceFrame.h}] }))}""")
  for side,part in parts.items():
   band=fit['bands'][side]
   assert part['top']>band['top']+1 and part['bottom']<band['bottom']-1,(side,part,band)
   assert abs((part['top']+part['bottom']-band['top']-band['bottom'])/2)<1,(side,part,band)
  assert page.evaluate('insigniaFixture.snapshot().layers.find(l=>l.kind==="head").source')==original
  narrow=page.evaluate('''async()=>{const {nativeAsset}=await import('/src/studio-source.js');const a=await nativeAsset('collar',{left:'/assets/government-insignia/garuda-left.png',right:'/assets/government-insignia/garuda-right.png'},{x:0,y:0,w:900,h:1200},{collar:{left:.45,right:.55,y:.501,width:.06,bandTop:.5,bandBottom:.517}});const c=a.source,px=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let top=c.height,bottom=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(px[(y*c.width+x)*4+3]>8){top=Math.min(top,y);bottom=Math.max(bottom,y)}return {top:a.sourceFrame.y+top/c.height*a.sourceFrame.h,bottom:a.sourceFrame.y+(bottom+1)/c.height*a.sourceFrame.h}}''')
  assert narrow['top']>=599 and narrow['bottom']<=621.5,narrow
  # All breast emblems must share the approved placket-derived level. Native
  # artwork keeps its aspect and round emblems must not inherit female boosts.
  page.get_by_label('ประเภทเครื่องหมาย',exact=True).get_by_role('button',name='เข็มติดอก',exact=True).click()
  page.get_by_role('button',name='อบต.',exact=True).click()
  page.wait_for_function('insigniaFixture.snapshot().layers.some(l=>l.kind==="chest")')
  page.get_by_label('ประเภทเครื่องหมาย',exact=True).get_by_role('button',name='แพรแถบ',exact=True).click()
  page.get_by_role('button',name='2515',exact=True).click()
  page.wait_for_function('insigniaFixture.snapshot().layers.some(l=>l.kind==="ribbon")')
  breast=page.evaluate('''()=>{
   const layers=insigniaFixture.snapshot().layers,chest=layers.find(l=>l.kind==='chest').sourceFrame,ribbon=layers.find(l=>l.kind==='ribbon').sourceFrame;
   return {chestY:chest.y+chest.h/2,ribbonY:ribbon.y+ribbon.h/2,chestH:chest.h,ribbonW:ribbon.w};
  }''')
  assert abs(breast['chestY']-fit['breastY'])<1
  assert abs(breast['ribbonY']-fit['breastY'])<1
  assert abs(breast['chestH']-fit['chestHeight'])<1
  assert abs(breast['ribbonW']-fit['ribbonWidth'])<1
  assert page.evaluate('insigniaFixture.aiCalls')==0
  assert not errors,errors
  print(json.dumps({'width':width,'standingCollarMeasured':True,'expectedY':fit['y'],'placedY':placed['y'],'nativeSourceUnchanged':True,'breast':breast,'aiCalls':0}))
  page.close()
 b.close()
