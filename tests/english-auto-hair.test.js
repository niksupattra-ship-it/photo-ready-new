import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {englishProfessionalDefaultHair,ENGLISH_AUTO_FEMALE_EDGE_POLICY,ENGLISH_AUTO_HAIR_VERSION} from '../english-auto-hair.js';
import {englishBodyPortraitPrompt} from '../english-body-portrait.js';
import {englishHeadPortraitPrompt} from '../english-head-prompt.js';
import {englishTemplateBodyPrompt} from '../english-template-body-prompt.js';
import {FIRST_GENERATION_FEMALE_HAIR,THAI_FREE_FEMALE_HAIR_IDS,PRODUCTION_HAIR_CATALOG,firstGenerationHairFor} from '../hairstyle-catalog.js';

const prompts=[
 ['English full-body',options=>englishBodyPortraitPrompt({outfitIndex:2,...options})],
 ['English head-and-neck',options=>englishHeadPortraitPrompt(options)],
 ['English template-body',options=>englishTemplateBodyPrompt({outfitIndex:2,...options})]
];
test('English-only default hairstyles are natural Western business styles',()=>{
 assert.equal(ENGLISH_AUTO_HAIR_VERSION,'en-western-business-auto-hair-v2-source-length');
 assert.match(englishProfessionalDefaultHair('male'),/CLASSIC SIDE PART TAPER/);
 assert.match(englishProfessionalDefaultHair('female'),/IF ORIGINAL HAIR ENDS AT SHOULDER LEVEL/);
 assert.match(englishProfessionalDefaultHair('female'),/polished sleek bob/);
 for(const [name,make] of prompts){
  const male=make({gender:'male'}),female=make({gender:'female'});
  assert.match(male,/CLASSIC SIDE PART TAPER/,name+' male');
  assert.match(female,/WESTERN PROFESSIONAL WOMEN/,name+' female');
  assert.match(female,/BEHIND the shoulders/,name+' hair placement');
  assert.match(female,/IF ORIGINAL HAIR IS CLEARLY SHORT/,name+' choose bob for short hair');
  assert.match(female,/original hairline, colour/,name+' original hair colour');
  assert.doesNotMatch(female,/HAIR: gather long hair close to the skull/,name+' old default removed');
 }
});
test('English AI Picks source image controls full female length and is not overridden by blanket ear cleaning',()=>{
 const originalHairImage=2;
 const promptsUsingFullPhoto=[
  englishBodyPortraitPrompt({gender:'female',outfitIndex:3,autoHairSourceIndex:originalHairImage}),
  englishHeadPortraitPrompt({gender:'female',autoHairSourceIndex:originalHairImage}),
  englishTemplateBodyPrompt({gender:'female',identityIndex:1,outfitIndex:3,autoHairSourceIndex:originalHairImage})
 ];
 for(const prompt of promptsUsingFullPhoto){
  assert.match(prompt,/ORIGINAL HAIR REFERENCE — IMAGE 2/);
  assert.match(prompt,/IF ORIGINAL HAIR EXTENDS BELOW THE SHOULDERS/);
  assert.match(prompt,/Do not reduce below-shoulder hair to a bob/);
  assert.match(prompt,/IF ORIGINAL HAIR IS GATHERED\/TIED/);
  assert.match(prompt,/ENGLISH AI PICKS — PRESERVE REAL HAIR LENGTH/);
  assert.doesNotMatch(prompt,/All hair beside each ear MUST be gathered and tucked fully behind the ear/);
 }
 assert.match(ENGLISH_AUTO_FEMALE_EDGE_POLICY,/authentic continuous length/);
 assert.match(englishProfessionalDefaultHair('male'),/CLASSIC SIDE PART TAPER/);
});

