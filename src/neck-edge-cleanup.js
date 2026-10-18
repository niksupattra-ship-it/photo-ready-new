// Female first-portrait final boundary only. Never change alpha/geometry,
// interior skin, natural broad shadows, makeup, clothing, or upper hair.
const luminance=(p,j)=>p[j]*.2126+p[j+1]*.7152+p[j+2]*.0722;
export function cleanFemaleNeckRim({pixels,width:w,height:h,face,skin,hair}={}){
 const unchanged=()=>({pixels,changed:false});
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>33554432||pixels?.length!==w*h*4||skin?.length!==w*h||hair?.length!==w*h)return unchanged();
 if([152,234,454].some(i=>!Number.isFinite(face?.[i]?.x)||!Number.isFinite(face?.[i]?.y)))return unchanged();
 const fw=Math.hypot((face[454].x-face[234].x)*w,(face[454].y-face[234].y)*h),cx=Math.round(face[152].x*w),chin=face[152].y*h;
 if(fw<64||cx<0||cx>=w)return unchanged();
 const depth=Math.max(1,Math.min(8,Math.round(fw*.008))),step=Math.max(1,Math.round(fw*.003));
 const y0=Math.max(1,Math.floor(chin-fw*.25)),y1=Math.min(h-2,Math.ceil(chin+fw*.65));
 let out=null;
 for(let y=y0;y<=y1;y++){
  const center=(y*w+cx)*4;if(pixels[center+3]<248)continue;
  let left=cx,right=cx;
  while(left>0&&pixels[(y*w+left-1)*4+3]>16)left--;
  while(right<w-1&&pixels[(y*w+right+1)*4+3]>16)right++;
  if(left===0||right===w-1||right-left<fw*.20||right-left>fw*1.08)continue;
  for(const [edge,dir]of [[left,1],[right,-1]]){
   const refs=[];
   for(let k=0;k<4;k++){
    const x=edge+dir*(depth+1+k*step);if(x<=left||x>=right)continue;
    const i=y*w+x,j=i*4;
    if(pixels[j+3]<250||!Number.isFinite(skin[i])||skin[i]<.75||!Number.isFinite(hair[i])||hair[i]>.10)continue;
    refs.push(j);
   }
   if(refs.length<3)continue;
   const values=refs.map(j=>luminance(pixels,j)).sort((a,b)=>a-b),L=values[Math.floor(values.length/2)];
   // Uncertain/shadowed reference or a strong local gradient is not a matte.
   if(L<70||values.at(-1)-values[0]>18)continue;
   const ref=refs.reduce((a,b)=>Math.abs(luminance(pixels,a)-L)<Math.abs(luminance(pixels,b)-L)?a:b);
   for(let d=0;d<depth;d++){
    const x=edge+dir*d,i=y*w+x,j=i*4;if(pixels[j+3]<=16)continue;
    const current=luminance(pixels,j);
    // Only a very dark, narrow contour with continuous opaque skin support.
    // Natural gradual neck shading and normal antialiasing remain untouched.
    if(current>=L*.52||L-current<40)continue;
    const inner=(y*w+x+dir*(depth+1))*4;
    if(pixels[inner+3]<248||luminance(pixels,inner)<L*.78)continue;
    if(!out)out=new Uint8ClampedArray(pixels);
    for(let c=0;c<3;c++)out[j+c]=pixels[ref+c];
   }
  }
 }
 return {pixels:out||pixels,changed:Boolean(out)};
}
