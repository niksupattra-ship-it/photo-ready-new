import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {englishProfessionalDefaultHair,ENGLISH_AUTO_HAIR_VERSION} from '../english-auto-hair.js';
import {englishBodyPortraitPrompt} from '../english-body-portrait.js';
import {englishHeadPortraitPrompt} from '../english-head-prompt.js';
import {englishTemplateBodyPrompt} from '../english-template-body-prompt.js';
import {FIRST_GENERATION_FEMALE_HAIR,firstGenerationHairFor} from '../hairstyle-catalog.js';

const prompts=[
 ['English full-body',options=>englishBodyPortraitPrompt({outfitIndex:2,...options})],
 ['English head-and-neck',options=>englishHeadPortraitPrompt(options)],
 ['English template-body',options=>englishTemplateBodyPrompt({outfitIndex:2,...options})]
];
test('English-only default hairstyles are natural Western business styles',()=>{
 assert.equal(ENGLISH_AUTO_HAIR_VERSION,'en-western-business-auto-hair-v1');
 assert.match(englishProfessionalDefaultHair('male'),/CLASSIC SIDE PART TAPER/);
 assert.match(englishProfessionalDefaultHair('female'),/SHOULDER-LENGTH/);
 assert.match(englishProfessionalDefaultHair('female'),/sleek BOB/);
 for(const [name,make] of prompts){
  const male=make({gender:'male'}),female=make({gender:'female'});
  assert.match(male,/CLASSIC SIDE PART TAPER/,name+' male');
  assert.match(female,/WESTERN PROFESSIONAL WOMEN/,name+' female');
  assert.match(female,/BEHIND BOTH SHOULDERS/,name+' hair placement');
  assert.match(female,/If the original hair is clearly short/,name+' choose bob for short hair');
  assert.match(female,/own hair colour/,name+' original hair colour');
  assert.doesNotMatch(female,/HAIR: gather long hair close to the skull/,name+' old default removed');
 }
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
test('Thai first-generation female reference stays unchanged; English UI does not force it',async()=>{
 assert.equal(FIRST_GENERATION_FEMALE_HAIR,'female-default-reference');
 assert.equal(firstGenerationHairFor('female'),'female-default-reference');
 assert.equal(firstGenerationHairFor('male'),'');
 const englishFlow=await readFile(new URL('../src/english-portrait-flow.jsx',import.meta.url),'utf8');
 const studio=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 const pipeline=await readFile(new URL('../production-portrait-pipeline.js',import.meta.url),'utf8');
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(englishFlow,/firstGenerationHairFor/);
 assert.match(englishFlow,/onCreate\(\{outfit,hair,finish/);
 assert.doesNotMatch(studio,/if\(!existing\)hair=firstGenerationHairFor\(gender\)/);
 assert.match(studio,/if\(!id&&hairGender==='female'&&!englishFlow\)id=firstGenerationHairFor\('female'\)/);
 assert.match(studio,/const processEasyPhoto=\(\)=>\{const hairId=firstGenerationHairFor\(hairGender\)/);
 assert.match(pipeline,/selectedHairKind:keepCurrentHair\?null:chosen\?selectedHairDesign\(chosen\)\?\.kind:selected.gender==='male'\?'short':null/);
 assert.match(main,/ENGLISH_TEMPLATE_BODY_FINISH_VERSION\+':'\+ENGLISH_AUTO_HAIR_VERSION:gender==='female'/);
});
