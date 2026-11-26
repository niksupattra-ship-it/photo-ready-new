import multer from 'multer';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';

export const GPT_LAB_MODEL='gpt-image-2.6-sunburst';
export const GPT_LAB_PROMPT=`Perform realistic photographic compositing using the three supplied reference images. Create one complete, natural, anatomically proportionate female studio ID portrait. This is a photo-editing/compositing request, not a clothing redesign.

Image 1: Fixed original photographic clothing and body template. Use it as the actual visual base and spatial foundation.
Image 2: Original facial identity only.
Image 3: Mandatory exact hairstyle reference.

1. ORIGINAL CLOTHING PRESERVATION
Preserve authentic fabric texture, weave, fibers, wrinkles, creases, seams, stitching, folds, material thickness, original colors, natural shadows and highlights, lapels, collar, tie, buttons, shoulder boards, insignia, embroidery, and all accessories. Retain original clothing pixels wherever possible. Do not redesign, repaint, distort or reposition insignia or tailoring details. No synthetic, plastic, glossy, waxy, over-smoothed or CGI fabric.

2. FIXED BODY GEOMETRY
Preserve garment dimensions, shoulder width, slope and height, torso length, collar position, lapel width and visible body coverage. Never shorten the torso or resize the body to fit the head. Determine head size from eye centers, jawline, chin, neck, collar position and shoulder width, never from hairstyle silhouette or the original facial crop. Scale the head and hair together uniformly for natural anatomy. Keep the collar naturally close under the chin without an overly long neck. Use a balanced portrait composition with sufficient torso visible.

3. ORIGINAL FACIAL IDENTITY
Use Image 2 only for facial identity. Preserve the exact recognizable eyes, eye expression, eyebrows, nose, lips, cheeks, jawline and facial geometry. Keep direct forward gaze, level eyes, neutral expression, zero head tilt and rotation. Ignore original clothing and hairstyle. Preserve fine skin texture, individual eyebrow hairs and natural pores. No reconstructed or excessively retouched facial features.

4. EXACT HAIRSTYLE
Replace the original hairstyle with Image 3. Match hairline, parting, bangs, length, fall, direction, silhouette, volume and realistic individual strands. Do not use the hairstyle image for facial identity.

5. SEAMLESS PHOTOGRAPHIC INTEGRATION
Blend only necessary transitions between hair, face, neck and clothing. Match face and hair lighting to the original clothing; do not relight or regenerate the entire garment. Minimal localized facial retouching; subtle light-pink lips. Straight upright posture, neutral chin, natural neck placement. Clean unobtrusive neutral studio background. Aim for portrait aspect ratio 6:7. No oversized head, shortened torso, distorted insignia, waxy skin, excessive smoothing, HDR or artificial sharpening. Return one conventional professional studio photograph assembled from real photographic elements.`;

const models=new Set([GPT_LAB_MODEL,'gpt-image-2.5-sunburst','gpt-image-2','chatgpt-image-latest']);
const qualities=new Set(['high','medium','auto']);
const sizes=new Set(['auto','1024x1536','1152x1344','1024x1024']);
const complexities=new Set(['high','medium','low']);
const pngMagic=Buffer.from([137,80,78,71,13,10,26,10]);

export async function buildGptLabRequest(fields,files){
 const model=String(fields.model||GPT_LAB_MODEL);
 const quality=String(fields.quality||'high');
 const size=String(fields.size||'auto');
 const complexity=String(fields.complexity||'high');
 const prompt=String(fields.prompt||'').trim();
 if(!models.has(model)||!qualities.has(quality)||!sizes.has(size)||!complexities.has(complexity))throw Error('การตั้งค่าไม่ถูกต้อง');
 if(!prompt||prompt.length>32000)throw Error('กรุณากรอก Prompt ไม่เกิน 32,000 ตัวอักษร');
 const body=new FormData();
 body.append('model',model);
 for(const role of ['outfit','person','hair']){
  const file=files?.[role]?.[0];
  if(!file?.buffer?.length)throw Error('กรุณาเลือกชุด ใบหน้า และทรงผมให้ครบ');
  const metadata=await sharp(file.buffer,{limitInputPixels:33554432}).metadata();
  const formats={png:['image/png','png'],jpeg:['image/jpeg','jpg'],webp:['image/webp','webp']};
  const format=formats[metadata.format];
  if(!format)throw Error('รองรับไฟล์ PNG, JPG และ WebP');
  body.append('image[]',new Blob([file.buffer],{type:format[0]}),role+'.'+format[1]);
 }
 body.append('prompt',prompt);
 body.append('quality',quality);
 body.append('size',size);
 body.append('n','1');
 body.append('output_format','png');
 if(model.includes('sunburst'))body.append('complexity',complexity);
 return body;
}

