import {isThaiOutfitAi} from './thai-outfit-ai-policy.js';
export const THAI_REAL_FACE_PREVIOUS_VERSION='thai-real-face-original-eyes-v1';
export const THAI_REAL_FACE_VERSION='thai-real-face-original-eyes-v2-full-frame';
export const usesThaiRealFace=fields=>isThaiOutfitAi(fields)&&[THAI_REAL_FACE_PREVIOUS_VERSION,THAI_REAL_FACE_VERSION].includes(fields.thaiRealFaceVersion);
export function thaiFinalOriginalIdentity(fields){
 if(!isThaiOutfitAi(fields)||fields.thaiRealFaceVersion!==THAI_REAL_FACE_VERSION)return '';
 return `\nTHAI PHOTOGRAPHIC IDENTITY AND COMPLETE FRAME — FINAL V2 CONTRACT:
The untouched original identity photograph is the ONLY face and eye authority; composition/mannequin and hairstyle boards supply ZERO new facial identity. Keep the exact real cheek and jaw volume, face width/height, chin, eye corners and eyelid apertures, iris/pupil size and position, gaze direction, expression in the eyes and existing catchlight pattern. No beauty-model face, smaller jaw, lifted eyes, enlarged iris, new eye shine, added light spots, eye whitening, lash curling/extension, brow reshaping or forced symmetry. Cosmetic colour and lighting must yield to the actual eyes and facial anatomy. Never use the hairstyle donor's face, head shape or eyes. Scale and move the whole portrait uniformly only; never squeeze a face to fit the garment or an ideal head/body ratio.
NO VISIBLE BUN ANYWHERE: A gathered design means hair swept flat against the actual skull with the collected ends completely invisible behind it. Do not add a ball, knot, coil, protruding rear bundle, high/top bun, side bun or low nape bun. Keep actual flat braid detail if selected; never turn a sleek gathered reference into a bun. Long and bob designs retain their actual lengths behind the outfit, without a newly tied bundle.
EDGE-TO-EDGE CLOTH AT THE BASE: Frame one continuous 3:4 portrait, with natural headroom and both shoulders intact. Continue the clothed torso and sleeves through the bottom edge and lower side corners. No floating torso, blue/transparent strip beneath a flat garment hem, small sticker centred on a large canvas, product-shot border or detached outfit. Set the camera distance and uniform placement to achieve this; do not stretch the neck, body or face. Keep this person's original anatomy and eyes even when another framing or beauty instruction conflicts. Complete this faithful photographic result inside this same original generation.`;
}
export function normalizeThaiRealFaceAppearance(prompt){
 // Only new Thai jobs: remove incompatible beauty-model eye/brow demands.
 return prompt
  .replaceAll('clean wrinkle-free cosmetic surface','realistic softly retouched skin surface')
  .replaceAll('elegantly lifted individual lashes','original natural lashes')
  .replaceAll('refined natural eyes','unaltered original eyes and expression')
  .replace(/Groom and softly fill both eyebrows[\s\S]*?(?=Give the lips a translucent)/g,'Preserve original eyebrow shape, arch, density, height and natural asymmetry, with at most light pigment inside the existing hairs. Keep original eyelids, lash direction, length and density, eye openings, iris/pupil colour and size, gaze, natural eye moisture and catchlights unchanged. Do not redraw, curl, extend, thicken or symmetrise lashes or eyes. ')
  .replace(/Check that both cosmetic brow shapes read[\s\S]*?adapted to existing natural features\./g,'Check that original brows, lashes and the expression in both eyes remain recognisably unchanged.')
  .replaceAll('matched soft-defined brow shapes and clean, curled individual lashes','original brow shapes and unaltered natural lashes');
}
export function applyThaiRealFacePolicy(prompt,fields){
 if(!usesThaiRealFace(fields))return prompt;
 return normalizeThaiRealFaceAppearance(prompt)+`\nTHAI REAL FACE — ORIGINAL EYES, EXPRESSION AND ANATOMY TAKE FINAL PRIORITY:
Use the original uploaded person's real facial anatomy and expression as immutable identity. Preserve the exact gaze direction, expression in the eyes, iris/pupil shapes, sizes and colours, eyelid margins and defining folds, natural eye aperture, eye spacing and original catchlight pattern. No replacement eyes, enlarged/brightened irises, invented catchlights, glossy doll eyes, coloured contacts, eye whitening, eye lifting, lash extension or forced left/right symmetry. Hair/outfit/makeup reference people supply ZERO facial identity or eye detail.
Preserve full cheeks, cheekbones, temples, jaw width and angles, chin shape, forehead, nose, lip contour and natural asymmetry. Never slim, squeeze, narrow, sculpt, sharpen, de-puff or V-line the face; never change face width-to-height ratio or reposition facial features. Position the whole head only with uniform scale and translation when fitting clothing. Never stretch its axes separately to meet a target ratio.
Keep realistic photographic pores, fine texture, gentle three-dimensional shading and age-defining anatomical folds. Selected Makeup may softly correct temporary blemishes and uneven colour and apply restrained pink-nude lip/cheek pigment within original contours, but cannot alter expression, eyes, facial volume or age. If a beauty, symmetry, wrinkle-removal or head-ratio instruction conflicts with this person's anatomy or gaze, preserve the original anatomy and gaze. No waxy/plastic skin, face mask, beauty-model substitution, pasted features, local face warp or extra AI request. Complete this faithful photographic result inside this same original generation.`;
}
