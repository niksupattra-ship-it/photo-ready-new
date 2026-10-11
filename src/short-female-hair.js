export const isSingleFemaleHair=id=>id==='hair-18'||/^hair-2[1-9]$/.test(id);
export const isSingleLayerHair=id=>isSingleFemaleHair(id)||/^manhair-(0[1-9]|1[0-2])$/.test(id);

// Erase ONLY original portrait hair visible outside the fitted PNG.
// This changes its reversible eraser mask, never portrait or hairstyle RGB.
export function originalHairExcessMask(originalHair,coverage,skin,w,h,makeCanvas){
 if(!originalHair||!coverage||!skin)throw Error('ตรวจผมส่วนเกินไม่สำเร็จ · เก็บภาพเดิมไว้');
 const hair=originalHair.getContext('2d').getImageData(0,0,w,h).data;
 const fitted=coverage.getContext('2d').getImageData(0,0,w,h).data;
 const protectedSkin=skin.getContext('2d').getImageData(0,0,w,h).data;
 const excess=makeCanvas(w,h),ec=excess.getContext('2d'),ed=ec.createImageData(w,h);
 for(let i=0;i<w*h;i++){const j=i*4;ed.data[j]=ed.data[j+1]=ed.data[j+2]=255;ed.data[j+3]=Math.round(hair[j+3]*(1-fitted[j+3]/255)*(1-protectedSkin[j+3]/255))}
 ec.putImageData(ed,0,0);
 const soft=makeCanvas(w,h),sx=soft.getContext('2d');sx.filter='blur(1px)';sx.drawImage(excess,0,0);
 const sd=sx.getImageData(0,0,w,h).data,out=makeCanvas(w,h),ctx=out.getContext('2d'),mask=ctx.createImageData(w,h);
 for(let i=0;i<w*h;i++){const j=i*4;mask.data[j]=mask.data[j+1]=mask.data[j+2]=255;mask.data[j+3]=Math.round(255-Math.max(sd[j+3],ed.data[j+3])*(1-fitted[j+3]/255)*(1-protectedSkin[j+3]/255))}
 ctx.putImageData(mask,0,0);return out;
}
