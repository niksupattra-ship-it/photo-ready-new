// A completed clothed AI portrait already contains its outfit and hair.
// Replace the entire previous generated scene, including orphan attachments,
// while retaining native outfit choices (hidden) and the selected background.
export function replaceFullBodyPortraitLayers(layers,portrait,kindOf=layer=>layer.kind){
 if(!portrait?.source)throw Error('ไม่ได้รับภาพที่ประมวลผลแล้ว');
 const removed=new Set(layers.filter(layer=>['head','source-photo','hair-preview','collar','chest','ribbon'].includes(kindOf(layer))).map(layer=>layer.id).filter(Boolean));
 let changed=true;
 while(changed){changed=false;for(const layer of layers)if(layer.hairHeadId&&removed.has(layer.hairHeadId)&&!removed.has(layer.id)){removed.add(layer.id);changed=true}}
 const next=layers.filter(layer=>!['head','source-photo','hair-preview','collar','chest','ribbon'].includes(kindOf(layer))&&!removed.has(layer.id)&&!layer.hairHeadId).map(layer=>kindOf(layer)==='suit'?{...layer,visible:false}:layer);
 const index=next.findIndex(layer=>kindOf(layer)==='suit');
 next.splice(index<0?next.length:index,0,portrait);
 return next;
}
