import "dotenv/config";import express from"express";import multer from"multer";import fs from"fs/promises";import sharp from"sharp";
const app=express(),up=multer({dest:"tmp/",limits:{fileSize:20*1024*1024}});app.use(express.static("public"));
const W=900,H=1200;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

async function rgba(path){return sharp(path).rotate().ensureAlpha().png().toBuffer()}
async function meta(path){return sharp(path).rotate().metadata()}

/*
 v5 ARCHITECTURE
 1) HEAD CUTOUT = deterministic alpha/mask input. No generative face editing.
 2) UNIFORM = pixel locked. Never sent to generative AI.
 3) AUTO PROPORTION = computed scaling/placement.
 4) NECK = optional isolated inpaint service hook only.
 5) FINAL = local compositing/export.
*/
async function buildBase(personPath,uniformPath,maskPath,opts={}){
 const pm=await meta(personPath), um=await meta(uniformPath);
 // Scale uniform into lower canvas while preserving its pixels/aspect ratio.
 const uniScale=Math.min(860/um.width,760/um.height);
 const uw=Math.round(um.width*uniScale), uh=Math.round(um.height*uniScale);
 const uniform=await sharp(uniformPath).rotate().resize(uw,uh,{fit:"fill"}).ensureAlpha().png().toBuffer();
 const ux=Math.round((W-uw)/2), uy=H-uh;

 // Template neck opening can be supplied per-template later. Defaults are conservative.
 const neckX=Number(opts.neckX||W/2), neckY=Number(opts.neckY||uy+90);
 const shoulderWidth=Number(opts.shoulderWidth||uw*.78);

 // Female target shoulder/head ratio 2.0–2.3, center 2.15.
 const targetHeadW=clamp(shoulderWidth/2.15,250,390);
 const scale=targetHeadW/pm.width;
 const pw=Math.round(pm.width*scale), ph=Math.round(pm.height*scale);

 let person=await sharp(personPath).rotate().resize(pw,ph,{fit:"fill"}).ensureAlpha().png().toBuffer();
 if(maskPath){
   const mask=await sharp(maskPath).rotate().resize(pw,ph,{fit:"fill"}).greyscale().png().toBuffer();
   // Apply provided high-quality head/hair mask.
   const rgb=await sharp(person).removeAlpha().png().toBuffer();
   person=await sharp(rgb).joinChannel(mask).png().toBuffer();
 }

 // Place bottom of retained head/under-chin region slightly into the future neck zone.
 const px=Math.round(neckX-pw/2), py=Math.round(neckY-ph+70);

 const bg=await sharp({create:{width:W,height:H,channels:4,background:{r:24,g:105,b:205,alpha:1}}}).png().toBuffer();
 const base=await sharp(bg).composite([
   {input:uniform,left:ux,top:uy,blend:"over"},
   {input:person,left:px,top:py,blend:"over"}
 ]).png().toBuffer();

 // Small isolated neck rectangle: must not cover face/hair/insignia.
 const neckBox={
   left:clamp(Math.round(neckX-targetHeadW*.19),0,W-1),
   top:clamp(Math.round(neckY-55),0,H-1),
   width:clamp(Math.round(targetHeadW*.38),60,W),
   height:clamp(125,60,H)
 };
 if(neckBox.left+neckBox.width>W)neckBox.width=W-neckBox.left;
 if(neckBox.top+neckBox.height>H)neckBox.height=H-neckBox.top;
 return {base,neckBox,metrics:{targetHeadW:Math.round(targetHeadW),shoulderWidth:Math.round(shoulderWidth),ratio:+(shoulderWidth/targetHeadW).toFixed(2),uniformLocked:true}};
}

async function neckInpaint(base,box){
 // Safety/economy rule: AI is OFF unless explicitly enabled.
 if(process.env.ENABLE_NECK_AI!=="true"||!process.env.OPENAI_API_KEY)return {buffer:base,used:false};
 // v5 exposes the isolated neck-zone architecture but deliberately does not send the
 // whole portrait/uniform to generative AI. A production neck-only provider should
 // receive ONLY a crop/mask bounded by box and return ONLY that patch.
 // Until such a provider is configured, preserve original pixels rather than fake a lock.
 return {buffer:base,used:false};
}

app.post("/api/create",up.fields([{name:"head",maxCount:1},{name:"uniform",maxCount:1},{name:"headMask",maxCount:1}]),async(req,res)=>{
 const head=req.files?.head?.[0],uniform=req.files?.uniform?.[0],mask=req.files?.headMask?.[0];
 if(!head||!uniform)return res.status(400).json({error:"กรุณาเลือกรูปบุคคลและ Template ชุด"});
 try{
  const {base,neckBox,metrics}=await buildBase(head.path,uniform.path,mask?.path,req.body||{});
  const neck=await neckInpaint(base,neckBox);
  const out=await sharp(neck.buffer).resize(W,H,{fit:"fill"}).png({compressionLevel:9}).toBuffer();
  res.json({image:`data:image/png;base64,${out.toString("base64")}`,width:W,height:H,aiCalls:neck.used?1:0,neckAI:neck.used,neckBox,metrics});
 }catch(e){res.status(500).json({error:e.message})}
 finally{for(const a of Object.values(req.files||{}))for(const f of a)fs.unlink(f.path).catch(()=>{})}
});
app.listen(process.env.PORT||3000,()=>console.log("GovPhoto v5 ready"));