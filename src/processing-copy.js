export const PROCESS_FAILURE_HINT='เปลี่ยนรูปใหม่หรือเลือกทรงผม';
export const PROCESS_FAILURE_MESSAGE='ประมวลไม่สำเร็จ '+PROCESS_FAILURE_HINT;

// Only show safe, actionable public messages; never expose raw AI-provider errors
// or request IDs in a customer's photo-editing screen.
export function processFailureMessage(error,english=false){
 const code=String(error?.code||'');
 const status=Number(error?.status||0);
 const message=String(error?.message||'');
 if(code==='AI_INPUT_REJECTED'||/input image may contain sensitive information/i.test(message))
  return english?'The AI provider could not process this uploaded photo. Please try another photo.':'ผู้ให้บริการ AI ไม่อนุญาตให้ประมวลผลรูปต้นฉบับนี้ กรุณาลองรูปอื่น';
 if(code==='AI_OUTPUT_REJECTED'||/output image may contain sensitive information/i.test(message))
  return english?'The AI provider could not deliver this generated result. Please try a different photo or style.':'ผู้ให้บริการ AI ไม่สามารถส่งภาพที่สร้างได้ กรุณาลองรูปหรือรูปแบบอื่น';
 if(code==='AI_CONTENT_REJECTED')
  return english?'The AI provider could not process or return this image. Please choose a different photo or style.':'ผู้ให้บริการ AI ไม่อนุญาตภาพนี้ กรุณาลองรูปหรือรูปแบบอื่น';
 if(code==='ACTIVE_AI_JOB'||code==='active_ai_job'||status===429)
  return english?'Another AI photo is being processed. Complete or cancel that job before creating a new one.':'มีงาน AI ก่อนหน้ากำลังประมวลผล กรุณาให้งานเดิมเสร็จหรือยกเลิกก่อน';
 if(status===402||code==='credit_required'||code==='usd_premium_credits_exhausted')
  return english?'Your AI generation credits are unavailable or have expired. Check your plan before creating a new result.':'ไม่มีสิทธิ์สร้างภาพ AI ใหม่หรือสิทธิ์หมดอายุ กรุณาตรวจสอบแพ็กเกจ';
 if(code==='REQUEST_TIMEOUT'||error?.name==='TimeoutError')
  return english?'The connection timed out. Check your existing result before trying again to avoid duplicate requests.':'การเชื่อมต่อใช้เวลานานเกินไป กรุณาตรวจงานเดิมก่อนลองใหม่ เพื่อไม่ส่งงานซ้ำ';
 if(error?.name==='AbortError'||/failed to fetch|load failed|networkerror|fetch failed/i.test(message))
  return english?'The connection was interrupted. Check whether your previous job finished before trying again.':'การเชื่อมต่อขัดข้อง กรุณาตรวจงานก่อนหน้าว่าเสร็จแล้วหรือไม่ก่อนลองใหม่';
 return english?'Photo processing could not be completed. Your previous work remains available where supported. Please try again.':PROCESS_FAILURE_MESSAGE;
}
export const TOOL_HELP={
 move:'ปรับตำแหน่งส่วนที่เลือก',
 transform:'ปรับขนาดและหมุนส่วนที่เลือก',
 neck:'ปรับความกว้างและความสูงคอเสื้อ',
 warp:'ปรับรูปทรงเฉพาะบริเวณ',
 erase:'ลบส่วนที่ไม่ต้องการ',
 paint:'ระบายสีบนส่วนที่เลือก',
 restore:'คืนส่วนที่ถูกลบ',
 pan:'ปรับมุมมองภาพ'
};
export const WARP_HELP=TOOL_HELP.warp;

export const PHOTO_EDITING_TITLE='กำลังตัดต่อรูป';
export const PHOTO_EDITING_WAIT='กรุณารอสักครู่';
// Display phases follow the existing estimated progress; 100% means ready.
export const photoEditingStage=value=>Number(value)>=100?'ภาพพร้อมแล้ว':Number(value)>=86?'กำลังเก็บรายละเอียด':Number(value)>=31?'กำลังจัดองค์ประกอบภาพ':'กำลังเตรียมรูป';
