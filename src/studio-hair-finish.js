// Send only the current visible composition and its editable hair coverage.
export async function requestHairFinish(source,mask,tone,{signal}={}){
 const fd=new FormData();fd.append('image',source,'studio-current.png');fd.append('mask',mask,'visible-hair.png');fd.append('tone',tone);
 const r=await fetch('/api/hair/finish',{method:'POST',body:fd,signal});
 if(!r.ok){const body=await r.json().catch(()=>null);throw Error(body?.message||'ปรับสีผมไม่สำเร็จ')}
 const blob=await r.blob();return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
}
export function canvasPngBlob(c){return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('เตรียมภาพผมไม่สำเร็จ')),'image/png'))}
