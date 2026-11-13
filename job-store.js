import crypto from 'crypto';
import pg from 'pg';
const {Pool}=pg;
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for job storage');
const pool=new Pool({connectionTimeoutMillis:10000,statement_timeout:20000,connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false}});
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
  await pool.query('ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS result_makeup bytea');
 })().catch(e=>{readyPromise=null;throw e});
 return readyPromise;
}
export async function createAiJob({walletId,usageId,fields,image,mask}){
 await ready();const id='job_'+crypto.randomBytes(18).toString('hex'),c=await pool.connect();
 try{await c.query('BEGIN');await c.query('SELECT id FROM wallets WHERE id=$1 FOR UPDATE',[walletId]);
  const active=await c.query("SELECT id FROM ai_jobs WHERE wallet_id=$1 AND status IN ('queued','processing') LIMIT 1",[walletId]);
  if(active.rowCount)throw Object.assign(Error('กรุณารอภาพก่อนหน้าสร้างเสร็จก่อน ไม่จำกัดจำนวนครั้งต่อวัน'),{status:429,code:'active_ai_job',activeJobId:active.rows[0].id});
  await c.query(`INSERT INTO ai_jobs(id,wallet_id,usage_id,status,fields,image,image_name,image_type,mask,mask_name,mask_type) VALUES($1,$2,$3,'queued',$4,$5,$6,$7,$8,$9,$10)`,[id,walletId,usageId,fields||{},image.buffer,image.originalname||'image.png',image.mimetype||'image/png',mask?.buffer||null,mask?.originalname||null,mask?.mimetype||null]);
  await c.query('COMMIT');return id;
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}

export async function createSourceDownloadJob({walletId,key,image}){
 await ready();
 const id='job_'+crypto.createHash('sha256').update(JSON.stringify([walletId,key])).digest('hex').slice(0,36);
 const hash=crypto.createHash('sha256').update(image.buffer).digest('hex'),c=await pool.connect();
 try{
  await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[id]);
  const existing=await c.query('SELECT wallet_id,fields FROM ai_jobs WHERE id=$1',[id]);
  if(existing.rowCount){
   if(existing.rows[0].wallet_id!==walletId||existing.rows[0].fields?.source_hash!==hash)throw Object.assign(Error('รูปเปลี่ยนแล้ว กรุณาเพิ่มรูปใหม่ก่อนดาวน์โหลด'),{status:409});
  }else{
   await c.query(`INSERT INTO ai_jobs(id,wallet_id,usage_id,status,fields,image,image_name,image_type,result) VALUES($1,$2,$3,'completed',$4,'\\x'::bytea,$5,$6,$7)`,[id,walletId,'free_source_'+id,{source_only:true,source_hash:hash,delivery_confirmed:true},image.originalname||'portrait.png',image.mimetype,image.buffer]);
  }
  await c.query('COMMIT');return id;
 }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
}