const page=`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>GPT Image Lab | Photo Ready</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#172334;font:15px/1.6 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:28px 18px 60px}header{margin-bottom:22px}h1{font-size:30px;margin:8px 0 0;letter-spacing:-.7px}h2{font-size:17px;margin:0 0 12px}p{margin:5px 0 12px;color:#566477}a{color:#245bc4}section{background:white;border:1px solid #dce2eb;border-radius:15px;padding:20px;margin:14px 0}.layout{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:18px;align-items:start}.three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.settings{display:grid;grid-template-columns:1fr 1fr;gap:12px}.file{border:1px dashed #aab7c8;background:#fafbfd;border-radius:10px;padding:8px;min-width:0}.preview{height:145px;background:#edf1f6;border-radius:7px;display:grid;place-items:center;overflow:hidden;margin:6px 0;color:#6d798c;font-size:12px}.preview img{width:100%;height:100%;object-fit:contain}label{display:block;font-weight:600;margin-bottom:5px}input,select,textarea,button{font:inherit}input:not([type=file]),select,textarea{width:100%;padding:10px;border:1px solid #bdc7d4;border-radius:8px;background:white;color:#172334}input[type=file]{width:100%;font-size:12px}textarea{height:245px;resize:vertical;font:13px/1.55 ui-monospace,monospace}button,.download{display:inline-block;background:#172334;color:white;border:0;border-radius:9px;padding:12px 20px;text-decoration:none;cursor:pointer;font-weight:650}button:disabled{opacity:.55;cursor:wait}.download{background:#245bc4;margin-top:12px}.result{min-height:360px;display:grid;place-items:center;background:#edf1f6;border-radius:10px;overflow:hidden;text-align:center;padding:8px}.result img{max-width:100%;max-height:850px;display:block}.note{font-size:12px;color:#64748b}.status{white-space:pre-wrap;overflow-wrap:anywhere}.error{color:#b42318}small{display:block;color:#65748a}[hidden]{display:none!important}@media(max-width:800px){.layout{grid-template-columns:1fr}.three{gap:6px}.preview{height:110px}section{padding:14px}} 
</style></head><body><main><header><small>PHOTO READY / IMAGE LAB</small><h1>ทดลองสร้างภาพด้วย GPT</h1><p>ส่งภาพต้นฉบับ 3 รูปตรงเข้า OpenAI แล้วแสดงภาพจริงจาก API โดยไม่ผ่านระบบแต่งภาพของเว็บ</p></header><div class="layout"><div><form id="form"><section><h2>1. OpenAI API Key</h2><label for="key">API Key ของคุณ</label><input id="key" name="key" type="password" autocomplete="off" placeholder="sk-..." required><p class="note">ใช้เฉพาะคำขอนี้ ไม่บันทึกคีย์ลงฐานข้อมูลหรือเบราว์เซอร์ คิดค่าบริการจากบัญชี API ของคุณ · <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">สร้าง API Key</a></p></section><section><h2>2. เลือกภาพต้นฉบับ</h2><div class="three"><div class="file"><label for="outfit">1. ชุด</label><div class="preview" id="outfitPreview">ภาพชุด</div><input type="file" id="outfit" name="outfit" accept="image/png,image/jpeg,image/webp" required></div><div class="file"><label for="person">2. ใบหน้า</label><div class="preview" id="personPreview">ใบหน้าจริง</div><input type="file" id="person" name="person" accept="image/png,image/jpeg,image/webp" required></div><div class="file"><label for="hair">3. ทรงผม</label><div class="preview" id="hairPreview">ภาพทรงผม</div><input type="file" id="hair" name="hair" accept="image/png,image/jpeg,image/webp" required></div></div><p class="note">ส่งไฟล์เดิม ไม่ย่อ ไม่ตัด ไม่บีบอัด (สูงสุด 20 MB ต่อรูป)</p></section><section><h2>3. ตั้งค่า GPT</h2><div class="settings"><div><label for="model">โมเดล</label><select id="model" name="model"><option value="gpt-image-2.6-sunburst">GPT Image 2.6 Sunburst</option><option value="gpt-image-2.5-sunburst">GPT Image 2.5 Sunburst</option><option value="gpt-image-2">GPT Image 2</option><option value="chatgpt-image-latest">ChatGPT Image Latest</option></select></div><div><label for="quality">Quality</label><select id="quality" name="quality"><option value="high">High</option><option value="medium">Medium</option><option value="auto">Auto</option></select></div><div><label for="size">ขนาดภาพ</label><select id="size" name="size"><option value="auto">Auto</option><option value="1152x1344">1152 × 1344 (6:7)</option><option value="1024x1536">1024 × 1536</option><option value="1024x1024">1024 × 1024</option></select></div><div><label for="complexity">Complexity (Sunburst)</label><select id="complexity" name="complexity"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div></div><p class="note">ผลลัพธ์ PNG · 1 ภาพ · ไม่ลบพื้นหลัง · ไม่แต่งผิวหรือปรับสัดส่วนหลังสร้าง</p><label for="prompt">Prompt</label><textarea id="prompt" name="prompt" required>${GPT_LAB_PROMPT}</textarea><button id="generate" type="submit" style="width:100%;margin-top:12px">สร้างภาพด้วย GPT</button></section></form></div><section><h2>ผลลัพธ์จาก OpenAI</h2><div class="result" id="result">ภาพจะแสดงที่นี่</div><p class="status" id="status" role="status" aria-live="polite">พร้อมทดลอง</p><a id="download" class="download" download="gpt-portrait.png" hidden>ดาวน์โหลด PNG ต้นฉบับ</a><p class="note">ผลลัพธ์ขึ้นกับโมเดลและการสุ่ม ไม่สามารถรับประกันว่าจะเหมือน ChatGPT ทุกพิกเซล</p></section></div></main><script>
const el=id=>document.getElementById(id);let outputUrl;const previewUrls={};
for(const role of ['outfit','person','hair']){el(role).addEventListener('change',()=>{if(previewUrls[role])URL.revokeObjectURL(previewUrls[role]);const target=el(role+'Preview');target.replaceChildren();const f=el(role).files[0];if(!f){target.textContent='ยังไม่ได้เลือกภาพ';return}const img=new Image();previewUrls[role]=URL.createObjectURL(f);img.src=previewUrls[role];img.alt=role;target.append(img)})}
el('model').addEventListener('change',()=>{el('complexity').disabled=!el('model').value.includes('sunburst');if(el('model').value==='chatgpt-image-latest'&&el('size').value==='1152x1344')el('size').value='auto';el('size').querySelector('[value="1152x1344"]').disabled=el('model').value==='chatgpt-image-latest'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function errorText(r){try{const j=await r.json();return j.error||('HTTP '+r.status)}catch{return 'HTTP '+r.status+' — เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง'}}
el('form').addEventListener('submit',async e=>{e.preventDefault();const button=el('generate');if(button.disabled)return;const form=new FormData(e.currentTarget);for(const role of ['outfit','person','hair']){if(form.get(role).size>20*1024*1024){el('status').textContent='ไฟล์ใหญ่เกิน 20 MB';return}}
button.disabled=true;button.textContent='กำลังสร้างภาพ…';el('download').hidden=true;el('status').classList.remove('error');el('status').textContent='กำลังส่งภาพต้นฉบับไปยัง OpenAI';el('result').textContent='กำลังประมวลผล…';if(outputUrl){URL.revokeObjectURL(outputUrl);outputUrl=null}
try{const r=await fetch('/api/gpt-image-lab',{method:'POST',body:form,cache:'no-store'});if(!r.ok)throw Error(await errorText(r));const {id}=await r.json();const start=Date.now();while(Date.now()-start<620000){await sleep(2000);const result=await fetch('/api/gpt-image-lab/'+encodeURIComponent(id),{cache:'no-store'});if(result.status===202){el('status').textContent='OpenAI กำลังสร้างภาพ ('+Math.floor((Date.now()-start)/1000)+' วินาที)';continue}if(!result.ok)throw Error(await errorText(result));if(!result.headers.get('content-type')?.startsWith('image/png'))throw Error('ไม่ได้รับไฟล์ PNG');outputUrl=URL.createObjectURL(await result.blob());const img=new Image();img.src=outputUrl;img.alt='ผลลัพธ์จาก OpenAI';el('result').replaceChildren(img);el('download').href=outputUrl;el('download').hidden=false;el('status').textContent='สร้างภาพสำเร็จ · PNG ต้นฉบับจาก OpenAI';return}throw Error('เกินเวลารับผลลัพธ์ กรุณาตรวจสอบเครดิต API ก่อนลองใหม่')}catch(err){el('result').textContent='สร้างภาพไม่สำเร็จ';el('status').classList.add('error');el('status').textContent=err.message}finally{button.disabled=false;button.textContent='สร้างภาพด้วย GPT'}});
</script></body></html>`;

