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

test('requested pigment repair removes recognized freckle preservation without changing identity and scene text',()=>{
 const before='Identity and scene. Preserve stable moles, freckles, birthmarks, normal age lines and uncertain identifying marks. Keep permanent features such as distinctive freckles and moles. Do not whiten or transplant another face. Eyes and garment.';
 const after=normalizeOpenAIPhotographicFinish(before);
 assert(!after.includes('Preserve stable moles, freckles'));
 assert(!after.includes('Keep permanent features such as distinctive freckles'));
 assert(after.startsWith('Identity and scene.'));assert(after.endsWith('Eyes and garment.'));
 assert(after.includes('genuine identifying moles'));assert(after.includes('retaining fine pore texture'));
 assert.equal(normalizeOpenAIPhotographicFinish(after),after);
});
