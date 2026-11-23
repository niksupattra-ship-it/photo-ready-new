// Classify only allowlisted provider fields. Never expose the raw response,
// provider message, authorization headers or arbitrary exception properties.
export function openaiProviderFailure(status,body){
 const code=String(body?.error?.code||''),type=String(body?.error?.type||'');
 const rejected=['moderation_blocked','content_policy_violation','safety_violations'].includes(code);
 if(rejected)return {status,code:'AI_OUTPUT_REJECTED',message:'OpenAI ไม่อนุญาตให้สร้างภาพนี้'};
 if(status===429){
  if(['insufficient_quota','billing_hard_limit_reached','billing_not_active'].includes(code)||type==='insufficient_quota')return {status,code:'openai_quota_exceeded',message:'[openai_quota_exceeded] เครดิตหรือวงเงิน API ของผู้ให้บริการ OpenAI ไม่เพียงพอ ผู้ดูแลต้องตรวจสอบ Billing และวงเงิน API ก่อนสร้างต่อ'};
  if(code==='rate_limit_exceeded'||type==='rate_limit_error'){
   if(/request too large|single request.*exceeds|request exceeds.*token limit/i.test(String(body?.error?.message||'')))return {status,code:'openai_request_limit',message:'[openai_request_limit] คำขอสร้างภาพเกินโควตาต่อคำขอของ OpenAI ผู้ดูแลต้องตรวจสอบ Limits ของโมเดล'};
   return {status,code:'openai_rate_limited',message:'[openai_rate_limited] OpenAI จำกัดจำนวนคำขอชั่วคราว กรุณารอสักครู่ก่อนลองใหม่'};
  }
  return {status,code:'openai_throttled',message:'[openai_throttled] OpenAI ปฏิเสธคำขอด้วย HTTP 429 ยังระบุไม่ได้ว่าเป็นวงเงินหรือข้อจำกัดคำขอ ผู้ดูแลต้องตรวจสอบบัญชี API'};
 }
 return {status,code:'openai_failed',message:`OpenAI ประมวลผลไม่สำเร็จ (${status})`};
}
export const OPENAI_KNOWN_ERROR_CODES=['AI_OUTPUT_REJECTED','openai_failed','openai_quota_exceeded','openai_request_limit','openai_rate_limited','openai_throttled','openai_response_invalid','openai_empty_result','openai_invalid_png'];
