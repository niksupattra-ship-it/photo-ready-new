import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {FEMALE_PORTRAIT_PROMPT,FEMALE_REAR_HAIR_POLICY,FEMALE_LAB_PROCESS_VERSION,usesFemaleExactPrompt} from '../female-portrait-prompt.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {seedreamReviewPayload} from '../seedream-review-transport.js';
import {FEMALE_CURRENT_PROMPT_CACHE_KEY,femalePromptCacheKey} from '../female-prompt-cache-key.js';
import {FEMALE_GUIDE_EDIT_FLASH_POLICY,FEMALE_GUIDE_EDIT_HAIR_EXTENT_POLICY} from '../female-guide-edit-prompt.js';
import {shouldRecoverHairSubmission} from '../src/female-hair-submission.js';
import {THAI_OUTFIT_AI_VERSION} from '../thai-outfit-ai-policy.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('current female prompt, cache identity and male generator retain their approved bytes',async()=>{
 assert.equal(hash(FEMALE_PORTRAIT_PROMPT.replace(FEMALE_GUIDE_EDIT_FLASH_POLICY,'').replace(FEMALE_GUIDE_EDIT_HAIR_EXTENT_POLICY,`Keep continuing long hair behind both shoulders and behind the
garment. Preserve the genuine endpoints of short, bob and gathered
styles without adding extra lengths.`)),'b2827c47735a1dcdbaa34c33c2cd806713fbcd538ec6e671a88f10d18d3d5a0b','Approved guide-only prompt, with the existing lighting block kept separate');
 assert.notEqual(FEMALE_CURRENT_PROMPT_CACHE_KEY,'female-prompt-12e89c3376650eab');
 assert.notEqual(femalePromptCacheKey(FEMALE_PORTRAIT_PROMPT.replace(FEMALE_GUIDE_EDIT_FLASH_POLICY,'')),FEMALE_CURRENT_PROMPT_CACHE_KEY,'Old lighting output must not share the new prompt cache');
 const male=await readFile(new URL('../male-portrait-prompt.js',import.meta.url),'utf8');
 const originalMale=male.slice(male.indexOf("import {isThaiOutfitAi}"),male.indexOf('\n// Current English male templates')).trimEnd()+'\n';
 assert.equal(hash(originalMale),'61a4540d9d555ea9685fa2dba72d28b9219fee0c3c0d3330cfaa19d0a955c1a8');
});
test('retired female requests fail before generating, with no fallback or cross-version recovery',async()=>{
 let calls=0;
 for(let n=5;n<=13;n++){
  const version='thai-female-exact-three-ref-pro-v'+n+'-retired';
  const fields={portraitMode:'female',portraitComposition:'en-outfit-body-v1',thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiWholeHeadGuideVersion:version,neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png'};
  assert.equal(usesFemaleExactPrompt(fields),false);
  await assert.rejects(processProductionPortrait({fields,input:{},requestPortrait:async()=>{calls++;}}),/รีเฟรช/);
  assert.throws(()=>seedreamReviewPayload({femalePreplacedVersion:version}),/Invalid current female payload/);
  assert.equal(shouldRecoverHairSubmission(JSON.stringify([version]),JSON.stringify([FEMALE_LAB_PROCESS_VERSION]),'processing'),false);
 }
 assert.equal(calls,0);
 assert.equal(shouldRecoverHairSubmission('same-current-request','same-current-request','processing'),true);
});

test('all current English gender and finish templates retain their exact approved text',async()=>{
 const {englishHeadPortraitPrompt,englishTemplateBodyPrompt}=await import('../male-portrait-prompt.js');
 const cases=JSON.parse(await readFile(new URL('./fixtures/current-english-prompt-hashes.json',import.meta.url),'utf8'));
 for(const row of cases)assert.equal(hash((row.kind==='head'?englishHeadPortraitPrompt:englishTemplateBodyPrompt)(row.options)),row.sha256,JSON.stringify(row.options));
});

test('English creation accepts only the current contract for the selected gender',async()=>{
 const {validateEnglishStudioFinish}=await import('../english-studio-finish-policy.js');
 const {englishTemplateBodyFinishForGender}=await import('../english-template-body-policy.js');
 for(const portraitMode of ['female','male']){
  const fields={interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',portraitMode,englishStudioFinishVersion:englishTemplateBodyFinishForGender(portraitMode)};
  assert.doesNotThrow(()=>validateEnglishStudioFinish(fields));
  for(const version of ['en-female-matched-head-body-v1','en-body-proportion-lock-v8','en-template-locked-body-v3'])assert.throws(()=>validateEnglishStudioFinish({...fields,englishStudioFinishVersion:version}),/Retired English/);
 }
});

test('the prepared guide alone supplies facial identity and anatomy',()=>{
 for(const text of ['face already present in Image 1','Keep the original eye opening','do not reshape facial features'.replace('do not','Do not'),'delicate eyebrow hair strokes'])assert(FEMALE_PORTRAIT_PROMPT.includes(text));
});
test('the original guide remains the placement authority without a new head or neck scale rule',()=>{
 for(const text of ['EDIT IMAGE 1 IN PLACE','Keep the exact head-to-shoulder ratio and jaw-to-collar distance','at its existing scale and position','Do not resize the head'])assert(FEMALE_PORTRAIT_PROMPT.includes(text));
 for(const text of ['Image 4','36–40%','32–36%','slightly brighter soft frontal'])assert(!FEMALE_PORTRAIT_PROMPT.includes(text));
});

test('retired Flash and four-reference contracts cannot submit or recover guide-only jobs',async()=>{
 for(const retired of ['thai-female-exact-three-ref-pro-v13-complete-lab-process','thai-female-exact-four-ref-pro-v14-pr279']){
 const fields={portraitMode:'female',portraitComposition:'en-outfit-body-v1',thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiWholeHeadGuideVersion:retired,neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png'};
 let calls=0;await assert.rejects(processProductionPortrait({fields,input:{},requestPortrait:async()=>{calls++;}}),/รีเฟรช/);assert.equal(calls,0);
 assert.equal(shouldRecoverHairSubmission(JSON.stringify([retired]),JSON.stringify([FEMALE_LAB_PROCESS_VERSION]),'completed'),false);
 }
 const options={femalePreplacedVersion:FEMALE_LAB_PROCESS_VERSION,prompt:FEMALE_PORTRAIT_PROMPT};
 for(const payload of [{model:'dola-seedream-5-0-flash-260915',image:['a','b','c','d']},{model:'dola-seedream-5-0-pro-260628',image:['a','b','c','d']}])assert.throws(()=>seedreamReviewPayload({...options,preparedFemalePayload:{...payload,prompt:FEMALE_PORTRAIT_PROMPT,size:'2K'}}),/Invalid current female payload/);
});

test('shared prompt explicitly treats blank selected hair reference space as no hair',()=>{assert(FEMALE_PORTRAIT_PROMPT.includes(FEMALE_GUIDE_EDIT_HAIR_EXTENT_POLICY));assert.match(FEMALE_GUIDE_EDIT_HAIR_EXTENT_POLICY,/ONLY if Image 2 actually shows long connected lengths/);assert.match(FEMALE_GUIDE_EDIT_HAIR_EXTENT_POLICY,/below both ears and\s+beside both sides of the neck must be free of hair/);});
