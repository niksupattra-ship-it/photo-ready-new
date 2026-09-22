import express from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import {editHairstyle,providerStatus} from "./hairstyle-engine/index.js";
import { fileURLToPath } from "url";

const dir=path.dirname(fileURLToPath(import.meta.url));
const app=express();
const upload=multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:20*1024*1024,files:2,fields:10,parts:12}
});

// V77: zero-per-image-cost portrait matting after AI using MODNet + ONNX Runtime WebAssembly.
// Uses onnxruntime-web instead of the native onnxruntime-node package so container builds do not need native NuGet binaries.
// The model only predicts an alpha matte. RGB pixels from the exact AI PNG are retained;
// no beauty/skin/sharpen/denoise/color pass is applied here.
const MODNET_URL="https://github.com/yakhyo/modnet/releases/download/weights/modnet_photographic.onnx";
const MODNET_PATH=path.join(dir,".cache","modnet_photographic.onnx");
let modnetSessionPromise=null;

async function getModnetSession(){
  if(modnetSessionPromise) return modnetSessionPromise;
  modnetSessionPromise=(async()=>{
    const fs=await import("fs");
    const fsp=fs.promises;
    await fsp.mkdir(path.dirname(MODNET_PATH),{recursive:true});
    if(!fs.existsSync(MODNET_PATH) || fs.statSync(MODNET_PATH).size<20*1024*1024){
      const r=await fetch(MODNET_URL,{redirect:"follow"});
      if(!r.ok) throw new Error(`ดาวน์โหลด MODNet ไม่สำเร็จ (${r.status})`);
      const tmp=MODNET_PATH+".tmp";
      await fsp.writeFile(tmp,Buffer.from(await r.arrayBuffer()));
      await fsp.rename(tmp,MODNET_PATH);
    }
    const ort=await import("onnxruntime-web/wasm");
    ort.env.wasm.numThreads=1;
    ort.env.wasm.proxy=false;
    const modelBytes=new Uint8Array(await fsp.readFile(MODNET_PATH));
    return ort.InferenceSession.create(modelBytes,{executionProviders:["wasm"]});
  })().catch(e=>{modnetSessionPromise=null;throw e});
  return modnetSessionPromise;
}

