import {prepareEvidence} from './female-production-lab-guide.js';
const form=document.getElementById('form'),panel=document.getElementById('identity-panel'),image=document.getElementById('identity-image'),status=document.getElementById('identity-status');
let sequence=0,controller,url;
form.elements.person.addEventListener('change',async()=>{
 const current=++sequence;controller?.abort();controller=new AbortController();const active=controller;
 if(url){URL.revokeObjectURL(url);url=null;}image.removeAttribute('src');image.hidden=true;
 const person=form.elements.person.files[0];panel.hidden=!person;if(!person)return;
 status.textContent='กำลังเตรียมภาพใบหน้าจากต้นฉบับ…';
 try{
  const data=new FormData();data.set('person',person);data.set('femalePreplacedFace',JSON.stringify(await prepareEvidence(person)));if(current!==sequence)return;
  const response=await fetch(document.documentElement.dataset.identityEndpoint,{method:'POST',body:data,signal:AbortSignal.any([active.signal,AbortSignal.timeout(30000)])});
  if(!response.ok)throw Error('เตรียมภาพใบหน้าต้นฉบับไม่ได้ กรุณาเลือกรูปใหม่');
  const blob=await response.blob();if(current!==sequence)return;
  url=URL.createObjectURL(blob);image.src=url;image.hidden=false;status.textContent='ภาพที่ 4 ที่ส่งให้ AI จริง · ใช้รักษาลักษณะใบหน้าเดิม ส่วนขนาดและตำแหน่งยึดตามไกด์';
 }catch(error){if(current===sequence)status.textContent=error.message;}
});
