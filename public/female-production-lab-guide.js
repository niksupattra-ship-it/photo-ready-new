import {measureFemaleReference} from './female-reference-evidence-client.js';
const form=document.getElementById('form'),panel=document.getElementById('guide-panel'),image=document.getElementById('guide-image'),status=document.getElementById('guide-status');
let sequence=0,controller,url;
export async function prepareEvidence(file){return (await measureFemaleReference(file)).evidence;}
export async function prepareLabSubmission(data){data.set('femalePreplacedFace',JSON.stringify(await prepareEvidence(data.get('person'))));}
async function preview(){
 const current=++sequence;controller?.abort();controller=new AbortController();const active=controller;
 if(url)URL.revokeObjectURL(url);image.removeAttribute('src');image.hidden=true;
 const person=form.elements.person.files[0],outfit=form.elements.outfit.files[0];panel.hidden=!person&&!outfit;
 if(!person||!outfit){status.textContent='เลือกรูปคนและชุดเพื่อดูไกด์';return;}
 status.textContent='กำลังจัดไกด์ใบหน้า–คอใหม่ตามชุด…';
 try{
  const data=new FormData();data.set('person',person);data.set('outfit',outfit);await prepareLabSubmission(data);if(current!==sequence)return;
  const r=await fetch('/api/female-production-lab/guide',{method:'POST',body:data,signal:AbortSignal.any([active.signal,AbortSignal.timeout(30000)])});
  if(!r.ok)throw Error('เตรียมไกด์ไม่สำเร็จ กรุณาเลือกรูปหน้าตรงและชุดใหม่');
  const blob=await r.blob();if(current!==sequence)return;url=URL.createObjectURL(blob);image.src=url;image.hidden=false;
  status.textContent='ไกด์จริงจากรูปต้นฉบับและชุดปัจจุบัน ใช้เป็นภาพหลักส่ง AI';
 }catch(e){if(current===sequence)status.textContent=e.message;}
}
for(const name of ['person','outfit'])form.elements[name].addEventListener('change',()=>void preview());
