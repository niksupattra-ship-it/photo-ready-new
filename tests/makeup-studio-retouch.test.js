import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {MAKEUP_STUDIO_RETOUCH_VERSION,MAKEUP_STUDIO_RETOUCH_POLICY} from '../makeup-studio-retouch-policy.js';
import {onePassSkinQualityPriority,SINGLE_PASS_SKIN_QUALITY_VERSION} from '../single-pass-skin-quality.js';
import {AI_MAKEUP_PROMPT,createAiMakeupVariant} from '../ai-portrait-makeup.js';
import {generateMakeupFromCompletedNatural} from '../natural-master-makeup.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';
import {SINGLE_PASS_PORTRAIT_VERSION} from '../single-pass-portrait-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {ENGLISH_STUDIO_FINISH_VERSION} from '../english-studio-finish-policy.js';
import {ENGLISH_HEAD_PORTRAIT_VERSION,ENGLISH_HEAD_FINISH_VERSION} from '../english-head-portrait.js';
import {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION} from '../english-template-body-policy.js';

// Real prompt preparation, image codecs and established edge handling, with an
// inert provider. No customer, account, payment or live image AI is contacted.
const root=new URL('..',import.meta.url).pathname;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const naturalHashes={
 false:'82c7515a3724264c011d678fded9ac5b77930144998debb992d658ab68a4cb50',
 true:'1db8affb8c994f095c866fba7a706c55f3ce6d4e8128e69da3b31b21a7eb6174'
};
const natural=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([
 {input:await sharp({create:{width:72,height:104,channels:4,background:'#aa806a'}}).png().toBuffer(),left:12,top:12}
]).png().toBuffer();
const aiResult=await sharp({create:{width:96,height:128,channels:4,background:'#cdb19c'}}).png().toBuffer();
const aiMatte=await sharp(await sharp(aiResult).removeAlpha().png().toBuffer()).joinChannel(await sharp(natural).extractChannel(3).toBuffer()).png().toBuffer();
const pixel=async png=>[...await sharp(png).extract({left:48,top:64,width:1,height:1}).removeAlpha().raw().toBuffer()];
const alpha=png=>sharp(png).ensureAlpha().extractChannel(3).raw().toBuffer();
const modes=[
 ['Thai',{}],
 ['English reference',{preserveOutfit:true,englishReferenceFinish:true}],
 ['English head',{englishHeadFinish:true}],
 ['English template',{preserveOutfit:true,englishTemplateFinish:true}]
];
const englishFields={
 'English reference':{interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_STUDIO_FINISH_VERSION},
 'English head':{interfaceLanguage:'en',portraitComposition:ENGLISH_HEAD_PORTRAIT_VERSION,englishStudioFinishVersion:ENGLISH_HEAD_FINISH_VERSION},
 'English template':{interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION}
};

function assertRetouch(prompt){
 assert(prompt.endsWith(MAKEUP_STUDIO_RETOUCH_POLICY),'New skin authority must follow every older lighting/skin limitation');
 assert.equal(prompt.split('FINAL MAKEUP STUDIO-RETOUCH AUTHORITY').length-1,1);
 for(const requirement of ['REMOVE VISIBLE SURFACE WRINKLES AND BLEMISHES','crow\'s-feet','fine under-eye crease texture','temporary acne-red/brown marks','shallow pitted acne roughness','WHOLE FACE, EARS AND VISIBLE NECK','no anatomy']){
  if(requirement==='no anatomy')assert.match(prompt,/never added cheek volume, a facelift, stretched skin, changed facial anatomy/);
  else assert(prompt.includes(requirement),requirement);
 }
 assert.match(prompt,/authentic pigment depth, undertone/);
 assert.match(prompt,/eyes, brows, lashes, irises, nostrils and original lip edges sharply resolved/);
 assert.match(prompt,/selected hair boundaries and clean under-ear\/neck space/);
 assert.match(prompt,/local canvas retouch, post-AI skin filter, additional pass or extra provider request/);
}

test('Natural prompt bytes and the released base makeup prompt remain unchanged',()=>{
 assert.equal(SINGLE_PASS_SKIN_QUALITY_VERSION,'one-pass-studio-skin-finish-v8-ai-only-even-bright-complexion');
 for(const english of [false,true]){
  const prompt=onePassSkinQualityPriority('natural',english);
  assert.equal(digest(prompt),naturalHashes[english]);
  assert(!prompt.includes('FINAL MAKEUP STUDIO-RETOUCH AUTHORITY'));
 }
 assert.equal(digest(AI_MAKEUP_PROMPT),'2786a8d2e31d51835ff9c8a204d8073325527a02917ee166e773f7e28ef2580a');
});

