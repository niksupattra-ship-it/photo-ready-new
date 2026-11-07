// Deterministic skin-only input preparation. No geometry changes or remote API.
export const PRE_AI_SKIN_VERSION='skin-even-full-face-light-v3';
const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
export function blendPreAiSkin(source,detail,tone,mask){
 const out=new Uint8ClampedArray(source);
 for(let i=0;i<source.length;i+=4){
  if(!mask[i+3]||!source[i+3])continue;
  const difference=Math.max(Math.abs(source[i]-detail[i]),Math.abs(source[i+1]-detail[i+1]),Math.abs(source[i+2]-detail[i+2]));
  // Protect moles, dark identifying marks and strong edges from smoothing.
  const edge=Math.exp(-Math.pow(difference/22,4)),weight=Math.max(0,(mask[i+3]-128)/127)*.40*edge;
  for(let k=0;k<3;k++){
   const tonal=Math.max(-8,Math.min(8,(tone[i+k]-detail[i+k])*.24));
   out[i+k]=source[i+k]+weight*(detail[i+k]+tonal-source[i+k]);
  }
 }
 return out;
}
export function preparePreAiSkin(image,skinMask,face){
 const W=image.naturalWidth||image.width,H=image.naturalHeight||image.height;
 const required=[33,263,10,152];
 if(!skinMask||required.some(id=>!Number.isFinite(face?.[id]?.x)||!Number.isFinite(face?.[id]?.y)))throw Error('ตรวจบริเวณผิวก่อนประมวลผลไม่สำเร็จ กรุณาใช้รูปที่เห็นใบหน้าชัดเจน');
 const eyes=Math.hypot((face[33].x-face[263].x)*W,(face[33].y-face[263].y)*H);
 if(eyes<20)throw Error('ใบหน้าเล็กเกินไปสำหรับปรับผิวก่อนประมวลผล');
 const source=canvas(W,H),ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
 const scale=Math.min(1,1280/Math.max(W,H)),w=Math.max(1,Math.round(W*scale)),h=Math.max(1,Math.round(H*scale));
 const small=canvas(w,h),sc=small.getContext('2d');sc.drawImage(image,0,0,w,h);
 const blurred=canvas(W,H),bc=blurred.getContext('2d',{willReadFrequently:true});
 const low=canvas(w,h),lc=low.getContext('2d');
 lc.filter=`blur(${Math.max(.7,eyes*scale*.012)}px)`;lc.drawImage(small,0,0);bc.drawImage(low,0,0,W,H);
 const detail=bc.getImageData(0,0,W,H).data;
 lc.clearRect(0,0,w,h);lc.filter=`blur(${Math.max(2,eyes*scale*.07)}px)`;lc.drawImage(small,0,0);bc.clearRect(0,0,W,H);bc.drawImage(low,0,0,W,H);
 const tone=bc.getImageData(0,0,W,H).data;
 const safe=canvas(W,H),mc=safe.getContext('2d',{willReadFrequently:true});
 mc.drawImage(skinMask,0,0,W,H);
 // Erode skin labels before feathering so hair, garment and jaw edges stay clear.
 mc.globalCompositeOperation='destination-in';
 for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]])mc.drawImage(skinMask,dx*eyes*.025,dy*eyes*.025,W,H);
 const extent=canvas(W,H),ec=extent.getContext('2d');ec.fillStyle='white';
 const cx=(face[33].x+face[263].x)*W/2,top=face[10].y*H,bottom=Math.min(H,face[152].y*H+eyes*1.5);
 ec.fillRect(cx-eyes*1.05,top,eyes*2.1,Math.max(0,bottom-top));mc.drawImage(extent,0,0);
 // Smooth continuously across all labelled facial skin, including eyelids,
 // under-eyes, between/around brows and nose. No rectangular feature holes.
 // Pixel-level edge weights preserve dark feature edges and identifying marks.
 // Feather inward only: the original eroded mask bounds every changed pixel.
 const feather=canvas(W,H),fc=feather.getContext('2d');fc.filter=`blur(${Math.max(1,eyes*.02)}px)`;fc.drawImage(safe,0,0);mc.globalCompositeOperation='destination-in';mc.drawImage(feather,0,0);
 const pixels=ctx.getImageData(0,0,W,H);pixels.data.set(blendPreAiSkin(pixels.data,detail,tone,mc.getImageData(0,0,W,H).data));ctx.putImageData(pixels,0,0);
 for(const c of [small,blurred,low,safe,extent,feather]){c.width=1;c.height=1}
 return source;
}
