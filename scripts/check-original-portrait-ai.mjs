import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {ORIGINAL_PORTRAIT_AI_VERSION as V,ORIGINAL_PORTRAIT_AI_PREVIOUS_VERSION as V1,isOriginalPortraitAiVersion,isOriginalPortraitAiRequest,originalAiSkinFinish,hasOriginalPortraitAiFinish,markOriginalPortraitAiFinish,originalPortraitAiMetadata,ORIGINAL_AI_TARGET_PRIORITY} from '../original-portrait-ai.js';
import {prepareStudioSkinInput,parseStudioSkinRequest} from '../studio-skin-input.js';
import {processProductionPortrait,productionPortraitPrompt,validateProductionPortrait} from '../production-portrait-pipeline.js';
import {studioSkinWorkflowMetadata} from '../studio-skin-metadata.js';
import {preserveLocalSkinLook} from '../src/preserve-local-skin-look.js';
import {loadStudioSkinLightReference} from '../studio-skin-light-reference.js';
import {PRODUCTION_HAIR_CATALOG} from '../hairstyle-catalog.js';
import {seedreamReviewPayload} from '../seedream-review-transport.js';
const root=new URL('..',import.meta.url).pathname,styles=['natural','makeup','korean-rosy-v1','soft-rosy-v1'];
let passed=0;const reports=[];
async function check(name,run){await run();passed++;reports.push(name);console.log('PASS '+name)}
const raw=await sharp({create:{width:160,height:200,channels:3,background:'#b69583'}}).jpeg({quality:92}).withMetadata({orientation:6}).toBuffer();
const input={buffer:raw,mimetype:'image/jpeg',originalname:'unmodified-camera.jpg'},fields=style=>({portraitMode:'female',hairId:'original',femaleEyeStyle:style,studioSkinVersion:V});
const hash=value=>createHash('sha256').update(value).digest('hex');
await check('original JPEG including EXIF remains byte-exact through the production preparation boundary',async()=>{
 for(const version of [V1,V])for(const style of styles){const f={...fields(style),studioSkinVersion:version};assert.equal(parseStudioSkinRequest(f,'female'),null);const prepared=await prepareStudioSkinInput(input,f,'female');assert.equal(prepared.input,input);assert.equal(prepared.input.buffer,raw);assert.equal(prepared.staged,false);assert.equal((await sharp(raw).metadata()).orientation,6)}
 for(const patch of [{portraitMode:'male'},{femaleEyeStyle:'unknown'},{studioSkinEvidence:'{}'}])assert.throws(()=>validateProductionPortrait(input,{...fields('natural'),...patch}));
});
await check('v1 request fingerprints stay exact while v2 adds only an identity-free target and final light authority',async()=>{
 const native=new Uint8Array(32*40*4);for(let y=4;y<36;y++)for(let x=4;x<28;x++)native.set([189,154,134,255],(y*32+x)*4);
 const cutout=await sharp(native,{raw:{width:32,height:40,channels:4}}).png().toBuffer(),guide=await loadStudioSkinLightReference(root);
 // Natural fingerprints include main 73f579a’s released source-eyes policy.
 // Makeup fingerprints remain the exact original pre-v2 release values.
 const v1Hashes={
  natural:['eeb47c0049e1ee377b191848e1f815d7b513c99bd2c643d5e32f3c42a9519892','5d2b7daebd200f358c7f363c42efdda2291576f1c6c7221e6a9d2e33705fc124','e362b9cca3ce181b774d7968208f319a90d51761908da28b713b414873ccb716'],
  makeup:['55140450700ca64f7355069c5c3530e4a0ff91a1eb15818d394e17b8616b9553','2c6f4fd9bb4c3b4c3b04ea497f171ff7bcece5fb048eaebb0b780adda446c7cb','73a25253e8b7a2d5e0d5fbdd8bdc4c9810982f57287150e9985382ead05980d9'],
  'korean-rosy-v1':['55140450700ca64f7355069c5c3530e4a0ff91a1eb15818d394e17b8616b9553','2c6f4fd9bb4c3b4c3b04ea497f171ff7bcece5fb048eaebb0b780adda446c7cb','73a25253e8b7a2d5e0d5fbdd8bdc4c9810982f57287150e9985382ead05980d9'],
  'soft-rosy-v1':['1f1a16a242a4864ba6e223d4537c5acc0b79f5eda6ac06500b7f8506a192b964','5ee7e2be6d57e40d4d0c6020263a21a436ebee4c9f8591e213e2a89912409281','a9b6d742f548897e3aec6926bd44a2dfefec7e15e3280eef48a67d52addc6729']
 };
 const hairOptions=['original','seedream-19','hair-21'];
 for(const version of [V1,V])for(const style of styles)for(const hair of hairOptions){
  let calls=0,actual,matting=0;const stages=[];
  await processProductionPortrait({input,fields:{...fields(style),studioSkinVersion:version,hairId:hair},root,onStage:async s=>stages.push(s),requestPortrait:async options=>{calls++;actual=options;return {png:cutout}},removeBackground:async image=>{matting++;assert.deepEqual(image,cutout);return image}});
  assert.equal(calls,1);assert.equal(matting,1);assert.equal(actual.portrait,raw);assert.equal(actual.portraitMime,'image/jpeg');assert.equal(actual.identity,null);assert.equal(actual.outfit,undefined);assert.equal(Boolean(actual.hair),hair!=='original');assert(!stages.includes('skin-base'));assert.match(actual.prompt,/Image 1 is the untouched original photograph/);assert.doesNotMatch(actual.prompt,/PREPARED PHOTO-STUDIO SKIN BASE|Selected cosmetics are separate local|local cosmetics happen only after/);
  if(style==='natural')assert.match(actual.prompt,/NATURAL OPTION/);else assert.match(actual.prompt,/MAKEUP OPTION — COMPLETE HERE/);
  if(version===V1){
   assert.equal(actual.skinReference,undefined);
   const digest=hash(JSON.stringify({prompt:actual.prompt,size:actual.size,portrait:hash(actual.portrait),portraitMime:actual.portraitMime,hair:actual.hair?hash(actual.hair):null,identity:actual.identity?hash(actual.identity):null,skinReference:actual.skinReference?hash(actual.skinReference):null,outfit:actual.outfit?hash(actual.outfit):null}));
   assert.equal(digest,v1Hashes[style][hairOptions.indexOf(hair)],style+' '+hair+' v1 payload changed');
  }else{
   assert.deepEqual(actual.skinReference,guide);assert.match(actual.prompt,new RegExp('LIGHT TARGET — IMAGE '+(hair==='original'?2:3)+', THE LAST IMAGE'));
   assert(actual.prompt.endsWith(ORIGINAL_AI_TARGET_PRIORITY));assert.doesNotMatch(actual.prompt,/matching the original skin tone, texture and lighting|stable marks, complexion, lighting, chosen makeup/);
   assert.match(actual.prompt,/never copy a swatch's RGB colour/);assert.match(actual.prompt,/Apply the selected .*same AI generation|Natural finish without added cosmetics/);
   const payload=seedreamReviewPayload(actual);assert.equal(payload.image.length,hair==='original'?2:3);assert.equal(payload.image[0],'data:image/jpeg;base64,'+raw.toString('base64'));assert.equal(payload.image.at(-1),'data:image/jpeg;base64,'+guide.toString('base64'));
  }
 }
});
await check('every released v1 female base prompt keeps its exact fingerprint',async()=>{
 const selected=[{gender:'female'},...PRODUCTION_HAIR_CATALOG.filter(s=>s.gender==='female')],expected={natural:'826944d7c700f655c0de7e05140a7da9919ee7719f006d592939c1153efbc3a2',makeup:'040a5a2d1f0ce429681f89e9195d2cd380a1ddb909056f3c5fb54cefc87b718c','korean-rosy-v1':'040a5a2d1f0ce429681f89e9195d2cd380a1ddb909056f3c5fb54cefc87b718c','soft-rosy-v1':'f876460621cc16f147f73a165f650cda195d651447a7ad808879a798e381177f'};
 for(const style of styles)assert.equal(hash(JSON.stringify(selected.map(s=>productionPortraitPrompt(s,style,{studioSkinVersion:V1})))),expected[style]);
});
await check('Natural and Makeup have explicit different AI cosmetic instructions without a shared local bare-base marker',async()=>{
 assert.notEqual(productionPortraitPrompt({gender:'female'},'natural',fields('natural')),productionPortraitPrompt({gender:'female'},'makeup',fields('makeup')));
 for(const style of styles){const original=new Blob(['upload']),blob=markOriginalPortraitAiFinish(new Blob(['AI output']),style);assert(hasOriginalPortraitAiFinish(blob,style));assert.deepEqual(studioSkinWorkflowMetadata(blob),originalPortraitAiMetadata(blob));assert.equal(blob.idpromStudioSkinBaseSource,undefined);assert.deepEqual(studioSkinWorkflowMetadata(original),{});if(style!=='natural')assert(!hasOriginalPortraitAiFinish(blob,'natural'))}
 assert(!hasOriginalPortraitAiFinish({studioSkinVersion:'studio-skin-stages-v5'},'natural'));
});
await check('v1 metadata and actual completion versions remain readable without becoming current v2 cache entries',async()=>{
 for(const style of styles){
  const blob=markOriginalPortraitAiFinish(new Blob(['released v1 output']),style,V1);assert.equal(blob.idpromStudioSkinVersion,V1);assert(!hasOriginalPortraitAiFinish(blob,style));
  const expected={studioSkinVersion:V1,...(style==='natural'?{}:{studioCosmeticsVersion:V1+':'+style})};assert.deepEqual(originalPortraitAiMetadata(blob),expected);assert.deepEqual(studioSkinWorkflowMetadata(blob),expected);assert.equal(blob.idpromStudioSkinBaseSource,undefined);
 }
 assert.throws(()=>markOriginalPortraitAiFinish(new Blob(['x']),'natural','unreleased-version'));
 assert(isOriginalPortraitAiRequest({studioSkinVersion:V1}));assert(isOriginalPortraitAiRequest({studioSkinVersion:V}));assert(!isOriginalPortraitAiVersion('studio-skin-stages-v5'));
});
await check('new AI results bypass automatic restoration of earlier local skin/makeup recipes',async()=>{
 const replacement={portraitMode:'female',femaleEyeStyle:'makeup',studioSkinVersion:V,source:'untouched-new-AI-image'},previous={portraitMode:'female',femaleEyeStyle:'makeup',makeupStyles:{look:'local-korean-pink-eye-v1'},makeupIntensity:100};
 const fail=()=>{throw Error('local cosmetic path must not run')};assert.equal(await preserveLocalSkinLook(previous,replacement,{render:fail,mix:fail,toSource:fail}),replacement);
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');assert(!main.includes('onLocalPortraitFinish={changeStudioPortraitFinish}'));
});
await check('actual App completion wrapper performs no skin filters or cosmetic renderer on original-AI results',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),a=main.indexOf('async function aiFinishPortrait('),b=main.indexOf('\nasync function aiFinishPortraitUncached(',a);assert(a>=0&&b>a);
 for(const version of [V1,V])for(const style of ['natural','makeup','korean-rosy-v1']){
  const upload=new Blob(['original']),completed=markOriginalPortraitAiFinish(new Blob(['already finished AI pixels']),style,version),operation={cancelled:false};let unfiltered=0,cleanup=0;
  const forbidden=()=>{throw Error('No local skin or cosmetics may execute on this route')};
  const env={isOriginalPortraitAiVersion,isOriginalPortraitAiRequest,hasOriginalPortraitAiFinish,markOriginalPortraitAiFinish,window:{dispatchEvent(){}},CustomEvent:class{},activeProcessOperation:operation,assertProcessActive:()=>{},cancelledProcessError:()=>Error('cancelled'),PRODUCTION_HAIR_CATALOG:[],portraitFinishChoice:(v,f)=>v||f||'natural',currentResultCacheScope:()=> 'fixture',resultSourceDigest:async()=> 'raw-source-sha',uploadGenerationScope:()=> 'upload',HAIR_DESIGN_VERSION:'hair',NATURAL_STUDIO_SKIN_VERSION:'natural',STUDIO_SKIN_WORKFLOW_VERSION:'studio-skin-stages-v5',ORIGINAL_PORTRAIT_AI_VERSION:V,
   portraitResultCache:{async get(key,create){assert(key.includes(V));return {value:await create(),reused:false}},delete(){}},aiFinishPortraitUncached:async original=>{assert.equal(original,upload);unfiltered++;return completed},cleanPortraitClothing:async blob=>{assert.equal(blob,completed);cleanup++;return blob},finishSharedStudioSkin:forbidden,finishFemaleMakeupSoftFocusBlob:forbidden,prepareStudioMakeup:forbidden,checkPortraitProportions:async()=>{},checkPortraitCompletion:async()=>{}};
  const fn=Function('env','with(env){'+main.slice(a,b)+';return aiFinishPortrait}')(env),result=await fn(upload,'original',{portraitMode:'female',femaleEyeStyle:style});assert.equal(result,completed);assert.equal(unfiltered,1);assert.equal(cleanup,1);assert.equal(await result.text(),'already finished AI pixels');assert.equal(upload.idpromStudioSkinVersion,undefined);
 }
});
console.log(JSON.stringify({passed,reports,scope:'Exact original bytes, actual production request and App completion, one inert provider call, v2 identity-free guide and final light authority, frozen v1 prompts/payloads, both-version completion, AI makeup distinction, cache metadata and no automatic local skin/cosmetic restoration. No external requests, accounts or payments.'}));
