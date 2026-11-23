import {sanitizeAiError} from './ai-error-sanitizer.js';
import {openaiApiKey} from './openai-api-key.js';
import {seedreamReviewPayload} from './seedream-review-transport.js';
export const OPENAI_PORTRAIT_MODEL='gpt-image-2.5-sunburst';
export const OPENAI_RESPONSES_MODEL='gpt-5.5';
export const OPENAI_PORTRAIT_ENDPOINT='https://api.openai.com/v1/responses';
export const OPENAI_SKIN_DETAIL_INSTRUCTION=`PHOTOGRAPHIC SKIN DETAIL ONLY: Retain the subject's real pores, fine lines, subtle imperfections, age-defining texture and natural tonal variation from the original identity photograph. Preserve fine skin detail beneath the selected finish; do not replace it with waxy, porcelain, plastic, airbrushed or blurred skin, synthetic pore patterns, sharpening halos or glossy painted highlights. Natural keeps the existing Natural treatment; Makeup keeps the selected makeup colours, placement, coverage and lighting, with photographic texture visible beneath pigment. This instruction changes skin rendering only: preserve all existing identity, expression, eye colour/catchlights, hairstyle, clothing, insignia, anatomy, proportions, framing and placement instructions. Do not add a second retouching or generation pass.`;
export function openaiPortraitPayload(options){
 if(typeof options.prompt!=='string'||!options.prompt.trim())throw Object.assign(Error('ไม่มีคำสั่งสร้างภาพ OpenAI'),{status:400,code:'openai_prompt_invalid'});
 const refs=seedreamReviewPayload(options).image,images=Array.isArray(refs)?refs:[refs];
 // Responses accepts the complete long input. Do not shorten, deduplicate,
 // rewrite or rearrange any existing application instruction/reference image.
 return {model:OPENAI_RESPONSES_MODEL,store:false,truncation:'disabled',input:[{role:'user',content:[{type:'input_text',text:options.prompt+'\n\n'+OPENAI_SKIN_DETAIL_INSTRUCTION},...images.map(image_url=>({type:'input_image',image_url,detail:'high'}))]}],
  tools:[{type:'image_generation',model:OPENAI_PORTRAIT_MODEL,action:'edit',quality:'high',output_format:'png',size:/^\d+x\d+$/.test(options.size||'')?options.size:'1824x2432'}],
  tool_choice:{type:'image_generation'},max_tool_calls:1,parallel_tool_calls:false};
}
export async function requestOpenAIPortrait(options,{fetchImpl=fetch,timeoutMs=240000}={}){
 const key=openaiApiKey(options.key);
 const payload=openaiPortraitPayload(options),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);timer.unref?.();
 try{
  // One submission. Never retry a billable call or silently use another vendor.
  const response=await fetchImpl(OPENAI_PORTRAIT_ENDPOINT,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
  let body;try{body=await response.json()}catch{throw Object.assign(Error('OpenAI ส่งข้อมูลตอบกลับไม่สมบูรณ์'),{status:502,code:'openai_response_invalid'})}
  if(!response.ok){const rejected=['moderation_blocked','content_policy_violation','safety_violations'].includes(body?.error?.code);throw Object.assign(Error(rejected?'OpenAI ไม่อนุญาตให้สร้างภาพนี้':`OpenAI ประมวลผลไม่สำเร็จ (${response.status})`),{status:response.status,code:rejected?'AI_OUTPUT_REJECTED':'openai_failed'})}
  const generated=(body?.output||[]).filter(item=>item.type==='image_generation_call'&&item.status==='completed');
  if(generated.length!==1||typeof generated[0].result!=='string'||!generated[0].result.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(generated[0].result))throw Object.assign(Error('OpenAI ไม่ได้ส่งภาพที่สร้างสำเร็จกลับมา'),{status:502,code:'openai_empty_result'});
  const png=Buffer.from(generated[0].result,'base64');
  if(png.length<8||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Object.assign(Error('OpenAI ส่งผลลัพธ์ที่ไม่ใช่ PNG'),{status:502,code:'openai_invalid_png'});
  return {png,provider:'openai',requestId:response.headers?.get?.('x-request-id')||''};
 }catch(error){if(controller.signal.aborted)throw Object.assign(Error('OpenAI ประมวลผลใช้เวลานานเกินไป'),{status:504,code:'openai_timeout'});if(['AI_OUTPUT_REJECTED','openai_failed','openai_response_invalid','openai_empty_result','openai_invalid_png'].includes(error?.code))throw Object.assign(Error(sanitizeAiError(error.message)),{status:error.status,code:error.code});throw Object.assign(Error('เชื่อมต่อ OpenAI ไม่สำเร็จ กรุณาลองอีกครั้ง'),{status:502,code:'openai_transport_failed'})}
 finally{clearTimeout(timer)}
}
