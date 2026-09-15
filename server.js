import express from"express";import multer from"multer";import fs from"fs/promises";import sharp from"sharp";
const app=express(),up=multer({dest:"tmp/",limits:{fileSize:20*1024*1024}});
app.use(express.static("public")); const W=900,H=1200;

// v4: NON-GENERATIVE uniform pipeline.
// IMPORTANT: uniform pixels are never sent to a generative image model.
async function normalize(file,w,h,fit="contain"){
 return sharp(file).rotate().resize(w,h,{fit,position:"centre",background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
}
app.post("/api/create",up.fields([{name:"person",maxCount:1},{name:"uniform",maxCount:1},{name:"personMask",maxCount:1}]),async(req,res)=>{
 const person=req.files?.person?.[0], uniform=req.files?.uniform?.[0], mask=req.files?.personMask?.[0];
 if(!person||!uniform)return res.status(400).json({error:"กรุณาเลือกรูปบุคคลและ Template ชุด"});
 try{
   // Canvas/background. No AI/API charge.
   const bg=await sharp({create:{width:W,height:H,channels:4,background:{r:24,g:105,b:205,alpha:1}}}).png().toBuffer();

   // Real uniform template: only deterministic resize/position. No regeneration.
   // It occupies lower canvas and is never warped in this safe baseline.
   const uni=await normalize(uniform.path,860,720,"contain");

   // Person/head layer. For production, supply a transparent PNG or personMask from segmentation.
   let personLayer=await normalize(person.path,520,650,"contain");
   if(mask){
     const m=await sharp(mask.path).rotate().resize(520,650,{fit:"contain",background:{r:0,g:0,b:0}}).greyscale().toBuffer();
     personLayer=await sharp(personLayer).joinChannel(m).png().toBuffer();
   }

   // Pixel-locked compositing: head/person above uniform.
   // Uniform details remain the source pixels; only scaling is performed.
   const out=await sharp(bg).composite([
     {input:uni,left:20,top:470,blend:"over"},
     {input:personLayer,left:190,top:70,blend:"over"}
   ]).png({compressionLevel:9}).toBuffer();

   res.json({
     image:`data:image/png;base64,${out.toString("base64")}`,
     width:W,height:H,aiCalls:0,
     uniformMode:"PIXEL_LOCKED",
     note:"ชุดจริงไม่ผ่าน Generative AI"
   });
 }catch(e){res.status(500).json({error:e.message})}
 finally{for(const group of Object.values(req.files||{}))for(const f of group)fs.unlink(f.path).catch(()=>{})}
});
app.listen(process.env.PORT||3000,()=>console.log("GovPhoto v4 Pixel Locked ready"));