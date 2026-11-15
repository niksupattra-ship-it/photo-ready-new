import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {processProductionPortrait,validateProductionPortrait} from '../production-portrait-pipeline.js';
import {FEMALE_SINGLE_FINISH_VERSION,isFemaleSingleFinish,oppositeFemaleFinish} from '../female-single-finish-policy.js';
import {SINGLE_PASS_PORTRAIT_VERSION} from '../single-pass-portrait-policy.js';
import {AI_MAKEUP_PAIR_VERSION} from '../ai-makeup-pair-policy.js';
import {generateMakeupFromCompletedNatural,shouldUseNaturalMasterMakeup} from '../natural-master-makeup.js';
import {AI_MAKEUP_PROMPT} from '../ai-portrait-makeup.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION} from '../english-template-body-policy.js';

const root=new URL('..',import.meta.url).pathname;
const outfit='/assets/job-uniforms/female-job-ivory-bow-blouse.png';
const rgba=await sharp({create:{width:128,height:176,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:105,height:157,channels:4,background:'#b88a75'}}).png().toBuffer(),top:12,left:12}]).png().toBuffer();
const input={buffer:rgba,mimetype:'image/png'};
const fields=(language,finish,protocol='single')=>({
 portraitMode:'female',femaleEyeStyle:protocol==='pair'?'natural':finish,
 studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,
 ...(protocol==='pair'?{femaleFinishPair:AI_MAKEUP_PAIR_VERSION}:{femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION,...(protocol==='one'?{singlePassPortraitVersion:SINGLE_PASS_PORTRAIT_VERSION}:{})}),
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
test('New single-pass Natural and Makeup each make exactly ONE provider request in Thai and English',async()=>{
 for(const language of ['th','en'])for(const finish of ['natural','makeup']){
  const got=await run(language,finish,'one');
  assert.equal(got.calls.length,1,language+'/'+finish+' must call the image AI once');
  assert.equal(got.variant,null,'No extra AI portrait is produced without selection');
  assert(got.result.length>100);
  assert(!got.stages.includes('skin-prepare'),'No hidden Thai skin preparation request');
  assert(!got.stages.includes('makeup'),'No hidden second makeup request');
  if(finish==='makeup')assert.match(got.calls[0].prompt,/FINAL FINISH PRIORITY — ONE AI IMAGE/);
  else assert.doesNotMatch(got.calls[0].prompt,/FINAL FINISH PRIORITY — ONE AI IMAGE/);
 }
});
test('One-pass mode is restricted to single-finish female portraits',()=>{
 const f=fields('th','makeup','one');
 assert.doesNotThrow(()=>validateProductionPortrait(input,f));
 assert.throws(()=>validateProductionPortrait(input,{...f,femaleFinishPair:AI_MAKEUP_PAIR_VERSION}),/ตัวเลือก/);
 assert.throws(()=>validateProductionPortrait(input,{...f,portraitMode:'male'}),/ตัวเลือก/);
});
test('Thai hairstyle and makeup choices are reversible in one photo job, with no AI before Create',async()=>{
 const studio=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 const easy=await readFile(new URL('../src/easy-mode.jsx',import.meta.url),'utf8');
 const photoActions=await readFile(new URL('../src/english-photo-actions.jsx',import.meta.url),'utf8');
 const english=await readFile(new URL('../src/english-portrait-flow.jsx',import.meta.url),'utf8');
 const haircut=studio.slice(studio.indexOf(' const chooseHair=id=>'),studio.indexOf(' const confirmThaiHair=()=>'));
 const finish=studio.slice(studio.indexOf(' const selectPortraitFinish=style=>'),studio.indexOf(' const commitMakeupSource=async'));
 const confirm=studio.slice(studio.indexOf(' const confirmThaiHair=()=>'),studio.indexOf(' const cancelThaiHair=()=>'));
 assert.match(haircut,/setThaiChoiceFlow\(\{origin:'hair',step:'finish'\}\)/,'Hair-first asks Makeup next');
 assert.match(haircut,/setThaiChoiceFlow\(\{origin:'finish',step:'ready'\}\)/,'Makeup-first becomes ready after Hair');
 assert.match(haircut,/setThaiChoiceFlow\(\{origin:'hair',step:'ready'\}\)/,'Hair-first becomes ready after Makeup');
 assert.match(haircut,/const backThaiChoice=\(\)=>/,'The back arrow has a reversible transition handler');
 assert.match(haircut,/flow\.origin==='hair'\?'finish':'hair'/,'Ready back follows the true original selection order');
 assert.match(haircut,/setPicker\('hair'\)/,'Returning to hair preserves the same Studio job');
 assert.doesNotMatch(haircut,/void applyHair\(chosen\.hairId/,'Choosing either appearance option must not spend AI');
 assert.match(finish,/setThaiChoiceFlow\(\{origin:'finish',step:'hair'\}\)/,'Makeup-first shows the hairstyle panel');
 assert.doesNotMatch(finish,/void applyHair\(/,'Cosmetic selection does not start image generation');
 assert.match(confirm,/thaiChoiceFlow\?\.step!=='ready'/,'Create guard requires both explicit choices');
 assert.match(confirm,/if\(hairGender==='female'&&!currentSuit\)return/,'Create guard requires outfit too');
 assert.match(confirm,/if\(activeHead&&!finishChanged&&/,'Identical selected picture is reused instead of generated');
 assert.match(studio,/thaiPendingHair&&\(!thaiChoiceFlow\|\|thaiChoiceFlow\.step==='ready'\)&&Boolean\(currentSuit\)/,'On-image Create appears only after both selections and outfit');
 assert.match(studio,/backLabel="← ย้อนกลับ" onBack=\{thaiChoiceFlow\?\.step==='ready'\?backThaiChoice:null\}/,'On-image Back returns to the previous selection');
 assert.match(studio,/onClick=\{backThaiChoice\}>← ย้อนกลับ/,'Makeup dialog has working Back button');
 assert.match(studio,/onBackChoices=\{backThaiChoice\}/,'Easy Mode uses the same back behavior');
 assert.match(studio,/setThaiChoiceFlow\(null\);setThaiHairFinishChoice\(null\)/,'A successfully generated image clears draft navigation');
 assert.match(easy,/choiceStep==='hair'&&/,'Easy Mode has Hair step Back button');
 assert.match(easy,/!thaiHairConfirmation\|\|choicesReady/,'Easy Mode hides Create until selections are complete');
 assert.match(photoActions,/onBack&&<button/,'On-image action bar has optional Back button');
 assert.match(english,/const backChoice=\(\)=>/,'English has reversible navigation within a job');
 assert.match(english,/choiceFlow\?\.step==='ready'/,'English Create requires both explicit choices');
 assert.match(english,/scrollIntoView/,'English automatically shows the next choice');
});
test('Natural to Makeup edits the completed Natural image with the released AI makeup prompt once',async()=>{
 const selected=fields('th','natural','one');
 assert.equal(shouldUseNaturalMasterMakeup(selected,'makeup'),true);
 assert.equal(shouldUseNaturalMasterMakeup({...selected,femaleEyeStyle:'makeup'},'makeup'),false);
 const requests=[];
 const makeup=await generateMakeupFromCompletedNatural({natural:rgba,fields:selected,key:'test-makeup',
  requestPortrait:async request=>{requests.push(request);return {png:rgba}}});
 assert.equal(requests.length,1,'Existing Natural image only takes one additional AI request');
 assert.equal(requests[0].portraitMime,'image/png');
 assert.match(requests[0].prompt,/Apply delicate natural Korean-inspired studio portrait makeup/);
 assert.match(requests[0].prompt,/BROWS:/);
 assert(requests[0].prompt.includes(AI_MAKEUP_PROMPT),'Exact previously shipped AI makeup instructions are reused');
 assert(makeup.length>0);
 const server=await readFile(new URL('../server.js',import.meta.url),'utf8');
 const store=await readFile(new URL('../job-store.js',import.meta.url),'utf8');
 assert.match(server,/naturalJob\.result/,'AI makeup uses the previously finished Natural pixels');
 assert.match(server,/generateMakeupFromCompletedNatural/,'Natural-to-Makeup goes through original AI makeup editor');
 assert.match(store,/if\(f\.alternateFinishStatus==='completed'&&j\.result_makeup\)/,'An already generated alternate is reused regardless of its previous prompt version');
 assert.match(store,/AND result_makeup IS NULL/,'Completed alternate image bytes are never overwritten');
 assert.match(store,/alternateMakeupVersion/,'Corrected AI makeup is cached and reused without a new provider call');
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
 assert.match(studio,/setThaiPendingHair\(null\);setThaiHairFinishChoice\(null\);setThaiChoiceFlow\(null\);setSelectedHair\(''\);setAppearanceError\(null\)/,'New source image cancels both pending Thai hair and finish selection, plus navigation history');
 assert.match(server,/downloadPolicy\.inputForWork\(wid,fields\.downloadWorkId\)/,'Only pinned owned original inputs are processed');
 assert.match(server,/const nextFields=\{\.\.\.fields,femaleEyeStyle:finish\}/,'Cosmetics are the sole allowed change');
 assert.match(server,/queueFemaleAlternateFinish\(req\.params\.id,walletId\(req\),finish,hair,outfit\)/);
 assert.match(server,/queuedFemaleAlternateFinishes\(\)/,'Pending requests resume after server restart');
 assert.match(main,/fd\.append\('femaleFinishSingleVersion',FEMALE_SINGLE_FINISH_VERSION\)/);
 assert.match(main,/fd\.append\('singlePassPortraitVersion',SINGLE_PASS_PORTRAIT_VERSION\)/);
 assert.doesNotMatch(main,/fd\.append\('femaleFinishPair',AI_MAKEUP_PAIR_VERSION\)/,'New jobs must not generate both automatically');
 assert.match(main,/requestFreeFemaleAlternate\(options\.sourceJobId/);
 assert.match(studio,/const confirmThaiHair=/,'Thai must offer a separate create button');
 assert.match(studio,/finishChangePending=\{easyFinishPending\}/,'Thai finish is drafted for the next confirmed generation');
 assert.match(easy,/\['type','hair','suit','background'\]/,'Hair is chosen before submitting AI');
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
 assert.match(easy,/thaiHairConfirmation&&hasResult&&\(hairSelectionPending\|\|finishChangePending\)/,'Thai Easy Mode holds hair and makeup selections until confirmation');
 assert.match(studio,/head\.femaleFinishSingleVersion!==FEMALE_SINGLE_FINISH_VERSION&&appearanceKind==='makeup'/,'Single-finish Makeup must not silently run local cosmetics instead of the AI worker');
});
