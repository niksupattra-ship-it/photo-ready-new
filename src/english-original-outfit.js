import {measureUniformAnchors,planPortraitUniformFit} from './portrait-uniform-fit.js';
export const ENGLISH_ORIGINAL_OUTFIT_VERSION='original-outfit-pixels-v2-full-pattern-soft-neck';

export function planOriginalOutfit({pixels,width,height,face,opaqueTop=0}){
 const uniform=measureUniformAnchors(pixels,width,height);
 // Never exceed the original garment width. Use a single uniform scale for
 // the entire template, including its buttons, texture and insignia.
 const W=Math.min(2048,width),H=Math.round(W*4/3);
 // Contain every opaque pattern pixel, rather than covering/cropping the
 // portrait edges. Reserve headroom above the collar and a bottom margin.
 const collarY=H*.50;
 const above=uniform.collarTopY-uniform.bounds.t;
 const garmentScale=Math.min(W*.96/uniform.bounds.w,(H*.98-collarY)/(uniform.bounds.b-uniform.collarTopY+1),above>0?(collarY-H*.02)/above:Infinity);
 const x=Math.max(W*.02-uniform.bounds.l*garmentScale,Math.min(W/2-uniform.centerX*garmentScale,W*.98-(uniform.bounds.r+1)*garmentScale));
 const frame={x,y:collarY-uniform.collarTopY*garmentScale,w:width*garmentScale,h:height*garmentScale};
 const fit=planPortraitUniformFit({W,H,uniform,face,opaqueTop,faceShoulderRatio:.36,frame});
 return {...fit,W,H};
}
export function paintOriginalOutfit({head,uniform,plan,canvasFor}){
 const canvas=canvasFor(plan.W,plan.H),ctx=canvas.getContext('2d');
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.drawImage(head,plan.hX,plan.hY,head.width*plan.scale,head.height*plan.scale);
 // No AI/filter/colour operation runs after this draw. Every opaque garment
 // pixel comes from the original template, resampled only for placement.
 const f=plan.uniformFrame;ctx.drawImage(uniform,f.x,f.y,f.w,f.h);
 return canvas;
}

// Feather only existing cutout alpha below the jaw, never skin RGB, face or
// garment pixels. The same head alpha is reused by the makeup version.
export function softenEnglishNeckEdges(pixels,width,height,{chinY,faceCX,eyeWidth}){
 const before=pixels.slice(),radius=Math.max(1,Math.min(3,Math.round(eyeWidth*.012)));
 const left=Math.max(radius,Math.floor(faceCX-eyeWidth*1.5)),right=Math.min(width-radius,Math.ceil(faceCX+eyeWidth*1.5));
 const top=Math.max(radius,Math.ceil(chinY+eyeWidth*.06)),bottom=Math.min(height-radius,Math.ceil(chinY+eyeWidth*1.7));
 for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
  const i=(y*width+x)*4+3;if(!before[i])continue;
  let sum=0,weight=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const k=(dx===0?2:1)*(dy===0?2:1);sum+=before[((y+dy*radius)*width+x+dx*radius)*4+3]*k;weight+=k;
  }
  pixels[i]=Math.min(before[i],Math.round(sum/weight));
 }
}
