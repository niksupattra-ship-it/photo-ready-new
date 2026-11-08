import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {ORIGINAL_PORTRAIT_AI_VERSION,ORIGINAL_PORTRAIT_AI_PREVIOUS_VERSION,validateOriginalPortraitAiFields,isOriginalPortraitAiRequest,originalAiSkinFinish,markOriginalPortraitAiFinish} from '../original-portrait-ai.js';
import {NATURAL_STUDIO_SKIN_VERSION} from '../natural-studio-skin.js';
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
 for(const version of [ORIGINAL_PORTRAIT_AI_PREVIOUS_VERSION,ORIGINAL_PORTRAIT_AI_VERSION])for(const hairId of ['original','seedream-19']){
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

await check('actual App wrapper rejects natural eye drift, evicts rejected output and keeps other modes unchanged',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const a=main.indexOf('async function aiFinishPortrait('),b=main.indexOf('\nasync function aiFinishPortraitUncached(',a);assert(a>=0&&b>a);
 for(const [gender,style,protectedEyes] of [['female','natural',true],['female','makeup',true],['female','korean-rosy-v1',false],['male','natural',false]]){
  for(const drift of [false,true]){
   const upload=new Blob(['untouched upload']),operation={cancelled:false},finished=gender==='female'?markOriginalPortraitAiFinish(new Blob(['generated pixels']),style):new Blob(['generated pixels']);
   let generations=0,deletions=0,completionChecks=0,featureChecks=0;
   const eyeError=Object.assign(Error('source eye geometry changed'),{code:'portrait_features_changed'});
   const forbidden=()=>{throw Error('local skin or cosmetics must not execute')};
   const env={isOriginalPortraitAiRequest,window:{dispatchEvent(){}},CustomEvent:class{},activeProcessOperation:operation,assertProcessActive(){},cancelledProcessError:()=>Error('cancelled'),PRODUCTION_HAIR_CATALOG:[],portraitFinishChoice:(v,f)=>v||f||'natural',currentResultCacheScope:()=> 'account',resultSourceDigest:async()=> 'upload-sha',uploadGenerationScope:()=> 'upload',HAIR_DESIGN_VERSION:'hair',NATURAL_STUDIO_SKIN_VERSION,ORIGINAL_PORTRAIT_AI_VERSION,STUDIO_SKIN_WORKFLOW_VERSION:'studio-skin-stages-v5',
    portraitResultCache:{async get(key,create){if(gender==='female'&&style==='natural')assert(key.includes(NATURAL_STUDIO_SKIN_VERSION));return {value:await create(),reused:false}},delete(){deletions++}},
    aiFinishPortraitUncached:async source=>{assert.equal(source,upload);generations++;return finished},cleanPortraitClothing:async image=>image,finishSharedStudioSkin:forbidden,finishFemaleMakeupSoftFocusBlob:forbidden,
    checkPortraitProportions:async(source,image,options)=>{featureChecks++;assert.equal(source,upload);assert.equal(options.protectFeatures,protectedEyes);if(drift&&options.protectFeatures)throw eyeError},checkPortraitCompletion:async()=>{completionChecks++}};
   const run=Function('env','with(env){'+main.slice(a,b)+';return aiFinishPortrait}')(env);
   if(drift&&protectedEyes){await assert.rejects(run(upload,'original',{portraitMode:gender,femaleEyeStyle:style}),e=>e===eyeError);assert.equal(deletions,1);assert.equal(completionChecks,0)}
   else{assert.equal(await run(upload,'original',{portraitMode:gender,femaleEyeStyle:style}),finished);assert.equal(deletions,0);assert.equal(completionChecks,1)}
   assert.equal(generations,1);assert.equal(featureChecks,1);assert.equal(upload.idpromNaturalStudioSkinVersion,undefined);
  }
 }
});
await check('current Natural clear-skin policy reaches final priority and keeps one AI call',async()=>{
 const raw=await sharp({create:{width:120,height:160,channels:3,background:'#b99a87'}}).jpeg().toBuffer();
 const fields={portraitMode:'female',femaleEyeStyle:'natural',hairId:'original',studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,naturalFinishVersion:NATURAL_STUDIO_SKIN_VERSION};let calls=0;
 const pixels=new Uint8Array(32*40*4);for(let y=4;y<36;y++)for(let x=4;x<28;x++)pixels.set([185,154,135,255],(y*32+x)*4);const cutout=await sharp(pixels,{raw:{width:32,height:40,channels:4}}).png().toBuffer();
 await processProductionPortrait({input:{buffer:raw,mimetype:'image/jpeg'},fields,root:new URL('..',import.meta.url).pathname,requestPortrait:async actual=>{calls++;assert.equal(actual.portrait,raw);assert.equal(actual.identity,null);assert(actual.prompt.endsWith('Complete all this in this one AI edit.'));assert.match(actual.prompt,/Remove visible dark post-acne spots/);assert.match(actual.prompt,/EYES ARE THE ORIGINAL PHOTOGRAPHED EYES/);assert.match(actual.prompt,/Never apply lipstick/);return {png:cutout}},removeBackground:async image=>image});
 assert.equal(calls,1);validateOriginalPortraitAiFields(fields,'female');
 for(const bad of [{...fields,naturalFinishVersion:'unknown'},{...fields,femaleEyeStyle:'makeup'},{...fields,studioSkinVersion:'studio-original-ai-v3'}])assert.throws(()=>validateOriginalPortraitAiFields(bad,'female'),e=>e.code==='original_portrait_ai_invalid');
});
console.log(JSON.stringify({passed,scope:'Actual production prompt and App acceptance, unchanged makeup fingerprints; inert AI provider only. No external requests or payments. Catchlight/iris colour retention is instructed, not pixel-verified.'}));
