import {MAKEUP_STUDIO_RETOUCH_POLICY,MAKEUP_STUDIO_RETOUCH_VERSION} from './makeup-studio-retouch-policy.js';
// Record actual successful provider requests; no prompts, images or personal data.
export function createMakeupRequestAudit(provider,{requirePolicy=false}={}){
 let calls=0,version=null;
 return {
  requestPortrait:async request=>{
   const occurrences=typeof request.prompt==='string'?request.prompt.split(MAKEUP_STUDIO_RETOUCH_POLICY).length-1:0;
   if(requirePolicy&&occurrences!==1)throw Object.assign(Error('Makeup appearance policy is missing or duplicated'),{code:'MAKEUP_POLICY_MISMATCH'});
   calls++;
   const result=await provider(request);
   if(occurrences===1&&result?.png?.length)version=MAKEUP_STUDIO_RETOUCH_VERSION;
   return result;
  },
  snapshot:()=>({providerCalls:calls,makeupPolicyVersion:version})
 };
}
