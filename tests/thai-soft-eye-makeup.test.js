import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {THAI_SOFT_EYE_MAKEUP_VERSION,thaiSoftEyeMakeupInstruction as grooming} from '../thai-soft-eye-makeup.js';
import {THAI_OUTFIT_AI_VERSION,THAI_OUTFIT_APPEARANCE_VERSION} from '../thai-outfit-ai-policy.js';
import {THAI_BODY_GEOMETRY_VERSION} from '../thai-body-geometry-policy.js';
import {THAI_FEMALE_HEAD_SIZE_VERSION} from '../thai-female-head-size.js';
import {THAI_REAL_FACE_VERSION} from '../thai-real-face-policy.js';
import {THAI_COLLARLESS_VERSION} from '../thai-collarless-version.js';
import {ENGLISH_OUTFIT_FIDELITY_VERSION} from '../english-outfit-fidelity-version.js';
import {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION} from '../english-template-body-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {createMakeupRequestAudit} from '../makeup-generation-audit.js';
import {generateMakeupFromCompletedNatural} from '../natural-master-makeup.js';
const marker={thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,portraitMode:'female',femaleEyeStyle:'makeup',thaiSoftEyeMakeupVersion:THAI_SOFT_EYE_MAKEUP_VERSION};
const image=()=>sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:{create:{width:80,height:115,channels:4,background:'#bd9887'}},left:8,top:13}]).png().toBuffer();
test('light grooming only opts in explicit new Thai female Makeup; Natural, male, English and archived prompts stay unchanged',()=>{
 const policy=grooming(marker);assert(policy);
 for(const change of [{femaleEyeStyle:'natural'},{portraitMode:'male'},{thaiOutfitAiVersion:undefined,interfaceLanguage:'en'},{thaiSoftEyeMakeupVersion:undefined},{thaiSoftEyeMakeupVersion:'unknown'}])assert.equal(grooming({...marker,...change}),'');
 for(const text of ['existing brow hairs','tiny gaps inside the original brow','very thin natural mascara tint','hairline-thin soft brown line','existing catchlights','No false lashes','No wing','SAME original image-generation call'])assert(policy.includes(text),text);
});
test('actual new Makeup keeps identical face/hair/outfit conditioning, appends only light grooming and uses one provider call',async()=>{
 const png=await image(),root=new URL('..',import.meta.url).pathname;
 const base={...marker,thaiSoftEyeMakeupVersion:undefined,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION,thaiFemaleHeadSizeVersion:THAI_FEMALE_HEAD_SIZE_VERSION,thaiRealFaceVersion:THAI_REAL_FACE_VERSION,thaiCollarlessVersion:THAI_COLLARLESS_VERSION,englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,englishStudioFinishVersion:ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,portraitComposition:'en-outfit-body-v1',hairReferenceVersion:'picker-hair-v1',hairId:'seedream-14',neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png',faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53}),studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,singlePassPortraitVersion:'single-pass-portrait-v1',femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION};
 for(const finish of ['makeup','natural']){
  let old;
  for(const enabled of [false,true]){
   const fields={...base,femaleEyeStyle:finish,...(enabled?{thaiSoftEyeMakeupVersion:THAI_SOFT_EYE_MAKEUP_VERSION}:{})};let calls=0,request;
   const audit=createMakeupRequestAudit(async args=>{calls++;request=args;return {png}},{requirePolicy:finish==='makeup'});
   await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields,root,key:'inert',removeBackground:async()=>png,requestPortrait:audit.requestPortrait});
   assert.equal(calls,1);assert.equal(request.singleAttempt,true);
   if(!enabled)old=request;else{
    assert(request.portrait.equals(old.portrait));assert(request.identity.equals(old.identity));assert(request.outfit.equals(old.outfit));assert(request.hair.equals(old.hair));
    assert.equal(request.prompt,old.prompt+grooming(fields));
    if(finish==='makeup'){assert(request.prompt.includes('FRONTAL CAMERA AND HEAD-NECK POSTURE'));assert(request.prompt.endsWith(grooming(fields)));}else assert.equal(request.prompt,old.prompt);
   }
  }
 }
});
test('Natural-to-Makeup adds the same subtle grooming in its single existing edit, without changing the approved source',async()=>{
 const png=await image();let old;
 for(const enabled of [false,true]){
  let request,calls=0;
  const fields={...marker,femaleEyeStyle:'natural',femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION,thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION,...(!enabled?{thaiSoftEyeMakeupVersion:undefined}:{})};
  await generateMakeupFromCompletedNatural({natural:png,fields,key:'inert',requestPortrait:async args=>{calls++;request=args;return {png}}});
  assert.equal(calls,1);assert.equal(request.singleAttempt,true);if(!enabled)old=request;else {assert(request.portrait.equals(old.portrait));assert.equal(request.prompt,old.prompt+grooming(marker));}
 }
});
