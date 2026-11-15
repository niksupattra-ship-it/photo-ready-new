export function createPortraitOperation({scope,headers={},settled=false}={}){
 return {jobId:null,cancelled:false,cancelling:false,settled,finishing:false,finished:false,scope,headers:{...headers},readController:new AbortController()};
}
const cancelled=()=>Object.assign(Error('ยกเลิกการประมวลผลแล้ว'),{code:'USER_CANCELLED'});
export function assertPortraitOperationActive(operation,scope){
 if(operation?.scope!==undefined&&operation.scope!==scope){operation.cancelled=true;operation.readController?.abort()}
 if(operation?.cancelled)throw cancelled();
}
export function waitForPortraitOperation(ms,operation){
 const signal=operation?.readController?.signal;
 if(operation?.cancelled||signal?.aborted)return Promise.reject(cancelled());
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort)};
  const abort=()=>{cleanup();reject(cancelled())};
  const timer=setTimeout(()=>{cleanup();resolve()},ms);
  signal?.addEventListener('abort',abort,{once:true});
 });
}
// The submit response identifies the server job. Keep cancellation visible until
// that response settles, so a late job can be cancelled without losing its ID.
export function submitPortraitJob(operation,submit){
 if(operation?.pendingSubmission)return operation.pendingSubmission;
 const pending=Promise.resolve().then(()=>{
  // A user can cancel during local preparation before submission starts.
  // Never launch that later server request after cancellation was accepted.
  if(operation?.cancelled)throw Object.assign(Error('cancelled'),{code:'USER_CANCELLED'});
  return submit();
 }).then(info=>{
  if(operation&&info?.jobId)operation.jobId=info.jobId;
  return info;
 });
 if(operation)operation.pendingSubmission=pending;
 return pending;
}
export function cancelPortraitJob(operation,settle){
 if(!operation)return Promise.resolve();
 // Abort only status/result reads. Keep a pending POST alive so its actual
 // job ID can still be received and cancelled with the original owner's rights.
 operation.readController?.abort();
 if(operation.cancellation)return operation.cancellation;
 const pending=(async()=>{
  try{await operation.pendingSubmission}catch{
   // A failed submission has no known job to settle. The original request
   // reports its own failure; do not invent an ID or issue a replacement job.
  }
  if(operation.jobId&&!operation.settled)await settle();
 })();
 operation.cancellation=pending;
 pending.catch(()=>{if(operation.cancellation===pending)operation.cancellation=null});
 return pending;
}
