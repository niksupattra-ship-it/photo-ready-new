import express from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const dir=path.dirname(fileURLToPath(import.meta.url));
const app=express();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024}});

// V27: preserve V25 remove.bg cache and geometry; natural-camera skin is finished locally after source-face restoration.
// Cache remove.bg output by exact original image bytes. Re-processing the same upload
// during this server lifetime does not consume another remove.bg credit.
const removeBgCache=new Map();
const MAX_REMOVE_BG_CACHE=100;

app.post("/api/remove-background",upload.single("image"),async(req,res)=>{
  try{
    if(!req.file) return res.status(400).send("กรุณาเลือกรูป");
    const imageHash=crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    const cached=removeBgCache.get(imageHash);
    if(cached){
      res.set("Content-Type","image/png");
      res.set("X-RemoveBG-Cache","HIT");
      return res.send(cached);
    }

    const key=process.env.REMOVEBG_API_KEY;
    if(!key) return res.status(500).send("ยังไม่ได้ตั้งค่า REMOVEBG_API_KEY ใน Render");

    const form=new FormData();
    form.append("size","auto");
    form.append("format","png");
    form.append("image_file",new Blob([req.file.buffer],{type:req.file.mimetype}),req.file.originalname||"image.jpg");

    const r=await fetch("https://api.remove.bg/v1.0/removebg",{
      method:"POST",
      headers:{"X-Api-Key":key},
      body:form
    });
    if(!r.ok){
      let msg=await r.text();
      return res.status(r.status).send("remove.bg: "+msg);
    }
    const data=Buffer.from(await r.arrayBuffer());
    if(removeBgCache.size>=MAX_REMOVE_BG_CACHE){
      const oldest=removeBgCache.keys().next().value;
      removeBgCache.delete(oldest);
    }
    removeBgCache.set(imageHash,data);
    res.set("Content-Type","image/png");
    res.set("X-RemoveBG-Cache","MISS");
    res.set("Cache-Control","no-store");
    res.send(data);
  }catch(e){
    console.error(e);
    res.status(500).send("ลบพื้นหลังไม่สำเร็จ: "+e.message);
  }
});


