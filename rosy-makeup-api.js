import sharp from 'sharp';
import {createHash,randomUUID} from 'node:crypto';
import {requestReviewSeedream} from './seedream-review-transport.js';
import {hairAiAccess,reserveHairAi,settleHairAi} from './youcam-hair-rights.js';

export const ROSY_AI_LOOK='soft-rosy-ai-v1';
export const ROSY_AI_PROMPT=`Edit Image 1 into a SOFT ROSY PROFESSIONAL MAKEUP portrait of the SAME person. This is a cosmetic retouch of the existing photo, not a new portrait, hairstyle or pose. Preserve the original skull, face width/height ratio, cheeks, jaw, chin, ears, eye size/shape/spacing, nose, lip outline/size, expression, gaze, asymmetry, stable identifying marks and camera framing. Never slim, stretch, reshape or symmetrize the face. Keep the selected hair, clothing, background and every object's placement unchanged.
Render face, ears and neck together under one broad soft frontal studio light. Gently lift dull midtones and soften harsh under-eye shadows while retaining dimensional shading and the person's base complexion. Give skin a brighter softly luminous rosy finish: correct excess yellow/grey cast, keep face and neck continuous in tone, blend temporary acne and discolouration, soften coarse pore contrast without plastic blur, clipped highlights or erasing permanent marks. Do not create a smaller jaw through shading.
Gently define existing eyebrow hairs with natural brown colour; retain the original brow shape and density. Apply restrained pink-brown upper-lid shading and short naturally separated lashes along the original upper lash line. Preserve the actual eye opening, iris, pupils and gaze; no larger eyes or new eyelid geometry. Add a faint diffused pink blush to the existing cheeks without contour sculpting. Make lips fresh clear rose-pink with a small soft satin highlight; retain the exact lip contour, size, mouth opening and original texture, no overlining or opaque heavy lipstick.
Keep the full existing neck/clavicle cutout and hair silhouette. No new outfit, jewellery, shoulders, neckline, background, watermark or text. Return one high-resolution PNG in the SAME aspect ratio and framing as Image 1. All cosmetic colour, skin and lighting edits happen together in this single request.`;

