import {THAI_REAL_FACE_VERSION} from '../thai-real-face-policy.js';
import {THAI_COLLARLESS_VERSION} from '../thai-collarless-version.js';
import {ENGLISH_OUTFIT_FIDELITY_VERSION} from '../english-outfit-fidelity-version.js';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import sharp from 'sharp';
import {usesThaiSelectedHair,THAI_SELECTED_HAIR_VERSION,thaiSelectedHairInstruction} from '../thai-selected-hair-policy.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {THAI_BODY_GEOMETRY_VERSION} from '../thai-body-geometry-policy.js';
import {THAI_OUTFIT_APPEARANCE_VERSION} from '../thai-outfit-ai-policy.js';
import {ENGLISH_TEMPLATE_BODY_FINISH_VERSION} from '../english-template-body-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {loadCatalogueHairGuide} from '../catalogue-hair-guide.js';
const root=new URL('..',import.meta.url).pathname;
test('policy is opt-in Thai-only and never restyles keep-current mode',()=>{const f={thaiOutfitAiVersion:'th-full-outfit-ai-v1',thaiSelectedHairVersion:THAI_SELECTED_HAIR_VERSION};assert(usesThaiSelectedHair(f));assert(!usesThaiSelectedHair({...f,keepCurrentHair:'1'}));assert(!usesThaiSelectedHair({thaiSelectedHairVersion:THAI_SELECTED_HAIR_VERSION}));assert(!usesThaiSelectedHair({...f,thaiSelectedHairVersion:undefined}));assert.match(thaiSelectedHairInstruction({id:'selected'}),/Do not gather a bob/)});
test('actual Thai pipeline sends exact original isolated guide bytes and makes only one generation',async()=>{
 const png=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:115,channels:4,background:'#ba9988'}}).png().toBuffer(),left:8,top:13}]).png().toBuffer();
 for(const hairId of ['seedream-01','seedream-40','seedream-19','seedream-03','seedream-28']){
 let calls=0,payload;
 const fields={thaiRealFaceVersion:THAI_REAL_FACE_VERSION,thaiCollarlessVersion:THAI_COLLARLESS_VERSION,englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,thaiOutfitAiVersion:'th-full-outfit-ai-v1',thaiSelectedHairVersion:THAI_SELECTED_HAIR_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION,portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitMode:'female',femaleEyeStyle:'natural',hairReferenceVersion:'picker-hair-v1',hairId,neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png',faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53}),studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,singlePassPortraitVersion:'single-pass-portrait-v1',femaleFinishSingleVersion:'female-single-finish-v1'};
 if(hairId==='seedream-28')Object.assign(fields,{portraitMode:'male',studioSkinVersion:undefined,singlePassPortraitVersion:undefined,neckOutfitReferencePath:'/assets/government-uniforms/male-government-employee.png'});
 // Use the released single-finish marker rather than guessing its value.
 fields.femaleFinishSingleVersion=hairId==='seedream-28'?undefined:(await import('../female-single-finish-policy.js')).FEMALE_SINGLE_FINISH_VERSION;
 await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields,root,key:'fixture',removeBackground:async()=>png,requestPortrait:async options=>{calls++;payload=options;return{png}}});
 assert.equal(calls,1);assert.deepEqual(payload.hair,await loadCatalogueHairGuide(hairId,root));assert.match(payload.prompt,/FINAL EXACT SELECTED HAIRSTYLE/);assert.doesNotMatch(payload.prompt,/COMPACT UNDER-EAR \/ NECK EXCLUSION|LEFT is the complete exact isolated hairstyle|OUTPUT GATE — CLEAN NECK|NO VISIBLE BUN ANYWHERE|No tall hair dome or visible bun/);assert(payload.prompt.endsWith('without another repair call.'));
 }
});
test('actual client checks do not classify short/bob outlines as buns; gathered checks compare selected reference',async()=>{
 const source=await readFile(root+'src/main.jsx','utf8'),a=source.indexOf('async function checkPortraitCompletion('),b=source.indexOf('\n}',a)+2;assert(a>=0&&b>a);
 for(const kind of ['short','bob','gathered'])for(const reference of ['matches','unknown','different']){
 const result={idpromPortraitComposition:'body',idpromThaiRealFaceVersion:'thai'},env={ENGLISH_BODY_PORTRAIT_VERSION:'body',ENGLISH_HEAD_PORTRAIT_VERSION:'head',THAI_REAL_FACE_VERSION:'thai',decodedPortraitImage:async()=>({}),portraitFaceLandmarks:async()=>({152:{x:.5,y:.5}}),PRODUCTION_HAIR_CATALOG:[{id:'selected'}],selectedHairDesign:()=>({kind}),portraitCompletionEvidence:async()=>({target:true}),selectedHairEvidence:async()=>({reference:true}),inspectThaiGatheredBun:e=>{assert.equal(kind,'gathered');return e.target?{measurable:true,retained:true}:{measurable:reference!=='unknown',retained:reference==='matches'}}};
 const check=Function('env','with(env){'+source.slice(a,b)+';return checkPortraitCompletion}')(env);
 await check(null,result,'selected');
 if(kind==='gathered'&&reference!=='matches')assert(result.idpromQualityReviewNeeded);
 }
});
