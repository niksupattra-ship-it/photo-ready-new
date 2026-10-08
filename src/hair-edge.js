// Full-resolution, hair-only operations. Never resize the portrait RGB.
export function clearSourceHairPixels(rgba,hair,skin,faceShield){
 const out=new Uint8ClampedArray(rgba);let cleared=0;
 for(let i=0;i<out.length;i+=4){
  if(hair[i+3]<128||skin[i+3]>64||faceShield[i+3]>0)continue;
  out[i]=out[i+1]=out[i+2]=242;cleared++;
 }
 return {pixels:out,cleared};
}

export function refineHairBoundary(rgba,hair,skin,w,h){
 const out=new Uint8ClampedArray(rgba);
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const i=(y*w+x)*4,a=rgba[i+3];
  // Transparent background, face and neck stay exact. Opaque hair interiors
  // stay exact too; only an outer one-pixel boundary may receive anti-aliasing.
  if(a===0||hair[i+3]<128||skin[i+3]>64)continue;
  let sum=0,min=255,max=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const alpha=rgba[((y+dy)*w+x+dx)*4+3];sum+=alpha;min=Math.min(min,alpha);max=Math.max(max,alpha)}
  if(max-min<24)continue;
  if(a>=250&&min>32)continue;
  // A small local alpha correction, never a broad blur or an eroded haircut.
  const next=Math.max(1,Math.min(255,Math.round(a*.75+(sum/9)*.25)));out[i+3]=next;
  if(a>=250)continue; // Never recolour opaque hair, even at its outer edge.
  // Remove only a narrow coloured matte fringe. Borrow colour from the closest
  // opaque HAIR sample, never from face/neck or background; keep alpha/detail.
  let nearest=-1,best=Infinity;
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
   const xx=x+dx,yy=y+dy;if(xx<0||xx>=w||yy<0||yy>=h)continue;
   const j=(yy*w+xx)*4,d=dx*dx+dy*dy;
   if(d<best&&rgba[j+3]>=250&&hair[j+3]>=128&&skin[j+3]<=64){best=d;nearest=j}
  }
  if(nearest<0)continue;
  const delta=Math.max(...[0,1,2].map(k=>Math.abs(rgba[i+k]-rgba[nearest+k])));
  if(delta<22)continue;
  const mix=Math.min(.65,(1-a/255)*.75);
  for(let k=0;k<3;k++)out[i+k]=Math.round(rgba[i+k]*(1-mix)+rgba[nearest+k]*mix);
 }
 return out;
}
