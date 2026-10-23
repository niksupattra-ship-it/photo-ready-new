import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAiResultCache} from '../src/ai-result-cache.js';
import {removePortraitClothingAlpha} from '../src/replace-studio-source.js';
import {inspectPortraitGarments,inspectUnchangedPortraitHair} from '../src/portrait-completion-check.js';

// Exercise the actual browser functions with native RGBA fixtures. The fake
// canvas only decodes/encodes those bytes; no model, network, payment or AI runs.
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
function extract(start,end,name,env){
 const a=main.indexOf(start),b=main.indexOf(end,a);
 assert(a>=0&&b>a,`cannot find ${name}`);
 return new Function('env',`with(env){${main.slice(a,b)};return ${name}}`)(env);
}
let count=0;
async function test(name,run){await run();count++;console.log('PASS: '+name)}
function imageBlob(pixels,width,height){
 const blob=new Blob([pixels],{type:'image/png'});
 blob.fixturePixels=pixels.slice();blob.fixtureWidth=width;blob.fixtureHeight=height;
 return blob;
}
function nativeFixture(scale=1,{garments=true}={}){
 const width=96*scale,height=112*scale,chinY=52*scale,faceWidth=44*scale;
 const pixels=new Uint8ClampedArray(width*height*4),clothing=pixels.slice(),skin=pixels.slice(),hair=pixels.slice();
 const rect=(plane,x0,y0,x1,y1,alpha=255)=>{
  for(let y=y0*scale;y<y1*scale;y++)for(let x=x0*scale;x<x1*scale;x++)plane[(y*width+x)*4+3]=alpha;
 };
 for(let i=0;i<pixels.length;i+=4){pixels[i]=103+(i/4)%91;pixels[i+1]=77+(i/4)%83;pixels[i+2]=49+(i/4)%67}
 rect(pixels,26,8,70,53);rect(skin,26,8,70,53);
 rect(pixels,22,35,26,48);rect(skin,22,35,26,48);
 rect(pixels,70,35,74,48);rect(skin,70,35,74,48);
 rect(pixels,34,53,62,100);rect(skin,34,53,62,100);
 rect(pixels,20,10,26,83);rect(hair,20,10,26,83);
 rect(pixels,70,10,76,83);rect(hair,70,10,76,83);
 if(garments){
  rect(pixels,8,70,34,112);rect(clothing,8,70,34,112);
  rect(pixels,62,70,88,112);rect(clothing,62,70,88,112);
  rect(pixels,34,100,62,112);rect(clothing,34,100,62,112);
 }
 // A clothing label above the chin must never be trimmed by this repair.
 rect(pixels,3,30,10,35);rect(clothing,3,30,10,35);
 // Match MediaPipe category masks: skin, hair and clothes are exclusive labels.
 for(let i=3;i<pixels.length;i+=4){if(skin[i])hair[i]=0;if(skin[i]||hair[i])clothing[i]=0}
 const blob=imageBlob(pixels,width,height);
 Object.assign(blob,{idpromJobId:'fixture-job',idpromTrial:true,idpromFullEdit:false,idpromFixtureFlag:'preserved'});
 Object.defineProperty(blob,'idpromHiddenFixture',{value:17,enumerable:false,writable:false,configurable:false});
 const mask=data=>({getContext:()=>({getImageData:()=>({data})})});
 const masks={clothingMask:mask(clothing),skinMask:mask(skin),hairMask:mask(hair)};
 const face=[];face[152]={x:.5,y:chinY/height};
 return {blob,pixels,clothing,skin,hair,masks,face,width,height,chinY,faceWidth};
}
function fixture(options={}){
 const native=nativeFixture(options.scale||1,{garments:options.garments!==false});
 const events=[],calls={ai:0,cleanup:0,encode:0,proportions:0,completion:0,rights:0,saved:0},maskCache=new WeakMap();
 const source=imageBlob(native.pixels,native.width,native.height);
 if(!options.unchangedHair)for(let i=0;i<source.fixturePixels.length;i+=4)if(native.hair[i+3])for(let c=0;c<3;c++)source.fixturePixels[i+c]=15;
 source.idpromFemaleEyeStyle='makeup';
 if(options.replacement)source.idpromStudioSourceReplacement=true;
 const cancelled=()=>Object.assign(Error('fixture process cancelled'),{code:'process_cancelled'});
 const interrupt=stage=>{
  if(options.cancelAt===stage)env.activeProcessOperation.cancelled=true;
  if(options.switchAt===stage)env.activeProcessOperation={cancelled:false};
 };
 const env={
  removePortraitClothingAlpha,v192MasterMaskCache:maskCache,
  decodedPortraitImage:async blob=>({naturalWidth:blob.fixtureWidth,naturalHeight:blob.fixtureHeight,blob}),
  getLandmarker:async()=>({detect:()=>({faceLandmarks:options.missingFace?[]:[native.face]})}),
  getV192MasterMasks:async blob=>maskCache.has(blob)?await maskCache.get(blob):options.missingMasks?{...native.masks,skinMask:null}:native.masks,
  canvasFor:(width,height)=>{
   const canvas={width,height,data:null};
   canvas.getContext=()=>({drawImage:image=>{canvas.data=image.blob.fixturePixels.slice()},getImageData:()=>({data:canvas.data.slice()}),putImageData:frame=>{canvas.data=frame.data.slice()}});
   return canvas;
  },
  canvasPng:async canvas=>{calls.encode++;return imageBlob(canvas.data,canvas.width,canvas.height)},
  activeProcessOperation:{cancelled:false},cancelledProcessError:cancelled,
  assertProcessActive:operation=>{if(operation?.cancelled)throw cancelled()},
  PRODUCTION_HAIR_CATALOG:[{id:'fixture-hair',gender:'female'}],HAIR_DESIGN_VERSION:'fixture-version',
  currentResultCacheScope:()=> 'fixture-wallet',resultSourceDigest:async()=> 'fixture-source',
  portraitResultCache:createAiResultCache(),
  aiFinishPortraitUncached:async()=>{calls.ai++;events.push('AI');interrupt('ai');return native.blob},
  checkPortraitProportions:async()=>{calls.proportions++;events.push('proportions');if(options.proportionFailure)throw Object.assign(Error('fixture proportions changed'),{code:'face_proportion_changed'})},
  inspectUnchangedPortraitHair,
  portraitCompletionEvidence:async(blob,includeGarments=false)=>{
   events.push(includeGarments?'output evidence':'source hair evidence');
   const pixels=blob.fixturePixels||new Uint8ClampedArray(await blob.arrayBuffer());
   const evidence={pixels,hair:native.hair};
   if(includeGarments)evidence.garments=inspectPortraitGarments({pixels,clothing:native.clothing,width:native.width,height:native.height,chinY:native.chinY,faceWidth:native.faceWidth});
   if(includeGarments)interrupt('guard');
   return evidence;
  },
  verifyOutputRights:async jobId=>{calls.rights++;assert.equal(jobId,'fixture-job');interrupt('rights');return {checked:true,unlocked:false,fullEdit:false}},
  saveAiJobFile:async()=>{calls.saved++;interrupt('save')},
  writeActiveAiJob:record=>events.push(['active job',record]),
  CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail}},
  window:{dispatchEvent:event=>events.push(['dispatch',event])}
 };
 const clean=extract('async function cleanPortraitClothing(','\nasync function finishFirstPortraitMaster','cleanPortraitClothing',env);
 env.cleanPortraitClothing=async blob=>{calls.cleanup++;events.push('cleanup');const result=options.leaveResidual?blob:await clean(blob);interrupt('cleanup');return result};
 const complete=extract('async function checkPortraitCompletion(','\nasync function aiFinishPortrait(','checkPortraitCompletion',env);
 env.checkPortraitCompletion=async(...args)=>{calls.completion++;events.push('completion');return complete(...args)};
 const run=extract('async function aiFinishPortrait(','\nlet acceptedPaidTrial=','aiFinishPortrait',env);
 return {native,source,env,events,calls,clean,complete,run:(hair='',opts={})=>run(source,hair,{portraitMode:'female',...opts})};
}

