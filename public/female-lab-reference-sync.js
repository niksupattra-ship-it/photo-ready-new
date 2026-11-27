// Refresh selected native reference files before a new generation, not just their thumbnails.
export async function refreshLabReferences(form,data){
 const chosen=['hair','outfit'].map(kind=>({kind,input:form.elements[kind]})).filter(({input})=>input.dataset.catalogueId&&input.catalogueFile===data.get(input.name));
 if(!chosen.length)return;
 const response=await fetch('/seedream-pro-lab-catalogue.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('ตรวจเวอร์ชันทรงผมและชุดไม่สำเร็จ กรุณาลองใหม่');
 const catalogue=await response.json();
 const digest=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');
 for(const {kind,input} of chosen){
  const item=(kind==='hair'?catalogue.hairs:catalogue.outfits).find(x=>x.id===input.dataset.catalogueId&&x.reference===input.dataset.catalogueReference);
  if(!item)throw Error('รายการทรงผมหรือชุดเปลี่ยนแล้ว กรุณาเลือกใหม่จากเว็บหลัก');
  if(await digest(data.get(kind))===item.sha256)continue;
  const r=await fetch(item.reference+'?reference='+item.sha256,{cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error('อัปเดตไฟล์ทรงผมหรือชุดไม่สำเร็จ กรุณาลองใหม่');
  const blob=await r.blob();if(await digest(blob)!==item.sha256)throw Error('ไฟล์กำลังอัปเดต กรุณาลองเลือกใหม่');
  const file=new File([blob],item.reference.split('/').at(-1),{type:blob.type});
  const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;input.catalogueFile=input.files[0];input.dataset.catalogueSha256=item.sha256;input.dataset.catalogueName=item.name;
  data.set(kind,input.files[0]);input.dispatchEvent(new Event('change'));
 }
}
