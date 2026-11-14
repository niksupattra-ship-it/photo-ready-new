// Present actionable, safe errors without exposing private server responses.
// Do not imply the customer image is bad unless validation actually failed.
export function describePortraitFailure(error,english=false){
 const code=String(error?.code||'').slice(0,70);
 const status=Number(error?.status||0);
 const message=String(error?.message||'');
 const stage=String(error?.idpromProcessStage||error?.stage||'').slice(0,40);
 const hint=(en,th)=>english?en:th;
 const make=(key,enTitle,enMessage,thTitle,thMessage)=>({
  code:key,title:hint(enTitle,thTitle),message:hint(enMessage,thMessage),
  ...(stage?{stage}:{}),...(status?{status}:{})
 });
 if(code==='PORTRAIT_MODEL_UNAVAILABLE'||code==='PORTRAIT_MODEL_TIMEOUT'||stage==='prepare_model'){
  return make('model_initialization','Could not prepare photo tools','The face-analysis tools could not load. Check your connection and try again. No new generation was submitted at this stage.','โหลดเครื่องมือตรวจใบหน้าไม่สำเร็จ','ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง ขั้นตอนนี้ยังไม่ได้ส่งงานสร้างภาพใหม่');
 }
 if(status===429||code==='ACTIVE_AI_JOB'){
  return make('active_ai_job','A photo is already processing','Finish or cancel the previous AI job before starting another.','มีงาน AI กำลังประมวลผล','รอให้งานเดิมเสร็จหรือยกเลิกก่อน แล้วจึงสร้างภาพใหม่');
 }
 if(status===402||code==='credit_required'||code==='private_trial_inactive'){
  return make('credit_required','Photo credit required','Check your available photo credits before trying again.','ต้องมีสิทธิ์สร้างภาพ','ตรวจสอบสิทธิ์หรือเครดิตที่เหลือก่อนดำเนินการ');
 }
 if(status===401||status===403){
  return make('auth_required','Access verification needed','Sign in and check that your account can use this photo.','กรุณาตรวจสอบสิทธิ์','เข้าสู่ระบบและตรวจสอบสิทธิ์การใช้รูปนี้');
 }
 if(code==='PORTRAIT_MODEL_TIMEOUT'||/timed out|timeout|หมดเวลารอ|ใช้เวลานาน/i.test(message)){
  return make('timeout','Processing timed out','Check the photo job status before starting another generation.','ประมวลผลใช้เวลานานเกินไป','ตรวจสอบสถานะงานก่อนสร้างภาพใหม่ เพื่อป้องกันการใช้สิทธิ์ซ้ำ');
 }
 if(/failed to fetch|networkerror|fetch failed|load failed|network request failed/i.test(message)||status===502||status===503||status===504){
  return make('network','Connection interrupted','The connection was interrupted. Check the current job status before retrying.','การเชื่อมต่อขัดข้อง','ตรวจสอบสถานะงานที่กำลังทำอยู่ก่อนลองอีกครั้ง');
 }
 if(/ตรวจใบหน้า|ไม่พบใบหน้า|รูปหน้าตรง|แนวผม|ตำแหน่งคาง|ใบหน้าในรูปใหม่เล็ก|face.*detect|invalid image/i.test(message)){
  return make('face_validation','Could not analyze this face','Use a clear, front-facing photo showing the face and hairline.','ตรวจสอบใบหน้าในรูปไม่ได้','ลองใช้รูปหน้าตรงที่เห็นใบหน้าและแนวผมชัดเจน');
 }
 if(stage==='studio_hydrate'){
  return make('studio_hydrate','Could not open the finished photo','The image generation may have succeeded, but Studio could not load it into the editor. Check the existing result before generating again.','ไม่สามารถเปิดภาพผลลัพธ์ใน Studio','AI อาจสร้างภาพสำเร็จแล้ว แต่ Studio โหลดภาพเข้าเครื่องมือไม่ได้ กรุณาตรวจสอบผลงานเดิมก่อนสร้างใหม่');
 }
 if(stage==='compose'){
  return make('compose','Could not display the generated photo','The AI output may already be complete. Check the current job before starting another generation.','ประกอบภาพไม่สำเร็จ','งาน AI อาจสร้างเสร็จแล้ว กรุณาตรวจสอบงานเดิมก่อนสร้างใหม่');
 }
 if(status>=500){
  return make('server','Photo service unavailable','The photo service encountered an error. Check the current job before trying again.','ระบบสร้างภาพขัดข้อง','ตรวจสอบสถานะงานเดิมก่อนลองอีกครั้ง');
 }
 return make('unknown','Could not complete processing','The previous photo has been kept. Try again; if the issue continues, report the error stage shown below.','ประมวลผลไม่สำเร็จ','รูปเดิมยังอยู่ ลองอีกครั้ง หากยังผิดพลาดให้แจ้งขั้นตอนข้อผิดพลาดที่แสดงด้านล่าง');
}
