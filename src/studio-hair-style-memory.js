// Session-local style snapshots. Keep only this head and its hair, never
// restore the outfit/background/other layers from an older hairstyle.
export function createHairStyleMemory(){
 const heads=new Map();
 const origin=head=>[head.jobId||'',head.processedOriginalSource||head.hairOriginalSource||head.source,JSON.stringify(head.makeupStyles||{})];
 const scope=head=>{const key=origin(head),old=heads.get(head.id);if(old&&old.key.every((v,i)=>v===key[i]))return old;const value={key,styles:new Map()};heads.set(head.id,value);return value};
 return {
  clear:()=>heads.clear(),
  remember(layers,pixelMap,headId,id,version){
   const head=layers.find(l=>l.id===headId);if(!head||!pixelMap)return;
   const selected=layers.filter(l=>l.id===headId||l.kind==='hair-preview'&&l.hairHeadId===headId);
   if(selected.some(l=>!pixelMap.has(l.id)))return;
   scope(head).styles.set(id||'',{version,layers:selected.map(l=>({...l})),pixels:new Map(selected.map(l=>[l.id,pixelMap.get(l.id)]))});
  },
  restore(layers,pixelMap,headId,id,version){
   const head=layers.find(l=>l.id===headId);if(!head||!pixelMap)return null;
   const saved=scope(head).styles.get(id||'');if(!saved||saved.version!==version)return null;
   const oldHead=saved.layers.find(l=>l.id===headId),hairs=saved.layers.filter(l=>l.id!==headId).map(l=>({...l}));
   const restoredHead={...oldHead,id:head.id,jobId:head.jobId,x:head.x,y:head.y,scale:head.scale,rotation:head.rotation,squeezeX:head.squeezeX,squeezeY:head.squeezeY,visible:head.visible,locked:head.locked,outputUnlocked:head.outputUnlocked,restrictedTrial:head.restrictedTrial,fullEditUnlocked:head.fullEditUnlocked};
   const next=layers.filter(l=>l.id!==headId&&!(l.kind==='hair-preview'&&l.hairHeadId===headId));
   const index=layers.slice(0,layers.findIndex(l=>l.id===headId)).filter(l=>!(l.kind==='hair-preview'&&l.hairHeadId===headId)).length;
   next.splice(index,0,...hairs.filter(l=>l.hairRole==='back'),restoredHead,...hairs.filter(l=>l.hairRole!=='back'));
   const pixels=new Map(next.map(l=>[l.id,saved.pixels.get(l.id)||pixelMap.get(l.id)]));
   if(next.length>20||next.some(l=>!pixels.get(l.id)))return null;
   return {layers:next,pixels,selectedId:hairs.find(l=>l.hairRole!=='back')?.id||headId};
  }
 };
}
