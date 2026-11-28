import multer from 'multer';
import {createHash} from 'node:crypto';
import {femaleRequestProof,logFemaleRequestProof} from './female-request-proof.js';

import {requestReviewSeedream} from './seedream-review-transport.js';
import {FEMALE_LAB_PROCESS_VERSION} from './female-portrait-prompt.js';
import {proLabPayload} from './seedream-pro-lab.js';
const endpoint='https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

// Separate BYOK experiment: never touches production prompts, wallet or matting.
export function registerFemaleLabTransport(app,{fetchImpl=fetch,timeoutMs=240000,ttlMs=600000,route='/api/seedream-pro-lab',payloadFor=proLabPayload,extraFiles=[],fieldLimit=4,processResult=async png=>png}={}){
 const jobs=new Map();
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:3+extraFiles.length,fields:fieldLimit,parts:3+fieldLimit+extraFiles.length,fieldSize:64*1024}}).fields([{name:'outfit',maxCount:1},{name:'person',maxCount:1},{name:'hair',maxCount:1},...extraFiles.map(name=>({name,maxCount:1}))]);
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
   const originalPayload=await payloadFor({prompt:req.body?.prompt,order:req.body?.order,files:req.files,fields:req.body});
   const experimental=['/api/female-production-lab','/api/female-guide-edit-lab'].includes(route);
   const payload=experimental?{...originalPayload,model:'dola-seedream-5-5-261028'}:originalPayload;
   const body=JSON.stringify(payload),fingerprint=createHash('sha256').update(key).update(body).digest('hex');
   const proof=['/api/female-production-lab','/api/female-guide-edit-lab'].includes(route)?femaleRequestProof(payload,{allowTwoReferences:experimental}):null;
   const prior=jobs.get(id);
   if(prior){if(prior.fingerprint!==fingerprint)return res.status(409).json({error:'ข้อมูลไม่ตรงกับงานเดิม กรุณาเริ่มงานใหม่'});return res.status(202).json({id});}
   if(jobs.size>=20)return res.status(503).json({error:'หน้าทดลองเต็ม กรุณารอสักครู่'});
   const job={fingerprint};jobs.set(id,job);setTimeout(()=>jobs.delete(id),ttlMs).unref();
   if(proof)logFemaleRequestProof('lab',proof,{requestId:id});
   res.status(202).json({id});
   void(async()=>{try{
    if(proof&&!experimental){
     // Both current female labs and production use exactly one provider transport.
     // Lab credentials and jobs remain isolated from production wallet data.
     const {png}=await requestReviewSeedream({key,prompt:payload.prompt,preparedFemalePayload:payload,femalePreplacedVersion:FEMALE_LAB_PROCESS_VERSION,singleAttempt:true},{fetchImpl,timeoutMs,logProof:false});
     job.png=await processResult(png,{files:req.files,fields:req.body,payload});
     logFemaleRequestProof('lab',proof,{phase:'result',requestId:id,png,delivered:job.png});
     return;
    }
    const response=await fetchImpl(endpoint,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(timeoutMs)});
    const result=await response.json();
    // Provider errors may echo input. Never include credentials in responses/logs.
    if(!response.ok)throw Error(String(result?.error?.message||'AI ประมวลผลไม่สำเร็จ').replaceAll(key,'[redacted]').slice(0,800));
    const encoded=result?.data?.[0]?.b64_json;
    if(typeof encoded!=='string')throw Error('AI ไม่ได้ส่งภาพ PNG กลับมา');
    const png=Buffer.from(encoded,'base64');
    if(!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('AI ส่งไฟล์ภาพไม่สมบูรณ์');
    job.png=await processResult(png,{files:req.files,fields:req.body,payload});
    if(proof)logFemaleRequestProof('lab',proof,{phase:'result',requestId:id,png,delivered:job.png});
   }catch(error){job.error=error?.name==='TimeoutError'?'AI ใช้เวลาเกิน 4 นาที':String(error?.message||'เชื่อมต่อ AI ไม่สำเร็จ').replaceAll(key,'[redacted]').slice(0,800);}})();
  }catch{res.status(400).json({error:'กรุณาตรวจ Prompt ลำดับภาพ และไฟล์ภาพทั้ง 3 รูป'});}
 }));
}
