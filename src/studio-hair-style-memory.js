// Session memory of native, already-decoded hair results and manual edits.
// Restore only the head and its hair; current outfit/background/accessories stay.
const belongs=(layer,headId)=>layer.id===headId||(layer.kind==='hair-preview'&&layer.hairHeadId===headId);
const clone=value=>{if(Array.isArray(value))return value.map(clone);if(value&&Object.getPrototypeOf(value)===Object.prototype)return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clone(v)]));return value};
export function createHairStyleMemory(){
 const entries=new Map();
 const key=(head,style,version)=>JSON.stringify([head.id,head.jobId||'',style||'',version||0]);
 return {
  clear(){entries.clear()},
  remember(layers,pixels,headId,style,version){
   const head=layers.find(l=>l.id===headId);if(!head||!pixels)return;
   const selected=layers.filter(l=>belongs(l,headId));if(selected.some(l=>!pixels.has(l.id)))return;
   const k=key(head,style,version);entries.set(k,{layers:selected.map(clone),pixels:new Map(selected.map(l=>[l.id,pixels.get(l.id)]))});
  },
  restore(current,currentPixels,headId,style,version){
   const head=current.find(l=>l.id===headId);if(!head||!currentPixels)return null;
   const saved=entries.get(key(head,style,version));if(!saved)return null;
   const keep=current.filter(l=>!belongs(l,headId)),pixels=new Map(keep.map(l=>[l.id,currentPixels.get(l.id)]));
   if(keep.some(l=>!pixels.get(l.id)))return null;
   const layers=keep.map(clone),restored=saved.layers.map(clone),cachedHead=restored.find(l=>l.id===headId);
   const before=current.slice(0,current.findIndex(l=>l.id===headId)).filter(l=>!belongs(l,headId)).length;
   layers.splice(before,0,...restored);
   for(const [id,pixel]of saved.pixels)pixels.set(id,pixel);
   return {layers,pixels,selectedId:restored.find(l=>l.kind==='hair-preview'&&l.hairRole!=='back')?.id||cachedHead.id};
  }
 };
}
