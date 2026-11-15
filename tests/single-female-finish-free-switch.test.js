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
test('Hair-first and Makeup-first selections require explicit completion before one AI Create (Thai and English)',async()=>{
 const studio=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 const easy=await readFile(new URL('../src/easy-mode.jsx',import.meta.url),'utf8');
 const english=await readFile(new URL('../src/english-portrait-flow.jsx',import.meta.url),'utf8');
 const thaiHair=studio.slice(studio.indexOf(' const chooseHair=id=>'),studio.indexOf(' const confirmThaiHair=()=>'));
 const thaiFinish=studio.slice(studio.indexOf(' const selectPortraitFinish=style=>'),studio.indexOf(' const commitMakeupSource=async'));
 const thaiCreate=studio.slice(studio.indexOf(' const confirmThaiHair=()=>'),studio.indexOf(' const cancelThaiHair=()=>'));
 assert.match(thaiHair,/setThaiChoiceFlow\(\{origin:'hair',step:'finish'\}\)/,'Choosing hair opens Makeup next');
 assert.match(thaiHair,/setThaiHairFinishChoice\(chosen\)/,'Hair-first opens the existing face image chooser');
 assert.match(thaiHair,/setThaiChoiceFlow\(\{origin:'finish',step:'ready'\}\)/,'Hair after Makeup completes both choices');
 assert.match(thaiHair,/setThaiChoiceFlow\(\{origin:'hair',step:'ready'\}\)/,'Makeup after Hair completes both choices');
 assert.doesNotMatch(thaiHair,/void applyHair\(chosen\.hairId|void processPhoto\(\{hairId:choice/,'Changing draft options cannot call AI');
 assert.match(thaiFinish,/setThaiChoiceFlow\(\{origin:'finish',step:'hair'\}\)/,'Choosing Makeup opens hairstyles next');
 assert.doesNotMatch(thaiFinish,/void applyHair\(/,'Cosmetic choice only stages a draft');
 assert.match(thaiCreate,/thaiChoiceFlow\?\.step!=='ready'/,'Create refuses incomplete selections');
 assert.match(thaiCreate,/if\(!currentSuit\)return/,'Create refuses missing outfit');
 assert.match(studio,/thaiPendingHair&&\(!thaiChoiceFlow\|\|thaiChoiceFlow\.step==='ready'\)&&Boolean\(currentSuit\)/,'Existing Create button appears only when Hair, Makeup and outfit ready');
 assert.match(studio,/englishInlineAi\.choiceStep==='ready'&&Boolean\(englishInlineAi\.outfit\)/,'English on-image Create waits for both selections and outfit');
 assert.match(studio,/id="english-inline-makeup-title"/,'English hair-first presents a Makeup selection dialog');
 assert.match(studio,/choiceStep:'hair',choiceOrigin:'finish'/,'English Makeup-first opens Hair picker');
 assert.match(studio,/choiceStep:hairGender==='female'\?'finish':'ready'/,'English hair-first opens Makeup');
 assert.match(studio,/setThaiChoiceFlow\(\{origin:'finish',step:'hair'\}\);pendingHairProcessRef\.current=null/,'Initial Thai Studio Makeup-first does not pre-approve a haircut');
 assert.match(studio,/onCreate=\{confirmThaiHair\}/,'User must explicitly press the existing Create button');
 assert.match(studio,/if\(activeHead&&!finishChanged&&/,'Already visible exact image does not call provider');
 assert.match(studio,/if\(mode==='female'\)setEasyFaceFinish\(finish\)/,'Completed AI output matches selected finish');
 assert.match(studio,/const easyFinishPending=Boolean/,'Easy Mode stages changes');
 assert.match(easy,/!hasResult&&thaiHairConfirmation&&choicesReady&&currentSuit/,'Easy Mode Create appears immediately when both choices and outfit are ready');
 assert.match(easy,/if\(hasResult\|\|thaiHairConfirmation\)onHair\(h\.id\)/,'First Easy Mode hairstyle choice is recorded, not ignored');
 assert.match(easy,/onSelect=\{style=>\{onSelectFaceFinish\?\.\(style\);setTab\('hair'\)/,'Easy Mode Makeup-first auto-opens Hair');
 assert.match(english,/setChoiceFlow\(previous=>previous\?\.first==='finish'&&previous\.step==='hair'/,'English Makeup-first -> Hair completion');
 assert.match(english,/setChoiceFlow\(previous=>previous\?\.first==='hair'&&previous\.step==='finish'/,'English Hair-first -> Makeup completion');
 assert.match(english,/scrollIntoView/,'English automatically focuses the second choice');
 assert.match(english,/choiceFlow\?\.step==='ready'/,'English creation waits for both choices');
 assert.doesNotMatch(studio,/const backThaiChoice=\(\)=>/,'No new Back/Redo buttons; existing Studio Undo/Redo must remain');
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
 assert.match(studio,/setThaiPendingHair\(null\);setThaiHairFinishChoice\(null\);setThaiChoiceFlow\(null\);setSelectedHair\(''\);setAppearanceError\(null\)/,'New source image clears all prior choices and flow state');
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
 assert.match(easy,/onGenerateHair\?\.\(choice\|\|selectedHair\|\|''\)/,'Thai Easy Mode sends the selected hairstyle or current draft');
 assert.match(easy,/thaiHairConfirmation&&hasResult&&\(hairSelectionPending\|\|finishChangePending\)/,'Thai Easy Mode holds hair and makeup selections until confirmation');
 assert.match(studio,/head\.femaleFinishSingleVersion!==FEMALE_SINGLE_FINISH_VERSION&&appearanceKind==='makeup'/,'Single-finish Makeup must not silently run local cosmetics instead of the AI worker');
});

test('Existing Studio Undo and Redo restore earlier completed AI generations without new provider calls or new UI arrows',async()=>{
 const studio=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const editorHistory=studio.slice(studio.indexOf(' const history=async back=>'),studio.indexOf(' const point=e=>'));
 const studioAI=studio.slice(studio.indexOf(' const applyHair=async '),studio.indexOf(' const balanceHeadSize=async'));
 const firstProcess=studio.slice(studio.indexOf(' const processPhoto=async(options={})=>'),studio.indexOf(' const applyFreeHair=async'));
 const masterRestore=main.slice(main.indexOf('const syncStudioPortraitFinish='),main.indexOf('const changeStudioPortraitFinish=async'));
 assert.match(studio,/const rememberProcessedHistory=previous=>/,'AI results enter the existing Undo stack');
 assert.match(studio,/undo\.current\.push\(previous\)/,'The previous image remains a history snapshot');
 assert.match(studio,/redo\.current=\[\]/,'A new AI edit starts a fresh Redo branch');
 assert.match(studioAI,/rememberProcessedHistory\(previous\);resetBrushSession\(\)/,'Makeup and hairstyle changes append snapshots, not reset history');
 assert.match(firstProcess,/if\(oldHead&&!newSourcePending\)rememberProcessedHistory\(previous\)/,'AI edits in the same original photo retain history');
 assert.match(firstProcess,/else resetPhotoHistory\(\)/,'A new uploaded original starts a separate history');
 assert.match(editorHistory,/const from=back\?undo\.current:redo\.current,to=back\?redo\.current:undo\.current/,'Existing Undo and Redo stacks are used both ways');
 assert.match(editorHistory,/restoreHistory\(next\)\|\|await hydrate\(next\)/,'Restore reuses existing image pixels and local hydration');
 assert.doesNotMatch(editorHistory,/onChangeHair|onProcessPhoto|requestPortrait|aiFinishPortrait/,'Undo/Redo never calls any AI');
 assert.match(editorHistory,/onRestorePortraitFinish\?\.\(/,'History restores parent job metadata alongside visible pixels');
 assert.match(editorHistory,/setEasyFaceFinish\(portraitFinishChoice\(restored\.femaleEyeStyle/,'Undo/Redo restores the cosmetics selection');
 assert.match(main,/processedStudioHistoryRef=useRef\(new Map\(\)\)/,'Completed AI jobs retain their own master and geometry');
 assert.match(main,/processedStudioHistoryRef\.current\.set\(entry\.jobId,entry\)/,'History is keyed by job and does not conflate the same hair style');
 assert.match(main,/lock:editCache\.current\?\.lock/,'The prior hairstyle/outfit fitting frame is retained');
 assert.match(masterRestore,/if\(head\.jobId!==currentOutputJobRef\.current\)/,'Undo to a different completed AI job switches active job');
 assert.match(masterRestore,/currentOutputJobRef\.current=head\.jobId/,'The restored job identity is active for later edits');
 assert.match(masterRestore,/master:cached\.master,lock:cached\.lock/,'The original processed master and fitting frame are restored');
 assert.doesNotMatch(masterRestore,/requestPortrait|aiFinishPortrait|processStudioPhoto/,'AI is never invoked when restoring a prior job');
 assert.doesNotMatch(studio,/const backThaiChoice=\(\)=>/,'No new selection-navigation arrow was added');
});
