import express from "express";import multer from "multer";import sharp from "sharp";import ort from "onnxruntime-node";import path from "path";import fs from "fs";import {fileURLToPath}from"url";
const __dirname=path.dirname(fileURLToPath(import.meta.url));const app=express();const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024}});
let session;
async function model(){if(!session){const p=process.env.MODEL_PATH||path.join(__dirname,"models","birefnet.onnx");if(!fs.existsSync(p))throw new Error("MODEL_NOT_FOUND");session=await ort.InferenceSession.create(p,{executionProviders:["cpu"]})}return session}
app.post("/api/remove-background",upload.single("image"),async(req,res)=>{try{
 if(!req.file)return res.status(400).send("กรุณาเลือกรูป");
 const s=await model(); const meta=await sharp(req.file.buffer).metadata(); const size=1024;
 const {data,info}=await sharp(req.file.buffer).removeAlpha().resize(size,size,{fit:"fill"}).raw().toBuffer({resolveWithObject:true});
 const input=new Float32Array(3*size*size);const mean=[.485,.456,.406],std=[.229,.224,.225];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*3,p=y*size+x;for(let c=0;c<3;c++)input[c*size*size+p]=(data[i+c]/255-mean[c])/std[c]}
 const names=s.inputNames;const out=await s.run({[names[0]]:new ort.Tensor("float32",input,[1,3,size,size])});let arr=out[s.outputNames[0]].data;
 let min=Infinity,max=-Infinity;for(const v of arr){if(v<min)min=v;if(v>max)max=v}
 const mask=Buffer.alloc(size*size);for(let i=0;i<mask.length;i++){let v=arr[i];if(min<0||max>1)v=1/(1+Math.exp(-v));mask[i]=Math.max(0,Math.min(255,Math.round(v*255)))}
 const alpha=await sharp(mask,{raw:{width:size,height:size,channels:1}}).resize(meta.width,meta.height,{fit:"fill",kernel:"lanczos3"}).blur(.35).raw().toBuffer();
 const rgb=await sharp(req.file.buffer).removeAlpha().raw().toBuffer();const rgba=Buffer.alloc(meta.width*meta.height*4);
 for(let i=0,j=0;i<alpha.length;i++,j+=3){const k=i*4;rgba[k]=rgb[j];rgba[k+1]=rgb[j+1];rgba[k+2]=rgb[j+2];rgba[k+3]=alpha[i]}
 const png=await sharp(rgba,{raw:{width:meta.width,height:meta.height,channels:4}}).png().toBuffer();res.type("png").send(png)
 }catch(e){console.error(e);res.status(500).send(e.message==="MODEL_NOT_FOUND"?"ยังไม่มีโมเดล: วาง BiRefNet ONNX ที่ models/birefnet.onnx":("ประมวลผลไม่สำเร็จ: "+e.message))}});
app.use(express.static(path.join(__dirname,"dist")));app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"dist","index.html")));
app.listen(process.env.PORT||3000,()=>console.log("Background Remover TH ready"));