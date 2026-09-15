import "dotenv/config";import express from"express";import multer from"multer";import fs from"fs/promises";import sharp from"sharp";
const app=express(),up=multer({dest:"tmp/",limits:{fileSize:15*1024*1024}});app.use(express.static("public"));
const W=900,H=1200;
const PROMPT=`Edit the supplied images into one photorealistic Thai government official portrait.
Image 1 is the identity source, image 2 the REAL uniform template, optional image 3 the hairstyle reference.
Preserve identity: face shape, eyes, eyebrows, nose, lips, jaw, natural skin texture/tone and distinguishing marks. Do not beautify or redraw the face unnecessarily.
Preserve the supplied uniform design, epaulettes, insignia, buttons, lapels, tie, seams, colors and materials as closely as possible. Do not invent a new uniform or insignia.
If a hair reference is supplied, change only hairstyle toward that reference while preserving the person's face.
PROPORTION LOCK: never enlarge the head to fill the canvas. Female shoulder span target about 2.0-2.3 head widths; natural neck length about 0.33-0.50 head height. Show complete head, neck, both shoulders and upper torso. Prefer zooming the WHOLE person out rather than enlarging the head. No giant head, tiny body, floating neck, cropped shoulders, duplicate/ghost face, halos or visible seams.
Straight-on centered official portrait, medium upper-body framing, 3:4, clean vivid blue background. Photoshop-like realistic compositing, not creative redesign.`;

async function apiEdit(files){
 const f=new FormData();f.append("model",process.env.IMAGE_MODEL||"gpt-image-2");f.append("prompt",PROMPT);
 // ECONOMY: one generative call only; lower working output size.
 f.append("size",process.env.API_IMAGE_SIZE||"1024x1536");
 for(const x of files){const b=await fs.readFile(x.path);f.append("image[]",new Blob([b],{type:x.mimetype||"image/png"}),x.originalname)}
 const r=await fetch("https://api.openai.com/v1/images/edits",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:f});
 const d=await r.json();if(!r.ok)throw Error(d?.error?.message||"Image API error");
 const item=d?.data?.[0];if(item?.b64_json)return Buffer.from(item.b64_json,"base64");
 if(item?.url){const q=await fetch(item.url);return Buffer.from(await q.arrayBuffer())}throw Error("API ไม่ได้ส่งรูปกลับมา");
}
app.post("/api/create",up.fields([{name:"portrait",maxCount:1},{name:"uniform",maxCount:1},{name:"hair",maxCount:1}]),async(req,res)=>{
 const files=[req.files?.portrait?.[0],req.files?.uniform?.[0],req.files?.hair?.[0]].filter(Boolean);
 if(files.length<2)return res.status(400).json({error:"ต้องมีรูปบุคคลและ Template ชุด"});
 if(!process.env.OPENAI_API_KEY)return res.status(500).json({error:"ยังไม่ได้ตั้ง OPENAI_API_KEY"});
 try{
   // Only ONE paid AI edit. Resize/crop/export are local and add no API call.
   const ai=await apiEdit(files);
   const out=await sharp(ai).resize(W,H,{fit:"cover",position:"centre"}).png({compressionLevel:9}).toBuffer();
   res.json({image:`data:image/png;base64,${out.toString("base64")}`,width:W,height:H,aiCalls:1,mode:"economy"});
 }catch(e){res.status(500).json({error:e.message})}
 finally{for(const x of files)fs.unlink(x.path).catch(()=>{})}
});
app.listen(process.env.PORT||3000,()=>console.log("GovPhoto Auto v3 Economy ready"));