// Download the existing MediaPipe runtime only when a portrait operation needs it.
// A single shared import serves concurrent model requests; failed imports can retry.
export function createVisionRuntimeLoader(importRuntime=()=>import('@mediapipe/tasks-vision')){
 let pending;
 return()=>{
  if(!pending){
   const request=Promise.resolve().then(importRuntime);pending=request;
   request.catch(()=>{if(pending===request)pending=null});
  }
  return pending;
 };
}
export const loadVisionRuntime=createVisionRuntimeLoader();
