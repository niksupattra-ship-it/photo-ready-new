// Per-tab cache of successful results only. Nothing is written to disk/server.
export function createAiResultCache({maxBytes=128*1024*1024,maxEntries=96}={}){
 const records=new Map();let bytes=0;
 const remove=key=>{const entry=records.get(key);if(entry){bytes-=entry.bytes||0;records.delete(key)}};
 return {
  clear(){records.clear();bytes=0},
  async get(key,generate){
   if(records.has(key)){const entry=records.get(key);records.delete(key);records.set(key,entry);return {value:await entry.promise,reused:true}}
   const entry={bytes:0,promise:null};
   entry.promise=Promise.resolve().then(generate);records.set(key,entry);
   try{
    const value=await entry.promise;
    if(records.get(key)===entry){
     entry.bytes=value?.size??((value?.width||0)*(value?.height||0)*4);bytes+=entry.bytes;
     for(const [oldKey,old] of records){if(bytes<=maxBytes&&records.size<=maxEntries)break;if(old.bytes)remove(oldKey)}
    }
    return {value,reused:false};
   }catch(error){if(records.get(key)===entry)remove(key);throw error}
  }
 };
}
const sourceDigests=new WeakMap();
export async function resultSourceDigest(source){
 if(source&&typeof source==='object'&&sourceDigests.has(source))return sourceDigests.get(source);
 const pending=(async()=>{
  let bytes;
  if(typeof source==='string')bytes=new TextEncoder().encode(source);
  else if(typeof source?.arrayBuffer==='function')bytes=await source.arrayBuffer();
  else if(typeof source?.toDataURL==='function')bytes=new TextEncoder().encode(source.toDataURL('image/png'));
  else throw Error('อ่านภาพสำหรับจำผลลัพธ์ไม่สำเร็จ');
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
 })();
 if(source&&typeof source==='object'){sourceDigests.set(source,pending);pending.catch(()=>{if(sourceDigests.get(source)===pending)sourceDigests.delete(source)})}
 return pending;
}
