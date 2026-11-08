import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {ORIGINAL_PORTRAIT_AI_VERSION as V,hasOriginalPortraitAiFinish,needsOriginalAiSkinPreparation} from '../original-portrait-ai.js';
import {NATURAL_STUDIO_SKIN_VERSION} from '../natural-studio-skin.js';
import {processProductionPortrait,productionPortraitPrompt} from '../production-portrait-pipeline.js';
import {prepareCatalogueHairOnly,BOUNDED_PORTRAIT_PRIORITY,boundedPortraitPreparationPrompt} from '../portrait-anatomy.js';
import {boundPortraitNeckAlpha} from '../src/portrait-neck-boundary.js';
import {PRODUCTION_HAIR_CATALOG} from '../hairstyle-catalog.js';
import {compareFaceProportions} from '../src/face-proportion-check.js';
const root=new URL('..',import.meta.url).pathname;let passed=0;async function check(name,run){await run();passed++;console.log('PASS '+name)}
await check('V5 invalidates both prior finish caches without claiming legacy V4 pixels are current',()=>{for(const style of ['natural','makeup','korean-rosy-v1','soft-rosy-v1'])assert(!hasOriginalPortraitAiFinish({studioSkinVersion:'studio-original-ai-v4',studioCosmeticsVersion:style==='natural'?undefined:'studio-original-ai-v4:'+style},style))});
await check('all 25 catalogue references contain only hair, preserve native shape/RGB and erase hidden donor body RGB',async()=>{
 for(const h of PRODUCTION_HAIR_CATALOG.filter(h=>h.gender==='female'&&h.referenceDirectory!=='hair')){
  const raw=await readFile(root+'public/assets/seedream-hairstyles/references/'+h.file),original=await sharp(raw).ensureAlpha().raw().toBuffer({resolveWithObject:true}),hair=await sharp(await prepareCatalogueHairOnly(raw,h.id,root)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(hair.info.width,original.info.width);assert.equal(hair.info.height,original.info.height);let kept=0;
  for(let i=0;i<hair.info.width*hair.info.height;i++){const j=i*4;if(hair.data[j+3]){kept++;assert.deepEqual(hair.data.subarray(j,j+3),original.data.subarray(j,j+3));assert(hair.data[j+3]<=original.data[j+3])}else assert.deepEqual([...hair.data.subarray(j,j+3)],[255,255,255])}assert(kept>100);
  const center=(Math.floor(hair.info.height*.88)*hair.info.width+Math.floor(hair.info.width*.5))*4;assert.equal(hair.data[center+3],0,h.id+' chest remains');
 }
});
await check('V5 finishes share original-clothed skin preparation and a wide/deep flat neck backing, never a bust',async()=>{
 const raw=await sharp({create:{width:120,height:160,channels:3,background:'#b9a090'}}).jpeg().toBuffer(),prepared=await sharp(raw).png().toBuffer(),pixels=new Uint8Array(40*60*4);for(let y=5;y<55;y++)for(let x=6;x<34;x++)pixels.set([185,160,144,255],(y*40+x)*4);const cutout=await sharp(pixels,{raw:{width:40,height:60,channels:4}}).png().toBuffer();
 for(const style of ['natural','makeup','korean-rosy-v1','soft-rosy-v1'])for(const hairId of ['original','seedream-42']){
  const fields={portraitMode:'female',femaleEyeStyle:style,hairId,studioSkinVersion:V,...(style==='natural'?{naturalFinishVersion:NATURAL_STUDIO_SKIN_VERSION}:{})};assert(needsOriginalAiSkinPreparation(fields));let calls=0,matting=0;
  await processProductionPortrait({input:{buffer:raw,mimetype:'image/jpeg'},fields,root,requestPortrait:async p=>{calls++;if(calls===1){assert.equal(p.portrait,raw);assert.equal(p.prompt,boundedPortraitPreparationPrompt());assert.equal(p.hair,undefined);return {png:prepared}}
   assert.equal(p.portrait,prepared);assert(p.identity?.length);assert(p.prompt.endsWith(BOUNDED_PORTRAIT_PRIORITY));assert.match(p.prompt,/WIDE, DEEP/);assert.match(p.prompt,/No rounded breast anatomy anywhere/);assert(p.neckReference?.length);assert.match(p.prompt,/do not change (?:source )?yaw\/pitch/);assert.doesNotMatch(p.prompt,/DEEP WIDE COLLARBONE \/ UPPER-CHEST BASE/);if(hairId!=='original')assert(p.hair?.length);if(style==='natural')assert.doesNotMatch(p.prompt,/MAKEUP OPTION/);else assert.match(p.prompt,/MAKEUP OPTION/);return {png:cutout};},removeBackground:async p=>{matting++;assert.equal(p,cutout);return p}});assert.equal(calls,2);assert.equal(matting,1);
 }
 for(const phase of [1,2]){let calls=0,matting=0;await assert.rejects(processProductionPortrait({input:{buffer:raw,mimetype:'image/jpeg'},fields:{portraitMode:'female',femaleEyeStyle:'natural',hairId:'original',studioSkinVersion:V,naturalFinishVersion:NATURAL_STUDIO_SKIN_VERSION},root,requestPortrait:async()=>{if(++calls===phase)throw Error('provider phase failure');return {png:prepared}},removeBackground:async p=>{matting++;return p}}),/provider phase failure/);assert.equal(calls,phase);assert.equal(matting,0)}
});
await check('neck boundary retains a broad deep continuous backing while removing the outer body, changes alpha only',()=>{
 const W=120,H=180,p=new Uint8ClampedArray(W*H*4),hair=new Uint8ClampedArray(p.length);for(let i=0;i<p.length;i+=4)p.set([180,140,120,255],i);for(let y=0;y<H;y++)for(let x=3;x<8;x++)hair[(y*W+x)*4+3]=255;
 const original=new Uint8ClampedArray(p),face=[];face[33]={x:44/W,y:40/H};face[263]={x:76/W,y:40/H};face[152]={x:60/W,y:72/H};assert(boundPortraitNeckAlpha(p,hair,W,H,face));
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;assert.deepEqual(p.subarray(i,i+3),original.subarray(i,i+3));if(y<=74||x>=3&&x<8)assert.equal(p[i+3],255);else if(y>=125)assert.equal(p[i+3],0)}assert(p[(112*W+60)*4+3]>0);assert.equal(p[(83*W+119)*4+3],0);
});
await check('actual App rejects combined face elongation that individually passed width/height limits, same for all finishes',async()=>{
 const main=await readFile(root+'src/main.jsx','utf8'),a=main.indexOf('async function checkPortraitProportions('),b=main.indexOf('// Check the returned AI cutout',a);assert(a>=0&&b>a);
 const source={faceWidth:1.4,jawWidth:1,eyeToChin:1,eyeToNose:.4,eyeToMouth:.7,protectedFeatures:{}},generated={...source,faceWidth:1.32,eyeToChin:1.06};assert(compareFaceProportions(source,generated).ok);
 const run=Function('env','with(env){'+main.slice(a,b)+';return checkPortraitProportions}')({portraitFaceMetrics:async value=>value,compareFaceProportions,comparePortraitProtectedFeatures:()=>({ok:true})});await assert.rejects(run(source,generated,{protectFeatures:true}),e=>e.code==='face_proportion_changed');await run(source,{...source},{protectFeatures:true});await assert.rejects(run(source,{...source,eyeToChin:1.075},{protectFeatures:true}),e=>e.code==='face_proportion_changed');
 // Regression: the live completed female job was rejected by the recent 3%/4% thresholds.
 const liveSource={faceWidth:1.515826140732443,jawWidth:1.1294713141614625,eyeToChin:1.2118686794859468,eyeToNose:.4734763478795738,eyeToMouth:.7717093591529787,protectedFeatures:{}};
 const liveResult={faceWidth:1.5257004273310968,jawWidth:1.149516925253715,eyeToChin:1.2673593153356153,eyeToNose:.4935650294814921,eyeToMouth:.8041456850614314,protectedFeatures:{}};
 await run(liveSource,liveResult,{protectFeatures:true});
 const rejectFeatures=Function('env','with(env){'+main.slice(a,b)+';return checkPortraitProportions}')({portraitFaceMetrics:async value=>value,compareFaceProportions,comparePortraitProtectedFeatures:()=>({ok:false,reason:'features'})});
 await rejectFeatures(source,{...source},{protectFeatures:true});
 assert.match(main,/\['natural','makeup','korean-rosy-v1','soft-rosy-v1'\]\.includes\(options.femaleEyeStyle\)/);
});
console.log(JSON.stringify({passed,scope:'Actual V5 provider orchestration with inert calls, 25 real hair reference pixels/masks, deterministic alpha-only neck clipping and actual App elongation guard. No provider/payment/customer requests.'}));
