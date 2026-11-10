import {decodedStudioImage} from './studio-image-cache.js';
// Return a reusable layer mask, leaving the full AI portrait and both finishes
// intact. Equal edge alpha must stay equal rather than being multiplied twice.
export function manualOutfitAlphaMask(original,cleaned){
 if(original.length!==cleaned.length||original.length%4)throw Error('Portrait mask dimensions do not match');
 const mask=new Uint8ClampedArray(original.length);
 for(let i=0;i<mask.length;i+=4){mask[i]=mask[i+1]=mask[i+2]=255;mask[i+3]=original[i+3]?Math.min(255,Math.round(cleaned[i+3]*255/original[i+3])):0}
 return mask;
}
export function maskManualOutfitPortrait(layers,id,mask){
 return layers.map(l=>l.id===id?{...l,mask,manualOutfitMask:mask,manualOutfitPreviousMask:l.manualOutfitMask?l.manualOutfitPreviousMask:l.mask||null}:l);
}
export function restoreManualOutfitPortrait(layers){
 return layers.map(l=>{if(!l.manualOutfitMask)return l;const next={...l,mask:l.manualOutfitPreviousMask||null};delete next.manualOutfitMask;delete next.manualOutfitPreviousMask;return next});
}

export async function composeManualOutfitMask(base,previous){
 if(!previous)return base;
 const image=await decodedStudioImage(base),mask=await decodedStudioImage(previous);
 const c=Object.assign(document.createElement('canvas'),{width:image.naturalWidth||image.width,height:image.naturalHeight||image.height}),x=c.getContext('2d');
 try{x.drawImage(image,0,0);x.globalCompositeOperation='destination-in';x.drawImage(mask,0,0,c.width,c.height);return c.toDataURL('image/png')}
 finally{c.width=c.height=1}
}
