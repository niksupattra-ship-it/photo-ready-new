// A coherent AI portrait replaces the pixels of the existing head, keeping its ID.
// Discard attachments belonging to that head, including older rear-hair kinds.
export function replaceHairstyleLayer(layers,headId,replacement){
 if(!layers.some(layer=>layer.id===headId))throw Error('ไม่พบเลเยอร์หัว');
 if(!replacement?.source)throw Error('ไม่ได้รับภาพทรงผม');
 const obsolete=new Set([headId]);
 let changed=true;
 while(changed){changed=false;for(const layer of layers)if(layer.hairHeadId&&obsolete.has(layer.hairHeadId)&&!obsolete.has(layer.id)){obsolete.add(layer.id);changed=true}}
 return layers.filter(layer=>layer.id===headId||!obsolete.has(layer.id)).map(layer=>layer.id===headId?{...replacement,id:headId,processedOriginalSource:replacement.source,mask:null,warpSource:null,warpBaseMask:null,eraseRestoreSource:null,warpRestoreBase:null}:layer);
}
