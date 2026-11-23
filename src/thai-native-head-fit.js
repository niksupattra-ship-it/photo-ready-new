import {fitEnglishHeadTemplate} from '../english-head-portrait.js';
import {measureUniformAnchors} from './portrait-uniform-fit.js';
import {thaiBodyGeometry} from './thai-body-geometry.js';
import {englishHeadCutoutAlpha,englishNeckClipAlpha} from './english-head-cutout.js';
export const THAI_NATIVE_HEAD_FIT_VERSION='thai-native-head-neck-fit-v1';
// Measure real source neck skin. Facial geometry is never warped; a separate
// skin-only neck mesh can bridge the measured garment aperture below the jaw.
export function seatMeasuredNeck(fit,{face,width,height,labels,uniform}){
 if(!labels?.data||labels.data.length!==labels.width*labels.height)return null;
 const chin=face[152].y*height,cx=(face[234].x+face[454].x)*width/2;
 const lx=Math.max(0,Math.min(labels.width-1,Math.round(cx/width*(labels.width-1))));
 const start=Math.max(0,Math.floor(chin/height*labels.height));let bottom=null;
 for(let y=start;y<labels.height;y++){
  const skin=[-1,0,1].filter(dx=>{const x=lx+dx;if(x<0||x>=labels.width)return false;return [2,3].includes(labels.data[y*labels.width+x])}).length;
  if(skin>=2)bottom=(y+1)/labels.height*height;
  else if(bottom!==null)break;
  else if(y>start+2)break;
 }
 if(bottom===null||bottom<=chin)return null;
 const gs=fit.garment.w/uniform.width,collarBase=fit.garment.y+uniform.socketY*gs;
 return {...fit,sourceNeckBottom:bottom,collarBase};
}
// Piecewise texture mapping uses only connected, labelled neck skin. It never
// samples a shirt/tie, paints a flat skin rectangle, or changes pixels above jaw.
export function planThaiNeckMesh(fit,{face,width,height,labels,uniform,uniformPixels}){
 const cx=(face[234].x+face[454].x)*width/2,lx=Math.max(0,Math.min(labels.width-1,Math.round(cx/width*(labels.width-1)))),chin=face[152].y*height;
 const skin=(x,y)=>x>=0&&x<labels.width&&[2,3].includes(labels.data[y*labels.width+x]);
 const source=[];const first=Math.max(0,Math.ceil(chin/height*labels.height));
 for(let y=first;y<labels.height;y++){
  if(!skin(lx,y)){if(source.length)break;continue}
  let l=lx,r=lx;while(skin(l-1,y))l--;while(skin(r+1,y))r++;
  if(r-l<2){if(source.length)break;continue}
  source.push({y:(y+.5)*height/labels.height,left:(l+.5)*width/labels.width,right:(r+.5)*width/labels.width});
 }
 if(source.length<3)return null;
 // Avoid the final uncertain segmentation row immediately beside source cloth.
 source.pop();const top=source[0],bottom=source[source.length-1],gs=fit.garment.w/uniform.width;
 let closeRow=null,lastGap=null;
 const ux=Math.max(0,Math.min(uniform.width-1,Math.round(uniform.centerX)));
 for(let y=Math.floor(uniform.collarTopY);y<uniform.height;y++){
  if(uniformPixels[(y*uniform.width+ux)*4+3]>128){closeRow=y;break}
  let l=ux,r=ux;while(l>0&&uniformPixels[(y*uniform.width+l)*4+3]<=128)l--;while(r<uniform.width-1&&uniformPixels[(y*uniform.width+r)*4+3]<=128)r++;
  if(l>0&&r<uniform.width-1&&(!lastGap||r-l>lastGap.right-lastGap.left))lastGap={left:l,right:r};
 }
 if(closeRow===null||!lastGap)return null;
 const targetTop=fit.head.y+top.y*fit.scale,targetBottom=fit.garment.y+(closeRow+2)*gs;
 if(targetBottom<=targetTop)return null;
 const topWidth=(top.right-top.left)*fit.scale,faceWidth=Math.abs(face[454].x-face[234].x)*width*fit.scale;
 const apertureWidth=(lastGap.right-lastGap.left+4)*gs;
 if(apertureWidth>faceWidth*1.05)return null; // A deep exposed chest is not missing neck skin.
 const baseWidth=apertureWidth;
 const center=fit.garment.x+uniform.centerX*gs;
 const rows=[];
 for(let y=Math.floor(targetTop);y<=Math.ceil(targetBottom);y++){
  const t=Math.max(0,Math.min(1,(y-targetTop)/(targetBottom-targetTop))),widthT=Math.max(0,Math.min(1,(y-targetTop)/(fit.collarY-targetTop))),smooth=widthT*widthT*(3-2*widthT),sy=top.y+(bottom.y-top.y)*t;
  const nearest=source.reduce((best,row)=>Math.abs(row.y-sy)<Math.abs(best.y-sy)?row:best,top);
  const dw=topWidth+(baseWidth-topWidth)*smooth;
  rows.push({sy,sx:nearest.left,sw:nearest.right-nearest.left,dx:center-dw/2,dy:y,dw});
 }
 return {rows,top:targetTop,bottom:targetBottom,sourceTop:top.y,sourceBottom:bottom.y};
}
export function createThaiNativeHeadFit({decode,faceLandmarks,segment,loadImage,canvasFor,toBlob,copyMetadata}){
 const cache=new WeakMap();
 return async function prepare(blob,template){
  if(blob.idpromThaiNativeHeadFitVersion===THAI_NATIVE_HEAD_FIT_VERSION)return blob;
  let entries=cache.get(blob);if(!entries){entries=new Map();cache.set(blob,entries)}
  if(entries.has(template))return entries.get(template);
  const pending=(async()=>{
   const canvases=[];const canvas=(w,h)=>{const c=canvasFor(w,h);canvases.push(c);return c};
   try{
    const im=await decode(blob),w=im.naturalWidth||im.width,h=im.naturalHeight||im.height;
    const face=await faceLandmarks(blob,im),labels=await segment(im);
    if(!face?.[152]||!labels?.data)throw Error('native_fit_evidence_missing');
    // Measure on a bounded grid; retain the full-resolution source for drawing.
    const mw=Math.min(512,w),mh=Math.round(h*mw/w),small=canvas(mw,mh),sx=small.getContext('2d',{willReadFrequently:true});sx.drawImage(im,0,0,mw,mh);
    const pixels=sx.getImageData(0,0,mw,mh).data,hair=new Uint8ClampedArray(pixels.length),clothing=new Uint8ClampedArray(pixels.length);
    for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){const cat=labels.data[Math.min(labels.height-1,Math.floor(y*labels.height/mh))*labels.width+Math.min(labels.width-1,Math.floor(x*labels.width/mw))],i=(y*mw+x)*4+3;if(cat===1)hair[i]=255;if(cat===4)clothing[i]=255}
    const metrics=thaiBodyGeometry({pixels,hair,clothing,width:mw,height:mh,face});
    if(Number.isFinite(metrics?.faceToShoulder)&&metrics.faceToShoulder<=.33)return blob;
    let crown=metrics?.head?.top;
    if(!Number.isFinite(crown)){const cx=(face[234].x+face[454].x)*mw/2,fw=Math.abs(face[454].x-face[234].x)*mw;for(let y=0;y<face[10].y*mh;y++){let count=0;for(let x=Math.max(0,Math.floor(cx-fw));x<Math.min(mw,cx+fw);x++)if(pixels[(y*mw+x)*4+3]>=160)count++;if(count>=Math.max(2,fw*.05)){crown=y;break}}}
    if(!Number.isFinite(crown))throw Error('native_fit_crown_unmeasurable');
    const outfit=await loadImage(template),uw=outfit.naturalWidth||outfit.width,uh=outfit.naturalHeight||outfit.height,uc=canvas(uw,uh),ux=uc.getContext('2d',{willReadFrequently:true});ux.drawImage(outfit,0,0);
    const up=ux.getImageData(0,0,uw,uh).data,uniform=measureUniformAnchors(up,uw,uh);
    const crownY=crown*h/mh,initial=fitEnglishHeadTemplate({uniform,face,width:w,height:h,crownY,W:w,H:h});
    const fit=seatMeasuredNeck(initial,{face,width:w,height:h,labels,uniform});if(!fit)throw Error('native_fit_neck_insufficient');const mesh=planThaiNeckMesh(fit,{face,width:w,height:h,labels,uniform,uniformPixels:up});if(!mesh)throw Error('native_fit_neck_mesh_unmeasurable');
    const native=canvas(w,h),nx=native.getContext('2d',{willReadFrequently:true});nx.drawImage(im,0,0);
    const frame=nx.getImageData(0,0,w,h),alpha=englishHeadCutoutAlpha(frame.data,w,h,face,labels),clip=englishNeckClipAlpha({width:w,height:h,labels,chinY:face[152].y*h,uniform,uniformPixels:up,headFrame:fit.head,garmentFrame:fit.garment});
    for(let i=0;i<alpha.length;i++){const cat=labels.data[Math.min(labels.height-1,Math.floor(Math.floor(i/w)*labels.height/h))*labels.width+Math.min(labels.width-1,Math.floor((i%w)*labels.width/w))];const y=Math.floor(i/w),xx=i%w,protectedFace=y<=face[152].y*h&&xx>=Math.min(face[234].x,face[454].x)*w&&xx<=Math.max(face[234].x,face[454].x)*w;frame.data[i*4+3]=protectedFace?frame.data[i*4+3]:(cat===4||(cat!==1&&fit.head.y+y*fit.scale>=mesh.top)?0:Math.min(alpha[i],clip[i]));}
    nx.putImageData(frame,0,0);
    const out=canvas(w,h),x=out.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(native,fit.head.x,fit.head.y,fit.head.w,fit.head.h);for(const row of mesh.rows)x.drawImage(im,row.sx,row.sy,row.sw,1,row.dx,row.dy,row.dw,1);x.drawImage(outfit,fit.garment.x,fit.garment.y,fit.garment.w,fit.garment.h);
    const result=copyMetadata(blob,await toBlob(out));result.idpromThaiNativeHeadFitVersion=THAI_NATIVE_HEAD_FIT_VERSION;result.idpromThaiNativeFitTemplate=template;result.idpromThaiNativeFitGeometry={head:{...fit.head},garment:{...fit.garment},scale:fit.scale,chinY:fit.chinY,shoulderSpan:fit.shoulderSpan,faceRatio:fit.faceRatio};return result;
   }catch(error){
    // A local mask failure must not discard a completed paid AI result or
    // trigger another generation. Do not invent missing neck pixels.
    console.warn('Thai native head fit needs review:',error?.message||'unmeasurable');blob.idpromQualityReviewNeeded=true;return blob;
   }finally{for(const c of canvases)c.width=c.height=1}
  })();entries.set(template,pending);pending.then(result=>{if(result===blob)entries.delete(template)},()=>entries.delete(template));return pending;
 };
}
