const $=id=>document.getElementById(id),form=$('form'),go=$('go'),status=$('status'),check=$('check'),results=$('results');
const storageKey='seedream-pro-lab-active-v1';let activeId=null,busy=false,checking=false;const urls=[];
const labels={outfit:'ชุด',person:'คน',hair:'ผม'};
function restoreSnapshot(snapshot){if(!snapshot)return;$('prompt').value=snapshot.prompt;$('order').value=snapshot.order;for(const name of Object.keys(labels)){if(snapshot.files?.[name]){const transfer=new DataTransfer();transfer.items.add(snapshot.files[name]);const input=form.elements[name];input.files=transfer.files;input.dispatchEvent(new Event('change'));}}orderLabels();}
const setBusy=value=>{busy=value;for(const control of form.elements)control.disabled=value;};
const remember=id=>{try{id?sessionStorage.setItem(storageKey,id):sessionStorage.removeItem(storageKey)}catch{}};
function orderLabels(){const order=$('order').value.split('-');for(const name of order){const label=form.querySelector(`[data-kind="${name}"]`);label.style.order=order.indexOf(name);label.querySelector('.number').textContent=`Image ${order.indexOf(name)+1} · ${labels[name]}`;}}
$('order').addEventListener('change',orderLabels);
for(const input of form.querySelectorAll('input[type=file]'))input.addEventListener('change',()=>{const img=input.parentElement.querySelector('img'),placeholder=img.nextElementSibling;if(img.dataset.url)URL.revokeObjectURL(img.dataset.url);img.hidden=!input.files.length;placeholder.hidden=!!input.files.length;if(input.files.length){img.src=URL.createObjectURL(input.files[0]);img.dataset.url=img.src;}});
function showResult(blob,snapshot){
 const url=URL.createObjectURL(blob);urls.push(url);const card=document.createElement('article');card.className='result';
 const time=document.createElement('time');time.textContent=new Date().toLocaleString('th-TH');
 const caption=document.createElement('p');caption.className='caption';caption.textContent=snapshot?.prompt||'ภาพดิบจาก AI · กู้คืนงานเดิม';
 const settings=document.createElement('div');settings.className='settings';for(const value of ['Dola-Seedream-5.0-pro','1.5K','Smart ratio','1 ภาพ',snapshot?.order?.split('-').map(k=>labels[k]).join(' · ')].filter(Boolean)){const tag=document.createElement('span');tag.textContent=value;settings.append(tag);}
 const preview=document.createElement('div');preview.className='preview';const image=document.createElement('img');image.src=url;image.alt='ภาพต้นฉบับจาก Seedream Pro';preview.append(image);
 const actions=document.createElement('div');actions.className='actions';const edit=document.createElement('button');edit.type='button';edit.textContent='แก้ไข';edit.onclick=()=>{if(busy)return;restoreSnapshot(snapshot);form.scrollIntoView({behavior:'smooth'});$('prompt').focus();};
 const regenerate=document.createElement('button');regenerate.type='button';regenerate.textContent='สร้างอีกครั้ง';regenerate.onclick=()=>{if(busy)return;restoreSnapshot(snapshot);form.requestSubmit();};
 const download=document.createElement('a');download.className='download';download.href=url;download.download='seedream-pro-original.png';download.textContent='ดาวน์โหลด PNG';actions.append(edit,regenerate,download);card.append(time,caption,settings,preview,actions);results.prepend(card);results.hidden=false;
 if(results.children.length>5){results.lastElementChild.remove();URL.revokeObjectURL(urls.shift());}card.scrollIntoView({behavior:'smooth',block:'start'});
}
async function poll(id,snapshot){
 if(checking)return;checking=true;check.hidden=true;
 try{
  for(let n=0;n<150;n++){
   let response;try{response=await fetch('/api/seedream-pro-lab/'+encodeURIComponent(id),{cache:'no-store',signal:AbortSignal.timeout(20000)});}catch{throw Error('การเชื่อมต่อขัดข้อง กดตรวจผลอีกครั้งได้โดยไม่สร้างงานใหม่');}
   if(response.status===202){status.textContent='กำลังสร้างภาพ…';await new Promise(resolve=>setTimeout(resolve,2000));continue;}
   if(!response.ok){const detail=await response.json();activeId=null;remember(null);setBusy(false);throw Error(detail.error||'ประมวลผลไม่สำเร็จ');}
   const blob=await response.blob();if(blob.type!=='image/png')throw Error('ข้อมูลภาพไม่สมบูรณ์ กรุณาตรวจผลอีกครั้ง');
   showResult(blob,snapshot);activeId=null;remember(null);setBusy(false);status.textContent='สร้างเสร็จแล้ว · ภาพดิบจาก AI';return;
  }
  throw Error('ยังไม่พบผลลัพธ์ กดตรวจผลอีกครั้งได้โดยไม่สร้างงานใหม่');
 }catch(error){status.textContent=error.message;check.hidden=!activeId;}finally{checking=false;}
}
check.onclick=()=>activeId&&poll(activeId,null);
form.addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;
 const data=new FormData(form),id=crypto.randomUUID(),snapshot={prompt:data.get('prompt'),order:data.get('order'),files:Object.fromEntries(Object.keys(labels).map(name=>[name,data.get(name)]))};data.append('requestId',id);activeId=id;remember(id);setBusy(true);status.textContent='กำลังส่งภาพ…';
 try{
  const response=await fetch('/api/seedream-pro-lab',{method:'POST',body:data,signal:AbortSignal.timeout(60000)});
  if(!response.ok){const detail=await response.json();activeId=null;remember(null);setBusy(false);throw Error(detail.error||'ส่งภาพไม่สำเร็จ');}
  const result=await response.json();if(result.id!==id)throw Error('ยังยืนยันงานไม่ได้ กรุณากดตรวจผลอีกครั้ง');
  await poll(id,snapshot);
 }catch(error){status.textContent=error.message||'การเชื่อมต่อขัดข้อง';check.hidden=!activeId;}
});
try{const response=await fetch('/seedream-pro-lab-prompt.txt',{cache:'no-store'});if(!response.ok)throw Error();$('prompt').value=await response.text();go.disabled=false;}catch{status.textContent='โหลด Prompt ไม่สำเร็จ วาง Prompt ของคุณเพื่อเริ่มได้เลย';go.disabled=false;}
try{activeId=sessionStorage.getItem(storageKey);}catch{}
if(activeId){setBusy(true);void poll(activeId,null);}orderLabels();
