import express from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const dir=path.dirname(fileURLToPath(import.meta.url));
const app=express();
const upload=multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:20*1024*1024,files:1,fields:10,parts:12}
});

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

    const prompt=`PHOTOREALISTIC ID-PHOTO HEAD EDIT. The first image is the ORIGINAL uploaded person photo BEFORE background removal. The second image is ONLY the selected hairstyle reference. The output will be background-removed AFTER this AI step and ONLY the transparent head/hair/neck will be used in the final V28/V39 composition.

SKIN-LIGHT — EXACT V9 METHOD (natural preset, strength 15%): Perform an effective, clearly visible professional camera-lighting correction across the whole photograph while preserving the original face and real skin texture. Correct exposure, white balance, highlight recovery, and shadow balance without smoothing, repainting, whitening, beautifying, or changing facial anatomy. APPLY A VISIBLE LIGHTING RESULT. Natural-light preset: ธรรมชาติ. The user selected 15% on a true 0–100 adjustment scale. Apply a gentle but visible exposure and white-balance correction. Create neutral true-to-life camera exposure and accurate white balance with the original complexion unchanged. Preserve pores, fine lines, blemishes, under-eye detail, facial contrast, and every real skin feature. The change must be noticeable in overall luminosity and balance, but must come only from photographic light correction—never skin smoothing, denoising, repainting, makeup, reshaping, or face regeneration.

PROFESSIONAL CAMERA DETAIL LOCK — EXACT V9: render the finished photograph with crisp professional-camera micro-detail and natural optical sharpness comparable to a high-quality studio portrait. Increase perceived clarity only through realistic lens focus, clean edge definition, fine hair strands, eyelashes, eyebrow hairs, and naturally resolved skin micro-texture. Preserve every real pore, fine line, blemish, subtle under-eye texture, natural tonal transition, tiny asymmetry, and original skin character from image 1. Do NOT smooth, airbrush, denoise away texture, over-sharpen halos, add fake pores, add plastic gloss, repaint skin, beautify, whiten, change makeup, or alter facial anatomy. Keep the face photorealistic and naturally detailed, as if captured in-focus by a professional camera and high-quality lens, not digitally beautified.

HAIR: replace only the hairstyle with image 2 as the authoritative hairstyle target. Match its parting, fringe, side shape, crown, volume, length, tied/untied structure and silhouette. Remove source-hair remnants that conflict with the selected style. Adapt the style to the subject's own skull, hairline, ears and head angle. Do not copy the reference face or anatomy. Hair must remain photographic, with natural roots, strands, density variation and soft flyaways.

HARD LOCK: do not change eyes, brows, nose, mouth, cheeks, jaw, expression, age, identity, or facial proportions. Do not intentionally rescale or reshape the head. Only V9 skin/camera correction and the selected hairstyle may change. The body/background in this AI output are disposable and MUST NOT be relied upon, because remove.bg runs immediately after AI and only the extracted transparent head/hair/neck is composited onto the fixed real uniform template.

FINAL: preserve the original person identity exactly. Produce a photorealistic head/hair result suitable for clean background removal; no beautification and no artificial skin.`;

    const form=new FormData();
    form.append("model","gpt-image-1.5");
    form.append("prompt",prompt);
    form.append("input_fidelity","high");
    form.append("quality","high");
    form.append("size","1024x1536");
    form.append("output_format","png");
    form.append("image[]",new Blob([req.file.buffer],{type:req.file.mimetype||"image/png"}),"portrait.png");
    form.append("image[]",new Blob([hairBuf],{type:"image/png"}),`${hairId}.png`);

    const r=await fetch("https://api.openai.com/v1/images/edits",{
      method:"POST",headers:{Authorization:`Bearer ${key}`},body:form
    });
    const body=await r.json();
    if(!r.ok) return res.status(r.status).send("OpenAI image edit: "+JSON.stringify(body));
    const b64=body?.data?.[0]?.b64_json;
    if(!b64) return res.status(500).send("OpenAI ไม่ได้ส่งภาพกลับมา");
    const data=Buffer.from(b64,"base64");
    res.set("Content-Type","image/png");
    res.set("Cache-Control","no-store");
    res.send(data);
  }catch(e){
    console.error(e);
    res.status(500).send("AI finishing ไม่สำเร็จ: "+e.message);
  }
});

// V31: return a useful response for multipart failures instead of a generic Railway upstream error.
app.use((err,req,res,next)=>{
  if(err instanceof multer.MulterError){
    console.error("Upload error:",err.code,err.message);
    return res.status(413).send("อัปโหลดภาพไม่สำเร็จ: "+err.message);
  }
  if(err){
    console.error("Request error:",err);
    if(!res.headersSent) return res.status(400).send("รับข้อมูลภาพไม่สำเร็จ: "+(err.message||"request error"));
  }
  next(err);
});

app.get("/api/health",(req,res)=>res.json({ok:true,provider:"remove.bg",configured:!!process.env.REMOVEBG_API_KEY}));
app.use(express.static(path.join(dir,"dist")));
app.use((req,res)=>res.sendFile(path.join(dir,"dist","index.html")));
app.listen(process.env.PORT||3000,()=>console.log("BG Remover ready"));
