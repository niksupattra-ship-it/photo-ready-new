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

    const prompt=`PHOTOREALISTIC ID-PHOTO COMPOSITING. V28 GEOMETRY/LAYOUT IS ALREADY FINAL AND LOCKED.
The first image is the already-composed V28 portrait. Do not move, rescale, crop, zoom, or redesign the head, neck socket, shoulders, uniform, collar, insignia, background, or framing. The second image is ONLY the selected hairstyle reference.

V9 SKIN / PROFESSIONAL CAMERA METHOD — TRANSFERRED FROM THE PROVIDED V9 PROJECT: Perform an effective professional camera-lighting correction while preserving the original face and real skin texture. Correct exposure, white balance, highlight recovery, and shadow balance without smoothing, repainting, whitening, beautifying, or changing facial anatomy. Create neutral true-to-life camera exposure and accurate white balance with the original complexion unchanged. Preserve pores, fine lines, blemishes, under-eye detail, facial contrast, every real skin feature, natural tonal transitions, tiny asymmetry, and original skin character. The change must come only from photographic light/camera correction—never skin smoothing, denoising, repainting, makeup, reshaping, or face regeneration. Render with crisp professional-camera micro-detail and natural optical sharpness comparable to a high-quality studio portrait. Increase perceived clarity only through realistic lens focus and naturally resolved skin micro-texture. Do NOT smooth, airbrush, denoise away texture, over-sharpen halos, add fake pores, add plastic gloss, repaint skin, beautify, whiten, change makeup, or alter facial anatomy. Keep the face photorealistic and naturally detailed, as if captured in-focus by a professional camera and high-quality lens, not digitally beautified.

V9 HAIRSTYLE REPLACEMENT METHOD — TRANSFERRED FROM THE PROVIDED V9 PROJECT: the second image is the selected hairstyle reference and must be treated as the authoritative target hairstyle. Replace the person's original hairstyle with the reference hairstyle itself, not a blend and not a variation of the original. Match image 2 as closely as anatomically possible in parting, front hairline styling, bangs/fringe, side shape, crown shape, volume, length, layers, tucked/untucked sections, tied/untied state, bun/updo/ponytail structure, direction, silhouette, and visible hair endpoints. IGNORE the original hairstyle length and arrangement whenever they conflict with image 2. If the source has long hair but image 2 is short, tied, tucked, or fully gathered, REMOVE every visible long-hair remainder from behind the neck, shoulders, collar, chest, and back. Do not leave original long strands hanging behind the shoulders. If image 2 shows hair fully gathered or an updo, all original loose hair that would not exist in that style must disappear. If image 2 shows short hair, the final image must look genuinely short from all visible edges, with no hidden long-hair tails. If image 2 shows ears exposed, expose them naturally; if it shows ears partially covered, match that coverage. Never preserve the source hairstyle merely because it is present in image 1.

HAIR-ONLY TRANSFER: transfer ONLY hair design from image 2. Do not copy any face, forehead proportions, ears, skin, neck, clothing, jewelry, accessories, lighting, or background from image 2. Keep the exact original identity, face, forehead size, skull size, natural hairline position, ears, neck, and head angle from image 1. Adapt the target hairstyle to the real head anatomy without changing identity. Maintain realistic hair density, strand direction, root behavior, gravity, soft edge hairs, and natural volume. Apply a professional natural-black tone at 50% intensity, preserving realistic dark-brown and charcoal micro-variation and camera highlights; never make hair flat jet-black, plastic, painted, pasted, helmet-like, or wig-like. Do not cover the eyes or distort ears or face. Blend the finished hairstyle naturally around the head, neck, and shoulders.

HAIRSTYLE CONFLICT PRIORITY: hairstyle-reference matching has priority over preserving the source hair shape, length, volume, and placement. Preserve only the person's identity and anatomy, not the original hairstyle. The final visible hair must be consistent with image 2 everywhere in the frame, with zero leftover source-hair geometry that contradicts the selected style.

V28 LAYOUT/TEMPLATE HARD LOCK: Do not alter the V28 placement. Uniform, collar, tie, insignia, epaulettes, buttons, shoulders, body proportions, background, crop, canvas framing, head position and head scale are immutable. Do not regenerate or redesign the uniform. Do not zoom the person in or out. Do not change the face geometry, eyes, brows, nose, mouth, cheeks, jaw, expression, age, or facial proportions. Do not add earrings, jewelry, accessories, clips, or foreign objects absent from image 1.

NECK/SEAM ONLY: if the existing short jaw-to-collar bridge requires finishing because of the hairstyle edit, blend only that narrow transition so its color, texture, light and camera response match the adjacent real skin. Do not lengthen/thin the neck and do not move the jaw or collar. Remove visible hair cutout halos/color fringes only in a narrow edge band.

FINAL TEST: same V28 composition and anatomy, but with the V9 professional-camera skin treatment and V9 hairstyle-transfer behavior. The result must remain a real photographic portrait, never waxy, plastic, beauty-filtered, painted, CGI, or AI-looking.`;

    const form=new FormData();
    form.append("model","gpt-image-1.5");
    form.append("prompt",prompt);
    form.append("input_fidelity","high");
    form.append("quality","high");
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

app.get("/api/health",(req,res)=>res.json({ok:true,provider:"remove.bg",configured:!!process.env.REMOVEBG_API_KEY}));
app.use(express.static(path.join(dir,"dist")));
app.use((req,res)=>res.sendFile(path.join(dir,"dist","index.html")));
app.listen(process.env.PORT||3000,()=>console.log("BG Remover ready"));
