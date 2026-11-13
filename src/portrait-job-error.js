// Convert provider refusals to stable public codes. Never surface provider request IDs.
// A refused photo is not a transient failure and must not be retried automatically.
export function portraitJobError(raw){
 const detail=String(raw||'ประมวลผลไม่สำเร็จ');
 let body=null;
 const jsonStart=detail.indexOf('{');
 if(jsonStart>=0)try{body=JSON.parse(detail.slice(jsonStart))}catch{}
 const providerCode=body?.error?.code||body?.code||detail.match(/(?:Output|Input)ImageSensitiveContentDetected/)?.[0]||'';
 const inputRejected=providerCode==='InputImageSensitiveContentDetected'||/input image may contain sensitive information/i.test(detail);
 const outputRejected=providerCode==='OutputImageSensitiveContentDetected'||/output image may contain sensitive information/i.test(detail);
 if(inputRejected)return Object.assign(
  Error('ผู้ให้บริการ AI ไม่อนุญาตให้ประมวลผลรูปต้นฉบับนี้ กรุณาเลือกภาพอื่น'),
  {code:'AI_INPUT_REJECTED',providerCode:'InputImageSensitiveContentDetected',retryable:false}
 );
 if(outputRejected)return Object.assign(
  Error('ผู้ให้บริการ AI ไม่สามารถส่งภาพผลลัพธ์นี้ได้ กรุณาเลือกภาพหรือรูปแบบอื่น'),
  {code:'AI_OUTPUT_REJECTED',providerCode:'OutputImageSensitiveContentDetected',retryable:false}
 );
 if(/(?:image|content) may contain sensitive information/i.test(detail))return Object.assign(
  Error('ผู้ให้บริการ AI ไม่อนุญาตให้ประมวลผลหรือส่งคืนภาพนี้ กรุณาลองภาพหรือรูปแบบอื่น'),
  {code:'AI_CONTENT_REJECTED',retryable:false}
 );
 return Error(detail);
}
