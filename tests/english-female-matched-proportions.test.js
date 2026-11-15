import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {createEnglishBodyLayout,ENGLISH_MALE_TEMPLATE_PROPORTION_PROFILE,ENGLISH_FEMALE_MATCHED_PROPORTION_PROFILE,ENGLISH_TEMPLATE_PROPORTION_PROFILE} from '../english-body-layout.js';
import {processProductionPortrait,validateProductionPortrait,portraitIdentityCrop} from '../production-portrait-pipeline.js';
import {englishTemplateBodyPrompt} from '../english-template-body-prompt.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {ENGLISH_FEMALE_MATCHED_PROPORTION_VERSION,ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,ENGLISH_TEMPLATE_BODY_FINISH_VERSION,englishTemplateBodyFinishForGender,isEnglishTemplateBodyFinish,usesEnglishIdentityLayout,ENGLISH_TEMPLATE_BODY_SIZE} from '../english-template-body-policy.js';

const root=new URL('..',import.meta.url).pathname;
const template='/assets/job-uniforms/female-job-ivory-bow-blouse.png';
const box=[.22,.10,.78,.72];
const cutout=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
 .composite([{input:await sharp({create:{width:80,height:115,channels:4,background:'#bd9788'}}).png().toBuffer(),left:8,top:13}]).png().toBuffer();
const input={buffer:cutout,mimetype:'image/png'};
const fields=(gender,version)=>({
 interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',
 englishStudioFinishVersion:version,portraitMode:gender,femaleEyeStyle:'natural',
 ...(gender==='female'?{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION}:{}),
 neckOutfitReferencePath:template,faceIdentityBox:JSON.stringify(box)
});
const run=async(gender,version)=>{
 const calls=[];
 const output=await processProductionPortrait({
  input,fields:fields(gender,version),root,key:'head-body-test',
  removeBackground:async()=>cutout,requestPortrait:async data=>{calls.push(data);return{png:cutout}}
 });
 assert(output?.length,'An accepted photo is still returned');
 assert.equal(calls.length,1,'Changing proportions must not add an AI generation or a makeup pass');
 return calls[0];
};

test('new female English uses exactly the male geometry while old male and female v9 are unchanged',()=>{
 assert.equal(englishTemplateBodyFinishForGender('male'),ENGLISH_TEMPLATE_BODY_FINISH_VERSION);
 assert.equal(englishTemplateBodyFinishForGender('female'),ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION);
 assert.equal(isEnglishTemplateBodyFinish(ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION),true);
 assert.equal(usesEnglishIdentityLayout(fields('female',ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION)),true);
 assert.equal(isEnglishTemplateBodyFinish(ENGLISH_FEMALE_MATCHED_PROPORTION_VERSION),true);
 assert.equal(usesEnglishIdentityLayout(fields('female',ENGLISH_FEMALE_MATCHED_PROPORTION_VERSION)),true);
 assert.deepEqual(ENGLISH_FEMALE_MATCHED_PROPORTION_PROFILE,ENGLISH_MALE_TEMPLATE_PROPORTION_PROFILE);
 assert.equal(ENGLISH_MALE_TEMPLATE_PROPORTION_PROFILE.identityHeadScale,.88);
 assert.equal(ENGLISH_MALE_TEMPLATE_PROPORTION_PROFILE.headWidthToShoulder,.35);
 assert.equal(ENGLISH_MALE_TEMPLATE_PROPORTION_PROFILE.headHeightToShoulder,.55);
 assert.equal(ENGLISH_MALE_TEMPLATE_PROPORTION_PROFILE.chinToCollar,.020);
 assert.equal(ENGLISH_MALE_TEMPLATE_PROPORTION_PROFILE.neckToShoulder,.255);
 assert.equal(ENGLISH_MALE_TEMPLATE_PROPORTION_PROFILE.chestToShoulder,.46);
 assert.equal(ENGLISH_TEMPLATE_PROPORTION_PROFILE.headWidthToShoulder,.44,'Old v9 female must stay unchanged');
 assert.equal(ENGLISH_TEMPLATE_PROPORTION_PROFILE.identityHeadScale,.95);
 assert.equal(ENGLISH_TEMPLATE_BODY_SIZE,'1824x2432');
});

