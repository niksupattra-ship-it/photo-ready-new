import {saveWork,listWorks,getWork,deleteWork,getSavedWorkRetentionPolicy,MAX_SAVED_WORKS} from './saved-work-store.js';

export function registerSavedWorkApi(app,{savedWorkRights,store={saveWork,listWorks,getWork,deleteWork,getSavedWorkRetentionPolicy,MAX_SAVED_WORKS}}){
 const expired=(res,error)=>{
  if(error.code!=='saved_work_expired')return false;
  res.status(410).json({error:error.code,message:'งานนี้หมดอายุการจัดเก็บแล้ว ไม่สามารถเปิดหรือบันทึกทับได้ กรุณาดาวน์โหลดภาพที่ยังเปิดอยู่ไว้ในอุปกรณ์'});return true;
 };
 app.get('/api/saved-work/policy',async(req,res)=>{res.set('Cache-Control','no-store');try{
  res.json(await store.getSavedWorkRetentionPolicy());
 }catch(error){res.status(503).json({error:'saved_work_policy_unavailable',message:'ยังตรวจสอบระยะเก็บงานไม่ได้ กรุณาลองใหม่'})}});
 app.post('/api/saved-work',async(req,res)=>{res.set('Cache-Control','no-store');try{
  const user=req.accountUser;if(!user)return res.status(401).json({message:'กรุณาเข้าสู่ระบบเพื่อบันทึกงาน'});
  const project=req.body?.project;if(!await savedWorkRights(user.wallet_id,project))return res.status(403).json({message:'บันทึกได้เฉพาะรูปที่รับเครดิตแล้ว'});
  const work=await store.saveWork(user.wallet_id,String(req.body?.id||''),project);if(!work)return res.status(404).json({message:'ไม่พบงานของบัญชีนี้'});res.json(work);
 }catch(error){if(expired(res,error))return;if(error.code==='saved_work_limit')return res.status(409).json({error:error.code,limit:store.MAX_SAVED_WORKS,message:error.message});res.status(400).json({message:'บันทึกงานไม่สำเร็จ กรุณาลองใหม่'})}});
 app.get('/api/saved-work',async(req,res)=>{res.set('Cache-Control','no-store');try{
  if(!req.accountUser)return res.status(401).json({message:'กรุณาเข้าสู่ระบบเพื่อเปิดงาน'});
  const [items,retention]=await Promise.all([store.listWorks(req.accountUser.wallet_id),store.getSavedWorkRetentionPolicy()]);
  res.json({items,limit:store.MAX_SAVED_WORKS,retention});
 }catch(error){res.status(500).json({message:'โหลดงานไม่สำเร็จ'})}});
 app.delete('/api/saved-work/:id',async(req,res)=>{res.set('Cache-Control','no-store');try{
  if(!req.accountUser)return res.status(401).json({message:'กรุณาเข้าสู่ระบบเพื่อลบงาน'});
  const removed=await store.deleteWork(req.accountUser.wallet_id,req.params.id);if(!removed)return res.status(404).json({message:'ไม่พบงานของบัญชีนี้'});res.json({ok:true,id:removed.id});
 }catch(error){if(expired(res,error))return;res.status(500).json({message:'ลบงานไม่สำเร็จ กรุณาลองใหม่'})}});
 app.get('/api/saved-work/:id',async(req,res)=>{res.set('Cache-Control','no-store');try{
  if(!req.accountUser)return res.status(401).json({message:'กรุณาเข้าสู่ระบบเพื่อเปิดงาน'});
  const work=await store.getWork(req.accountUser.wallet_id,req.params.id);if(!work)return res.status(404).json({message:'ไม่พบงานของบัญชีนี้'});
  if(!await savedWorkRights(req.accountUser.wallet_id,work.project))return res.status(403).json({message:'ไม่มีเครดิตเปิดงานนี้'});res.json({...work,unlocked:true});
 }catch(error){if(expired(res,error))return;res.status(500).json({message:'เปิดงานไม่สำเร็จ'})}});
}
