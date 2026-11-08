// This version denotes one AI edit of the untouched uploaded photograph.
// Legacy staged requests keep their released preprocessing and local cosmetics.
export const ORIGINAL_PORTRAIT_AI_VERSION='studio-original-ai-v1';
const styles=new Set(['natural','makeup','korean-rosy-v1','soft-rosy-v1']);
export const isOriginalPortraitAiRequest=fields=>fields?.studioSkinVersion===ORIGINAL_PORTRAIT_AI_VERSION;
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
export function markOriginalPortraitAiFinish(blob,style='natural'){
 if(!styles.has(style))throw Error('ไม่พบรูปแบบเมคอัพที่เลือก');
 blob.idpromStudioSkinVersion=ORIGINAL_PORTRAIT_AI_VERSION;
 blob.idpromFemaleEyeStyle=style;
 delete blob.idpromStudioSkinBaseSource;
 if(style==='natural')delete blob.idpromStudioCosmeticsVersion;
 else blob.idpromStudioCosmeticsVersion=ORIGINAL_PORTRAIT_AI_VERSION+':'+style;
 return blob;
}
export function originalPortraitAiMetadata(master,head={}){
 const subject=master?.idpromStudioSkinVersion?master:head;
 if((subject?.idpromStudioSkinVersion||subject?.studioSkinVersion)!==ORIGINAL_PORTRAIT_AI_VERSION)return {};
 const cosmetic=subject.idpromStudioCosmeticsVersion||subject.studioCosmeticsVersion;
 return {studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,...([...styles].some(s=>s!=='natural'&&cosmetic===ORIGINAL_PORTRAIT_AI_VERSION+':'+s)?{studioCosmeticsVersion:cosmetic}:{})};
}
export const ORIGINAL_AI_TASK='FEMALE ID PORTRAIT FROM THE ORIGINAL UPLOAD: Image 1 is the untouched original photograph, not a prepared or retouched skin base. Produce one coherent photographic studio portrait of this same woman. Perform all requested lighting, colour correction, skin repair, detail refinement and selected cosmetics inside this one image edit. The uploaded person alone supplies identity, age structure, intrinsic facial proportions, expression and natural complexion. Fit the selected hairstyle and retain the established pose, head scale, ear/jaw anatomy and head/neck cutout requirements.';
export const ORIGINAL_AI_LIGHT='ORIGINAL-PHOTO STUDIO LIGHTING: Correct unwanted yellow, red or other ambient colour casts and deficient exposure according to this individual. Use a broad softly diffused frontal key and balanced fill to soften harsh source shadows continuously across the face, ears and neck. Preserve gentle anatomical gradients and natural complexion depth. Reduce excessive oily forehead, nose and cheek highlights to soft photographic satin. Keep healthy skin luminous without a flat matte-grey face, fixed whitening, opaque haze, erased facial volume or new glossy hot spots.';
export function originalAiSkinFinish(style='natural'){
 if(!styles.has(style))throw Error('ไม่พบรูปแบบเมคอัพที่เลือก');
 const skin='SKIN RETOUCH IN THIS AI EDIT: Repair active pimples, whiteheads, temporary acne redness/discolouration and unwanted skin wrinkle lines to the neighbouring healthy skin. Keep stable identifying moles/freckles, genuine feature pigment and the original eye openings, brow placement, nose, lip contour, cheeks, jaw/chin and asymmetry. Make skin colour continuous, including brow-head surroundings and mouth corners, with delicate realistic fine skin texture. Preserve broad facial shading and believable skin variation. Do not add artificial grain, repeated pore stamps, coarse dark pore dots, waxy/plastic skin or blurred eyes/hair. Keep supported photographic detail crisp without oversharpened pores or halos. This image has no pre-applied skin filters and receives no later pixel skin or makeup filter.';
 const cosmetics=style==='natural'
  ?'NATURAL OPTION: Finish the studio skin and lighting without adding lipstick, lip gloss, eyeshadow, eyeliner, cosmetic lashes, blush or a foundation mask. Preserve the original natural lip pigment, brow hairs and eyelid boundaries.'
  :`MAKEUP OPTION — COMPLETE HERE, IN THE SAME AI IMAGE: Add the established soft ${style==='soft-rosy-v1'?'peach-rose':'rose-pink'} lip tint, with a gentle gradient and restrained hydrated sheen, and sheer skin-balanced pink-nude upper lids. Keep subtle upper-lash definition, individually resolved natural brow hairs and a very light healthy rosy cheek tint. Preserve the real lip outline, eye size, eyelid shape and original brow positions. Keep the underlying skin exposure and dimensional lighting consistent with the Natural option; cosmetics must not create extra whitening, nose highlighter, grey skin or a new face. Adapt the same soft rosy palette to the original person's undertone.`;
 return skin+'\n'+cosmetics;
}
