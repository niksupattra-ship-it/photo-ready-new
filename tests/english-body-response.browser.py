import os,json
from playwright.sync_api import sync_playwright
base=os.environ.get('SELECTION_BASE','http://127.0.0.1:5193')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 p=b.new_page(viewport={'width':1440,'height':1000});errors=[]
 p.on('pageerror',lambda e:errors.append(str(e)))
 p.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base+'/') and '/api/' not in r.request.url else r.abort())
 p.goto(base+'/scripts/fixtures/english-body-response.html',wait_until='domcontentloaded')
 p.wait_for_function('!!window.bodySnapshot?.current')
 p.wait_for_timeout(500)
 p.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
 card=p.locator('.studio-catalog-grid button').filter(has=p.locator('img[src*="female-lapel-suit"]'))
 card.scroll_into_view_if_needed();card.click()
 p.wait_for_function('bodyCalls.some(c=>c.committed)',timeout=20000)
 result=p.evaluate('''()=>{const layers=bodySnapshot.current().layers;return {calls:bodyCalls,heads:layers.filter(l=>l.kind==='head').map(l=>({mode:l.portraitComposition,template:l.generatedOutfitTemplate,frame:l.sourceFrame})),visibleSuits:layers.filter(l=>l.kind==='suit'&&l.visible!==false).length}}''')
 assert len(result['heads'])==1 and result['heads'][0]['mode']=='en-outfit-body-v1'
 assert result['visibleSuits']==0
 assert result['calls'][0]['template'].endswith('female-lapel-suit.png')
 checks=p.evaluate("""async()=>{
 const {default:raw}=await import('/src/main.jsx?raw');
 const {decodedStudioImage}=await import('/src/studio-image-cache.js');
 const source=bodySnapshot.current().layers.find(l=>l.kind==='head').source;
 const native=await decodedStudioImage(source),blob={idpromPortraitComposition:'en-outfit-body-v1'};
 const env={ENGLISH_BODY_PORTRAIT_VERSION:'en-outfit-body-v1',decodedPortraitImage:async()=>native,portraitFaceLandmarks:async()=>({152:{x:.5,y:.4}}),canvasFor:(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h}),canvasPng:c=>new Promise(r=>c.toBlob(r,'image/png')),naturalStudioSkinMetadata:()=>({}),studioSkinWorkflowMetadata:()=>({})};
 const extract=name=>{const start=raw.indexOf('async function '+name+'('),end=raw.indexOf('\\n}',start)+2;return Function('env','with(env){'+raw.slice(start,end)+';return '+name+'}')(env)};
 const placement=await extract('composePortrait')(blob,{},'/assets/job-uniforms/female-lapel-suit.png',{placementOnly:true});
 const layers=[];await extract('renderAdjustedFinal')(blob,placement.lock,{},0,{},null,null,{},null,{},false,null,0,null,{},layers);
 await extract('checkPortraitCompletion')({},blob,'');
 const exported=await extract('renderAdjustedFinal')(blob,placement.lock,{scale:1},0,{},null);
 const exportedImage=await createImageBitmap(exported);if(exportedImage.width!==900||exportedImage.height!==1200)throw Error('Legacy render lost body frame');exportedImage.close();
 const image=await decodedStudioImage(layers[0].source),c=env.canvasFor(image.width,image.height),x=c.getContext('2d');x.drawImage(image,0,0);
 if(x.getImageData(image.width/2,image.height-2,1,1).data[3]!==255)throw Error('App discarded generated torso');
 if(layers.length!==1||layers[0].portraitComposition!=='en-outfit-body-v1')throw Error('App did not retain body metadata');
 if(Math.abs(layers[0].sourceFrame.w/layers[0].sourceFrame.h-image.width/image.height)>1e-8)throw Error('App stretched body');
 return {nativeTorsoRetained:true,aspectPreserved:true,noGarmentCleanup:true};
 }""")
 print(json.dumps(checks))
 p.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
 government=p.locator('.studio-catalog-grid button').filter(has=p.locator('img[src*="female-operational"]'))
 assert government.count()==1
 assert p.locator('.studio-catalog-grid img[src*="female-academic"]').count()==0
 government.scroll_into_view_if_needed();government.click()
 p.wait_for_function('bodyCalls.filter(c=>c.committed).length===2',timeout=20000)
 assert p.evaluate('bodyCalls.filter(c=>c.template).at(-1).template')=='/assets/government-uniforms/female-operational.png'
 assert p.evaluate('bodySnapshot.current().layers.filter(l=>l.kind==="suit"&&l.visible!==false).length')==0
 print('PASS single female civil-service option selects the same English AI body flow')
 p.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
 student=p.locator('.studio-catalog-grid button').filter(has=p.locator('img[src*="student-uniforms"][src*="female-01"]'))
 assert student.count()==1
 assert p.locator('.studio-catalog-grid img[src*="student-uniforms"][src*="female-02"]').count()==0
 student.scroll_into_view_if_needed();student.click()
 p.wait_for_function('bodyCalls.filter(c=>c.committed).length===3',timeout=20000)
 assert p.evaluate('bodyCalls.filter(c=>c.template).at(-1).template')=='/assets/student-uniforms/female-01.png'
 print('PASS single female student option selects the English AI body flow')

 assert not errors,errors
 print(json.dumps(result));b.close()
