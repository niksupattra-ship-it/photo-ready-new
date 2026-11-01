// Recover only the owned work attached to the previous output. The submission
// route must still prove the original image through beginWork before queuing.
export async function recoverPortraitWork(policy,wallet,fields){
 if(fields.downloadWorkId||!fields.sourceJobId)return fields.downloadWorkId||'';
 if(typeof fields.sourceJobId!=='string'||fields.sourceJobId.length>200)throw Object.assign(Error('รหัสงานต้นทางไม่ถูกต้อง'),{status:400});
 const work=await policy.scopeForJob(wallet,fields.sourceJobId);
 if(!/^dwork_[a-f0-9]{36}$/.test(work))throw Object.assign(Error('ยังคืนสิทธิ์งานเดิมไม่ได้ กรุณาเปิดงานเดิมอีกครั้ง ไม่ต้องชำระเงินซ้ำ'),{status:409});
 return work;
}
