import {decodedStudioImage} from './studio-image-cache.js';
import {measureUniformAnchors,placeUniformForPortrait} from './portrait-uniform-fit.js';
import {layerToScene} from './studio-transform.js';

export const ENGLISH_MANUAL_OUTFIT_VERSION='native-aspect-below-chin-v1';

// Full-person AI placement is not a garment frame. Place each new native PNG
// independently, using one scale for both axes and keeping the portrait fixed.
export function planEnglishManualOutfit({uniform,head,face,W=900,H=1200}){
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
export async function fitEnglishManualOutfit({source,head,headSource,measureFace}){
 const image=await decodedStudioImage(source),width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
 const sample=Object.assign(document.createElement('canvas'),{width,height}),ctx=sample.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(image,0,0);
 let uniform;try{uniform=measureUniformAnchors(ctx.getImageData(0,0,width,height).data,width,height)}finally{sample.width=sample.height=1}
 let face=null;
 if(head&&measureFace)try{face=await measureFace(await decodedStudioImage(headSource||head.source))}catch{}
 return planEnglishManualOutfit({uniform,head,face});
}
