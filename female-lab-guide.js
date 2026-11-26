import {createEnglishBodyLayout} from './english-body-layout.js';
import sharp from 'sharp';

export const FEMALE_GUIDE_INSTRUCTION=`IMAGE 4 — REQUIRED SPATIAL GUIDE, NOT AN IDENTITY: The grey oval marks the entire skull INCLUDING its close-fitting hair, from crown to chin, at 41.5% of the measured garment shoulder span. Match this oval's width, height, centre and chin-to-collar position. Its upright centreline overrides the source camera angle, crop, selfie perspective and apparent head size in Image 1. Preserve the person's intrinsic facial proportions while generating a front-facing head in this envelope. Long rear hair may extend below the oval as specified by Image 3. Image 2 remains the authority for garment details; Image 4 shows only the target arrangement. Never copy the grey mannequin, background colour or guide marks into the output. Never move the garment, collar or insignia to accommodate the source photograph. Generate the entire portrait coherently in the SAME single call.`;

export async function createFemaleLabGuide(outfit){
 const meta=await sharp(outfit,{limitInputPixels:33554432}).metadata();
 if(!['png','jpeg','webp'].includes(meta.format))throw Error('Unsupported outfit');
 return createEnglishBodyLayout(outfit,{
  headScale:1,canvasWidth:768,fixedIdentityEnvelope:true,stableGarmentFrame:true,
  profile:{headWidthToShoulder:.415,headHeightToShoulder:.56,chinToCollar:.045,neckToShoulder:.22,chestToShoulder:.40}
 });
}
