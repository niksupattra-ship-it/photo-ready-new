import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {processProductionPortrait,validateProductionPortrait} from '../production-portrait-pipeline.js';
import {FEMALE_SINGLE_FINISH_VERSION,isFemaleSingleFinish,oppositeFemaleFinish} from '../female-single-finish-policy.js';
import {AI_MAKEUP_PAIR_VERSION} from '../ai-makeup-pair-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION} from '../english-template-body-policy.js';

const root=new URL('..',import.meta.url).pathname;
const outfit='/assets/job-uniforms/female-job-ivory-bow-blouse.png';
const rgba=await sharp({create:{width:128,height:176,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:105,height:157,channels:4,background:'#b88a75'}}).png().toBuffer(),top:12,left:12}]).png().toBuffer();
const input={buffer:rgba,mimetype:'image/png'};
const fields=(language,finish,protocol='single')=>({
 portraitMode:'female',femaleEyeStyle:protocol==='pair'?'natural':finish,
 studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,
 ...(protocol==='pair'?{femaleFinishPair:AI_MAKEUP_PAIR_VERSION}:{femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION}),
 ...(language==='en'?{
  interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',
  englishStudioFinishVersion:ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,
  neckOutfitReferencePath:outfit,faceIdentityBox:JSON.stringify([.2,.1,.8,.7])
 }:{})
});
const run=async(language,finish,protocol='single')=>{
 let calls=[],variant=null,stages=[];
 const f=fields(language,finish,protocol);
 const result=await processProductionPortrait({
  input,fields:f,root,key:'single-finish-test',
  removeBackground:async()=>rgba,requestPortrait:async request=>{calls.push(request);return {png:rgba}},
  onMakeupVariant:async png=>{variant=png},
  onStage:async s=>{stages.push(s)}
 });
 return {result,calls,variant,stages};
};
test('single finish protocol accepts only female Natural/Makeup; legacy pair still valid',()=>{
 for(const language of ['th','en'])for(const finish of ['natural','makeup']){
  const f=fields(language,finish);
  assert.equal(isFemaleSingleFinish(f),true);
  assert.doesNotThrow(()=>validateProductionPortrait(input,f));
 }
 assert.equal(oppositeFemaleFinish('natural'),'makeup');
 assert.equal(oppositeFemaleFinish('makeup'),'natural');
 assert.equal(oppositeFemaleFinish('other'),null);
 assert.doesNotThrow(()=>validateProductionPortrait(input,fields('en','natural','pair')));
 assert.throws(()=>validateProductionPortrait(input,{...fields('en','natural'),femaleFinishPair:AI_MAKEUP_PAIR_VERSION}),/ตัวเลือกสร้างภาพเฉพาะรูปแบบ/);
 assert.throws(()=>validateProductionPortrait(input,{...fields('en','makeup'),portraitMode:'male'}),/ตัวเลือกสร้างภาพเฉพาะรูปแบบ/);
 assert.throws(()=>validateProductionPortrait(input,{...fields('en','makeup'),femaleFinishSingleVersion:'unknown'}),/ตัวเลือกสร้างภาพเฉพาะรูปแบบ/);
});
test('Natural selected: only one AI generation, one output and no automatic Makeup for Thai and English',async()=>{
 for(const language of ['th','en']){
  const got=await run(language,'natural');
  const oldPair=await run(language,'natural','pair');
  assert.equal(got.calls.length,oldPair.calls.length-1,'Only the unnecessary second Makeup call is removed; original Thai skin polish is preserved');
  assert.deepEqual(got.result,oldPair.result,'Natural pixels must be unchanged');
  assert.equal(got.variant,null,'A second selectable image is not created');
  assert(got.result.length>100);
  assert(!got.stages.includes('makeup'));
 }
});
test('Makeup selected: exact original paired AI makeup pipeline remains, but only Makeup is delivered',async()=>{
 for(const language of ['th','en']){
  const selected=await run(language,'makeup');
  const oldPair=await run(language,'natural','pair');
  assert.equal(selected.calls.length,oldPair.calls.length,'Selected Makeup preserves exactly the previous full quality pipeline');
  assert(oldPair.calls.length>=2);
  assert.equal(selected.variant,null,'Do not expose an unselected Natural image');
  assert(selected.stages.includes('makeup'));
  assert.deepEqual(selected.result,oldPair.variant,'Makeup PNG stays identical to the former paired output for the same provider response');
  assert.deepEqual(selected.calls.map(x=>x.size),oldPair.calls.map(x=>x.size),'Same image dimensions and provider model requests');
 }
});
test('old paired jobs remain two images on demand, not reinterpreted by new single-finish protocol',async()=>{
 const old=await run('en','natural','pair');
 assert.equal(old.calls.length,2);
 assert(old.variant?.length>100);
 assert(old.result?.length>100);
 assert.notStrictEqual(old.result,old.variant);
});
test('server alternate generation cannot take user-supplied new photos, wardrobes or hair without credits',async()=>{
 const store=await readFile(new URL('../job-store.js',import.meta.url),'utf8');
 const server=await readFile(new URL('../server.js',import.meta.url),'utf8');
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const studio=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 const saved=await readFile(new URL('../src/saved-project.js',import.meta.url),'utf8');
 const easy=await readFile(new URL('../src/easy-mode.jsx',import.meta.url),'utf8');
 assert.match(store,/SELECT \* FROM ai_jobs WHERE id=\$1 AND wallet_id=\$2 FOR UPDATE/,'Wallet and job are locked for entitlement');
 assert.match(store,/f\.delivery_confirmed!==true/,'Only delivered jobs may request the free opposite');
 assert.match(store,/String\(f\.hairId\|\|'original'\)!==expectedHair/,'An alternative hair ID cannot bypass credits');
 assert.match(store,/String\(f\.neckOutfitReferencePath\|\|''\)!==expectedOutfit/,'An alternative wardrobe cannot bypass credits');
 assert.match(store,/result_makeup=\$4/,'The existing first output is not overwritten');
 assert.match(store,/CASE WHEN fields->>'femaleFinishSingleVersion'='female-single-finish-v1'/,'Store English hair placement for later same-look cosmetic finish');
 assert.match(saved,/if\(head\.femaleFinishSingleVersion==='female-single-finish-v1'\)master\.idpromFemaleFinishSingleVersion/,'Purchased photos restore free cosmetic right after reopen');
 assert.match(studio,/setThaiPendingHair\(null\);setSelectedHair\(''\);setAppearanceError\(null\)/,'New source image cancels pending Thai hair selection');
 assert.match(server,/downloadPolicy\.inputForWork\(wid,fields\.downloadWorkId\)/,'Only pinned owned original inputs are processed');
 assert.match(server,/const nextFields=\{\.\.\.fields,femaleEyeStyle:finish\}/,'Cosmetics are the sole allowed change');
 assert.match(server,/queueFemaleAlternateFinish\(req\.params\.id,walletId\(req\),finish,hair,outfit\)/);
 assert.match(server,/queuedFemaleAlternateFinishes\(\)/,'Pending requests resume after server restart');
 assert.match(main,/fd\.append\('femaleFinishSingleVersion',FEMALE_SINGLE_FINISH_VERSION\)/);
 assert.doesNotMatch(main,/fd\.append\('femaleFinishPair',AI_MAKEUP_PAIR_VERSION\)/,'New jobs must not generate both automatically');
 assert.match(main,/requestFreeFemaleAlternate\(options\.sourceJobId/);
 assert.match(studio,/const confirmThaiHair=/,'Thai must offer a separate create button');
 assert.match(studio,/onCreate=\{confirmThaiHair\}/,'Thai Full Studio must place the create button directly over the photo');
 assert.match(studio,/createLabel="สร้างภาพ" cancelLabel="ยกเลิก"/,'Thai on-photo actions must show localized Create and Cancel');
 assert.doesNotMatch(studio,/studio-hair-confirm-button/,'Thai Full Studio must not use the old below-picker confirmation');
 assert.match(studio,/femaleEyeStyle:finish/,'Changing hair must preserve the most recently chosen makeup finish');
 assert.match(studio,/setThaiPendingHair\(chosen\)/);
 assert.match(studio,/freeFinishChange=appearanceKind==='makeup'/);
 assert.match(studio,/onHair=\{englishFlow\?\(easyHasResult\?chooseHair:processEasyPhoto\):chooseHair\} onGenerateHair=\{processEasyPhoto\} onConfirmHair=\{confirmThaiHair\}/,'Thai Easy Mode uses the selection-confirm flow while English keeps its original quick action');
 assert.match(studio,/thaiHairConfirmation=\{!englishFlow\}/,'English Easy Mode retains existing behavior');
 assert.match(easy,/\(hasResult\|\|thaiHairConfirmation\)\&\&tab==='hair'/,'Thai Easy Mode must offer the hairstyle list before initial AI generation');
 assert.match(easy,/onGenerateHair\?\.\(choice\)/,'Thai Easy Mode must send the selected haircut, not auto-default hair');
 assert.match(easy,/thaiHairConfirmation&&hasResult&&tab==='hair'&&hairSelectionPending&&<button type="button" className="easy-primary"/,'Only Thai Easy Mode hair changes need the new confirmation');
 assert.match(studio,/head\.femaleFinishSingleVersion!==FEMALE_SINGLE_FINISH_VERSION&&appearanceKind==='makeup'/,'Single-finish Makeup must not silently run local cosmetics instead of the AI worker');
});
