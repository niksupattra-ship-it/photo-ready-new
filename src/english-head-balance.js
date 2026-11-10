import {measureEnglishProportions} from './english-proportion-check.js';
export const ENGLISH_HEAD_BALANCE_VERSION='measured-head-only-v1';
export const ENGLISH_FACE_SHOULDER_TARGET=.30;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t)};
export function planEnglishHeadBalance(pixels,width,height,face){
 const metrics=measureEnglishProportions(pixels,width,height,face,{allowCropped:true});
 if(!metrics.measurable)return {applied:false,reason:'unmeasurable',metrics};
 const {faceRatio,headRatio,faceHeight,chinY,centerX}=metrics;
 if(faceRatio<=.325&&!(faceRatio>.31&&headRatio>.64))return {applied:false,reason:'balanced',metrics};
 const scale=clamp(Math.min(ENGLISH_FACE_SHOULDER_TARGET/faceRatio,.60/headRatio),.50,.98);
 return {applied:true,version:ENGLISH_HEAD_BALANCE_VERSION,metrics,scale,anchorX:centerX,anchorY:chinY,transitionEnd:Math.min(height,chinY+faceHeight*.25),faceRatioAfter:faceRatio*scale,headRatioAfter:headRatio*scale};
}

function labelAt(labels,x,y,width,height){
 if(!labels?.data||!labels.width||!labels.height)return null;
 return labels.data[Math.min(labels.height-1,Math.floor(y*labels.height/height))*labels.width+Math.min(labels.width-1,Math.floor(x*labels.width/width))];
}
// Inverse mapping: every facial feature uses ONE isotropic scale about the chin.
// The neck joins smoothly at its original length. The lower person and every
// protected clothing pixel remain exact; no generation, face reshaping or zoom.
export function applyEnglishHeadBalance(pixels,width,height,plan,labels=null){
 if(pixels.length!==width*height*4)throw Error('Invalid head-balance pixels');
 if(!plan?.applied)return new Uint8ClampedArray(pixels);
 const {scale,anchorX:cx,anchorY:chin,transitionEnd:end}=plan;
 if(![scale,cx,chin,end].every(Number.isFinite)||scale<.5||scale>=1||end<=chin)throw Error('Invalid head-balance plan');
 const out=new Uint8ClampedArray(pixels),last=Math.min(height,Math.ceil(end));
 for(let y=0;y<last;y++){
  const below=y>=chin,t=below?smooth((y-chin)/(end-chin)):0,sx=scale+(1-scale)*t,sourceY=below?y:chin+(y-chin)/scale;
  for(let x=0;x<width;x++){
   const i=(y*width+x)*4,cat=labelAt(labels,x,y,width,height);
   if(cat===4)continue;
   // Continue attached hair through the neck join, without moving bare shoulders
   // or accessories. Clothing was protected above, including raised collars.
   if(below&&(cat===5||Math.abs(x-cx)>plan.metrics.faceWidth*.48&&(cat===2||cat===3||cat===null)))continue;
   const sourceX=cx+(x-cx)/sx,x0=Math.floor(sourceX),y0=Math.floor(sourceY),dx=sourceX-x0,dy=sourceY-y0;
   let alpha=0,r=0,g=0,b=0;
   for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
    const px=x0+xx,py=y0+yy;if(px<0||px>=width||py<0||py>=height)continue;
    const j=(py*width+px)*4,w=(xx?dx:1-dx)*(yy?dy:1-dy)*pixels[j+3];alpha+=w;r+=pixels[j]*w;g+=pixels[j+1]*w;b+=pixels[j+2]*w;
   }
   // Retain the existing supporting neck silhouette beside the smaller jaw.
   if(below&&pixels[i+3]>alpha&&(cat===2||cat===3||cat===null))continue;
   out[i]=alpha?r/alpha:0;out[i+1]=alpha?g/alpha:0;out[i+2]=alpha?b/alpha:0;out[i+3]=alpha;
  }
 }
 return out;
}
export function balancedEnglishLandmarks(face,plan,width,height){
 if(!plan?.applied)return face;
 return face.map(p=>p?{...p,x:(plan.anchorX+(p.x*width-plan.anchorX)*plan.scale)/width,y:(plan.anchorY+(p.y*height-plan.anchorY)*plan.scale)/height}:p);
}
