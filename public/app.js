const state = {
  imageFile: null,
  originalUrl: null,
  hairStyle: "20",
  suit: "female-formal",
  background: "white",
  aiConfigured: false,
  resultUrl: null
};

const $ = (s) => document.querySelector(s);
const imageInput = $("#imageInput");
const uploadBox = $("#uploadBox");
const previewImage = $("#previewImage");
const resultImage = $("#resultImage");
const emptyState = $("#emptyState");
const generateBtn = $("#generateBtn");
const generateHint = $("#generateHint");
const photoStage = $("#photoStage");
const hairGrid = $("#hairGrid");
const selectedHairText = $("#selectedHairText");
const resultActions = $("#resultActions");
const downloadBtn = $("#downloadBtn");

function toast(message, ms = 2800) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), ms);
}

function renderHairOptions() {
  hairGrid.innerHTML = "";
  for (let i = 1; i <= 20; i++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hair-option" + (String(i) === state.hairStyle ? " active" : "");
    b.dataset.hair = i;
    b.innerHTML = `
      <div class="hair-illustration"><span class="hair-face"></span></div>
      <span class="hair-num">ทรง ${i}</span>
    `;
    b.addEventListener("click", () => {
      state.hairStyle = String(i);
      renderHairOptions();
      selectedHairText.textContent = `ทรง ${i}`;
    });
    hairGrid.appendChild(b);
  }
}
renderHairOptions();

async function checkAI() {
  try {
    const r = await fetch("/api/health");
    const data = await r.json();
    state.aiConfigured = Boolean(data.aiConfigured);
    const el = $("#aiStatus");
    if (state.aiConfigured) {
      el.textContent = `AI พร้อมใช้งาน • ${data.model}`;
      el.classList.add("on");
    } else {
      el.textContent = "โหมดพรีวิว • ยังไม่ใส่ API key";
    }
    updateGenerateState();
  } catch {
    $("#aiStatus").textContent = "ไม่สามารถตรวจสอบ AI";
  }
}
checkAI();

function updateGenerateState() {
  generateBtn.disabled = !state.imageFile;
  if (!state.imageFile) {
    generateHint.textContent = "อัปโหลดรูปก่อนเริ่มใช้งาน";
  } else if (!state.aiConfigured) {
    generateHint.textContent = "พรีวิวพร้อมแล้ว • ปุ่ม AI จะใช้งานจริงหลังเพิ่ม OPENAI_API_KEY";
  } else {
    generateHint.textContent = "พร้อมสร้างภาพจริงด้วย AI";
  }
}

function setImage(file) {
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    toast("รองรับเฉพาะ JPG, PNG และ WEBP");
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    toast("ไฟล์ใหญ่เกิน 15 MB");
    return;
  }
  if (state.originalUrl) URL.revokeObjectURL(state.originalUrl);
  state.imageFile = file;
  state.originalUrl = URL.createObjectURL(file);
  previewImage.src = state.originalUrl;
  previewImage.classList.add("visible");
  resultImage.classList.remove("visible");
  resultImage.removeAttribute("src");
  emptyState.classList.add("hidden");
  resultActions.classList.remove("visible");
  uploadBox.querySelector("strong").textContent = file.name;
  uploadBox.querySelector("small").textContent = "เปลี่ยนรูปได้โดยคลิกที่นี่";
  updateGenerateState();
}

imageInput.addEventListener("change", e => setImage(e.target.files?.[0]));
["dragenter","dragover"].forEach(evt => uploadBox.addEventListener(evt, e => {
  e.preventDefault(); uploadBox.classList.add("drag");
}));
["dragleave","drop"].forEach(evt => uploadBox.addEventListener(evt, e => {
  e.preventDefault(); uploadBox.classList.remove("drag");
}));
uploadBox.addEventListener("drop", e => setImage(e.dataTransfer.files?.[0]));

$("#backgroundPicker").addEventListener("click", e => {
  const b = e.target.closest("button[data-bg]");
  if (!b) return;
  state.background = b.dataset.bg;
  document.querySelectorAll("#backgroundPicker button").forEach(x => x.classList.toggle("active", x === b));
  photoStage.classList.remove("bg-white","bg-blue","bg-gray");
  photoStage.classList.add(`bg-${state.background}`);
});

generateBtn.addEventListener("click", async () => {
  if (!state.imageFile) return;
  if (!state.aiConfigured) {
    toast("โค้ด AI ต่อไว้แล้ว แต่ยังไม่ได้ใส่ OPENAI_API_KEY จึงยังไม่เสียเครดิต");
    return;
  }

  const originalText = generateBtn.innerHTML;
  generateBtn.disabled = true;
  generateBtn.innerHTML = "<span>✦</span> กำลังสร้างภาพ…";
  generateHint.textContent = "กำลังรักษาใบหน้าเดิม + เปลี่ยนผม/ชุด + จัดระยะภาพ";

  try {
    const form = new FormData();
    form.append("image", state.imageFile);
    form.append("hairStyle", state.hairStyle);
    form.append("suit", state.suit);
    form.append("background", state.background);

    const r = await fetch("/api/generate", { method: "POST", body: form });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || data.error || "สร้างภาพไม่สำเร็จ");

    state.resultUrl = data.image;
    resultImage.src = data.image;
    resultImage.classList.add("visible");
    previewImage.classList.remove("visible");
    downloadBtn.href = data.image;
    resultActions.classList.add("visible");
    toast("สร้างภาพเสร็จแล้ว");
  } catch (err) {
    toast(err.message, 4200);
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML = originalText;
    updateGenerateState();
  }
});

$("#backToOriginalBtn").addEventListener("click", () => {
  resultImage.classList.remove("visible");
  previewImage.classList.add("visible");
});

$("#resetBtn").addEventListener("click", () => {
  state.imageFile = null;
  state.resultUrl = null;
  if (state.originalUrl) URL.revokeObjectURL(state.originalUrl);
  state.originalUrl = null;
  imageInput.value = "";
  previewImage.classList.remove("visible");
  resultImage.classList.remove("visible");
  previewImage.removeAttribute("src");
  resultImage.removeAttribute("src");
  emptyState.classList.remove("hidden");
  resultActions.classList.remove("visible");
  uploadBox.querySelector("strong").textContent = "เลือกรูปจากเครื่อง";
  uploadBox.querySelector("small").textContent = "JPG, PNG หรือ WEBP";
  updateGenerateState();
});
