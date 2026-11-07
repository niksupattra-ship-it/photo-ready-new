import {SHARED_PORTRAIT_SKIN_FINISH,SHARED_PORTRAIT_SKIN_PRIORITY} from './natural-soft-light-finish.js';
// Independent opt-in policy. Never append the legacy makeup policy to this look.
export const KOREAN_ROSY_FINISH=`KOREAN ROSY V1 — CLEAR TRANSLUCENT PINK STUDIO MAKEUP:
Use Image 1, the original uploaded photo, as the sole identity and base-complexion source. Fit the selected hairstyle from its reference without borrowing that model's face, head shape or complexion. Preserve the person's recognisable identity, age, facial width/height, jaw, chin, cheek volume, eyes, nose, mouth, expression, stable marks and natural asymmetry. No slimming, stretching, eye enlargement, symmetry filter or facial reshaping.
Brighten and even facial AND neck skin together with a delicate translucent healthy rosy undertone adapted to this person's original complexion. Correct underexposure and colour casts with soft photographic studio light while preserving natural skin depth, pores and dimensional shading. Darker skin must remain naturally darker; no bleaching, opaque white foundation, flat pink mask, plastic blur or invented texture. Blend the face, jaw and neck seamlessly without a pale face or mismatched neck. Use the selected outfit reference, when supplied, only to harmonize exposure, white balance and light direction with its fabric and illumination; never copy its model or generate the outfit.
Create restrained Korean makeup: softly groomed natural brows in their original positions, sheer skin-like upper eyelid tone and moderately lifted fine separated Korean lashes, proportionate to the original eyes. No heavy false-lash strip, dense clusters, dramatic extensions, eyeliner wing, glitter or altered eyelid folds. Keep lower-eye skin naturally neutral with gentle anatomical shading.
Keep the exact original lip shape and size; apply fresh translucent pink adapted to the natural lip colour with a small soft moist gloss, not opaque lipstick or exaggerated shine. Preserve fine lip texture. Complete skin, neck, lashes, lips and lighting in this single generation, without extra AI passes or inheriting a previous generated makeup image. Preserve all hairstyle, anatomical neck, framing, garment-removal and transparent-cutout requirements.`;

// Keep the original cosmetic wording above as the stable source for old work.
// The current visible makeup choice uses the SAME skin/light recipe as natural.
export const KOREAN_ROSY_ORIGINAL_COSMETICS=KOREAN_ROSY_FINISH.slice(KOREAN_ROSY_FINISH.indexOf('Create restrained Korean makeup:'));
// Current visible makeup only; historical/hidden styles retain their recipe.
export const KOREAN_ROSY_CURRENT_COSMETICS=KOREAN_ROSY_ORIGINAL_COSMETICS
 .replace('moderately lifted fine separated Korean lashes, proportionate to the original eyes.','more visibly defined, slightly longer and fuller lifted Korean lashes, individually separated and proportionate to the original eyes. Add a fine dark-brown/soft-black eyeliner tightly along the upper lash line to define the eyes visibly, following the existing eye contour without enlarging the eyes or changing eyelid folds.')
 .replace('apply fresh translucent pink adapted to the natural lip colour with a small soft moist gloss','apply a richer, clearly visible rosy-red pink lip tint, redder and more saturated than the previous sheer pink while adapted to the natural lip colour, with a small soft moist gloss');
export const KOREAN_ROSY_SHARED_SKIN_FINISH=[
 'KOREAN ROSY V1 — SHARED NATURAL SKIN WITH DEFINED KOREAN MAKEUP:',
 KOREAN_ROSY_FINISH.split('\n')[1],
 SHARED_PORTRAIT_SKIN_FINISH,
 KOREAN_ROSY_CURRENT_COSMETICS
].join('\n');
export const KOREAN_ROSY_SKIN_PRIORITY=SHARED_PORTRAIT_SKIN_PRIORITY+'\nMAKEUP CHECK: Keep the original brow and upper-eyelid tone recipe; apply the requested more defined separated Korean lashes, thin upper-lash-line eyeliner and richer rosy-red pink lips specified above, on top of the shared skin/light finish. Do not retain unmade-up brows/eyes/lashes under a no-makeup rule. Do not change skin softness, wrinkle retouch, diffuse lighting, original facial proportions, selected hairstyle, neck coverage or cutout. Complete in the SAME single generation.\n';
