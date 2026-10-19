// Decoded sources are immutable; masks and edit buffers remain per layer.
import {withDeadline} from './async-deadline.js';
const cache=new Map();
const LIMIT=64*1024*1024;
function trim(){let bytes=0;for(const item of cache.values())bytes+=item.bytes;for(const [key,item] of cache){if(bytes<=LIMIT&&cache.size<=24)break;if(!item.bytes)continue;cache.delete(key);bytes-=item.bytes}}
export function decodedStudioImage(source){
 if(source instanceof HTMLCanvasElement)return Promise.resolve(source);
 let item=cache.get(source);
 if(item){cache.delete(source);cache.set(source,item);return item.promise}
 item={bytes:0,promise:null};
 let im;
 item.promise=withDeadline(()=>new Promise((resolve,reject)=>{im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('อ่านภาพไม่สำเร็จ'));im.src=source}),{
  timeoutMs:30000,message:'โหลดภาพใช้เวลานาน กรุณาลองอีกครั้ง',code:'STUDIO_IMAGE_TIMEOUT',
  onTimeout:()=>{if(im){im.onload=im.onerror=null;im.removeAttribute('src')}}
 }).then(value=>{item.bytes=value.width*value.height*4;trim();return value},error=>{if(cache.get(source)===item)cache.delete(source);throw error})
 .finally(()=>{if(im)im.onload=im.onerror=null});
 cache.set(source,item);return item.promise;
}
