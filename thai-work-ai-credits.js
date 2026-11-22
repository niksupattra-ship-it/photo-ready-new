import crypto from 'node:crypto';
export const THAI_WORK_AI_PACKAGE='download_159_work_ai10_v3';
// A paid bundle belongs to one immutable original-photo work, never the wallet balance.
export function createThaiWorkAiCredits(pool,{prepare=async()=>{}}={}){
 let initialized;
 const ready=()=>initialized||(initialized=(async()=>{
  await prepare();const c=await pool.connect();try{
   await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query('SELECT pg_advisory_xact_lock(714269061)');
   await c.query('CREATE TABLE IF NOT EXISTS thai_work_ai_grants(payment_id text PRIMARY KEY,wallet_id text NOT NULL,work_id text NOT NULL,quantity integer NOT NULL CHECK(quantity=10),expires_at timestamptz NOT NULL)');
   await c.query('CREATE INDEX IF NOT EXISTS thai_work_ai_grants_work_idx ON thai_work_ai_grants(wallet_id,work_id)');
   await c.query('ALTER TABLE credit_usage ADD COLUMN IF NOT EXISTS thai_work_id text');
   await c.query('CREATE INDEX IF NOT EXISTS credit_usage_thai_work_idx ON credit_usage(wallet_id,thai_work_id) WHERE thai_work_id IS NOT NULL');
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 })().catch(e=>{initialized=null;throw e}));
 const grant=async(db,wallet,job,payment)=>{
  const r=await db.query(`INSERT INTO thai_work_ai_grants(payment_id,wallet_id,work_id,quantity,expires_at)
   SELECT $3,w.wallet_id,w.id,10,COALESCE((SELECT min(p.created_at) FROM paid_image_unlocks p JOIN download_work_jobs peer ON peer.job_id=p.job_id AND peer.wallet_id=p.wallet_id WHERE peer.wallet_id=w.wallet_id AND peer.work_id=w.id),(SELECT created_at FROM payments WHERE session_id=$3),clock_timestamp())+interval '7 days' FROM download_works w JOIN download_work_jobs m ON m.work_id=w.id AND m.wallet_id=w.wallet_id JOIN ai_jobs j ON j.id=m.job_id AND j.wallet_id=w.wallet_id
   WHERE w.wallet_id=$1 AND j.id=$2 AND j.status='completed' ON CONFLICT(payment_id) DO NOTHING RETURNING work_id`,[wallet,job,payment]);
  if(!r.rowCount){const old=await db.query('SELECT work_id FROM thai_work_ai_grants WHERE payment_id=$1 AND wallet_id=$2',[payment,wallet]);if(!old.rowCount)throw Error('completed_photo_required')}
 };
 const reserve=async(wallet,work,key='',authenticated=true)=>{
  if(!wallet||!work)return {owned:false};await ready();const c=await pool.connect();try{
   await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['thai-ai10:'+wallet+':'+work]);
   const grants=await c.query('SELECT quantity,expires_at,expires_at>clock_timestamp() AS active FROM thai_work_ai_grants WHERE wallet_id=$1 AND work_id=$2',[wallet,work]);
   if(!grants.rowCount){await c.query('COMMIT');return {owned:false}}
   if(!authenticated){await c.query('COMMIT');return {owned:true,error:'auth_required'}}
   const active=grants.rows.filter(r=>r.active),quantity=active.reduce((n,r)=>n+Number(r.quantity),0);
   if(!quantity){await c.query('COMMIT');return {owned:true,error:'thai_work_ai_expired'}}
   const id='ai10_'+(key?crypto.createHash('sha256').update(wallet+'|'+work+'|'+key).digest('hex').slice(0,36):crypto.randomBytes(18).toString('hex'));
   const previous=key?await c.query('SELECT status FROM credit_usage WHERE id=$1 AND wallet_id=$2 AND thai_work_id=$3',[id,wallet,work]):{rows:[]};
   if(previous.rows[0]&&previous.rows[0].status!=='refunded'){await c.query('COMMIT');return {owned:true,credit:{usageId:id,trialPreview:false,generationRemaining:0,hairRemaining:0}}}
   const used=await c.query("SELECT COUNT(*)::int AS used FROM credit_usage WHERE wallet_id=$1 AND thai_work_id=$2 AND kind='thai-work-ai10' AND status IN ('reserved','completed')",[wallet,work]);
   const remaining=quantity-Number(used.rows[0]?.used||0);
   if(remaining<1){await c.query('COMMIT');return {owned:true,error:'thai_work_ai_exhausted'}}
   await c.query(`INSERT INTO credit_usage(id,wallet_id,kind,status,credit_column,full_edit_output,thai_work_id) VALUES($1,$2,'thai-work-ai10','reserved','thai-work-ai10',false,$3)
    ON CONFLICT(id) DO UPDATE SET status='reserved',refunded_at=NULL WHERE credit_usage.status='refunded'`,[id,wallet,work]);
   await c.query('COMMIT');return {owned:true,remaining:remaining-1,credit:{usageId:id,trialPreview:false,generationRemaining:0,hairRemaining:0}};
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 };
 const eligible=async(wallet,work)=>{await ready();const r=await pool.query("SELECT 1 FROM download_works w WHERE w.wallet_id=$1 AND w.id=$2 AND COALESCE((SELECT min(p.created_at) FROM paid_image_unlocks p JOIN download_work_jobs peer ON peer.job_id=p.job_id AND peer.wallet_id=p.wallet_id WHERE peer.wallet_id=w.wallet_id AND peer.work_id=w.id),clock_timestamp())+interval '7 days'>clock_timestamp()",[wallet,work]);return r.rowCount>0};
 return {ready,grant,reserve,eligible};
}
