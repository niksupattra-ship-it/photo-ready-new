import sharp from 'sharp';
import {requestReviewSeedream,REVIEW_SEEDREAM_MODEL} from './seedream-review-transport.js';

// Isolated second pass. Keep the completed V6 image, not the guide, as the only reference.
export const LAB_FLASH_MODEL=REVIEW_SEEDREAM_MODEL;
export const LAB_FLASH_PROMPT=`Edit the provided finished photograph in place. Preserve facial identity, natural skin tone, identifying marks, expression, facial features, head size, neck length, shoulders, hairstyle, garment, insignia, background, composition and framing. No zoom, crop, reconstruction or reshaping.

Achieve a retouched, professional-photograph-quality complexion—bright, radiant, and featuring a soft, rosy, Korean-style makeup look.

Brightness refers only to photographic illumination and exposure, not lighter skin pigmentation. Treat rosy makeup as a subtle cosmetic colour accent, not a change of complexion. Keep natural skin texture and permanent identifying marks. No whitening or beauty filter. Preserve all other photographic details. Return one PNG with the same canvas size and aspect ratio.`;

export async function finishFemaleLabWithFlash(png,{key,fetchImpl,timeoutMs}){
 const before=await sharp(png).metadata();
 const {png:edited}=await requestReviewSeedream({key,portrait:png,prompt:LAB_FLASH_PROMPT,singleAttempt:true},{fetchImpl,timeoutMs});
 const after=await sharp(edited).metadata();
 if(after.format!=='png'||before.width!==after.width||before.height!==after.height)throw Error('Flash canvas changed');
 // Decode fully before accepting. A corrupt response must not replace the V6 result.
 await sharp(edited).stats();
 return edited;
}
