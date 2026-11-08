export const NATURAL_STUDIO_SKIN_VERSION='natural-studio-skin-v5-ai-preparation-source-eyes';
export const NATURAL_STUDIO_SKIN_SPOT_VERSION='natural-studio-skin-v4-spot-repair-source-eyes';
export const needsNaturalAiPreparation=fields=>['studio-original-ai-v4','studio-original-ai-v5','studio-original-ai-v5-clear-gathered-v1'].includes(fields?.studioSkinVersion)&&fields?.portraitMode==='female'&&(fields.femaleEyeStyle||'natural')==='natural'&&(['studio-original-ai-v5','studio-original-ai-v5-clear-gathered-v1'].includes(fields.studioSkinVersion)||fields.naturalFinishVersion===NATURAL_STUDIO_SKIN_VERSION);
export const NATURAL_STUDIO_SKIN_PREVIOUS_VERSION='natural-studio-skin-v3-clear-skin-source-eyes';

export const NATURAL_STUDIO_SKIN_POLICY=`NATURAL PHOTO-STUDIO SKIN — SELECTIVE RETOUCH, ORIGINAL COMPLEXION:
For skin colour, texture and illumination only, this selected natural-mode policy replaces broader rosy-skin or cosmetic-skin wording. Keep the separately specified eyebrows, eyes and lips unchanged.
Assess Image 1 for this person's original complexion and undertone, exposure, unwanted lighting casts, temporary blemishes and existing fine texture. Produce clean, evenly toned photographic skin under one broad, softly diffused frontal studio key and gentle fill. Correct evidenced underexposure and lighting colour casts locally; a naturally dark complexion is not evidence of underexposure. Preserve authentic pigmentation and undertone, including naturally warm, cool or rosy skin. Already well-exposed, even skin needs little correction. Protect highlight detail with a soft roll-off; do not target a fixed white, fair or pink skin colour.
Retouch affected skin only. Repair temporary active acne, raised blemishes and clearly acne-related red/brown marks to the neighbouring healthy skin tone. Preserve stable moles, freckles, birthmarks, normal age lines and uncertain identifying marks. Balance patchy light and tone with small, smoothly blended local light/dark adjustments like restrained photographic dodge and burn. Reduce excessive cast-shadow darkness while retaining the broad three-dimensional shading of the nose, cheeks, jaw, under-chin and neck, real folds, nostril openings and mouth separation.
Soften only unusually harsh coarse-pore or rough-blemish contrast. Retain fine original pores, subtle photographic skin grain and natural local variation; clear skin receives no added smoothing. Keep face, ears and the entire retained neck continuous in complexion and illumination. Preserve crisp eyes, lashes, brows, lips and hair. No whitening. Do not add blush, pink tint, foundation coating, uniform blur, waxy skin, invented pore/noise patterns, painted highlights, halos or a pale concealer band. Preserve identity, facial and ear anatomy, selected hair, neckline/cutout and camera framing. Complete this skin treatment in the same existing generation.`;

export const NATURAL_STUDIO_LIGHT_POLICY=`COHERENT NATURAL FACE / NECK LIGHT — SAME GENERATION: Apply the natural photo-studio skin policy consistently to the face, both ears and reconstructed neck under one broad soft frontal key and gentle fill. Adapt local correction to the source illumination; preserve well-lit regions, highlight detail, authentic complexion and the gentle anatomical gradients that show the same face and neck shape. Blend excessive cast-shadow darkness and abrupt face/neck tone differences without flattening the nose, cheeks, jaw, chin or neck, changing geometry, or adding a separate bright patch. Preserve the separately specified brows, eyes and lips. Use no fixed brightness percentage, extra image request, pasted skin overlay or later whole-image colour/blur pass.`;

// Replace only the selected natural skin/light section; keep accepted features.
export function withNaturalStudioSkin(base){
 const start=base.indexOf('\nSKIN AND LIGHT — ADAPTIVE FRONTAL STUDIO ILLUMINATION:');
 const end=base.indexOf('\nLIPS — NATURAL KOREAN SOFT ROSE, SLIGHT HYDRATED GLOSS:',start);
 if(start<0||end<=start)throw Error('natural_studio_skin_policy_boundary_missing');
 return (base.slice(0,start+1)+NATURAL_STUDIO_SKIN_POLICY+base.slice(end)).replace('even healthy rosy skin','source-matched, evenly illuminated skin');
}

// Separate from cosmetic metadata: a natural skin revision never implies makeup.
export function naturalStudioSkinMetadata(master,head={}){
 const version=master?.idpromNaturalStudioSkinVersion||head.naturalStudioSkinVersion;
 return version===NATURAL_STUDIO_SKIN_VERSION?{naturalStudioSkinVersion:version}:{};
}
