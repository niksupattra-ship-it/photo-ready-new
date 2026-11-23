import sharp from 'sharp';
import {parseThaiAdaptiveFace,thaiAdaptiveHeadProfile} from './thai-adaptive-proportion.js';
import {createEnglishBodyLayout} from './english-body-layout.js';
export async function createThaiAdaptiveComposition({outfit,identity,evidence,gender,uprightNeck=false}){
 if(!identity?.length)return null;
 const shape=parseThaiAdaptiveFace(evidence);if(!shape)return null;
 const {width,height}=await sharp(identity).metadata();const aspect=height/width;
 if(!Number.isFinite(aspect)||aspect<.95||aspect>2.5)return null;
 const measured=thaiAdaptiveHeadProfile(gender,shape,aspect);
 const widthRatio=Math.min(.33,Math.max(.28,measured.headWidthToShoulder*measured.identityHeadScale*.9),.58/(aspect+.12));
 const profile={...measured,...(uprightNeck?{chinToCollar:Math.min(.095,Math.max(.075,widthRatio*.28))}:{}),identityHeadScale:1,headWidthToShoulder:widthRatio,headHeightToShoulder:widthRatio*(aspect+.12)};
 return createEnglishBodyLayout(outfit,{identity,canvasWidth:1824,profile,headScale:1,stableGarmentFrame:true});
}
export const thaiAdaptiveCompositionInstruction=index=>`\nMEASURED COMPOSITION — IMAGE ${index}: This board uses THIS original person's face aspect and THIS selected garment's opaque shoulder/collar anchors. Match its whole-head size and chin placement relative to the garment. It is a composition reference only, never a second identity or replacement outfit. Preserve original facial anatomy with uniform scale, not face-axis distortion. Preserve all selected insignia, epaulettes, ribbons, collar/tie construction and their positions on the garment. Do not infer body weight from cheek fullness. Retain all earlier selected-hair and makeup rules. Generate one coherent photographic person in the SAME single request; never paste the board or run another repair call. This measured board controls the head-to-shoulder arrangement instead of a universal numeric face-width target.\n`;
