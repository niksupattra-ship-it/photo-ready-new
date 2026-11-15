export function portraitTransferError(error,stage){
 if(error&&typeof error==='object')error.stage=stage;
 return error;
}
export async function submitPortraitTransfer(request,form,{headers={},source,originalAi=false,hashSource,assertActive=()=>{}}={}){
 try{
  // Only successful previous submissions carry this work ID. Reuse requires
  // the authenticated wallet plus a matching hash of its stored original.
  if(originalAi&&(form.get('downloadWorkId')||form.get('sourceJobId'))){
   const fields=Object.fromEntries([...form].filter(([,value])=>typeof value==='string'&&value!==undefined));
   delete fields.originalSourceIsImage;
   fields.reuseOriginalSource='1';fields.originalSourceSha256=await hashSource(source);assertActive();
   const response=await request('/api/ai-jobs',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(fields)},90000);
   if(response.status!==428)return response;
   const reason=await response.json();
   if(reason?.error!=='original_upload_required')throw Object.assign(Error('ไม่สามารถตรวจสอบต้นฉบับเดิมได้'),{status:428});
  }
  assertActive();
  return await request('/api/ai-jobs',{method:'POST',body:form,headers},90000);
 }catch(error){throw portraitTransferError(error,'submit_job')}
}
