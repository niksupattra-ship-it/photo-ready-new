import {editableWorksForPurchasedPhotos,getWork,validateProject} from './saved-work-store.js';
import {assertSavedProjectResources} from './src/saved-project.js';
import {unpackSavedProjectTransfer,packSavedProjectTransfer} from './src/saved-work-transfer.js';
import {englishPhotoDeliveryPage} from './english-photo-delivery.js';
import crypto from 'node:crypto';
import {gzip} from 'node:zlib';
import multer from 'multer';
import sharp from 'sharp';
export function registerPurchasedPhotoApi(app,{store,policy,getJobContext=async()=>null,findEditableWorks=editableWorksForPurchasedPhotos,loadSavedWork=getWork}){
 const upload=multer({limits:{fileSize:20*1024*1024,files:1,fields:2}}).single('image');
 const uploadEditor=multer({limits:{fileSize:48*1024*1024,files:1,fields:0}}).single('project');
 const headers=res=>res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'});
 const member=(req,res,next)=>{headers(res);if(!req.accountUser)return res.status(401).json({error:'auth_required',message:'กรุณาเข้าสู่ระบบเพื่อดูรูปที่ซื้อแล้ว'});next()};
 const shape=row=>({id:row.id,jobIds:row.job_ids,packageId:row.package_id,width:row.width,height:row.height,purchasedAt:row.purchased_at,createdAt:row.created_at,updatedAt:row.updated_at,expiresAt:row.expires_at,receiveUrl:'/receive/'+row.token,imageUrl:'/api/purchased-photos/'+row.id+'/image',previewUrl:'/api/purchased-photos/'+row.id+'/preview'});
 const sendEditor=async(req,res,payload)=>{
  // Stored image data URLs are base64. Fast gzip removes their transport
  // overhead on the first open; local browser caching handles later opens.
  if(!/\bgzip\b/i.test(req.get('accept-encoding')||''))return res.json(payload);
  const json=JSON.stringify(payload);
  if(json.length<256*1024)return res.type('json').send(json);
  const buffer=await new Promise((resolve,reject)=>gzip(json,{level:1},(error,data)=>error?reject(error):resolve(data)));
  res.set('Vary','Accept-Encoding');
  res.set('Content-Encoding','gzip');
  return res.type('json').send(buffer);
 };
 const accessRow=(row,wallet)=>row?{...row,image:row.has_image??row.image,wallet_id:wallet}:null;
 const ownedAccess=(wallet,id)=>store.ownedAccess?store.ownedAccess(wallet,id):store.owned(wallet,id);
 const ownedAsset=(wallet,id,kind)=>store.ownedAsset?store.ownedAsset(wallet,id,kind):store.owned(wallet,id);
 const nativeEditPayload=async(wallet,row,knownOriginal=null)=>{
  // Derive all identity links on the server. An archive's displayed PNG and
  // client-supplied job/work IDs can never become proof of an original upload.
  const jobIds=[...new Set(row.job_ids)],scopes=await Promise.all(jobIds.map(id=>policy.scopeForJob(wallet,id))),workId=scopes[0];
  const sameWork=Boolean(workId)&&scopes.every(scope=>scope===workId);
  const response={id:row.id,workId,jobIds,packageId:row.package_id,purchasedAt:row.purchased_at,expiresAt:row.expires_at,originalAvailable:false};
  if(sameWork&&/^dwork_[a-f0-9]{36}$/.test(workId)){
   response.downloadWorkId=workId;
   try{
    const original=knownOriginal?.workId===workId?knownOriginal.input:await policy.inputForWork(wallet,workId);
    if(original?.buffer?.length&&['image/png','image/jpeg','image/webp'].includes(original.mimetype)){
     response.originalAvailable=true;response.originalType=original.mimetype;
     response.originalSource='data:'+original.mimetype+';base64,'+Buffer.from(original.buffer).toString('base64');
    }
   }catch(error){if(error.status!==409)throw error}
  }
  const metadata=['femaleFinishSingleVersion','alternateFinish','alternateFinishStatus','source_only','hairId','portraitMode','portraitComposition','thaiOutfitAiVersion','thaiOutfitParityVersion','englishStudioFinishVersion','femaleEyeStyle','studioSkinVersion','naturalFinishVersion','neckOutfitReferencePath','outfitReferencePath','keepCurrentHair','hairReferenceVersion'];
  for(const id of jobIds){
   const context=await getJobContext(id,wallet);
   if(context?.status!=='completed'||!context.result?.length)continue;
   response.jobId=id;response.job={id,status:'completed'};
   for(const name of metadata){const value=context.fields?.[name];if(typeof value==='string'||typeof value==='boolean')response.job[name]=value}
   response.resultSource='data:image/png;base64,'+Buffer.from(context.result).toString('base64');
   if(context.result_makeup?.length&&!context.fields?.femaleFinishSingleVersion)response.makeupSource='data:image/png;base64,'+Buffer.from(context.result_makeup).toString('base64');
   break;
  }
  return response;
 };
 const authorized=async row=>row&&await policy.allowedJobs(row.wallet_id,row.job_ids);
 const check=async(row,res,english=false)=>{if(!row){res.status(404).send(english?'The photo was not found.':'ไม่พบรูป');return false}if(row.expired||!row.image){res.status(410).send(english?'The 7-day retention period for this photo has ended.':'รูปนี้หมดระยะจัดเก็บ 7 วันแล้ว');return false}if(!await authorized(row)){res.status(403).send(english?'Access to this photo could not be confirmed.':'ยังยืนยันสิทธิ์ของรูปนี้ไม่ได้');return false}return true};
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
 app.get('/api/purchased-photos',member,handle(async(req,res)=>{const photos=await store.list(req.accountUser.wallet_id);res.json({items:photos.map(row=>({...shape(row),editableWorkId:null,editorStored:row.editor_project_stored===true})),days:7,serverNow:new Date().toISOString()})}));
 // The purchased photo is its own 7-day editable archive, independent of the
 // optional 45-day saved-work slots. Only the original paid job lineage can be reopened.
 app.post('/api/purchased-photos/:id/editor',member,(req,res,next)=>uploadEditor(req,res,error=>error?res.status(413).json({message:'ข้อมูลงานแก้ไขใหญ่เกินขีดจำกัด'}):next()),handle(async(req,res)=>{
  const wallet=req.accountUser.wallet_id,row=await ownedAccess(wallet,req.params.id);
  if(!await check(accessRow(row,wallet),res))return;
  if(!req.file)throw Object.assign(Error('ไม่พบข้อมูลงานแก้ไข'),{status:400});
  let project;try{project=unpackSavedProjectTransfer(JSON.parse(req.file.buffer.toString('utf8')))}catch{throw Object.assign(Error('ข้อมูลเลเยอร์ไม่ถูกต้อง'),{status:400})}
  const jobs=validateProject(project),lineage=await policy.jobIds(wallet,row.job_ids[0]);
  // Generated hairstyle variants remain part of the same paid work. A photo
  // from another upload will not be in this ownership-checked lineage.
  if(!jobs.length||jobs.some(id=>!lineage.includes(id))||(project.downloadWorkId&&project.downloadWorkId!==row.work_scope))throw Object.assign(Error('ข้อมูลแก้ไขไม่ตรงกับรูปที่ชำระแล้ว'),{status:403});
  assertSavedProjectResources(project);
  const ok=await store.storeEditor(wallet,row.id,project);
  if(!ok)throw Object.assign(Error('รูปนี้หมดระยะเก็บ 7 วันแล้ว'),{status:410});
  res.json({ok:true,id:row.id,updatedAt:ok.updated_at});
 }));
 app.get('/api/purchased-photos/:id/editor',member,handle(async(req,res)=>{
  const wallet=req.accountUser.wallet_id,row=await store.ownedEditor(wallet,req.params.id);
  if(!await check(row?{...row,image:row.has_image,wallet_id:wallet}:null,res))return;
  let project=row.editor_project,reconstructed=false;
  if(!project){
   // One-time compatibility for previously paid accounts. A historical editor
   // snapshot is imported INTO the purchased photo, not opened as a separate
   // saved-work screen or required for future purchases.
   const linked=await findEditableWorks(wallet,[row]);
   if(linked[row.id]){
    try{
     const old=await loadSavedWork(wallet,linked[row.id]);
     if(old?.project){
      const ids=validateProject(old.project),lineage=await policy.jobIds(wallet,row.job_ids[0]);
      if(ids.length&&ids.every(id=>lineage.includes(id))){
       assertSavedProjectResources(old.project);
       project=old.project;
       await store.storeEditor(wallet,row.id,project);
      }
     }
    }catch{} // Expired/malformed old projects never block purchased-photo recovery.
   }
  }
  if(!project){
   // Keep the existing canonical-availability rule for historical archives.
   // New clients can recover native layers directly, without first receiving
   // a flattened receipt that they would immediately discard.
   let original=null,downloadWorkId=null,input=null;
   if(/^dwork_[a-f0-9]{36}$/.test(row.work_scope)){
    try{const candidate=await policy.inputForWork(wallet,row.work_scope);if(/^image\/(png|jpeg|webp)$/.test(candidate.mimetype)&&candidate.buffer.length<16*1024*1024){input=candidate;downloadWorkId=row.work_scope}}catch(error){if(error.status!==409)throw error}
   }
   if(!input){
    return res.status(409).json({error:'original_unavailable',message:'รูปที่ซื้อใบนี้ยังมีไฟล์รับรูป แต่ไม่มีต้นฉบับที่ยืนยันได้สำหรับเปลี่ยนทรงผมโดยไม่ใช้สิทธิ์รูปใหม่'});
   }
   if(req.get('X-IDPROM-Native-Recovery')==='1'){
    const nativeContext=await nativeEditPayload(wallet,row,{workId:downloadWorkId,input});
    return sendEditor(req,res,{id:'',unlocked:true,legacyDownload:false,reconstructed:true,updatedAt:row.updated_at,nativeContext});
   }
   // Older clients retain the same flattened fallback and wire contract.
   const delivery=await ownedAsset(wallet,req.params.id,'image');
   if(!delivery?.image)return res.status(410).json({message:'รูปนี้หมดระยะเก็บ 7 วันแล้ว'});
   const photo=await sharp(delivery.image,{limitInputPixels:33554432}).resize(900,1200,{fit:'contain',background:'#ffffff'}).png({compressionLevel:9}).toBuffer();
   const image='data:image/png;base64,'+photo.toString('base64');
   original='data:'+input.mimetype+';base64,'+input.buffer.toString('base64');
   project={format:'idprom-studio',version:1,width:900,height:1200,layers:[{kind:'head',name:'หัว · คอ · ผม',jobId:row.job_ids[0],source:image,sourceFrame:{x:0,y:0,w:900,h:1200},x:0,y:0,scale:1,rotation:0,opacity:1,visible:true,locked:false,outputUnlocked:true,restrictedTrial:false}],compareSource:original||image,...(original?{downloadSource:original,canonicalInput:original,downloadWorkId}:{})};
   reconstructed=true;
  }
  await sendEditor(req,res,{id:'',unlocked:true,legacyDownload:false,reconstructed,updatedAt:row.updated_at,project:packSavedProjectTransfer(project)});
 }));
 app.get('/api/purchased-photos/:id/edit',member,handle(async(req,res)=>{
  const wallet=req.accountUser.wallet_id,row=await ownedAccess(wallet,req.params.id);
  if(!row)throw Object.assign(Error('ไม่พบรูปที่ซื้อของบัญชีนี้'),{status:404});
  if(row.expired||!(row.has_image??row.image))throw Object.assign(Error('งานนี้พ้นระยะเก็บรูป 7 วันแล้ว'),{status:410,code:'photo_expired'});
  if(!await authorized({...row,wallet_id:wallet}))throw Object.assign(Error('ยังยืนยันสิทธิ์รูปนี้ไม่ได้ กรุณาตรวจสอบการชำระเงิน ไม่ต้องจ่ายซ้ำ'),{status:403});
  res.json(await nativeEditPayload(wallet,row));
 }));
 app.get('/api/purchased-photos/:id/:kind',member,handle(async(req,res)=>{
  if(!['image','preview'].includes(req.params.kind))return res.sendStatus(404);
  const wallet=req.accountUser.wallet_id,row=await ownedAsset(wallet,req.params.id,req.params.kind);if(!await check(accessRow(row,wallet),res))return;
  if(req.params.kind==='preview')res.type('webp').send(row.preview);else res.type('png').set('Content-Disposition',`attachment; filename="IDPROM-${row.id}.png"`).send(row.image);
 }));
 app.get('/receive/:token/image',handle(async(req,res)=>{
  if(!/^[a-f0-9]{64}$/.test(req.params.token))return res.sendStatus(404);
  const row=await store.byToken(req.params.token);if(!await check(row,res,req.query.lang==='en'))return;
  res.type('png').set('Content-Disposition',`${req.query.download==='1'?'attachment':'inline'}; filename="IDPROM-${row.id}.png"`).send(row.image);
 }));
 app.get('/receive/:token',handle(async(req,res)=>{
  if(!/^[a-f0-9]{64}$/.test(req.params.token))return res.sendStatus(404);
  const row=await store.byToken(req.params.token);if(!await check(row,res,req.query.lang==='en'))return;
  const nonce=crypto.randomBytes(18).toString('base64'),url='/receive/'+req.params.token+'/image';
  res.set('Content-Security-Policy',`default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`);
  if(req.query.lang==='en')return res.type('html').send(englishPhotoDeliveryPage({imageUrl:url,expiresAt:row.expires_at,nonce}));
  res.type('html').send(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>รับรูป · IDพร้อม</title><style>*{box-sizing:border-box}body{margin:0;background:#f1f2fa;color:#17244b;font:16px system-ui,sans-serif}main{width:min(440px,100%);margin:auto;background:white;min-height:100vh;padding:18px}header{font-weight:800;color:#7044ed;border-bottom:1px solid #e6e8f1;padding-bottom:14px}h1{text-align:center;font-size:24px}.photo{display:block;max-width:100%;max-height:48vh;margin:16px auto;object-fit:contain}a,button{display:block;width:100%;margin:10px 0;padding:12px;border-radius:9px;border:1px solid #7044ed;color:#7044ed;text-align:center;text-decoration:none;background:white;font:inherit}a:first-of-type{background:#7044ed;color:white}p{font-size:13px;color:#64708a;text-align:center;line-height:1.6}</style><main><header>IDพร้อม Studio</header><h1>รูปพร้อมดาวน์โหลด</h1><img class="photo" src="${url}" alt="รูปที่ซื้อพร้อมบันทึก"><a href="${url}?download=1" download>ดาวน์โหลดรูป</a><a href="${url}" target="_blank" rel="noopener">เปิดรูปเพื่อบันทึก</a><button id="copy">คัดลอกลิงก์รับรูป</button><p id="status" role="status"></p><p>หากโหลดไม่ได้ ให้เปิดลิงก์นี้ใน Chrome หรือ Safari<br>เก็บรูปถึง ${new Date(row.expires_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</p></main><script nonce="${nonce}">document.getElementById('copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);document.getElementById('status').textContent='คัดลอกลิงก์แล้ว'}catch{document.getElementById('status').textContent='คัดลอกที่อยู่หน้านี้จากแถบที่อยู่ของเบราว์เซอร์'}}</script></html>`);
 }));
 return {purge:()=>store.purge()};
}
