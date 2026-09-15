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

app.get("/api/health",(req,res)=>res.json({ok:true,provider:"remove.bg",configured:!!process.env.REMOVEBG_API_KEY}));
app.use(express.static(path.join(dir,"dist")));
app.use((req,res)=>res.sendFile(path.join(dir,"dist","index.html")));
app.listen(process.env.PORT||3000,()=>console.log("BG Remover ready"));
