let worker,sequence=0;const pending=new Map();
function stopWorker(){worker?.terminate();worker=null;for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('ปรับผิวไม่พร้อม ภาพต้นฉบับยังอยู่'));}pending.clear();}
function request(data){
 if(!worker){worker=new Worker('/seedream-pro-skin-worker.js');worker.onmessage=({data:result})=>{const item=pending.get(result.requestId);if(!item)return;pending.delete(result.requestId);clearTimeout(item.timer);result.ok?item.resolve(result):item.reject(Error(result.error));};worker.onerror=stopWorker;}
 const requestId=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(stopWorker,45000);pending.set(requestId,{resolve,reject,timer});worker.postMessage({...data,requestId});});
}
export function addSkinControls({card,preview,image,blob,originalUrl}){
 const id=crypto.randomUUID(),panel=document.createElement('div');panel.className='lab-skin';
 const toggle=document.createElement('button');toggle.type='button';toggle.textContent='ลองปรับผิวสว่าง';toggle.className='lab-skin-toggle';
 const editor=document.createElement('div');editor.hidden=true;const label=document.createElement('label');label.textContent='เพิ่มความสว่างผิว ';const value=document.createElement('output');value.textContent='0';label.append(value);
 const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='100';slider.value='0';slider.step='1';slider.disabled=true;slider.setAttribute('aria-label','ความสว่างผิว');label.append(slider);
 const compare=document.createElement('button');compare.type='button';compare.textContent='ดูภาพเดิม';compare.disabled=true;
 const reset=document.createElement('button');reset.type='button';reset.textContent='คืนค่า';reset.disabled=true;
 const download=document.createElement('a');download.className='download';download.textContent='ดาวน์โหลดภาพปรับผิว';download.download='seedream-skin-light.png';download.hidden=true;
 const status=document.createElement('p');status.className='lab-skin-status';status.setAttribute('role','status');status.textContent='ปรับจากภาพเดิม ไม่เรียกสร้างภาพเพิ่ม';editor.append(label,compare,reset,download);panel.append(toggle,status,editor);preview.after(panel);
 let revision=0,adjustedUrl=null,showOriginal=false,timer,disposed=false;
 const restore=()=>{revision++;clearTimeout(timer);slider.value='0';value.textContent='0';image.src=originalUrl;if(adjustedUrl)URL.revokeObjectURL(adjustedUrl);adjustedUrl=null;showOriginal=false;compare.textContent='ดูภาพเดิม';download.hidden=true;download.removeAttribute('href');status.textContent='ภาพต้นฉบับ';};
 toggle.onclick=async()=>{if(!editor.hidden)return;editor.hidden=false;toggle.disabled=true;status.textContent='กำลังตรวจขอบเขตผิว… ภาพเดิมยังอยู่';try{await request({kind:'prepare',id,blob});if(disposed)return;slider.disabled=false;compare.disabled=false;reset.disabled=false;status.textContent='เลื่อนเพื่อเพิ่มแสงผิวเบา ๆ โดยไม่เปลี่ยนรูปหน้า';}catch(error){status.textContent=error.message;toggle.disabled=false;editor.hidden=true;toggle.textContent='ลองปรับผิวอีกครั้ง';}};
 async function render(){const amount=Number(slider.value),current=++revision;value.textContent=String(amount);if(amount===0){restore();return;}status.textContent='กำลังปรับแสงผิว…';download.hidden=true;try{const result=await request({kind:'render',id,blob,amount});if(disposed||current!==revision)return;if(adjustedUrl)URL.revokeObjectURL(adjustedUrl);adjustedUrl=URL.createObjectURL(result.blob);image.src=showOriginal?originalUrl:adjustedUrl;download.href=adjustedUrl;download.hidden=false;status.textContent='ปรับเฉพาะแสงผิว · รูปหน้าและรายละเอียดเดิม';}catch(error){if(current===revision){image.src=originalUrl;status.textContent=error.message;}}}
 slider.oninput=()=>{revision++;value.textContent=slider.value;clearTimeout(timer);timer=setTimeout(render,130);};
 compare.onclick=()=>{showOriginal=!showOriginal;image.src=showOriginal?originalUrl:adjustedUrl||originalUrl;compare.textContent=showOriginal?'ดูภาพปรับผิว':'ดูภาพเดิม';};reset.onclick=restore;
 card.skinControlsDispose=()=>{disposed=true;revision++;clearTimeout(timer);if(adjustedUrl)URL.revokeObjectURL(adjustedUrl);worker?.postMessage({kind:'forget',id});};
}