async function modnetRemoveBackground(input){
  const sharp=(await import("sharp")).default;
  const ort=await import("onnxruntime-web/wasm");
  const src=sharp(input,{failOn:"none"});
  const meta=await src.metadata();
  const W=meta.width,H=meta.height;
  if(!W||!H) throw new Error("อ่านขนาดภาพไม่ได้");
  const target=512;
  let nw,nh;
  if(Math.max(H,W)<target || Math.min(H,W)>target){
    if(W>=H){nh=target;nw=Math.floor(W/H*target)}else{nw=target;nh=Math.floor(H/W*target)}
  }else{nw=W;nh=H}
  nw=Math.max(32,nw-(nw%32));nh=Math.max(32,nh-(nh%32));
  const {data}=await sharp(input).removeAlpha().resize(nw,nh,{fit:"fill",kernel:"lanczos3"}).raw().toBuffer({resolveWithObject:true});
  const plane=nw*nh,tensorData=new Float32Array(3*plane);
  for(let i=0;i<plane;i++){
    tensorData[i]=(data[i*3]/255-.5)/.5;
    tensorData[plane+i]=(data[i*3+1]/255-.5)/.5;
    tensorData[2*plane+i]=(data[i*3+2]/255-.5)/.5;
  }
  const session=await getModnetSession();
  const inputName=session.inputNames[0];
  const out=await session.run({[inputName]:new ort.Tensor("float32",tensorData,[1,3,nh,nw])});
  const output=out[session.outputNames[0]];
  const matte=output.data;
  const dims=output.dims||[];
  const oh=Number(dims[dims.length-2]||nh),ow=Number(dims[dims.length-1]||nw);
  if(!Number.isFinite(ow)||!Number.isFinite(oh)||ow*oh!==matte.length){
    throw new Error(`MODNet output shape ผิดปกติ: ${JSON.stringify(dims)} / ${matte.length}`);
  }

  // V78: build the alpha image explicitly. Do not join a raw one-channel Buffer directly:
  // that path produced row-stride/banding artefacts on the WASM deployment.
  const alphaSmall=Buffer.alloc(ow*oh);
  for(let i=0;i<alphaSmall.length;i++){
    const v=Number(matte[i]);
    alphaSmall[i]=Math.max(0,Math.min(255,Math.round((Number.isFinite(v)?v:0)*255)));
  }
  // V79: resize ONLY the matte. Force the resized result back to one grayscale channel.
  // Sharp may otherwise expand a raw 1-channel image to multiple channels on some builds.
  const alphaResult=await sharp(alphaSmall,{raw:{width:ow,height:oh,channels:1}})
    .resize(W,H,{fit:"fill",kernel:"lanczos3"})
    .greyscale()
    .raw()
    .toBuffer({resolveWithObject:true});
  const alpha=alphaResult.data;
  if(alphaResult.info.width!==W || alphaResult.info.height!==H || alphaResult.info.channels!==1 || alpha.length!==W*H){
    throw new Error(`MODNet alpha resize ผิดขนาด: ${alphaResult.info.width}x${alphaResult.info.height} ch=${alphaResult.info.channels}`);
  }

  // Keep the 01-AI-RAW image at full W×H. Never resize/downsample the portrait RGB.
  // Converting the decoded pixels to sRGB only guarantees a stable 3-channel raw layout for RGBA packing.
  const rgbResult=await sharp(input).toColourspace("srgb").removeAlpha().raw().toBuffer({resolveWithObject:true});
  const rgb=rgbResult.data;
  if(rgbResult.info.width!==W || rgbResult.info.height!==H || rgbResult.info.channels!==3 || rgb.length!==W*H*3){
    throw new Error(`MODNet RGB decode ผิดขนาด: ${rgbResult.info.width}x${rgbResult.info.height} ch=${rgbResult.info.channels}`);
  }
  const rgba=Buffer.allocUnsafe(W*H*4);
  for(let i=0,j=0,k=0;i<W*H;i++,j+=3,k+=4){
    rgba[k]=rgb[j];rgba[k+1]=rgb[j+1];rgba[k+2]=rgb[j+2];rgba[k+3]=alpha[i];
  }
  return sharp(rgba,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
}

app.post("/api/remove-background",upload.single("image"),async(req,res)=>{
  try{
    if(!req.file) return res.status(400).send("กรุณาเลือกรูป");
    const data=await modnetRemoveBackground(req.file.buffer);
    res.set("Content-Type","image/png");
    res.set("X-Background-Provider","MODNet-local");
    res.set("Cache-Control","no-store");
    res.send(data);
  }catch(e){
    console.error(e);
    res.status(500).send("MODNet ลบพื้นหลังไม่สำเร็จ: "+e.message);
  }
});


// V114: separate provider engine; no Hair Donor, no mask upload, no implicit fallback.
app.get("/api/hairstyle/providers",(req,res)=>res.json(providerStatus()));
app.post("/api/hairstyle/edit",upload.single("image"),async(req,res)=>{
 try{
  const result=await editHairstyle({portrait:req.file,hairId:req.body?.hairId,root:dir});
  res.set("Content-Type","image/png");res.set("Cache-Control","no-store");
  res.set("X-Hairstyle-Provider",result.provider);
  res.set("X-Hairstyle-Cache",result.cache||"MISS");
  if(result.requestId)res.set("X-Request-Id",result.requestId);
  res.send(result.png);
 }catch(error){
  console.error("Hairstyle engine:",error.message,error.requestId||"");
  res.status(error.status>=400&&error.status<600?error.status:500).send(error.message);
 }
});

app.post("/api/ai-finish",upload.fields([{name:"image",maxCount:1},{name:"mask",maxCount:1}]),async(req,res)=>{
  try{
    const inputFile=req.files?.image?.[0];
    if(!inputFile) return res.status(400).send("ไม่มีภาพสำหรับ AI finishing");
    const inpaint=req.body?.mode==="hair-inpaint";
    const hairDonor=false; // V113: obsolete donor endpoint disabled
    if(req.body?.mode==="hair-donor")return res.status(400).send("Hair Donor ถูกยกเลิกแล้ว กรุณาอัปเดตหน้าเว็บ");
    const maskFile=req.files?.mask?.[0];
    if(inpaint&&!maskFile) return res.status(400).send("ไม่มี hair inpainting mask");
    if(!inpaint&&maskFile) return res.status(400).send("ส่ง mask ได้เฉพาะโหมด hair-inpaint");
    const key=process.env.OPENAI_API_KEY;
    if(!key) return res.status(500).send("ยังไม่ได้ตั้งค่า OPENAI_API_KEY บนเซิร์ฟเวอร์");

    const hairId=req.body?.hairId||"original";
    const cleanHead=hairId==="clean-head";
    const keepOriginalHair=hairId==="original"||cleanHead;
    let hairBuf=null;
    if(!keepOriginalHair){
      const hairPath=path.join(dir,"public","assets","hair",`${hairId}.png`);
      const fs=await import("fs");
      if(!fs.existsSync(hairPath)) return res.status(400).send("ไม่พบไฟล์ทรงผมที่เลือก");
      hairBuf=fs.readFileSync(hairPath);
    }

    const cleanPrompt=`CLEAN HEAD MASTER FOR A PROFESSIONAL ID PHOTO. This is a one-time anatomical reconstruction before hairstyle replacement. Remove ALL existing hair from the scalp, forehead, temples and behind the ears. Create a natural BALD scalp, complete anatomically plausible ears and uncovered neck wherever hair used to obscure them. Absolutely no remaining long strands, dark hair panels, sideburns, ponytail or hairline. Keep the person's face, expression, eyes, nose, mouth, jaw, original visible skin texture, complexion and head placement unchanged. Return a neutral professional head-and-short-neck crop on a plain temporary background; no torso or shoulders. This is an intermediate layer, not the final portrait.`;
    const prompt=hairDonor?`Create a photographic hairstyle DONOR for the same adult subject in image 1. Image 2 is the hairstyle reference. Change ONLY hair to match image 2: parting, fringe, volume, length, tied or untied shape. Preserve head orientation, eye positions, size, camera framing and background exactly. Natural hair roots, hairline, fine flyaways and studio lighting. Do not add hair over eyes, cheeks, ears, neck or clothing. The app extracts ONLY hair pixels from this result; face, skin, neck, ears and clothes from this AI output are discarded. Do not change the identity.`:inpaint?`EDIT ONLY THE HAIRSTYLE of the same adult person in image 1. Image 2 is a hairstyle reference ONLY. Follow the selected reference hairstyle, including parting, crown, fringe, silhouette and length. The transparent regions of the supplied mask are editable; preserve the opaque region, especially the entire face, forehead skin, eyebrows, ears, neck and uniform. Reconstruct any scalp and blue studio background previously covered by long hair as needed. Real photographic hair roots and fine flyaways, no hard cut lines, no rectangular patches or halos. Keep face identity and all uniform insignia unchanged. Return the same framing and scale.`:cleanHead?cleanPrompt:`PROFESSIONAL ID-PORTRAIT REFERENCE EDIT. Image 1 is the ORIGINAL FULL-QUALITY photograph of the subject. It is the sole authority for identity, face, skin, complexion, facial anatomy, expression and photographic skin texture.${keepOriginalHair?" There is no hairstyle reference: preserve the original hairstyle from Image 1.":" Image 2 is a HAIRSTYLE REFERENCE ONLY. Use it only for hairstyle geometry and appearance; never transfer its face, skin, lighting, makeup, head shape or identity."}

GOAL: create one continuous, photorealistic head + hair + ears + short neck layer of the SAME PERSON for an ID portrait. Preserve the subject as a real photographed person, not a beautified or re-rendered face. The application will place this layer behind its existing fixed clothing template, so DO NOT create or modify any clothing.

IDENTITY / FACE LOCK: preserve Image 1's exact facial structure and recognizable identity: eye shape and spacing, brows, nose, lips, cheeks, jaw, chin, ears, asymmetry, expression, age and proportions. Do not idealize, reshape, beautify or substitute facial features.

SKIN SOURCE LOCK: Image 1 is authoritative. Preserve the real skin character visible in Image 1: pores, fine texture, tiny blemishes, fine lines, under-eye texture, natural tonal variation and non-uniform surface detail. Do not smooth, airbrush, denoise, blur, wax, porcelainize, repaint, synthesize fake pores, whiten, add makeup, add plastic gloss or apply a beauty filter. Keep the original complexion. Only make the minimal global photographic exposure/white-balance normalization needed for a clean professional ID portrait; never turn that correction into skin retouching.

HAIR ONLY — STRICT FACE-SAFE EDIT: ${keepOriginalHair?"preserve the original hairstyle geometry from Image 1, but refine only the hair itself so its overall volume and outer silhouette look naturally balanced with the subject's existing face and skull. Do not change the hairline where it touches forehead/temples, and do not alter any face or skin pixels.":"change ONLY the hair region to follow Image 2. Match its parting, fringe, side shape, crown, length and tied/untied structure, but adapt ONLY the hair volume and outer silhouette so the hairstyle is naturally proportioned to Image 1's existing face, skull, ears and head size. The hairstyle reference has ZERO authority over face, skin, complexion, lighting or head/face geometry."}

HAIR REALISM: render photographic human hair with natural root direction, fine individual strands, strand separation, irregular density, subtle flyaways and realistic overlapping layers. Avoid a solid hair mass, painted texture, plastic shine, overly smooth strands, artificial edge halos or excessive sharpening. Preserve believable studio-light highlights so strand detail remains visible.

HAIR COLOR — PRO BLACK 50%: apply a restrained professional deep-black appearance comparable in visual strength to a 50% "Pro Black" hair adjustment: approximately halfway between the subject/reference's natural dark hair and neutral professional black. Keep realistic brown/charcoal tonal variation and specular highlights; do NOT make the hair flat jet-black, crush shadow detail, tint the skin, or darken eyebrows/eyelashes.

ABSOLUTE EXCLUSION MASK INSTRUCTION: every pixel belonging to forehead skin, temples, eyebrows, eyelashes, eyes, nose, cheeks, ears, lips, jaw, chin and neck is protected and must remain governed exclusively by Image 1. Hair balancing, strand refinement and Pro Black 50% must affect HAIR PIXELS ONLY. Do not resize, warp, retouch, recolor or regenerate the face to make it fit the hairstyle; fit the hairstyle to the unchanged face instead.

OUTPUT / ANATOMY: centered front-facing ID-photo head, complete hair and ears, plus a short natural neck; do not generate shoulders or torso. No shirt, collar, tie, jacket, uniform, epaulettes, insignia, buttons or fabric. Use a simple temporary solid background. Keep natural camera detail without halos or artificial sharpening.

FINAL PRIORITY: (1) same identity and face from Image 1, (2) real skin texture from Image 1, (3) selected hairstyle only from Image 2 when supplied, (4) natural neck transition. Return a single coherent photographic person layer, not a face mask or pasted face.`

    const form=new FormData();
    form.append("model","gpt-image-1.5");
    form.append("prompt",prompt);
    form.append("input_fidelity","high");
    form.append("quality","high");
    form.append("size","1024x1536");
    form.append("output_format","png");
    form.append("image[]",new Blob([inputFile.buffer],{type:inputFile.mimetype||"image/png"}),"portrait.png");
    if(inpaint) form.append("mask",new Blob([maskFile.buffer],{type:"image/png"}),"hair-mask.png");
    if(!keepOriginalHair) form.append("image[]",new Blob([hairBuf],{type:"image/png"}),`${hairId}.png`);

    const r=await fetch("https://api.openai.com/v1/images/edits",{
      method:"POST",headers:{Authorization:`Bearer ${key}`},body:form
    });
    const body=await r.json();
    if(!r.ok){
      const code=body?.error?.code || "image_edit_failed";
      const stage=body?.error?.moderation_details?.moderation_stage;
      if(code==="moderation_blocked" || code==="safety_violations"){
        console.error("OpenAI image edit safety block", JSON.stringify({code,moderation_details:body?.error?.moderation_details,request_id:r.headers.get("x-request-id")}));
        return res.status(r.status).send(`OpenAI image edit safety block${stage?` (${stage})`:""}. ระบบตรวจสอบผลลัพธ์ไม่อนุญาตให้ส่งภาพกลับมา (ไม่ใช่เครดิตหมด) — คงภาพเดิมไว้ ไม่มีการลองซ้ำอัตโนมัติ`);
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

app.get("/api/health",(req,res)=>res.json({ok:true,provider:"MODNet-local",configured:true,removeBgCreditRequired:false}));
app.use(express.static(path.join(dir,"dist")));
app.use((req,res)=>res.sendFile(path.join(dir,"dist","index.html")));
app.listen(process.env.PORT||3000,()=>console.log("BG Remover ready"));
