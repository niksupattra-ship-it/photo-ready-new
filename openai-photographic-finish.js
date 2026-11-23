import {MAKEUP_STUDIO_RETOUCH_POLICY} from './makeup-studio-retouch-policy.js';
import {normalizeThaiRealFaceAppearance} from './thai-real-face-policy.js';

const complexion=`COMPLEXION — PHOTOGRAPHIC TEXTURE BEFORE COSMETIC COLOUR: Correct visible freckles, dark spots, melasma-like patches, post-acne brown/red marks, active blemishes and patchy redness into adjacent clear healthy skin. Keep genuine identifying moles and birthmarks, fine real pores, fine facial hair and normal age lines. Separate unwanted pigment spots from fine pore texture: remove the spots, retain the pores. Do not remove all facial surface relief, manufacture pore patterns, blur clear skin, apply surface diffusion or paint a continuous foundation plate. Preserve original facial anatomy, eyelid margins, eyes, expression, brow shape and lip contour. Keep realistic three-dimensional shading from face through ears and neck.`;
const underEye=`MAKEUP-ONLY UNDER-EYE LIGHT: Gently reduce unwanted dark colour casts with balanced studio fill, retaining normal fine skin texture and anatomical folds. Do not erase every crease, rebuild the under-eye surface or brighten it into a pale flat band. Keep the actual eye boundaries, iris, gaze and catchlights unchanged.`;
const delivery=`DELIVERY: Return one sharply focused photographic portrait with the selected nude-rose cosmetics and subtle natural rosy vitality. Keep genuine fine skin texture and individual brow/hair strands resolved. Soft light is illumination, never blurred skin or smeared hair. Preserve the person's actual complexion depth, age, anatomy, expression and original eyes. Clear cosmetic freckles and unwanted dark pigmentation selectively while retaining fine real pores, genuine identifying moles, birthmarks and anatomical age. Keep the supplied hairstyle, garment, insignia, neck and framing instructions intact. Complete in the existing single generation; no extra provider call or local skin filter.`;
// Replace only the known shared Makeup specification, including its Thai
// eye-safe normalization. Unknown prompts and all reference bytes remain intact.
export const OPENAI_CRISP_MAKEUP_POLICY=normalizeThaiRealFaceAppearance(MAKEUP_STUDIO_RETOUCH_POLICY)
 .replace(/TARGET:[\s\S]*?(?=\n\nCOMPLEXION —)/,'TARGET: A real professional camera portrait with fine-pored skin, individually resolved eyebrow hairs and hair strands, balanced studio light, a subtle healthy rosy complexion and the selected nude-rose cosmetics. No airbrushed or surface-diffused skin. Retain the original person and actual eye detail.')
 .replace(/COMPLEXION — CONTINUOUS STUDIO RETOUCH BEFORE COSMETIC COLOUR:[\s\S]*?(?=\n\nMAKEUP-ONLY CREASE)/,complexion)
 .replace(/MAKEUP-ONLY CREASE \/ DARK-CIRCLE FINISH — PRIORITY AFTER FACIAL IDENTITY:[\s\S]*?(?=\n\nLIGHT AND SURFACE)/,underEye)
 .replace(/DELIVERY:[\s\S]*$/,delivery);
export function normalizeOpenAIPhotographicFinish(prompt){
 for(const policy of [MAKEUP_STUDIO_RETOUCH_POLICY,normalizeThaiRealFaceAppearance(MAKEUP_STUDIO_RETOUCH_POLICY)])prompt=prompt.replaceAll(policy,OPENAI_CRISP_MAKEUP_POLICY);
 return prompt
  .replaceAll('Preserve stable moles, freckles, birthmarks, normal age lines and uncertain identifying marks.', 'Preserve genuine identifying moles, birthmarks and normal age lines. Correct cosmetic freckles and unwanted dark pigmentation while retaining fine pore texture.')
  .replaceAll('Keep permanent features such as distinctive freckles and moles.', 'Keep genuine identifying moles and birthmarks; correct cosmetic freckles and dark spots without erasing fine pores.')
  .replaceAll('Do not whiten or transplant another face', 'Do not transplant another face');
}