test('Explicitly selected hairstyles and Keep Current are not replaced by AI Picks',()=>{
 for(const [name,make] of prompts){
  const selected=make({gender:'female',hairIndex:2}),kept=make({gender:'female',hairIndex:2,keepCurrentHair:true});
  assert.doesNotMatch(selected,/ENGLISH AI PICKS/,name+' explicit selection');
  assert.doesNotMatch(kept,/ENGLISH AI PICKS/,name+' keep current');
  assert.match(selected,/IMAGE 2|Image 2/,name+' selected design remains');
  assert.match(kept,/IMAGE 2|Image 2/,name+' keep current reference remains');
 }
});
test('Thai first-generation female reference is the visible free centre-parted cut; English UI does not force it',async()=>{
 assert.equal(FIRST_GENERATION_FEMALE_HAIR,'seedream-14');
 assert.equal(firstGenerationHairFor('female'),'seedream-14');
 assert.equal(firstGenerationHairFor('male'),'');
 const englishFlow=await readFile(new URL('../src/english-portrait-flow.jsx',import.meta.url),'utf8');
 const studio=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 const pipeline=await readFile(new URL('../production-portrait-pipeline.js',import.meta.url),'utf8');
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(englishFlow,/firstGenerationHairFor/);
 assert.match(englishFlow,/onCreate\(\{outfit,hair:allowHairChoice\?hair:''[,}]/,'Hidden English auto-choice UI submits no forced catalogue hairstyle');
 assert.doesNotMatch(studio,/if\(!existing\)hair=firstGenerationHairFor\(gender\)/);
 assert.match(studio,/if\(!id&&hairGender==='female'&&!englishFlow\)id=firstGenerationHairFor\('female'\)/);
 assert.match(studio,/head.englishAutoHairVersion=ENGLISH_AUTO_HAIR_VERSION/);
 assert.match(studio,/existing.englishAutoHairVersion===ENGLISH_AUTO_HAIR_VERSION/);
 const easyHandler=studio.slice(studio.indexOf(' const processEasyPhoto='),studio.indexOf('\n',studio.indexOf(' const processEasyPhoto=')));
 assert.match(easyHandler,/const hairId=selectedHairId\|\|firstGenerationHairFor\(hairGender\)/,'Thai Easy keeps its selected hairstyle before the existing default');
 assert.match(pipeline,/selectedHairKind:keepCurrentHair\?null:chosen\?selectedHairDesign\(chosen\)\?\.kind:selected.gender==='male'\?'short':null/);
 assert.match(main,/gender==='female'&&\(!hairId\|\|hairId==='original'\)&&!options.keepCurrentHair\?ENGLISH_AUTO_HAIR_VERSION/);
});


test('Thai hairstyle 16 is free while withdrawn hairstyle 26 is absent from the picker',async()=>{
 assert.deepEqual([...THAI_FREE_FEMALE_HAIR_IDS],['seedream-14','seedream-16','seedream-27']);
 const added=PRODUCTION_HAIR_CATALOG.find(h=>h.id==='seedream-16');
 const withdrawn=PRODUCTION_HAIR_CATALOG.find(h=>h.id==='seedream-26');
 assert.equal(added?.gender,'female');
 assert.equal(added?.hidden,undefined,'Braided half-up photo remains visible as a free choice');
 assert.equal(withdrawn?.hidden,true,'Withdrawn photo remains only for historical job recovery');
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert(main.includes("const HAIR_OPTIONS=PRODUCTION_HAIR_CATALOG.filter(h=>h.gender==='female'&&!h.hidden"),'All Thai UI hairstyles exclude hidden catalog entries');
});

test('Thai female picker starts with the three requested free cuts, and hides only female Thai auto tile',async()=>{
 const [main,studio,easy]=await Promise.all(['../src/main.jsx','../src/studio-editor.jsx','../src/easy-mode.jsx'].map(p=>readFile(new URL(p,import.meta.url),'utf8')));
 assert.match(main,/const BASIC_FEMALE_HAIR_IDS=THAI_FREE_FEMALE_HAIR_IDS/);
 assert.match(studio,/!THAI_FREE_FEMALE_HAIR_IDS\.includes\(id\)/);
 assert.match(studio,/\{\(englishFlow\|\|hairGender!=='female'\)&&<button className=\{'studio-none-choice'/);
 assert.match(easy,/\{\(englishPreviewEnabled\(\)\|\|gender!=='female'\)&&<button type="button" className=\{"easy-no-hair"/);
 assert.match(studio,/selectedHair=\{selectedHair\} templates=/);
});
