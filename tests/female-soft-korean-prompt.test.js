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

test('age and facial structure lock preserves mature contours, old eye lock and all noncosmetic instructions',async()=>{
 const {FEMALE_AGE_LOCK_PRO_PROMPT:next}=await import('../female-soft-korean-pro-prompt.js');
 const {FEMALE_AGE_LOCK_PRO_VERSION}=await import('../female-exact-prompt-policy.js');
 assert.equal(next.slice(0,next.indexOf('SOFT KOREAN MAKEUP')),prompt.slice(0,prompt.indexOf('SOFT KOREAN MAKEUP')));
 assert.equal(next.slice(next.indexOf('PROFESSIONAL CAMERA QUALITY:')),prompt.slice(prompt.indexOf('PROFESSIONAL CAMERA QUALITY:')));
 for(const term of ['same apparent age and maturity as Image 2','Do not make the person look younger or older','Keep age-defining expression lines','jaw width and angles','facial width-to-height ratio','natural asymmetry','never internal facial anatomy','EYES — ORIGINAL IDENTITY LOCK','naturally fair, softly rosy finish'])assert(next.includes(term),term);
 assert(!next.includes('Refine coarse pores and superficial fine lines'));
 assert(prompt.includes('Refine coarse pores and superficial fine lines'),'Queued v11 prompts stay intact');
 assert.equal(productionFemalePromptFor(FEMALE_SOFT_KOREAN_PRO_VERSION),prompt);
 assert.equal(productionFemalePromptFor(FEMALE_AGE_LOCK_PRO_VERSION),next);
 const payload={model:'dola-seedream-5-0-pro-260628',size:'2K',prompt:next,image:['prepared','identity','hair','outfit']};
 assert.equal(seedreamReviewPayload({prompt:next,femalePreplacedVersion:FEMALE_AGE_LOCK_PRO_VERSION,preparedFemalePayload:payload}),payload);
});
