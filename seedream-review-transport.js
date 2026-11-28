import {FEMALE_LAB_PROCESS_VERSION,FEMALE_PORTRAIT_PROMPT} from './female-portrait-prompt.js';
import {femaleRequestProof,logFemaleRequestProof} from './female-request-proof.js';
// Transport for the isolated review server; no production route or key fallback.
import {FEMALE_PORTRAIT_MODEL,PORTRAIT_AI_OUTPUT_SIZE} from './seedream-pro-payload.js';
export const REVIEW_SEEDREAM_MODEL='dola-seedream-5-0-flash-260915';
export const REVIEW_SEEDREAM_ENDPOINT='https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';
export function seedreamLabPayload(prompt,image){
 if(!Array.isArray(image)||image.length!==3)throw Error('Exactly three references required');
 return {model:REVIEW_SEEDREAM_MODEL,prompt,image,size:PORTRAIT_AI_OUTPUT_SIZE,output_format:'png',response_format:'b64_json',watermark:false};
}
export function seedreamReviewPayload({prompt,portrait,portraitMime='image/png',hair,hairMime='image/png',identity,makeup,outfit,outfitMime='image/png',skinReference,neckReference,neckShapeReference,hairPlacementReference,compositionReference,makeupStudioReference,outfitDetailReference,adaptiveComposition,femaleExactPromptVersion,femalePreplacedVersion,preparedFemalePayload}){
 if(femalePreplacedVersion){
  if(femalePreplacedVersion!==FEMALE_LAB_PROCESS_VERSION||prompt!==FEMALE_PORTRAIT_PROMPT||preparedFemalePayload?.prompt!==prompt||preparedFemalePayload?.model!==FEMALE_PORTRAIT_MODEL||preparedFemalePayload?.size!==PORTRAIT_AI_OUTPUT_SIZE||preparedFemalePayload?.image?.length!==3)throw Error('Invalid current female payload');
  return preparedFemalePayload;
 }
 if(femaleExactPromptVersion)throw Error('Retired female prompt; refresh the page');
 if(!portrait?.length)throw Error('ไม่มีภาพคนสำหรับ Seedream');
 const image=[`data:${portraitMime};base64,${Buffer.from(portrait).toString('base64')}`];
 if(hair?.length)image.push(`data:${hairMime};base64,${Buffer.from(hair).toString('base64')}`);
 if(identity?.length)image.push(`data:image/png;base64,${Buffer.from(identity).toString('base64')}`);
 if(makeup?.length)image.push(`data:image/jpeg;base64,${Buffer.from(makeup).toString('base64')}`);
 if(outfit?.length)image.push(`data:${outfitMime};base64,${Buffer.from(outfit).toString('base64')}`);
 if(skinReference?.length)image.push(`data:image/jpeg;base64,${Buffer.from(skinReference).toString('base64')}`);
 if(neckReference?.length)image.push(`data:image/png;base64,${Buffer.from(neckReference).toString('base64')}`);
 if(neckShapeReference?.length)image.push(`data:image/png;base64,${Buffer.from(neckShapeReference).toString('base64')}`);
 if(hairPlacementReference?.length)image.push(`data:image/png;base64,${Buffer.from(hairPlacementReference).toString('base64')}`);
 if(compositionReference?.length)image.push(`data:image/png;base64,${Buffer.from(compositionReference).toString('base64')}`);
 // Append only: earlier image indices and geometry/hair references stay intact.
 if(makeupStudioReference?.length)image.push(`data:image/jpeg;base64,${Buffer.from(makeupStudioReference).toString('base64')}`);
 if(outfitDetailReference?.length)image.push(`data:image/png;base64,${Buffer.from(outfitDetailReference).toString('base64')}`);
 if(adaptiveComposition?.length)image.push(`data:image/png;base64,${Buffer.from(adaptiveComposition).toString('base64')}`);
 return {model:REVIEW_SEEDREAM_MODEL,prompt,image:image.length===1?image[0]:image,size:PORTRAIT_AI_OUTPUT_SIZE,output_format:'png',response_format:'b64_json',watermark:false};
}
export async function requestReviewSeedream(options,{fetchImpl=fetch,timeoutMs=240000}={}){
 const {key}=options;
 if(!key)throw Object.assign(Error('ยังไม่ได้ตั้งค่า ARK_API_KEY '),{status:500});
 const prepared=seedreamReviewPayload(options),payload=JSON.stringify(prepared);
 const proof=options.femalePreplacedVersion===FEMALE_LAB_PROCESS_VERSION?femaleRequestProof(prepared):null;
 if(proof)logFemaleRequestProof('production',proof);
 // Legacy requests retry only temporary transport/provider failures within the SAME queued
 // wallet job. No new credit is reserved, and image-content/moderation
 // rejections are never retried. singleAttempt disables every automatic retry.
 const attempts=options.singleAttempt||options.femalePreplacedVersion?1:2;
 for(let attempt=0;attempt<attempts;attempt++){
  const signal=AbortSignal.timeout(timeoutMs);
  let response,body;
  try{
   response=await fetchImpl(REVIEW_SEEDREAM_ENDPOINT,{
    signal,method:'POST',
    headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:payload
   });
  }catch(error){
   const timedOut=signal.aborted;
   if(attempt+1<attempts){console.warn('Temporary image-provider transport failure; retrying once',timedOut?'timeout':'network');await new Promise(resolve=>setTimeout(resolve,900));continue}
   if(timedOut)throw Object.assign(Error('Seedream ใช้เวลาเกิน 4 นาที กรุณาลองใหม่'),{status:504,code:'seedream_timeout'});
   throw error;
  }
  try{body=await response.json()}catch{
   if(attempt+1<attempts&&[200,408,429,500,502,503,504].includes(response.status)){
    console.warn('Temporary image-provider response format; retrying once',response.status);
    await new Promise(resolve=>setTimeout(resolve,900));continue;
   }
   throw Object.assign(Error('ผู้ให้บริการ AI ส่งข้อมูลตอบกลับไม่สมบูรณ์'),{status:502,code:'seedream_response_invalid'});
  }
  if(!response.ok){
   const detail=String(body?.error?.message||body?.message||'คำขอไม่สำเร็จ').slice(0,600);
   if(attempt+1<attempts&&[408,425,429,500,502,503,504].includes(response.status)){
    const retryAfter=Math.min(3000,Math.max(0,Number(response.headers?.get?.('retry-after'))*1000||1000));
    console.warn('Temporary image-provider status; retrying once',response.status);
    await new Promise(resolve=>setTimeout(resolve,retryAfter));continue;
   }
   throw Object.assign(Error(`Seedream ประมวลผลไม่สำเร็จ (${response.status}): ${detail}`),{status:response.status,code:body?.error?.code||'seedream_failed'});
  }
  const b64=body?.data?.[0]?.b64_json;
  if(typeof b64!=='string'||!b64.length){
   if(attempt+1<attempts){console.warn('Image-provider response has no PNG; retrying once');continue}
   throw Object.assign(Error('Seedream ไม่ได้ส่งภาพกลับมา'),{status:502,code:'seedream_empty_result'});
  }
  const png=Buffer.from(b64,'base64');
  if(png.length<8||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
   if(attempt+1<attempts){console.warn('Image-provider returned invalid PNG; retrying once');continue}
   throw Object.assign(Error('Seedream ส่งผลลัพธ์ที่ไม่ใช่ PNG'),{status:502,code:'seedream_invalid_png'});
  }
  const requestId=response.headers?.get?.('x-request-id')||'';
  if(proof)logFemaleRequestProof('production',proof,{phase:'result',requestId,png});
  return {png,requestId,...(proof?{femaleRequestProof:proof}:{})};
 }
 throw Object.assign(Error('ผู้ให้บริการ AI ไม่สามารถส่งภาพกลับมาได้'),{status:502,code:'seedream_unavailable'});
}
