export function registerPackageUnlockCodeApi(app,{store,authUser}){
 app.post('/api/package-codes/redeem',async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{
   const user=req.accountUser||await authUser(req);
   if(!user)return res.status(401).json({error:'auth_required',message:'กรุณาเข้าสู่ระบบก่อนใช้โค้ด'});
   const result=await store.redeem(user,req.body?.code,req.body?.jobId);
   res.json(result);
  }catch(error){
   if(error?.code&&[400,403,404,409].includes(error.status))return res.status(error.status).json({error:error.code,message:error.message});
   // Storage/provider details must not expose the submitted code or other users.
   res.status(503).json({error:'package_code_unavailable',message:'ยังยืนยันการใช้โค้ดไม่สำเร็จ กรุณาลองโค้ดเดิมกับงานเดิมอีกครั้ง ไม่ต้องชำระเงิน'});
  }
 });
}
