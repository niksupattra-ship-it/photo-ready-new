import test from 'node:test';
import assert from 'node:assert/strict';
import {MAKEUP_STUDIO_RETOUCH_POLICY} from '../makeup-studio-retouch-policy.js';
import {normalizeThaiRealFaceAppearance} from '../thai-real-face-policy.js';
import {normalizeOpenAIPhotographicFinish,OPENAI_CRISP_MAKEUP_POLICY} from '../openai-photographic-finish.js';
test('known original and Thai-normalized Makeup replace texture-erasing sections while preserving palette and scene locks',()=>{
 for(const policy of [MAKEUP_STUDIO_RETOUCH_POLICY,normalizeThaiRealFaceAppearance(MAKEUP_STUDIO_RETOUCH_POLICY)]){
  const result=normalizeOpenAIPhotographicFinish('identity-prefix\n'+policy+'\ngeometry-suffix');
  assert.equal(result,'identity-prefix\n'+OPENAI_CRISP_MAKEUP_POLICY+'\ngeometry-suffix');
  assert(!result.includes('clean wrinkle-free'));assert(!result.includes('Retouch away visible superficial skin wrinkles'));
  assert(!result.includes('MAKEUP-ONLY CREASE / DARK-CIRCLE FINISH'));
  assert(result.includes('ONE COHERENT PINK-NUDE COSMETIC PALETTE'));
  assert(result.includes('PROTECTED PERSON AND SCENE'));
  assert(result.includes('Keep the actual eye boundaries, iris, gaze and catchlights unchanged'));
 }
});
test('Natural and unknown prompt bytes remain unchanged and normalization is idempotent',()=>{
 const original='Keep Natural. No cosmetics. Preserve face and outfit.';
 assert.equal(normalizeOpenAIPhotographicFinish(original),original);
 assert.equal(normalizeOpenAIPhotographicFinish(OPENAI_CRISP_MAKEUP_POLICY),OPENAI_CRISP_MAKEUP_POLICY);
});
