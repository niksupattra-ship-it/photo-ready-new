import {isThaiOutfitAi} from './thai-outfit-ai-policy.js';
export const LEGACY_THAI_WHOLE_HEAD_GUIDE_VERSION='thai-crown-chin-shoulder-guide-v1';
export const PREVIOUS_THAI_WHOLE_HEAD_GUIDE_VERSION='thai-crown-chin-shoulder-guide-v2-female105';
export const CROP_INDEPENDENT_THAI_WHOLE_HEAD_GUIDE_VERSION='thai-crown-chin-shoulder-guide-v3-crop-independent';
export const LOWERED_THAI_WHOLE_HEAD_GUIDE_VERSION='thai-crown-chin-shoulder-guide-v4-female102-lower005';
export const THAI_WHOLE_HEAD_GUIDE_VERSION='thai-crown-chin-shoulder-guide-v5-female105';
export const usesLoweredWholeHead=version=>[LOWERED_THAI_WHOLE_HEAD_GUIDE_VERSION,THAI_WHOLE_HEAD_GUIDE_VERSION].includes(version);
export const usesCropIndependentWholeHead=version=>[CROP_INDEPENDENT_THAI_WHOLE_HEAD_GUIDE_VERSION,LOWERED_THAI_WHOLE_HEAD_GUIDE_VERSION,THAI_WHOLE_HEAD_GUIDE_VERSION].includes(version);
export const usesThaiWholeHeadGuide=fields=>isThaiOutfitAi(fields)&&fields?.portraitMode==='female'&&fields?.portraitComposition==='en-outfit-body-v1'&&[LEGACY_THAI_WHOLE_HEAD_GUIDE_VERSION,PREVIOUS_THAI_WHOLE_HEAD_GUIDE_VERSION,CROP_INDEPENDENT_THAI_WHOLE_HEAD_GUIDE_VERSION,LOWERED_THAI_WHOLE_HEAD_GUIDE_VERSION,THAI_WHOLE_HEAD_GUIDE_VERSION].includes(fields?.thaiWholeHeadGuideVersion);
export const THAI_WHOLE_HEAD_LIMITS=Object.freeze({width:.43*1.05,height:.58*1.05});
const legacyLimits=Object.freeze({width:.40,height:.54});
export const wholeHeadGuideLimits=version=>version===LEGACY_THAI_WHOLE_HEAD_GUIDE_VERSION?legacyLimits:version===THAI_WHOLE_HEAD_GUIDE_VERSION?THAI_WHOLE_HEAD_LIMITS:version===LOWERED_THAI_WHOLE_HEAD_GUIDE_VERSION?{width:.43,height:.58}:{width:.42,height:.567};
// Scan the selected transparent hair reference ABOVE the chin only. Long
// lengths below the chin describe hairstyle length, not skull/crown height.
export function measureHairCrown(pixels,width,height,hair){
 if(pixels?.length!==width*height*4||![hair?.faceWidth,hair?.faceHeight,hair?.centerX,hair?.chinY].every(Number.isFinite))return null;
 let left=width,right=-1,top=height;
 for(let y=0;y<Math.min(height,Math.ceil(hair.chinY));y++){
  let l=width,r=-1,count=0;for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>=128){l=Math.min(l,x);r=x;count++}
  if(count<Math.max(3,hair.faceWidth*.02))continue;
  left=Math.min(left,l);right=Math.max(right,r);top=Math.min(top,y);
 }
 if(right<left||top>=hair.chinY)return null;
 return {width:2*Math.max(hair.centerX-left,right+1-hair.centerX),height:hair.chinY-top,faceWidth:hair.faceWidth,faceHeight:hair.faceHeight};
}
export function fitWholeHeadGuide({faceWidth,faceHeight,shoulderWidth,hair=null,version=THAI_WHOLE_HEAD_GUIDE_VERSION}){
 if(![faceWidth,faceHeight,shoulderWidth].every(n=>Number.isFinite(n)&&n>0))return null;
 // A neutral pose board still needs room for ears and the scalp ABOVE the
 // facial oval. Otherwise "head height" is merely forehead-to-chin again.
 let width=faceWidth*1.16,height=faceHeight*1.16;
 if(hair&&[hair.width,hair.height,hair.faceWidth,hair.faceHeight].every(n=>Number.isFinite(n)&&n>0)){
  const q=Math.min(faceWidth/hair.faceWidth,faceHeight/hair.faceHeight);
  width=Math.max(width,hair.width*q);height=Math.max(height,hair.height*q);
 }
 const limits=wholeHeadGuideLimits(version),maximumScale=version===LEGACY_THAI_WHOLE_HEAD_GUIDE_VERSION?1:version===THAI_WHOLE_HEAD_GUIDE_VERSION?1.075*1.05:version===LOWERED_THAI_WHOLE_HEAD_GUIDE_VERSION?1.075:1.05,scale=Math.min(maximumScale,shoulderWidth*limits.width/width,shoulderWidth*limits.height/height);
 return {scale,faceWidth:faceWidth*scale,faceHeight:faceHeight*scale,width:width*scale,height:height*scale,widthToShoulder:width*scale/shoulderWidth,heightToShoulder:height*scale/shoulderWidth,version};
}
export function thaiWholeHeadInstruction(fields){
 if(!usesThaiWholeHeadGuide(fields))return '';
 const limits=wholeHeadGuideLimits(fields.thaiWholeHeadGuideVersion),width=Number((limits.width*100).toFixed(2)),height=Number((limits.height*100).toFixed(2));
 return `\nWHOLE HEAD INCLUDING HAIR — FINAL COMPOSITION AUTHORITY:
Generate the COMPLETE head, neck, shoulders and outfit together in this SAME ONE image generation. Image 1 is a neutral composition board, never a donor identity; the separate original-person image supplies every authentic facial feature. The composition board has already fitted the entire crown-to-chin silhouette INCLUDING scalp, ears and selected upper hair volume against this selected garment's measured shoulder span. Match this bounded whole-head silhouette, not merely the face oval. Its whole-head width is at most ${width}% and crown-to-chin height at most ${height}% of the fixed clothed shoulder span; narrower/taller individual faces keep their own aspect and may occupy less of either limit. These are OUTER HEAD limits, never target face-width percentages. Long hair below the chin is hairstyle length, not extra skull height.
Keep the selected garment at its exact board size and position: shoulder endpoints, collar, torso, sleeves and lower cloth never shrink or narrow to compensate for the head. Face close-ups and uploaded selfie framing establish identity/detail ONLY, never camera zoom or head/body scale.${usesCropIndependentWholeHead(fields.thaiWholeHeadGuideVersion)?" The identity crop rectangle is NOT a skull measurement: ignore its padding, hair length, visible neck and original collar when deciding anatomy or scale. Match the board's shoulder endpoints and jaw-to-collar contact together; never raise the jaw or narrow the shoulders to accommodate the identity photo.":''} Do not restore an older larger female head envelope or apply another percentage shrink after matching this board. Fit hairstyle volume inside the crown envelope without narrowing, lengthening, widening or otherwise reshaping the person's facial anatomy, eyes, gaze, expression or authentic jaw. Follow the garment-specific short chin-to-upper-collar anchor already shown; do not lengthen the neck when the head gets smaller. Preserve the selected hairstyle and its actual lengths behind the shoulders.
The final output is ONE coherent photorealistic full portrait, no guide labels, diagram marks, separate head, pasted PNG garment, local head/face warp, corrective pass or additional AI request. This measured whole-head board replaces prior face-only head-size numbers and larger-head instructions; all original identity, eye protection and selected Makeup/Natural policies remain binding.`;
}
