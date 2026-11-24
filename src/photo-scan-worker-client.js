// A main-thread watchdog can terminate even a synchronously stuck WASM worker.
export function runPhotoScanWorker(bitmap,{onProgress=()=>{},signal,timeoutMs=25000,createWorker=()=>new Worker('/assets/vision/mediapipe-1.0.1/portrait-scan-worker.js')}={}){
 return new Promise((resolve,reject)=>{
  let worker,timer,settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();if(error){bitmap.close?.();reject(error)}else resolve(value)};
  const abort=()=>finish(Object.assign(Error('scan cancelled'),{name:'AbortError'}));
  if(signal?.aborted){abort();return}
  try{
   worker=createWorker();signal?.addEventListener('abort',abort,{once:true});
   timer=setTimeout(()=>finish(Object.assign(Error('scan timed out'),{code:'UPLOAD_SCAN_UNAVAILABLE'})),timeoutMs);
   worker.onmessage=({data})=>{if(settled)return;if(data.type==='progress')onProgress(data.value,data.label);else if(data.type==='result')finish(null,data.evidence);else if(data.type==='error')finish(Error('scan unavailable'))};
   worker.onerror=()=>finish(Error('scan worker unavailable'));worker.onmessageerror=()=>finish(Error('scan response unavailable'));
   worker.postMessage({bitmap},[bitmap]);
  }catch(error){finish(error)}
 });
}