export function registerRosyMakeupApi(app,{upload,walletId,getWallet,getAiJobResult,hasPrivateTrial,access=hairAiAccess,reserve=reserveHairAi,settle=settleHairAi,generate=requestReviewSeedream,key=()=>process.env.ARK_API_KEY,now=Date.now}){
 const jobs=new Map(),exact=new Map(),submitting=new Set();
 const serial=(j,fn)=>{const p=(j.lock||Promise.resolve()).catch(()=>{}).then(fn);j.lock=p;return p};
 const release=j=>serial(j,async()=>{if(j.confirmed)return;j.cancelled=true;j.status='failed';j.png=null;exact.delete(j.key);await settle(j.usageId,false)});
 const prune=()=>{for(const[id,j]of jobs)if(!j.running&&now()-j.updated>20*60*1000){jobs.delete(id);exact.delete(j.key);if(!j.confirmed)void release(j).catch(()=>{})}};
 const owned=(req,res)=>{prune();const j=jobs.get(req.params.id);if(!j||j.owner!==walletId(req)){res.status(404).json({message:'ไม่พบงาน'});return null}return j};
 const run=async(j,input,token)=>{try{
  const portrait=await sharp(input,{limitInputPixels:33554432}).flatten({background:'#ffffff'}).png().toBuffer();
  if(j.cancelled)return;
  const result=await generate({key:token,prompt:ROSY_AI_PROMPT,size:'2K',portrait,portraitMime:'image/png'});
  if(j.cancelled)return;
  if(!result.png?.length||result.png.length>24*1024*1024)throw Error('รูปผลลัพธ์ใหญ่เกินกำหนด');
  const png=await sharp(result.png,{limitInputPixels:33554432}).png().toBuffer();
  if(j.cancelled)return;j.png=png;j.status='completed';j.updated=now();
 }catch(e){await release(j).catch(()=>{});j.error='ประมวลผลไม่สำเร็จ';j.updated=now()}finally{j.running=false}};
 app.get('/api/makeup/rosy/access',async(req,res)=>{try{const owner=walletId(req);if(!owner||!await getWallet(owner))return res.status(401).json({message:'กรุณาเข้าสู่ระบบใหม่'});const job=await getAiJobResult(String(req.query.sourceJobId||''),owner);if(!job||job.status!=='completed')return res.status(403).json({message:'ไม่พบรูปที่ประมวลผลสำเร็จของคุณ กรุณาเปิดรูปเดิมอีกครั้ง'});res.set('Cache-Control','no-store').json(hasPrivateTrial(req,owner)?{remaining:null,unlimited:true}:await access(owner,String(req.query.sourceJobId||'')))}catch(e){res.status(400).json({message:e.message})}});
 app.post('/api/makeup/rosy/jobs',upload.single('image'),async(req,res)=>{
  let owner,usageId,started=false,locked=false;
  try{
   prune();owner=walletId(req);if(!owner||!await getWallet(owner))return res.status(401).json({message:'กรุณาเข้าสู่ระบบใหม่'});
   if(submitting.has(owner))return res.status(429).json({message:'กรุณารอการทำงานก่อนหน้าให้เสร็จ'});submitting.add(owner);locked=true;
   const sourceJobId=String(req.body?.sourceJobId||''),job=await getAiJobResult(sourceJobId,owner);
   if(!job||job.status!=='completed')return res.status(403).json({message:'ไม่พบรูปที่ประมวลผลสำเร็จของคุณ กรุณาเปิดรูปเดิมอีกครั้ง'});
   if(req.body?.lookId!==ROSY_AI_LOOK||req.file?.mimetype!=='image/png'||!req.file.buffer?.length)return res.status(400).json({message:'ไม่พบรูปหรือเมคอัพที่เลือก'});
   const meta=await sharp(req.file.buffer,{limitInputPixels:33554432}).metadata();if(meta.format!=='png'||meta.width<32||meta.height<32||(meta.pages||1)>1)return res.status(400).json({message:'ข้อมูลภาพเมคอัพไม่ตรงกัน'});
   const hash=createHash('sha256').update(JSON.stringify([owner,sourceJobId,ROSY_AI_LOOK])).update(req.file.buffer).digest('hex'),cached=jobs.get(exact.get(hash));
   if(cached&&!cached.cancelled&&cached.status!=='failed')return res.json({jobId:cached.id,status:cached.status});
   if([...jobs.values()].some(j=>j.owner===owner&&j.running)||[...jobs.values()].filter(j=>j.running).length>=8||jobs.size>=128||[...jobs.values()].reduce((n,j)=>n+(j.png?.length||0),0)>96*1024*1024)return res.status(429).json({message:'กำลังมีผู้ใช้งาน กรุณาลองใหม่สักครู่'});
   const token=key();if(!token)return res.status(503).json({message:'AI ยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง'});
   const trial=hasPrivateTrial(req,owner);usageId=trial?null:await reserve(owner,sourceJobId);if(!trial&&!usageId)return res.status(402).json({message:'เครดิตแต่งเมคอัพ AI หมดแล้ว กรุณาเติมเครดิต · เลือกผลเดิมที่เคยแต่งไว้ได้'});
   const j={id:randomUUID(),key:hash,owner,usageId,status:'running',running:true,updated:now()};jobs.set(j.id,j);exact.set(hash,j.id);started=true;res.status(202).json({jobId:j.id,status:j.status});void run(j,req.file.buffer,token);
  }catch(e){if(usageId&&!started)await settle(usageId,false).catch(()=>{});if(!res.headersSent)res.status(400).json({message:'เตรียมภาพไม่สำเร็จ กรุณาลองใหม่'})}finally{if(locked)submitting.delete(owner)}
 });
 app.get('/api/makeup/rosy/jobs/:id',(req,res)=>{const j=owned(req,res);if(j)res.set('Cache-Control','no-store').json({jobId:j.id,status:j.status,...(j.error?{message:j.error}:{})})});
 app.get('/api/makeup/rosy/jobs/:id/image',(req,res)=>{const j=owned(req,res);if(j){if(j.status!=='completed'||!j.png)return res.status(409).json({message:'รูปยังไม่พร้อม'});res.set('Cache-Control','no-store').type('png').send(j.png)}});
 app.post('/api/makeup/rosy/jobs/:id/confirm',async(req,res)=>{const j=owned(req,res);if(!j)return;try{await serial(j,async()=>{if(j.status!=='completed'||j.cancelled)throw Error('รูปยังไม่พร้อม');if(!j.confirmed){await settle(j.usageId,true);j.confirmed=true}});res.json({ok:true})}catch(e){res.status(409).json({message:e.message})}});
 app.post('/api/makeup/rosy/jobs/:id/cancel',async(req,res)=>{const j=owned(req,res);if(!j)return;try{await release(j);res.json({ok:true})}catch{res.status(409).json({message:'ยกเลิกงานไม่สำเร็จ กรุณากดปิดอีกครั้ง'})}});
}
