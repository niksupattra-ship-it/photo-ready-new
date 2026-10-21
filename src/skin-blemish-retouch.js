const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const luminance=(r,g,b)=>r*.2126+g*.7152+b*.0722;
// Bounded colour corrections only; the caller retains native image detail and alpha.
// Dark/ambiguous spots are protected because a local filter cannot identify a mole reliably.
export function skinBlemishField(pixels,width,height,coverage,{radius=Math.max(4,Math.round(width*.012))}={}){
 const count=width*height,stride=width+1,size=stride*(height+1);
 if(pixels.length!==count*4||coverage.length!==count)throw Error('Invalid skin retouch pixels');
 const sums=Array.from({length:4},()=>new Float64Array(size));
 for(let y=0;y<height;y++){
  const row=[0,0,0,0];
  for(let x=0;x<width;x++){
   const i=y*width+x,j=i*4,k=(y+1)*stride+x+1;
   const weight=coverage[i]>.8&&pixels[j+3]>=240?1:0;
   for(let c=0;c<3;c++)row[c]+=pixels[j+c]*weight;row[3]+=weight;
   for(let c=0;c<4;c++)sums[c][k]=sums[c][k-stride]+row[c];
  }
 }
 const average=(x,y,r)=>{
  const x0=Math.max(0,x-r),y0=Math.max(0,y-r),x1=Math.min(width,x+r+1),y1=Math.min(height,y+r+1);
  const a=y0*stride+x0,b=y0*stride+x1,c=y1*stride+x0,d=y1*stride+x1;
  const n=sums[3][d]-sums[3][b]-sums[3][c]+sums[3][a];
  if(n<Math.max(8,(x1-x0)*(y1-y0)*.65))return null;
  return sums.slice(0,3).map(s=>(s[d]-s[b]-s[c]+s[a])/n);
 };
 const protect=new Uint8Array(count),pad=Math.max(1,Math.round(radius*.3));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,j=i*4;if(coverage[i]<.8)continue;
  const m=average(x,y,radius);if(!m)continue;
  if(luminance(...m)-luminance(pixels[j],pixels[j+1],pixels[j+2])>8){
   for(let yy=Math.max(0,y-pad);yy<=Math.min(height-1,y+pad);yy++)for(let xx=Math.max(0,x-pad);xx<=Math.min(width-1,x+pad);xx++)protect[yy*width+xx]=1;
  }
 }
 const out=new Float32Array(count*3);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,j=i*4;if(coverage[i]<.8||pixels[j+3]<240||protect[i])continue;
  const m=average(x,y,radius);if(!m)continue;
  const residual=luminance(...m)-luminance(pixels[j],pixels[j+1],pixels[j+2]);
  if(Math.abs(residual)>24)continue;
  const redExcess=(pixels[j]-pixels[j+1])-(m[0]-m[1]);
  const redBlemish=redExcess>7&&pixels[j]-pixels[j+2]>12&&residual>-18;
  const strength=redBlemish ? .68 : .42;
  for(let c=0;c<3;c++)out[i*3+c]=clamp((m[c]-pixels[j+c])*strength,-10,10)*coverage[i];
 }
 return {deltas:out,protectedPixels:protect};
}
