import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {ORIGINAL_PORTRAIT_AI_VERSION,ORIGINAL_PORTRAIT_AI_PREVIOUS_VERSION,validateOriginalPortraitAiFields,isOriginalPortraitAiRequest,originalAiSkinFinish,markOriginalPortraitAiFinish} from '../original-portrait-ai.js';
import {NATURAL_STUDIO_SKIN_VERSION,NATURAL_STUDIO_SKIN_PREVIOUS_VERSION,NATURAL_STUDIO_SKIN_SPOT_VERSION} from '../natural-studio-skin.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {loadStudioSkinLightReference} from '../studio-skin-light-reference.js';

let passed=0;
async function check(name,run){await run();passed++;console.log('PASS '+name)}
const hash=value=>createHash('sha256').update(value).digest('hex');
await check('accepted original-AI cosmetic instructions remain byte-identical',()=>{
 for(const [style,expected] of Object.entries({
  makeup:'de16a7f65d3756aeac59a7d8fe35355a9a6ed33d3e47545dcd37809c87f83aa4',
  'korean-rosy-v1':'de16a7f65d3756aeac59a7d8fe35355a9a6ed33d3e47545dcd37809c87f83aa4',
  'soft-rosy-v1':'9d9a825e917a39301ace24af14a664e3bc1dd6edb7e239ce741ee56ba212bd0e'
 }))assert.equal(hash(originalAiSkinFinish(style)),expected,style);
});

await check('natural eye expression and clear-skin policy reaches the actual single production request',async()=>{
 const raw=await sharp({create:{width:120,height:160,channels:3,background:'#b99a87'}}).jpeg().toBuffer();
 const pixels=new Uint8Array(32*40*4);
 for(let y=4;y<36;y++)for(let x=4;x<28;x++)pixels.set([185,154,135,255],(y*32+x)*4);
 const cutout=await sharp(pixels,{raw:{width:32,height:40,channels:4}}).png().toBuffer();
 for(const version of [ORIGINAL_PORTRAIT_AI_PREVIOUS_VERSION,'studio-original-ai-v4'])for(const hairId of ['original','seedream-19']){
  let calls=0;
  await processProductionPortrait({input:{buffer:raw,mimetype:'image/jpeg'},fields:{portraitMode:'female',femaleEyeStyle:'natural',hairId,studioSkinVersion:version},root:new URL('..',import.meta.url).pathname,
   requestPortrait:async actual=>{
    calls++;assert.equal(actual.portrait,raw);assert.equal(actual.identity,null);assert.equal(actual.outfit,undefined);
    if(version===ORIGINAL_PORTRAIT_AI_PREVIOUS_VERSION)assert.equal(actual.skinReference,undefined);else{assert.deepEqual(actual.skinReference,await loadStudioSkinLightReference(new URL('..',import.meta.url).pathname));assert.match(actual.prompt,/FINAL ORIGINAL-AI V2 SKIN \/ LIGHT AUTHORITY/)}
    assert.match(actual.prompt,/SOURCE EYES AND EXPRESSION/);
    assert.match(actual.prompt,/source iris colour, diameter and texture, pupil size and position, gaze direction, corneal catchlights/);
    assert.match(actual.prompt,/Remove visible active acne, acne-related red\/brown marks, temporary blemishes and fine surface wrinkle lines/);
    assert.match(actual.prompt,/actual eyelid boundary, natural eyelid fold/);
    assert.match(actual.prompt,/No plastic or waxy mask/);
    assert.doesNotMatch(actual.prompt,/MAKEUP OPTION — COMPLETE HERE/);
    return {png:cutout};
   },removeBackground:async image=>image});
  assert.equal(calls,1);
 }
});

