// A conservative finish for the INTERNAL hair/forehead seam only.
// No geometry transform, source-face paste, alpha change or image resizing.
export function blendHairlineSeam(pixels,hair,skin,w,h,region){
 if(pixels.length!==w*h*4||hair.length!==w*h||skin.length!==w*h)return null;
 const {left,right,top,bottom,faceWidth}=region;
 if(![left,right,top,bottom,faceWidth].every(Number.isFinite)||faceWidth<=0)return null;
 const radius=Math.max(2,Math.min(10,Math.round(faceWidth*.012)));
 const out=new Uint8ClampedArray(pixels);
 let changed=0;
 const directions=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
 for(let y=Math.max(0,Math.ceil(top));y<Math.min(h,Math.floor(bottom));y++)for(let x=Math.max(0,Math.ceil(left));x<Math.min(w,Math.floor(right));x++){
  const n=y*w+x,i=n*4;
  if(pixels[i+3]<248||(!hair[n]&&!skin[n]))continue;
  let distance=Infinity,opposite=0;
  // Find a hair-to-skin junction, never an outer hair/background edge.
  for(const [dx,dy] of directions)for(let r=1;r<=radius;r++){
   const xx=x+dx*r,yy=y+dy*r;
   if(xx<left||xx>=right||yy<top||yy>=bottom||xx<0||xx>=w||yy<0||yy>=h)break;
   const q=yy*w+xx;
   if(pixels[q*4+3]<248)break;
   if((hair[n]&&skin[q])||(skin[n]&&hair[q])){distance=Math.min(distance,r);opposite++;break}
  }
  if(!opposite||distance>radius)continue;
  const sum=[0,0,0];let count=0,hasHair=false,hasSkin=false;
  // Small, native-resolution samples gently soften a hard colour step.
  // Original fine texture remains dominant; correction is strictly bounded.
  for(const [dx,dy] of directions){
   const xx=x+dx*radius,yy=y+dy*radius;
   if(xx<left||xx>=right||yy<top||yy>=bottom||xx<0||xx>=w||yy<0||yy>=h)continue;
   const q=yy*w+xx,j=q*4;
   if(pixels[j+3]<248||(!hair[q]&&!skin[q]))continue;
   hasHair ||= !!hair[q];hasSkin ||= !!skin[q];count++;
   for(let c=0;c<3;c++)sum[c]+=pixels[j+c];
  }
  if(!count||!hasHair||!hasSkin)continue;
  const edgeWeight=.28*(1-distance/(radius+1))**2;
  for(let c=0;c<3;c++){
   const delta=Math.max(-10,Math.min(10,(sum[c]/count-pixels[i+c])*edgeWeight));
   const value=Math.round(pixels[i+c]+delta);
   if(value!==out[i+c])changed++;
   out[i+c]=value;
  }
 }
 return changed?out:null;
}
