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
 if(error?.idpromRecoverableJob){
  return make('recover_result','AI finished — recover your photo','The photo was generated, but Studio could not finish displaying it. Choose Recover original result to reopen the SAME job without another AI generation or credit reservation.','AI สร้างรูปเสร็จแล้ว · รับผลเดิมได้','AI สร้างรูปสำเร็จ แต่ Studio เปิดผลไม่ครบ กด “รับผลเดิม” เพื่อเปิดงานเดิม โดยไม่สร้างซ้ำหรือจองเครดิตใหม่');
 }
 if(code==='AI_INPUT_REJECTED'||code==='AI_OUTPUT_REJECTED'||/SensitiveContentDetected/.test(message)){
  return make('provider_rejected','Image could not be generated','The image provider did not return a usable image. No photo will be substituted for a rejected output.','AI ไม่อนุญาตให้สร้างภาพนี้','ผู้ให้บริการ AI ไม่ส่งผลลัพธ์สำหรับภาพนี้ ระบบจะไม่ใช้ภาพอื่นแทน');
 }
 if(!english&&code==='face_proportion_changed'){
  return make('quality_check','Face proportions changed','The generated face differs substantially from the source. The previous photo is preserved.','โครงหน้าที่ AI สร้างเปลี่ยนจากต้นฉบับมากเกินไป','ระบบตรวจพบสัดส่วนใบหน้าเปลี่ยนชัดเจน จึงเก็บรูปเดิมไว้และไม่ใช้ผลนี้');
 }
 if(!english&&code==='selected_hairstyle_mismatch'){
  return make('quality_check','Hairstyle does not match','The selected hairstyle check failed. The previous photo is preserved.','ทรงผมที่สร้างยังไม่ตรงกับแบบที่เลือก','ระบบเก็บรูปเดิมไว้และไม่ใช้ผลทรงผมนี้');
 }
 if(stage==='quality_check'||code==='portrait_finish_incomplete'||code==='selected_hairstyle_mismatch'){
  return make('quality_check','The AI result needs another attempt','The generated result did not pass the face, hairstyle or cutout check. The previous photo is preserved.','ผลลัพธ์ AI ยังไม่ผ่านการตรวจ','รูปที่สร้างยังไม่ตรงเงื่อนไขใบหน้า ทรงผม หรือขอบภาพ ระบบเก็บรูปเดิมไว้');
 }
 if(code==='PORTRAIT_MODEL_UNAVAILABLE'||code==='PORTRAIT_MODEL_TIMEOUT'||stage==='prepare_model'){
  return make('model_initialization','Photo tools could not start','The face-analysis tools did not finish loading. Tap Retry to prepare them again; no new AI generation was submitted.','เตรียมเครื่องมือตรวจใบหน้าไม่สำเร็จ','ระบบยังโหลดเครื่องมือตรวจใบหน้าไม่ครบ กด “ลองอีกครั้ง” เพื่อเตรียมใหม่ ขั้นตอนนี้ยังไม่ได้ส่งงานสร้างภาพและยังไม่ใช้สิทธิ์');
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
 if(status===413){
  return make('upload_validation','Could not complete processing','The uploaded request exceeded an upload limit. Choose another photo or try again.','ประมวลผลไม่สำเร็จ','กรุณาตรวจสอบรูปหน้าตรงหรือเปลี่ยนรูป');
 }
 if(stage==='submit_job'&&(code==='REQUEST_TIMEOUT'||/failed to fetch|networkerror|fetch failed|load failed|network request failed/i.test(message))){
  return make('upload','Photo upload interrupted','The photo could not be uploaded or its receipt could not be confirmed. Your previous photo is kept. Check the existing job before trying again.','ส่งรูปไม่สำเร็จ','การอัปโหลดหรือการยืนยันรับรูปสะดุด รูปเดิมยังอยู่ กรุณาตรวจสอบงานเดิมก่อนลองอีกครั้ง');
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
 if(error?.idpromRecoverableJob||['local_finish','fetch_result','fetch_makeup','verify_rights'].includes(stage)){
  return make('recover_existing_ai','AI image created — reopening failed',
   'The AI result was completed and kept. Retry this same photo to reopen the existing result without starting another AI generation or using another credit.',
   'AI สร้างภาพสำเร็จแล้ว แต่ Studio เปิดผลไม่ได้',
   'ระบบเก็บผล AI เดิมไว้แล้ว กดประมวลผลรูปเดิมอีกครั้งเพื่อรับผลเดิม ไม่ส่งสร้างใหม่และไม่หักเครดิตซ้ำ');
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
 return make('unknown','Could not complete processing','The previous photo has been kept. Try again; if the issue continues, report the error stage shown below.','ประมวลผลไม่สำเร็จ','กรุณาตรวจสอบรูปหน้าตรงหรือเปลี่ยนรูป');
}
