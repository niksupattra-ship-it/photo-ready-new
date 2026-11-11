import test from 'node:test';
import assert from 'node:assert/strict';
import {planEnglishHeadBalance,applyEnglishHeadBalance,balancedEnglishLandmarks} from '../src/english-head-balance.js';
import {measureEnglishProportions} from '../src/english-proportion-check.js';
function fixture({faceWidth=150,cropped=false}={}){
 const width=400,height=600,pixels=new Uint8ClampedArray(width*height*4),classes=new Uint8Array(width*height),face=[];
 const put=(x,y,r,g,b,label)=>{const i=(y*width+x)*4;pixels.set([r,g,b,255],i);classes[y*width+x]=label};
 for(let y=45;y<240;y++)for(let x=200-faceWidth/2;x<200+faceWidth/2;x++)put(x,y,180+x%19,90+y%30,70, y<90?1:3);
 for(let y=230;y<310;y++)for(let x=165;x<235;x++)put(x,y,180,110,90,2);
 for(let y=270;y<height;y++)for(let x=cropped?0:25;x<(cropped?width:375);x++)put(x,y,x%251,y%247,(x+y)%241,4);
 for(const [id,x,y]of [[10,200,100],[152,200,240],[234,200-faceWidth/2,170],[454,200+faceWidth/2,170]])face[id]={x:x/width,y:y/height};
 return {width,height,pixels,face,labels:{width,height,data:classes}};
}
test('measured oversized heads are uniformly reduced while balanced and unreadable images stay unchanged',()=>{
 const f=fixture(),plan=planEnglishHeadBalance(f.pixels,f.width,f.height,f.face);assert(plan.applied);assert(plan.scale<.8);assert(Math.abs(plan.faceRatioAfter-.30)<1e-12);
 const normal=fixture({faceWidth:100});assert(!planEnglishHeadBalance(normal.pixels,normal.width,normal.height,normal.face).applied);
 assert(!planEnglishHeadBalance(f.pixels,f.width,f.height,[]).applied);
});
test('edge-clipped shoulders are measured using their visible span, rather than silently skipping balance',()=>{
 const f=fixture({cropped:true});assert.equal(measureEnglishProportions(f.pixels,f.width,f.height,f.face).measurable,false);const plan=planEnglishHeadBalance(f.pixels,f.width,f.height,f.face);assert(plan.applied);assert.equal(plan.metrics.shoulderSpan,f.width);
});
test('clothing, lower body, canvas size and the supporting neck alpha stay exact',()=>{
 const f=fixture(),plan=planEnglishHeadBalance(f.pixels,f.width,f.height,f.face),out=applyEnglishHeadBalance(f.pixels,f.width,f.height,plan,f.labels);assert.equal(out.length,f.pixels.length);assert.notDeepEqual(out,f.pixels);
 for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){
  const i=(y*f.width+x)*4,label=f.labels.data[y*f.width+x];if(label===4||y>=plan.transitionEnd)assert.deepEqual(out.subarray(i,i+4),f.pixels.subarray(i,i+4));
  if(y>=plan.anchorY&&label===2&&Math.abs(x-plan.anchorX)<20)assert.equal(out[i+3],255);
 }
});
test('one isotropic transform preserves facial anatomy and fixes the chin anchor',()=>{
 const f=fixture(),plan=planEnglishHeadBalance(f.pixels,f.width,f.height,f.face),after=balancedEnglishLandmarks(f.face,plan,f.width,f.height);assert.deepEqual(after[152],f.face[152]);
 for(const [a,b]of [[10,152],[234,454],[10,234]]){const distance=face=>Math.hypot((face[a].x-face[b].x)*f.width,(face[a].y-face[b].y)*f.height);assert(Math.abs(distance(after)/distance(f.face)-plan.scale)<1e-12)}
 const pixels=applyEnglishHeadBalance(f.pixels,f.width,f.height,plan,f.labels),metrics=measureEnglishProportions(pixels,f.width,f.height,after,{allowCropped:true});assert(Math.abs(metrics.faceRatio-.30)<.004);assert(!planEnglishHeadBalance(pixels,f.width,f.height,after).applied,'A balanced result must not shrink again');
});
test('a high collar keeps its native neck coverage below the scaled jaw',()=>{
 const f=fixture();
 for(let y=250;y<270;y++)for(let x=125;x<275;x++)if(x<165||x>=235){const i=(y*f.width+x)*4;f.pixels.set([40,50,70,255],i);f.labels.data[y*f.width+x]=4}
 const plan=planEnglishHeadBalance(f.pixels,f.width,f.height,f.face),out=applyEnglishHeadBalance(f.pixels,f.width,f.height,plan,f.labels);
 assert(plan.applied);
 for(let y=252;y<270;y++)for(let x=165;x<235;x++){const i=(y*f.width+x)*4;assert.deepEqual(out.subarray(i,i+4),f.pixels.subarray(i,i+4),'No transparent slot or resized skin inside the fixed collar');}
});
test('Natural and Makeup receive the same coordinates and alpha, without moving clothing in either finish',()=>{
 const f=fixture(),makeup=new Uint8ClampedArray(f.pixels);for(let i=0;i<makeup.length;i+=4)if(f.labels.data[i/4]===3)makeup[i]=230;
 const plan=planEnglishHeadBalance(f.pixels,f.width,f.height,f.face),a=applyEnglishHeadBalance(f.pixels,f.width,f.height,plan,f.labels),b=applyEnglishHeadBalance(makeup,f.width,f.height,plan,f.labels);
 for(let i=0;i<a.length;i+=4){assert.equal(a[i+3],b[i+3]);if(f.labels.data[i/4]===4)assert.deepEqual(a.subarray(i,i+4),b.subarray(i,i+4))}
 assert.notDeepEqual(a,b,'Keep the actual makeup finish');
});
test('actual App balance updates both finishes atomically, keeps job/credits metadata, and never calls AI',async()=>{
 const {readFile}=await import('node:fs/promises'),raw=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),a=raw.indexOf('async function balanceEnglishPortrait('),z=raw.indexOf('\nasync function balanceExistingEnglishPortraitLayer(',a),{ENGLISH_HEAD_BALANCE_VERSION}=await import('../src/english-head-balance.js');
 const f=fixture();let currentPixels,closed=0,checks=0,decodes=0;
 const canvas={width:f.width,height:f.height,getContext:()=>({drawImage:im=>currentPixels=new Uint8ClampedArray(im.pixels),clearRect(){},getImageData:()=>({data:new Uint8ClampedArray(currentPixels)}),putImageData:frame=>currentPixels=new Uint8ClampedArray(frame.data)})};
 const env={planEnglishHeadBalance,applyEnglishHeadBalance,ENGLISH_HEAD_BALANCE_VERSION,assertProcessActive:()=>{checks++},decodedPortraitImage:async blob=>{decodes++;return {naturalWidth:f.width,naturalHeight:f.height,pixels:blob.pixels}},portraitFaceLandmarks:async()=>f.face,canvasFor:()=>canvas,getPersonSegmenter:async()=>({segment:()=>({categoryMask:{width:f.width,height:f.height,getAsUint8Array:()=>f.labels.data,close:()=>closed++}})}),canvasPng:async()=>Object.assign(new Blob(['encoded'],{type:'image/png'}),{pixels:new Uint8ClampedArray(currentPixels)}),copyStudioSkinBlobMetadata:(source,target)=>Object.assign(target,Object.fromEntries(Object.entries(source).filter(([key])=>key.startsWith('idprom'))))};
 const balance=Function('env',`with(env){${raw.slice(a,z)};return balanceEnglishPortrait}`)(env),source=Object.assign(new Blob(['natural'],{type:'image/png'}),{pixels:f.pixels,idpromJobId:'job-a',idpromTrial:true,idpromFullEdit:false}),makeup=new Uint8ClampedArray(f.pixels);makeup[100*f.width*4+200*4]=240;
 source.idpromAiMakeupBlob=Object.assign(new Blob(['makeup'],{type:'image/png'}),{pixels:makeup});
 const stages=[],out=await balance(source,status=>stages.push(status));assert.notEqual(out,source);assert.equal(out.idpromJobId,'job-a');assert.equal(out.idpromTrial,true);assert.equal(out.idpromFullEdit,false);assert.equal(out.idpromEnglishHeadBalanceVersion,ENGLISH_HEAD_BALANCE_VERSION);assert.equal(closed,1);assert.equal(checks,3);assert.deepEqual(stages,['balancing']);assert(out.idpromAiMakeupBlob);
 for(let i=3;i<f.pixels.length;i+=4)assert.equal(out.pixels[i],out.idpromAiMakeupBlob.pixels[i]);
 const before=decodes;assert.equal(await balance(out),out);assert.equal(decodes,before,'Do not shrink a tagged result twice');
 let guard=0;await assert.rejects(balance(source,null,()=>{if(++guard>=2)throw Error('changed account')}),/changed account/);
 env.getPersonSegmenter=async()=>{throw Error('Optional segmenter unavailable')};
 assert.equal(await balance(source),source,'Without clothing protection keep the valid pair instead of warping a collar');
 assert.equal(source.idpromEnglishHeadBalanceCheck.reason,'unavailable');assert.equal(source.idpromAiMakeupBlob.pixels,makeup);
 const normal=fixture({faceWidth:100});source.pixels=normal.pixels;env.portraitFaceLandmarks=async()=>normal.face;assert.equal(await balance(source),source);
 env.portraitFaceLandmarks=async()=>{throw Error('Model unavailable')};assert.equal(await balance(source),source);assert.equal(source.idpromEnglishHeadBalanceCheck.reason,'unavailable');assert.equal(source.idpromAiMakeupBlob.pixels,makeup);
});
