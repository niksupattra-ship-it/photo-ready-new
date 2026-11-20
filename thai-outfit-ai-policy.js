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
export const THAI_OUTFIT_APPEARANCE_VERSION='th-full-outfit-english-renderer-v6';
export const THAI_OUTFIT_APPEARANCE_OLD_NECK_V5='th-full-outfit-neckline-protected-v5';
export const THAI_OUTFIT_APPEARANCE_OLD_NECK_VERSION='th-full-outfit-shoulder-aware-neck-safe-v4';
export const THAI_OUTFIT_APPEARANCE_LEGACY_SHIELD_VERSION='th-full-outfit-native-front-hair-shield-v3';
export const THAI_OUTFIT_APPEARANCE_PREVIOUS='th-full-outfit-colour-rear-hair-v2';
// Old purchased v2 jobs must still be readable, but only new v3 jobs receive
// the native front-outfit occlusion pass. The English route never opts in.
export const isThaiOutfitAppearance=fields=>isThaiOutfitAi(fields)&&[THAI_OUTFIT_APPEARANCE_VERSION,THAI_OUTFIT_APPEARANCE_OLD_NECK_V5,THAI_OUTFIT_APPEARANCE_OLD_NECK_VERSION,THAI_OUTFIT_APPEARANCE_LEGACY_SHIELD_VERSION,THAI_OUTFIT_APPEARANCE_PREVIOUS].includes(fields?.thaiOutfitAppearanceVersion);
export const requiresThaiNativeFrontShield=fields=>isThaiOutfitAi(fields)&&[THAI_OUTFIT_APPEARANCE_OLD_NECK_V5,THAI_OUTFIT_APPEARANCE_OLD_NECK_VERSION,THAI_OUTFIT_APPEARANCE_LEGACY_SHIELD_VERSION].includes(fields?.thaiOutfitAppearanceVersion);
export const usesThaiShoulderAwareShield=fields=>isThaiOutfitAi(fields)&&[THAI_OUTFIT_APPEARANCE_OLD_NECK_V5,THAI_OUTFIT_APPEARANCE_OLD_NECK_VERSION].includes(fields?.thaiOutfitAppearanceVersion);
export const usesThaiNecklineProtectedShield=fields=>isThaiOutfitAi(fields)&&fields?.thaiOutfitAppearanceVersion===THAI_OUTFIT_APPEARANCE_OLD_NECK_V5;
export const usesThaiHistoricOutfitPrompt=fields=>isThaiOutfitAppearance(fields)&&fields?.thaiOutfitAppearanceVersion!==THAI_OUTFIT_APPEARANCE_VERSION;

export const usesThaiEnglishParityOutfit=fields=>isThaiOutfitAi(fields)&&fields?.thaiOutfitAppearanceVersion===THAI_OUTFIT_APPEARANCE_VERSION;
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
