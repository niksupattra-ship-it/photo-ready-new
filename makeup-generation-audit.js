import {THAI_REAL_FACE_VERSION,THAI_REAL_FACE_PREVIOUS_VERSION,normalizeThaiRealFaceAppearance} from './thai-real-face-policy.js';
import {MAKEUP_STUDIO_RETOUCH_POLICY,MAKEUP_STUDIO_RETOUCH_VERSION} from './makeup-studio-retouch-policy.js';
// Record actual successful provider requests; no prompts, images or personal data.
export function createMakeupRequestAudit(provider,{requirePolicy=false}={}){
 let calls=0,version=null;
 return {
  requestPortrait:async request=>{
   const prompt=typeof request.prompt==='string'?request.prompt:'';
   const original=prompt.split(MAKEUP_STUDIO_RETOUCH_POLICY).length-1;
   const adapted=prompt.split(normalizeThaiRealFaceAppearance(MAKEUP_STUDIO_RETOUCH_POLICY)).length-1;
   const realFace=[THAI_REAL_FACE_VERSION,THAI_REAL_FACE_PREVIOUS_VERSION].includes(request.thaiRealFaceVersion);
   const occurrences=realFace?(original===0&&prompt.includes('THAI REAL FACE — ORIGINAL EYES, EXPRESSION AND ANATOMY TAKE FINAL PRIORITY:')?adapted:0):(adapted===0?original:0);
   if(requirePolicy&&occurrences!==1)throw Object.assign(Error('Makeup appearance policy is missing or duplicated'),{code:'MAKEUP_POLICY_MISMATCH'});
   calls++;
   const result=await provider(request);
   if(occurrences===1&&result?.png?.length)version=MAKEUP_STUDIO_RETOUCH_VERSION;
   return result;
  },
  snapshot:()=>({providerCalls:calls,makeupPolicyVersion:version})
 };
}
