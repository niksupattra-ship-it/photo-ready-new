// Compare only obvious structural differences in eye-aligned hair masks.
// This is not face recognition or a guarantee that two hairstyles are equal.
// The caller keeps the original completion checks when evidence is uncertain.
const FRAME_WIDTH=256,FRAME_HEIGHT=320;
const inside=(point,polygon)=>{
 if(!Array.isArray(polygon)||polygon.length!==4||polygon.some(p=>!Number.isFinite(p?.x)||!Number.isFinite(p?.y)))return false;
 let result=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];
  if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)result=!result;
 }
 return result;
};
export function profileSelectedPortraitHair(evidence){
 const width=evidence?.width??FRAME_WIDTH,height=evidence?.height??FRAME_HEIGHT;
 const pixels=evidence?.pixels,hair=evidence?.hair;
 if(width!==FRAME_WIDTH||height!==FRAME_HEIGHT||pixels?.length!==width*height*4||hair?.length!==pixels.length)return {measurable:false};
 const present=(x,y)=>{const i=(y*width+x)*4+3;return pixels[i]>=192&&hair[i]>=192};
 let hairPixels=0,fringePixels=0,fringeVisible=0;
 // Fit the forehead band to this person's facial oval. A naturally short
 // forehead must not be mistaken for bangs merely because the eyes align.
 const top=Number.isFinite(evidence.faceTopY)&&evidence.faceTopY>=32&&evidence.faceTopY<=116?evidence.faceTopY:null;
 const fringeTop=top===null?108:Math.round(top+(144-top)*.45),fringeBottom=top===null?132:Math.round(top+(144-top)*.82);
 const fringeArea=40*(fringeBottom-fringeTop);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(present(x,y))hairPixels++;
 for(let y=fringeTop;y<fringeBottom;y++)for(let x=108;x<148;x++){
  if(pixels[(y*width+x)*4+3]>=192)fringeVisible++;
  if(present(x,y))fringePixels++;
 }
 if(hairPixels<256||fringeVisible/fringeArea<.85)return {measurable:false,hairPixels};
 const sideBottom=(x0,x1)=>{
  let bottom=null,run=0;
  for(let y=160;y<height;y++){
   let count=0;for(let x=x0;x<x1;x++)if(present(x,y))count++;
   if(count>=4){run++;if(run>=8)bottom=y}else run=0;
  }
  return bottom;
 };
 const leftBottom=sideBottom(32,108),rightBottom=sideBottom(148,224);
 const chinY=Number.isFinite(evidence.chinY)&&evidence.chinY>=160&&evidence.chinY<=280?evidence.chinY:null;
 // Transparent pixels alone cannot tell a natural hair end from an image crop.
 // Require twelve normalized pixels of source-image space beyond both ends.
 const lengthMeasurable=chinY!==null&&leftBottom!==null&&rightBottom!==null&&leftBottom<308&&rightBottom<308&&
  [[32,leftBottom+12],[107,leftBottom+12],[148,rightBottom+12],[223,rightBottom+12]].every(([x,y])=>inside({x,y},evidence.sourceBounds));
 return {measurable:true,hairPixels,fringe:fringePixels/fringeArea,fringeTop,fringeBottom,leftBottom,rightBottom,chinY,
  length:chinY!==null&&leftBottom!==null&&rightBottom!==null?(Math.min(leftBottom,rightBottom)-chinY)/64:null,
  lengthMeasurable};
}

export function inspectSelectedPortraitHair(reference,output){
 const expected=profileSelectedPortraitHair(reference),actual=profileSelectedPortraitHair(output);
 if(!expected.measurable||!actual.measurable)return {measurable:false,mismatch:false,reason:null,reference:expected,output:actual};
 // Only strong contradictions count. Moderate volume and wispy edge changes
 // are left to the existing checks, rather than claiming a precise style ID.
 let reason=null;
 if(expected.fringe<=.04&&actual.fringe>=.28)reason='unexpected_fringe';
 else if(expected.fringe>=.5&&actual.fringe<=.04)reason='missing_fringe';
 if(!reason&&expected.lengthMeasurable&&actual.lengthMeasurable&&Math.abs(expected.length-actual.length)>=1.1)reason='length';
 return {measurable:true,mismatch:reason!==null,reason,reference:expected,output:actual};
}
