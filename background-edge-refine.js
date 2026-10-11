// Refine the upscaled matte against native portrait colour. RGB is read only.
// No thresholding, erosion, new segmentation, or portrait resizing.
function boxMean(data,w,h,r){
 const tmp=new Float32Array(data.length),out=new Float32Array(data.length);
 for(let y=0;y<h;y++){
  const row=y*w;let sum=0;for(let x=0;x<=Math.min(w-1,r);x++)sum+=data[row+x];
  for(let x=0;x<w;x++){
   tmp[row+x]=sum/(Math.min(w-1,x+r)-Math.max(0,x-r)+1);
   if(x-r>=0)sum-=data[row+x-r];if(x+r+1<w)sum+=data[row+x+r+1];
  }
 }
 for(let x=0;x<w;x++){
  let sum=0;for(let y=0;y<=Math.min(h-1,r);y++)sum+=tmp[y*w+x];
  for(let y=0;y<h;y++){
   out[y*w+x]=sum/(Math.min(h-1,y+r)-Math.max(0,y-r)+1);
   if(y-r>=0)sum-=tmp[(y-r)*w+x];if(y+r+1<h)sum+=tmp[(y+r+1)*w+x];
  }
 }
 return out;
}
export function refineBackgroundAlpha(alpha,rgb,w,h,matteW=w,matteH=h){
 const n=w*h;if(alpha.length!==n||rgb.length!==n*3)throw Error('ขนาดข้อมูลเก็บขอบไม่ตรงกับภาพ');
 const radius=Math.max(2,Math.min(12,Math.ceil(Math.max(w/matteW,h/matteH)*2)));
 const guide=new Float32Array(n),matte=new Float32Array(n),square=new Float32Array(n),cross=new Float32Array(n);
 for(let i=0;i<n;i++){
  const j=i*3;guide[i]=(.2126*rgb[j]+.7152*rgb[j+1]+.0722*rgb[j+2])/255;
  matte[i]=alpha[i]/255;square[i]=guide[i]*guide[i];cross[i]=guide[i]*matte[i];
 }
 const meanI=boxMean(guide,w,h,radius),meanP=boxMean(matte,w,h,radius),meanII=boxMean(square,w,h,radius),meanIP=boxMean(cross,w,h,radius);
 const slope=new Float32Array(n),offset=new Float32Array(n),epsilon=.0004;
 for(let i=0;i<n;i++){
  slope[i]=(meanIP[i]-meanI[i]*meanP[i])/(Math.max(0,meanII[i]-meanI[i]*meanI[i])+epsilon);
  offset[i]=meanP[i]-slope[i]*meanI[i];
 }
 const a=boxMean(slope,w,h,radius),b=boxMean(offset,w,h,radius),out=Uint8Array.from(alpha);
 for(let i=0;i<n;i++){
  // Keep certain interior/exterior and detached thin strands unchanged.
  if(alpha[i]<=8||alpha[i]>=248)continue;
  const variance=Math.max(0,meanII[i]-meanI[i]*meanI[i]);
  // Low-contrast hair stays soft; high-contrast skin/background follows RGB.
  const confidence=variance/(variance+epsilon*2),fit=Math.max(0,Math.min(1,a[i]*guide[i]+b[i]));
  out[i]=Math.round(255*(matte[i]*(1-confidence)+fit*confidence));
 }
 return out;
}
