import {runPhotoScanWorker} from './photo-scan-worker-client.js';
import {withDeadline} from './async-deadline.js';
import {assessUploadPortrait} from './photo-upload-assessment.js';
import './photo-upload-scan.css';

export async function inspectUploadPortrait(file,{onProgress=()=>{},signal}={}){
 let url;try{
  onProgress(5,'กำลังเปิดรูป');url=URL.createObjectURL(file);const im=new Image();im.src=url;
  await withDeadline(()=>im.decode(),{timeoutMs:10000,code:'UPLOAD_SCAN_UNAVAILABLE'});
  if(signal?.aborted)throw Object.assign(Error('scan cancelled'),{name:'AbortError'});
  const scale=Math.min(1,1024/Math.max(im.naturalWidth,im.naturalHeight));
  const canvas=Object.assign(document.createElement('canvas'),{width:Math.max(1,Math.round(im.naturalWidth*scale)),height:Math.max(1,Math.round(im.naturalHeight*scale))});
  canvas.getContext('2d').drawImage(im,0,0,canvas.width,canvas.height);
  const bitmap=await withDeadline(()=>createImageBitmap(canvas),{timeoutMs:5000,onLateResolve:b=>b.close()});
  return assessUploadPortrait(await runPhotoScanWorker(bitmap,{onProgress,signal}));
 }finally{if(url)URL.revokeObjectURL(url)}
}

// One transient dialog owns the candidate only. The editor is untouched until
// this resolves true; rejecting/cancelling never resets paid work or its history.
export async function scanNewPortrait(file,{inspect=inspectUploadPortrait,onChangePhoto}={}){
 const previous=document.activeElement,url=URL.createObjectURL(file),host=document.createElement('div');host.className='photo-upload-scan';
 host.innerHTML='<section class="photo-upload-scan-card" role="dialog" aria-modal="true" aria-labelledby="photo-upload-scan-title"><button type="button" class="photo-upload-scan-close" aria-label="ยกเลิก">×</button><h2 id="photo-upload-scan-title">กำลังตรวจรูปก่อนเริ่ม</h2><div class="photo-upload-scan-image"><img alt="รูปที่กำลังตรวจ"/><div class="photo-upload-scan-beam" aria-hidden="true"></div></div><div class="photo-scan-progress" role="progressbar" aria-label="ความคืบหน้าตรวจรูป" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><strong>0%</strong><div class="photo-scan-track"><i></i></div></div><div class="photo-upload-scan-copy" role="status" aria-live="polite">กำลังตรวจใบหน้า คอ ไหล่ และอกส่วนบน…</div><div class="photo-upload-scan-actions"></div></section>';
 host.querySelector('img').src=url;document.body.append(host);const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
 let done=false,attempt=0,finish,controller;
 const answer=new Promise(resolve=>{finish=value=>{if(done)return;done=true;attempt++;controller?.abort();host.remove();URL.revokeObjectURL(url);document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',keys,true);previous?.focus?.();resolve(value)}});
 const keys=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false)}if(e.key==='Tab'){const buttons=[...host.querySelectorAll('button')];const i=buttons.indexOf(document.activeElement);e.preventDefault();buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus()}};
 document.addEventListener('keydown',keys,true);const close=host.querySelector('button');close.onclick=()=>finish(false);close.focus();
 const title=host.querySelector('h2'),copy=host.querySelector('.photo-upload-scan-copy'),actions=host.querySelector('.photo-upload-scan-actions');
 const button=(text,click)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=click;actions.append(b)};
 const run=async()=>{
  controller?.abort();controller=new AbortController();const id=++attempt;host.dataset.state='scanning';title.textContent='กำลังตรวจรูปก่อนเริ่ม';copy.textContent='กำลังตรวจใบหน้า คอ ไหล่ และอกส่วนบน…';actions.replaceChildren();
  const progress=(value,label)=>{if(done||id!==attempt)return;const safe=Math.max(0,Math.min(99,Math.floor(value)));const bar=host.querySelector('.photo-scan-progress');bar.setAttribute('aria-valuenow',safe);bar.querySelector('strong').textContent=safe+'%';bar.querySelector('i').style.width=safe+'%';if(label)copy.textContent=label};
  progress(0,'กำลังเตรียมตรวจรูป');
  let report;try{report=await withDeadline(()=>inspect(file,{onProgress:progress,signal:controller.signal}),{timeoutMs:40000,onTimeout:()=>controller?.abort()})}catch{report={status:'unavailable'}}
  if(done||id!==attempt)return;
  if(!report||!['pass','reject','uncertain','unavailable'].includes(report.status))report={status:'unavailable'};
  host.dataset.state=report.status;
  if(report.status==='pass'){const bar=host.querySelector('.photo-scan-progress');bar.setAttribute('aria-valuenow','100');bar.querySelector('strong').textContent='100%';bar.querySelector('i').style.width='100%';title.textContent='รูปพร้อมใช้งาน';copy.textContent='ตรวจใบหน้า คอ ไหล่ และอกส่วนบนแล้ว กำลังไปขั้นตอนถัดไป';setTimeout(()=>finish(true),450);return}
  title.textContent='กรุณาใช้รูปที่เห็นคอ ไหล่ และอกส่วนบน';
  copy.textContent='';copy.hidden=true;
  button('เปลี่ยนรูปใหม่',()=>{finish(false);if(onChangePhoto)setTimeout(onChangePhoto,0)});
  button('ปิด',()=>finish(false));
 };
 void run();return answer;
}
