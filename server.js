import express from"express";import multer from"multer";import fs from"fs/promises";import sharp from"sharp";import{removeBackground}from"@imgly/background-removal-node";
const app=express(),up=multer({dest:"tmp/",limits:{fileSize:20*1024*1024}});app.use(express.static("public"));
const W=900,H=1200,BLUE={r:24,g:105,b:205,alpha:1};
async function autoCutout(path){
 const input=await fs.readFile(path);
 const blob=new Blob([input],{type:"image/jpeg"});
 const out=await removeBackground(blob,{output:{format:"image/png",quality:1}});
 return Buffer.from(await out.arrayBuffer());
}
async function cropHead(cutout){
 const m=await sharp(cutout).metadata();
 // Keep top 62% of segmented person: head/hair + short neck area; removes torso.
 const hh=Math.max(1,Math.round(m.height*.62));
 return sharp(cutout).extract({left:0,top:0,width:m.width,height:hh}).trim({background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
}
app.post("/api/create",up.fields([{name:"person",maxCount:1},{name:"uniform",maxCount:1}]),async(req,res)=>{
 const p=req.files?.person?.[0],u=req.files?.uniform?.[0];if(!p||!u)return res.status(400).json({error:"กรุณาเลือกรูปคนและชุด"});
 try{
  // 1. AUTO SEGMENTATION: no user mask required.
  const cut=await autoCutout(p.path);
  // 2. Remove torso, keep transparent head/hair layer.
  const head=await cropHead(cut);
  const hm=await sharp(head).metadata(),um=await sharp(u.path).rotate().metadata();

  // 3. Pixel-locked uniform. Only uniform-wide scale; no generative redraw.
  const us=Math.min(860/um.width,760/um.height),uw=Math.round(um.width*us),uh=Math.round(um.height*us);
  const uniform=await sharp(u.path).rotate().resize(uw,uh).ensureAlpha().png().toBuffer();
  const ux=Math.round((W-uw)/2),uy=H-uh;

  // 4. Auto proportion from template shoulder span approximation.
  const shoulderW=uw*.78,targetHeadW=Math.max(250,Math.min(370,shoulderW/2.15));
  const hs=targetHeadW/hm.width,hw=Math.round(hm.width*hs),hh=Math.round(hm.height*hs);
  const headScaled=await sharp(head).resize(hw,hh).png().toBuffer();

  // 5. Place head at template neck center; preserve alpha so NO source rectangle remains.
  const neckX=W/2,neckY=uy+118;
  const hx=Math.round(neckX-hw/2),hy=Math.round(neckY-hh+72);

  const bg=await sharp({create:{width:W,height:H,channels:4,background:BLUE}}).png().toBuffer();
  const out=await sharp(bg).composite([{input:uniform,left:ux,top:uy},{input:headScaled,left:hx,top:hy}]).png().toBuffer();

  res.json({image:`data:image/png;base64,${out.toString("base64")}`,aiCalls:0,autoMask:true,uniformLocked:true,
    metrics:{headWidth:hw,shoulderWidth:Math.round(shoulderW),ratio:+(shoulderW/hw).toFixed(2)},
    status:"AUTO_HEAD_EXTRACTION_OK"});
 }catch(e){console.error(e);res.status(500).json({error:e.message})}
 finally{for(const a of Object.values(req.files||{}))for(const f of a)fs.unlink(f.path).catch(()=>{})}
});
app.listen(process.env.PORT||3000,()=>console.log("GovPhoto v5.1 ready"));