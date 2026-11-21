export const THAI_OUTFIT_AI_VERSION='th-full-outfit-ai-v1';
export const isThaiOutfitAi=fields=>fields?.thaiOutfitAiVersion===THAI_OUTFIT_AI_VERSION;
export const isThaiOutfitPath=value=>typeof value==='string'&&/^\/assets\/(?:job|government|student|gown)-uniforms\/[A-Za-z0-9_-]+\.(?:png|webp)$/.test(value)&&!value.includes('-example');
// Internal rendering reuses the complete-portrait engine. Credit authorization
// continues to inspect the original request's language and Thai marker.
export function thaiOutfitGenerationFields(fields={}){
 if(fields.thaiOutfitAiVersion===undefined)return fields;
 if(!isThaiOutfitAi(fields)||!isThaiOutfitPath(fields.neckOutfitReferencePath))throw Error('ชุดสำหรับแก้ไขด้วย AI ไม่ถูกต้อง');
 return {...fields,interfaceLanguage:'en'};
}

 
// Thai-only quality revision. The underlying English rendering prompts, assets,
// entitlement rules and output path remain byte-for-byte unchanged.
// New Thai generations use the EXACT English full-outfit renderer: no post-AI
// native PNG replacement, no alpha clipping, no extra Thai prompt priority.
export const THAI_OUTFIT_APPEARANCE_PREVIOUS_V8='th-full-outfit-english-parity-v8';
// New Thai jobs only: a fixed garment-anchored head envelope. Existing v8 and
// all English generations keep their original references and pixels.
export const THAI_OUTFIT_APPEARANCE_PREVIOUS_V9='th-full-outfit-fixed-head-guide-v9';
// New Thai work only. Previously completed v9 and all English jobs are unchanged.
export const THAI_OUTFIT_APPEARANCE_PREVIOUS_V10='th-full-outfit-compact-identity-v10';
// Keep every finished V11 job on its original request contract.
export const THAI_OUTFIT_APPEARANCE_PREVIOUS_V11='th-full-outfit-adaptive-geometry-v11';
// New V12 jobs: preserve the original cheeks, jaw, chin and face dimensions.
export const THAI_OUTFIT_APPEARANCE_VERSION='th-full-outfit-face-shape-lock-v12';
export const usesThaiAdaptiveHead=fields=>isThaiOutfitAi(fields)&&
 [THAI_OUTFIT_APPEARANCE_VERSION,THAI_OUTFIT_APPEARANCE_PREVIOUS_V11].includes(fields?.thaiOutfitAppearanceVersion);
export const usesThaiFaceShapeLock=fields=>isThaiOutfitAi(fields)&&
 fields?.thaiOutfitAppearanceVersion===THAI_OUTFIT_APPEARANCE_VERSION;
