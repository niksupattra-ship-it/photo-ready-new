// Neck space is measured against this garment's upper collar and supported
// shoulder line. A low tie/V opening is never used as the neck endpoint.
export function garmentNeckBalance(pixels,width,height,uniform,headHeight){
 const span=uniform.shoulderWidth,collar=uniform.collarTopY;
 let shoulder=null;
 if(pixels?.length===width*height*4){
  const {l,r,t,b}=uniform.bounds;
  for(let y=t;y<=Math.min(b,Math.floor(t+span*.4));y++){
   let left=width,right=-1,count=0;
   for(let x=l;x<=r;x++)if(pixels[(y*width+x)*4+3]>128){left=Math.min(left,x);right=x;count++}
   if(right-left>=span*.85&&count>=span*.4){shoulder=y;break}
  }
 }
 const raw=shoulder===null?span*.025:headHeight*.27-(shoulder-collar);
 const gap=Math.max(span*.012,Math.min(span*.045,raw));
 return {gap,collarY:collar,shoulderY:shoulder,reason:shoulder===null?'collar_fallback':'garment_shoulders'};
}
