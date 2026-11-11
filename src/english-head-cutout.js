// Keep original RGB/detail. Only remove obsolete clothing outside the retained
// head/neck. No neck warp, rectangular skin fill or face resampling.
export function englishHeadCutoutAlpha(pixels,width,height,face,labels){
 if(pixels.length!==width*height*4||![10,152,234,454].every(id=>Number.isFinite(face?.[id]?.x)&&Number.isFinite(face?.[id]?.y)))throw Error('Invalid head cutout geometry.');
 const fw=Math.hypot((face[454].x-face[234].x)*width,(face[454].y-face[234].y)*height),chin=face[152].y*height,cx=(face[234].x+face[454].x)*width/2,alpha=new Uint8ClampedArray(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,cat=labels?.data?.[Math.min(labels.height-1,Math.floor(y*labels.height/height))*labels.width+Math.min(labels.width-1,Math.floor(x*labels.width/width))];
  let keep=true;
  if(y>chin){
   if(cat===4||cat===0)keep=false;
   // A broad rounded base safely covers open collars, but never retains an old
   // torso. Hair retains its selected side/back silhouette independently.
   if(cat!==1){
    const dx=Math.abs(x-cx)/(fw*1.05);
    const bottom=chin+fw*(.70+.30*Math.sqrt(Math.max(0,1-dx*dx)));
    if(dx>1||y>bottom)keep=false;
   }
  }
  alpha[i]=keep?pixels[i*4+3]:0;
 }
 return alpha;
}

// Garment-aware alpha only. Above the actual collar the original neck contour
// is untouched. Below it, skin ends behind the garment's measured outer rows;
// selected long hair is exempt. There is no rectangular neck-width crop.
export function englishNeckClipAlpha({width,height,labels,chinY,uniform,uniformPixels,headFrame,garmentFrame}){
 const rows=[];
 for(let y=0;y<uniform.height;y++){let l=uniform.width,r=-1;for(let x=0;x<uniform.width;x++)if(uniformPixels[(y*uniform.width+x)*4+3]>96){l=Math.min(l,x);r=x}rows.push({l,r});}
 const mask=new Uint8ClampedArray(width*height).fill(255),gs=garmentFrame.w/uniform.width,hs=headFrame.w/width;
 for(let y=Math.max(0,Math.ceil(chinY));y<height;y++){
  const uy=Math.floor((headFrame.y+y*hs-garmentFrame.y)/gs);if(uy<uniform.collarTopY||uy>=uniform.height)continue;
  const row=rows[uy];if(row.r<row.l)continue;
  // The first collar tip can be asymmetric. Never crop the supporting neck to
  // a one-pixel interval while the other collar side has not started yet.
  const left=Math.min(row.l,uniform.centerX-uniform.shoulderWidth*.075),right=Math.max(row.r,uniform.centerX+uniform.shoulderWidth*.075);
  for(let x=0;x<width;x++){
   const cat=labels?.data?.[Math.min(labels.height-1,Math.floor(y*labels.height/height))*labels.width+Math.min(labels.width-1,Math.floor(x*labels.width/width))];if(cat===1)continue;
   const ux=(headFrame.x+x*hs-garmentFrame.x)/gs;
   if(ux<left-1.5/gs||ux>right+1.5/gs)mask[y*width+x]=0;
  }
 }
 return mask;
}
