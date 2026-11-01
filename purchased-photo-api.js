import crypto from 'node:crypto';
import multer from 'multer';
import sharp from 'sharp';
export function registerPurchasedPhotoApi(app,{store,policy}){
 const upload=multer({limits:{fileSize:20*1024*1024,files:1,fields:2}}).single('image');
 const headers=res=>res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'});
 const member=(req,res,next)=>{headers(res);if(!req.accountUser)return res.status(401).json({error:'auth_required',message:'กรุณาเข้าสู่ระบบเพื่อดูรูปที่ซื้อแล้ว'});next()};
 const shape=row=>({id:row.id,jobIds:row.job_ids,packageId:row.package_id,width:row.width,height:row.height,purchasedAt:row.purchased_at,createdAt:row.created_at,expiresAt:row.expires_at,receiveUrl:'/receive/'+row.token,imageUrl:'/api/purchased-photos/'+row.id+'/image',previewUrl:'/api/purchased-photos/'+row.id+'/preview'});
 const authorized=async row=>row&&await policy.allowedJobs(row.wallet_id,row.job_ids);
 const check=async(row,res)=>{if(!row){res.status(404).send('ไม่พบรูป');return false}if(row.expired||!row.image){res.status(410).send('รูปนี้หมดระยะจัดเก็บ 7 วันแล้ว');return false}if(!await authorized(row)){res.status(403).send('ยังยืนยันสิทธิ์ของรูปนี้ไม่ได้');return false}return true};
 const handle=run=>async(req,res)=>{headers(res);try{await run(req,res)}catch(e){if(!res.headersSent)res.status(e.status||503).json({error:e.code||'purchased_photo_unavailable',message:e.status?e.message:'ยังเปิดรูปที่ซื้อไม่ได้ กรุณาลองอีกครั้ง ไม่ต้องชำระซ้ำ'})}};
 app.post('/api/purchased-photos',member,(req,res,next)=>upload(req,res,error=>error?res.status(413).json({message:'ไฟล์ใหญ่เกินขนาดเก็บลิงก์รับรูป ยังดาวน์โหลดไฟล์ในหน้านี้ได้'}):next()),handle(async(req,res)=>{
  let ids;try{ids=JSON.parse(req.body?.jobIds||'null')}catch{}
  if(!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(id))||!req.file)throw Object.assign(Error('ข้อมูลรูปไม่ครบ กรุณาลองใหม่'),{status:400});
  const jobIds=[...new Set(ids)],walletId=req.accountUser.wallet_id;
  if(!await policy.allowedJobs(walletId,jobIds))throw Object.assign(Error('ยังยืนยันสิทธิ์รูปนี้ไม่ได้ กรุณาตรวจสอบการชำระเงิน ไม่ต้องจ่ายซ้ำ'),{status:403});
  const scope=await policy.scopeForJob(walletId,jobIds[0]),lineage=await policy.jobIds(walletId,jobIds[0]);
  let image,meta;
  try{image=await sharp(req.file.buffer,{limitInputPixels:33554432}).rotate().png().toBuffer();meta=await sharp(image).metadata()}catch{throw Object.assign(Error('อ่านไฟล์รูปไม่ได้ กรุณาลองเก็บลิงก์ใหม่ ยังบันทึกไฟล์ในหน้านี้ได้'),{status:400})}
  if(!meta.width||!meta.height||meta.width>8192||meta.height>8192)throw Object.assign(Error('ขนาดรูปไม่รองรับการเก็บลิงก์'),{status:400});
  const preview=await sharp(image).resize({width:180,height:220,fit:'inside',withoutEnlargement:true}).webp({quality:78}).toBuffer();
  const packageId=await policy.premiumHair(walletId,jobIds[0])?'159':'89';
  const row=await store.put({walletId,scope,jobIds,lineage:[...new Set([...lineage,...jobIds])],packageId,image,preview,width:meta.width,height:meta.height});
  res.json({...shape(row),serverNow:new Date().toISOString()});
 }));
 app.get('/api/purchased-photos',member,handle(async(req,res)=>res.json({items:(await store.list(req.accountUser.wallet_id)).map(shape),days:7,serverNow:new Date().toISOString()})));
 app.get('/api/purchased-photos/:id/:kind',member,handle(async(req,res)=>{
  if(!['image','preview'].includes(req.params.kind))return res.sendStatus(404);
  const row=await store.owned(req.accountUser.wallet_id,req.params.id);if(!await check(row?{...row,wallet_id:req.accountUser.wallet_id}:null,res))return;
  if(req.params.kind==='preview')res.type('webp').send(row.preview);else res.type('png').set('Content-Disposition',`attachment; filename="IDPROM-${row.id}.png"`).send(row.image);
 }));
 app.get('/receive/:token/image',handle(async(req,res)=>{
  if(!/^[a-f0-9]{64}$/.test(req.params.token))return res.sendStatus(404);
  const row=await store.byToken(req.params.token);if(!await check(row,res))return;
  res.type('png').set('Content-Disposition',`${req.query.download==='1'?'attachment':'inline'}; filename="IDPROM-${row.id}.png"`).send(row.image);
 }));
 app.get('/receive/:token',handle(async(req,res)=>{
  if(!/^[a-f0-9]{64}$/.test(req.params.token))return res.sendStatus(404);
  const row=await store.byToken(req.params.token);if(!await check(row,res))return;
  const nonce=crypto.randomBytes(18).toString('base64'),url='/receive/'+req.params.token+'/image';
  res.set('Content-Security-Policy',`default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`);
  res.type('html').send(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>รับรูป · IDพร้อม</title><style>*{box-sizing:border-box}body{margin:0;background:#f1f2fa;color:#17244b;font:16px system-ui,sans-serif}main{width:min(440px,100%);margin:auto;background:white;min-height:100vh;padding:18px}header{font-weight:800;color:#7044ed;border-bottom:1px solid #e6e8f1;padding-bottom:14px}h1{text-align:center;font-size:24px}.photo{display:block;max-width:100%;max-height:48vh;margin:16px auto;object-fit:contain}a,button{display:block;width:100%;margin:10px 0;padding:12px;border-radius:9px;border:1px solid #7044ed;color:#7044ed;text-align:center;text-decoration:none;background:white;font:inherit}a:first-of-type{background:#7044ed;color:white}p{font-size:13px;color:#64708a;text-align:center;line-height:1.6}</style><main><header>IDพร้อม Studio</header><h1>รูปพร้อมดาวน์โหลด</h1><img class="photo" src="${url}" alt="รูปที่ซื้อพร้อมบันทึก"><a href="${url}?download=1" download>ดาวน์โหลดรูป</a><a href="${url}" target="_blank" rel="noopener">เปิดรูปเพื่อบันทึก</a><button id="copy">คัดลอกลิงก์รับรูป</button><p id="status" role="status"></p><p>หากโหลดไม่ได้ ให้เปิดลิงก์นี้ใน Chrome หรือ Safari<br>เก็บรูปถึง ${new Date(row.expires_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</p></main><script nonce="${nonce}">document.getElementById('copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);document.getElementById('status').textContent='คัดลอกลิงก์แล้ว'}catch{document.getElementById('status').textContent='คัดลอกที่อยู่หน้านี้จากแถบที่อยู่ของเบราว์เซอร์'}}</script></html>`);
 }));
 return {purge:()=>store.purge()};
}
