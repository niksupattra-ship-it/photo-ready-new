import crypto from 'crypto';
import pg from 'pg';
const {Pool}=pg;
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for job storage');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false}});
let readyPromise;
async function ready(){
 if(!readyPromise)readyPromise=(async()=>{
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_jobs (
   id text PRIMARY KEY, wallet_id text NOT NULL, usage_id text NOT NULL,
   status text NOT NULL CHECK(status IN ('queued','processing','completed','failed')),
   fields jsonb NOT NULL DEFAULT '{}'::jsonb,
   image bytea NOT NULL, image_name text, image_type text,
   mask bytea, mask_name text, mask_type text,
   result bytea, error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`);
 })().catch(e=>{readyPromise=null;throw e});
 return readyPromise;
}
export async function createAiJob({walletId,usageId,fields,image,mask}){await ready();const id='job_'+crypto.randomBytes(18).toString('hex');await pool.query(`INSERT INTO ai_jobs(id,wallet_id,usage_id,status,fields,image,image_name,image_type,mask,mask_name,mask_type) VALUES($1,$2,$3,'queued',$4,$5,$6,$7,$8,$9,$10)`,[id,walletId,usageId,fields||{},image.buffer,image.originalname||'image.png',image.mimetype||'image/png',mask?.buffer||null,mask?.originalname||null,mask?.mimetype||null]);return id}
export async function claimAiJob(id){await ready();const {rows}=await pool.query(`UPDATE ai_jobs SET status='processing',updated_at=now() WHERE id=$1 AND status='queued' RETURNING *`,[id]);return rows[0]||null}
export async function completeAiJob(id,result){await ready();await pool.query(`UPDATE ai_jobs SET status='completed',result=$2,error=NULL,image='\\x'::bytea,mask=NULL,updated_at=now() WHERE id=$1 AND status='processing'`,[id,result])}
export async function failAiJob(id,error){await ready();await pool.query(`UPDATE ai_jobs SET status='failed',error=$2,image='\\x'::bytea,mask=NULL,updated_at=now() WHERE id=$1 AND status IN ('queued','processing')`,[id,String(error||'AI processing failed').slice(0,2000)])}
export async function getAiJob(id,walletId){await ready();const {rows}=await pool.query(`SELECT id,status,error,created_at,updated_at,(result IS NOT NULL) AS has_result FROM ai_jobs WHERE id=$1 AND wallet_id=$2`,[id,walletId]);return rows[0]||null}
export async function getAiJobResult(id,walletId){await ready();const {rows}=await pool.query(`SELECT status,result,error,usage_id FROM ai_jobs WHERE id=$1 AND wallet_id=$2`,[id,walletId]);return rows[0]||null}
export async function queuedAiJobs(){await ready();const {rows}=await pool.query(`UPDATE ai_jobs SET status='queued',updated_at=now() WHERE status='processing' AND updated_at < now()-interval '3 minutes' RETURNING id`);const q=await pool.query(`SELECT id FROM ai_jobs WHERE status='queued' ORDER BY created_at ASC LIMIT 20`);return q.rows.map(r=>r.id)}

export async function claimTrialImage(id,sourceWalletId,targetWalletId){await ready();const r=await pool.query("UPDATE ai_jobs SET wallet_id=$3,updated_at=now() WHERE id=$1 AND wallet_id=$2 AND status='completed' AND usage_id LIKE 'trial_%' RETURNING id",[id,sourceWalletId,targetWalletId]);return r.rowCount>0}

// Serialize cancellation and delivery with credit settlement in ONE transaction.
// AI output is retained only until delivery is confirmed; late workers cannot
// revive cancelled jobs. Repeated close/confirm requests are idempotent.
export async function settleAiJobDelivery(id,walletId,action){
 if(!['confirm','cancel'].includes(action))throw Error('invalid settlement');
 await ready();const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const row=await c.query('SELECT * FROM ai_jobs WHERE id=$1 AND wallet_id=$2 FOR UPDATE',[id,walletId]);
  const j=row.rows[0];if(!j){await c.query('ROLLBACK');return {status:404,error:'job_not_found'}}
  if(j.fields?.delivery_confirmed){await c.query('ROLLBACK');return action==='confirm'?{status:200,ok:true}:{status:409,error:'already_delivered'}}
  if(j.error==='USER_CANCELLED'){await c.query('ROLLBACK');return action==='cancel'?{status:200,ok:true,cancelled:true}:{status:409,error:'job_cancelled'}}
  if(action==='confirm'&&j.status!=='completed'){await c.query('ROLLBACK');return {status:409,error:'result_not_ready'}}
  const trial=String(j.usage_id).startsWith('trial_');
  const usage=await c.query(trial?'SELECT status FROM trial_previews WHERE id=$1 FOR UPDATE':'SELECT * FROM credit_usage WHERE id=$1 FOR UPDATE',[j.usage_id]);
  const u=usage.rows[0];
  if(action==='cancel'&&u?.status==='completed'){await c.query('ROLLBACK');return {status:409,error:'already_delivered'}}
  if(action==='confirm'&&!String(j.usage_id).startsWith('private_full_')&&(!u||u.status==='refunded')){await c.query('ROLLBACK');return {status:409,error:'credit_not_reserved'}}
  if(u?.status==='reserved'){
   if(action==='confirm')await c.query(trial?"UPDATE trial_previews SET status='completed',completed_at=now() WHERE id=$1":"UPDATE credit_usage SET status='completed',completed_at=now() WHERE id=$1",[j.usage_id]);
   else if(trial)await c.query('DELETE FROM trial_previews WHERE id=$1',[j.usage_id]);
   else{
    const col=u.credit_column==='hair_remaining'?'hair_remaining':u.credit_column==='generation_remaining'?'generation_remaining':u.kind==='hairstyle'?'hair_remaining':'generation_remaining';
    await c.query(`UPDATE wallets SET ${col}=${col}+1 WHERE id=$1`,[u.wallet_id]);
    if(u.full_edit_output)await c.query('UPDATE wallets SET full_edit_remaining=full_edit_remaining+1 WHERE id=$1',[u.wallet_id]);
    await c.query("UPDATE credit_usage SET status='refunded',refunded_at=now() WHERE id=$1",[j.usage_id]);
   }
  }
  if(action==='confirm')await c.query(`UPDATE ai_jobs SET fields=fields||'{"delivery_confirmed":true}'::jsonb,updated_at=now() WHERE id=$1`,[id]);
  else await c.query("UPDATE ai_jobs SET status='failed',error='USER_CANCELLED',result=NULL,image='\\x'::bytea,mask=NULL,updated_at=now() WHERE id=$1",[id]);
  await c.query('COMMIT');return {status:200,ok:true,cancelled:action==='cancel'};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