export async function claimAiJob(id){await ready();const {rows}=await pool.query(`UPDATE ai_jobs SET status='processing',updated_at=now() WHERE id=$1 AND status='queued' RETURNING *`,[id]);return rows[0]||null}
export async function touchAiJob(id,stage=null){await ready();await pool.query(`UPDATE ai_jobs SET updated_at=now(),fields=CASE WHEN $2::text IS NULL THEN fields ELSE fields||jsonb_build_object('processing_stage',$2::text) END WHERE id=$1 AND status='processing'`,[id,stage])}
export async function completeAiJob(id,result,makeup=null){await ready();await pool.query(`UPDATE ai_jobs SET status='completed',result=$2,result_makeup=$3,error=NULL,image='\\x'::bytea,mask=NULL,fields=fields-'femaleMakeupReference'-'studioSkinEvidence'-'englishHairFit',updated_at=now() WHERE id=$1 AND status='processing'`,[id,result,makeup])}
export async function failAiJob(id,error){await ready();await pool.query(`UPDATE ai_jobs SET status='failed',error=$2,image='\\x'::bytea,mask=NULL,fields=fields-'femaleMakeupReference'-'studioSkinEvidence'-'englishHairFit',updated_at=now() WHERE id=$1 AND status IN ('queued','processing')`,[id,String(error||'AI processing failed').slice(0,2000)])}
export async function getAiJob(id,walletId){await ready();const {rows}=await pool.query(`SELECT id,status,error,created_at,updated_at,fields->>'processing_stage' AS stage,fields->>'studioSkinVersion' AS "studioSkinVersion",fields->>'femaleEyeStyle' AS "femaleEyeStyle",fields->>'portraitMode' AS "portraitMode",fields->>'portraitComposition' AS "portraitComposition",fields->>'englishStudioFinishVersion' AS "englishStudioFinishVersion",fields->>'proportion_correction' AS "proportionCorrection",fields->>'naturalFinishVersion' AS "naturalFinishVersion",(result_makeup IS NOT NULL) AS "hasMakeupVariant",(result IS NOT NULL) AS has_result FROM ai_jobs WHERE id=$1 AND wallet_id=$2`,[id,walletId]);return rows[0]||null}
export async function getAiJobResult(id,walletId,includeMakeup=false){await ready();const {rows}=await pool.query(`SELECT status,result,${includeMakeup?'result_makeup':'NULL AS result_makeup'},error,usage_id FROM ai_jobs WHERE id=$1 AND wallet_id=$2`,[id,walletId]);return rows[0]||null}
export async function getAiJobsAccess(ids,walletId){if(!ids.length)return [];await ready();const {rows}=await pool.query('SELECT id,status,usage_id FROM ai_jobs WHERE wallet_id=$1 AND id=ANY($2::text[])',[walletId,ids]);return rows}
export async function queuedAiJobs(){await ready();const {rows}=await pool.query(`UPDATE ai_jobs SET status='queued',updated_at=now() WHERE status='processing' AND updated_at < now()-interval '3 minutes' RETURNING id`);const q=await pool.query(`SELECT id FROM ai_jobs WHERE status='queued' ORDER BY created_at ASC LIMIT 20`);return q.rows.map(r=>r.id)}

export async function claimTrialImage(id,sourceWalletId,targetWalletId){await ready();const r=await pool.query("UPDATE ai_jobs SET wallet_id=$3,updated_at=now() WHERE id=$1 AND wallet_id=$2 AND status='completed' AND (usage_id LIKE 'trial_%' OR usage_id LIKE 'free_%') RETURNING id",[id,sourceWalletId,targetWalletId]);return r.rowCount>0}

