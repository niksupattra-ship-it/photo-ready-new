import {measureEnglishProportions} from './english-proportion-check.js';
export const ENGLISH_HEAD_BALANCE_VERSION='measured-head-only-v3-jaw-collar';
export const ENGLISH_FACE_SHOULDER_TARGET=.30;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t)};
export function planEnglishHeadBalance(pixels,width,height,face){
 const metrics=measureEnglishProportions(pixels,width,height,face,{allowCropped:true});
 if(!metrics.measurable)return {applied:false,reason:'unmeasurable',metrics};
 const {faceRatio,headRatio,faceHeight,chinY,centerX}=metrics;
 if(faceRatio<=.325&&!(faceRatio>.31&&headRatio>.64))return {applied:false,reason:'balanced',metrics};
 const scale=clamp(Math.min(ENGLISH_FACE_SHOULDER_TARGET/faceRatio,.60/headRatio),.50,.98);
 const jaw=[234,93,132,58,172,136,150,149,176,148,152,377,400,378,379,365,397,288,361,323,454].map(i=>face[i]).filter(Boolean).map(p=>({x:centerX+(p.x*width-centerX)*scale,y:chinY+(p.y*height-chinY)*scale}));
 return {applied:true,version:ENGLISH_HEAD_BALANCE_VERSION,metrics,jaw,scale,anchorX:centerX,anchorY:chinY,transitionEnd:Math.min(height,chinY+faceHeight*.25),faceRatioAfter:faceRatio*scale,headRatioAfter:headRatio*scale};
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
 const neckStart=chin-plan.metrics.faceHeight*.2;
 let neckEnd=end;
 if(labels?.data){
  const left=Math.max(0,Math.floor((cx-plan.metrics.faceWidth*.6)*labels.width/width)),right=Math.min(labels.width-1,Math.ceil((cx+plan.metrics.faceWidth*.6)*labels.width/width));
  for(let row=Math.max(0,Math.floor(neckStart*labels.height/height));row<Math.min(labels.height,Math.ceil(end*labels.height/height));row++){
   let count=0;for(let col=left;col<=right;col++)if(labels.data[row*labels.width+col]===4)count++;
   if(count>=2){neckEnd=Math.max(neckStart+plan.metrics.faceHeight*.08,row*height/labels.height);break}
  }
 }
 // The scaled jaw is the exact lower face boundary. Neck skin can meet the
 // fixed collar below it without moving any facial pixel or feature.
 const jawY=new Float64Array(width).fill(-Infinity);
 for(let n=1;n<(plan.jaw?.length||0);n++){
  const a=plan.jaw[n-1],b=plan.jaw[n];if(Math.abs(b.x-a.x)<.001)continue;
  for(let x=Math.max(0,Math.ceil(Math.min(a.x,b.x)));x<=Math.min(width-1,Math.floor(Math.max(a.x,b.x)));x++)jawY[x]=Math.max(jawY[x],a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x));
 }
 for(let y=0;y<last;y++){
  const below=y>=chin,t=below?smooth((y-chin)/(end-chin)):0,sx=scale+(1-scale)*t,sourceY=below?y:chin+(y-chin)/scale;
  for(let x=0;x<width;x++){
   const i=(y*width+x)*4,cat=labelAt(labels,x,y,width,height);
   if(cat===4)continue;
   // Continue attached hair through the neck join, without moving bare shoulders
   // or accessories. Clothing was protected above, including raised collars.
   if(below&&cat===5)continue;
   const neck=y>=neckStart&&y>jawY[x]&&Math.abs(x-cx)<plan.metrics.faceWidth*.6&&cat!==1&&cat!==5;
   const neckScale=neck?scale+(1-scale)*smooth((y-neckStart)/(neckEnd-neckStart)):sx;
   const sampleY=neck?y:sourceY,sourceX=cx+(x-cx)/neckScale,x0=Math.floor(sourceX),y0=Math.floor(sampleY),dx=sourceX-x0,dy=sampleY-y0;
   let alpha=0,r=0,g=0,b=0;
   for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
    const px=x0+xx,py=y0+yy;if(px<0||px>=width||py<0||py>=height)continue;
    // A raised collar is fixed. Never sample its fabric into the moving neck
    // and create another collar beside the protected original one.
    if(labelAt(labels,px,py,width,height)===4)continue;
    const j=(py*width+px)*4,w=(xx?dx:1-dx)*(yy?dy:1-dy)*pixels[j+3];alpha+=w;r+=pixels[j]*w;g+=pixels[j+1]*w;b+=pixels[j+2]*w;
   }
   // Let the neck edge follow the same smooth join. Restoring the old wider
   // alpha here creates a horizontal skin ledge exactly at the chin row.
   out[i]=alpha?r/alpha:0;out[i+1]=alpha?g/alpha:0;out[i+2]=alpha?b/alpha:0;out[i+3]=alpha;
  }
 }
 return out;
}
export function balancedEnglishLandmarks(face,plan,width,height){
 if(!plan?.applied)return face;
 return face.map(p=>p?{...p,x:(plan.anchorX+(p.x*width-plan.anchorX)*plan.scale)/width,y:(plan.anchorY+(p.y*height-plan.anchorY)*plan.scale)/height}:p);
}
