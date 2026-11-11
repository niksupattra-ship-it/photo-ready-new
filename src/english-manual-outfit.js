import {decodedStudioImage} from './studio-image-cache.js';
import {measureUniformAnchors,placeUniformForPortrait} from './portrait-uniform-fit.js';
import {layerToScene} from './studio-transform.js';
import {createFaceMeasurementCache} from './studio-face-measurement-cache.js';
import {ENGLISH_HEAD_PORTRAIT_VERSION,fitEnglishHeadTemplate} from '../english-head-portrait.js';
import {ENGLISH_BODY_PORTRAIT_VERSION} from '../english-body-portrait.js';

export const ENGLISH_MANUAL_OUTFIT_VERSION='native-fixed-pattern-overlay-v3';
export const ENGLISH_FIXED_PATTERN_WIDTH=.90;

// Full-person AI placement is not a garment frame. Place each new native PNG
// independently, using one scale for both axes and keeping the portrait fixed.
// English complete-AI portraits contain a finished head at the chosen scale.
// A later outfit selection overlays the untouched source PNG: its native aspect
// and displayed size depend ONLY on the selected pattern, never face width.
export function planEnglishFixedPatternOutfit({uniform,head,face,W=900,H=1200}){
 if(!uniform?.bounds?.w||!Number.isFinite(uniform.centerX)||!Number.isFinite(uniform.collarTopY))throw Error('Invalid English pattern geometry');
 const scale=W*ENGLISH_FIXED_PATTERN_WIDTH/uniform.bounds.w;
 if(!Number.isFinite(scale)||scale<=0)throw Error('Invalid English pattern scale');
 let collarX=W/2,collarY=H*.55;
 if(head&&[152,234,454].every(id=>Number.isFinite(face?.[id]?.x)&&Number.isFinite(face?.[id]?.y))){
  const frame=head.sourceFrame||{x:0,y:0,w:W,h:H};
  const pose={x:0,y:0,scale:1,rotation:0,...head};
  const point=id=>layerToScene(pose,{x:frame.x+face[id].x*frame.w,y:frame.y+face[id].y*frame.h});
  const left=point(234),right=point(454),chin=point(152);
  collarX=(left.x+right.x)/2;
  collarY=chin.y+W*.018; // Translation only: face width never changes garment scale.
 }
 return {x:collarX-uniform.centerX*scale,y:collarY-uniform.collarTopY*scale,w:uniform.width*scale,h:uniform.height*scale};
}
export function planEnglishManualOutfit({uniform,head,face,W=900,H=1200}){
 if(head?.portraitComposition===ENGLISH_BODY_PORTRAIT_VERSION)return planEnglishFixedPatternOutfit({uniform,head,face,W,H});
 if(head?.portraitComposition===ENGLISH_HEAD_PORTRAIT_VERSION&&head.sourcePixelSize&&[10,152,234,454].every(id=>Number.isFinite(face?.[id]?.x)&&Number.isFinite(face?.[id]?.y))){
  const {width,height}=head.sourcePixelSize,fit=fitEnglishHeadTemplate({uniform,face,width,height,crownY:head.nativeCrownY||0,W,H});
  return {...fit.garment,englishHeadFrame:fit.head};
 }
 let collarX=W/2,collarY=H*.5,faceWidth=W*.29;
 if(head&&[152,234,454].every(id=>Number.isFinite(face?.[id]?.x)&&Number.isFinite(face?.[id]?.y))){
  const frame=head.sourceFrame||{x:0,y:0,w:W,h:H};
  const pose={x:0,y:0,scale:1,rotation:0,...head};
  const point=id=>layerToScene(pose,{x:frame.x+face[id].x*frame.w,y:frame.y+face[id].y*frame.h});
  const chin=point(152),left=point(234),right=point(454);
  faceWidth=Math.hypot(right.x-left.x,right.y-left.y);
  collarX=(left.x+right.x)/2;collarY=chin.y+faceWidth*.12;
 }
 return placeUniformForPortrait({W,H,uniform,collarX,collarY,faceWidth});
}
const cachedFaceMeasurement=createFaceMeasurementCache();
export async function measureEnglishManualOutfitFace({head,headSource,measureFace}){
 if(!head||!measureFace)return null;
 let sample;
 try{
  const source=headSource||head.source,image=typeof source==='string'?await decodedStudioImage(source):source,width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
  // Compare exact pixels so edits to a reused canvas cannot reuse an old face.
  // Large originals retain the existing direct detector path, bounding memory.
  if(width*height>4_000_000)return await measureFace(image);
  sample=Object.assign(document.createElement('canvas'),{width,height});const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  return await cachedFaceMeasurement({canvas:sample,width,height,pixels:ctx.getImageData(0,0,width,height).data},measureFace);
 }catch{return null}finally{if(sample)sample.width=sample.height=1}
}
export function planEnglishManualOutfitPreview({image,head,face=null}){
 const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
 const sample=Object.assign(document.createElement('canvas'),{width,height}),ctx=sample.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(image,0,0);
 let uniform;try{uniform=measureUniformAnchors(ctx.getImageData(0,0,width,height).data,width,height)}finally{sample.width=sample.height=1}
 try{return planEnglishManualOutfit({uniform,head,face})}catch(error){if(!face)throw error;return planEnglishManualOutfit({uniform,head})}
}
export async function fitEnglishManualOutfit({source,head,headSource,measureFace,facePromise}){
 const image=await decodedStudioImage(source),face=await(facePromise||measureEnglishManualOutfitFace({head,headSource,measureFace}));
 return planEnglishManualOutfitPreview({image,head,face});
}
