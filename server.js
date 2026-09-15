import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const dir=path.dirname(fileURLToPath(import.meta.url));
const app=express();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024}});

app.post("/api/remove-background",upload.single("image"),async(req,res)=>{
  try{
    if(!req.file) return res.status(400).send("กรุณาเลือกรูป");
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
    res.set("Content-Type","image/png");
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

    const prompt=`STRICT PHOTO COMPOSITING / SEAM FINISH ONLY.
The first image already contains a TEMPLATE-NORMALIZED preserved head at a fixed canonical optical size and a fixed short neck socket against a fixed Thai ceremonial uniform template. The second image is the selected hairstyle reference.

ABSOLUTE IDENTITY LOCK: preserve every pixel-level identity characteristic of the existing face. Do not regenerate, enlarge, shrink, stretch, project forward, beautify or reshape the face. Keep eyes, gaze, eyebrows, nose, lips, jaw, cheeks, skin texture, pores, marks, expression and apparent age unchanged. Natural camera skin only; no smoothing, whitening, makeup enhancement or plastic AI skin.

ABSOLUTE TEMPLATE LOCK: do not alter the uniform, collar, tie, insignia, epaulettes, buttons, shoulders, body width, background, crop or framing. The uniform template is the body master and must remain pixel-consistent.

EDIT ONLY: (A) the empty anatomical connection between the preserved jaw/chin and the fixed collar, and (B) hair outside the protected face region.

NECK: ignore/delete all neck proportions from the source photograph. Construct a NEW anatomically plausible adult neck ONLY inside the short fixed gap from the jaw to the collar. The collar and jaw are immutable anchors. Neck width at the jaw must visually support the existing jaw and widen naturally toward the collar; keep the neck compact, centered and anatomically continuous. DO NOT move the chin upward, move the collar downward, or create extra neck length. Never make a pencil neck, long neck, stretched neck, tiny neck, or forward-projecting head. Blend skin tone, pores, light and camera grain to the preserved face.

HAIR: follow the second image hairstyle reference around the existing normalized head. Do not move the hairline in a way that changes perceived face length or width. Do not cover or redraw facial features.

FINAL CHECK BEFORE OUTPUT: head-to-shoulder scale must remain exactly as supplied by the first image; face must not become larger or smaller; neck must visually connect head and collar without changing either anchor. Result must look like a professional real-camera ID photo, not generated art.`;

    const form=new FormData();
    form.append("model","gpt-image-2");
    form.append("prompt",prompt);
    form.append("quality","low");
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
