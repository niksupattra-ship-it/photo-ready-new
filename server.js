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

    const prompt=`PHOTOREALISTIC ID-PHOTO COMPOSITING. LOCAL EDITS ONLY.
The first image is already geometrically placed and scaled. Treat its face, head position, uniform, shoulders, collar, background and framing as locked photographic source material. The second image is ONLY the hairstyle shape/reference.

IDENTITY / SKIN LOCK — HIGHEST PRIORITY: Do not redraw, beautify, retouch or synthesize the facial skin. Preserve the existing face geometry and ALL real photographic micro-detail: pores, fine lines, natural uneven tone, small marks, tiny texture transitions and sensor/camera grain. The desired finish is a sharply focused professional-camera portrait, NOT smoother skin. Keep pores and genuine texture crisp and locally defined without inventing detail. Use natural optical sharpness only: no oversharpen halos, crunchy edges, clarity/HDR look, denoise-smearing, porcelain/waxy/plastic skin, beauty filter, whitening, makeup enhancement or CGI/illustration appearance. Do not change eyes, brows, nose, mouth, cheeks, jaw, expression, age or facial proportions.

REALISTIC LIGHTING / CAMERA RESPONSE: preserve the subject's believable skin reflectance and original identity while making newly generated neck/hair transitions obey one coherent photographic light source. Highlights must be soft and physically plausible, shadows gradual, skin neither flat nor glossy, and color temperature consistent across face, ears, jaw and neck. No studio-glamour relighting, no fake rim light, no bloom, no excessive dynamic-range compression. The final image should resemble a well-focused professional camera exposure with natural lens rendering and restrained contrast.

EDIT REGION 1 — SHORT NECK CONNECTION ONLY: create only the missing short anatomical bridge between the fixed underside of the jaw and the fixed center collar opening. Do not use the source-photo neck as a proportion reference. Keep the neck compact and naturally broad enough to support this jaw, with subtle natural widening toward the collar. Preserve realistic skin texture and copy the face's local color, pores, lighting direction, contrast and camera grain onto the generated neck. Do not lengthen the neck, thin it, move the head, move the chin, move the collar, or alter the uniform.

EDIT REGION 2 — FACE-ADAPTIVE HAIRSTYLE OUTSIDE THE FACE: the second image defines the hairstyle DESIGN (parting, length class, fringe/bangs concept, volume pattern, direction and overall character), but it is NOT a rigid overlay and its model's skull/face proportions must NEVER be copied. First infer the fixed subject's own forehead width, temple positions, cheek/jaw width, ear positions, natural hairline and head silhouette from the FIRST image. Then fit/reconstruct the selected hairstyle around THAT subject's anatomy.

FACE-SHAPE FIT RULES: preserve the subject's exact face outline and forehead; do not narrow, widen, lengthen, shorten or otherwise reshape the face to make the hairstyle fit. Adapt only the hair. Keep the selected style recognizably the same while allowing natural local changes in width, curvature, root position, side volume and strand direction so it follows this person's skull and frames this person's temples/cheeks/jaw naturally. The hair must meet the subject's own hairline and temples without covering or exposing an unnatural amount of forehead. Side locks/bangs must sit outside the fixed facial contour and must not intrude into eyes, brows, cheeks or jaw. Do not paste the reference hairstyle at its original scale. Do not copy the reference model's face, forehead, ears, head size, skin or identity.

HAIR SCALE / BALANCE: derive hairstyle scale from the FIRST image's head, not from canvas size and not from the reference image. The finished outer hair silhouette must be anatomically plausible for the subject's existing skull and balanced with the fixed head/neck/shoulders. Avoid an oversized wig, tiny cap, flat top, excessive side width, excessive crown height, or floating hair. Preserve a believable amount of crown volume for the chosen style.

HAIR PHOTOREALISM: roots must emerge naturally from the subject's own scalp/hairline. Preserve realistic occlusion around ears and temples. Hair must be photographic with individual strands, natural density variation, subtle flyaways, realistic roots, coherent lighting and camera grain; no painted, helmet-like, overly perfect, synthetic or pasted-on AI hair.

SEAM / EDGE FINISH: remove visible cutout halos, hard mask edges, color fringes and pasted-on boundaries around temples, ears, jaw sides and hair. Blend only a narrow transition band. Preserve the original pixels throughout the interior of the face. Match edge sharpness, local light, color temperature and camera grain so the composite looks optically photographed in one shot. Do not blur the whole face to hide seams.

TEMPLATE LOCK: uniform, collar, tie, insignia, epaulettes, buttons, shoulders, body proportions, background and crop are immutable.

FINAL QUALITY TEST: the result must look like a sharply focused, naturally lit, unretouched professional-camera ID photograph with visible authentic skin microtexture and no AI/plastic finish. If an edit would make the face smoother, cleaner, more symmetrical, more beautiful, more three-dimensional, more projected, or more AI-looking than the supplied face, DO NOT APPLY THAT EDIT. Preserve identity and real skin over aesthetic improvement.
Skin finishing must be extremely subtle: lightly even only tiny local tonal irregularities while preserving pores, fine lines, natural texture, moles, facial contours and all identity details.
Use a neutral professional portrait-studio white balance. Remove unwanted yellow/orange cast from skin and neck without making skin pink, gray, pale or artificially white.
Match face and newly generated neck to the same neutral skin tone and exposure. Lighting should resemble a professional photo studio: soft diffused key light, gentle natural fill, controlled highlights, realistic soft shadows and smooth tonal roll-off.
Do not use beauty retouching, waxy/plastic skin, airbrushing, heavy denoise, fake HDR, excessive sharpening, excessive saturation, yellow skin, orange skin, whitening, or makeup enhancement.
`;

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
