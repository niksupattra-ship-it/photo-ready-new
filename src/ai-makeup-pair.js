import {measureMakeupNeckSkin} from './makeup-skin-mask.js';
// Restrict AI edits to the detected face and segmented neck, with an inward feather. Everything
// outside that outline is copied byte-for-byte from Natural, including alpha.
export const MAKEUP_FACE_OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
export function useAiMakeupPixels({natural,makeup,width,height,face,neckSkin}){
 const length=width*height*4;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||natural.length!==length||makeup.length!==length)throw Error('ขนาดภาพแต่งหน้าไม่ตรงกับภาพฐาน');
 const points=MAKEUP_FACE_OVAL.map(i=>face?.[i]);
 if(points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('ตรวจขอบใบหน้าสำหรับแต่งหน้าไม่สำเร็จ · เก็บภาพเดิมไว้');
 const polygon=points.map(p=>[p.x*width,p.y*height]),xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]);
 const left=Math.max(0,Math.floor(Math.min(...xs))),right=Math.min(width,Math.ceil(Math.max(...xs))),top=Math.max(0,Math.floor(Math.min(...ys))),bottom=Math.min(height,Math.ceil(Math.max(...ys)+(neckSkin?(Math.max(...ys)-Math.min(...ys))*.65:0)));
 if(right-left<2||bottom-top<2)throw Error('ตรวจขอบใบหน้าสำหรับแต่งหน้าไม่สำเร็จ · เก็บภาพเดิมไว้');
 const feather=Math.max(1,(Math.max(...xs)-Math.min(...xs))*.065),out=new Uint8ClampedArray(natural),weights=new Float32Array(width*height);
 const chin=Math.max(...ys),faceHeight=chin-Math.min(...ys),cx=(Math.min(...xs)+Math.max(...xs))/2,half=(Math.max(...xs)-Math.min(...xs))*.43;
 const isNeck=(x,y)=>{if(!neckSkin||y<chin-faceHeight*.2||y>chin+faceHeight*.65||Math.abs(x-cx)>half)return false;const mx=Math.floor(x/width*neckSkin.width),my=Math.floor(y/height*neckSkin.height);return [2,3].includes(neckSkin.labels[my*neckSkin.width+mx])};
 for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
  const px=x+.5,py=y+.5;let inside=false,distance=Infinity;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
   const [ax,ay]=polygon[j],[bx,by]=polygon[i],dx=bx-ax,dy=by-ay;
   if((ay>py)!==(by>py)&&px<(bx-ax)*(py-ay)/(by-ay)+ax)inside=!inside;
   const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy||1)));
   distance=Math.min(distance,(px-ax-t*dx)**2+(py-ay-t*dy)**2);
  }
  let weight=0;
  if(inside){const t=Math.min(1,Math.sqrt(distance)/feather);weight=t*t*(3-2*t)}
  if(isNeck(px,py)){
   // Feather inward from actual skin boundaries, including the shirt collar.
   let distance=feather;
   const sample=(dx,dy)=>isNeck(Math.max(0,Math.min(width-1,px+dx)),Math.max(0,Math.min(height-1,py+dy)));
   for(let d=1;d<=Math.ceil(feather);d++){
    if(![[-d,0],[d,0],[0,-d],[0,d]].every(([dx,dy])=>sample(dx,dy))){distance=Math.max(0,d-1);break}
   }
   const t=Math.min(1,distance/feather);weight=Math.max(weight,t*t*(3-2*t));
  }
  weights[y*width+x]=weight;
 }
 // Keep the makeup complexion brighter than Natural even if the AI ignored the
 // requested fill. Measure facial midtones only; never derive exposure from clothes.
 let baseSum=0,editSum=0,count=0;
 const luma=(pixels,i)=>pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;
 for(let y=top;y<Math.min(height,chin);y++)for(let x=left;x<right;x++){
  const i=(y*width+x)*4,n=luma(natural,i);
  if(weights[y*width+x]>.9&&natural[i+3]>200&&n>65&&n<225){baseSum+=n;editSum+=luma(makeup,i);count++}
 }
 const mean=count?editSum/count:255,target=count?Math.min(235,baseSum/count+10):255;
 const lift=mean<target?Math.min(.65,(target-mean)/Math.max(1,255-mean)):0;
 for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
  const weight=weights[y*width+x];if(!weight)continue;const index=(y*width+x)*4;
  for(let c=0;c<3;c++){const v=makeup[index+c],bright=v+(255-v)*lift;out[index+c]=Math.round(natural[index+c]+weight*(bright-natural[index+c]))}
 }
 return out;
}

// Also repair stored pairs locally when switching finishes. No AI or credit call.
const sourceCache=new Map();
export async function restrictPairedPortraitMakeup(head,{measureFace,measureSkin=measureMakeupNeckSkin}={}){
 const naturalSource=head.studioSkinBaseSource,makeupSource=head.aiMakeupSource;
 if(!naturalSource||!makeupSource)throw Error('ภาพแต่งหน้าและไม่แต่งหน้ายังไม่พร้อม');
 const key=naturalSource+'|'+makeupSource;
 if(sourceCache.has(key))return {...head,aiMakeupSource:await sourceCache.get(key)};
 const load=source=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('โหลดภาพแต่งหน้าไม่สำเร็จ'));image.src=source});
 const pending=(async()=>{
  const [natural,makeup]=await Promise.all([load(naturalSource),load(makeupSource)]);
  const width=natural.naturalWidth,height=natural.naturalHeight;
  if(makeup.naturalWidth!==width||makeup.naturalHeight!==height)throw Error('ขนาดภาพแต่งหน้าไม่ตรงกับภาพฐาน');
  const face=await measureFace(natural),neckSkin=await measureSkin(natural),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(makeup,0,0);const edited=ctx.getImageData(0,0,width,height).data;
  ctx.clearRect(0,0,width,height);ctx.drawImage(natural,0,0);const frame=ctx.getImageData(0,0,width,height);
  frame.data.set(useAiMakeupPixels({natural:frame.data,makeup:edited,width,height,face:Array.isArray(face)?face:face?.faceLandmarks?.[0],neckSkin}));ctx.putImageData(frame,0,0);
  return canvas.toDataURL('image/png');
 })();
 sourceCache.set(key,pending);
 try{const source=await pending;sourceCache.set(naturalSource+'|'+source,Promise.resolve(source));while(sourceCache.size>8)sourceCache.delete(sourceCache.keys().next().value);return {...head,aiMakeupSource:source}}catch(error){sourceCache.delete(key);throw error}
}
