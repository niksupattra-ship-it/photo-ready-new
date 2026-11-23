import {openaiApiKey} from './openai-api-key.js';
import {OPENAI_RESPONSES_MODEL,OPENAI_PORTRAIT_MODEL} from './openai-portrait-transport.js';
// Read-only model access probes: no generation, no user image, no credit use.
export async function openaiReadiness(rawKey,{fetchImpl=fetch,timeoutMs=10000}={}){
 let key;try{key=openaiApiKey(rawKey)}catch(error){return {state:'unconfigured',code:error.code}}
 const models=await Promise.all([OPENAI_RESPONSES_MODEL,OPENAI_PORTRAIT_MODEL].map(async model=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);timer.unref?.();
  try{const r=await fetchImpl('https://api.openai.com/v1/models/'+encodeURIComponent(model),{headers:{Authorization:`Bearer ${key}`},signal:controller.signal});await r.arrayBuffer?.();return {model,status:r.status,available:r.ok}}
  catch{return {model,status:0,available:false}}
  finally{clearTimeout(timer)}
 }));
 return {state:models.every(m=>m.available)?'ready':'unavailable',keyNormalized:rawKey!==key,models};
}