export const thaiFaceShapeLockInstruction=()=>`
THAI FACE SHAPE LOCK V12 — HIGHEST-PRIORITY ORIGINAL FACE GEOMETRY:
Image 1's original uploaded person is the ONE immutable identity and facial-anatomy source. Keep the original natural fullness of BOTH cheeks, their outer contour and cheekbone breadth, the actual masseter/jaw breadth and angle, the soft jawline, real chin shape and width, temple width and natural left/right asymmetry. A naturally broad, full, or round face MUST REMAIN equally broad, full, or round after processing.
NEVER slim, narrow, sculpt, snatch, de-puff, pinch, taper or sharpen cheeks, jaw, chin or face. NEVER use V-line beauty filters, facial fat removal, smaller chin, lifted/hollowed cheeks or a thinner lower face. Do not reduce facial width compared with its eye spacing or lengthen the mouth-to-chin/eye-to-chin distances.
Preserve the exact face width-to-height ratio, cheek-to-jaw-width ratio, eye/nose/mouth spacing, original forehead/temple shape and non-symmetrical facial identity. No independent horizontal squeeze or vertical stretch, no non-uniform scale, liquify, warp, perspective slimming or feature relocation. Makeup/Natural may modify colour, light and superficial blemishes only; they must not change anatomical volume or the face silhouette.
Treat the chosen garment and required camera framing as separate from face geometry. Move and scale the ENTIRE head uniformly to fit the garment and collar, without stretching, squashing or re-synthesizing the intrinsic face; never manipulate the face to meet an ideal face-to-shoulder ratio. If any other body/head-size target conflicts, preserve the person's original facial proportions first.
Produce this exact real face, not a beautified/thinner version. No extra AI request, face swap, pasted features or secondary retouch.
`;
export const thaiOutfitCalibratedProfile=(gender,version=THAI_OUTFIT_APPEARANCE_VERSION)=>Object.freeze(
 version===THAI_OUTFIT_APPEARANCE_PREVIOUS_V9
 ?(gender==='male'
  ?{identityHeadScale:.89,headWidthToShoulder:.35,headHeightToShoulder:.55,chinToCollar:.020,neckToShoulder:.255,chestToShoulder:.46}
  :{identityHeadScale:.92,headWidthToShoulder:.39,headHeightToShoulder:.56,chinToCollar:.020,neckToShoulder:.255,chestToShoulder:.46})
 :(gender==='male'
  ?{identityHeadScale:.84,headWidthToShoulder:.32,headHeightToShoulder:.51,chinToCollar:.018,neckToShoulder:.245,chestToShoulder:.46}
  :{identityHeadScale:.86,headWidthToShoulder:.34,headHeightToShoulder:.52,chinToCollar:.018,neckToShoulder:.245,chestToShoulder:.46})
);
export const usesThaiCalibratedHead=fields=>isThaiOutfitAi(fields)&&[THAI_OUTFIT_APPEARANCE_PREVIOUS_V10,THAI_OUTFIT_APPEARANCE_PREVIOUS_V9].includes(fields?.thaiOutfitAppearanceVersion);
export const usesThaiIdentityLockedHead=fields=>isThaiOutfitAi(fields)&&[THAI_OUTFIT_APPEARANCE_VERSION,THAI_OUTFIT_APPEARANCE_PREVIOUS_V11,THAI_OUTFIT_APPEARANCE_PREVIOUS_V10].includes(fields?.thaiOutfitAppearanceVersion);
const thaiV9HeadInstruction=gender=>`
THAI FIXED-CAMERA PORTRAIT V9 — FINAL HEAD / SHOULDER GEOMETRY AUTHORITY:
Image 1 already shows this customer's real face uniformly fitted inside a FIXED head envelope anchored to the selected garment. Its overall head size, cheek width and crown-to-chin height are controlled by the same fixed outfit shoulder span, regardless of whether the original upload was a close selfie, full-body picture, narrow portrait, or wide crop. Use the chosen original face ONLY for identity, feature proportions and expression, never to infer output zoom, body size, skull size or camera distance.
The fitted natural head should be approximately ${gender==='male'?'31–34':'34–36'}% of the fully clothed shoulder span in width. This is a HEAD envelope; natural individual face width may be smaller. Keep hair attached to this normal-size skull. Preserve each person's individual face width-to-height ratio and internal anatomy. Never widen a narrow face, shorten a long face, stretch, distort, or slim the face to force numeric equality.
The selected outfit template is the fixed physical anchor: preserve both shoulder endpoints, shoulder angle, collar, tie, epaulettes, entire garment width and torso length. Fit head and a short naturally widening neck DOWN to the existing upper collar, not the V opening or button. There must be exactly one jaw-to-neck transition, no narrow stalk and no repeated shirt or collar. Keep camera distance and framing fixed relative to the suit, with modest headroom and full shoulder span.
Never imitate the input photo's camera crop, head zoom, perspective or torso proportions; never enlarge only the head, shrink the outfit, or squeeze the entire image. Render the proportional face, hair, neck and garment as one continuous photorealistic result during THIS original AI request, without extra layers or subsequent face warp. Older English female v2 targets such as 38–40% do not apply to this Thai v9 reference.
`;
export const thaiCalibratedHeadInstruction=(gender,version=THAI_OUTFIT_APPEARANCE_PREVIOUS_V10)=>
 version===THAI_OUTFIT_APPEARANCE_PREVIOUS_V9
 ?thaiV9HeadInstruction(gender)
 :`
THAI COMPACT PROPORTION V10 — GARMENT DEFINES CAMERA SCALE:
Image 1 contains the real uploaded face fitted with ONE UNIFORM SCALE into the garment-anchored head envelope. The original selfie crop, source camera zoom and original shoulders do not control the resulting head size. The entire head including hair should be smaller relative to the UNCHANGED suit shoulder span than the previous v9 result. The guide aims at about ${gender==='male'?'27–30':'29–32'}% whole-head-to-complete-shoulder width. This is an overall head and hairstyle envelope, never a mandate to squeeze or reshape a face. Natural individual face widths may differ.
Keep the outfit's BOTH shoulder ends, jacket width, collar, epaulettes, insignia, tie, buttons and lower boundary unchanged. Do not enlarge or narrow the garment to cheat the ratio. Fit the original chin above the upper shirt collar with a short gently widening natural neck, not a long thin stalk or double collar. Fit the selected hairstyle to the skull without puffing up the head. Preserve each person's facial width-to-height ratio and feature spacing inside the smaller head. Render hair, head, ears, neck and clothes as ONE realistic image with no pasted head, garment overlay, post-AI warp or extra generation.
V10 guide is the final head-to-outfit size authority. Older English female v2 or Thai v9 larger-head numeric targets do not apply to this job.
`;
export const thaiIdentityLockInstruction=()=>`
THAI IDENTITY LOCK — ORIGINAL PERSON IN IMAGE 1 IS THE ONLY FACIAL IDENTITY SOURCE:
Keep exactly the original person's individual eye shape, size and spacing, eyelid folds, eyebrow structure, nose bridge and nostril width, lips and mouth contour, nose-to-mouth distance, cheeks, jaw angle, chin, ears, natural asymmetry, apparent age, expression and recognisable identity. NEVER enlarge eyes, narrow nose, reduce cheeks, slim jaw, reshape mouth or lips, sharpen chin, make the face generically prettier, younger or artificially symmetrical. Never copy the person in any hair sample or outfit reference.
The selected hairstyle controls HAIR ONLY, never the facial anatomy. Natural and Makeup may alter approved surface cosmetics, skin texture and lighting but not facial geometry; keep distinctive original anatomy through retouching. The WHOLE HEAD is fit using uniform scale while all internal feature proportions stay constant. Do not paste the face as a flat image onto the generated neck, produce seams, or generate a different person.
`;
export const THAI_OUTFIT_APPEARANCE_SINGLE_AI_V7='th-full-outfit-single-ai-v7';
export const THAI_OUTFIT_APPEARANCE_OLD_ENGLISH_RENDERER_V6='th-full-outfit-english-renderer-v6';
// Only NEW Thai full-outfit jobs bypass the old precomposited face/neck/PNG
// guide. Historical jobs retain their original prompt and replay semantics.
export const usesThaiSingleAiOutfit=fields=>isThaiOutfitAi(fields)&&fields?.thaiOutfitAppearanceVersion===THAI_OUTFIT_APPEARANCE_SINGLE_AI_V7;
export const THAI_OUTFIT_APPEARANCE_OLD_NECK_V5='th-full-outfit-neckline-protected-v5';
export const THAI_OUTFIT_APPEARANCE_OLD_NECK_VERSION='th-full-outfit-shoulder-aware-neck-safe-v4';
export const THAI_OUTFIT_APPEARANCE_LEGACY_SHIELD_VERSION='th-full-outfit-native-front-hair-shield-v3';
export const THAI_OUTFIT_APPEARANCE_PREVIOUS='th-full-outfit-colour-rear-hair-v2';
// Old purchased v2 jobs must still be readable, but only new v3 jobs receive
// the native front-outfit occlusion pass. The English route never opts in.
export const isThaiOutfitAppearance=fields=>isThaiOutfitAi(fields)&&[THAI_OUTFIT_APPEARANCE_VERSION,THAI_OUTFIT_APPEARANCE_PREVIOUS_V11,THAI_OUTFIT_APPEARANCE_PREVIOUS_V10,THAI_OUTFIT_APPEARANCE_PREVIOUS_V9,THAI_OUTFIT_APPEARANCE_PREVIOUS_V8,THAI_OUTFIT_APPEARANCE_SINGLE_AI_V7,THAI_OUTFIT_APPEARANCE_OLD_ENGLISH_RENDERER_V6,THAI_OUTFIT_APPEARANCE_OLD_NECK_V5,THAI_OUTFIT_APPEARANCE_OLD_NECK_VERSION,THAI_OUTFIT_APPEARANCE_LEGACY_SHIELD_VERSION,THAI_OUTFIT_APPEARANCE_PREVIOUS].includes(fields?.thaiOutfitAppearanceVersion);
export const requiresThaiNativeFrontShield=fields=>isThaiOutfitAi(fields)&&[THAI_OUTFIT_APPEARANCE_OLD_NECK_V5,THAI_OUTFIT_APPEARANCE_OLD_NECK_VERSION,THAI_OUTFIT_APPEARANCE_LEGACY_SHIELD_VERSION].includes(fields?.thaiOutfitAppearanceVersion);
export const usesThaiShoulderAwareShield=fields=>isThaiOutfitAi(fields)&&[THAI_OUTFIT_APPEARANCE_OLD_NECK_V5,THAI_OUTFIT_APPEARANCE_OLD_NECK_VERSION].includes(fields?.thaiOutfitAppearanceVersion);
export const usesThaiNecklineProtectedShield=fields=>isThaiOutfitAi(fields)&&fields?.thaiOutfitAppearanceVersion===THAI_OUTFIT_APPEARANCE_OLD_NECK_V5;
export const usesThaiHistoricOutfitPrompt=fields=>isThaiOutfitAppearance(fields)&&![THAI_OUTFIT_APPEARANCE_VERSION,THAI_OUTFIT_APPEARANCE_PREVIOUS_V11,THAI_OUTFIT_APPEARANCE_PREVIOUS_V10,THAI_OUTFIT_APPEARANCE_PREVIOUS_V9,THAI_OUTFIT_APPEARANCE_PREVIOUS_V8,THAI_OUTFIT_APPEARANCE_SINGLE_AI_V7,THAI_OUTFIT_APPEARANCE_OLD_ENGLISH_RENDERER_V6].includes(fields?.thaiOutfitAppearanceVersion);

