// Legacy paired layers must be split in native pixels, not workspace pixels.
export function splitNativeCollarParts(image,make){
 const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<2||h<1)throw Error('ขนาดภาพเข็มปกคอไม่ถูกต้อง');
 const split=Math.floor(w/2),left=make(w,h),right=make(w,h);
 left.getContext('2d').drawImage(image,0,0,split,h,0,0,split,h);
 right.getContext('2d').drawImage(image,split,0,w-split,h,split,0,w-split,h);
 return {left,right};
}
