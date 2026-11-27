import {FEMALE_EXACT_PROMPT_VERSION,FEMALE_PREPLACED_PROMPT_VERSION,FEMALE_LUMINOUS_PROMPT_VERSION,FEMALE_HAIR_REPLACEMENT_VERSION,FEMALE_REAR_HAIR_VERSION,FEMALE_MATCHED_PRO_VERSION,FEMALE_SOFT_KOREAN_PRO_VERSION,FEMALE_AGE_LOCK_PRO_VERSION,FEMALE_LAB_PROCESS_VERSION,FEMALE_EXACT_PROMPT} from './female-exact-prompt-policy.js';
import {productionFemalePromptFor} from './production-female-skin-prompt.js';
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
   const exact=request.femaleExactPromptVersion===FEMALE_EXACT_PROMPT_VERSION;
   const preplaced=[FEMALE_PREPLACED_PROMPT_VERSION,FEMALE_LUMINOUS_PROMPT_VERSION,FEMALE_HAIR_REPLACEMENT_VERSION,FEMALE_REAR_HAIR_VERSION,FEMALE_MATCHED_PRO_VERSION,FEMALE_SOFT_KOREAN_PRO_VERSION,FEMALE_AGE_LOCK_PRO_VERSION,FEMALE_LAB_PROCESS_VERSION].includes(request.femalePreplacedVersion);
   const occurrences=preplaced?(prompt===productionFemalePromptFor(request.femalePreplacedVersion)&&request.preparedFemalePayload?.prompt===prompt?1:0):exact?(prompt===FEMALE_EXACT_PROMPT?1:0):realFace?(original===0&&prompt.includes('THAI REAL FACE — ORIGINAL EYES, EXPRESSION AND ANATOMY TAKE FINAL PRIORITY:')?adapted:0):(adapted===0?original:0);
   if(requirePolicy&&occurrences!==1)throw Object.assign(Error('Makeup appearance policy is missing or duplicated'),{code:'MAKEUP_POLICY_MISMATCH'});
   calls++;
   const result=await provider(request);
   if(occurrences===1&&result?.png?.length)version=preplaced?request.femalePreplacedVersion:exact?FEMALE_EXACT_PROMPT_VERSION:MAKEUP_STUDIO_RETOUCH_VERSION;
   return result;
  },
  snapshot:()=>({providerCalls:calls,makeupPolicyVersion:version})
 };
}
