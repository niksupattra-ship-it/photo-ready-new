// Conservative pixel evidence only. This does not classify a hairstyle or
// guarantee a reference match. No pixels or credits are changed here.
export function inspectPortraitGarments({pixels,clothing,width,height,chinY,faceWidth}){
 if(!Number.isFinite(chinY)||!Number.isFinite(faceWidth)||faceWidth<8||pixels?.length!==width*height*4||clothing?.length!==pixels.length)return {measurable:false};
 let garment=0,foreground=0;
 for(let y=Math.max(0,Math.ceil(chinY));y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4+3;if(pixels[i]<240)continue;foreground++;
  if(clothing[i]>=240)garment++;
 }
 return {measurable:true,garment,foreground,retained:garment>Math.max(24,faceWidth*faceWidth*.08)&&garment/Math.max(1,foreground)>.04};
}
export function inspectUnchangedPortraitHair(original,result){
 const n=original?.pixels?.length;
 if(!n||n!==result?.pixels?.length||original.hair?.length!==n||result.hair?.length!==n)return {measurable:false};
 let union=0,overlap=0,delta=0,changed=0;
 for(let i=0;i<n;i+=4){
  const a=original.pixels[i+3]>=240&&original.hair[i+3]>=240,b=result.pixels[i+3]>=240&&result.hair[i+3]>=240;
  if(a||b)union++;if(!a||!b)continue;overlap++;
  const d=(Math.abs(original.pixels[i]-result.pixels[i])+Math.abs(original.pixels[i+1]-result.pixels[i+1])+Math.abs(original.pixels[i+2]-result.pixels[i+2]))/3;
  delta+=d;if(d>6)changed++;
 }
 if(overlap<128)return {measurable:false};
 const iou=overlap/Math.max(1,union),meanDelta=delta/overlap,changedFraction=changed/overlap;
 return {measurable:true,iou,meanDelta,changedFraction,unchanged:iou>=.98&&meanDelta<=2&&changedFraction<=.01};
}
