export const THAI_FEMALE_HEAD_SIZE_VERSION='thai-frontal-head-neck-v6';
export const THAI_FEMALE_HEAD_SCALE=.90;
export const usesThaiFemaleSmallerHead=(fields,gender)=>gender==='female'&&fields?.thaiOutfitAiVersion==='th-full-outfit-ai-v1'&&[THAI_FEMALE_HEAD_SIZE_VERSION,'thai-english-makeup-garment-neck-v5','thai-english-makeup-new-neck-v4','thai-english-makeup-head-v3','thai-pr143-female-head-90-full-body-v2','thai-pr143-female-head-90-v1'].includes(fields?.thaiFemaleHeadSizeVersion);
export const THAI_FEMALE_HEAD_SIZE_INSTRUCTION=`ONE AUTHORITATIVE HEAD / SHOULDER PROPORTION — PR143 FEMALE HEAD ONLY:
Use the measured composition board as the head-size authority. It already reduces the entire skull, face, ears and attached hair to 90% of PR143's head width and height with one uniform scale. Do not apply another 10% reduction or enlarge the head back to an older numeric ratio. Preserve intrinsic facial width-to-height ratio, original eyes, identity, expression, actual cheeks and jaw, and selected hairstyle geometry.
Keep the selected garment, complete shoulder span, torso width/height, collar, neck base, buttons and insignia at the EXACT original PR143 board scale and position. Do not resize the body, narrow shoulders, zoom the entire portrait or move the garment to simulate a smaller head. Keep the established chin/collar anchor and join the uniformly smaller head continuously to its natural supporting neck, without a pasted face, stretched neck or floating head. Complete the selected skin/Makeup finish and hair in the same single generation. Fill the delivered frame with the unchanged garment: the lower coat continues through the bottom edge and both lower sides, without empty margins around the torso. Keep the camera framing and garment size fixed while constructing the smaller head. The new board head dimensions supersede older universal face/whole-head ratios only; every garment and identity requirement remains binding.`;
// Compare a new 90%-head portrait against PR143's virtual old head envelope.
// This keeps PR143's whole-person placement from zooming the suit up merely
// because its head-size cap has more room. No image pixels are modified.
export function pr143ReferenceHead(head,scale=1){
 if(!head||scale===1||!Number.isFinite(scale)||scale<=0||scale>1||![head.top,head.width,head.height].every(Number.isFinite))return head;
 const height=head.height/scale,anchor=head.top+head.height;
 return {...head,top:anchor-height,width:head.width/scale,height};
}

export const usesThaiEnglishMakeupHead=(fields,gender)=>gender==='female'&&fields?.thaiOutfitAiVersion==='th-full-outfit-ai-v1'&&[THAI_FEMALE_HEAD_SIZE_VERSION,'thai-english-makeup-garment-neck-v5','thai-english-makeup-new-neck-v4','thai-english-makeup-head-v3'].includes(fields?.thaiFemaleHeadSizeVersion)&&fields?.femaleEyeStyle==='makeup';

export const THAI_NEW_NECK_GAP=.18;
export const usesThaiNewNeck=(fields,gender)=>usesThaiEnglishMakeupHead(fields,gender)&&[THAI_FEMALE_HEAD_SIZE_VERSION,'thai-english-makeup-garment-neck-v5','thai-english-makeup-new-neck-v4'].includes(fields.thaiFemaleHeadSizeVersion);
export function applyThaiNewNeck(prompt){
 return prompt.replace(/\b(?:naturally )?short (?:supporting |naturally widening )?neck\b/gi,'proportionate upright neck')+`
NEW NECK CONSTRUCTION — USE THE GARMENT-ANCHORED IMAGE 1, NOT THE SOURCE NECK:
Generate a new, upright, anatomically continuous adult neck. The uploaded neck length, thickness, folds, tilt and posture have NO authority: original-person locks apply to facial anatomy and eyes, not the neck. Preserve the established face/head size, facial aspect, eyes, identity, makeup, selected hairstyle and the fixed garment geometry. Never move the collar down, shrink the body or resize the head to create neck length.
Image 1 already raises the unchanged head above the fixed upper skin-touching collar and provides the new neck space. Follow that relationship, with a level jaw, centred neck axis and relaxed level shoulders. Build a gentle widening from beneath the jaw into the collar and shoulder roots, subtle sternocleidomastoid contours, natural under-chin shading and one clean skin-to-collar contact. Keep a visible, balanced front-neck gap, not a compressed chin resting on the collar, a stretched thin stalk or an exposed chest opening mistaken for neck. Individual jaw width and the selected collar construction determine the contour; do not force every person into identical neck thickness. Complete head, new neck and selected outfit together in this SAME generation; no pasted skin, neck warp, repair pass or additional AI call.`;
}

export const usesThaiGarmentNeck=(fields,gender)=>usesThaiEnglishMakeupHead(fields,gender)&&[THAI_FEMALE_HEAD_SIZE_VERSION,'thai-english-makeup-garment-neck-v5'].includes(fields.thaiFemaleHeadSizeVersion);
export function applyThaiGarmentNeck(prompt){
 return applyThaiNewNeck(prompt).replace('Image 1 already raises the unchanged head above the fixed upper skin-touching collar and provides the new neck space.','Image 1 already places the unchanged head using THIS garment’s measured upper collar and broad shoulder line. Its compact chin-to-collar gap is the final neck-height authority; do not lift the head or extend the exposed neck beyond the board. A standing/high collar, a folded shirt collar and an open neckline have different visible skin gaps. Do not copy the same neck height across garments or measure down to the tie knot or deep V opening.');
}

export const usesThaiFrontalPose=(fields,gender)=>usesThaiEnglishMakeupHead(fields,gender)&&fields.thaiFemaleHeadSizeVersion===THAI_FEMALE_HEAD_SIZE_VERSION;
export function applyThaiFrontalPose(prompt){
 return prompt+`
FRONTAL CAMERA AND HEAD-NECK POSTURE — FINAL POSE AUTHORITY:
Image 1 is a neutral FRONT-VIEW pose and fixed garment/head-envelope guide. It deliberately contains no pasted customer face. The separate identity image establishes WHO this person is, never the source camera angle, chin projection, head pitch/yaw/roll or neck posture. Reconstruct the SAME person facing the eye-level camera squarely: level eyes and relaxed level shoulders, nose/mid-lip/chin aligned on the vertical centre axis, no head tilt, no raised or jutting chin. Bring the chin gently back over the neck centre, not forward toward the camera; retain a relaxed jaw, not a forced double chin or artificially tucked neck. Use a natural portrait-lens perspective with camera centred at eye level, not a low-angle selfie or wide-angle perspective.
Generate the head, continuous upright neck and shoulders as one anatomical unit. The neck axis sits beneath the head rather than extending diagonally forward. Follow this garment's COMPACT chin-to-upper-collar gap in Image 1 exactly; do not lift the head or lengthen neck skin to expose more neck. Preserve the established overall head envelope, face identity, individual nose/lip/jaw anatomy, real eye shape and iris colour, chosen makeup/hair, neck width, fixed garment scale, collar and insignia. Source facial feature locks protect identity, not a copied 2D perspective or protruding-chin pose. Normal perspective changes required to become frontal are allowed; facial slimming, enlarged eyes and a different person are not. Render this new frontal posture in the same original single generation. No later face/neck warp, skin patch or second AI request.`;
}
