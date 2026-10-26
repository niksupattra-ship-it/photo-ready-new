// The submit response identifies the server job. Keep cancellation visible until
// that response settles, so a late job can be cancelled without losing its ID.
export function submitPortraitJob(operation,submit){
 const pending=Promise.resolve().then(submit).then(info=>{
  if(operation&&info?.jobId)operation.jobId=info.jobId;
  return info;
 });
 if(operation)operation.pendingSubmission=pending;
 return pending;
}
export function cancelPortraitJob(operation,settle){
 if(!operation)return Promise.resolve();
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