test('both direct Makeup prompt variants end with the shared studio retouch while Natural receives none',()=>{
 assert.equal(MAKEUP_STUDIO_RETOUCH_VERSION,'makeup-studio-retouch-v1-radiant-diffused-clear-skin');
 for(const english of [false,true]){
  const prompt=onePassSkinQualityPriority('makeup',english);assertRetouch(prompt);
  assert(!prompt.includes('Use exactly the same corrected, realistic skin as Natural.'));
  assert(!prompt.includes('Do NOT paint a uniform opaque cosmetic base, smooth the whole face,'));
  if(english)assert(prompt.indexOf('ENGLISH OUTFIT REFERENCE LOCK')<prompt.indexOf('FINAL MAKEUP STUDIO-RETOUCH AUTHORITY'));
 }
});

test('actual Thai and English single-pass Makeup keep one generation and preserve source options and fixture pixels',async()=>{
 for(const language of ['th','en']){
  const fields={portraitMode:'female',femaleEyeStyle:'makeup',studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION,singlePassPortraitVersion:SINGLE_PASS_PORTRAIT_VERSION,
   ...(language==='en'?{...englishFields['English template'],neckOutfitReferencePath:'/assets/job-uniforms/female-job-ivory-bow-blouse.png'}:{})};
  const originalFields=structuredClone(fields),sourceHash=digest(natural),calls=[],stages=[];
  const result=await processProductionPortrait({input:{buffer:natural,mimetype:'image/png'},fields,root,key:'inert-makeup-fixture',
   requestPortrait:async request=>{calls.push(request);return {png:aiMatte}},removeBackground:async()=>aiMatte,onStage:async stage=>stages.push(stage)});
  assert.equal(calls.length,1);assert.equal(calls[0].prompt.split(MAKEUP_STUDIO_RETOUCH_POLICY).length-1,1);
  assert(calls[0].prompt.indexOf(MAKEUP_STUDIO_RETOUCH_POLICY)<calls[0].prompt.indexOf('FINAL SELECTED HAIR BOUNDARY AUTHORITY'),'Existing final hair protection stays authoritative for hair only');
  assert(!stages.includes('makeup')&&!stages.includes('skin-prepare'),'No additional image generation stage is added');
  assert.deepEqual(fields,originalFields);assert.equal(digest(natural),sourceHash);
  assert.deepEqual(await pixel(result),[205,177,156]);
  assert.deepEqual(await alpha(result),await alpha(aiMatte));
 }
});

test('all dedicated Makeup modes append the same final complexion authority without altering dimensions, alpha or interior AI pixels',async()=>{
 for(const [name,options] of modes){
  const sourceHash=digest(natural),calls=[];
  const result=await createAiMakeupVariant(natural,{...options,key:'inert-makeup-fixture',requestPortrait:async request=>{calls.push(request);return {png:aiResult}}});
  assert.equal(calls.length,1,name);assertRetouch(calls[0].prompt);
  assert.equal(calls[0].size,'96x128');assert.equal(calls[0].portraitMime,'image/png');
  const metadata=await sharp(result).metadata();assert.equal(metadata.width,96);assert.equal(metadata.height,128);
  assert.deepEqual(await alpha(result),await alpha(natural),name+' cutout alpha');
  assert.deepEqual(await pixel(result),[205,177,156],name+' interior must stay provider pixels');
  assert.equal(digest(natural),sourceHash);
  if(name==='Thai')assert(calls[0].prompt.includes(AI_MAKEUP_PROMPT));
  else assert(calls[0].prompt.indexOf('FINAL ENGLISH REFINED SKIN FINISH')<calls[0].prompt.indexOf('FINAL MAKEUP STUDIO-RETOUCH AUTHORITY'));
 }
});

test('Natural-to-Makeup uses the actual completed Natural master once in Thai and every English mode',async()=>{
 for(const [name] of modes){
  const fields={portraitMode:'female',femaleEyeStyle:'natural',femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION,...(englishFields[name]||{})};
  const before=structuredClone(fields),calls=[],sourceHash=digest(natural);
  const result=await generateMakeupFromCompletedNatural({natural,fields,key:'inert-makeup-fixture',requestPortrait:async request=>{calls.push(request);return {png:aiResult}}});
  assert.equal(calls.length,1,name);assertRetouch(calls[0].prompt);
  assert.deepEqual(await pixel(calls[0].portrait),[170,128,106],name+' conditions on the completed Natural image');
  assert.deepEqual(await pixel(result),[205,177,156]);assert.deepEqual(await alpha(result),await alpha(natural));
  assert.deepEqual(fields,before);assert.equal(digest(natural),sourceHash);
 }
});

test('a malformed AI makeup image still rejects once without returning a partial portrait or mutating its Natural source',async()=>{
 const before=digest(natural),wrongShape=await sharp({create:{width:192,height:64,channels:4,background:'#ffffff'}}).png().toBuffer();let calls=0;
 await assert.rejects(createAiMakeupVariant(natural,{key:'inert-makeup-fixture',requestPortrait:async()=>{calls++;return {png:wrongShape}}}),/สัดส่วนไม่ตรง/);
 assert.equal(calls,1);assert.equal(digest(natural),before);
});