await test('native cleanup changes only certain clothing alpha below the chin at three resolutions',async()=>{
 for(const scale of [1,2,4]){
  const f=fixture({scale}),n=f.native,before=n.pixels,cleaned=await f.clean(n.blob),after=cleaned.fixturePixels;
  assert.equal(cleaned.fixtureWidth,n.width);assert.equal(cleaned.fixtureHeight,n.height);
  let changed=0;
  for(let y=0;y<n.height;y++)for(let x=0;x<n.width;x++){
   const i=(y*n.width+x)*4;
   assert.deepEqual(after.subarray(i,i+3),before.subarray(i,i+3),'all RGB stays byte-identical');
   const removable=y>=n.chinY&&before[i+3]>0&&n.clothing[i+3]>=240&&n.skin[i+3]<16&&n.hair[i+3]<16;
   assert.equal(after[i+3],removable?0:before[i+3],'face, neck, ears, hair and pixels above chin remain intact');
   if(removable)changed++;
  }
  assert(changed>0);assert.equal(f.calls.encode,1);
  assert.equal(await f.clean(cleaned),cleaned,'cleanup is idempotent');
  assert.equal(f.calls.encode,1);
 }
});
await test('cleanup preserves job, trial, edit rights and custom idprom property descriptors',async()=>{
 const f=fixture(),cleaned=await f.clean(f.native.blob);
 for(const key of Object.getOwnPropertyNames(f.native.blob).filter(key=>key.startsWith('idprom')))assert.deepEqual(Object.getOwnPropertyDescriptor(cleaned,key),Object.getOwnPropertyDescriptor(f.native.blob,key));
 assert.equal(await f.env.v192MasterMaskCache.get(cleaned),f.native.masks,'validation reuses the same semantic labels');
});
await test('already clean results preserve the original Blob without re-encoding',async()=>{
 const f=fixture({garments:false});assert.equal(await f.clean(f.native.blob),f.native.blob);assert.equal(f.calls.encode,0);
});
await test('invalid masks and missing chin do not silently accept or alter the image',async()=>{
 for(const options of [{missingMasks:true},{missingFace:true}]){const f=fixture(options);await assert.rejects(f.clean(f.native.blob));assert.equal(f.calls.encode,0)}
 const n=nativeFixture();assert.throws(()=>removePortraitClothingAlpha(n.pixels,n.clothing.subarray(0,4),n.skin,n.hair,n.width,n.height,n.chinY));
 assert.equal(removePortraitClothingAlpha(n.pixels,n.clothing,n.skin,n.hair,n.width,n.height,NaN),0);
});
await test('raw residual shirt reproduces the old completion error and the cleaned pixels pass',async()=>{
 const f=fixture();await assert.rejects(f.complete(f.source,f.native.blob,''),/AI ยังตัดเสื้อเดิมออกไม่ครบ/);
 const cleaned=await f.clean(f.native.blob);await f.complete(f.source,cleaned,'');
});
for(const mode of ['first portrait','replacement portrait','hairstyle'])await test(`${mode} cleans once before both existing completion guards`,async()=>{
 const f=fixture({replacement:mode==='replacement portrait'}),hair=mode==='hairstyle'?'fixture-hair':'',opts=mode==='hairstyle'?{creditKind:'hairstyle'}:{};
 const result=await f.run(hair,opts);
 assert.equal(f.calls.ai,1);assert.equal(f.calls.cleanup,1);assert.equal(f.calls.proportions,1);assert.equal(f.calls.completion,1);
 assert(f.events.indexOf('AI')<f.events.indexOf('cleanup'));assert(f.events.indexOf('cleanup')<f.events.indexOf('proportions'));assert(f.events.indexOf('cleanup')<f.events.indexOf('completion'));
 assert.equal(result.idpromJobId,'fixture-job');assert.equal(result.idpromTrial,true);assert.equal(result.idpromFullEdit,false);
 assert(f.events.some(event=>Array.isArray(event)&&event[0]==='dispatch'));
});
await test('cache hit reuses cleaned pixels without AI or cleanup and still verifies current rights',async()=>{
 const f=fixture(),first=await f.run(),second=await f.run();
 assert.equal(f.calls.ai,1);assert.equal(f.calls.cleanup,1);assert.equal(f.calls.encode,1);assert.equal(f.calls.rights,1);
 assert.equal(f.calls.proportions,2);assert.equal(f.calls.completion,2);
 assert.equal(second.idpromJobId,first.idpromJobId);assert.equal(second.idpromTrial,true);assert.equal(second.idpromReused,true);
 assert.deepEqual(new Uint8Array(await second.arrayBuffer()),new Uint8Array(await first.arrayBuffer()));
});
await test('retained clothing still rejects, invalidates cache and never announces delivery',async()=>{
 const f=fixture({leaveResidual:true});
 for(let i=0;i<2;i++)await assert.rejects(f.run(),/AI ยังตัดเสื้อเดิมออกไม่ครบ/);
 assert.equal(f.calls.ai,2);assert(!f.events.some(event=>Array.isArray(event)&&event[0]==='dispatch'));
});
await test('missing segmentation still fails closed and an unsuccessful result is not cached',async()=>{
 const f=fixture({missingMasks:true});
 for(let i=0;i<2;i++)await assert.rejects(f.run(),/ตรวจแยกเสื้อเดิม/);
 assert.equal(f.calls.ai,2);assert.equal(f.calls.completion,0);assert.equal(f.calls.encode,0);
});
await test('face proportions and unchanged requested hairstyle still reject after clothing cleanup',async()=>{
 const proportions=fixture({proportionFailure:true});await assert.rejects(proportions.run(),error=>error.code==='face_proportion_changed');assert.equal(proportions.calls.cleanup,1);
 const hair=fixture({unchangedHair:true});await assert.rejects(hair.run('fixture-hair',{creditKind:'hairstyle'}),/ทรงผมเดิม/);assert.equal(hair.calls.cleanup,1);assert(hair.events.includes('source hair evidence'));
});
await test('cancellation while AI, cleanup or completion is pending rejects and invalidates its result',async()=>{
 for(const cancelAt of ['ai','cleanup','guard']){
  const f=fixture({cancelAt});await assert.rejects(f.run(),error=>error.code==='process_cancelled');
  assert(!f.events.some(event=>Array.isArray(event)&&event[0]==='dispatch'));
  // A fresh operation may retry; the cancelled attempt must not become a cache hit.
  f.env.activeProcessOperation={cancelled:false};await assert.rejects(f.run(),error=>error.code==='process_cancelled');assert.equal(f.calls.ai,2,cancelAt);
 }
});
await test('cache reuse cannot announce an old job after cancellation during rights or source persistence',async()=>{
 for(const cancelAt of ['rights','save']){
  const f=fixture({cancelAt});await f.run();const before=f.events.filter(event=>Array.isArray(event)&&event[0]==='dispatch').length;
  await assert.rejects(f.run(),error=>error.code==='process_cancelled');
  assert.equal(f.events.filter(event=>Array.isArray(event)&&event[0]==='dispatch').length,before);
 }
});
await test('a replacement active operation cannot receive or cache the older portrait result',async()=>{
 for(const switchAt of ['ai','cleanup','guard']){
  const f=fixture({switchAt});await assert.rejects(f.run(),error=>error.code==='process_cancelled');
  assert.equal(f.env.activeProcessOperation.cancelled,false,'the new operation itself was not cancelled');
  assert(!f.events.some(event=>Array.isArray(event)&&event[0]==='dispatch'));
  await assert.rejects(f.run(),error=>error.code==='process_cancelled');assert.equal(f.calls.ai,2,switchAt);
 }
});
console.log(`PASS: ${count} portrait clothing completion scenarios; native RGBA only, no network, paid AI, payment or customer data.`);