export function registerGptImageLab(app,{fetchImpl=fetch,timeoutMs=600000,ttlMs=900000}={}){
 const jobs=new Map();
 let uploading=0;
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:3,fields:5,parts:8,fieldSize:128*1024}}).fields([{name:'outfit',maxCount:1},{name:'person',maxCount:1},{name:'hair',maxCount:1}]);
 app.get(['/gpt-image-lab','/gpt-image-lab/'],(_req,res)=>res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}).type('html').send(page));
 app.get('/api/gpt-image-lab/:id',(req,res)=>{
  res.set('Cache-Control','no-store');
  const job=jobs.get(req.params.id);
  if(!job)return res.status(404).json({error:'งานหมดอายุหรือเซิร์ฟเวอร์เริ่มใหม่'});
  if(job.png)return res.type('png').send(job.png);
  if(job.error)return res.status(502).json({error:job.error});
  res.status(202).json({status:'processing'});
 });
 app.post('/api/gpt-image-lab',(req,res)=>{
  res.set('Cache-Control','no-store');
  if(uploading>=2||jobs.size>=8)return res.status(503).json({error:'หน้าทดลองเต็ม กรุณาลองใหม่ภายหลัง'});
  uploading++;
  upload(req,res,async uploadError=>{
   try{
    if(uploadError)return res.status(400).json({error:'กรุณาเลือกไฟล์ที่ถูกต้อง ขนาดไม่เกิน 20 MB ต่อรูป'});
    const key=String(req.body?.key||'').trim();
    if(!/^sk-[A-Za-z0-9_-]{10,500}$/.test(key))return res.status(400).json({error:'กรุณากรอก OpenAI API Key ที่ถูกต้อง'});
    const body=await buildGptLabRequest(req.body,req.files);
    if(jobs.size>=8)return res.status(503).json({error:'หน้าทดลองเต็ม'});
    const id=randomUUID(),job={};jobs.set(id,job);
    setTimeout(()=>jobs.delete(id),ttlMs).unref();
    res.status(202).json({id});
    void(async()=>{
     try{
      const r=await fetchImpl('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:'Bearer '+key},body,signal:AbortSignal.timeout(timeoutMs)});
      const data=await r.json();
      if(!r.ok)throw Error('OpenAI HTTP '+r.status+': '+String(data?.error?.message||'API request failed').replaceAll(key,'[redacted]').replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,700));
      const png=Buffer.from(data?.data?.[0]?.b64_json||'','base64');
      if(!png.subarray(0,8).equals(pngMagic))throw Error('OpenAI ไม่ได้ส่งไฟล์ PNG ที่สมบูรณ์');
      job.png=png;
     }catch(err){job.error=err?.name==='TimeoutError'?'OpenAI ใช้เวลาเกิน 10 นาที':String(err?.message||'เชื่อมต่อ OpenAI ไม่สำเร็จ').replaceAll(key,'[redacted]').replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,800)}
    })();
   }catch(err){res.status(400).json({error:String(err?.message||'ตรวจสอบไฟล์และการตั้งค่า').slice(0,200)})}
   finally{uploading--}
  });
 });
}
