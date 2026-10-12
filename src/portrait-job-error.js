// Preserve provider failure details without replacing a failed result with an image.
export function portraitJobError(raw){
 const detail=String(raw||'ประมวลผลไม่สำเร็จ');
 let body=null;try{body=JSON.parse(detail.slice(detail.indexOf('{')))}catch{}
 const providerCode=body?.error?.code||body?.code||detail.match(/(?:Output|Input)ImageSensitiveContentDetected/)?.[0];
 if(providerCode==='OutputImageSensitiveContentDetected')return Object.assign(Error('ผู้ให้บริการ AI ปฏิเสธภาพผลลัพธ์ จึงไม่สามารถส่งภาพกลับมาได้ กรุณาเลือกภาพบุคคลที่เหมาะสมใหม่'),{code:'AI_OUTPUT_REJECTED',providerCode});
 if(providerCode==='InputImageSensitiveContentDetected')return Object.assign(Error('ผู้ให้บริการ AI ปฏิเสธรูปที่ส่งไป กรุณาเลือกภาพบุคคลที่เหมาะสมใหม่'),{code:'AI_INPUT_REJECTED',providerCode});
 return Error(detail);
}
