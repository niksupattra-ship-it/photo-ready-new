import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {PRODUCTION_HAIR_CATALOG,THAI_FREE_FEMALE_HAIR_IDS,THAI_FREE_MALE_HAIR_IDS,firstGenerationHairFor,productionHair} from '../hairstyle-catalog.js';
import {basicThaiHairRequestAllowed} from '../thai-basic-ai-policy.js';
import {englishProfessionalDefaultHair} from '../english-auto-hair.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {THAI_OUTFIT_AI_VERSION,THAI_OUTFIT_APPEARANCE_VERSION} from '../thai-outfit-ai-policy.js';
import {ENGLISH_TEMPLATE_BODY_FINISH_VERSION} from '../english-template-body-policy.js';
import {ENGLISH_OUTFIT_FIDELITY_VERSION} from '../english-outfit-fidelity-version.js';

test('the pictured half-up becomes free second, previous braided second becomes Diamond, and male first is real AI Picks',()=>{
 assert.deepEqual(THAI_FREE_FEMALE_HAIR_IDS,['seedream-14','seedream-42','seedream-79']);
 assert(!THAI_FREE_FEMALE_HAIR_IDS.includes('seedream-16'));assert(!productionHair('seedream-16').hidden);
 assert.deepEqual(THAI_FREE_MALE_HAIR_IDS,['thai-male-auto','seedream-36','seedream-28']);
 assert.equal(firstGenerationHairFor('male',true),'thai-male-auto');assert.equal(firstGenerationHairFor('male',false),'');
 const item=productionHair('thai-male-auto');assert(item.promptOnly);assert.equal(item.autoHair,'english-male');assert.equal(item.gender,'male');
 assert(productionHair('seedream-35').hidden,'Archived old explicit style stays recoverable, absent from the current picker');
 for(const [hairId,allowed] of [['seedream-42',true],['seedream-16',false],['thai-male-auto',true]])assert.equal(basicThaiHairRequestAllowed({hairId,neckOutfitReferencePath:'/paid.png'},'hairstyle',['/paid.png']),allowed);
});
test('the actual Thai male first option uses the exact English automatic side-part policy, no hair donor and one AI call',async()=>{
 const png=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:115,channels:4,background:'#bd9788'}}).png().toBuffer(),left:8,top:13}]).png().toBuffer();
 const base={portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,portraitMode:'male',femaleEyeStyle:'natural',neckOutfitReferencePath:'/assets/job-uniforms/male-job-blue-navy-tie.png',faceIdentityBox:JSON.stringify([.2,.1,.8,.7])};
 const choices=[{interfaceLanguage:'en',hairId:'original'},{thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53}),hairId:'thai-male-auto',hairReferenceVersion:'picker-hair-v1'}];
 for(const choice of choices){const calls=[];
  await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields:{...base,...choice},root:new URL('..',import.meta.url).pathname,key:'inert',removeBackground:async()=>png,requestPortrait:async p=>{calls.push(p);return {png}}});
  assert.equal(calls.length,1);assert.equal(calls[0].hair,null);assert(!calls[0].hairPlacementReference);assert(calls[0].prompt.includes(englishProfessionalDefaultHair('male')));assert(!calls[0].prompt.includes('SELECTED PICKER HAIR seedream-35'));
 }
});
test('male preview is a photographic face thumbnail and every previous reference remains mapped to its original bytes',async()=>{
 const item=productionHair('thai-male-auto'),preview=await readFile(new URL('../public'+item.src,import.meta.url));
 const info=await sharp(preview).metadata();assert.equal(info.format,'webp');assert.equal(info.width,512);assert.equal(info.height,512);
 const manifest=JSON.parse(await readFile(new URL('../public/assets/catalogue-hair-guides/v1/manifest.json',import.meta.url),'utf8'));
 assert(!manifest.entries[item.id],'Automatic style has no donor face or hairstyle reference');
 for(const id of ['seedream-16','seedream-42','seedream-35'])assert.equal(manifest.entries[id].preview,productionHair(id).src);
 assert.equal(PRODUCTION_HAIR_CATALOG.filter(h=>h.id===item.id).length,1);
});
test('actual Thai menu puts the former second free style first among Diamond and has no duplicate male auto/archived tile',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),a=main.indexOf('const BASIC_MALE_HAIR_IDS='),b=main.indexOf('const JOB_UNIFORMS=',a);
 const options=Function('PRODUCTION_HAIR_CATALOG','THAI_FREE_FEMALE_HAIR_IDS','THAI_FREE_MALE_HAIR_IDS',main.slice(a,b)+';return {female:STUDIO_FEMALE_HAIR_OPTIONS,male:MALE_HAIR_OPTIONS}')(PRODUCTION_HAIR_CATALOG,THAI_FREE_FEMALE_HAIR_IDS,THAI_FREE_MALE_HAIR_IDS);
 assert.deepEqual(options.female.slice(0,4).map(h=>h.id),['seedream-14','seedream-42','seedream-79','seedream-16']);
 assert.deepEqual(options.male.slice(0,3).map(h=>h.id),THAI_FREE_MALE_HAIR_IDS);
 assert.equal(options.male.filter(h=>h.id==='thai-male-auto').length,1);assert(!options.male.some(h=>h.id==='seedream-35'));
});
