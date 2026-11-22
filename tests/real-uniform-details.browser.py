"""Actual editor hydration, reversible details, native PNG export and unmodified face pixels. No provider calls."""
import base64,json,os,pathlib
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('REAL_DETAILS_BASE','http://127.0.0.1:5193')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1280,'height':1100})
 errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.goto(BASE+'/scripts/fixtures/government-result-insignia.html?fullbody=1',wait_until='networkidle')
 page.wait_for_function("()=>window.insigniaFixture?.snapshot()?.layers.some(l=>l.realUniformDetail)",timeout=30000)
 initial=page.evaluate("""()=>{const s=insigniaFixture.snapshot();const h=s.layers.find(l=>l.kind==='head');return {source:h.source,original:h.realUniformOriginalSource,job:h.jobId,count:s.layers.filter(l=>l.realUniformDetail).length,calls:insigniaFixture.aiCalls}}""")
 assert initial['count']==3,initial
 assert initial['calls']==0
 page.get_by_role('button',name='กระดุม/บ่า',exact=True).click()
 page.get_by_role('button',name='ใช้รายละเอียดภาพ AI เดิม',exact=True).click()
 page.wait_for_function("()=>!insigniaFixture.snapshot().layers.some(l=>l.realUniformDetail)")
 assert page.evaluate("insigniaFixture.snapshot().layers.find(l=>l.kind==='head').source")==initial['original']
 page.wait_for_timeout(400)
 assert page.evaluate("insigniaFixture.snapshot().layers.filter(l=>l.realUniformDetail).length")==0,'Manual opt-out must not trigger automatic reapplication'
 page.get_by_role('button',name='วางกระดุมและบ่าจากชุดจริง',exact=True).click()
 page.wait_for_function("()=>insigniaFixture.snapshot().layers.some(l=>l.realUniformDetail)")
 assert page.evaluate('insigniaFixture.aiCalls')==0
 detail=page.evaluate("insigniaFixture.snapshot().layers.find(l=>l.realUniformDetail)")
 handle=page.locator('[data-kind="'+detail['id']+'"]')
 box=handle.bounding_box();assert box
 page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
 page.mouse.down();page.mouse.move(box['x']+box['width']/2+8,box['y']+box['height']/2+5,steps=6);page.mouse.up()
 moved=page.evaluate('(id)=>insigniaFixture.snapshot().layers.find(l=>l.id===id)',detail['id'])
 assert moved['x']!=detail['x'] and moved['y']!=detail['y'],'Real detail remains individually draggable'
 page.locator('.thai-mobile-result-download').click()
 expect(page.locator('.en-download-primary')).to_be_enabled(timeout=30000)
 page.locator('.en-download-primary').click()
 page.wait_for_function('insigniaFixture.exports.length===1',timeout=30000)
 exported=page.evaluate('''async()=>{const file=insigniaFixture.exports[0],im=new Image();im.src=file.url;await im.decode();return {width:im.width,height:im.height,type:file.type,bytes:file.size}}''')
 assert exported['type']=='image/png' and exported['width']>=2000 and exported['bytes']>10000,exported
 # Exact comparison of the original and locally cleaned real portrait pixels.
 unchanged=page.evaluate('''async()=>{const {prepareRealUniformDetails}=await import('/src/real-uniform-details-browser.js');const result=await prepareRealUniformDetails({originalSource:'/assets/government-uniforms/female-operational-example.jpg',templatePath:'/assets/government-uniforms/female-operational.png'});const pixels=src=>new Promise(resolve=>{const im=new Image();im.onload=()=>{const c=Object.assign(document.createElement('canvas'),{width:im.width,height:im.height});c.getContext('2d').drawImage(im,0,0);resolve(c.getContext('2d').getImageData(0,0,c.width,c.height))};im.src=src});const a=await pixels('/assets/government-uniforms/female-operational-example.jpg'),b=await pixels(result.cleanedSource);let face=0,ribbon=0;for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){if(y<320||y>425&&y<500){const i=(y*a.width+x)*4;for(let c=0;c<4;c++)if(a.data[i+c]!==b.data[i+c]){if(y<320)face++;else ribbon++}}}return {face,ribbon,count:result.parts.length}}''')
 assert unchanged=={'face':0,'ribbon':0,'count':3},unchanged
 laterFace=page.evaluate('''async()=>{const {prepareRealUniformDetails,restoreRealUniformDetails}=await import('/src/real-uniform-details-browser.js');const originalSource='/assets/government-uniforms/female-operational-example.jpg',r=await prepareRealUniformDetails({originalSource,templatePath:'/assets/government-uniforms/female-operational.png'});const im=new Image();im.src=r.cleanedSource;await im.decode();const c=Object.assign(document.createElement('canvas'),{width:im.width,height:im.height}),ctx=c.getContext('2d');ctx.drawImage(im,0,0);ctx.fillStyle='#ff00ff';ctx.fillRect(240,190,10,10);const restored=await restoreRealUniformDetails({currentSource:c.toDataURL(),originalSource,regions:r.regions});const out=new Image();out.src=restored;await out.decode();ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(out,0,0);return [...ctx.getImageData(245,195,1,1).data]}''')
 assert laterFace==[255,0,255,255],laterFace
 studio=browser.new_page(viewport={'width':1280,'height':1100})
 studio.goto(BASE+'/scripts/fixtures/government-result-insignia.html?fullbody=1&studio=1',wait_until='networkidle')
 studio.wait_for_function("()=>window.insigniaFixture?.snapshot()?.layers.some(l=>l.realUniformDetail)")
 studio.get_by_role('button',name='ย้อนกลับ',exact=True).first.click()
 studio.wait_for_function("()=>!insigniaFixture.snapshot().layers.some(l=>l.realUniformDetail)")
 studio.wait_for_timeout(300)
 assert studio.evaluate("insigniaFixture.snapshot().layers.filter(l=>l.realUniformDetail).length")==0
 studio.get_by_role('button',name='ทำซ้ำ',exact=True).first.click()
 studio.wait_for_function("()=>insigniaFixture.snapshot().layers.some(l=>l.realUniformDetail)")
 assert studio.evaluate('insigniaFixture.aiCalls')==0
 studio.locator('.studio-suit-toggle').click()
 studio.get_by_role('button',name='เลือกชุด ชุดข้าราชการ',exact=True).click()
 studio.wait_for_function("()=>insigniaFixture.snapshot().layers.some(l=>l.kind==='suit'&&l.visible)&&!insigniaFixture.snapshot().layers.some(l=>l.realUniformDetail)")
 assert studio.evaluate('insigniaFixture.aiCalls')==0
 studio.close()
 mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 mobile.goto(BASE+'/scripts/fixtures/government-result-insignia.html?fullbody=1&gender=male',wait_until='networkidle')
 mobile.wait_for_function("()=>window.insigniaFixture?.snapshot()?.layers.filter(l=>l.realUniformDetail).length===5")
 md=mobile.evaluate("insigniaFixture.snapshot().layers.find(l=>l.realUniformDetail)")
 mobile.get_by_role('button',name='เครื่องหมาย',exact=True).click()
 mh=mobile.locator('[data-kind="'+md['id']+'"]');mh.scroll_into_view_if_needed();mb=mh.bounding_box();assert mb
 start={'x':mb['x']+mb['width']/2,'y':mb['y']+mb['height']/2}
 cdp=mobile.context.new_cdp_session(mobile)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{**start,'id':1}]})
 for step in range(1,7):cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':start['x']+step*2,'y':start['y']+step,'id':1}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});cdp.detach()
 moved_mobile=mobile.evaluate('(id)=>insigniaFixture.snapshot().layers.find(l=>l.id===id)',md['id'])
 assert moved_mobile['x']!=md['x'] and moved_mobile['y']!=md['y']
 assert mobile.evaluate('insigniaFixture.aiCalls')==0
 mobile.close()
 assert not errors,errors
 print(json.dumps({'details':initial['count'],'aiCalls':0,'exactRestore':True,'faceAndRibbonUnchanged':unchanged,'pageErrors':errors,'nativeExport':exported}))
 browser.close()
