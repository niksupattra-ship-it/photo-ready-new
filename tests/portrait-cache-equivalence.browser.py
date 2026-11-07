from playwright.sync_api import sync_playwright
from pathlib import Path
import json
old=Path('scripts/fixtures/portrait-validation-before.js').read_text();new=Path('src/main.jsx').read_text()
def take(s,a,b):
 i=s.index(a);return s[i:s.index(b,i)]
def parts(s,current):
 code=take(s,'async function portraitFaceMetrics(','async function checkPortraitProportions(')
 code+=take(s,'const portraitCompletionMemo=' if current else 'async function portraitCompletionEvidence(','const selectedHairEvidenceCache=')
 if current:code+=take(s,'const portraitFaceMemo=','const originalSkinProfileCache=')
 return code
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);p=b.new_page()
 def route(r):
  assert r.request.url.startswith('http://127.0.0.1:5192/') and '/api/' not in r.request.url
  if r.request.url.endswith('/__cache_check'):r.fulfill(content_type='text/html',body='<html></html>')
  else:r.continue_()
 p.route('**/*',route);p.goto('http://127.0.0.1:5192/__cache_check')
 result=p.evaluate('''async({old,newer})=>{
 const {createImmutablePortraitMemo}=await import('/src/immutable-portrait-memo.js');
 const {faceProportions}=await import('/src/face-proportion-check.js');
 const {portraitProtectedFeatures}=await import('/src/portrait-feature-check.js');
 const W=360,H=480,canvasFor=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
 const image=canvasFor(W,H);image.naturalWidth=W;image.naturalHeight=H;const ctx=image.getContext('2d');ctx.fillStyle='#bc927c';ctx.fillRect(45,35,270,410);
 const hair=canvasFor(W,H);hair.getContext('2d').fillRect(65,25,230,95);const clothing=canvasFor(W,H);
 const face=[];for(const [id,x,y]of [[10,.5,.15],[33,.35,.35],[263,.65,.35],[152,.5,.78],[234,.22,.46],[454,.78,.46],[172,.28,.68],[397,.72,.68],[1,.5,.5],[13,.5,.64]])face[id]={x,y};
 const run=async(code,current)=>{let detections=0,decodes=0,samples=0;const decoded=new WeakMap();
 const env={createImmutablePortraitMemo,faceMetricsCache:new WeakMap(),faceProportions,portraitProtectedFeatures,canvasFor,getLandmarker:async()=>({detect:()=>{detections++;return {faceLandmarks:[face]}}}),decodedPortraitImage:async blob=>{if(!decoded.has(blob)){decodes++;decoded.set(blob,image)}return decoded.get(blob)},loadImage:async()=>{decodes++;return image},getV192MasterMasks:async()=>({hairMask:hair,clothingMask:clothing}),inspectPortraitGarments:args=>{samples++;return {measurable:true,retained:false,width:args.width,height:args.height}}};
 const api=Function('env',`with(env){${code};return {metrics:portraitFaceMetrics,evidence:portraitCompletionEvidence}}`)(env);
 const source=new Blob(['source']),result=new Blob(['result']);
 const out=[];out.push(await api.metrics(source));out.push(await api.evidence(source));out.push(await api.evidence(source));out.push(await api.metrics(result));out.push(await api.evidence(result,true));out.push(await api.evidence(result,true));
 const counts={detections,decodes,samples};await api.metrics(result.slice());if(detections!==counts.detections+1)throw Error('new Blob reused old landmarks');
 return {out,counts};};
 const before=await run(old,false),after=await run(newer,true);
 const plain=x=>JSON.stringify(x,(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v);
 if(plain(before.out)!==plain(after.out))throw Error('metrics/evidence changed');
 if(after.counts.detections>=before.counts.detections||after.counts.decodes>=before.counts.decodes||after.counts.samples>=before.counts.samples)throw Error('no reduction');
 return {before:before.counts,after:after.counts,metricsAndEvidenceIdentical:true,newBlobDetectedAgain:true,paidAiCalls:0};
 }''',{'old':parts(old,False),'newer':parts(new,True)})
 print(json.dumps(result,indent=2));b.close()
