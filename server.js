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
const MASTER_REF=path.join(PUBLIC,"assets","master-framing-3x4.png");

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
  if(value==="original") return null;

  const n=String(value||"").padStart(2,"0");
  if(!/^(0[1-9]|1[0-9]|2[0-9])$/.test(n)){
    throw new Error(`INVALID_HAIR_NUMBER:${n}`);
  }

  const files=fs.readdirSync(HAIR_DIR).filter(name =>
    name.toLowerCase().match(new RegExp(`^hair-${n}\.(png|jpg|jpeg|webp)$`))
  );

  // Strict mode: exactly one file must exist. Never guess/fallback.
  if(files.length!==1){
    throw new Error(`HAIR_REFERENCE_REQUIRED:${n}`);
  }

  return path.join(HAIR_DIR,files[0]);
}

function buildPrompt({outfitLabel,hair,background,size}){
  const hairInstruction = hair==="original"
    ? "Keep the hairstyle from IMAGE 1 unchanged."
    : `IMAGE 3 is the authoritative hairstyle reference and must control the hairstyle.
Do not infer the hairstyle from the number or from text.
Visually copy IMAGE 3's actual hairstyle: parting, fringe/bangs, hairline shape, side pieces, length, volume, contour, tied/untied structure and direction.
Do not substitute another hairstyle. IMAGE 3 is hair-${String(hair).padStart(2,"0")}. Match its parting, bangs/fringe, silhouette, length, volume, direction, side pieces and tied/untied structure. Do not invent a different hairstyle.`;

  return `
You are editing one real customer's portrait for a Thai ID/job-application photo.

THE INPUT IMAGES HAVE FIXED ROLES:
- IMAGE 1 = CUSTOMER PORTRAIT. This is the ONLY identity source.
- IMAGE 2 = SELECTED OUTFIT REFERENCE: "${outfitLabel}". Use this exact clothing design only.
- IMAGE 4 = MASTER FRAMING REFERENCE. Use IMAGE 4 ONLY for head size, head position, top headroom, neck position, shoulder level, shoulder width, upper-torso scale, and overall camera distance.
${hair==="original" ? "" : `- IMAGE 3 = SELECTED HAIRSTYLE REFERENCE: hair-${String(hair).padStart(2,"0")}. Use ONLY its hairstyle, never its face.`}

NON-NEGOTIABLE IDENTITY RULE:
- The final face must remain the same person as IMAGE 1.
- Preserve face shape, eyes, eyebrows, nose, lips, smile/expression, skin tone, makeup and recognizable facial details from IMAGE 1.
- Do NOT copy any face, skin, makeup or identity from IMAGE 2 or IMAGE 3.
- Do NOT beautify, slim, reshape, enlarge eyes, alter nose, alter jaw, age/de-age, or change the person's expression.
- IMAGE 2 and IMAGE 3 are style references only.

OUTFIT RULE:
- Use the clothing shown in IMAGE 2 as the exact selected outfit.
- Match collar, lapel, shirt opening, jacket shape, neckline and garment silhouette as closely as possible.
- Do not redesign or substitute another outfit.
- Do NOT use IMAGE 2 to decide zoom, head size, body scale, shoulder level, or camera distance. Those are controlled by IMAGE 4.

HAIR RULE:
- ${hairInstruction}
- Adapt the hairstyle naturally to the head of the person from IMAGE 1 while keeping IMAGE 1's face untouched.
- Hair may change around the face, but facial features must not.

COMPOSITION — MASTER LOCK:
- Final aspect ratio: ${size==="3:4" ? "3:4" : size}.
- IMAGE 4 is the authoritative framing reference.
- Match IMAGE 4's head size, head position, top headroom, neck height, shoulder level, shoulder width, upper-torso scale and camera distance.
- Keep the subject centered exactly like IMAGE 4.
- The uploaded customer image must NOT control zoom or crop.
- Changing outfit or hairstyle must NOT change the framing.
- Do not zoom the face closer than IMAGE 4.
- Show the same amount of upper torso as IMAGE 4.

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
2) exact selected outfit from IMAGE 2,
3) exact selected hairstyle from IMAGE 3 if provided,
4) exact framing / camera distance / head-and-body scale from IMAGE 4,
5) selected background and final 3:4 output.

IMPORTANT:
- Never copy the person, face, hair, clothing, skin, or identity from IMAGE 4.
- IMAGE 4 controls composition only.
`;
}

app.get("/api/health",(_,res)=>{
  res.json({ok:true,aiConfigured:Boolean(process.env.OPENAI_API_KEY),model:MODEL,referenceMode:"strict-29"});
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

    await appendImage(
      MASTER_REF,
      "04-master-framing-3x4.png",
      "image/png"
    );

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
        size:"3:4",
        referenceMode:"strict-29",
        hairReference:hairPath?path.basename(hairPath):"original",
        outfitReference:path.basename(outfitPath),
        framingReference:path.basename(MASTER_REF)
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
