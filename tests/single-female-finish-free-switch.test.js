import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {processProductionPortrait,validateProductionPortrait} from '../production-portrait-pipeline.js';
import {selectedHairBoundaryInstruction} from '../hair-neck-boundary.js';
import {FEMALE_SINGLE_FINISH_VERSION,isFemaleSingleFinish,oppositeFemaleFinish} from '../female-single-finish-policy.js';
import {SINGLE_PASS_PORTRAIT_VERSION} from '../single-pass-portrait-policy.js';
import {SINGLE_PASS_SKIN_QUALITY_VERSION,onePassSkinQualityPriority} from '../single-pass-skin-quality.js';
import {AI_MAKEUP_PAIR_VERSION} from '../ai-makeup-pair-policy.js';
import {generateMakeupFromCompletedNatural,shouldUseNaturalMasterMakeup} from '../natural-master-makeup.js';
import {AI_MAKEUP_PROMPT} from '../ai-portrait-makeup.js';
import {MAKEUP_STUDIO_RETOUCH_POLICY} from '../makeup-studio-retouch-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION} from '../english-template-body-policy.js';
import {ENGLISH_STUDIO_FREE_HAIR_IDS,isEnglishStudioFreeHair,isEnglishStudioDiamondHair,orderEnglishStudioHair,englishStudioDiamondActive} from '../src/english-studio-hair-policy.js';

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
  if(finish==='makeup'){
   assert.match(got.calls[0].prompt,/SELECTED MAKEUP — SAME-GENERATION INPUT CONTEXT/);
   assert(got.calls[0].prompt.includes(MAKEUP_STUDIO_RETOUCH_POLICY),'Makeup gets the same complete reference finish as a Natural-to-Makeup edit');
   assert.equal(got.calls[0].prompt.split(MAKEUP_STUDIO_RETOUCH_POLICY).length-1,1);
   assert.match(got.calls[0].prompt,/COMPLEXION — CONTINUOUS STUDIO RETOUCH BEFORE COSMETIC COLOUR/,'Makeup repairs skin before adding colour');
   assert.match(got.calls[0].prompt,/ONE COHERENT COSMETIC PALETTE/);
   assert.match(got.calls[0].prompt,/soft translucent peach-pink blush broadly through the upper cheeks/);
   assert.match(got.calls[0].prompt,/without a visible boundary or circular centre/,'No saturated circular blush');
   assert.match(got.calls[0].prompt,/No preliminary Natural generation, additional provider request, face\/skin mask/,'AI-only finished pixels');
   assert.match(got.calls[0].prompt,/same person's recognisable identity, facial proportions/);
   assert.match(got.calls[0].prompt,/Keep pose, outfit, collar, fabric, buttons, insignia, background, canvas dimensions/);
   assert.doesNotMatch(got.calls[0].prompt,/NATURAL CLEAR-SKIN BASE — BOTH NATURAL AND MAKEUP|Subtly clean up small active pimples|very thin skin-matched sheer foundation look/,'Bare-skin limits no longer compete with selected Makeup');
  }else{
   assert.doesNotMatch(got.calls[0].prompt,/SELECTED MAKEUP — SAME-GENERATION INPUT CONTEXT/);
   assert.match(got.calls[0].prompt,/SELECTED FINISH — NATURAL CLEAR STUDIO SKIN, NO ADDED MAKEUP/);
   assert.doesNotMatch(got.calls[0].prompt,/THEN — SUBTLE COSMETICS/);
   assert.doesNotMatch(got.calls[0].prompt,/BROAD UNDER-EYE BLUSH GRADIENT/,'Natural must have zero blush');
   assert.match(got.calls[0].prompt,/FINAL ONE-PASS STUDIO SKIN AND LIGHTING AUTHORITY — AI ONLY/);
   assert.match(got.calls[0].prompt,/NATURAL CLEAR-SKIN BASE — BOTH NATURAL AND MAKEUP/,'Natural keeps its released complexion instructions');
   assert.match(got.calls[0].prompt,/Subtly clean up small active pimples/,'Natural acne reduction should not create a mask');
   assert.match(got.calls[0].prompt,/real pores, fine facial detail and soft tonal transitions/,'Natural skin remains textured');
   assert.match(got.calls[0].prompt,/no.*later skin-processing stage/i,'No additional beauty filter or native skin pass');
   assert.match(got.calls[0].prompt,/IDENTITY AND SKIN-TONE LOCK/);
   assert.match(got.calls[0].prompt,/NON-FACE PROTECTION/);
   assert.match(got.calls[0].prompt,/ONE image-generation request/i);
   assert.equal(got.calls.filter(c=>c.prompt.includes('FINAL ONE-PASS STUDIO SKIN')).length,1);
  }
 }
});
test('shared skin version and legacy paired processing contracts remain stable',async()=>{
 assert.equal(SINGLE_PASS_SKIN_QUALITY_VERSION,'one-pass-studio-skin-finish-v8-ai-only-even-bright-complexion');
 assert.throws(()=>onePassSkinQualityPriority('invalid'),/Invalid one-pass skin finish/);
 assert.match(onePassSkinQualityPriority('makeup',true),/ENGLISH OUTFIT REFERENCE LOCK/);
 assert.doesNotMatch(onePassSkinQualityPriority('natural',false),/ENGLISH OUTFIT REFERENCE LOCK/);
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const pipeline=await readFile(new URL('../production-portrait-pipeline.js',import.meta.url),'utf8');
 assert.match(main,/gender==='female'\?SINGLE_PASS_SKIN_QUALITY_VERSION/);
 assert.match(main,/options\.portraitMode==='female'\?SINGLE_PASS_SKIN_QUALITY_VERSION/);
 assert.match(pipeline,/if\(singlePass\)\{\s*if\(fields\.femaleEyeStyle==='makeup'\)prompt\+=onePassMakeupPriority\(false\);\s*prompt\+=onePassSkinQualityPriority\(fields\.femaleEyeStyle,false\)/);
 assert.match(pipeline,/if\(singlePass\)\{\s*if\(fields\.femaleEyeStyle==='makeup'\)prompt\+=onePassMakeupPriority\(true\);\s*prompt\+=onePassSkinQualityPriority\(fields\.femaleEyeStyle,true\)/);
 for(const lang of ['th','en']){
  const legacy=await run(lang,'natural','pair');
  assert(!legacy.calls.some(x=>x.prompt.includes('FINAL ONE-PASS STUDIO SKIN')),'Legacy pairs do not enter the single-pass skin route');
  const oldSingle=await run(lang,'makeup');
  assert(!oldSingle.calls.some(x=>x.prompt.includes('FINAL ONE-PASS STUDIO SKIN')),'Old single-finish protocol uses its released two-step quality');
 }
});
test('AI-only diffuse blush retains Natural colour, identity and previous one-pass local pipeline',async()=>{
 const makeup=onePassSkinQualityPriority('makeup',false);
 const natural=onePassSkinQualityPriority('natural',false);
 const english=onePassSkinQualityPriority('makeup',true);
 for(const text of [makeup,english]){
  assert.match(text,/blush broadly through the upper cheeks/,'Blush stays on cheek skin');
  assert.match(text,/fading into the outer cheek and temple/,'Blush diffuses toward face contour');
  assert.match(text,/soft translucent peach-pink blush/,'Blush remains restrained');
  assert.match(text,/without a visible boundary or circular centre/,'No concentrated cheek patch');
  assert.match(text,/No isolated blurred islands, concealer circles, stamped patches, facial plate or jaw\/neck seam/,'Skin must not become an opaque face layer');
 }
 assert.doesNotMatch(natural,/under-eye-to-outer-face blush haze/,'No makeup in Natural');
 assert.match(natural,/no blush, eyeliner, eyeshadow, lipstick/,'Natural skin should stay bare');
 assert.match(makeup,/No preliminary Natural generation, additional provider request, face\/skin mask/,'No retouching after AI request');
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const pipeline=await readFile(new URL('../production-portrait-pipeline.js',import.meta.url),'utf8');
 assert.doesNotMatch(main,/captureStudioSkinEvidence|onePassSkinEvidence|finishOnePassMakeupCheekBlushBlob|diffuseFemaleMakeupCheekBlush/,'No face mask, skin-preprocessing evidence or post-AI cheek correction');
 assert.doesNotMatch(pipeline,/onePassSkinEvidence/,'No native face-skin retouch stage in AI pipeline');
 assert.match(pipeline,/if\(singlePass\)\{\s*if\(fields\.femaleEyeStyle==='makeup'\)prompt\+=onePassMakeupPriority\(false\);\s*prompt\+=onePassSkinQualityPriority\(fields\.femaleEyeStyle,false\)/);
 assert.match(pipeline,/if\(singlePass\)\{\s*if\(fields\.femaleEyeStyle==='makeup'\)prompt\+=onePassMakeupPriority\(true\);\s*prompt\+=onePassSkinQualityPriority\(fields\.femaleEyeStyle,true\)/);
});
test('One-pass mode is restricted to single-finish female portraits',()=>{
 const f=fields('th','makeup','one');
 assert.doesNotThrow(()=>validateProductionPortrait(input,f));
 assert.throws(()=>validateProductionPortrait(input,{...f,femaleFinishPair:AI_MAKEUP_PAIR_VERSION}),/ตัวเลือก/);
 assert.throws(()=>validateProductionPortrait(input,{...f,portraitMode:'male'}),/ตัวเลือก/);
});
test('Easy Mode create label stays compact for male and female while original click paths remain intact',async()=>{
 const easy=await readFile(new URL('../src/easy-mode.jsx',import.meta.url),'utf8');
 assert.equal((easy.match(/>สร้างรูป<\/button>/g)||[]).length,2,'The existing edit confirmation and final wizard Create keep the original short label');
 assert.doesNotMatch(easy,/สร้างภาพตามทรงผมและเมคอัพที่เลือก/,'Long gender-specific label must not return');
 assert.match(easy,/onClick=\{\(\)=>onConfirmHair\?\.\(\)\}>สร้างรูป<\/button>/);
 assert.match(easy,/if\(thaiHairConfirmation\)onGenerateHair\?\.\(choice\|\|selectedHair\|\|''\)/,'Thai final step passes the staged hair to one AI request');
 assert.match(easy,/disabled=\{busy\|\|!ready\|\|!currentSuit\|\|!choicesReady\}/,'Keep post-result confirmation button constraints');
 assert.match(easy,/const wizardCreateReady=Boolean\(sourcePreview&&ready&&!busy&&typeReady&&hairReady&&suitReady\)/,'New Create is gated by the staged finish, hair, outfit and source');
 assert.match(easy,/tab!==wizardTabs\[wizardTabs.length-1\]/,'New Create is only on the final background step');
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
 assert.match(easy,/const wizardCreateReady=Boolean\(sourcePreview&&ready&&!busy&&typeReady&&hairReady&&suitReady\)/,'Easy Mode Create requires all prior selections');
 assert.match(easy,/const createWizardPhoto=\(\)=>\{if\(!wizardCreateReady\|\|tab!==wizardTabs\[wizardTabs.length-1\]\)return;/,'Create refuses to skip background step');
 assert.match(easy,/if\(hasResult\|\|thaiHairConfirmation\)onHair\(h\.id\)/,'First Easy Mode hairstyle choice is recorded, not ignored');
 assert.match(easy,/onSelect=\{style=>\{onSelectFaceFinish\?\.\(style\);setFinishChosen\(true\);setChoice\(''\);if\(wizardOpen\)setTab\(wizardTabs\[1\]\)/,'Easy Mode Makeup-first opens Thai Hair or English Suit as appropriate');
 assert.match(english,/setChoiceFlow\(previous=>previous\?\.first==='finish'&&previous\.step==='hair'/,'English Makeup-first -> Hair completion');
 assert.match(english,/setChoiceFlow\(previous=>previous\?\.first==='hair'&&previous\.step==='finish'/,'English Hair-first -> Makeup completion');
 assert.match(english,/scrollIntoView/,'English automatically focuses the second choice');
 assert.match(english,/choiceFlow\?\.step==='ready'/,'English creation waits for both choices');
 assert.doesNotMatch(studio,/const backThaiChoice=\(\)=>/,'No new Back/Redo buttons; existing Studio Undo/Redo must remain');
});
test('Easy Mode uses a guided selection order for both genders without skipping steps or adding AI calls',async()=>{
 const easy=await readFile(new URL('../src/easy-mode.jsx',import.meta.url),'utf8');
 const studio=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 const css=await readFile(new URL('../src/easy-mode.css',import.meta.url),'utf8');
 assert.match(easy,/englishPreviewEnabled\(\)\?\['type','suit','background'\]:thaiHairConfirmation\?\['type','hair','suit','background'\]/,
  'English Auto Hair skips hair picker; Thai Easy must expose it');
 assert.match(easy,/guidedSource\.current=sourcePreview;setTab\('type'\);setWizard\(true\)/,'New image opens the first step, not hidden Hair');
 assert.match(easy,/const typeReady=Boolean\(photoTypeSelected&&\(gender!=='female'\|\|finishChosen\)\)/,
  'Female users must choose Natural or Makeup; male photo type has no makeup step');
 assert.match(easy,/const wizardNextAllowed=ready&&!busy&&\(tab==='type'\?typeReady:tab==='hair'\?hairReady:tab==='suit'\?suitReady:true\)/,
  'Next is blocked until the current required step is completed');
 assert.match(easy,/const wizardCreateReady=Boolean\(sourcePreview&&ready&&!busy&&typeReady&&hairReady&&suitReady\)/,
  'Create is disabled for incomplete choices');
 assert.match(easy,/tab!==wizardTabs\[wizardTabs.length-1\]/,'Only background offers Create');
 assert.match(easy,/if\(thaiHairConfirmation\)onGenerateHair\?\.\(choice\|\|selectedHair\|\|''\);\s*else onHair\?\.\(\)/,
  'Thai staged hair and English auto-hair submit exactly one original callback');
 assert.match(easy,/setTab\('type'\);setWizard\(true\);setCollapsed\(false\)/,
  'A dismissed wizard resumes from guided selections instead of generating');
 assert.match(easy,/label:'ชนิดรูป',kind:'type'/,'The progress bar includes the actual photo-type step');
 assert.match(easy,/\.\.\.\(thaiHairConfirmation\?\[\{label:'ทรงผม'/,
  'Only Thai progress bars include a hair-selection stage');
 assert.match(easy,/onSelectFaceFinish\?\.\(style\);setFinishChosen\(true\)/,
  'Makeup selection completes the first step before continuing');
 assert.match(studio,/if\(!englishFlow\)\{setThaiChoiceFlow\(\{origin:'finish',step:'hair'\}\);setPicker\('hair'\)\}else\{setThaiChoiceFlow\(null\)\}/,
  'English makeup no longer leaves a hidden Thai hair-step requirement');
 assert.match(studio,/if\(!englishFlow&&hairGender==='female'&&thaiChoiceFlow\?\.step!=='ready'\)return/,
  'Thai explicitly completes Hair + Makeup; English auto hair is not blocked');
 assert.match(css,/Guided Easy Mode may show six stages in Thai/,'Mobile step row adapts to all steps');
 assert.doesNotMatch(easy,/!hasResult&&thaiHairConfirmation&&choicesReady&&currentSuit\?\s*<button/,
  'Old early Create shortcut must not return');
});
test('Natural to Makeup edits the completed Natural image with the shared reference finish once',async()=>{
 const selected=fields('th','natural','one');
 assert.equal(shouldUseNaturalMasterMakeup(selected,'makeup'),true);
 assert.equal(shouldUseNaturalMasterMakeup({...selected,femaleEyeStyle:'makeup'},'makeup'),false);
 const requests=[];
 const makeup=await generateMakeupFromCompletedNatural({natural:rgba,fields:selected,key:'test-makeup',
  requestPortrait:async request=>{requests.push(request);return {png:rgba}}});
 assert.equal(requests.length,1,'Existing Natural image only takes one additional AI request');
 assert.equal(requests[0].portraitMime,'image/png');
 assert(requests[0].prompt.includes(AI_MAKEUP_PROMPT),'Edit context uses the approved completed Natural photograph');
 assert(requests[0].prompt.endsWith(MAKEUP_STUDIO_RETOUCH_POLICY),'Same reference appearance as direct Makeup');
 assert.equal(requests[0].prompt.split(MAKEUP_STUDIO_RETOUCH_POLICY).length-1,1);
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

test('English-only Studio remembers homepage gender and always reselects it for a newly added Studio photo',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const studio=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 assert.match(main,/if\(englishPreviewEnabled\(\)\)v\.idpromPortraitMode=gender/,'Upload captures the homepage sex');
 assert.match(main,/if\(englishPreviewEnabled\(\)&&f\)f\.idpromPortraitMode=gender/,'Homepage sex changes after upload stay in sync');
 assert.match(main,/initialGender=\{englishPreviewEnabled\(\)\?gender:null\}/,'Only English passes remembered gender to Studio');
 assert.match(studio,/englishFlow\?\(initialSourcePhoto\?\.idpromPortraitMode\|\|initialGender\):null/,'First visit restores sex from uploaded source');
 const source=studio.slice(studio.indexOf(' const addSourcePhoto=async '),studio.indexOf(' useEffect(()=>{if(!initialSourcePhoto'));
 assert.match(source,/if\(englishFlow\)apiFile\.idpromPortraitMode=null/,'New Studio upload cannot inherit the previous image sex');
 assert.match(source,/else if\(englishFlow\)\{setPicker\(false\);setPortraitChoiceOpen\(true\)/,'Every Studio replacement opens a sex modal before creation');
 assert.match(source,/if\(englishFlow\)\{setEnglishInlineAi\(null\);setEnglishDraft\(null\);setEnglishRoute\(null\);setEnglishStep\(null\)\}/,'English setup is suspended under the gender modal');
 assert.match(studio,/englishFlow\?'Choose the photo type':'กรุณาเลือกชนิดรูป'/,'Modal is localized in English without changing Thai copy');
 assert.match(studio,/if\(englishFlow\)\{trackPhotoType\(mode,'select'\);if\(sourcePhoto\)\{sourcePhoto\.idpromPortraitMode=mode/,'Chosen gender binds to the new uploaded photo');
 assert.match(studio,/setEnglishStep\('choose'\);setEnglishRoute\(null\);setStatus\(''\);return/,'Choosing gender shows existing English AI/manual setup, no processing yet');
});
test('English homepage and Easy Mode use AI automatic hair for both men and women',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const studio=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 const easy=await readFile(new URL('../src/easy-mode.jsx',import.meta.url),'utf8');
 const english=await readFile(new URL('../src/english-portrait-flow.jsx',import.meta.url),'utf8');
 assert.match(studio,/allowHairChoice=\{false\} initialGender=/,'English landing wizard does not offer manual hair options');
 assert.match(english,/hair:allowHairChoice\?hair:''/,'Woman and man both send AI-selected default hair');
 assert.match(english,/gender==='female'&&<fieldset/,'Makeup choices appear only for women');
 assert.match(easy,/const wizardTabs=englishPreviewEnabled\(\)\?\['type','suit','background'\]/,'English Easy Mode skips hair step');
 assert.match(easy,/hasResult&&!englishPreviewEnabled\(\)&&<button className=\{tab==='hair'/,'Hair picker tab hidden in English Easy Mode');
 assert.match(main,/\{!englishPreviewEnabled\(\)&&<button type="button" data-hair-guide="male-hair"/,'Old English homepage does not expose male hair controls');
 assert.match(main,/\{!englishPreviewEnabled\(\)&&<button type="button" data-hair-guide="female-hair"/,'Old English homepage does not expose female hair controls');
 assert.match(main,/!englishPreviewEnabled\(\)&&f&&!b&&hairId===null/,'English homepage has no hairstyle-first hint');
});
test('English Studio shows two neat free hairs before Diamond per gender; Diamond needs active 30-day package',async()=>{
 assert.deepEqual(ENGLISH_STUDIO_FREE_HAIR_IDS.female,['seedream-49','seedream-53']);
 assert.deepEqual(ENGLISH_STUDIO_FREE_HAIR_IDS.male,['seedream-67','seedream-76']);
 for(const gender of ['female','male']){
  const ids=ENGLISH_STUDIO_FREE_HAIR_IDS[gender];
  assert.equal(ids.length,2);
  ids.forEach(id=>assert.equal(isEnglishStudioFreeHair(id,gender),true));
  assert.equal(isEnglishStudioDiamondHair('seedream-999',gender),true);
  assert.equal(isEnglishStudioDiamondHair('',gender),false);
  assert.deepEqual(orderEnglishStudioHair([{id:'seedream-999',gender},{id:ids[1],gender},{id:ids[0],gender}],gender).map(h=>h.id),[ids[0],ids[1],'seedream-999']);
 }
 const now=Date.parse('2026-11-15T12:00:00Z'),wallet={usdPremiumPurchased:true,usdPremiumActive:true,usdPremiumUntil:'2026-12-14T12:00:00Z'};
 assert.equal(englishStudioDiamondActive(wallet,now),true);
 assert.equal(englishStudioDiamondActive({...wallet,usdPremiumUntil:'2026-11-14T12:00:00Z'},now),false,'Expired 30-day package cannot select a new Diamond hair');
 assert.equal(englishStudioDiamondActive({...wallet,usdPremiumActive:false},now),false);
 assert.equal(englishStudioDiamondActive({...wallet,usdPremiumPurchased:false},now),false);
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const studio=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 const payments=await readFile(new URL('../payment-store.js',import.meta.url),'utf8');
 assert.match(payments,/usd_premium_expires_at=clock_timestamp\(\)\+interval '30 days'/,'Use existing server 30-day validity, no invented plan');
 assert.match(main,/englishPreviewEnabled\(\)\?englishStudioDiamondActive\(knownWalletData\):rights\.premiumDownloadRemaining>0/,'English uses 30-day purchase, Thai keeps own rights');
 assert.match(main,/englishPreviewEnabled\(\)\?orderEnglishStudioHair\(ENGLISH_MALE_HAIR_CATALOG,'male'\):MALE_HAIR_OPTIONS/,'Only English hair gets reordered');
 assert.match(main,/englishPreviewEnabled\(\)\?orderEnglishStudioHair\(ENGLISH_FEMALE_HAIR_CATALOG,'female'\):STUDIO_FEMALE_HAIR_OPTIONS/);
 assert.match(studio,/const premiumHairAllowed=englishFlow\?premiumHairCreditAvailable===true:/,'Thai purchase rights untouched');
 assert.match(studio,/const isPremiumHair=id=>englishFlow\?isEnglishStudioDiamondHair/,'Thai free and Diamond mappings untouched');
 assert.match(studio,/if\(isPremiumHair\(id\)&&!premiumHairAllowed&&!canRestoreHair\(id,englishInlineAi\.gender,englishInlineAi\.finish\)\)/,'English pending hair selection checks 30-day plan');
 assert.match(studio,/if\(hair&&isPremiumHair\(hair\)&&!premiumHairAllowed&&!canRestoreHair\(hair,gender,finish\)\)/,'Creation cannot bypass Diamond eligibility');
 assert.match(studio,/englishFlow\?isPremiumHair\(h\.id\)/,'Each English Diamond tile is visibly marked');
 assert.match(studio,/\{!englishFlow&&isFreeFemaleHair\(h\.id\)&&<small>ฟรี<\/small>\}/,'English hides Free labels, while Thai retains the Thai caption');
 assert.match(studio,/\(!englishFlow\|\|hairGender==='female'\|\|id!=='makeup'\)/,'Male English studio does not show makeup');
 assert.match(studio,/rememberProcessedHistory\(previous\)/,'Existing Studio Undo/Redo continues tracking processed results');
});

test('Diamond hair in both locales opens existing Download packages with the actual visible Studio photo',async()=>{
 const studio=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const offers=await readFile(new URL('../src/package-offers.jsx',import.meta.url),'utf8');
 const styles=await readFile(new URL('../src/package-offers.css',import.meta.url),'utf8');
 const snapshot=studio.slice(studio.indexOf(' const openDiamondHairOffer=hairId=>'),studio.indexOf(' const chooseHair=id=>'));
 const choose=studio.slice(studio.indexOf(' const chooseHair=id=>'),studio.indexOf(' const createThaiHairWithFinish=style=>'));
 assert.match(snapshot,/canvasRef\.current/,'Screenshot must come from the current displayed Studio canvas');
 assert.match(snapshot,/ctx\.drawImage\(current,0,0,thumb\.width,thumb\.height\)/,'Snapshot contains the on-screen photo, not the original upload');
 assert.match(snapshot,/ctx\.fillText\('IDพร้อม',0,0\)/,'Use the same watermark style as download checkout');
 assert.match(snapshot,/onRequestUnlock\?\.\(\{reason:'diamond-hair',hairId,preview,jobId:/,'Use existing checkout callback with the clicked image');
 assert.doesNotMatch(snapshot,/void applyHair|onChangeHair|processPhoto\(|onProcessPhoto\(/,'Preview capture must never call AI');
 assert.match(choose,/if\(englishFlow&&englishInlineAi\)\{\s*if\(isPremiumHair\(id\)&&!premiumHairAllowed[\s\S]*?\{openDiamondHairOffer\(id\);return\}/,'English in-photo Diamond hair opens checkout');
 assert.match(choose,/if\(!englishFlow\)\{\s*if\(isPremiumHair\(id\)&&!premiumHairAllowed[\s\S]*?\{openDiamondHairOffer\(id\);return\}/,'Thai Diamond hair opens checkout');
 assert.match(choose,/if\(isPremiumHair\(id\)&&!premiumHairAllowed&&!canRestoreHair\(id,hairGender,easyFaceFinish\)\)\{openDiamondHairOffer\(id\);return\}/,'English hair picker opens checkout without generation');
 assert.match(studio,/if\(hair&&isPremiumHair\(hair\)&&!premiumHairAllowed&&!canRestoreHair\(hair,gender,finish\)\)\{openDiamondHairOffer\(hair\);return\}/,'Final English Create retains Diamond safeguard');
 assert.match(main,/setCheckoutPreview\(\{kind:'diamond-hair',jobId:context\.jobId\|\|'',preview:context\.preview\|\|null\}\)/,'Checkout snapshots are bound to this explicit Diamond click');
 assert.match(main,/if\(checkoutPreview\?\.kind==='diamond-hair'\)return checkoutPreview\.preview\|\|undefined/,'Do not show an older photo when a new Studio upload has no job');
 assert.match(main,/<PackageOffers preview=\{checkoutImagePreview\(true\)\} diamondHairOffer=/,'Diamond click uses the same PackageOffers component as Download');
 assert.match(main,/preview=\{checkoutImagePreview\(\)\}/,'Same captured photo can appear in checkout summary');
 assert.match(offers,/const \[selected,setSelected\]=useState\(diamondHairOffer\?'159':'89'\)/,'Thai Diamond checkout preselects 159 rather than basic');
 assert.match(offers,/diamondHairOffer&&preview&&<figure className="en-diamond-photo-preview">/,'English Diamond offer shows the current photo with the Premium plan');
 assert.match(styles,/\.en-diamond-photo-preview img/,'English preview remains visible on desktop and mobile');
});

test('reference Makeup complexion is continuous and softly dewy without a mask or extra processing',()=>{
 const makeup=onePassSkinQualityPriority('makeup',false);
 const englishMakeup=onePassSkinQualityPriority('makeup',true);
 const natural=onePassSkinQualityPriority('natural',false);
 for(const prompt of [makeup,englishMakeup]){
  assert(prompt.includes(MAKEUP_STUDIO_RETOUCH_POLICY));
  assert.match(prompt,/Soften the contrast of superficial skin wrinkles and fine lines/);
  assert.match(prompt,/keep the person's actual age, expression, anatomical folds and features/);
  assert.match(prompt,/Check again for temporary acne marks and residual high-contrast superficial fine lines/);
  assert.match(prompt,/active pimples, acne bumps, acne-red\/brown dots/);
  assert.match(prompt,/throughout the forehead, temples, both cheeks to their outer edges/);
  assert.match(prompt,/LIGHT AND SURFACE — BROAD SOFTBOX, DEWY PHOTOGRAPHIC REFLECTIONS/);
  assert.match(prompt,/across the whole face, ears and visible neck/);
  assert.match(prompt,/No preliminary Natural generation, additional provider request, face\/skin mask/);
  assert.match(prompt,/SAME requested AI generation\/edit/);
  assert.match(prompt,/authentic pigment depth and undertone/);
 }
 assert.doesNotMatch(natural,/FINAL MAKEUP STUDIO-RETOUCH AUTHORITY/,'Natural keeps its separate no-makeup skin rules');
 assert.match(natural,/NO ADDED MAKEUP/);
});

test('both genders receive a last AI-only clean-nape rule without changing cosmetics or genuine long hair',async()=>{
 const femaleThai=await run('th','makeup','one');
 const femaleEnglish=await run('en','natural','one');
 for(const got of [femaleThai,femaleEnglish]){
  assert.equal(got.calls.length,1);
  const prompt=got.calls[0].prompt;
  assert.match(prompt,/FINAL HAIR-ONLY NAPE \/ SIDE-NECK CLEANUP/);
  assert.match(prompt,/NO visible bun, low bun, nape knot/);
  assert.match(prompt,/directly UNDER either ear/);
  assert.match(prompt,/tuck the collected ends invisibly against the BACK OF THE SKULL ABOVE THE NAPE/);
  assert.match(prompt,/IF HAIR IS LOOSE\/LONG: preserve genuine continuous long sections/);
  assert.match(prompt,/Do not add a mask, blur, skin filter, postprocessing pass or second AI request/);
  assert.equal(prompt.match(/FINAL HAIR-ONLY NAPE \/ SIDE-NECK CLEANUP/g)?.length,1);
 }
 const maleCalls=[];
 await processProductionPortrait({
  input,fields:{portraitMode:'male',femaleEyeStyle:'natural'},root,key:'male-nape-test',
  removeBackground:async()=>rgba,requestPortrait:async req=>{maleCalls.push(req);return {png:rgba}}
 });
 assert.equal(maleCalls.length,1,'Men still use one provider request');
 assert.match(maleCalls[0].prompt,/FINAL HAIR-ONLY NAPE \/ SIDE-NECK CLEANUP/);
 for(const [got,english,gender] of [[femaleThai,false,'female'],[femaleEnglish,true,'female'],[{calls:maleCalls},false,'male']]){
  assert(got.calls[0].prompt.endsWith(selectedHairBoundaryInstruction(null,{portraitMode:gender,english,keepCurrentHair:false,referenceBoard:false})),'Kind-specific under-ear rule must be last after cosmetics and no-bun cleanup');
  assert.equal(got.calls[0].prompt.match(/FINAL SELECTED HAIR BOUNDARY AUTHORITY/g)?.length,1);
 }
 const catalog=await readFile(new URL('../hairstyle-catalog.js',import.meta.url),'utf8');
 assert.match(catalog,/selected-silhouette-v29-face-only-compact-source/);
 assert.doesNotMatch(catalog,/discreetly at the low rear/);
});
