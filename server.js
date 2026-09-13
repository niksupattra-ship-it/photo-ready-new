import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";

const app=express();
const PORT=process.env.PORT||3000;
const MODEL=process.env.IMAGE_MODEL||"gpt-image-1";

app.use(express.static("public"));
app.use(express.json({limit:"2mb"}));

const upload=multer({
  dest:path.join(os.tmpdir(),"photo-ready-new"),
  limits:{fileSize:10*1024*1024}
});

const PUBLIC=path.resolve("public");
const HAIR_DIR=path.join(PUBLIC,"assets","hairstyles");

const OUTFITS={
  "female-formal": {file:"assets/suit-female-formal.jpg", label:"สูทหญิงสุภาพ"},
  "female-open":   {file:"assets/ui/outfit-02.jpg", label:"สูทหญิงคอเปิด"},
  "female-wide":   {file:"assets/ui/outfit-03.jpg", label:"สูทหญิงปกกว้าง"},
  "female-black":  {file:"assets/ui/outfit-04.jpg", label:"สูทหญิงคอจีน"},
  "male-formal":   {file:"assets/ui/outfit-05.jpg", label:"สูทชายสุภาพ"},
  "male-open":     {file:"assets/ui/outfit-06.jpg", label:"สูทชายคอเปิด"},
  "shirt-woman":   {file:"assets/ui/outfit-07.jpg", label:"เสื้อเชิ้ตขาวหญิง"},
  "shirt-man":     {file:"assets/ui/outfit-08.jpg", label:"เสื้อเชิ้ตขาวชาย"}
};

const BACKGROUNDS={
  blue:"standard bright official blue",
  white:"clean pure white",
  gray:"clean light gray",
  darkblue:"clean dark navy-blue"
};

function mimeFromPath(p){
  const ext=path.extname(p).toLowerCase();
  if(ext===".png")return "image/png";
  if(ext===".webp")return "image/webp";
  return "image/jpeg";
}

function getHairRef(value){
  if(value==="original")return null;
  const n=String(value||"07").padStart(2,"0");
  if(!/^\d{2}$/.test(n))return null;
  const name=fs.readdirSync(HAIR_DIR).find(x=>x.startsWith(`hair-${n}.`));
  return name ? path.join(HAIR_DIR,name) : null;
}

function buildPrompt({outfitLabel,hair,background,size}){
  const hairInstruction = hair==="original"
    ? "Keep the hairstyle from IMAGE 1 unchanged."
    : `Copy the hairstyle design from IMAGE 3 exactly as the hairstyle reference for this job. IMAGE 3 is hair-${String(hair).padStart(2,"0")}. Match its parting, bangs/fringe, silhouette, length, volume, direction, side pieces and tied/untied structure. Do not invent a different hairstyle.`;

  return `
You are editing one real customer's portrait for a Thai ID/job-application photo.

THE INPUT IMAGES HAVE FIXED ROLES:
- IMAGE 1 = CUSTOMER PORTRAIT. This is the ONLY identity source.
- IMAGE 2 = SELECTED OUTFIT REFERENCE: "${outfitLabel}". Use this exact clothing design AND use its body/shoulder/neck scale as the composition reference.
${hair==="original" ? "" : `- IMAGE 3 = SELECTED HAIRSTYLE REFERENCE: hair-${String(hair).padStart(2,"0")}. Use ONLY its hairstyle, never its face.`}

NON-NEGOTIABLE IDENTITY RULE:
- The final face must remain the same person as IMAGE 1.
- Preserve face shape, eyes, eyebrows, nose, lips, smile/expression, skin tone, makeup and recognizable facial details from IMAGE 1.
- Do NOT copy any face, skin, makeup or identity from IMAGE 2 or IMAGE 3.
- Do NOT beautify, slim, reshape, enlarge eyes, alter nose, alter jaw, age/de-age, or change the person's expression.
- IMAGE 2 and IMAGE 3 are style references only.

OUTFIT RULE:
- Use the clothing shown in IMAGE 2 as the exact selected outfit.
- Match collar, lapel, shirt opening, jacket shape, shoulder width, neckline and overall garment silhouette as closely as possible.
- Do not redesign or substitute another outfit.
- Critically: match IMAGE 2's body scale and outfit framing. The selected outfit image is the composition template.

HAIR RULE:
- ${hairInstruction}
- Adapt the hairstyle naturally to the head of the person from IMAGE 1 while keeping IMAGE 1's face untouched.
- Hair may change around the face, but facial features must not.

COMPOSITION:
- Final aspect ratio: ${size==="3:4" ? "3:4" : size}.
- Use the body/shoulder/neck scale of IMAGE 2.
- Center the subject.
- Keep comfortable space above the head.
- Do not make the head larger just because IMAGE 1 was a close-up.
- Show a professional head-and-upper-torso framing appropriate for a job application.

BACKGROUND:
- Replace the original background with ${BACKGROUNDS[background]||BACKGROUNDS.blue}.
- Flat, clean, uniform background with no objects or texture.

QUALITY:
- Photorealistic studio photograph.
- Natural skin texture.
- Even lighting.
- No text, watermark, jewelry additions, logos or decorative elements.

PRIORITY ORDER:
1) identity and face from IMAGE 1,
2) exact selected outfit + body scale from IMAGE 2,
3) exact selected hairstyle from IMAGE 3 if provided,
4) selected background and final 3:4 output.
`;
}

