// Cache only cosmetic results. A different portrait/base never shares a result.
export function createMakeupLookCache(){
 const portraits=new Map();
 return {
  peek(headId,base,look){const record=portraits.get(headId);return record?.base===base?record.results.get(look):undefined},
  async get(headId,base,look,generate){
   let record=portraits.get(headId);
   if(!record||record.base!==base){record={base,looks:new Map(),results:new Map()};portraits.set(headId,record);while(portraits.size>2)portraits.delete(portraits.keys().next().value)}
   if(record.looks.has(look))return record.looks.get(look);
   const pending=Promise.resolve().then(generate);record.looks.set(look,pending);
   try{const result=await pending;record.results.set(look,result);return result}catch(error){if(record.looks.get(look)===pending)record.looks.delete(look);throw error}
  },
 };
}
export function blendLookIntensity(original,full,percent,destination=null){
 if(original.length!==full.length)throw Error('ขนาดภาพเมคอัพไม่ตรงกัน');
 const strength=Math.max(0,Math.min(1,Number(percent)/100));
 if(!Number.isFinite(strength))throw Error('ความเข้มเมคอัพไม่ถูกต้อง');
 const out=destination||new Uint8ClampedArray(original);if(destination)out.set(original);
 for(let i=0;i<out.length;i+=4){if(!original[i+3])continue;for(let c=0;c<3;c++)out[i+c]=Math.round(original[i+c]*(1-strength)+full[i+c]*strength)}
 return out;
}
import {decodedStudioImage as load} from './studio-image-cache.js';
let decodedPair=null;
export async function mixMakeupLookSources(base,full,percent,previewSurface=null){
 if(Number(percent)===0)return base;if(Number(percent)===100)return full;
 let pair=decodedPair;
 if(!pair||pair.base!==base||pair.full!==full){
  const [original,finished]=await Promise.all([load(base),load(full)]);
  const W=original.naturalWidth||original.width,H=original.naturalHeight||original.height;
  if((finished.naturalWidth||finished.width)!==W||(finished.naturalHeight||finished.height)!==H)throw Error('ขนาดภาพเมคอัพไม่ตรงกัน');
  const read=image=>{const canvas=Object.assign(document.createElement('canvas'),{width:W,height:H}),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);return ctx.getImageData(0,0,W,H).data};
  pair={base,full,W,H,original:read(original),finished:read(finished)};decodedPair=pair;
 }
 const canvas=previewSurface||document.createElement('canvas');if(canvas.width!==pair.W)canvas.width=pair.W;if(canvas.height!==pair.H)canvas.height=pair.H;const ctx=canvas.getContext('2d');
 const image=ctx.createImageData(pair.W,pair.H);blendLookIntensity(pair.original,pair.finished,percent,image.data);ctx.putImageData(image,0,0);
 return canvas; // Encode only at the save/export boundary, never while adjusting.
}
