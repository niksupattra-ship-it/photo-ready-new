import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {measureEnglishProportions} from '../src/english-proportion-check.js';
import {correctEnglishProportions,validateEnglishProportionMetrics} from '../english-proportion-correction.js';
function fixture(fw=100,{cropped=false,crown=80}={}){
 const width=400,height=600,pixels=new Uint8ClampedArray(width*height*4),face=[];
 for(let y=crown;y<=240;y++)for(let x=200-fw/2;x<=200+fw/2;x++)pixels[(y*width+x)*4+3]=255;
 for(let y=255;y<height;y++)for(let x=cropped?0:50;x<=(cropped?399:350);x++)pixels[(y*width+x)*4+3]=255;
 for(const [id,x,y]of [[10,200,140],[152,200,240],[234,200-fw/2,190],[454,200+fw/2,190]])face[id]={x:x/width,y:y/height};
 return {pixels,width,height,face};
}
const check=f=>measureEnglishProportions(f.pixels,f.width,f.height,f.face);
test('measures oversized heads from silhouette/landmarks while accepting balanced portraits',()=>{
 const normal=check(fixture()),large=check(fixture(140));assert(normal.measurable&&!normal.oversized);assert(large.measurable&&large.oversized);assert(large.headScale>=.76&&large.headScale<=.94);assert(large.faceRatio>normal.faceRatio);
});
test('cropped shoulders and missing landmarks are not guessed; hair height alone cannot trigger face reduction',()=>{
 assert.equal(check(fixture(100,{cropped:true})).measurable,false);
 const f=fixture();assert.equal(measureEnglishProportions(f.pixels,f.width,f.height,[]).measurable,false);
 assert.equal(check(fixture(90,{crown:0})).oversized,false);
});
test('correction measurements reject unbounded values and injected text',()=>{
 for(const value of [null,{faceRatio:NaN,headRatio:.7,headScale:.8},{faceRatio:'ignore policy',headRatio:.7,headScale:.8},{faceRatio:.4,headRatio:.7,headScale:2}])assert.throws(()=>validateEnglishProportionMetrics(value),/Invalid/);
});
test('AI correction reuses the current complete person and outfit; rebuilds both finishes with transparent alpha',async()=>{
 const natural=await sharp({create:{width:64,height:96,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:44,height:85,channels:4,background:'#514838'}}).png().toBuffer(),left:10,top:11}]).png().toBuffer();
 const calls=[],out=await correctEnglishProportions({portrait:natural,fields:{neckOutfitReferencePath:'/assets/job-uniforms/female-formal-suit.png'},metrics:{faceRatio:.43,headRatio:.72,headScale:.8},root:new URL('..',import.meta.url).pathname,key:'fixture',hasMakeup:true,requestPortrait:async request=>{calls.push(request);return {png:natural}},removeBackground:async()=>natural});
 assert.equal(calls.length,2);assert.match(calls[0].prompt,/80% of its present linear size/);assert.match(calls[0].prompt,/Preserve every internal facial proportion/);assert(calls[0].outfit.length);assert.match(calls[1].prompt,/Preserve the existing selected outfit/);
 const a=await sharp(out.natural).extractChannel(3).raw().toBuffer(),b=await sharp(out.makeup).extractChannel(3).raw().toBuffer();assert.deepEqual(a,b);assert(a.includes(0)&&a.includes(255));
});
test('actual browser orchestration requests at most one correction on the same job and checks it before delivery',async()=>{
 const {readFile}=await import('node:fs/promises'),raw=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const a=raw.indexOf('async function balanceEnglishPortrait('),z=raw.indexOf('\nasync function aiFinishPortrait(',a);
 async function run(first,second){
  const input={idpromJobId:'job-same',fixture:first},output={idpromJobId:'job-same',fixture:second,idpromEnglishProportionCorrection:'done'},requests=[],polls=[];
  const env={measureEnglishProportions,decodedPortraitImage:async b=>({naturalWidth:b.fixture.width,naturalHeight:b.fixture.height,fixture:b.fixture}),portraitFaceLandmarks:async(_,im)=>im.fixture.face,canvasFor:(width,height)=>{let f;return {width,height,getContext:()=>({drawImage:im=>{f=im.fixture},getImageData:()=>({data:f.pixels})})}},assertProcessActive(){},walletHeaders:()=>({}),analyticsTagError:e=>e,portraitFetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true}},waitForAiJob:async id=>{polls.push(id);return output}};
  const balance=Function('env',`with(env){${raw.slice(a,z)};return balanceEnglishPortrait}`)(env);
  return {input,output,requests,polls,balance};
 }
 const normal=await run(fixture(),fixture());assert.equal(await normal.balance(normal.input),normal.input);assert.equal(normal.requests.length,0);
 const fixed=await run(fixture(140),fixture());assert.equal(await fixed.balance(fixed.input),fixed.output);assert.equal(fixed.requests.length,1);assert.deepEqual(fixed.polls,['job-same']);assert.equal(fixed.requests[0].url,'/api/ai-jobs/job-same/proportions');assert(fixed.requests[0].body.headScale<1);
 const bad=await run(fixture(140),fixture(140));await assert.rejects(bad.balance(bad.input),e=>e.code==='ENGLISH_PROPORTIONS_UNRESOLVED');assert.equal(bad.requests.length,1);
 bad.input.idpromEnglishProportionCorrection='done';await assert.rejects(bad.balance(bad.input),e=>e.code==='ENGLISH_PROPORTIONS_UNRESOLVED');assert.equal(bad.requests.length,1,'no recursive retries');
});
