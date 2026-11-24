import {isThaiOutfitAi} from './thai-outfit-ai-policy.js';
export const THAI_SOFT_EYE_MAKEUP_VERSION='thai-natural-brow-lash-liner-v1';
export const usesThaiSoftEyeMakeup=fields=>isThaiOutfitAi(fields)&&fields?.portraitMode==='female'&&fields.femaleEyeStyle==='makeup'&&fields.thaiSoftEyeMakeupVersion===THAI_SOFT_EYE_MAKEUP_VERSION;
// Only explicitly opted-in new Makeup requests. Natural, men, English and
// archived jobs retain their released prompts and accepted cached pixels.
export function thaiSoftEyeMakeupInstruction(fields){
 if(!usesThaiSoftEyeMakeup(fields))return '';
 return `\nAPPROVED LIGHT BROW / LASH / LINER GROOMING — MAKEUP ONLY:
Keep this same person's original eye shape, corners, eyelid aperture and folds, iris/pupil size and colour, gaze, existing catchlights and expression. Keep the original eyebrow position, arch, width, endpoint and natural asymmetry. Earlier instructions to retain original brows/lashes protect this anatomy; they allow ONLY the subtle cosmetic grooming described here, not a replacement brow or eye.
BROWS: Gently comb the existing brow hairs into their natural growth direction and tidy isolated stray hairs close to the existing outline. Fill only tiny gaps inside the original brow with sparse fine hair-like strokes matching its existing colour. Keep the brow head soft and individual hairs visible; no new arch, raised tail, symmetric stencil, enlarged brow, solid dark block or sharp painted border.
LASHES: Lightly separate and define the person's existing upper lashes with a very thin natural mascara tint. Retain their actual length, density, direction and attachment at the original lid. No false lashes, extensions, extra rows, heavy volume, exaggerated curl, spidery clumps or dark lower-lash fringe. The result must stay fine, airy and natural.
LINER: Add a barely visible, hairline-thin soft brown line only between/along the existing upper lash roots. Follow the actual lid without enlarging the eye opening. No wing, extended or lifted outer corner, thick black band, lower waterline or dramatic smoky eye.
Keep the approved skin/lip/cheek finish, real facial anatomy, head/neck/body proportions, selected hair and outfit unchanged. Complete this delicate grooming in the SAME original image-generation call; no second AI pass, local eye warp or face replacement.`;
}
