export const PAID_WORK_EXIT_MESSAGE='หากไม่ได้บันทึกหรือดาวน์โหลด งานที่ชำระเงินแล้วจะหาย และไม่สามารถเรียกคืนงานหรือขอคืนเงินได้';

// The caller scopes both collections to the current authenticated account.
// Wallet balances and account-wide privileges never establish a paid work.
export function hasPaidDownloadForJobs(ids,verifiedJobs={},paidOutputIds=[]){
 if(!Array.isArray(ids))return false;
 const paid=new Set(Array.isArray(paidOutputIds)?paidOutputIds:[]);
 return ids.some(id=>{
  if(typeof id!=='string'||!id)return false;
  const right=verifiedJobs?.[id];
  if(right&&Object.prototype.hasOwnProperty.call(right,'paidDownload'))return right.paidDownload===true&&right.checked!==false;
  // Older servers omit paidDownload but provide authoritative job grant IDs.
  return paid.has(id);
 });
}

export function attachPaidBeforeUnload(enabled,target=globalThis.window){
 if(!enabled||!target?.addEventListener)return()=>{};
 const warn=event=>{event.preventDefault();event.returnValue=PAID_WORK_EXIT_MESSAGE};
 target.addEventListener('beforeunload',warn);
 return()=>target.removeEventListener('beforeunload',warn);
}
