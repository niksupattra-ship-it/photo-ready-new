import {REFERENCE_SKIN_FINISH,REFERENCE_SKIN_PRIORITY} from './reference-skin-finish.js';

export const SHARED_PORTRAIT_SKIN_FINISH=REFERENCE_SKIN_FINISH;
export const SHARED_PORTRAIT_SKIN_PRIORITY=REFERENCE_SKIN_PRIORITY;
const NATURAL_COSMETICS=`Image 1 is the sole source of identity and underlying complexion. Keep the same person, age, facial anatomy, eye shape, expression, natural asymmetry, brow hairs, eyelashes, lip outline and stable marks. Do not add or redesign eyebrows, eyeliner, eyeshadow, lashes, blush, foundation or concealer. Preserve the source cosmetic appearance. The following lip tint is the sole added cosmetic exception: Keep the exact original lip shape and size; apply fresh translucent pink adapted to the natural lip colour with a small soft moist gloss, not opaque lipstick or exaggerated shine. Preserve fine lip texture. No slimming, stretching, symmetry correction, skin whitening or feature replacement.`;
export const NATURAL_SOFT_LIGHT_FINISH=[
 'NATURAL PHOTOGRAPHIC FINISH — SOURCE FEATURES WITH REQUESTED LIP TINT:',
 NATURAL_COSMETICS,
 SHARED_PORTRAIT_SKIN_FINISH
].join('\n');
export const NATURAL_SOFT_LIGHT_PRIORITY=SHARED_PORTRAIT_SKIN_PRIORITY+'\nNATURAL COSMETICS CHECK: Keep source brows, eyes and lashes without newly added makeup; retain the requested translucent pink lip tint and exact original lip shape.\n';
// Retained export for historical imports; no separate skin recipe.
export const SOFT_SKIN_TONAL_LIGHT=SHARED_PORTRAIT_SKIN_FINISH;
