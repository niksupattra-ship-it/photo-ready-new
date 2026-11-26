const form=document.getElementById('form'),panel=document.getElementById('guide-panel'),image=document.getElementById('guide-image'),status=document.getElementById('guide-status');
const prepared=new WeakMap();let controller,url,sequence=0;
export function prepareFace(file){
 if(!file?.size)return Promise.reject(Error('กรุณาเลือกรูปหน้าตรง'));
 if(!prepared.has(file))prepared.set(file,new Promise((resolve,reject)=>{
  const worker=new Worker('/female-face-worker.js'),timer=setTimeout(()=>{worker.terminate();prepared.delete(file);reject(Error('เตรียมใบหน้าเกินเวลา กรุณาเลือกภาพใหม่'));},60000);
  const done=()=>{clearTimeout(timer);worker.terminate();};
  worker.onmessage=({data})=>{done();if(data.error){prepared.delete(file);reject(Error(data.error));}else resolve(data.blob);};
  worker.onerror=()=>{done();prepared.delete(file);reject(Error('โหลดเครื่องมือตรวจใบหน้าไม่สำเร็จ กรุณาลองใหม่'));};worker.postMessage({blob:file});
 }));return prepared.get(file);
}
async function preparePreview(){
 const current=++sequence;controller?.abort();controller=new AbortController();const requestController=controller;
 if(url){URL.revokeObjectURL(url);url=null;}image.removeAttribute('src');image.hidden=true;
 const person=form.elements.person.files[0],outfit=form.elements.outfit.files[0];panel.hidden=!person&&!outfit;
 if(!person||!outfit){status.textContent='เลือกรูปคนและชุดเพื่อดูภาพตั้งต้น';return;}
 status.textContent='กำลังวัดใบหน้าและจัดตำแหน่งกับชุด…';
 try{
  const face=await prepareFace(person);if(current!==sequence)return;
  const data=new FormData();data.set('outfit',outfit);data.set('face',face,'face.png');
  const response=await fetch('/api/female-full-lab/guide',{method:'POST',body:data,signal:AbortSignal.any([requestController.signal,AbortSignal.timeout(30000)])});
  if(!response.ok)throw Error('เตรียมภาพกับชุดนี้ไม่ได้ กรุณาเลือกชุดจากเว็บหลัก');
  const blob=await response.blob();if(current!==sequence)return;
  url=URL.createObjectURL(blob);image.src=url;image.hidden=false;
  status.textContent='นี่คือภาพหลักที่จะส่งให้ AI เติมผม เชื่อมคอ และแต่งหน้าในครั้งเดียว';
 }catch(error){if(current===sequence)status.textContent=error.message;}
}
export async function prepareLabSubmission(data){
 const face=await prepareFace(data.get('person'));data.set('face',face,'face.png');
}
for(const name of ['person','outfit'])form.elements[name].addEventListener('change',()=>{void preparePreview();});
