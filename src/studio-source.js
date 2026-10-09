// Full-resolution layer sources; placement is workspace metadata, not baked pixels.
const make=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
import {decodedStudioImage as load} from './studio-image-cache.js';
export function nativeSource(im){const c=make(im.naturalWidth||im.width,im.naturalHeight||im.height);c.getContext('2d').drawImage(im,0,0);return c.toDataURL('image/png')}
async function cropped(src){const im=await load(src),c=make(im.naturalWidth,im.naturalHeight),x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let l=c.width,t=c.height,r=-1,b=-1;for(let y=0;y<c.height;y++)for(let px=0;px<c.width;px++)if(d[(y*c.width+px)*4+3]>8){l=Math.min(l,px);r=Math.max(r,px);t=Math.min(t,y);b=Math.max(b,y)}if(r<l)throw Error('ภาพเครื่องหมายไม่มีส่วนที่แสดง');const out=make(r-l+1,b-t+1);out.getContext('2d').drawImage(c,l,t,out.width,out.height,0,0,out.width,out.height);return out}
async function buildNativeAsset(kind,option,frame,preset){
 if(kind==='suit'||kind==='background'){const im=await load(kind==='suit'?option.template:option.src);const source=make(im.naturalWidth||im.width,im.naturalHeight||im.height);source.getContext('2d').drawImage(im,0,0);return {source,sourceFrame:kind==='suit'?frame:{x:0,y:0,w:900,h:1200},collarParts:null}}
 if(kind==='chest'||kind==='ribbon'){const c=await cropped(option.src),v=preset[kind],w=frame.w*v.width,h=w*c.height/c.width;return {source:c,sourceFrame:{x:frame.x+frame.w*v.x-w/2,y:frame.y+frame.h*(kind==='ribbon'?v.top:v.y)-(kind==='ribbon'?0:h/2),w,h},collarParts:null}}
 const left=await cropped(option.left),right=await cropped(option.right),v=preset.collar,w=frame.w*v.width,y=frame.y+frame.h*v.y;
 const frames=[left,right].map((c,i)=>({x:frame.x+frame.w*(i?v.right:v.left)-w/2,y:y-w*c.height/c.width/2,w,h:w*c.height/c.width}));
 // Preserve native insignia detail and room for the existing independent +/-300px controls.
 const f={x:Math.min(...frames.map(q=>q.x))-300,y:Math.min(...frames.map(q=>q.y)),w:0,h:0};f.w=Math.max(...frames.map(q=>q.x+q.w))+300-f.x;f.h=Math.max(...frames.map(q=>q.y+q.h))-f.y;
 const density=Math.max(left.width/w,right.width/w),bw=Math.ceil(f.w*density),bh=Math.ceil(f.h*density);if(bw>16384||bh>8192)throw Error('ภาพเข็มมีขนาดใหญ่เกินขีดจำกัดเลเยอร์');
 const parts=[left,right].map((c,i)=>{const out=make(bw,bh),q=frames[i];out.getContext('2d').drawImage(c,(q.x-f.x)*bw/f.w,(q.y-f.y)*bh/f.h,q.w*bw/f.w,q.h*bh/f.h);return out});const combined=make(bw,bh);for(const c of parts)combined.getContext('2d').drawImage(c,0,0);
 return {source:combined,sourceFrame:f,collarParts:{left:parts[0],right:parts[1]}};
}

// Cache prepared full-resolution sources; edit masks/buffers remain per-layer.
const preparedAssets=new Map(),MAX_PREPARED_BYTES=32*1024*1024;
function trimPreparedAssets(){let bytes=0;for(const entry of preparedAssets.values())bytes+=entry.bytes;while(preparedAssets.size>6||bytes>MAX_PREPARED_BYTES){const key=preparedAssets.keys().next().value,entry=preparedAssets.get(key);bytes-=entry.bytes;preparedAssets.delete(key)}}
export async function nativeAsset(kind,option,frame,preset){
 const key=JSON.stringify([kind,option.template,option.src,option.left,option.right,frame,preset]);
 let entry=preparedAssets.get(key);
 if(entry){preparedAssets.delete(key);preparedAssets.set(key,entry)}else{
  entry={bytes:0,promise:null};entry.promise=buildNativeAsset(kind,option,frame,preset).then(result=>{const bytes=source=>source instanceof HTMLCanvasElement?source.width*source.height*4:2*(source?.length||0);entry.bytes=bytes(result.source)+bytes(result.collarParts?.left)+bytes(result.collarParts?.right);trimPreparedAssets();return result}).catch(error=>{if(preparedAssets.get(key)===entry)preparedAssets.delete(key);throw error});preparedAssets.set(key,entry);trimPreparedAssets();
 }
 const result=await entry.promise;return {...result,sourceFrame:result.sourceFrame?{...result.sourceFrame}:null,collarParts:result.collarParts?{...result.collarParts}:null};
}
