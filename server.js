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
  const matte=out[session.outputNames[0]].data;
  const alphaSmall=Buffer.alloc(plane);
  for(let i=0;i<plane;i++) alphaSmall[i]=Math.max(0,Math.min(255,Math.round(Number(matte[i])*255)));
  // Upscale ONLY the matte to the original AI dimensions. The source RGB itself is never resized.
  const alpha=await sharp(alphaSmall,{raw:{width:nw,height:nh,channels:1}}).resize(W,H,{fit:"fill",kernel:"lanczos3"}).raw().toBuffer();
  const rgb=await sharp(input).removeAlpha().raw().toBuffer();
  return sharp(rgb,{raw:{width:W,height:H,channels:3}}).joinChannel(alpha,{raw:{width:W,height:H,channels:1}}).png().toBuffer();
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

    const prompt=`PROFESSIONAL ID-PORTRAIT REFERENCE EDIT. Image 1 is the ORIGINAL FULL-QUALITY photograph of the subject. It is the sole authority for identity, face, skin, complexion, facial anatomy, expression and photographic skin texture.${keepOriginalHair?" There is no hairstyle reference: preserve the original hairstyle from Image 1.":" Image 2 is a HAIRSTYLE REFERENCE ONLY. Use it only for hairstyle geometry and appearance; never transfer its face, skin, lighting, makeup, head shape or identity."}

GOAL: create one continuous, photorealistic head + hair + ears + natural bare neck layer of the SAME PERSON for an ID portrait. Preserve the subject as a real photographed person, not a beautified or re-rendered face. The application will place this layer behind its existing fixed clothing template, so DO NOT create or modify any clothing.

IDENTITY / FACE LOCK: preserve Image 1's exact facial structure and recognizable identity: eye shape and spacing, brows, nose, lips, cheeks, jaw, chin, ears, asymmetry, expression, age and proportions. Do not idealize, reshape, beautify or substitute facial features.

SKIN SOURCE LOCK: Image 1 is authoritative. Preserve the real skin character visible in Image 1: pores, fine texture, tiny blemishes, fine lines, under-eye texture, natural tonal variation and non-uniform surface detail. Do not smooth, airbrush, denoise, blur, wax, porcelainize, repaint, synthesize fake pores, whiten, add makeup, add plastic gloss or apply a beauty filter. Keep the original complexion. Only make the minimal global photographic exposure/white-balance normalization needed for a clean professional ID portrait; never turn that correction into skin retouching.

HAIR: ${keepOriginalHair?"preserve the original hair from Image 1, including hairline, parting, volume, strand character and silhouette.":"change ONLY the hairstyle to follow Image 2. Match its parting, fringe, side shape, crown, volume, length, tied/untied structure and silhouette while adapting it naturally to the subject's own skull, hairline and ears. Hair must have real roots, individual strands, density variation and flyaways. The hairstyle reference has ZERO authority over face, skin, complexion or lighting."}

OUTPUT / ANATOMY: centered front-facing ID-photo head, complete hair and ears, plus a natural straight neck ending before the torso/clothing. No shirt, collar, tie, jacket, uniform, epaulettes, insignia, buttons or fabric. Use a simple temporary solid background. Keep natural camera detail without halos or artificial sharpening.

FINAL PRIORITY: (1) same identity and face from Image 1, (2) real skin texture from Image 1, (3) selected hairstyle only from Image 2 when supplied, (4) natural neck transition. Return a single coherent photographic person layer, not a face mask or pasted face.`

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

app.get("/api/health",(req,res)=>res.json({ok:true,provider:"MODNet-local",configured:true,removeBgCreditRequired:false}));
app.use(express.static(path.join(dir,"dist")));
app.use((req,res)=>res.sendFile(path.join(dir,"dist","index.html")));
app.listen(process.env.PORT||3000,()=>console.log("BG Remover ready"));
