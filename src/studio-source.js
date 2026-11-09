// Full-resolution layer sources; placement is workspace metadata, not baked pixels.
const make=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
import {decodedStudioImage as load} from './studio-image-cache.js';
import {boundedPhotoCanvas} from './photo-input.js';
import thumbnailMap from './studio-thumbnail-map.json' with {type:'json'};
export function nativeSource(im){const c=boundedPhotoCanvas(im);try{const source=c.toDataURL('image/png');if(!source.startsWith('data:image/'))throw Error('เตรียมภาพไม่สำเร็จ กรุณาลองเลือกภาพใหม่');return source}finally{c.width=1;c.height=1}}
async function cropSource(src){const im=await load(src),c=make(im.naturalWidth,im.naturalHeight),x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let l=c.width,t=c.height,r=-1,b=-1;for(let y=0;y<c.height;y++)for(let px=0;px<c.width;px++)if(d[(y*c.width+px)*4+3]>8){l=Math.min(l,px);r=Math.max(r,px);t=Math.min(t,y);b=Math.max(b,y)}if(r<l)throw Error('ภาพเครื่องหมายไม่มีส่วนที่แสดง');const out=make(r-l+1,b-t+1);out.getContext('2d').drawImage(c,l,t,out.width,out.height,0,0,out.width,out.height);return out}
// Cropping immutable source pixels is independent of placement and edit masks.
const croppedSources=new Map(),MAX_CROPPED_BYTES=16*1024*1024;
async function cropped(src){
 let entry=croppedSources.get(src);
 if(entry){croppedSources.delete(src);croppedSources.set(src,entry);return entry.promise}
 entry={bytes:0,promise:null};
 entry.promise=cropSource(src).then(result=>{
  entry.bytes=result.width*result.height*4;
  let bytes=0;for(const value of croppedSources.values())bytes+=value.bytes;
  for(const [key,value]of croppedSources){if(bytes<=MAX_CROPPED_BYTES&&croppedSources.size<=24)break;if(!value.bytes)continue;croppedSources.delete(key);bytes-=value.bytes}
  return result;
 }).catch(error=>{if(croppedSources.get(src)===entry)croppedSources.delete(src);throw error});
 croppedSources.set(src,entry);return entry.promise;
}
async function buildNativeAsset(kind,option,frame,preset,maxDensity=2){
 if(kind==='suit'||kind==='background'){const im=await load(kind==='suit'?option.template:option.src);const source=make(im.naturalWidth||im.width,im.naturalHeight||im.height);source.getContext('2d').drawImage(im,0,0);return {source,sourceFrame:kind==='suit'?frame:{x:0,y:0,w:900,h:1200},collarParts:null}}
 if(kind==='chest'||kind==='ribbon'){const c=await cropped(option.src),v=preset[kind],w=frame.w*v.width,h=w*c.height/c.width;return {source:c,sourceFrame:{x:frame.x+frame.w*v.x-w/2,y:frame.y+frame.h*(kind==='ribbon'?v.top:v.y)-(kind==='ribbon'?0:h/2),w,h},collarParts:null}}
 const left=await cropped(option.left),right=await cropped(option.right),v=preset.collar,w=frame.w*v.width,y=frame.y+frame.h*v.y;
 const frames=[left,right].map((c,i)=>({x:frame.x+frame.w*(i?v.right:v.left)-w/2,y:y-w*c.height/c.width/2,w,h:w*c.height/c.width}));
 // Preserve native insignia detail and room for the existing independent +/-300px controls.
 const f={x:-128,y:-128,w:0,h:0};f.w=1156;f.h=1456;
 const density=Math.min(maxDensity,Math.max(left.width/w,right.width/w)),bw=Math.ceil(f.w*density),bh=Math.ceil(f.h*density);if(bw>16384||bh>8192)throw Error('ภาพเข็มมีขนาดใหญ่เกินขีดจำกัดเลเยอร์');
 const parts=[left,right].map((c,i)=>{const out=make(bw,bh),q=frames[i];out.getContext('2d').drawImage(c,(q.x-f.x)*bw/f.w,(q.y-f.y)*bh/f.h,q.w*bw/f.w,q.h*bh/f.h);return out});const combined=make(bw,bh);for(const c of parts)combined.getContext('2d').drawImage(c,0,0);
 return {source:combined,sourceFrame:f,collarParts:{left:parts[0],right:parts[1]}};
}

// Cache prepared full-resolution sources; edit masks/buffers remain per-layer.
const preparedAssets=new Map(),MAX_PREPARED_BYTES=32*1024*1024;
function trimPreparedAssets(){let bytes=0;for(const entry of preparedAssets.values())bytes+=entry.bytes;while(preparedAssets.size>6||bytes>MAX_PREPARED_BYTES){const key=preparedAssets.keys().next().value,entry=preparedAssets.get(key);bytes-=entry.bytes;preparedAssets.delete(key)}}
export async function nativeAsset(kind,option,frame,preset){
 // Suit pixels do not depend on placement or accessory presets.
 const key=JSON.stringify(kind==='suit'?[kind,option.template]:[kind,option.template,option.src,option.left,option.right,frame,preset]);
 let entry=preparedAssets.get(key);
 if(entry){preparedAssets.delete(key);preparedAssets.set(key,entry)}else{
  entry={bytes:0,promise:null};entry.promise=buildNativeAsset(kind,option,frame,preset).then(result=>{const bytes=source=>source instanceof HTMLCanvasElement?source.width*source.height*4:2*(source?.length||0);entry.bytes=bytes(result.source)+bytes(result.collarParts?.left)+bytes(result.collarParts?.right);trimPreparedAssets();return result}).catch(error=>{if(preparedAssets.get(key)===entry)preparedAssets.delete(key);throw error});preparedAssets.set(key,entry);trimPreparedAssets();
 }
 const result=await entry.promise;return {...result,sourceFrame:kind==='suit'?{...frame}:result.sourceFrame?{...result.sourceFrame}:null,collarParts:result.collarParts?{...result.collarParts}:null};
}


// Lightweight display sources only. Full-resolution nativeAsset remains the
// sole source committed to editor state, history and exported files.
function thumbnailOption(kind,option){
 const fields=kind==='collar'?['left','right']:['chest','ribbon'].includes(kind)?['src']:[];
 if(!fields.length||fields.some(key=>!thumbnailMap[option?.[key]]))return null;
 return {...option,...Object.fromEntries(fields.map(key=>[key,thumbnailMap[option[key]]]))};
}
export function warmAssetPreview(kind,option){
 const small=thumbnailOption(kind,option);if(!small)return Promise.resolve(null);
 return Promise.all((kind==='collar'?[small.left,small.right]:[small.src]).map(load));
}
export function nativeAssetPreview(kind,option,frame,preset){
 const small=thumbnailOption(kind,option);if(!small)return Promise.resolve(null);
 return buildNativeAsset(kind,small,frame,preset,.5).then(result=>{
  if(kind==='collar')return result;
  const source=make(result.source.width,result.source.height);source.getContext('2d').drawImage(result.source,0,0);
  return {...result,source};
 });
}
