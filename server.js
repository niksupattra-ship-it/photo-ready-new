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
  const hairNumber = hair==="original" ? null : String(hair).padStart(2,"0");

  const hairRule = hair==="original"
    ? `
HAIR — ORIGINAL MODE:
- KEEP THE CUSTOMER'S ORIGINAL HAIRSTYLE FROM IMAGE 1.
- Do not restyle, lengthen, shorten, add bangs, remove bangs, tie, untie, curl, straighten, thicken, thin, recolor, or otherwise change the hairstyle.
- Only clean stray edges if necessary for the background replacement.
`
    : `
HAIR — SELECTED REFERENCE MODE:
- IMAGE 3 is the ONLY hairstyle reference and is authoritative.
- Selected hairstyle file: hair-${hairNumber}.
- Reproduce the actual hairstyle visible in IMAGE 3 as closely as possible.
- Match: parting, fringe/bangs, hairline shape, side pieces, length, volume, contour, direction, tied/untied structure, and how much of the ears are visible.
- DO NOT infer the hairstyle from the number or from text.
- DO NOT invent, simplify, substitute, or choose a different hairstyle.
- DO NOT copy the face, skin, eyes, nose, lips, jaw, makeup, or identity of the model in IMAGE 3.
`;

  return `
PHOTO ID STUDIO TH — STRICT IDENTITY-PRESERVING EDIT

You are NOT creating a new person.
You are editing the CUSTOMER in IMAGE 1 while preserving that same person's identity.

INPUT IMAGE ROLES — MUST FOLLOW:
- IMAGE 1 = CUSTOMER ORIGINAL. This is the ONLY source for identity, face, skin, makeup, facial expression, age, and personal appearance.
- IMAGE 2 = SELECTED OUTFIT REFERENCE: "${outfitLabel}". Use IMAGE 2 ONLY for the clothing design.
${hair==="original" ? "" : `- IMAGE 3 = SELECTED HAIRSTYLE REFERENCE: hair-${hairNumber}. Use IMAGE 3 ONLY for hairstyle design.`}
- IMAGE 4 = MASTER FRAMING REFERENCE. Use IMAGE 4 ONLY for camera distance, head size, head position, top headroom, neck position, shoulder level, shoulder width, and visible upper-torso scale.

ABSOLUTE IDENTITY LOCK — HIGHEST PRIORITY:
- The final person MUST remain the exact same person as IMAGE 1.
- Preserve IMAGE 1's:
  * face shape
  * forehead shape
  * eyebrows
  * eye shape and eye size
  * eye spacing
  * nose shape and nose width
  * lips and mouth shape
  * jawline and chin
  * cheek structure
  * ears where visible
  * skin tone
  * natural skin texture
  * moles, marks, freckles, and recognizable facial details
  * makeup style and makeup intensity
  * expression
  * age
- DO NOT beautify the face.
- DO NOT smooth the skin into plastic/AI skin.
- DO NOT make the face more symmetrical.
- DO NOT slim or widen the face.
- DO NOT enlarge or shrink the eyes.
- DO NOT change the nose.
- DO NOT change the lips.
- DO NOT change the jaw or chin.
- DO NOT alter the customer's ethnicity or apparent age.
- DO NOT replace the customer's face with a face from any reference image.
- DO NOT generate a new face that merely looks similar.
- The result must be recognizably the SAME PERSON from IMAGE 1.

EDIT ONLY THESE AREAS:
- clothing below the neck
- hairstyle only when a hairstyle reference is selected
- neck/clothing seam only where needed to make the composite natural
- shoulders only as required to fit the selected outfit
- background
- lighting balance and edge cleanup
- minor blending around hair, neck, collar, and shoulders

OUTFIT — STRICT REFERENCE:
- Use IMAGE 2 as the authoritative clothing reference.
- Match the selected clothing design as closely as possible:
  * collar
  * lapels
  * shirt opening
  * jacket shape
  * neckline
  * fabric layout
  * visible buttons
  * shoulder garment shape
- DO NOT invent another outfit.
- DO NOT alter the customer's face to fit the outfit.
- DO NOT use IMAGE 2's face, head, hair, skin, or identity.
- IMAGE 2 controls clothing only.

${hairRule}

MASTER FRAMING — STRICT:
- Final aspect ratio: ${size==="3:4" ? "3:4" : size}.
- IMAGE 4 is the authoritative composition reference.
- Match IMAGE 4's:
  * head size
  * head vertical position
  * top headroom
  * neck height
  * shoulder level
  * shoulder width
  * amount of upper torso visible
  * overall camera distance
- The uploaded customer's original crop MUST NOT control the final zoom.
- Changing outfit or hairstyle MUST NOT change the framing.
- DO NOT zoom the face closer than IMAGE 4.
- DO NOT crop off the top of the hair.
- Keep the subject centered and upright.

BACKGROUND:
- Replace the original background with ${BACKGROUNDS[background]||BACKGROUNDS.blue}.
- Background must be flat, clean, uniform, studio-like, with no objects, texture, wall details, shadows, cars, furniture, text, logos, or scenery.

LIGHTING / REALISM:
- Keep the face looking photographic and natural.
- Preserve real skin texture from IMAGE 1.
- Match face lighting gently to the new background and clothing.
- Do not add dramatic beauty lighting.
- Do not over-retouch.
- Do not create glossy plastic skin.
- No illustration, painting, CGI, anime, or synthetic portrait look.

NECK / SHOULDERS:
- Keep neck width and anatomy natural for the same person.
- Only adjust the visible neck if required to join the original face to the selected outfit naturally.
- Neck skin tone must match the face.
- Keep shoulders level and natural.
- Do not change apparent body size except what is necessary to match IMAGE 4 framing.

FINAL VALIDATION BEFORE OUTPUT:
1. Is this clearly the same person as IMAGE 1?
2. Are eyes, nose, lips, face shape, jaw, skin tone, makeup, and expression unchanged?
3. Is the selected outfit from IMAGE 2 used correctly?
4. ${hair==="original" ? "Is the original hairstyle from IMAGE 1 unchanged?" : `Does the hairstyle visually match hair-${hairNumber} from IMAGE 3?`}
5. Does framing match IMAGE 4?
6. Is the background ${BACKGROUNDS[background]||BACKGROUNDS.blue}?
7. Does the image still look like a real photograph rather than an AI-generated person?

PRIORITY ORDER:
1) SAME PERSON / FACE from IMAGE 1
2) selected OUTFIT from IMAGE 2
3) ${hair==="original" ? "original HAIR from IMAGE 1" : `selected HAIR from IMAGE 3 (hair-${hairNumber})`}
4) MASTER FRAMING from IMAGE 4
5) selected BACKGROUND
6) realistic blending only

If any reference conflicts with the customer's identity, preserve IMAGE 1 identity first.
`;
}

app.get("/api/health",(_,res)=>{
  res.json({ok:true,aiConfigured:Boolean(process.env.OPENAI_API_KEY),model:MODEL,referenceMode:"strict-29",promptVersion:"v9-identity-lock"});
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

    console.log("AI_PREFLIGHT", {
      suit:req.body.suit||"female-formal",
      outfitFile:path.basename(outfitPath),
      hairstyle:hairValue,
      hairFile:hairPath?path.basename(hairPath):"original",
      framingFile:path.basename(MASTER_REF),
      background,
      size
    });

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
      .resize(1200,1600,{
        fit:"contain",
        position:"centre",
        background:{r:30,g:132,b:232,alpha:1}
      })
      .png()
      .toBuffer();

    return res.json({
      image:`data:image/png;base64,${finalPng.toString("base64")}`,
      used:{
        suit:req.body.suit||"female-formal",
        hairstyle:hairValue,
        background,
        size:"3:4",
        referenceMode:"strict-29",promptVersion:"v9-identity-lock",
        framingPostProcess:"contain-no-crop",
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