export const usesThaiEnglishParityOutfit=fields=>isThaiOutfitAi(fields)&&[THAI_OUTFIT_APPEARANCE_SINGLE_AI_V7,THAI_OUTFIT_APPEARANCE_OLD_ENGLISH_RENDERER_V6].includes(fields?.thaiOutfitAppearanceVersion);
// Same renderer, native visual references, matting and output as English.
// This narrow hair instruction changes only the physical placement of long
// hair relative to the selected opaque clothes during the ONE AI generation.
export const thaiEnglishParityRearHairInstruction=()=>`
REAR HAIR AND NATIVE OUTFIT VISIBILITY: Keep the actual selected hairstyle intact above the shoulders, including the original chosen part, fringe, braid, volume and connected length. If it is long, route every continuation BEHIND BOTH shoulders and behind the suit; no hair crosses, rests on, or protrudes across either epaulette, lapel, collar, shirt, button, sleeve, arm or front jacket panel. Keep the complete left and right shoulder board/insignia visually unobstructed. Do not crop the hair horizontally or shorten it; let any long lengths descend NATURALLY behind the solid outfit, becoming hidden by its opaque cloth. Resolve hair placement within the original single complete AI render; the final image receives NO outfit replacement layer, clipping mask, hair eraser or neck retouch. Preserve the natural chin-to-neck and neck-to-collar join from the English full-outfit guide. Copy the selected outfit's native colour, fabric, epaulettes and collar exactly.
`;

