// Display-only garment previews. They never enter editor state, history or export.
import sources from './uniform-quick-previews.json' with {type:'json'};
import {decodedStudioImage} from './studio-image-cache.js';
const ready=new Map(),pending=new Map(),LIMIT=12;
export const suitPreviewSource=template=>sources[template]||null;
export const readSuitPreview=template=>ready.get(template)||null;
export function rememberSuitPreview(template,image){
 const source=suitPreviewSource(template);if(!source||!image?.naturalWidth||image.src!==new URL(source,document.baseURI).href)return;
 ready.delete(template);ready.set(template,image);while(ready.size>LIMIT)ready.delete(ready.keys().next().value);
}
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
 // A catalog DOM image's .width can be its 96px layout width. The painter
 // consumes native dimensions, so freeze the complete decoded thumbnail first.
 const original=Object.assign(document.createElement('canvas'),{width,height});original.getContext('2d').drawImage(image,0,0,width,height);
 const mask=Object.assign(document.createElement('canvas'),{width,height}),buffer=document.createElement('canvas');
 const ctx=mask.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
 const layer={x:0,y:0,scale:1,rotation:0,opacity:1,...target,id:target?.id||'temporary-suit-preview',kind:'suit',name:'ชุด',source:image,sourceFrame:frame,collarFrame:target?.collarFrame||frame,neckWidth:0,neckHeight:0,visible:true,assetId:option.id,templatePath:option.template};
 return {layer,asset:{original,sourceFrame:frame,mask,buffer,dirty:true},release(){for(const c of [original,mask,buffer])c.width=c.height=1}};
}
export function createSuitPreviewRequest(){
 let cancel;const cancelled=Symbol('cancelled'),signal=new Promise(resolve=>{cancel=()=>resolve(cancelled)});
 return {phase:'loading',preview:null,cancel,async wait(promise){const value=await Promise.race([promise,signal]);if(value===cancelled)throw Object.assign(Error('Replaced by another suit'),{code:'SUIT_SELECTION_REPLACED'});return value}};
}

// Optional native prefetch. First feedback must not wait for this cache:
// a decoded catalog garment can paint while native pixels load separately.
const nativeReady=new Map(),nativePending=new Map(),NATIVE_LIMIT=32*1024*1024;
export const readNativeSuitPreview=template=>nativeReady.get(template)||null;
export function warmNativeSuitPreview(template){
 if(!template)return Promise.resolve(null);
 if(nativeReady.has(template)){const image=nativeReady.get(template);nativeReady.delete(template);nativeReady.set(template,image);return Promise.resolve(image)}
 if(nativePending.has(template))return nativePending.get(template);
 const request=decodedStudioImage(template).then(async image=>{
  if(image.decode)await image.decode();
  nativeReady.set(template,image);
  let bytes=0;for(const value of nativeReady.values())bytes+=(value.naturalWidth||value.width)*(value.naturalHeight||value.height)*4;
  for(const [key,value] of nativeReady){if(bytes<=NATIVE_LIMIT&&nativeReady.size<=4)break;nativeReady.delete(key);bytes-=(value.naturalWidth||value.width)*(value.naturalHeight||value.height)*4}
  return image;
 }).finally(()=>nativePending.delete(template));
 nativePending.set(template,request);return request;
}
