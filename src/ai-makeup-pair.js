// Restrict AI edits to the detected face, with an inward feather. Everything
// outside that outline is copied byte-for-byte from Natural, including alpha.
export const MAKEUP_FACE_OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
export function useAiMakeupPixels({natural,makeup,width,height,face}){
 const length=width*height*4;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||natural.length!==length||makeup.length!==length)throw Error('ขนาดภาพแต่งหน้าไม่ตรงกับภาพฐาน');
 const points=MAKEUP_FACE_OVAL.map(i=>face?.[i]);
 if(points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('ตรวจขอบใบหน้าสำหรับแต่งหน้าไม่สำเร็จ · เก็บภาพเดิมไว้');
 const polygon=points.map(p=>[p.x*width,p.y*height]),xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]);
 const left=Math.max(0,Math.floor(Math.min(...xs))),right=Math.min(width,Math.ceil(Math.max(...xs))),top=Math.max(0,Math.floor(Math.min(...ys))),bottom=Math.min(height,Math.ceil(Math.max(...ys)));
 if(right-left<2||bottom-top<2)throw Error('ตรวจขอบใบหน้าสำหรับแต่งหน้าไม่สำเร็จ · เก็บภาพเดิมไว้');
 const feather=Math.max(1,(Math.max(...xs)-Math.min(...xs))*.065),out=new Uint8ClampedArray(natural);
 for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
  const px=x+.5,py=y+.5;let inside=false,distance=Infinity;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
   const [ax,ay]=polygon[j],[bx,by]=polygon[i],dx=bx-ax,dy=by-ay;
   if((ay>py)!==(by>py)&&px<(bx-ax)*(py-ay)/(by-ay)+ax)inside=!inside;
   const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy||1)));
   distance=Math.min(distance,(px-ax-t*dx)**2+(py-ay-t*dy)**2);
  }
  if(!inside)continue;
  const t=Math.min(1,Math.sqrt(distance)/feather),weight=t*t*(3-2*t),index=(y*width+x)*4;
  for(let c=0;c<3;c++)out[index+c]=Math.round(natural[index+c]+weight*(makeup[index+c]-natural[index+c]));
 }
 return out;
}

// Also repair stored pairs locally when switching finishes. No AI or credit call.
const sourceCache=new Map();
export async function restrictPairedPortraitMakeup(head,{measureFace}={}){
 const naturalSource=head.studioSkinBaseSource,makeupSource=head.aiMakeupSource;
 if(!naturalSource||!makeupSource)throw Error('ภาพแต่งหน้าและไม่แต่งหน้ายังไม่พร้อม');
 const key=naturalSource+'|'+makeupSource;
 if(sourceCache.has(key))return {...head,aiMakeupSource:await sourceCache.get(key)};
 const load=source=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('โหลดภาพแต่งหน้าไม่สำเร็จ'));image.src=source});
 const pending=(async()=>{
  const [natural,makeup]=await Promise.all([load(naturalSource),load(makeupSource)]);
  const width=natural.naturalWidth,height=natural.naturalHeight;
  if(makeup.naturalWidth!==width||makeup.naturalHeight!==height)throw Error('ขนาดภาพแต่งหน้าไม่ตรงกับภาพฐาน');
  const face=await measureFace(natural),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(makeup,0,0);const edited=ctx.getImageData(0,0,width,height).data;
  ctx.clearRect(0,0,width,height);ctx.drawImage(natural,0,0);const frame=ctx.getImageData(0,0,width,height);
  frame.data.set(useAiMakeupPixels({natural:frame.data,makeup:edited,width,height,face:Array.isArray(face)?face:face?.faceLandmarks?.[0]}));ctx.putImageData(frame,0,0);
  return canvas.toDataURL('image/png');
 })();
 sourceCache.set(key,pending);
 try{const source=await pending;sourceCache.set(naturalSource+'|'+source,Promise.resolve(source));while(sourceCache.size>8)sourceCache.delete(sourceCache.keys().next().value);return {...head,aiMakeupSource:source}}catch(error){sourceCache.delete(key);throw error}
}
