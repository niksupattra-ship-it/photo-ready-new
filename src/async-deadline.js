// Keep callback-based resources from holding the editor busy indefinitely.
export function withDeadline(start,{timeoutMs=30000,message='การทำงานใช้เวลานานเกินไป กรุณาลองใหม่',code='ASYNC_TIMEOUT',onTimeout,onLateResolve}={}){
 return new Promise((resolve,reject)=>{
  let settled=false,timedOut=false;
  const cleanup=(callback,value)=>{
   try{Promise.resolve(callback?.(value)).catch(()=>{})}catch{}
  };
  const timer=setTimeout(()=>{
   if(settled)return;
   settled=true;timedOut=true;
   const error=Object.assign(Error(message),{code});
   cleanup(onTimeout,error);reject(error);
  },timeoutMs);
  const finish=(succeeded,value)=>{
   if(settled){if(timedOut&&succeeded)cleanup(onLateResolve,value);return}
   settled=true;clearTimeout(timer);
   if(succeeded)resolve(value);else reject(value);
  };
  try{
   const pending=typeof start==='function'?start():start;
   Promise.resolve(pending).then(value=>finish(true,value),error=>finish(false,error));
  }catch(error){finish(false,error)}
 });
}
