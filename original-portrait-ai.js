// This version denotes one AI edit of the untouched uploaded photograph.
// Legacy staged requests keep their released preprocessing and local cosmetics.
export const ORIGINAL_PORTRAIT_AI_VERSION='studio-original-ai-v2';
export const ORIGINAL_PORTRAIT_AI_PREVIOUS_VERSION='studio-original-ai-v1';
export const isOriginalPortraitAiVersion=version=>version===ORIGINAL_PORTRAIT_AI_VERSION||version===ORIGINAL_PORTRAIT_AI_PREVIOUS_VERSION;
const styles=new Set(['natural','makeup','korean-rosy-v1','soft-rosy-v1']);
export const isOriginalPortraitAiRequest=fields=>isOriginalPortraitAiVersion(fields?.studioSkinVersion);
export function validateOriginalPortraitAiFields(fields,gender){
 if(gender!=='female'||!styles.has(fields.femaleEyeStyle||'natural')||fields.studioSkinEvidence!==undefined&&fields.studioSkinEvidence!==null&&fields.studioSkinEvidence!=='')throw Object.assign(Error('ตัวเลือกประมวลผลจากต้นฉบับไม่ถูกต้อง กรุณารีเฟรชหน้าเว็บ'),{status:400,code:'original_portrait_ai_invalid'});
}
export function validateOriginalPortraitUpload(fields,image,original){
 if(!isOriginalPortraitAiRequest(fields))return;
 if(!original?.buffer?.length||!image?.buffer?.equals(original.buffer)||image.mimetype!==original.mimetype)throw Object.assign(Error('กรุณาใช้รูปต้นฉบับเดียวกันในการประมวลผล'),{status:400,code:'original_portrait_source_mismatch'});
}
export function hasOriginalPortraitAiFinish(subject,style='natural'){
 if(!styles.has(style)||(subject?.idpromStudioSkinVersion||subject?.studioSkinVersion)!==ORIGINAL_PORTRAIT_AI_VERSION)return false;
 const cosmetic=subject.idpromStudioCosmeticsVersion||subject.studioCosmeticsVersion;
 return style==='natural'?!cosmetic:cosmetic===ORIGINAL_PORTRAIT_AI_VERSION+':'+style;
}
export function markOriginalPortraitAiFinish(blob,style='natural',version=ORIGINAL_PORTRAIT_AI_VERSION){
 if(!styles.has(style))throw Error('ไม่พบรูปแบบเมคอัพที่เลือก');
 if(!isOriginalPortraitAiVersion(version))throw Object.assign(Error('ตัวเลือกประมวลผลจากต้นฉบับไม่ถูกต้อง กรุณารีเฟรชหน้าเว็บ'),{code:'original_portrait_ai_invalid'});
 blob.idpromStudioSkinVersion=version;
 blob.idpromFemaleEyeStyle=style;
 delete blob.idpromStudioSkinBaseSource;
 if(style==='natural')delete blob.idpromStudioCosmeticsVersion;
 else blob.idpromStudioCosmeticsVersion=version+':'+style;
 return blob;
}
export function originalPortraitAiMetadata(master,head={}){
 const subject=master?.idpromStudioSkinVersion?master:head;
 const version=subject?.idpromStudioSkinVersion||subject?.studioSkinVersion;
 if(!isOriginalPortraitAiVersion(version))return {};
 const cosmetic=subject.idpromStudioCosmeticsVersion||subject.studioCosmeticsVersion;
 return {studioSkinVersion:version,...([...styles].some(s=>s!=='natural'&&cosmetic===version+':'+s)?{studioCosmeticsVersion:cosmetic}:{})};
}
export const ORIGINAL_AI_TASK='FEMALE ID PORTRAIT FROM THE ORIGINAL UPLOAD: Image 1 is the untouched original photograph, not a prepared or retouched skin base. Produce one coherent photographic studio portrait of this same woman. Perform all requested lighting, colour correction, skin repair, detail refinement and selected cosmetics inside this one image edit. The uploaded person alone supplies identity, age structure, intrinsic facial proportions, expression and natural complexion. Fit the selected hairstyle and retain the established pose, head scale, ear/jaw anatomy and head/neck cutout requirements.';
export const ORIGINAL_AI_LIGHT='ORIGINAL-PHOTO STUDIO LIGHTING: Correct unwanted yellow, red or other ambient colour casts and deficient exposure according to this individual. Use a broad softly diffused frontal key and balanced fill to soften harsh source shadows continuously across the face, ears and neck. Preserve gentle anatomical gradients and natural complexion depth. Reduce excessive oily forehead, nose and cheek highlights to soft photographic satin. Keep healthy skin luminous without a flat matte-grey face, fixed whitening, opaque haze, erased facial volume or new glossy hot spots.';
export function originalAiSkinFinish(style='natural'){
 if(!styles.has(style))throw Error('ไม่พบรูปแบบเมคอัพที่เลือก');
 const skin='SKIN RETOUCH IN THIS AI EDIT: Repair active pimples, whiteheads, temporary acne redness/discolouration and unwanted skin wrinkle lines to the neighbouring healthy skin. Keep stable identifying moles/freckles, genuine feature pigment and the original eye openings, brow placement, nose, lip contour, cheeks, jaw/chin and asymmetry. Make skin colour continuous, including brow-head surroundings and mouth corners, with delicate realistic fine skin texture. Preserve broad facial shading and believable skin variation. Do not add artificial grain, repeated pore stamps, coarse dark pore dots, waxy/plastic skin or blurred eyes/hair. Keep supported photographic detail crisp without oversharpened pores or halos. This image has no pre-applied skin filters and receives no later pixel skin or makeup filter.';
 const cosmetics=style==='natural'
  ?`NATURAL OPTION: Finish the studio skin and lighting without adding lipstick, lip gloss, eyeshadow, eyeliner, cosmetic lashes, blush or a foundation mask. Preserve the original natural lip pigment, brow hairs and eyelid boundaries.
SOURCE EYES AND EXPRESSION: Keep the original eye shape, opening, upper/lower eyelid edges, inner/outer corners, spacing and individual left/right asymmetry. Preserve the source iris colour, diameter and texture, pupil size and position, gaze direction, corneal catchlights and natural eye moisture. Do not redirect the gaze, enlarge or round the eyes, whiten the sclera, add sparkle, replace the catchlights or redraw the eyes under the skin-lighting instruction. Any required whole-head pose correction moves the same eyes coherently without changing their original expression. Preserve source brow shape and individual hairs, existing lashes and original lip contour, colour and texture.
CLEAR SKIN, PRESERVED FEATURES: Remove visible active acne, acne-related red/brown marks, temporary blemishes and fine surface wrinkle lines across the forehead, between brows, around the eyes, cheeks and mouth. Repair each affected patch to neighbouring healthy skin colour and fine texture. Do not retain a pimple, acne mark or fine wrinkle groove under a generic source-detail or age-retention rule. The actual eyelid boundary, natural eyelid fold, eye opening, brow hairs, nostrils and lip contour are facial features, not unwanted skin wrinkles. Keep stable identifying moles/freckles and the same facial anatomy, age structure and expression. Blend repaired skin and soft light continuously across the face, ears and neck with subtle believable fine texture. No plastic or waxy mask, invented pores, whole-face blur or blurred eyebrows/eyes. Complete this within the existing single image edit; retain all selected hairstyle, neck, cutout and framing instructions.`
  :`MAKEUP OPTION — COMPLETE HERE, IN THE SAME AI IMAGE: Add the established soft ${style==='soft-rosy-v1'?'peach-rose':'rose-pink'} lip tint, with a gentle gradient and restrained hydrated sheen, and sheer skin-balanced pink-nude upper lids. Keep subtle upper-lash definition, individually resolved natural brow hairs and a very light healthy rosy cheek tint. Preserve the real lip outline, eye size, eyelid shape and original brow positions. Keep the underlying skin exposure and dimensional lighting consistent with the Natural option; cosmetics must not create extra whitening, nose highlighter, grey skin or a new face. Adapt the same soft rosy palette to the original person's undertone.`;
 return skin+'\n'+cosmetics;
}

