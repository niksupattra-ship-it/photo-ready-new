export const isSingleFemaleHair=id=>id==='hair-18'||/^hair-2[1-9]$/.test(id);
export const isSingleLayerHair=id=>isSingleFemaleHair(id)||/^manhair-(0[1-9]|1[0-2])$/.test(id);

// Erase ONLY original hair beyond the upper/side OUTER hairstyle silhouette.
// This changes its reversible eraser mask, never portrait or hairstyle RGB.
export function originalHairExcessMask(originalHair,coverage,skin,w,h,makeCanvas,{softOuter=false}={}){
 if(!originalHair||!coverage||!skin)throw Error('ตรวจผมส่วนเกินไม่สำเร็จ · เก็บภาพเดิมไว้');
 const hair=originalHair.getContext('2d').getImageData(0,0,w,h).data;
 const fitted=coverage.getContext('2d').getImageData(0,0,w,h).data;
 const protectedSkin=skin.getContext('2d').getImageData(0,0,w,h).data;
 // Use the OUTER silhouette, not transparent holes in the hairstyle PNG.
 // A row span protects the complete interior, including forehead/ears/neck.
 const left=new Float32Array(h),right=new Float32Array(h);left.fill(w);right.fill(-1);
 let top=h,bottom=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(fitted[(y*w+x)*4+3]>8){left[y]=Math.min(left[y],x);right[y]=Math.max(right[y],x);top=Math.min(top,y);bottom=Math.max(bottom,y)}
 if(bottom<0)throw Error('ไม่พบขอบทรงผม · เก็บภาพเดิมไว้');
 // Bridge blank interior rows conservatively; never treat a hole as excess.
 for(let y=top;y<=bottom;y++)if(right[y]<0){
  let above=y-1,below=y+1;while(above>=top&&right[above]<0)above--;while(below<=bottom&&right[below]<0)below++;
  left[y]=Math.min(above>=top?left[above]:w,below<=bottom?left[below]:w);
  right[y]=Math.max(above>=top?right[above]:-1,below<=bottom?right[below]:-1);
 }
 const margin=softOuter?0:Math.max(2,Math.max(w,h)*.002),fade=Math.max(softOuter?4:2,Math.max(w,h)*(softOuter?.003:.002));
 const out=makeCanvas(w,h),ctx=out.getContext('2d'),mask=ctx.createImageData(w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4;mask.data[j]=mask.data[j+1]=mask.data[j+2]=255;
  let distance=0;
  if(y<top)distance=top-y;
  else if(y<=bottom)distance=Math.max(left[y]-x,x-right[y]);
  // Below the hairstyle, and everywhere inside its enclosing silhouette,
  // preserve all original pixels regardless of the hair classifier's guess.
  const t=Math.max(0,Math.min(1,(distance-margin)/fade));
  const erase=protectedSkin[j+3]===0&&hair[j+3]>=128?t*t*(3-2*t)*hair[j+3]/255:0;
  mask.data[j+3]=Math.round(255*(1-erase));
 }
 ctx.putImageData(mask,0,0);return out;
}

// Native alpha brush footprint for male hair: destination-out, not a clipping mask.
// Only classified original hair OUTSIDE the overlay is eligible; skin stays protected.
export function originalHairOuterEraser(originalHair,coverage,skin,w,h,makeCanvas){
 const out=originalHairExcessMask(originalHair,coverage,skin,w,h,makeCanvas,{softOuter:true});
 const ctx=out.getContext('2d'),pixels=ctx.getImageData(0,0,w,h);
 for(let j=3;j<pixels.data.length;j+=4)pixels.data[j]=255-pixels.data[j];
 ctx.putImageData(pixels,0,0);return out;
}
