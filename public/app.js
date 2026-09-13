const state={
  file:null,
  url:null,
  hair:"07",
  suit:"female-formal",
  suitLabel:"สูทหญิงสุภาพ",
  background:"blue",
  size:"3:4",
  ai:false
};

const $=s=>document.querySelector(s);
const src=$("#sourcePreview");
const result=$("#resultPreview");
const empty=$("#emptyPreview");
const btn=$("#generateBtn");
const input=$("#imageInput");
const inputTop=$("#imageInputTop");

const HAIR_IMAGES = Array.from({length:29},(_,i)=>`/assets/hairstyles/hair-${String(i+1).padStart(2,"0")}.png`);

function toast(t){
  const e=$("#toast");
  e.textContent=t;
  e.classList.add("show");
  clearTimeout(window._toast);
  window._toast=setTimeout(()=>e.classList.remove("show"),3000);
}

function renderHairGrid(){
  const grid=$("#hairGrid");
  grid.innerHTML="";

  const original=document.createElement("button");
  original.type="button";
  original.dataset.hair="original";
  original.innerHTML='<div class="hair-thumb no-change">⊘</div><span>ทรงเดิม</span>';
  grid.appendChild(original);

  HAIR_IMAGES.forEach((u,i)=>{
    const n=i+1;
    const b=document.createElement("button");
    b.type="button";
    b.dataset.hair=String(n).padStart(2,"0");
    if(n===7)b.classList.add("active");
    b.innerHTML=`<img class="hair-thumb" src="${u}" alt="ทรงผมแบบ ${String(n).padStart(2,"0")}"><span>แบบ ${String(n).padStart(2,"0")}</span>`;
    grid.appendChild(b);
  });

  grid.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{
    grid.querySelectorAll("button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    state.hair=b.dataset.hair;
    updateStatus();
  }));
}

function bindOutfits(){
  document.querySelectorAll("#outfitGrid [data-suit]").forEach(b=>{
    b.addEventListener("click",()=>{
      document.querySelectorAll("#outfitGrid [data-suit]").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      state.suit=b.dataset.suit;
      state.suitLabel=b.dataset.label || "";
      updateStatus();
    });
  });
}

function bindBackgrounds(){
  document.querySelectorAll("#bgGrid [data-bg]").forEach(b=>{
    b.addEventListener("click",()=>{
      document.querySelectorAll("#bgGrid [data-bg]").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      state.background=b.dataset.bg;
      updateStatus();
    });
  });
}

function updateStatus(){
  btn.disabled=!state.file;
  if(!state.file){
    $("#statusText").textContent="เลือกรูปก่อนเริ่มสร้าง";
    return;
  }
  const h=state.hair==="original"?"ทรงเดิม":`แบบ ${state.hair}`;
  $("#statusText").textContent = state.ai
    ? `${state.suitLabel} • ผม ${h} • ${state.background==="blue"?"ฟ้ามาตรฐาน":state.background} • ${state.size}`
    : "พร้อมพรีวิว • ยังไม่ได้ใส่ OPENAI_API_KEY";
}

function setFile(file){
  if(!file)return;
  if(!/^image\/(jpeg|png|webp)$/.test(file.type))return toast("รองรับ JPG, PNG และ WEBP");
  if(file.size>10*1024*1024)return toast("ไฟล์ต้องไม่เกิน 10 MB");
  if(state.url)URL.revokeObjectURL(state.url);
  state.file=file;
  state.url=URL.createObjectURL(file);
  src.src=state.url;
  src.classList.add("show");
  result.classList.remove("show");
  empty.classList.add("hide");
  $("#fileName").textContent=file.name;
  $("#fileMeta").textContent=(file.size/1024/1024).toFixed(1)+" MB • พร้อมจัดองค์ประกอบ";
  updateStatus();
}

input?.addEventListener("change",e=>setFile(e.target.files?.[0]));
inputTop?.addEventListener("change",e=>setFile(e.target.files?.[0]));

$("#sizeSelect")?.addEventListener("change",e=>{
  state.size=e.target.value;
  updateStatus();
});

renderHairGrid();
bindOutfits();
bindBackgrounds();

fetch("/api/health")
  .then(r=>r.json())
  .then(d=>{state.ai=!!d.aiConfigured;updateStatus()})
  .catch(()=>updateStatus());

btn.addEventListener("click",async()=>{
  if(!state.file)return;
  if(!state.ai){
    toast("โค้ด reference พร้อมแล้ว แต่ยังไม่ได้ใส่ OPENAI_API_KEY");
    return;
  }

  const old=btn.textContent;
  btn.disabled=true;
  btn.textContent="กำลังสร้างด้วย reference จริง…";
  $("#statusText").textContent="กำลังใช้รูปคน + รูปชุดจริง + รูปทรงผมจริง";

  try{
    const fd=new FormData();
    fd.append("image",state.file);
    fd.append("suit",state.suit);
    fd.append("hairstyle",state.hair);
    fd.append("background",state.background);
    fd.append("size",state.size);

    const r=await fetch("/api/generate",{method:"POST",body:fd});
    const d=await r.json();
    if(!r.ok)throw new Error(d.message||d.error||"สร้างไม่สำเร็จ");

    result.src=d.image;
    result.classList.add("show");
    src.classList.remove("show");
    toast("สร้างภาพเสร็จแล้ว");
  }catch(e){
    toast(e.message);
  }finally{
    btn.textContent=old;
    btn.disabled=false;
    updateStatus();
  }
});
