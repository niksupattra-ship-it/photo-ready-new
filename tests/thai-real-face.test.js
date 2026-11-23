import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {applyThaiRealFacePolicy,THAI_REAL_FACE_VERSION} from '../thai-real-face-policy.js';
import {THAI_OUTFIT_AI_VERSION} from '../thai-outfit-ai-policy.js';
import {MAKEUP_STUDIO_RETOUCH_POLICY} from '../makeup-studio-retouch-policy.js';
const fields={thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiRealFaceVersion:THAI_REAL_FACE_VERSION};
test('English and archived Thai prompt bytes remain unchanged without explicit new Thai version',()=>{
 for(const request of [{},{interfaceLanguage:'en',thaiRealFaceVersion:THAI_REAL_FACE_VERSION},{thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION},{...fields,thaiRealFaceVersion:'unknown'}])assert.equal(applyThaiRealFacePolicy(MAKEUP_STUDIO_RETOUCH_POLICY,request),MAKEUP_STUDIO_RETOUCH_POLICY);
});
test('new Thai makeup drops eye/lash/brow beautification conflicts and gives original eyes and anatomy final priority',()=>{
 const prompt=applyThaiRealFacePolicy(MAKEUP_STUDIO_RETOUCH_POLICY,fields);
 for(const forbidden of ['elegantly lifted individual lashes','fuller-looking individual lashes','Groom and softly fill both eyebrows','Check that both cosmetic brow shapes read','clean, curled individual lashes'])assert(!prompt.includes(forbidden),forbidden);
 for(const required of ['iris/pupil shapes, sizes and colours','original catchlight pattern','Never slim, squeeze, narrow','Never stretch its axes separately','realistic photographic pores','natural asymmetry','Selected Makeup may softly correct temporary blemishes','pink-nude'])assert(prompt.includes(required),required);
 assert(prompt.endsWith('inside this same original generation.'));
});
test('new Thai Natural preserves original prompt text and adds protection without adding makeup',()=>{
 const natural='Natural portrait with original face, real pores and unchanged lip colour.';
 const prompt=applyThaiRealFacePolicy(natural,fields);assert(prompt.startsWith(natural));assert(prompt.includes('Selected Makeup may'),'Cosmetics remain conditional, never forced on Natural');
});
test('request and both cache identities carry the new revision without changing original-upload generation',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert(main.includes("fd.append('thaiRealFaceVersion',THAI_REAL_FACE_VERSION)"));
 assert.equal((main.match(/thaiWholeOutfit\?\[THAI_OUTFIT_APPEARANCE_VERSION,THAI_SINGLE_COLLAR_VERSION,THAI_REAL_FACE_VERSION,THAI_COLLARLESS_VERSION\]/g)||[]).length,2);
 const pipeline=await readFile(new URL('../production-portrait-pipeline.js',import.meta.url),'utf8');
 assert(pipeline.indexOf('prompt=applyThaiRealFacePolicy(prompt,fields)')<pipeline.indexOf('const result=await requestPortrait({key,prompt,'));
});
test('actual new Thai full-outfit request ends with the face/eye, no-bun and full-frame contract inside one provider call',async()=>{
 const sharp=(await import('sharp')).default;
 const {processProductionPortrait}=await import('../production-portrait-pipeline.js');
 const {createMakeupRequestAudit}=await import('../makeup-generation-audit.js');
 const {THAI_OUTFIT_APPEARANCE_VERSION}=await import('../thai-outfit-ai-policy.js');
 const {ENGLISH_OUTFIT_FIDELITY_VERSION}=await import('../english-outfit-fidelity-version.js');
 const {ORIGINAL_PORTRAIT_AI_VERSION}=await import('../original-portrait-ai.js');
 const {SINGLE_PASS_PORTRAIT_VERSION}=await import('../single-pass-portrait-policy.js');
 const {FEMALE_SINGLE_FINISH_VERSION}=await import('../female-single-finish-policy.js');
 const {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION}=await import('../english-template-body-policy.js');
 const {thaiFinalOriginalIdentity,THAI_REAL_FACE_PREVIOUS_VERSION}=await import('../thai-real-face-policy.js');
 const png=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:115,channels:4,background:'#bd9788'}}).png().toBuffer(),left:8,top:13}]).png().toBuffer();
 const base={...fields,faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53}),englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,portraitMode:'female',femaleEyeStyle:'makeup',studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,singlePassPortraitVersion:SINGLE_PASS_PORTRAIT_VERSION,femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION,neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png',hairId:'seedream-79',hairReferenceVersion:'picker-hair-v1'};
 for(const version of [THAI_REAL_FACE_VERSION,THAI_REAL_FACE_PREVIOUS_VERSION]){
  const calls=[],input={buffer:png,mimetype:'image/png'},request={...base,thaiRealFaceVersion:version};
  const audit=createMakeupRequestAudit(async p=>{calls.push(p);return {png}},{requirePolicy:true});
  await processProductionPortrait({input,fields:request,root:new URL('..',import.meta.url).pathname,key:'inert',removeBackground:async()=>png,requestPortrait:audit.requestPortrait});
  assert.equal(calls.length,1);assert.equal(audit.snapshot().providerCalls,1);
  assert.match(calls[0].prompt,/FEMALE HAIR LIGHTNESS.*ADDITIONAL 15% REDUCTION/);
  assert.match(calls[0].prompt,/85% of the previous light-hair target/);
  assert.match(calls[0].prompt,/CROWN HEIGHT — ANATOMICAL SCALP AUTHORITY/);
  assert.equal(calls[0].thaiRealFaceVersion,version);assert(calls[0].portrait?.length);assert(input.buffer.equals(png),'Untouched original identity bytes must not be rewritten');
  if(version===THAI_REAL_FACE_VERSION)assert(calls[0].prompt.endsWith(thaiFinalOriginalIdentity(request)));
  else assert(!calls[0].prompt.includes('THAI PHOTOGRAPHIC IDENTITY AND COMPLETE FRAME — FINAL V2 CONTRACT'));
 }
});
