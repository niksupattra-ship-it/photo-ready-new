// Keep both the request and response-body read bounded after a banking-app return.
// Promise.race also releases the UI if a suspended fetch ignores its abort signal.
export async function requestPromptpay(url,{headers,method='GET',body,signal,read='json',timeoutMs=15000}={}){
 const aborted=()=>Object.assign(Error('ยกเลิกการตรวจสอบรายการแล้ว'),{name:'AbortError'});
 if(signal?.aborted)throw aborted();
 const controller=new AbortController();let timer,cancel;
 const deadline=new Promise((_,reject)=>{
  cancel=()=>{controller.abort();reject(aborted())};
  signal?.addEventListener('abort',cancel,{once:true});
  timer=setTimeout(()=>{controller.abort();reject(Object.assign(Error('ตรวจสอบรายการใช้เวลานาน กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง ไม่ต้องชำระเงินซ้ำ'),{name:'TimeoutError'}))},timeoutMs);
 });
 try{
  return await Promise.race([deadline,(async()=>{
   const response=await fetch(url,{method,body,headers,cache:'no-store',signal:controller.signal});
   let data;try{data=await response[read]()}catch(error){if(response.ok)throw error;data=null}
   return {response,data};
  })()]);
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel)}
}
