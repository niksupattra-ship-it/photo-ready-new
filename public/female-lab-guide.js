const input=document.querySelector('input[name="outfit"]');
const panel=document.getElementById('guide-panel'),image=document.getElementById('guide-image'),status=document.getElementById('guide-status');
let controller,url,sequence=0;
input.addEventListener('change',async()=>{
 const current=++sequence;controller?.abort();controller=new AbortController();
 if(url){URL.revokeObjectURL(url);url=null;}image.removeAttribute('src');image.hidden=true;
 const file=input.files?.[0];panel.hidden=!file;if(!file)return;
 status.textContent='กำลังเตรียมไกด์จากชุดที่เลือก…';
 try{
  const form=new FormData();form.set('outfit',file);
  const response=await fetch('/api/female-full-lab/guide',{method:'POST',body:form,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
  if(!response.ok)throw Error('สร้างไกด์จากชุดนี้ไม่ได้ กรุณาเลือกชุดจากเว็บหลัก');
  const blob=await response.blob();if(current!==sequence)return;
  url=URL.createObjectURL(blob);image.src=url;image.hidden=false;
  status.textContent='วงรีสีเทาคือขนาดหัวรวมผมเป้าหมาย · AI จะได้รับไกด์นี้พร้อมภาพอ้างอิง';
 }catch(error){if(current===sequence)status.textContent=error.name==='TimeoutError'?'เตรียมไกด์นานเกินไป กรุณาเลือกชุดอีกครั้ง':error.message;}
});
