// Shared by production and the Pro lab: identical decoding, 960px sampling,
// face count/confidence and normalized evidence. Never sends a photo to a server.
export function createFemaleReferenceAnalyzer({createWorker=()=>new Worker('/female-face-worker.js?reference=shared-v1'),timeoutMs=60000}={}){
 const cache=new WeakMap();
 return function measureFemaleReference(file){
  if(!file?.size)return Promise.reject(Error('กรุณาเลือกรูปหน้าตรง'));
  if(!cache.has(file)){
   const pending=new Promise((resolve,reject)=>{
    let worker,timer;
    const done=()=>{clearTimeout(timer);worker?.terminate();};
    try{
     worker=createWorker();timer=setTimeout(()=>{done();reject(Error('ตรวจหน้าเกินเวลา กรุณาลองใหม่'));},timeoutMs);
     worker.onmessage=({data})=>{done();if(data.error||!data.evidence||!data.landmarks||!data.width||!data.height)reject(Error(data.error||'ไม่พบข้อมูลใบหน้า'));else resolve(data);};
     worker.onerror=()=>{done();reject(Error('โหลดเครื่องมือตรวจใบหน้าไม่สำเร็จ'));};
     worker.postMessage({blob:file,evidenceOnly:true});
    }catch(error){done();reject(error);}
   });cache.set(file,pending);
   pending.catch(()=>{if(cache.get(file)===pending)cache.delete(file)});
  }
  return cache.get(file);
 };
}
export const measureFemaleReference=createFemaleReferenceAnalyzer();
