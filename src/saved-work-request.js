import {withDeadline} from './async-deadline.js';

// Compression is lossless and optional. A failed encoder never starts a write.
export async function encodeSavedWorkRequest(json,{timeoutMs=5000}={}){
 const plain={body:json,headers:{}};
 if(typeof CompressionStream!=='function'||typeof Response!=='function'||typeof Blob!=='function'||typeof AbortController!=='function')return plain;
 const input=new Blob([json],{type:'application/json'});
 if(input.size<128*1024||typeof input.stream!=='function')return plain;
 const controller=new AbortController();
 try{
  const compressed=await withDeadline(()=>new Response(input.stream().pipeThrough(new CompressionStream('gzip'),{signal:controller.signal})).blob(),{
   timeoutMs,message:'เตรียมข้อมูลบันทึกใช้เวลานาน',code:'SAVE_COMPRESSION_TIMEOUT',onTimeout:()=>controller.abort()
  });
  if(compressed.size<input.size*.95)return {body:compressed,headers:{'Content-Encoding':'gzip'}};
 }catch{controller.abort()}
 return plain;
}
