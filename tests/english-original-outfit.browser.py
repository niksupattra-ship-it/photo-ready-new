"""Compare the actual App compositor against original garment raster pixels.
Only localhost assets; no AI, billing, accounts or external requests.
"""
import os,json
from playwright.sync_api import sync_playwright
base=os.environ.get('SELECTION_BASE','http://127.0.0.1:5193')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 p=b.new_page();p.set_default_timeout(30000)
 p.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base+'/') and '/api/' not in r.request.url else r.abort())
 p.goto(base+'/scripts/fixtures/english-body-response.html',wait_until='domcontentloaded')
 p.wait_for_function('!!window.bodySnapshot?.current')
 result=p.evaluate('''async()=>{
 const {default:raw}=await import('/src/main.jsx?raw');
 const {planOriginalOutfit,paintOriginalOutfit,softenEnglishNeckEdges,ENGLISH_ORIGINAL_OUTFIT_VERSION}=await import('/src/english-original-outfit.js');
 const {decodedStudioImage}=await import('/src/studio-image-cache.js');
 const canvasFor=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
 const canvasPng=c=>new Promise(r=>c.toBlob(r,'image/png'));
 const decode=async blob=>{const url=URL.createObjectURL(blob);try{return await decodedStudioImage(url)}finally{URL.revokeObjectURL(url)}};
 const head=canvasFor(400,600),hx=head.getContext('2d');hx.fillStyle='#d7ad94';hx.beginPath();hx.ellipse(200,190,70,100,0,0,Math.PI*2);hx.fill();hx.fillRect(150,260,100,340);
 const makeup=canvasFor(400,600);makeup.getContext('2d').drawImage(head,0,0);makeup.getContext('2d').fillStyle='#b36d91';makeup.getContext('2d').fillRect(180,240,40,10);
 const face=[];for(const [id,x,y]of [[10,200,90],[33,160,180],[263,240,180],[152,200,290],[234,130,190],[454,270,190]])face[id]={x:x/400,y:y/600};
 let cleanupCalls=0,plan;
 const env={softenEnglishNeckEdges,ENGLISH_ORIGINAL_OUTFIT_VERSION,planOriginalOutfit:args=>(plan=planOriginalOutfit(args)),paintOriginalOutfit,canvasFor,canvasPng,cleanPortraitClothing:async b=>{cleanupCalls++;return b},decodedPortraitImage:decode,loadImage:decodedStudioImage,portraitFaceLandmarks:async()=>face,alphaBounds:async()=>({t:90}),copyStudioSkinBlobMetadata:(from,to)=>{for(const key of Object.getOwnPropertyNames(from))if(key.startsWith('idprom'))Object.defineProperty(to,key,Object.getOwnPropertyDescriptor(from,key));return to}};
 const start=raw.indexOf('async function restoreEnglishOriginalOutfit('),end=raw.indexOf('\\n}',start)+2;
 const restore=Function('env','with(env){'+raw.slice(start,end)+';return restoreEnglishOriginalOutfit}')(env);
 const results=[];
 for(const template of ['/assets/job-uniforms/female-formal-suit.png','/assets/government-uniforms/female-operational.png','/assets/student-uniforms/female-rajabhat.png']){
  const input=await canvasPng(head);input.idpromAiMakeupBlob=await canvasPng(makeup);input.idpromJobId='same-job';
  const result=await restore(input,template),uniform=await decodedStudioImage(template),native=await decode(result),paired=await decode(result.idpromAiMakeupBlob);
  if(result.idpromJobId!=='same-job'||result.idpromOriginalOutfitVersion!==ENGLISH_ORIGINAL_OUTFIT_VERSION)throw Error('Lost metadata');
  const f=plan.uniformFrame;
  const u=await import('/src/portrait-uniform-fit.js');const original=canvasFor(uniform.width,uniform.height);original.getContext('2d').drawImage(uniform,0,0);const anchors=u.measureUniformAnchors(original.getContext('2d').getImageData(0,0,uniform.width,uniform.height).data,uniform.width,uniform.height);
  const k=f.w/uniform.width;for(const value of [f.x+anchors.bounds.l*k,f.y+anchors.bounds.t*k])if(value<-.001)throw Error('Pattern cropped at top/left');if(f.x+(anchors.bounds.r+1)*k>plan.W+.001||f.y+(anchors.bounds.b+1)*k>plan.H+.001)throw Error('Pattern cropped at bottom/right');
  if(Math.abs(f.w/f.h-uniform.width/uniform.height)>1e-10)throw Error('Garment stretched');
  const expected=canvasFor(plan.W,plan.H);expected.getContext('2d').drawImage(uniform,f.x,f.y,f.w,f.h);
  const natural=canvasFor(plan.W,plan.H),cosmetics=canvasFor(plan.W,plan.H);natural.getContext('2d').drawImage(native,0,0);cosmetics.getContext('2d').drawImage(paired,0,0);
  const a=expected.getContext('2d').getImageData(0,0,plan.W,plan.H).data,n=natural.getContext('2d').getImageData(0,0,plan.W,plan.H).data,m=cosmetics.getContext('2d').getImageData(0,0,plan.W,plan.H).data;
  let checked=0;for(let i=0;i<a.length;i+=4)if(a[i+3]===255){checked++;for(let c=0;c<4;c++)if(a[i+c]!==n[i+c]||a[i+c]!==m[i+c])throw Error('Original garment changed at '+i+' '+template)}
  if(checked<100000)throw Error('Insufficient real garment pixels checked');if(n[3]!==0||m[3]!==0)throw Error('Background lost transparency');
  results.push({template,opaqueOriginalPixelsChecked:checked,naturalAndMakeupExact:true,fullPatternVisible:true,aspectPreserved:true,transparent:true});
 }
 if(cleanupCalls!==3)throw Error('Head cleanup was skipped');return results;
}''')
 print(json.dumps(result));b.close()
