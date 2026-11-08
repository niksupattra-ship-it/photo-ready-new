import assert from 'node:assert/strict';
import sharp from 'sharp';
import {processProductionPortrait,validateProductionPortrait,productionPortraitPrompt} from '../production-portrait-pipeline.js';
import {femaleHairFirstSkinPrompt,FEMALE_HAIR_FIRST_VERSION} from '../female-hair-first-portrait.js';
import {ORIGINAL_PORTRAIT_AI_VERSION,hasOriginalPortraitAiFinish,isOriginalPortraitAiRequest,needsOriginalAiSkinPreparation,needsOriginalAiSkinPolish,markOriginalPortraitAiFinish,originalPortraitAiMetadata} from '../original-portrait-ai.js';
import {NATURAL_STUDIO_SKIN_VERSION} from '../natural-studio-skin.js';
import {boundedHairInstruction} from '../portrait-anatomy.js';
import {PRODUCTION_HAIR_CATALOG} from '../hairstyle-catalog.js';
import {seedreamReviewPayload} from '../seedream-review-transport.js';
import {sharedOriginalPortraitSource,SHARED_PORTRAIT_BASE_VERSION} from '../shared-portrait-policy.js';
const root=new URL('..',import.meta.url).pathname,styles=['natural','makeup','korean-rosy-v1','soft-rosy-v1'];
const input={buffer:await sharp({create:{width:120,height:160,channels:3,background:'#b99b83'}}).jpeg().withMetadata({orientation:1}).toBuffer(),mimetype:'image/jpeg'};
const head=await sharp({create:{width:120,height:160,channels:3,background:'#aa8b73'}}).png().toBuffer();
const pixels=new Uint8Array(120*160*4);for(let y=10;y<150;y++)for(let x=20;x<100;x++)pixels.set([190,160,140,255],(y*120+x)*4);
const finished=await sharp(pixels,{raw:{width:120,height:160,channels:4}}).png().toBuffer();
const fields=(style='natural',hairId='original')=>({portraitMode:'female',studioSkinVersion:FEMALE_HAIR_FIRST_VERSION,femaleEyeStyle:style,hairId,...(style==='natural'?{naturalFinishVersion:NATURAL_STUDIO_SKIN_VERSION}:{})});
let passed=0;const check=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
await check('V6 is current, rejects male use, invalidates old result caches and needs finish rather than preparation',()=>{
 assert.equal(ORIGINAL_PORTRAIT_AI_VERSION,FEMALE_HAIR_FIRST_VERSION);
 for(const style of styles){const f=fields(style);validateProductionPortrait(input,f);assert(isOriginalPortraitAiRequest(f));assert(needsOriginalAiSkinPolish(f));assert(!needsOriginalAiSkinPreparation(f));
  assert(!hasOriginalPortraitAiFinish({studioSkinVersion:'studio-original-ai-v5',studioCosmeticsVersion:'studio-original-ai-v5:'+style},style));
  const blob=markOriginalPortraitAiFinish(new Blob(['done']),style);assert(hasOriginalPortraitAiFinish(blob,style));assert.equal(originalPortraitAiMetadata(blob).studioSkinVersion,FEMALE_HAIR_FIRST_VERSION);
 }
 assert.throws(()=>validateProductionPortrait(input,{...fields(),portraitMode:'male'}));
});
await check('all finish modes and default/catalogue/free hair run original head first, completed head skin second, final matting only',async()=>{
 for(const style of styles)for(const hairId of ['original','seedream-42','hair-21']){
  const f=fields(style,hairId),stages=[],calls=[];
  await processProductionPortrait({input,fields:f,root,key:'inert',onStage:async s=>stages.push(s),requestPortrait:async p=>{
   calls.push(p);const wire=seedreamReviewPayload(p);
   assert.equal(wire.size,'2K');assert.equal(wire.model,'dola-seedream-5-0-flash-260915');
   if(calls.length===1){
    assert.equal(p.portrait,input.buffer);assert.equal(p.portraitMime,input.mimetype);assert(p.identity?.length);assert(p.neckReference?.length);assert.equal(p.skinReference,undefined);
    assert.equal(Boolean(p.hair),hairId!=='original');assert.equal(wire.image.length,hairId==='original'?3:4);assert.match(p.prompt,/defer skin retouch/);assert.match(p.prompt,/WIDE, DEEP/);assert.doesNotMatch(p.prompt,/PREPARED SKIN|FINAL AI-PREPARED/);return {png:head};
   }
   assert.equal(calls.length,2);assert.equal(p.portrait,head);assert.equal(p.portraitMime,'image/png');assert(p.skinReference?.length);
   for(const k of ['identity','hair','neckReference','outfit','makeup'])assert.equal(p[k],undefined);
   assert.equal(wire.image.length,2);assert.match(p.prompt,/REMOVE ALL moles, freckles/);assert.match(p.prompt,/no mole, freckle or stable-mark preservation exception/);assert.match(p.prompt,/LOCK THE COMPLETED HAIR AND GEOMETRY/);
   assert.match(p.prompt,style==='natural'?/NATURAL:/:/MAKEUP:/);return {png:finished};
  },removeBackground:async p=>{assert.equal(p,finished);assert.equal(calls.length,2);return p}});
  assert.equal(calls.length,2);assert.deepEqual(stages,['generation','skin-finish','matting','edges']);
 }
});
await check('skin cleanup removes all mark categories but protects facial anatomy and the completed hair/neck silhouette',()=>{
 for(const style of styles){const p=femaleHairFirstSkinPrompt(style);for(const text of ['moles','freckles','black/dark spots','red spots','active/raised acne','acne scars/marks','permanent or identifying skin spots','ENTIRE neck/clavicle backing','hairline','U-backing boundary','gaze','catchlights','eyelid borders/folds'])assert(p.includes(text),text);
  assert.doesNotMatch(p,/preserve (?:stable|distinctive|permanent|identifying) (?:moles|marks|freckles)/i);
  assert.match(p,/Do not make a cutout or change the background/i);
 }
});
await check('head/skin failure, empty output and changed output dimensions stop atomically without retries or matting',async()=>{
 for(const failure of ['head-throw','skin-throw','head-empty','skin-empty','size']){
  let calls=0,matting=0;const wrong=await sharp({create:{width:60,height:80,channels:3,background:'#aaa'}}).png().toBuffer();
  await assert.rejects(processProductionPortrait({input,fields:fields(),root,key:'inert',onStage:async()=>{},requestPortrait:async()=>{
   calls++;if(failure==='head-throw'&&calls===1||failure==='skin-throw'&&calls===2)throw Error('provider refused');
   if(failure==='head-empty'&&calls===1||failure==='skin-empty'&&calls===2)return {};
   return {png:calls===1?head:failure==='size'?wrong:finished};
  },removeBackground:async p=>{matting++;return p}}));
  assert.equal(calls,failure.startsWith('head')?1:2);assert.equal(matting,0);
 }
});
await check('every female hair design keeps the exact existing construction wording',()=>{
 for(const selected of [{gender:'female'},...PRODUCTION_HAIR_CATALOG.filter(h=>h.gender==='female')]){
  const p=productionPortraitPrompt(selected,'natural',fields());assert(p.includes(boundedHairInstruction(selected)));
 }
});
await check('saved V5 and V6 shared bases retain their real version and both remain readable',()=>{
 for(const version of ['studio-original-ai-v5',FEMALE_HAIR_FIRST_VERSION]){
  const blob=markOriginalPortraitAiFinish(new Blob([finished]),'natural',version),source='data:image/png;base64,'+finished.toString('base64');
  blob.idpromSharedPortraitBaseVersion=SHARED_PORTRAIT_BASE_VERSION;blob.idpromStudioSkinBaseSource=source;
  assert.equal(sharedOriginalPortraitSource(blob),source);assert.equal(originalPortraitAiMetadata(blob).studioSkinVersion,version);
 }
});
console.log(JSON.stringify({passed,scope:'Actual V6 production orchestration and transport payload ordering with inert provider calls; failure atomicity, unchanged hair construction, feature locks, full mark cleanup instructions, version/cache/saved-work compatibility. No paid provider or customer requests; visual model fidelity is not established by these checks.'}));
