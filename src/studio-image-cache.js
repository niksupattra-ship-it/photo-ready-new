// Decoded sources are immutable; masks and edit buffers remain per layer.
const cache=new Map();
const LIMIT=64*1024*1024;
function trim(){let bytes=0;for(const item of cache.values())bytes+=item.bytes;for(const [key,item] of cache){if(bytes<=LIMIT&&cache.size<=24)break;if(!item.bytes)continue;cache.delete(key);bytes-=item.bytes}}
export function decodedStudioImage(source){
 if(source instanceof HTMLCanvasElement)return Promise.resolve(source);
 let item=cache.get(source);
 if(item){cache.delete(source);cache.set(source,item);return item.promise}
 item={bytes:0,promise:null};
 item.promise=new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{item.bytes=im.width*im.height*4;trim();resolve(im)};im.onerror=()=>{cache.delete(source);reject(Error('อ่านภาพไม่สำเร็จ'))};im.src=source});
 cache.set(source,item);return item.promise;
}