// Serialize cancellation and delivery with credit settlement in ONE transaction.
// AI output is retained only until delivery is confirmed; late workers cannot
// revive cancelled jobs. Repeated close/confirm requests are idempotent.
export async function settleAiJobDelivery(id,walletId,action){
 if(!['confirm','cancel'].includes(action))throw Error('invalid settlement');
 await ready();const c=await pool.connect();
 try{
  await c.query('BEGIN');
  // Both actions take the wallet first. USD confirmation inserts unlocks with
  // a wallet foreign key; locking the job first can deadlock against Cancel,
  // which already owns the wallet and is waiting for this same job.
  await c.query('SELECT id FROM wallets WHERE id=$1 FOR UPDATE',[walletId]);
  const row=await c.query('SELECT * FROM ai_jobs WHERE id=$1 AND wallet_id=$2 FOR UPDATE',[id,walletId]);
  const j=row.rows[0];if(!j){await c.query('ROLLBACK');return {status:404,error:'job_not_found'}}
  if(j.fields?.delivery_confirmed){await c.query('ROLLBACK');return action==='confirm'?{status:200,ok:true}:{status:409,error:'already_delivered'}}
  if(j.error==='USER_CANCELLED'){await c.query('ROLLBACK');return action==='cancel'?{status:200,ok:true,cancelled:true}:{status:409,error:'job_cancelled'}}
  if(action==='confirm'&&j.fields?.proportion_correction==='processing'){await c.query('ROLLBACK');return {status:409,error:'correction_pending'}}
  if(action==='confirm'&&j.status!=='completed'){await c.query('ROLLBACK');return {status:409,error:'result_not_ready'}}
  const trial=String(j.usage_id).startsWith('trial_');
  const usage=await c.query(trial?'SELECT status FROM trial_previews WHERE id=$1 FOR UPDATE':'SELECT * FROM credit_usage WHERE id=$1 FOR UPDATE',[j.usage_id]);
  const u=usage.rows[0];
  if(action==='cancel'&&u?.status==='completed'){await c.query('ROLLBACK');return {status:409,error:'already_delivered'}}
  if(action==='confirm'&&!String(j.usage_id).startsWith('private_full_')&&!String(j.usage_id).startsWith('free_')&&(!u||u.status==='refunded')){await c.query('ROLLBACK');return {status:409,error:'credit_not_reserved'}}
  if(u?.status==='reserved'){
   if(action==='confirm'){
    await c.query(trial?"UPDATE trial_previews SET status='completed',completed_at=now() WHERE id=$1":"UPDATE credit_usage SET status='completed',completed_at=now() WHERE id=$1",[j.usage_id]);
    if(u.credit_column==='usd_premium_remaining'){
     await c.query('INSERT INTO paid_image_unlocks(wallet_id,job_id,full_edit,created_at) VALUES($1,$2,true,$3) ON CONFLICT(wallet_id,job_id) DO UPDATE SET full_edit=true',[walletId,id,j.created_at]);
     await c.query('INSERT INTO premium_hair_unlocks(wallet_id,job_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[walletId,id]);
    }
   }
   else if(trial)await c.query('DELETE FROM trial_previews WHERE id=$1',[j.usage_id]);
   else{
    const isUsd=u.credit_column==='usd_premium_remaining';
    const col=isUsd?'usd_premium_remaining':u.credit_column==='hair_remaining'?'hair_remaining':u.credit_column==='generation_remaining'?'generation_remaining':u.kind==='hairstyle'?'hair_remaining':'generation_remaining';
    if(isUsd)await c.query('UPDATE wallets SET usd_premium_remaining=usd_premium_remaining+1 WHERE id=$1 AND usd_premium_cycle=$2 AND usd_premium_expires_at>clock_timestamp()',[u.wallet_id,u.usd_premium_cycle]);
    else await c.query(`UPDATE wallets SET ${col}=${col}+1 WHERE id=$1`,[u.wallet_id]);
    if(u.full_edit_output&&!isUsd)await c.query('UPDATE wallets SET full_edit_remaining=full_edit_remaining+1 WHERE id=$1',[u.wallet_id]);
    await c.query("UPDATE credit_usage SET status='refunded',refunded_at=now() WHERE id=$1",[j.usage_id]);
   }
  }
  if(action==='confirm')await c.query(`UPDATE ai_jobs SET fields=fields||'{"delivery_confirmed":true}'::jsonb,updated_at=now() WHERE id=$1`,[id]);
  else await c.query("UPDATE ai_jobs SET status='failed',error='USER_CANCELLED',result=NULL,result_makeup=NULL,image='\\x'::bytea,mask=NULL,fields=fields-'femaleMakeupReference'-'studioSkinEvidence'-'englishHairFit',updated_at=now() WHERE id=$1",[id]);
  await c.query('COMMIT');return {status:200,ok:true,cancelled:action==='cancel'};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}


// A single correction of an undelivered owned English job. No credit rows or
// balances are touched; cancellation/delivery can still win while AI runs.
export async function claimEnglishProportionCorrection(id,walletId){
 await ready();const {rows}=await pool.query(`UPDATE ai_jobs SET fields=fields||'{"proportion_correction":"processing"}'::jsonb,updated_at=now() WHERE id=$1 AND wallet_id=$2 AND status='completed' AND result IS NOT NULL AND fields->>'interfaceLanguage'='en' AND fields->>'portraitComposition'='en-outfit-body-v1' AND NOT COALESCE((fields->>'delivery_confirmed')::boolean,false) AND fields->>'delivery_pending'='true' AND NOT(fields ? 'proportion_correction') RETURNING result,result_makeup,fields`,[id,walletId]);return rows[0]||null;
}
export async function finishEnglishProportionCorrection(id,walletId,result){
 await ready();const {rowCount}=await pool.query(`UPDATE ai_jobs SET result=$3,result_makeup=$4,fields=fields||'{"proportion_correction":"done"}'::jsonb,updated_at=now() WHERE id=$1 AND wallet_id=$2 AND status='completed' AND fields->>'proportion_correction'='processing' AND NOT COALESCE((fields->>'delivery_confirmed')::boolean,false)`,[id,walletId,result.natural,result.makeup]);return rowCount>0;
}
export async function failEnglishProportionCorrection(id,walletId){await ready();await pool.query(`UPDATE ai_jobs SET fields=fields||'{"proportion_correction":"failed"}'::jsonb,updated_at=now() WHERE id=$1 AND wallet_id=$2 AND status='completed' AND fields->>'proportion_correction'='processing'`,[id,walletId])}
