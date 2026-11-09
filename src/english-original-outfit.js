import {measureUniformAnchors,planPortraitUniformFit} from './portrait-uniform-fit.js';
export const ENGLISH_ORIGINAL_OUTFIT_VERSION='original-outfit-pixels-v1';

export function planOriginalOutfit({pixels,width,height,face,opaqueTop=0}){
 const uniform=measureUniformAnchors(pixels,width,height);
 // Never exceed the original garment width. Use a single uniform scale for
 // the entire template, including its buttons, texture and insignia.
 const W=Math.min(2048,width),H=Math.round(W*4/3);
 const fit=planPortraitUniformFit({W,H,uniform,face,opaqueTop,faceShoulderRatio:.36});
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
