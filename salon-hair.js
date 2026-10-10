import sharp from 'sharp';
import {hairRootTargetInstruction} from './hair-root-target.js';
// Three independent images, with a lossless format marker. Never an editor image.
export async function packSalonImages(base,scalp,hair){
 const {width:W,height:H}=await sharp(base).metadata();
 const panels=await Promise.all([base,scalp,hair].map(b=>sharp(b).resize(W,H,{fit:'fill'}).ensureAlpha().png().toBuffer()));
 const marker=Buffer.from([73,68,80,255,83,65,76,255,79,78,49,255]);
 return sharp({create:{width:W*3,height:H+1,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
 .composite([{input:marker,raw:{width:3,height:1,channels:4},left:0,top:0},...panels.map((input,i)=>({input,left:i*W,top:1}))]).png().toBuffer();
}
export function salonPrompt(raw){
 return `STYLE HAIR ON THIS PERSON'S OWN HEAD. Image 1 is the fixed hairless scalp and identity. Image 2 contains hairstyle inspiration ONLY: part, fringe, length, tied arrangement and strand direction. Invent new hair to fit image 1, as a stylist works on the customer's actual skull. Never copy the model's face, skull dimensions, forehead height or puffiness. Preserve framing, face landmarks, ears, neck and lighting. Use restrained natural volume hugging the scalp; no tall cap, raised crown, inflated sides or wig. Natural black/brown strands, realistic root direction and fine semi-transparent edges. ${hairRootTargetInstruction(raw)} Keep crown rise modest, normally no more than 22% of cheek-to-cheek face width; side envelope normally no wider than 112% of face width above the ears. The application will extract only hair, never your generated facial skin. Return a full photographic portrait on the same blue background, without annotations, outlines or guides.`;
}
export async function createSalonImages({base,scalp,hairReference,rootTarget,generate}){
 const bare=scalp||await generate([base],`Remove only ALL existing scalp hair, sideburns and long strands from image 1. Prepare a neutral hairless head base for trying hairstyles. Reconstruct the scalp, ears and any previously obscured surrounding blue background naturally. Preserve the exact face placement, eyes, eyebrows, nose, mouth, chin, visible facial skin and neck. Do not reshape the skull or elongate the forehead. Preserve framing and scale. This image is an intermediate base; do not beautify the face.`);
 const styled=await generate([bare,hairReference],salonPrompt(rootTarget));
 return packSalonImages(base,bare,styled);
}
