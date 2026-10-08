// Cache only cosmetic results. A different portrait/base never shares a result.
export function createMakeupLookCache(){
 const portraits=new Map();
 return {
  async get(headId,base,look,generate){
   let record=portraits.get(headId);
   if(!record||record.base!==base){record={base,looks:new Map()};portraits.set(headId,record);while(portraits.size>2)portraits.delete(portraits.keys().next().value)}
   if(record.looks.has(look))return record.looks.get(look);
   const pending=Promise.resolve().then(generate);record.looks.set(look,pending);
   try{return await pending}catch(error){if(record.looks.get(look)===pending)record.looks.delete(look);throw error}
  },
 };
}
export function blendLookIntensity(original,full,percent){
 if(original.length!==full.length)throw Error('ขนาดภาพเมคอัพไม่ตรงกัน');
 const strength=Math.max(0,Math.min(1,Number(percent)/100));
 if(!Number.isFinite(strength))throw Error('ความเข้มเมคอัพไม่ถูกต้อง');
 const out=new Uint8ClampedArray(original);
 for(let i=0;i<out.length;i+=4){if(!original[i+3])continue;for(let c=0;c<3;c++)out[i+c]=Math.round(original[i+c]*(1-strength)+full[i+c]*strength)}
 return out;
}
const load=source=>new Promise((ok,bad)=>{const image=new Image();image.onload=()=>ok(image);image.onerror=()=>bad(Error('อ่านภาพเมคอัพไม่สำเร็จ'));image.src=source});
let decodedPair=null;
export async function mixMakeupLookSources(base,full,percent){
 if(Number(percent)===0)return base;if(Number(percent)===100)return full;
 let pair=decodedPair;
 if(!pair||pair.base!==base||pair.full!==full){
  const [original,finished]=await Promise.all([load(base),load(full)]);
  const W=original.naturalWidth,H=original.naturalHeight;
  if(finished.naturalWidth!==W||finished.naturalHeight!==H)throw Error('ขนาดภาพเมคอัพไม่ตรงกัน');
  const read=image=>{const canvas=Object.assign(document.createElement('canvas'),{width:W,height:H}),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);return ctx.getImageData(0,0,W,H).data};
  pair={base,full,W,H,original:read(original),finished:read(finished)};decodedPair=pair;
 }
 const canvas=Object.assign(document.createElement('canvas'),{width:pair.W,height:pair.H}),ctx=canvas.getContext('2d');
 const image=ctx.createImageData(pair.W,pair.H);image.data.set(blendLookIntensity(pair.original,pair.finished,percent));ctx.putImageData(image,0,0);
 return canvas.toDataURL('image/png');
}
