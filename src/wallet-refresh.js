export function hasWalletBalance(data){
 const value=data?.processRemaining??data?.generationRemaining;
 return (typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))&&Number(value)>=0;
}

export function walletScope(token='',walletId=''){return JSON.stringify([token,walletId])}

// Share reads across the page and credit dialog. Responses belong to the
// identity that started them, including an anonymous wallet being created.
export function createWalletRefresh({session,headers,request,writeWallet,onData,onLoading,onError,onUnauthorized}){
 const pending=new Map();let revision=0;
 const invalidate=()=>{revision++;pending.clear()};
 const load=()=>{
  let expected={...session()};
  const key=walletScope(expected.token,expected.walletId),generation=revision;
  if(pending.has(key))return pending.get(key);
  const current=()=>generation===revision&&walletScope(session().token,session().walletId)===walletScope(expected.token,expected.walletId);
  const assertCurrent=()=>{
   if(walletScope(session().token,session().walletId)!==walletScope(expected.token,expected.walletId))throw Object.assign(Error('บัญชีเปลี่ยนแล้ว กรุณาตรวจสอบเครดิตอีกครั้ง'),{code:'WALLET_SCOPE_CHANGED'});
   if(generation!==revision)throw Object.assign(Error('ข้อมูลเครดิตอัปเดตแล้ว กรุณาตรวจสอบอีกครั้ง'),{code:'WALLET_REFRESH_SUPERSEDED'});
  };
  const run=async()=>{
   try{
    assertCurrent();onLoading?.(key);
    let creating=!expected.token&&!expected.walletId;
    let response=await request('/api/wallet?summary=1',{...(creating?{method:'POST'}:{}),headers:headers(),cache:'no-store'},15000);
    assertCurrent();
    // A missing guest wallet can be recreated once. Never replace a member's
    // wallet merely because its balance could not be read.
    if(response.status===404&&!expected.token&&!creating){
     writeWallet('');expected={...session()};assertCurrent();creating=true;
     response=await request('/api/wallet?summary=1',{method:'POST',headers:headers(),cache:'no-store'},15000);
     assertCurrent();
    }
    if(response.status===401){
     onUnauthorized?.();
     throw Object.assign(Error('กรุณาเข้าสู่ระบบด้วยบัญชีเดิมเพื่อตรวจสอบเครดิต'),{code:'WALLET_AUTH_REQUIRED'});
    }
    const data=await response.json();assertCurrent();
    if(!response.ok)throw Error(data.message||'โหลดเครดิตไม่สำเร็จ กรุณาลองใหม่');
    if(!data.walletId||!hasWalletBalance(data))throw Error('ยังตรวจสอบยอดเครดิตไม่ได้ กรุณาลองใหม่');
    if(data.walletId!==expected.walletId){writeWallet(data.walletId);expected={...session()};assertCurrent()}
    onData?.(data,walletScope(expected.token,expected.walletId));
    return data;
   }catch(error){if(current())onError?.(error,walletScope(expected.token,expected.walletId));throw error}
  };
  const task=Promise.resolve().then(run);pending.set(key,task);
  task.then(()=>{if(pending.get(key)===task)pending.delete(key)},()=>{if(pending.get(key)===task)pending.delete(key)});
  return task;
 };
 return {load,invalidate};
}