export function thaiOutfitAppearanceInstruction({outfitIndex,detailIndex}={}){
 if(!Number.isInteger(outfitIndex)||outfitIndex<1||!Number.isInteger(detailIndex)||detailIndex<=outfitIndex)throw Error('Missing original garment reference for Thai colour protection');
 return `
THAI FULL-OUTFIT FINAL REFERENCE PRIORITY — COLOUR, LIGHT AND REAR-PLACED HAIR:
The exact selected native suit PNG in Image ${outfitIndex}, the outfit already fixed in the Image 1 composition, and its two garment closeups in Image ${detailIndex} are the sole clothing authorities. Preserve the selected asset's own exact lightness, hue, saturation, pink/ivory/navy undertones, white balance, pattern, trim, metallic buttons and fabric weave. Copy the actual reference cloth colour rather than interpreting the garment as a darker, greyer, redder, more saturated or differently lit alternative. Do NOT turn a light pastel-pink tweed into dusty rose or dark magenta; conversely do not brighten intentionally dark fabric. Do not let pink lipstick/blush, skin retouch, blue background, the source person's old clothing, or hair photographs tint the jacket. Do NOT apply exposure, contrast, warmth or colour changes to ANY garment pixels. Face, ears, jaw and neck adapt to the existing softly lit garment; do not darken the whole photograph when changing hair.
FRONT-FACING PORTRAIT, HAIR BEHIND THE OUTFIT — HARD VISIBILITY CONSTRAINT:
Preserve the actual selected hairstyle's centre/side part, roots, fringe, crown, volume, texture, colour and genuine length. For a LONG hairstyle, route both continuous side lengths smoothly BEHIND the corresponding ears, neck and SHOULDERS so they descend invisibly behind the jacket. The hair may remain visible around the scalp, cheeks and outside the neck ABOVE the shoulder line but MUST NOT be painted in front of any outfit fabric. From each shoulder top to the bottom image boundary, both jacket front panels, shoulders, lapels, collar, blouse/inner shirt, buttons, seams, pockets, trim and insignia stay FULLY VISIBLE and never covered by black/dark hair. No front-hanging left or right curtain, tress, ponytail, dark vertical band or loose tips over the jacket, chest or arms. The absence of forward hair does NOT authorize shortening a selected long hairstyle into a bob: let its true length continue physically behind the torso, hidden by the opaque garment. For short/bob/gathered hair retain the exact intentional cut and endpoints, removing only strands spilling onto the clothing. This placement requirement overrides forward-draped locks in a selected reference photograph, while keeping the genuine selected design at the head.
CRITICAL NECKLINE: Form one naturally proportioned neck joining the chin to the shirt collar. The collar must meet the base of the neck cleanly on both sides; no exaggerated long neck, floating collar, triangular dark shape above the tie, blue/cyan cutout seam, synthetic skin wedge or partial replacement around the tie knot. Preserve the genuine source face and skin, and the actual tie/collar geometry of the selected uniform. \nFINAL COMBINED-IMAGE AUDIT: Compare all visible garment colour/detail against its unchanged original PNG, check even front-facing studio exposure and authentic skin lighting, and inspect BOTH shoulders, entire jacket front and inner shirt for any hair overlap. Correct garment recolouring and forward-draped hair inside this SAME single AI generation. Preserve this person's facial identity, expression, proportions, hairstyle design and the selected original outfit. Do not add a second provider request, a face mask, a second compositing pass, text or a new background.
`;
}
