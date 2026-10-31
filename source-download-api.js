// Register an uploaded portrait for the existing per-work download flow.
// This route never generates an image, spends a credit, or grants an unlock.
export function registerSourceDownloadApi(app,{upload,walletId,ensureWallet,metadata,createSourceDownloadJob,downloadPolicy}){
 app.post('/api/source-downloads',upload.single('image'),async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{
   const wallet=walletId(req),key=String(req.get('X-IDPROM-Source-Key')||'');
   if(!wallet)return res.status(400).json({message:'ไม่พบกระเป๋าของรูป กรุณาลองอีกครั้ง'});
   if(!/^[A-Za-z0-9_-]{16,120}$/.test(key)||!req.file?.buffer?.length)return res.status(400).json({message:'ข้อมูลรูปไม่ครบ กรุณาเพิ่มรูปแล้วลองอีกครั้ง'});
   let info;try{info=await metadata(req.file.buffer)}catch{return res.status(400).json({message:'ไฟล์ภาพไม่ถูกต้อง'})}
   if(!['png','jpeg','webp'].includes(info.format)||!info.width||!info.height||Math.max(info.width,info.height)>8192)return res.status(400).json({message:'กรุณาใช้รูป PNG, JPEG หรือ WebP ขนาดไม่เกิน 8192 พิกเซล'});
   await ensureWallet(wallet);
   const jobId=await createSourceDownloadJob({walletId:wallet,key,image:{...req.file,mimetype:'image/'+info.format}});
   const downloadWorkId=await downloadPolicy.registerSource(wallet,jobId,req.file.buffer,'image/'+info.format);
   res.json({jobId,downloadWorkId});
  }catch(error){res.status(error.status||503).json({message:error.status===409?error.message:'ยังเตรียมรูปดาวน์โหลดไม่สำเร็จ กรุณาลองอีกครั้ง'});}
 });
}
