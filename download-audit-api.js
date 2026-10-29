import crypto from 'node:crypto';

// Authenticate with the isolated audit pool, without initializing or borrowing
// auth-store's business pool. The hash, join and expiry match authUser exactly.
export function createDownloadAuditAuth(pool){
 return async req=>{
  const header=String(req.get('authorization')||'');if(header.length>4096)return null;
  const match=/^Bearer\s+(.+)$/i.exec(header);if(!match||match[1].length>512)return null;
  const tokenHash=crypto.createHash('sha256').update(match[1]).digest('hex');
  const result=await pool.query('SELECT u.id,u.email,u.wallet_id FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[tokenHash]);
  return result.rows[0]||null;
 };
}

// Audit failures stay separate from purchase/export responses and UI state.
export function registerDownloadAuditApi(app,{store,authUser,isOwner=()=>false,enabled=()=>process.env.DOWNLOAD_AUDIT_ENABLED!=='0',now=Date.now}={}){
 const windows=new Map();
 app.post('/api/download-events',async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(!(typeof enabled==='function'?enabled():enabled))return res.sendStatus(204);
  try{
   const user=req.accountUser||await authUser(req);if(!user)return res.status(401).json({error:'auth_required'});
   req.accountUser=user;
   const time=now();for(const [key,value]of windows)if(time-value.at>=60000)windows.delete(key);
   let bucket=windows.get(user.id);if(!bucket){if(windows.size>=5000)return res.status(429).json({error:'download_audit_rate_limited'});bucket={at:time,count:0};windows.set(user.id,bucket)}
   if(++bucket.count>60)return res.status(429).json({error:'download_audit_rate_limited'});
   const result=await store.record(user,req.body,{ownerAccess:isOwner(req,user.wallet_id)===true});
   res.json(result);
  }catch(error){
   if(['invalid_download_event','download_audit_account_mismatch','download_audit_image_not_owned','download_attempt_conflict','download_event_conflict'].includes(error?.code))return res.status(error.status).json({error:error.code});
   res.status(503).json({error:'download_audit_unavailable'});
  }
 });
}