app.get("/api/health",(_,res)=>{
  res.json({ok:true,aiConfigured:Boolean(process.env.OPENAI_API_KEY),model:MODEL});
});

app.post("/api/generate",upload.single("image"),async(req,res)=>{
  const tmp=req.file?.path;
  try{
    if(!req.file)return res.status(400).json({error:"กรุณาเลือกรูป"});
    if(!process.env.OPENAI_API_KEY){
      return res.status(503).json({
        error:"AI_NOT_CONFIGURED",
        message:"ยังไม่ได้ใส่ OPENAI_API_KEY แต่ reference pipeline พร้อมแล้ว"
      });
    }

    const outfit=OUTFITS[req.body.suit]||OUTFITS["female-formal"];
    const outfitPath=path.join(PUBLIC,outfit.file);
    const hairValue=req.body.hairstyle||"07";
    const hairPath=getHairRef(hairValue);
    const background=req.body.background||"blue";
    const size=req.body.size||"3:4";

    if(!fs.existsSync(outfitPath)){
      return res.status(400).json({error:"ไม่พบไฟล์ชุดที่เลือก"});
    }
    if(hairValue!=="original" && !hairPath){
      return res.status(400).json({error:`ไม่พบไฟล์ทรงผมแบบ ${hairValue}`});
    }

    const form=new FormData();
    form.append("model",MODEL);
    form.append("prompt",buildPrompt({
      outfitLabel:outfit.label,
      hair:hairValue,
      background,
      size
    }));
    form.append("size","1024x1536");
    form.append("quality","high");
    form.append("output_format","png");
    if(MODEL==="gpt-image-1")form.append("input_fidelity","high");

    const appendImage=async(p,name,type)=>{
      const bytes=await fs.promises.readFile(p);
      form.append("image[]",new Blob([bytes],{type}),name);
    };

    // IMPORTANT: order must stay exactly aligned with prompt roles.
    await appendImage(
      req.file.path,
      "01-customer-identity"+path.extname(req.file.originalname||".jpg"),
      req.file.mimetype||"image/jpeg"
    );
    await appendImage(
      outfitPath,
      "02-selected-outfit"+path.extname(outfitPath),
      mimeFromPath(outfitPath)
    );
    if(hairPath){
      await appendImage(
        hairPath,
        `03-selected-hairstyle-${String(hairValue).padStart(2,"0")}${path.extname(hairPath)}`,
        mimeFromPath(hairPath)
      );
    }

    const api=await fetch("https://api.openai.com/v1/images/edits",{
      method:"POST",
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},
      body:form
    });

    const data=await api.json();
    if(!api.ok){
      return res.status(api.status).json({
        error:"OPENAI_ERROR",
        message:data?.error?.message||"สร้างภาพไม่สำเร็จ",
        details:data?.error||data
      });
    }

    let raw;
    if(data?.data?.[0]?.b64_json){
      raw=Buffer.from(data.data[0].b64_json,"base64");
    }else if(data?.data?.[0]?.url){
      const r=await fetch(data.data[0].url);
      raw=Buffer.from(await r.arrayBuffer());
    }else{
      return res.status(500).json({error:"ไม่พบข้อมูลภาพจาก AI"});
    }

    // Lock final exported file to exact 3:4 without stretching.
    const finalPng=await sharp(raw)
      .resize(1200,1600,{fit:"cover",position:"centre"})
      .png()
      .toBuffer();

    return res.json({
      image:`data:image/png;base64,${finalPng.toString("base64")}`,
      used:{
        suit:req.body.suit||"female-formal",
        hairstyle:hairValue,
        background,
        size:"3:4"
      }
    });
  }catch(err){
    console.error(err);
    res.status(500).json({error:"SERVER_ERROR",message:err?.message||"เกิดข้อผิดพลาด"});
  }finally{
    if(tmp)fs.promises.unlink(tmp).catch(()=>{});
  }
});

app.listen(PORT,"0.0.0.0",()=>{
  console.log(`PhotoID Studio TH running on port ${PORT}`);
});
