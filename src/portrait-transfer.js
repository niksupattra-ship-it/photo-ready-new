export function portraitTransferError(error,stage){
 if(error&&typeof error==='object')error.stage=stage;
 return error;
}
export function createPortraitSubmissionId(){
 const bytes=crypto.getRandomValues(new Uint8Array(18));
 return 'submit_'+Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
}
const submissionResponse=receipt=>new Response(JSON.stringify(receipt),{status:202,headers:{'Content-Type':'application/json'}});
const validReceipt=value=>/^job_[a-f0-9]{36}$/.test(value?.jobId||'');
const ambiguous=error=>[500,502,503,504].includes(error?.status)||['REQUEST_TIMEOUT','AI_SUBMIT_RECEIPT_INVALID'].includes(error?.code)||['TypeError','SyntaxError','TimeoutError'].includes(error?.name)||/failed to fetch|networkerror|fetch failed|load failed|network request failed/i.test(error?.message||'');
export async function recoverPortraitSubmission(request,submission,{headers={},onRecover=()=>{},cause,timeoutMs=30000,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 onRecover();const until=Date.now()+timeoutMs;let attempt=0;
 for(;;){
  try{
   // Keep receipt lookup alive with the submit's original owner even after
   // Cancel. The late actual job ID is required for safe cancellation.
   const response=await request('/api/ai-submissions/'+encodeURIComponent(submission),{headers,cache:'no-store'},Math.min(8000,Math.max(1,until-Date.now())));
   if(response.ok){const receipt=await response.json();if(validReceipt(receipt))return receipt;}
   else await response.text().catch(()=>{});
   if(response.status===401||response.status===403)throw Object.assign(Error('ตรวจสอบสิทธิ์งานเดิมไม่สำเร็จ'),{status:response.status});
  }catch(error){if(error.status===401||error.status===403)throw error;}
  if(Date.now()>=until)throw cause||Object.assign(Error('ยังยืนยันงานที่ส่งไปไม่ได้'),{code:'AI_SUBMIT_RECEIPT_INVALID'});
  await pause(Math.min(until-Date.now(),[400,800,1600,3000,5000][Math.min(attempt++,4)]));
 }
}
export async function submitPortraitTransfer(request,form,{headers={},source,originalAi=false,hashSource,assertActive=()=>{},onRecover,recovery={}}={}){
 const submission=form.get('clientSubmissionId');
 const send=async options=>{
  try{
   const response=await request('/api/ai-jobs',{method:'POST',...options},90000);
   if(!submission)return response;
   if([500,502,503,504].includes(response.status)){await response.text().catch(()=>{});throw Object.assign(Error('รับคำตอบจากงานสร้างภาพสะดุด'),{status:response.status});}
   if(!response.ok)return response;
   const receipt=await response.json();
   if(!validReceipt(receipt))throw Object.assign(Error('ยังยืนยันงานที่ส่งไปไม่ได้'),{code:'AI_SUBMIT_RECEIPT_INVALID'});
   return submissionResponse(receipt);
  }catch(error){
   if(!submission||!ambiguous(error))throw error;
   const receipt=await recoverPortraitSubmission(request,submission,{...recovery,headers,onRecover,cause:error});
   return submissionResponse(receipt);
  }
 };
 try{
  // Only successful previous submissions carry this work ID. Reuse requires
  // the authenticated wallet plus a matching hash of its stored original.
  if(source&&(form.get('downloadWorkId')||form.get('sourceJobId'))){
   const fields=Object.fromEntries([...form].filter(([,value])=>typeof value==='string'&&value!==undefined));
   delete fields.originalSourceIsImage;
   fields.originalSourceSha256=await hashSource(source);
   if(originalAi)fields.reuseOriginalSource='1';
   else{fields.reuseCanonicalInput='1';fields.canonicalInputSha256=await hashSource(form.get('image'));}
   assertActive();
   const response=await send({headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(fields)});
   if(response.status!==428)return response;
   const reason=await response.json();
   if(reason?.error!=='original_upload_required')throw Object.assign(Error('ไม่สามารถตรวจสอบต้นฉบับเดิมได้'),{status:428});
  }
  assertActive();
  return await send({body:form,headers});
 }catch(error){throw portraitTransferError(error,'submit_job')}
}
