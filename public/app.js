const state={file:null,url:null,hair:"shoulder20",ai:false};
const $=s=>document.querySelector(s);
const input=$("#imageInput"), src=$("#sourcePreview"), result=$("#resultPreview"), empty=$("#emptyPreview"), btn=$("#generateBtn");
function toast(t){const e=$("#toast");e.textContent=t;e.classList.add("show");clearTimeout(window._toast);window._toast=setTimeout(()=>e.classList.remove("show"),2800)}
fetch("/api/health").then(r=>r.json()).then(d=>{state.ai=!!d.aiConfigured;update()}).catch(()=>{});
function update(){
  btn.disabled=!state.file;
  $("#statusText").textContent=!state.file?"เลือกรูปก่อนเริ่มสร้าง":state.ai?"พร้อมสร้างด้วย AI • มาตรฐาน 3:4":"พร้อมพรีวิว • ยังไม่ได้ใส่ OPENAI_API_KEY";
}
function setFile(file){
  if(!file)return;
  if(!/^image\/(jpeg|png|webp)$/.test(file.type))return toast("รองรับ JPG PNG WEBP");
  if(state.url)URL.revokeObjectURL(state.url);
  state.file=file;state.url=URL.createObjectURL(file);
  src.src=state.url;src.classList.add("show");result.classList.remove("show");empty.classList.add("hide");
  $("#fileThumb").src=state.url;$("#fileName").textContent=file.name;$("#fileMeta").textContent=(file.size/1024/1024).toFixed(1)+" MB • พร้อมจัดองค์ประกอบ";
  update();
}
input.addEventListener("change",e=>setFile(e.target.files?.[0]));
document.querySelectorAll("#hairGrid button").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll("#hairGrid button").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");state.hair=b.dataset.hair;
}));
document.querySelectorAll(".size-grid button").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".size-grid button").forEach(x=>x.classList.remove("active"));b.classList.add("active");
}));
btn.addEventListener("click",async()=>{
  if(!state.file)return;
  if(!state.ai){toast("โค้ด AI พร้อมแล้ว ขั้นต่อไปคือใส่ OPENAI_API_KEY ใน Render");return}
  const old=btn.textContent;btn.disabled=true;btn.textContent="กำลังสร้าง...";
  $("#statusText").textContent="รักษาใบหน้าเดิม • สูทต้นแบบ • ทรงผมแบบ 20 • ระยะ 3:4";
  try{
    const fd=new FormData();fd.append("image",state.file);fd.append("hairstyle",state.hair);
    const r=await fetch("/api/generate",{method:"POST",body:fd});const d=await r.json();
    if(!r.ok)throw new Error(d.message||d.error||"สร้างไม่สำเร็จ");
    result.src=d.image;result.classList.add("show");src.classList.remove("show");toast("สร้างภาพเสร็จแล้ว");
  }catch(e){toast(e.message)}
  finally{btn.disabled=false;btn.textContent=old;update()}
});
update();
