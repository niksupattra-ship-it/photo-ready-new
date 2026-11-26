import multer from 'multer';
import {createHash} from 'node:crypto';

import {proLabPayload} from './seedream-pro-lab.js';
const endpoint='https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

// Separate BYOK experiment: never touches production prompts, wallet or matting.
export function registerFemaleLabTransport(app,{fetchImpl=fetch,timeoutMs=240000,ttlMs=600000,route='/api/seedream-pro-lab',payloadFor=proLabPayload,extraFiles=[]}={}){
 const jobs=new Map();
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:3+extraFiles.length,fields:4,parts:7+extraFiles.length,fieldSize:64*1024}}).fields([{name:'outfit',maxCount:1},{name:'person',maxCount:1},{name:'hair',maxCount:1},...extraFiles.map(name=>({name,maxCount:1}))]);
 app.get(route+'/:id',(req,res)=>{
  res.set('Cache-Control','no-store');
  const job=jobs.get(req.params.id);
  if(!job)return res.status(404).json({error:'งานหมดอายุหรือเซิร์ฟเวอร์เริ่มใหม่'});
  if(job.png)return res.type('png').send(job.png);
  if(job.error)return res.status(502).json({error:job.error});
  res.status(202).json({status:'processing'});
 });
 app.post(route,(req,res)=>upload(req,res,async uploadError=>{
  res.set('Cache-Control','no-store');
  if(uploadError)return res.status(400).json({error:'ไฟล์ไม่ถูกต้องหรือใหญ่เกิน 20 MB ต่อรูป'});
  try{
   const key=String(req.body?.key||'').trim(),id=String(req.body?.requestId||'');
   if(!key)return res.status(400).json({error:'กรุณากรอก API key สำหรับทดลอง'});
   if(!/^[a-f0-9-]{36}$/.test(id))return res.status(400).json({error:'กรุณาโหลดหน้าทดลองใหม่'});
   const payload=await payloadFor({prompt:req.body?.prompt,order:req.body?.order,files:req.files});
   const body=JSON.stringify(payload),fingerprint=createHash('sha256').update(key).update(body).digest('hex');
   const prior=jobs.get(id);
   if(prior){if(prior.fingerprint!==fingerprint)return res.status(409).json({error:'ข้อมูลไม่ตรงกับงานเดิม กรุณาเริ่มงานใหม่'});return res.status(202).json({id});}
   if(jobs.size>=20)return res.status(503).json({error:'หน้าทดลองเต็ม กรุณารอสักครู่'});
   const job={fingerprint};jobs.set(id,job);setTimeout(()=>jobs.delete(id),ttlMs).unref();
   res.status(202).json({id});
   void(async()=>{try{
    const response=await fetchImpl(endpoint,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(timeoutMs)});
    const result=await response.json();
    // Provider errors may echo input. Never include credentials in responses/logs.
    if(!response.ok)throw Error(String(result?.error?.message||'AI ประมวลผลไม่สำเร็จ').replaceAll(key,'[redacted]').slice(0,800));
    const encoded=result?.data?.[0]?.b64_json;
    if(typeof encoded!=='string')throw Error('AI ไม่ได้ส่งภาพ PNG กลับมา');
    const png=Buffer.from(encoded,'base64');
    if(!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('AI ส่งไฟล์ภาพไม่สมบูรณ์');
    job.png=png;
   }catch(error){job.error=error?.name==='TimeoutError'?'AI ใช้เวลาเกิน 4 นาที':String(error?.message||'เชื่อมต่อ AI ไม่สำเร็จ').replaceAll(key,'[redacted]').slice(0,800);}})();
  }catch{res.status(400).json({error:'กรุณาตรวจ Prompt ลำดับภาพ และไฟล์ภาพทั้ง 3 รูป'});}
 }));
}