app.post("/api/ai-finish",upload.single("image"),async(req,res)=>{
  try{
    if(!req.file) return res.status(400).send("ไม่มีภาพสำหรับ AI finishing");
    const key=process.env.OPENAI_API_KEY;
    if(!key) return res.status(500).send("ยังไม่ได้ตั้งค่า OPENAI_API_KEY ใน Render");

    const hairId=req.body?.hairId||"hair-01";
    const hairPath=path.join(dir,"public","assets","hair",`${hairId}.png`);
    const fs=await import("fs");
    if(!fs.existsSync(hairPath)) return res.status(400).send("ไม่พบไฟล์ทรงผมที่เลือก");
    const hairBuf=fs.readFileSync(hairPath);

    const prompt=`V29 — V9 SKIN + HAIR METHOD ONLY. EDIT THE EXISTING COMPOSITE IN PLACE.
Image 1 is the finished V28 composite and is the absolute source of truth for face, identity, geometry, head position, neck position, uniform, insignia, shoulders, background, crop and lighting. Image 2 is hairstyle reference ONLY.

CRITICAL FACE / SKIN LOCK (copied from the proven V9 method): preserve the entire face, forehead, ears and visible facial skin from image 1 exactly as photographed. Treat those pixels as protected source material, not areas to redesign, regenerate, restore, beautify or retouch. Keep identical facial geometry, expression, eyes, eyebrows, nose, lips, jaw, age, complexion, pores, blemishes, fine lines, under-eye detail, makeup, natural asymmetry, highlights, shadows and camera texture. Do not smooth, denoise, blur, airbrush, whiten, brighten skin separately, add glow, add makeup, remove marks, sharpen facial features, invent pores, or create porcelain, waxy, flawless, synthetic, illustrated or AI-looking skin. Do NOT perform a skin-generation pass. The face should look like the same untouched real photograph.

PHOTOGRAPHIC SKIN RESPONSE: do not force a new skin style. Preserve source skin texture and local contrast. Any unavoidable generated skin in the SHORT neck seam only must sample and match the adjacent jaw skin for white balance, exposure, texture, grain, highlight softness and shadow density. Never make neck skin cleaner, smoother or more uniform than the real face.

HAIRSTYLE CHANGE (adapted only from V9): transfer only the hairstyle design from image 2 — parting, outline, length, direction, arrangement and volume character — onto the person in image 1. Never copy the reference model's face, forehead, ears, skin, skull proportions, neck, lighting or color. Keep the exact original face, identity, forehead size, natural hairline position, ears, neck and head angle from image 1. Adapt the reference hair anatomically to this person's real head and face shape with natural width, height, length, volume, density and gravity. The hairstyle must remain recognizable as the selected reference but fit this subject rather than behaving like a rigid overlay.

HAIR PHOTOREALISM (V9 behavior): preserve realistic dark-brown/charcoal micro-variation, individual strands, translucent edge hairs, natural roots and soft non-uniform camera highlights. Do not make hair flat jet-black. Hair must look naturally photographed, never overly smooth, glossy-plastic, painted, pasted, helmet-like or wig-like. Do not cover the eyes or distort ears/face. Blend hair naturally behind the neck and shoulders. Refine only the outer hair edges with realistic fine strands; avoid hard cut-out edges and halos.

ABSOLUTE NON-HAIR LOCK: uniform, collar, tie, insignia, epaulettes, buttons, shoulders, body proportions, background, crop and all non-hair pixels must remain unchanged. Do not recompose, zoom, move, resize, rotate or redesign anything.

FINAL TEST: if the edit changes facial skin texture or makes the face smoother, cleaner, sharper, more symmetrical, more beautiful or more AI-looking than image 1, reject that change and preserve image 1 instead.`;

    const form=new FormData();
    form.append("model","gpt-image-1.5");
    form.append("prompt",prompt);
    form.append("input_fidelity","high");
    form.append("quality","high");
    form.append("output_format","png");
    form.append("size","1024x1536");
    form.append("n","1");
    form.append("image[]",new Blob([req.file.buffer],{type:req.file.mimetype||"image/png"}),"portrait.png");
    form.append("image[]",new Blob([hairBuf],{type:"image/png"}),`${hairId}.png`);

    console.log(`[ai-finish] start hair=${hairId} portrait=${req.file.size}B ref=${hairBuf.length}B`);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),240000);
    let r;
    try {
      r=await fetch("https://api.openai.com/v1/images/edits",{
        method:"POST",
        headers:{Authorization:`Bearer ${key}`},
        body:form,
        signal:controller.signal
      });
    } finally { clearTimeout(timer); }

    const raw=await r.text();
    let body;
    try { body=JSON.parse(raw); } catch { body=null; }
    if(!r.ok){
      const detail=body?.error?.message || body?.message || raw || `HTTP ${r.status}`;
      console.error(`[ai-finish] OpenAI ${r.status}:`, detail);
      return res.status(r.status).type("text/plain").send(`OpenAI image edit (${r.status}): ${detail}`);
    }
    const b64=body?.data?.[0]?.b64_json;
    if(!b64){
      console.error("[ai-finish] missing b64_json; response:", raw.slice(0,1000));
      return res.status(502).type("text/plain").send("OpenAI ตอบกลับสำเร็จ แต่ไม่มีข้อมูลภาพ b64_json");
    }
    console.log("[ai-finish] success");
    const data=Buffer.from(b64,"base64");
    res.set("Content-Type","image/png");
    res.set("Cache-Control","no-store");
    res.send(data);
  }catch(e){
    console.error("[ai-finish] failed:",e);
    const msg=e?.name==="AbortError" ? "OpenAI ใช้เวลาประมวลผลเกิน 240 วินาที" : (e?.message||String(e));
    res.status(502).type("text/plain").send("AI finishing ไม่สำเร็จ: "+msg);
  }
});

app.get("/api/health",(req,res)=>res.json({ok:true,removeBgConfigured:!!process.env.REMOVEBG_API_KEY,openAIConfigured:!!process.env.OPENAI_API_KEY,version:"v29.1"}));
app.use(express.static(path.join(dir,"dist")));
app.use((req,res)=>res.sendFile(path.join(dir,"dist","index.html")));
app.listen(process.env.PORT||3000,()=>console.log("BG Remover ready"));
