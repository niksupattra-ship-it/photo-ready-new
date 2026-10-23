export function unavailableOutputRights(message='ยังตรวจสอบเครดิตไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง ไม่จำเป็นต้องชำระเงินซ้ำ',code='rights_unavailable'){
 return {unlocked:null,fullEdit:false,checked:false,message,code};
}
export async function fetchOutputRights(jobId,request,headers){
 if(!jobId)return unavailableOutputRights('ไม่พบรูปที่ต้องการ กรุณาเปิดงานหรือประมวลผลรูปก่อน','missing_output');
 try{
  const r=await request('/api/images/'+encodeURIComponent(jobId)+'/rights',{headers,cache:'no-store'});
  if(r.status===401||r.status===403)return unavailableOutputRights('กรุณาเข้าสู่ระบบด้วยบัญชีที่รับเครดิตไว้ แล้วลองอีกครั้ง ไม่จำเป็นต้องชำระเงินซ้ำ','auth_required');
  if(r.status===404)return unavailableOutputRights('ไม่พบงานของบัญชีนี้ กรุณาเปิดงานด้วยบัญชีเดิมแล้วลองอีกครั้ง','output_not_found');
  if(!r.ok)return unavailableOutputRights();
  const data=await r.json();
  if(typeof data?.unlocked!=='boolean')return unavailableOutputRights();
  return {...data,unlocked:data.unlocked,fullEdit:data.unlocked&&data.fullEdit===true,checked:true};
 }catch{return unavailableOutputRights()}
}
// Payment UI is reserved for an explicit successful verification of an unpaid image.
export function outputAccessResult(results){
 if(!results.length)return {allowed:false,purchase:false,message:'กรุณาเพิ่มรูปและประมวลผล หรือเปิดงานที่บันทึกไว้ก่อน'};
 const unknown=results.find(r=>typeof r?.unlocked!=='boolean'||r.checked===false);
 if(unknown||results.some(r=>!r))return {allowed:false,purchase:false,message:unknown?.message||unavailableOutputRights().message};
 return results.every(r=>r.unlocked===true)?{allowed:true,purchase:false}:{allowed:false,purchase:true,message:'รูปนี้ยังไม่ได้รับเครดิตดาวน์โหลด กรุณาเลือกแพ็กเกจ'};
}
export function mergeOutputRights(previous,results){
 return Object.fromEntries(results.map(([id,right])=>[id,right?.checked===false&&right.code==='rights_unavailable'&&previous[id]?.unlocked===true?previous[id]:right]));
}