await check('actual App wrapper rejects eye drift in the shared Natural base before delivering either finish',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const a=main.indexOf('async function aiFinishPortrait('),b=main.indexOf('\nasync function aiFinishPortraitUncached(',a);assert(a>=0&&b>a);
 for(const [gender,style,protectedEyes] of [['female','natural',true],['female','makeup',true],['female','korean-rosy-v1',true],['male','natural',false]]){
  for(const drift of [false,true]){
   const upload=new Blob(['untouched upload']),operation={cancelled:false},finished=gender==='female'?markOriginalPortraitAiFinish(new Blob(['generated pixels']),style):new Blob(['generated pixels']);
   let generations=0,deletions=0,completionChecks=0,featureChecks=0;
   const eyeError=Object.assign(Error('source eye geometry changed'),{code:'portrait_features_changed'});
   const forbidden=()=>{throw Error('local skin or cosmetics must not execute')};
   const env={sharedStudioSkinSource:()=>null,decodedPortraitImage:async()=>({naturalWidth:128,naturalHeight:192}),portraitFaceLandmarks:async()=>({152:{x:.5,y:.8},234:{x:.2,y:.5},454:{x:.8,y:.5}}),canvasPng:forbidden,isOriginalPortraitAiRequest,window:{dispatchEvent(){}},CustomEvent:class{},activeProcessOperation:operation,assertProcessActive(){},cancelledProcessError:()=>Error('cancelled'),PRODUCTION_HAIR_CATALOG:[],portraitFinishChoice:(v,f)=>v||f||'natural',currentResultCacheScope:()=> 'account',resultSourceDigest:async()=> 'upload-sha',uploadGenerationScope:()=> 'upload',HAIR_DESIGN_VERSION:'hair',NATURAL_STUDIO_SKIN_VERSION,ORIGINAL_PORTRAIT_AI_VERSION,STUDIO_SKIN_WORKFLOW_VERSION:'studio-skin-stages-v5',
    portraitResultCache:{async get(key,create){if(gender==='female'&&style==='natural')assert(key.includes(NATURAL_STUDIO_SKIN_VERSION));return {value:await create(),reused:false}},delete(){deletions++}},
    aiFinishPortraitUncached:async source=>{assert.equal(source,upload);generations++;return finished},cleanPortraitClothing:async image=>image,finishSharedStudioSkin:async base=>base,finishFemaleMakeupSoftFocusBlob:forbidden,
    checkPortraitProportions:async(source,image,options)=>{featureChecks++;assert.equal(source,upload);assert.equal(options.protectFeatures,protectedEyes);if(drift&&options.protectFeatures)throw eyeError},checkPortraitCompletion:async()=>{completionChecks++}};
   const run=Function('env','with(env){'+main.slice(a,b)+';return aiFinishPortrait}')(env);
   if(drift&&protectedEyes){await assert.rejects(run(upload,'original',{portraitMode:gender,femaleEyeStyle:style}),e=>e===eyeError);assert.equal(deletions,1);assert.equal(completionChecks,0)}
   else{assert.equal(await run(upload,'original',{portraitMode:gender,femaleEyeStyle:style}),finished);assert.equal(deletions,0);assert.equal(completionChecks,1)}
   assert.equal(generations,1);assert.equal(featureChecks,1);assert.equal(upload.idpromNaturalStudioSkinVersion,undefined);
  }
 }
});
await check('preceding Natural spot policy remains an exact single-call compatibility path',async()=>{
 const raw=await sharp({create:{width:120,height:160,channels:3,background:'#b99a87'}}).jpeg().toBuffer();
 const fields={portraitMode:'female',femaleEyeStyle:'natural',hairId:'original',studioSkinVersion:'studio-original-ai-v4',naturalFinishVersion:NATURAL_STUDIO_SKIN_SPOT_VERSION};let calls=0;
 const pixels=new Uint8Array(32*40*4);for(let y=4;y<36;y++)for(let x=4;x<28;x++)pixels.set([185,154,135,255],(y*32+x)*4);const cutout=await sharp(pixels,{raw:{width:32,height:40,channels:4}}).png().toBuffer();
 await processProductionPortrait({input:{buffer:raw,mimetype:'image/jpeg'},fields,root:new URL('..',import.meta.url).pathname,requestPortrait:async actual=>{calls++;assert.equal(actual.portrait,raw);assert.equal(actual.identity,null);assert(actual.prompt.endsWith('Finish in the same single AI request; no pixel skin filter follows.'));assert.doesNotMatch(actual.prompt,/stable identifying moles\/freckles/);assert.match(actual.prompt,/fine freckle-like speckles/);assert.match(actual.prompt,/quiet soft satin/);assert.match(actual.prompt,/Remove visible dark post-acne spots/);assert.match(actual.prompt,/EYES ARE THE ORIGINAL PHOTOGRAPHED EYES/);assert.match(actual.prompt,/Never apply lipstick/);return {png:cutout}},removeBackground:async image=>image});
 assert.equal(calls,1);validateOriginalPortraitAiFields(fields,'female');
 const previous={...fields,naturalFinishVersion:NATURAL_STUDIO_SKIN_PREVIOUS_VERSION};validateOriginalPortraitAiFields(previous,'female');let previousCalls=0;await processProductionPortrait({input:{buffer:raw,mimetype:'image/jpeg'},fields:previous,root:new URL('..',import.meta.url).pathname,requestPortrait:async actual=>{previousCalls++;assert(actual.prompt.endsWith('Complete all this in this one AI edit.'));assert.match(actual.prompt,/stable identifying moles\/freckles/);assert.doesNotMatch(actual.prompt,/FINAL NATURAL SPOT-REPAIR AUTHORITY/);return {png:cutout}},removeBackground:async image=>image});assert.equal(previousCalls,1);
 for(const bad of [{...fields,naturalFinishVersion:'unknown'},{...fields,femaleEyeStyle:'makeup'},{...fields,studioSkinVersion:'studio-original-ai-v3'}])assert.throws(()=>validateOriginalPortraitAiFields(bad,'female'),e=>e.code==='original_portrait_ai_invalid');
});
await check('current Natural prepares the clothed original then preserves repaired skin and source eyes without makeup',async()=>{
 const raw=await sharp({create:{width:120,height:160,channels:3,background:'#b99a87'}}).jpeg().toBuffer(),prepared=await sharp(raw).png().toBuffer();const pixels=new Uint8Array(32*40*4);for(let y=4;y<36;y++)for(let x=4;x<28;x++)pixels.set([185,154,135,255],(y*32+x)*4);const cutout=await sharp(pixels,{raw:{width:32,height:40,channels:4}}).png().toBuffer();
 for(const failure of [null,1,2]){let calls=0,matted=0;const fields={portraitMode:'female',femaleEyeStyle:'natural',hairId:'original',studioSkinVersion:'studio-original-ai-v4',naturalFinishVersion:NATURAL_STUDIO_SKIN_VERSION};const run=processProductionPortrait({input:{buffer:raw,mimetype:'image/jpeg'},fields,root:new URL('..',import.meta.url).pathname,requestPortrait:async actual=>{calls++;assert.match(actual.prompt,/ORIGINAL EYES LOCK/);if(calls===1){assert.equal(actual.portrait,raw);assert.equal(actual.identity,undefined);assert.match(actual.prompt,/Keep all clothing fully intact/);assert.match(actual.prompt,/DEDICATED NATURAL CLEAR-SKIN/);assert.doesNotMatch(actual.prompt,/Complete soft foundation-like/)}else{assert.equal(actual.portrait,prepared);assert(actual.identity.length>0);assert.match(actual.prompt,/FINAL AI-PREPARED NATURAL PORTRAIT PRIORITY/);assert.doesNotMatch(actual.prompt,/MAKEUP OPTION|Apply the chosen rosy cosmetics|Add the selected rose-pink cosmetics/)}if(calls===failure)throw Error('phase refused');return {png:calls===1?prepared:cutout}},removeBackground:async image=>{matted++;assert.equal(image,cutout);return image}});if(failure){await assert.rejects(run,/phase refused/);assert.equal(calls,failure);assert.equal(matted,0)}else{await run;assert.equal(calls,2);assert.equal(matted,1)}}
});
console.log(JSON.stringify({passed,scope:'Actual production prompt and App acceptance, unchanged makeup fingerprints; inert AI provider only. No external requests or payments. Catchlight/iris colour retention is instructed, not pixel-verified.'}));
