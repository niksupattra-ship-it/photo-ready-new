import test from 'node:test';
import assert from 'node:assert/strict';
import {FEMALE_MATCHED_PRO_PROMPT as old} from '../female-matched-pro-prompt.js';
import {FEMALE_SOFT_KOREAN_PRO_PROMPT as prompt} from '../female-soft-korean-pro-prompt.js';
import {FEMALE_MATCHED_PRO_VERSION,FEMALE_SOFT_KOREAN_PRO_VERSION} from '../female-exact-prompt-policy.js';
import {productionFemalePromptFor} from '../production-female-skin-prompt.js';
import {seedreamReviewPayload} from '../seedream-review-transport.js';
test('Korean skin finish preserves all composition, identity, hairstyle and garment instructions',()=>{
 assert.equal(prompt.slice(0,prompt.indexOf('SOFT KOREAN MAKEUP')),old.slice(0,old.indexOf('PREMIUM SKIN RETOUCHING:')));
 assert.equal(prompt.slice(prompt.indexOf('PROFESSIONAL CAMERA QUALITY:')),old.slice(old.indexOf('PROFESSIONAL CAMERA QUALITY:')));
 for(const term of ['naturally fair, softly rosy finish','face, ears and exposed neck consistent','soft pink blush','natural rose-pink lip tint','EYES — ORIGINAL IDENTITY LOCK','iris and pupil color, size and position','Do not add eye shadow, eyeliner, false lashes','outside the eye boundaries','No chalk-white face'])assert(prompt.includes(term),term);
 assert(!prompt.includes('Enhance the clarity of the eyes, eyebrows, eyelashes'));
 assert.equal(prompt.split('EYES — ORIGINAL IDENTITY LOCK').length,2);
});
test('archived Pro jobs retain their old prompt while the new eye-locked version is enforced independently',()=>{
 assert.equal(productionFemalePromptFor(FEMALE_MATCHED_PRO_VERSION),old);
 assert.equal(productionFemalePromptFor(FEMALE_SOFT_KOREAN_PRO_VERSION),prompt);
 for(const [version,text]of [[FEMALE_MATCHED_PRO_VERSION,old],[FEMALE_SOFT_KOREAN_PRO_VERSION,prompt]]){
  const payload={model:'dola-seedream-5-0-pro-260628',size:'2K',prompt:text,image:['prepared','identity','hair','outfit']};
  assert.equal(seedreamReviewPayload({prompt:text,femalePreplacedVersion:version,preparedFemalePayload:payload}),payload);
  assert.throws(()=>seedreamReviewPayload({prompt:text+'\nextra eye instructions',femalePreplacedVersion:version,preparedFemalePayload:{...payload,prompt:text+'\nextra eye instructions'}}),/Invalid matched Pro/);
 }
});
