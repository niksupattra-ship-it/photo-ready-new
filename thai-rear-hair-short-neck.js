import {isThaiOutfitAi} from './thai-outfit-ai-policy.js';

// Only new Thai completed-outfit generations. No old photos, paid results,
// English flows, stored templates, face pixels or artwork are rewritten.
export const THAI_REAR_HAIR_SHORT_NECK_PREVIOUS_VERSION='thai-natural-neck-rear-hair-v1';
export const THAI_REAR_HAIR_SHORT_NECK_VERSION='thai-natural-neck-rear-hair-v2';
export const usesThaiRearHairShortNeck=fields=>isThaiOutfitAi(fields)&&
 [THAI_REAR_HAIR_SHORT_NECK_VERSION,THAI_REAR_HAIR_SHORT_NECK_PREVIOUS_VERSION].includes(fields?.thaiRearHairShortNeckVersion);

export function thaiRearHairShortNeckInstruction({gender='female',hairKind=null,version=THAI_REAR_HAIR_SHORT_NECK_VERSION}={}){
 const long=gender==='female'&&hairKind==='long';
 const originalRule=`
FINAL THAI FACE-TO-COLLAR AND OPAQUE OUTFIT GEOMETRY — HIGHEST PRIORITY:
Match the original real face exactly: preserve chin, jaw contour, cheek fullness, eyes, face aspect ratio and head scale. Do not stretch or narrow the head. Put the original chin at a natural short distance above the EXISTING inner shirt collar of the selected uniform. The skin neck from underside of the chin to the shirt collar must be proportionate to that exact face, with no artificial vertical extension, stalk, floating jaw, empty white neck column or low-floating collar. The collar and black tie knot remain at their correct selected-uniform positions; bring the head and its own short continuous anatomical neck into alignment instead of moving or elongating the garment. One neck, one shirt collar, one tie knot, no repeated inner shirt rim.
PHYSICAL LAYERING — FRONT CLOTH ALWAYS IN FRONT OF BACK HAIR:
The selected uniform's entire left and right epaulettes, jacket shoulder edges, lapels, chest, ribbons, emblems, sleeve fronts and shirt must be drawn as uninterrupted OPAQUE cloth. Hair must never cover or hide these surfaces. From the highest point of either shoulder downward, the frontal silhouette is cloth, never long dark vertical hair curtains. Preserve the exact selected hairstyle's crown, centre/side part, real hairline, colour and natural volume ABOVE the shoulders. ${long?'Long lengths continue naturally BEHIND BOTH shoulders and down the back, physically concealed by the fully opaque jacket; no side lengths hanging down the front chest, even if hairstyle or user-photo reference has front curtains. Do not shorten the long hairstyle into a bob.':hairKind===null?'If the current hairstyle is long, retain its full length BEHIND the shoulders; if short or gathered, retain its actual endpoint. Never force the current cut into a different length.':'For a short or gathered hairstyle keep its genuine endpoints and do not invent extra hair lengths. If any longer strands remain, route them behind the jacket instead of over its front.'}
LAST VISUAL CHECK OF THE SINGLE FINISHED PHOTO: both shoulder boards remain completely visible; both lapels and front chest are completely free of hair; the chin-to-collar neck is naturally short, not lengthened; face/head aspect and the ORIGINAL garment design have not been changed. Resolve these relationships during the SAME AI image creation. Never add a pasted garment panel, post-render cutout, face warp, masking repair or an extra AI generation.
`;
 if(version===THAI_REAR_HAIR_SHORT_NECK_PREVIOUS_VERSION)return originalRule;
 return originalRule+`
FINAL COLLAR MEASUREMENT CHECK V2: Measure visible FRONT neck from the underside of the chin to the TOP of the actual collar TOUCHING SKIN. Never measure to the lower tie knot, jacket V opening, pocket or button. A deep shirt opening must not produce an extra-long neck. For a high standing collar, leave only a modest natural front-neck gap above that collar.
Use roughly one fifth to one quarter of forehead-to-chin face height as a photographic check against an invented stretched neck, not as a universal anatomy target. Clearly visible natural individual neck length in the original frontal photo takes precedence. If the generated head floats too high, seat the ENTIRE head lower toward the fixed real collar with uniform placement. Preserve head width, head height, original face/eye geometry, chin and jaw shape; never squeeze the face or shorten its lower half. Keep shoulders, collar, epaulettes and garment dimensions fixed. No extra AI request, pasted head, skin patch, mask or post-render neck warp. Long hair remains behind the opaque garment.
`;
}
