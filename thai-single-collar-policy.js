import {isThaiOutfitAi} from './thai-outfit-ai-policy.js';
export const THAI_SINGLE_COLLAR_VERSION='thai-single-collar-v1';
export const usesThaiSingleCollar=fields=>isThaiOutfitAi(fields)&&fields.thaiSingleCollarVersion===THAI_SINGLE_COLLAR_VERSION;
export function thaiSingleCollarInstruction(outfitIndex){
 if(!Number.isInteger(outfitIndex)||outfitIndex<1)throw Error('missing_collar_outfit_reference');
 return `THAI SINGLE COLLAR — SELECTED GARMENT IS THE ONLY CLOTHING AUTHORITY:
Image ${outfitIndex} alone defines clothing at the neck. The original uploaded person supplies identity only: discard their original shirt, collar, lapels, tie and neckline completely. Hairstyle/beauty guide photographs supply hair or makeup only, never their shirts, collars or neck accessories. The composition guide supplies proportions only; do not reinterpret its surrogate neck boundary as a second cloth edge.
Construct ONE continuous neck and ONE coherent selected garment in this same original generation. Reproduce the exact inner shirt collar, outer jacket lapels and tie knot shown in Image ${outfitIndex}. An inner shirt and outer lapels are legitimate separate parts of that ONE outfit: keep them, but do not duplicate either part. No second collar inside or behind the selected collar, parallel ghost outline, folded duplicate lapel, old shirt remnant, collar-shaped skin band, repeated tie knot, pasted neck or extra seam where neck meets cloth. The skin ends cleanly inside the single selected neckline; jacket and shirt meet at the reference's actual seams, folds and occlusions.
Inspect both collar sides and the central tie knot before returning this same image. Resolve any duplicated clothing edge inside this generation while preserving original facial anatomy, skin finish, hairstyle, garment colour, insignia and proportions. Do not fix this by stretching the neck, painting a face mask, blurring details, hiding the collar or making another AI request.`;
}
