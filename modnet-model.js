import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
export const MODNET_MODEL_SHA256='5069a5e306b9f5e9f4f2b0360264c9f8ea13b257c7c39943c7cf6a2ec3a102ae';
export const MODNET_MODEL_BYTES=25969398;
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
export async function loadBundledModnet(root){
 const base=path.join(root,'models/modnet-photographic-v1'),manifest=JSON.parse(await readFile(path.join(base,'manifest.json'),'utf8'));
 if(manifest.sha256!==MODNET_MODEL_SHA256||manifest.bytes!==MODNET_MODEL_BYTES||!Array.isArray(manifest.parts)||manifest.parts.length!==5)throw Error('Invalid bundled matting model manifest');
 const chunks=[];let total=0;
 for(const [index,part]of manifest.parts.entries()){
  if(part.file!==`part-${String(index).padStart(2,'0')}.bin`||!Number.isSafeInteger(part.bytes)||part.bytes<1||part.bytes>6*1024*1024)throw Error('Invalid bundled matting model part');
  const bytes=await readFile(path.join(base,part.file));
  if(bytes.length!==part.bytes||sha(bytes)!==part.sha256)throw Error('Bundled matting model checksum mismatch');
  chunks.push(bytes);total+=bytes.length;
 }
 if(total!==MODNET_MODEL_BYTES)throw Error('Bundled matting model length mismatch');
 const bytes=Buffer.concat(chunks);
 if(sha(bytes)!==MODNET_MODEL_SHA256)throw Error('Bundled matting model checksum mismatch');
 return new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength);
}
export async function createBundledModnetSession(root){
 const [bytes,ort]=await Promise.all([loadBundledModnet(root),import('onnxruntime-web/wasm')]);
 ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
 return ort.InferenceSession.create(bytes,{executionProviders:['wasm']});
}
