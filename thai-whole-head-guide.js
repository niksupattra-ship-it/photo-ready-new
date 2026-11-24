import {isThaiOutfitAi} from './thai-outfit-ai-policy.js';
export const LEGACY_THAI_WHOLE_HEAD_GUIDE_VERSION='thai-crown-chin-shoulder-guide-v1';
export const PREVIOUS_THAI_WHOLE_HEAD_GUIDE_VERSION='thai-crown-chin-shoulder-guide-v2-female105';
export const CROP_INDEPENDENT_THAI_WHOLE_HEAD_GUIDE_VERSION='thai-crown-chin-shoulder-guide-v3-crop-independent';
export const LOWERED_THAI_WHOLE_HEAD_GUIDE_VERSION='thai-crown-chin-shoulder-guide-v4-female102-lower005';
export const ENLARGED_THAI_WHOLE_HEAD_GUIDE_VERSION='thai-crown-chin-shoulder-guide-v5-female105';
export const NESTED_THAI_WHOLE_HEAD_GUIDE_VERSION='thai-crown-chin-shoulder-guide-v6-face-range-makeup';
export const FRONTAL_THAI_WHOLE_HEAD_GUIDE_VERSION='thai-crown-chin-shoulder-guide-v7-range98-frontal';
export const UNIFIED_POSE_THAI_WHOLE_HEAD_GUIDE_VERSION='thai-crown-chin-shoulder-guide-v8-range97-pose-contract';
export const THAI_WHOLE_HEAD_GUIDE_VERSION='thai-crown-chin-shoulder-guide-v9-camera-detail';
export const usesUnifiedFemalePoseVersion=version=>[UNIFIED_POSE_THAI_WHOLE_HEAD_GUIDE_VERSION,THAI_WHOLE_HEAD_GUIDE_VERSION].includes(version);
// Version new render caches only; accepted hairstyle results and in-flight recovery stay intact.
export const thaiFemaleGuideCacheRevision=(thaiWholeOutfit,gender,version=THAI_WHOLE_HEAD_GUIDE_VERSION)=>thaiWholeOutfit&&gender==='female'?[version]:[];
export const usesNestedWholeHead=version=>[NESTED_THAI_WHOLE_HEAD_GUIDE_VERSION,FRONTAL_THAI_WHOLE_HEAD_GUIDE_VERSION,UNIFIED_POSE_THAI_WHOLE_HEAD_GUIDE_VERSION,THAI_WHOLE_HEAD_GUIDE_VERSION].includes(version);
export const usesLoweredWholeHead=version=>[LOWERED_THAI_WHOLE_HEAD_GUIDE_VERSION,ENLARGED_THAI_WHOLE_HEAD_GUIDE_VERSION,NESTED_THAI_WHOLE_HEAD_GUIDE_VERSION,FRONTAL_THAI_WHOLE_HEAD_GUIDE_VERSION,UNIFIED_POSE_THAI_WHOLE_HEAD_GUIDE_VERSION,THAI_WHOLE_HEAD_GUIDE_VERSION].includes(version);
export const usesCropIndependentWholeHead=version=>[CROP_INDEPENDENT_THAI_WHOLE_HEAD_GUIDE_VERSION,LOWERED_THAI_WHOLE_HEAD_GUIDE_VERSION,ENLARGED_THAI_WHOLE_HEAD_GUIDE_VERSION,NESTED_THAI_WHOLE_HEAD_GUIDE_VERSION,FRONTAL_THAI_WHOLE_HEAD_GUIDE_VERSION,UNIFIED_POSE_THAI_WHOLE_HEAD_GUIDE_VERSION,THAI_WHOLE_HEAD_GUIDE_VERSION].includes(version);
export const usesThaiWholeHeadGuide=fields=>isThaiOutfitAi(fields)&&fields?.portraitMode==='female'&&fields?.portraitComposition==='en-outfit-body-v1'&&[LEGACY_THAI_WHOLE_HEAD_GUIDE_VERSION,PREVIOUS_THAI_WHOLE_HEAD_GUIDE_VERSION,CROP_INDEPENDENT_THAI_WHOLE_HEAD_GUIDE_VERSION,LOWERED_THAI_WHOLE_HEAD_GUIDE_VERSION,ENLARGED_THAI_WHOLE_HEAD_GUIDE_VERSION,NESTED_THAI_WHOLE_HEAD_GUIDE_VERSION,FRONTAL_THAI_WHOLE_HEAD_GUIDE_VERSION,UNIFIED_POSE_THAI_WHOLE_HEAD_GUIDE_VERSION,THAI_WHOLE_HEAD_GUIDE_VERSION].includes(fields?.thaiWholeHeadGuideVersion);
export const THAI_WHOLE_HEAD_LIMITS=Object.freeze({width:.48*.98*.97,height:.62*.98*.97});
const legacyLimits=Object.freeze({width:.40,height:.54});
export const wholeHeadGuideLimits=version=>version===LEGACY_THAI_WHOLE_HEAD_GUIDE_VERSION?legacyLimits:usesUnifiedFemalePoseVersion(version)?THAI_WHOLE_HEAD_LIMITS:version===FRONTAL_THAI_WHOLE_HEAD_GUIDE_VERSION?{width:.48*.98,height:.62*.98}:version===NESTED_THAI_WHOLE_HEAD_GUIDE_VERSION?{width:.48,height:.62}:version===ENLARGED_THAI_WHOLE_HEAD_GUIDE_VERSION?{width:.43*1.05,height:.58*1.05}:version===LOWERED_THAI_WHOLE_HEAD_GUIDE_VERSION?{width:.43,height:.58}:{width:.42,height:.567};
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
 if(usesNestedWholeHead(version)){
  const factor=usesUnifiedFemalePoseVersion(version)?.98*.97:version===FRONTAL_THAI_WHOLE_HEAD_GUIDE_VERSION?.98:1;
  // Two nested guide envelopes: face size cannot be reduced by a voluminous
  // hairstyle. Keep facial aspect; selected hair is bounded separately.
  const scale=Math.min(shoulderWidth*.40/faceWidth,shoulderWidth*.62/(faceHeight*1.16))*factor;
  const fw=faceWidth*scale,fh=faceHeight*scale;
  const width=Math.max(fw*1.16,shoulderWidth*.47*factor),height=Math.max(fh*1.16,shoulderWidth*.61*factor);
  return {scale,faceWidth:fw,faceHeight:fh,width,height,widthToShoulder:width/shoulderWidth,heightToShoulder:height/shoulderWidth,faceWidthToShoulder:fw/shoulderWidth,rangeSatisfied:fw>=shoulderWidth*.39*factor&&fw<=shoulderWidth*.41*factor,widthRange:[.46*factor,.48*factor],heightRange:[.60*factor,.62*factor],faceWidthRange:[.39*factor,.41*factor],version};
 }
 // A neutral pose board still needs room for ears and the scalp ABOVE the
 // facial oval. Otherwise "head height" is merely forehead-to-chin again.
 let width=faceWidth*1.16,height=faceHeight*1.16;
 if(hair&&[hair.width,hair.height,hair.faceWidth,hair.faceHeight].every(n=>Number.isFinite(n)&&n>0)){
  const q=Math.min(faceWidth/hair.faceWidth,faceHeight/hair.faceHeight);
  width=Math.max(width,hair.width*q);height=Math.max(height,hair.height*q);
 }
 const limits=wholeHeadGuideLimits(version),maximumScale=version===LEGACY_THAI_WHOLE_HEAD_GUIDE_VERSION?1:version===ENLARGED_THAI_WHOLE_HEAD_GUIDE_VERSION?1.075*1.05:version===LOWERED_THAI_WHOLE_HEAD_GUIDE_VERSION?1.075:1.05,scale=Math.min(maximumScale,shoulderWidth*limits.width/width,shoulderWidth*limits.height/height);
 return {scale,faceWidth:faceWidth*scale,faceHeight:faceHeight*scale,width:width*scale,height:height*scale,widthToShoulder:width*scale/shoulderWidth,heightToShoulder:height*scale/shoulderWidth,version};
}
export function thaiWholeHeadInstruction(fields){
 if(!usesThaiWholeHeadGuide(fields))return '';
 const rangeFactor=usesUnifiedFemalePoseVersion(fields.thaiWholeHeadGuideVersion)?.98*.97:fields.thaiWholeHeadGuideVersion===FRONTAL_THAI_WHOLE_HEAD_GUIDE_VERSION?.98:1,percent=value=>Number((value*rangeFactor).toFixed(2));
 if(usesNestedWholeHead(fields.thaiWholeHeadGuideVersion))return `
WHOLE HEAD INCLUDING HAIR — NESTED FACE AND CROWN ENVELOPES:
Generate the complete head, hair, neck and selected outfit in this SAME ONE image generation. Image 1 is a neutral geometry board; the separate original-person image alone supplies identity, authentic facial anatomy, eyes, gaze and expression.
Use the fixed garment shoulder span as 100%. Place the visible facial oval between ${percent(39)}% and ${percent(41)}% of that span in width, targeting ${percent(40)}%. Fit the upper head INCLUDING scalp, ears and hair between ${percent(46)}% and ${percent(48)}% in width and between ${percent(60)}% and ${percent(62)}% in crown-to-chin height. These OUTER HEAD limits exclude long hair ends below the chin. The inner facial oval must not become tiny merely because hair fills the outer envelope. Keep the natural intrinsic facial aspect, never stretch or flatten a face to fill a box; unusual anatomy uses the nearest coherent fit without changing identity.
Match the board's centerline, eye line and chin anchor together. Keep the current short jaw-to-upper-shirt-collar contact. The lower tie knot and jacket V are upper chest, never extra neck. The uploaded identity crop's padding, original clothing, visible neck and selfie zoom must not change these positions.
Keep all selected garment shoulder endpoints, collar, chest, sleeves and lower cloth at their exact board size and camera placement. Keep selected hair design and length, fitting upper hair volume to the outer scalp envelope. Never shrink the garment or lengthen the neck to compensate. The face envelope sets a minimum and maximum; do not add another percentage shrink after matching it.
${[FRONTAL_THAI_WHOLE_HEAD_GUIDE_VERSION,UNIFIED_POSE_THAI_WHOLE_HEAD_GUIDE_VERSION,THAI_WHOLE_HEAD_GUIDE_VERSION].includes(fields.thaiWholeHeadGuideVersion)?'FRONTAL POSE — FINAL ORIENTATION AUTHORITY: Photograph the person directly facing a level camera, with zero head roll and no left/right yaw or upward/downward chin pitch. Align the facial centerline and chin with the existing collar and tie centerline. Keep the photographed eye line level through head pose, not by moving individual eyes. Seat the head neutrally over the neck and shoulder roots: no forward head thrust, jutting chin, craned neck or enlarged nearer face from selfie perspective. Symmetry refers to the frontal pose and balanced placement only; preserve the person\'s authentic left/right facial differences, jaw, eye shapes, gaze and expression. Never mirror a facial half, reshape features or warp the delivered face.\n':''}${usesUnifiedFemalePoseVersion(fields.thaiWholeHeadGuideVersion)?'FRONTAL VIEW ALIGNMENT: Both pupils share one horizontal baseline; the bridge of the nose, philtrum, mid-lip and chin share the vertical collar centerline. Correct the source head roll, yaw, pitch and foreshortening together in this one generation. Source projected feature coordinates and source eye-line slope must not freeze a tilted pose. Reconstruct the same anatomical features coherently in the frontal view, keeping the actual individual eye shapes, facial proportions and identity rather than duplicating or mirroring either facial half.\n':''}Use only the selected light natural Makeup appearance, retaining authentic facial geometry. Produce ONE coherent photorealistic full portrait without visible guide lines, donor identity, pasted head, local face warp, corrective pass or additional AI request.`;
 const limits=wholeHeadGuideLimits(fields.thaiWholeHeadGuideVersion),width=Number((limits.width*100).toFixed(2)),height=Number((limits.height*100).toFixed(2));
 return `\nWHOLE HEAD INCLUDING HAIR — FINAL COMPOSITION AUTHORITY:
Generate the COMPLETE head, neck, shoulders and outfit together in this SAME ONE image generation. Image 1 is a neutral composition board, never a donor identity; the separate original-person image supplies every authentic facial feature. The composition board has already fitted the entire crown-to-chin silhouette INCLUDING scalp, ears and selected upper hair volume against this selected garment's measured shoulder span. Match this bounded whole-head silhouette, not merely the face oval. Its whole-head width is at most ${width}% and crown-to-chin height at most ${height}% of the fixed clothed shoulder span; narrower/taller individual faces keep their own aspect and may occupy less of either limit. These are OUTER HEAD limits, never target face-width percentages. Long hair below the chin is hairstyle length, not extra skull height.
Keep the selected garment at its exact board size and position: shoulder endpoints, collar, torso, sleeves and lower cloth never shrink or narrow to compensate for the head. Face close-ups and uploaded selfie framing establish identity/detail ONLY, never camera zoom or head/body scale.${usesCropIndependentWholeHead(fields.thaiWholeHeadGuideVersion)?" The identity crop rectangle is NOT a skull measurement: ignore its padding, hair length, visible neck and original collar when deciding anatomy or scale. Match the board's shoulder endpoints and jaw-to-collar contact together; never raise the jaw or narrow the shoulders to accommodate the identity photo.":''} Do not restore an older larger female head envelope or apply another percentage shrink after matching this board. Fit hairstyle volume inside the crown envelope without narrowing, lengthening, widening or otherwise reshaping the person's facial anatomy, eyes, gaze, expression or authentic jaw. Follow the garment-specific short chin-to-upper-collar anchor already shown; do not lengthen the neck when the head gets smaller. Preserve the selected hairstyle and its actual lengths behind the shoulders.
The final output is ONE coherent photorealistic full portrait, no guide labels, diagram marks, separate head, pasted PNG garment, local head/face warp, corrective pass or additional AI request. This measured whole-head board replaces prior face-only head-size numbers and larger-head instructions; all original identity, eye protection and selected Makeup/Natural policies remain binding.`;
}
