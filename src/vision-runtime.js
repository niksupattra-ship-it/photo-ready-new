// Keep a same-origin, stable runtime available when a deployment replaces a
// hashed Vite chunk while an older tab is still open. Never reload the photo.
const fallbackRuntimeUrl='/assets/vision/mediapipe-1.0.1/vision_bundle.mjs';
export function createVisionRuntimeLoader(importRuntime=()=>import('@mediapipe/tasks-vision'),importFallback=()=>import(/* @vite-ignore */ fallbackRuntimeUrl)){
 let pending;
 return()=>{
  if(!pending){
   const request=Promise.resolve().then(importRuntime).catch(()=>importFallback());pending=request;
   request.catch(()=>{if(pending===request)pending=null});
  }
  return pending;
 };
}
export const loadVisionRuntime=createVisionRuntimeLoader();

// Some browsers fail SIMD/WASM initialization even after downloading all
// assets. Retry with the pinned non-SIMD runtime, keeping the same model and
// detection thresholds. A model failure never bypasses face validation.
export async function createCompatibleVisionModel({resolver,root,create,options}){
 try{return await create(await resolver.forVisionTasks(root),options)}catch(firstError){
  try{return await create({wasmLoaderPath:root+'/vision_wasm_nosimd_internal.js',wasmBinaryPath:root+'/vision_wasm_nosimd_internal.wasm'},options)}catch(error){
   error.initialCause=firstError;throw error;
  }
 }
}
