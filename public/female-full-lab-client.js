import {addSkinControls} from './seedream-pro-skin-controls.js';
const $=id=>document.getElementById(id),form=$('form'),go=$('go'),status=$('status'),check=$('check'),results=$('results');
const labConfig=document.documentElement.dataset;
const labEndpoint=labConfig.endpoint||'/api/seedream-pro-lab';
const modelLabel=labConfig.modelLabel||'Dola-Seedream-5.0-pro',sizeLabel=labConfig.sizeLabel||'2K';
const storageKey=labConfig.storageKey||'seedream-pro-lab-active-v1';let activeId=null,busy=false,checking=false,referenceLoading=false;const urls=[];
const labels={outfit:'ชุด',person:'คน',hair:'ผม'};
function restoreSnapshot(snapshot){if(!snapshot)return;$('prompt').value=snapshot.prompt;$('order').value=snapshot.order;for(const name of Object.keys(labels)){if(snapshot.files?.[name]){const transfer=new DataTransfer();transfer.items.add(snapshot.files[name]);const input=form.elements[name];input.files=transfer.files;input.dispatchEvent(new Event('change'));}}orderLabels();}
const setBusy=value=>{busy=value;for(const control of form.elements)control.disabled=value;};
const remember=id=>{try{id?sessionStorage.setItem(storageKey,id):sessionStorage.removeItem(storageKey)}catch{}};
function orderLabels(){const order=(labConfig.referenceOrder||$('order').value).split('-');for(const name of order){const label=form.querySelector(`[data-kind="${name}"]`);label.style.order=order.indexOf(name);label.querySelector('.number').textContent=labConfig.facePreparation&&!labConfig.referenceOrder?'ต้นฉบับ · '+labels[name]:`Image ${order.indexOf(name)+1} · ${labels[name]}`;}}
$('order').addEventListener('change',orderLabels);
for(const input of form.querySelectorAll('input[type=file]'))input.addEventListener('change',()=>{const img=input.parentElement.querySelector('img'),placeholder=img.nextElementSibling;if(img.dataset.url)URL.revokeObjectURL(img.dataset.url);img.hidden=!input.files.length;placeholder.hidden=!!input.files.length;if(input.files.length){img.src=URL.createObjectURL(input.files[0]);img.dataset.url=img.src;}const selected=form.querySelector(`[data-selection="${input.name}"]`);if(selected)selected.textContent=input.dataset.catalogueName||input.files[0]?.name||'';delete input.dataset.catalogueName;});
const picker=$('catalogue-dialog'),grid=$('catalogue-grid'),pickerStatus=$('catalogue-status');let cataloguePromise,pickerKind='outfit',selectionSequence=0,selectionAbort=null;
function renderCatalogue(catalogue){
 const gender=$('catalogue-gender').value,category=$('catalogue-category').value,search=$('catalogue-search').value.trim().toLocaleLowerCase();
 const items=(pickerKind==='outfit'?catalogue.outfits:catalogue.hairs).filter(item=>(gender==='all'||item.gender==='all'||item.gender===gender)&&(pickerKind==='hair'||category==='all'||item.group===category)&&`${item.name} ${item.groupName} ${item.id}`.toLocaleLowerCase().includes(search));
 grid.replaceChildren();pickerStatus.textContent=items.length?`${items.length} ตัวเลือก`:'ไม่พบตัวเลือก';
 for(const item of items){const button=document.createElement('button');button.type='button';button.className='catalogue-item';button.dataset.catalogueId=item.id;button.disabled=referenceLoading;const image=document.createElement('img');image.src=item.preview;image.alt=item.name;image.loading='lazy';const name=document.createElement('span');name.textContent=item.name;button.append(image,name);button.onclick=()=>selectCatalogueItem(item);grid.append(button);}
}
async function selectCatalogueItem(item){
 if(referenceLoading||busy)return;const sequence=++selectionSequence,kind=pickerKind,controller=new AbortController();selectionAbort=controller;referenceLoading=true;go.disabled=true;pickerStatus.textContent='กำลังโหลดไฟล์ต้นฉบับ…';for(const button of grid.querySelectorAll('button'))button.disabled=true;
 try{
  const response=await fetch(item.reference+'?v='+item.sha256.slice(0,12),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});if(!response.ok)throw Error('โหลดไฟล์ต้นฉบับไม่สำเร็จ');const blob=await response.blob();
  if(sequence!==selectionSequence||!picker.open)return;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');if(hash!==item.sha256)throw Error('ไฟล์บนเว็บกำลังอัปเดต กรุณารีเฟรชแล้วเลือกใหม่');
  if(sequence!==selectionSequence||!picker.open)return;
  const input=form.elements[kind],transfer=new DataTransfer();transfer.items.add(new File([blob],item.reference.split('/').at(-1),{type:blob.type}));input.files=transfer.files;input.dataset.catalogueName=item.name;input.dispatchEvent(new Event('change'));picker.close();
 }catch(error){if(sequence===selectionSequence&&picker.open)pickerStatus.textContent=error.message||'เลือกไฟล์ไม่สำเร็จ';}finally{if(selectionAbort===controller){selectionAbort=null;referenceLoading=false;if(!busy)go.disabled=false;for(const button of grid.querySelectorAll('button'))button.disabled=false;}}
}
async function openCatalogue(kind){
 if(busy||referenceLoading)return;pickerKind=kind;$('catalogue-title').textContent=kind==='outfit'?'เลือกชุดจากเว็บหลัก':'เลือกทรงผมจากเว็บหลัก';$('catalogue-category-wrap').hidden=kind==='hair';$('catalogue-search').value='';grid.replaceChildren();pickerStatus.textContent='กำลังโหลดตัวเลือก…';picker.showModal();
 try{cataloguePromise??=fetch('/seedream-pro-lab-catalogue.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('โหลดตัวเลือกไม่สำเร็จ');return response.json();});const catalogue=await cataloguePromise;if(picker.open)renderCatalogue(catalogue);}catch{cataloguePromise=null;pickerStatus.textContent='โหลดตัวเลือกไม่สำเร็จ ปิดแล้วลองใหม่ได้ค่ะ';}
}
for(const button of form.querySelectorAll('[data-catalogue]'))button.onclick=()=>openCatalogue(button.dataset.catalogue);
$('catalogue-close').onclick=()=>picker.close();picker.addEventListener('close',()=>{selectionSequence++;selectionAbort?.abort();});
for(const id of ['catalogue-gender','catalogue-category','catalogue-search'])$(id).addEventListener(id==='catalogue-search'?'input':'change',async()=>{try{if(!referenceLoading&&cataloguePromise)renderCatalogue(await cataloguePromise);}catch{}});
function showResult(blob,snapshot,flashStatus=null,id=null){
 const url=URL.createObjectURL(blob);urls.push(url);const card=document.createElement('article');card.className='result';
 const time=document.createElement('time');time.textContent=new Date().toLocaleString('th-TH');
 const caption=document.createElement('p');caption.className='caption';caption.textContent=snapshot?.prompt||labConfig.resultLabel||'ภาพดิบจาก AI · กู้คืนงานเดิม';
 const settings=document.createElement('div');settings.className='settings';for(const value of [modelLabel,flashStatus==='success'?'Flash 5.0 · ผลขั้นที่ 2':flashStatus==='fallback'?'Flash ไม่สำเร็จ · ใช้ V6 เดิม':null,sizeLabel,'Smart ratio','1 ภาพ',labConfig.resultReferences||snapshot?.order?.split('-').map(k=>labels[k]).join(' · ')].filter(Boolean)){const tag=document.createElement('span');tag.textContent=value;settings.append(tag);}
 const preview=document.createElement('div');preview.className='preview';const image=document.createElement('img');image.src=url;image.alt=labConfig.resultLabel||'ภาพต้นฉบับจาก '+modelLabel;preview.append(image);
 const actions=document.createElement('div');actions.className='actions';const edit=document.createElement('button');edit.type='button';edit.textContent='แก้ไข';edit.onclick=()=>{if(busy)return;restoreSnapshot(snapshot);form.scrollIntoView({behavior:'smooth'});$('prompt').focus();};
 const regenerate=document.createElement('button');regenerate.type='button';regenerate.textContent='สร้างอีกครั้ง';regenerate.onclick=()=>{if(busy)return;restoreSnapshot(snapshot);form.requestSubmit();};
 const download=document.createElement('a');download.className='download';download.href=url;download.download=labConfig.downloadName||'seedream-pro-original.png';download.textContent='ดาวน์โหลด PNG';actions.append(edit,regenerate,download);if(flashStatus&&id){const baseUrl=labEndpoint+'/'+encodeURIComponent(id)+'/base';const baseDownload=document.createElement('a');baseDownload.className='download';baseDownload.href=baseUrl;baseDownload.download='female-v6-original.png';baseDownload.textContent='ดาวน์โหลด V6 ก่อน Flash';actions.append(baseDownload);if(flashStatus==='success'){const compare=document.createElement('button');compare.type='button';compare.textContent='ดู V6 ก่อน Flash';let showingBase=false;compare.onclick=()=>{showingBase=!showingBase;image.src=showingBase?baseUrl:url;compare.textContent=showingBase?'ดูผล Flash':'ดู V6 ก่อน Flash';};actions.prepend(compare);}}card.append(time,caption,settings,preview,actions);results.prepend(card);results.hidden=false;if(labConfig.skinControls!=='off')addSkinControls({card,preview,image,blob,originalUrl:url});
 if(results.children.length>5){results.lastElementChild.skinControlsDispose?.();results.lastElementChild.remove();URL.revokeObjectURL(urls.shift());}card.scrollIntoView({behavior:'smooth',block:'start'});
}
async function poll(id,snapshot){
 if(checking)return;checking=true;check.hidden=true;
 try{
  for(let n=0;n<(labConfig.flashFinish==='on'?300:150);n++){
   let response;try{response=await fetch(labEndpoint+'/'+encodeURIComponent(id),{cache:'no-store',signal:AbortSignal.timeout(20000)});}catch{throw Error('การเชื่อมต่อขัดข้อง กดตรวจผลอีกครั้งได้โดยไม่สร้างงานใหม่');}
   if(response.status===202){const state=await response.json().catch(()=>({}));status.textContent=state.phase==='flash'?'กำลังส่งภาพ V6 ที่เสร็จแล้วไป Flash 5.0…':'กำลังสร้างภาพ…';await new Promise(resolve=>setTimeout(resolve,2000));continue;}
   if(!response.ok){const detail=await response.json();activeId=null;remember(null);setBusy(false);throw Error(detail.error||'ประมวลผลไม่สำเร็จ');}
   const blob=await response.blob();if(blob.type!=='image/png')throw Error('ข้อมูลภาพไม่สมบูรณ์ กรุณาตรวจผลอีกครั้ง');
   const flashStatus=response.headers.get('x-lab-flash-status');showResult(blob,snapshot,flashStatus,id);activeId=null;remember(null);setBusy(false);status.textContent=flashStatus==='fallback'?'Flash ไม่สำเร็จ · แสดงภาพ V6 เดิม':flashStatus==='success'?'สร้างเสร็จ · V6 และ Flash 5.0':labConfig.resultLabel||'สร้างเสร็จแล้ว · ภาพดิบจาก AI';return;
  }
  throw Error('ยังไม่พบผลลัพธ์ กดตรวจผลอีกครั้งได้โดยไม่สร้างงานใหม่');
 }catch(error){status.textContent=error.message;check.hidden=!activeId;}finally{checking=false;}
}
check.onclick=()=>activeId&&poll(activeId,null);
form.addEventListener('submit',async event=>{
 event.preventDefault();if(busy||referenceLoading)return;
 const data=new FormData(form),id=crypto.randomUUID(),snapshot={prompt:data.get('prompt'),order:data.get('order'),files:Object.fromEntries(Object.keys(labels).map(name=>[name,data.get(name)]))};data.append('requestId',id);activeId=id;remember(id);setBusy(true);status.textContent='กำลังส่งภาพ…';
 try{
  if(labConfig.facePreparation){status.textContent='กำลังเตรียมใบหน้าสำหรับภาพหลัก…';const {prepareLabSubmission}=await import(labConfig.guideModule||'./female-production-lab-guide.js');try{await prepareLabSubmission(data);}catch(error){activeId=null;remember(null);setBusy(false);throw error;}status.textContent='กำลังส่งภาพ…';}
  const response=await fetch(labEndpoint,{method:'POST',body:data,signal:AbortSignal.timeout(60000)});
  if(!response.ok){const detail=await response.json();activeId=null;remember(null);setBusy(false);throw Error(detail.error||'ส่งภาพไม่สำเร็จ');}
  const result=await response.json();if(result.id!==id)throw Error('ยังยืนยันงานไม่ได้ กรุณากดตรวจผลอีกครั้ง');
  await poll(id,snapshot);
 }catch(error){status.textContent=error.message||'การเชื่อมต่อขัดข้อง';check.hidden=!activeId;}
});
try{const response=await fetch(labConfig.promptUrl||'/seedream-pro-lab-prompt.txt',{cache:'no-store'});if(!response.ok)throw Error();$('prompt').value=await response.text();go.disabled=false;}catch{status.textContent='โหลด Prompt ไม่สำเร็จ วาง Prompt ของคุณเพื่อเริ่มได้เลย';go.disabled=false;}
try{activeId=sessionStorage.getItem(storageKey);}catch{}
if(activeId){setBusy(true);void poll(activeId,null);}orderLabels();
