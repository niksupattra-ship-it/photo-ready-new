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
    // V75: this endpoint is used only for portrait/person assets.
    // Tell remove.bg the foreground type explicitly instead of asking its auto classifier
    // to infer a person from cropped/generated ID-portrait layers. This directly avoids
    // the documented unknown_foreground failure without changing the image pipeline.
    form.append("type","person");
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

    const hairId=req.body?.hairId||"original";
    const keepOriginalHair=hairId==="original";
    let hairBuf=null;
    if(!keepOriginalHair){
      const hairPath=path.join(dir,"public","assets","hair",`${hairId}.png`);
      const fs=await import("fs");
      if(!fs.existsSync(hairPath)) return res.status(400).send("ไม่พบไฟล์ทรงผมที่เลือก");
      hairBuf=fs.readFileSync(hairPath);
    }

    const prompt=`PROFESSIONAL ID-PORTRAIT ASSET EDIT. Image 1 is the ORIGINAL FULL-QUALITY SOURCE PHOTOGRAPH, not a pre-cut face/head crop and not a recompressed derivative.${keepOriginalHair?" Preserve the subject's original hairstyle from image 1 exactly; there is no hairstyle reference image.":" Image 2 is only the selected hairstyle reference."} This is a standard non-sensitive ID-photo editing task.

OUTPUT REGION: Keep the same person's complete head, ears, selected hairstyle, and a natural straight neck ending at the normal base-of-neck line. Crop the output before the torso so no garment is included in this editable portrait layer. Do not reconstruct, copy, invent, or include any shirt, collar, tie, jacket, uniform, epaulettes, insignia, buttons, or fabric from the source. This portrait layer will later be composited behind a separate clothing template by the application. Keep a centered, front-facing professional ID-photo pose and natural anatomical proportions.

IDENTITY / FACE LOCK — V9 METHOD: Treat the complete facial region from forehead through chin and both cheeks as protected source content. Preserve the exact identity, facial anatomy, expression, age, proportions, complexion, pores, moles, freckles, blemishes, asymmetry, eyes, brows, nose, mouth, cheeks and jaw from image 1. Do not beautify, reshape, reconstruct, repaint, smooth, denoise, or synthesize a replacement face. The hairstyle operation must not be solved by generating a new face. Preserve the original forehead size and hairline position. Any required neck completion must be generated OUTSIDE the protected face region, beginning below the jaw/chin transition, and must not regenerate the face.

SKIN-LIGHT — EXACT V9 METHOD (natural preset, strength 15%): Perform an effective, clearly visible professional camera-lighting correction while preserving the original face and real skin texture. Correct exposure, white balance, highlight recovery, and shadow balance without smoothing, repainting, whitening, beautifying, or changing facial anatomy. APPLY A VISIBLE LIGHTING RESULT. Natural-light preset: ธรรมชาติ. The user selected 15% on a true 0–100 adjustment scale. Apply a gentle but visible exposure and white-balance correction. Create neutral true-to-life camera exposure and accurate white balance with the original complexion unchanged. Preserve pores, fine lines, blemishes, under-eye detail, facial contrast, and every real skin feature. The change must be noticeable in overall luminosity and balance, but must come only from photographic light correction—never skin smoothing, denoising, repainting, makeup, reshaping, or face regeneration.

PROFESSIONAL CAMERA DETAIL LOCK — EXACT V9: render with crisp professional-camera micro-detail and natural optical sharpness comparable to a high-quality studio portrait. Increase perceived clarity only through realistic lens focus, clean edge definition, fine hair strands, eyelashes, eyebrow hairs, and naturally resolved skin micro-texture. Preserve every real pore, fine line, blemish, subtle under-eye texture, natural tonal transition, tiny asymmetry, and original skin character from image 1. Do NOT smooth, airbrush, denoise away texture, over-sharpen halos, add fake pores, add plastic gloss, repaint skin, beautify, whiten, change makeup, or alter facial anatomy.

SOURCE MICRO-TEXTURE PRESERVATION — V51: Image 1 is the sole authoritative source for facial skin detail. Preserve and resolve the EXISTING photographed pore pattern, fine skin grain, tiny lines, natural local contrast and real tonal variation from image 1 at high photographic fidelity. The goal is to recover visible source micro-detail that would be resolved by a sharply focused professional camera, NOT to invent or procedurally generate pores. Do not create a new skin surface, do not average skin tones, do not blur low-contrast texture, do not use beauty/portrait smoothing, and do not replace real texture with synthetic grain. Resolve genuine source-supported micro-detail at the maximum available output fidelity. The finished face must remain visibly detailed when viewed at 100% pixel zoom: preserve real pore-scale tonal variation, eyelash separation, eyebrow hairs and fine hair strands from image 1 instead of averaging them into smooth regions. Use restrained optical clarity only: no halos, ringing, crunchy edges or exaggerated/fabricated pores. Facial geometry and every feature remain locked exactly as specified above.

HAIR — V64 STRICT HAIR-ONLY ISOLATION: ${keepOriginalHair?"KEEP THE ORIGINAL HAIR FROM IMAGE 1 EXACTLY. Do not restyle, replace, lengthen, shorten, recolor, thicken, thin, move the parting, change the fringe, change tied/untied structure, or alter the original hair silhouette. Preserve the subject's real hairline, roots, strands, flyaways, volume and visible hairstyle. The AI edit is required only so the natural neck region is generated while the original hair remains unchanged.":"IMAGE 2 MAY INFLUENCE HAIR PIXELS ONLY. First determine the face/skin lighting, white balance, complexion and all facial detail exclusively from image 1 under the V9/V51 skin rules above; freeze that result before considering image 2. Then change only pixels belonging to hairstyle/hair strands needed to match image 2. Image 2 must have ZERO influence on face or skin exposure, white balance, complexion, texture, pores, forehead skin, ears, eyebrows, eyes, nose, lips, cheeks, jaw, neck skin tone, facial geometry or identity. Do not relight, recolor, smooth, repaint, regenerate or harmonize the face/skin to the hairstyle reference. Match only the hairstyle parting, fringe, side shape, crown, volume, length, tied/untied structure and silhouette. Remove source-hair remnants that conflict with the selected style. Adapt the hair to the subject's own skull, original hairline position, ears and head angle. Do not copy the reference face, skin, lighting or anatomy. Hair must remain photographic, with natural roots, strands, density variation and soft flyaways."}

BACKGROUND: use a simple clean solid background only as temporary generation space. Do not add scenery or objects. The application removes this background immediately after generation.

FINAL CHECK: output only the same person's head, ${keepOriginalHair?"original unchanged hairstyle":"selected hairstyle"}, and natural neck region as a professional ID-portrait asset. Exclude all garments and uniform elements from this layer. Keep the EXACT V9 skin-light and camera-detail method above.`;

    const form=new FormData();
    form.append("model","gpt-image-1.5");
    form.append("prompt",prompt);
    form.append("input_fidelity","high");
    form.append("quality","high");
    form.append("size","1024x1536");
    form.append("output_format","png");
    form.append("image[]",new Blob([req.file.buffer],{type:req.file.mimetype||"image/png"}),"portrait.png");
    if(!keepOriginalHair) form.append("image[]",new Blob([hairBuf],{type:"image/png"}),`${hairId}.png`);

    const r=await fetch("https://api.openai.com/v1/images/edits",{
      method:"POST",headers:{Authorization:`Bearer ${key}`},body:form
    });
    const body=await r.json();
    if(!r.ok){
      const code=body?.error?.code || "image_edit_failed";
      const stage=body?.error?.moderation_details?.moderation_stage;
      if(code==="moderation_blocked" || code==="safety_violations"){
        console.error("OpenAI image edit safety block", JSON.stringify(body));
        return res.status(r.status).send(`OpenAI image edit safety block${stage?` (${stage})`:""}. กรุณาลองประมวลผลอีกครั้งด้วยภาพบุคคลสำหรับรูปติดบัตร`);
      }
      return res.status(r.status).send("OpenAI image edit: "+JSON.stringify(body));
    }
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