// V2 changes target authority, never source pixels or the released V1 prompt.
export function originalAiTargetLightWording(prompt){
 return prompt
  .replaceAll('matching the original skin tone, texture and lighting.','matching the finished face’s corrected studio illumination, authentic underlying complexion and refined fine skin texture.')
  .replaceAll('makeup choice, skin finish, lighting, cutout and outfit placement remain protected.','makeup choice, chosen studio skin/light target, cutout and outfit placement remain protected.')
  .replaceAll('stable marks, complexion, lighting, chosen makeup/natural finish','stable marks, underlying pigmentation, chosen target studio lighting and selected makeup/natural finish');
}
export function originalAiSkinGuideInstruction(index,style='natural'){
 if(!Number.isInteger(index)||index<2||index>6||!styles.has(style))throw Error('Invalid skin/light reference position');
 return `\nORIGINAL-AI V2 IDENTITY-FREE SKIN / LIGHT TARGET — IMAGE ${index}, THE LAST IMAGE: This six-swatch photographic guide supplies only skin-material softness, fine texture, even colour transitions and broad diffused studio illumination. It contains no person and is not a source of facial features or a makeup palette. Its top row magnifies delicate skin texture; reproduce it only at normal portrait scale, without enlarged pore dots, copied spots, repeated stamps or added noise. Its lower row shows smooth broad lighting gradients, not isolated point highlights. Use the example nearest this uploaded person's genuine complexion depth as a material/light cue; never copy a swatch's RGB colour, whiten different people to one complexion or tint skin to match the board. Image 1 alone supplies identity, intrinsic facial geometry, age structure and natural pigmentation. Re-establish the target illumination across face, ears and reconstructed neck even when the original has strong directional light, underexposure or yellow/red casts. Apply the selected ${style==='natural'?'Natural finish without added cosmetics':'rosy makeup finish in this same AI generation'}; the guide must not suppress a requested makeup finish or change its established palette. Preserve the selected hairstyle, head scale, anatomy and existing neck/cutout boundaries. Return one photographic portrait asset, never a board, grid, collage, enlarged texture swatch or visible gutter.\n`;
}
export const ORIGINAL_AI_TARGET_PRIORITY='FINAL ORIGINAL-AI V2 SKIN / LIGHT AUTHORITY — AFTER ALL HAIR AND CUTOUT INSTRUCTIONS: The original photo locks the same person, intrinsic facial proportions, expression, age structure and natural pigmentation. Unwanted source underexposure, colour casts, directional cast shadows, oily highlights, acne and skin-surface wrinkles are not identity constraints. Replace those illumination and surface defects inside this one AI generation. Use one broad softly diffused frontal key slightly above eye level and balanced soft fill across the whole face, both ears and retained neck. Keep a gently luminous, clean and evenly coloured photographic skin surface with delicate fine texture, restrained forehead/nose/cheek shine and subtle natural facial volume. Keep brows, eyelid margins, eyes, nostrils and lips crisp; their edges must not leave pale, grey or yellow surrounding skin islands. Repair affected spots and surface lines to healthy neighbouring skin without preserving them as supposed identity detail. Match the reconstructed neck to the finished face’s corrected light, undertone and texture, never restore its original shadows or ambient cast. Preserve authentic complexion depth and broad anatomical gradients without fixed whitening, desaturated grey skin, a flat opaque matte face, plastic blur or new glossy hot spots. The guide controls material and lighting style only, never complexion RGB or anatomy. Complete the chosen Natural or makeup finish here; no later local skin or cosmetic filter is applied. These light/skin instructions override any source-light or source-texture retention wording while leaving every identity, hairstyle, pose, anatomical and cutout boundary unchanged.';
