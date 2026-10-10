export function registerPasswordResetApi(app,{createPasswordReset,resetPassword,fetchImpl=(...args)=>fetch(...args)}){
 const windows=new Map();
 const limited=req=>{const now=Date.now(),key=req.ip||'unknown';for(const [id,w] of windows)if(now-w.start>15*60*1000)windows.delete(id);if(windows.size>=10000&&!windows.has(key))return true;const w=windows.get(key)||{start:now,count:0};windows.set(key,w);return ++w.count>10};
 const generic='หากอีเมลนี้มีบัญชี ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ กรุณาตรวจกล่องจดหมายและจดหมายขยะ';
 app.post('/api/auth/forgot-password',async(req,res)=>{
  res.set('Cache-Control','no-store');if(limited(req))return res.status(429).json({message:'ขอส่งอีเมลบ่อยเกินไป กรุณาลองอีกครั้งใน 15 นาที'});
  const email=String(req.body?.email||'').trim();if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({message:'กรุณากรอกอีเมลให้ถูกต้อง'});
  const key=process.env.RESEND_API_KEY,from=process.env.PASSWORD_RESET_FROM,origin=process.env.APP_URL;
  if(!key||!from||!origin)return res.status(503).json({message:'ระบบส่งอีเมลยังไม่พร้อม กรุณาติดต่อแอดมิน'});
  try{const base=new URL(origin);if(base.protocol!=='https:')throw Error('invalid_origin');const reset=await createPasswordReset(email);
   if(reset){const url=new URL('/',base);url.hash='reset_password='+reset.token;
    const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({from,to:[reset.email],subject:'ตั้งรหัสผ่านใหม่ — IDพร้อม',text:`ตั้งรหัสผ่านใหม่สำหรับบัญชี IDพร้อม\n\n${url.href}\n\nลิงก์ใช้ได้ครั้งเดียวภายใน 30 นาที เครดิตและงานที่บันทึกยังอยู่ในบัญชีเดิม\nหากคุณไม่ได้ขอเปลี่ยนรหัสผ่าน สามารถละเว้นอีเมลนี้ได้`})});if(!response.ok)console.error('Password reset email delivery failed:',response.status);
   }
   return res.json({ok:true,message:generic});
  }catch{console.error('Password reset request failed');return res.status(503).json({message:'ขอส่งอีเมลไม่สำเร็จ กรุณาลองอีกครั้ง'})}
 });
 app.post('/api/auth/reset-password',async(req,res)=>{
  res.set('Cache-Control','no-store');if(limited(req))return res.status(429).json({message:'ลองบ่อยเกินไป กรุณารอสักพัก'});
  try{const result=await resetPassword(req.body?.token,req.body?.password);if(!result.ok)return res.status(400).json({message:result.error==='weak_password'?'รหัสผ่านต้องมี 8–128 ตัวอักษร':'ลิงก์หมดอายุหรือถูกใช้แล้ว กรุณาขอลิงก์ใหม่'});return res.json({ok:true,message:'ตั้งรหัสผ่านใหม่แล้ว กรุณาเข้าสู่ระบบด้วยรหัสใหม่'})}catch{return res.status(503).json({message:'ตั้งรหัสผ่านไม่สำเร็จ กรุณาลองใหม่'})}
 });
}