test('new female and unchanged male send the same head-to-outfit layout, with no female hairstyle rewrite',async()=>{
 const female=await run('female',ENGLISH_FEMALE_MATCHED_PROPORTION_VERSION);
 const male=await run('male',ENGLISH_TEMPLATE_BODY_FINISH_VERSION);
 const femaleOld=await run('female',ENGLISH_TEMPLATE_BODY_FINISH_VERSION);
 assert.deepEqual(female.portrait,male.portrait,'Real-face conditioning guide must match male for same outfit and original');
 assert.notDeepEqual(female.portrait,femaleOld.portrait,'Prior female v9 remains on original large-head geometry');
 const outfit=await sharp(await readFile(root+'public'+template)).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 const identity=await portraitIdentityCrop(input,box);
 const expected=await createEnglishBodyLayout(outfit,{
  headScale:ENGLISH_MALE_TEMPLATE_PROPORTION_PROFILE.identityHeadScale,profile:ENGLISH_MALE_TEMPLATE_PROPORTION_PROFILE,identity,canvasWidth:1824
 });
 assert.deepEqual(female.portrait,expected);
 assert.deepEqual(female.outfit,male.outfit,'The native outfit input is unchanged');
 assert.deepEqual(female.outfit,femaleOld.outfit,'Legacy outfit pixels remain intact');
 assert.match(female.prompt,/FEMALE HEAD\/BODY BALANCE/);
 assert.match(female.prompt,/30–32%/);
 assert.match(female.prompt,/ENGLISH FEMALE — COMPACT NATURAL NECK/);
 assert.doesNotMatch(female.prompt,/40–42%|MALE BODY BALANCE|FINAL ENGLISH MALE SHORT-HAIR/);
 assert.match(female.prompt,/HAIR|ORIGINAL HAIR REFERENCE/);
 assert.match(female.prompt,/Keep the garment at EXACTLY this template size/);
 assert.match(male.prompt,/MALE BODY BALANCE/);
 assert.match(male.prompt,/30–32%/);
 assert.doesNotMatch(male.prompt,/FEMALE HEAD\/BODY BALANCE/);
 assert.match(femaleOld.prompt,/40–42%/);
});

test('matched finish is English-only; old v9 remains accepted and resumable',()=>{
 assert.doesNotThrow(()=>validateProductionPortrait(input,fields('female',ENGLISH_FEMALE_MATCHED_PROPORTION_VERSION)));
 assert.doesNotThrow(()=>validateProductionPortrait(input,fields('female',ENGLISH_TEMPLATE_BODY_FINISH_VERSION)));
 assert.throws(()=>validateProductionPortrait(input,{...fields('female',ENGLISH_FEMALE_MATCHED_PROPORTION_VERSION),interfaceLanguage:'th'}),/English studio|English outfit|Invalid/);
});

test('client labels completed results with server job version and does not relabel previously paid v9 jobs',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const studio=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 assert.match(main,/result\.idpromEnglishStudioFinishVersion=englishTemplateBodyFinishForGender\(portraitMode\)/);
 assert.match(main,/!result\.idpromEnglishStudioFinishVersion/);
 assert.match(main,/fd\.append\('englishStudioFinishVersion',englishTemplateBodyFinishForGender\(portraitMode\)\)/);
 assert.match(main,/ENGLISH_TEMPLATE_BODY_FRAMING_VERSION\+':'\+englishTemplateBodyFinishForGender\(gender\)/);
 assert.match(studio,/existing\.englishStudioFinishVersion===englishTemplateBodyFinishForGender\(gender\)/);
 assert.match(main,/if\(j\.englishStudioFinishVersion\)natural\.idpromEnglishStudioFinishVersion=j\.englishStudioFinishVersion/);
});
