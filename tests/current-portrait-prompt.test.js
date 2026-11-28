import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {FEMALE_PORTRAIT_PROMPT,FEMALE_LAB_PROCESS_VERSION,usesFemaleExactPrompt} from '../female-portrait-prompt.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {seedreamReviewPayload} from '../seedream-review-transport.js';
import {FEMALE_CURRENT_PROMPT_CACHE_KEY} from '../female-prompt-cache-key.js';
import {shouldRecoverHairSubmission} from '../src/female-hair-submission.js';
import {THAI_OUTFIT_AI_VERSION} from '../thai-outfit-ai-policy.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('current female prompt, cache identity and male generator retain their approved bytes',async()=>{
 assert.equal(hash(FEMALE_PORTRAIT_PROMPT),'045fd1d5f306c8f51562d4caf53e426bf8ccf474559edeba5570f87cf3296389');
 assert.notEqual(FEMALE_CURRENT_PROMPT_CACHE_KEY,'female-prompt-12e89c3376650eab');
 const male=await readFile(new URL('../male-portrait-prompt.js',import.meta.url),'utf8');
 const originalMale=male.slice(male.indexOf("import {isThaiOutfitAi}"),male.indexOf('\n// Current English male templates')).trimEnd()+'\n';
 assert.equal(hash(originalMale),'61a4540d9d555ea9685fa2dba72d28b9219fee0c3c0d3330cfaa19d0a955c1a8');
});
test('retired female requests fail before generating, with no fallback or cross-version recovery',async()=>{
 let calls=0;
 for(let n=5;n<=12;n++){
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

test("current female prompt locks original gaze and uses brow strokes without reshaping",()=>{for(const text of ["EYES AND GAZE — ORIGINAL IDENTITY LOCK", "SOFT KOREAN HAIR-STROKE EYEBROWS", "Do not lift the eyebrows", "from Image 1"])assert(FEMALE_PORTRAIT_PROMPT.includes(text));});
