// Display-only garment previews. They never enter editor state, history or export.
import sources from './uniform-quick-previews.json' with {type:'json'};
import {decodedStudioImage} from './studio-image-cache.js';
const ready=new Map(),pending=new Map(),LIMIT=12;
export const suitPreviewSource=template=>sources[template]||null;
export const readSuitPreview=template=>ready.get(template)||null;
export function warmSuitPreview(template){
 const source=suitPreviewSource(template);if(!source)return Promise.resolve(null);
 if(ready.has(template)){const image=ready.get(template);ready.delete(template);ready.set(template,image);return Promise.resolve(image)}
 if(pending.has(template))return pending.get(template);
 const request=decodedStudioImage(source).then(image=>{ready.set(template,image);while(ready.size>LIMIT)ready.delete(ready.keys().next().value);return image}).finally(()=>pending.delete(template));
 pending.set(template,request);return request;
}
export function createSuitDisplayPreview(target,option,image,placement){
 const frame=target?.sourceFrame||target?.collarFrame||(placement?{x:placement.uX/placement.W*900,y:placement.uY/placement.H*1200,w:placement.uW/placement.W*900,h:placement.uH/placement.H*1200}:{x:0,y:0,w:900,h:1200});
 const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
 const mask=Object.assign(document.createElement('canvas'),{width,height}),buffer=document.createElement('canvas');
 const ctx=mask.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
 const layer={x:0,y:0,scale:1,rotation:0,opacity:1,...target,id:target?.id||'temporary-suit-preview',kind:'suit',name:'ชุด',source:image,sourceFrame:frame,collarFrame:target?.collarFrame||frame,neckWidth:0,neckHeight:0,visible:true,assetId:option.id,templatePath:option.template};
 return {layer,asset:{original:image,sourceFrame:frame,mask,buffer,dirty:true},release(){mask.width=1;mask.height=1;buffer.width=1;buffer.height=1}};
}
export function createSuitPreviewRequest(){
 let cancel;const cancelled=Symbol('cancelled'),signal=new Promise(resolve=>{cancel=()=>resolve(cancelled)});
 return {phase:'loading',preview:null,cancel,async wait(promise){const value=await Promise.race([promise,signal]);if(value===cancelled)throw Object.assign(Error('Replaced by another suit'),{code:'SUIT_SELECTION_REPLACED'});return value}};
}
