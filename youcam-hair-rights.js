import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {packageFor} from './package-rules.js';
const pool=new pg.Pool({max:2,connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'||process.env.DATABASE_URL?.includes('localhost')?false:{rejectUnauthorized:false}});
let initialized;
const ready=()=>initialized||(initialized=pool.query(`CREATE TABLE IF NOT EXISTS youcam_hair_usage (id text PRIMARY KEY,wallet_id text NOT NULL,source_job_id text NOT NULL,bucket text NOT NULL,status text NOT NULL DEFAULT 'reserved',expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',created_at timestamptz NOT NULL DEFAULT now())`).catch(e=>{initialized=null;throw e}));
export function hairPurchaseAllowance(rows){return rows.reduce((total,row)=>{try{const p=packageFor(row.package_id);return total+(Number.isFinite(p.aiHair)?p.aiHair:p.price===89?1:p.price===159?10:p.g+p.h)}catch{return total}},0)}
async function access(c,owner,sourceJobId,reserving=false){
 const source=await c.query("SELECT usage_id FROM ai_jobs WHERE id=$1 AND wallet_id=$2 AND status='completed' AND (COALESCE(fields->>'delivery_confirmed','false')='true' OR (NOT (fields ? 'delivery_pending') AND (EXISTS(SELECT 1 FROM credit_usage u WHERE u.id=ai_jobs.usage_id AND u.status='completed') OR EXISTS(SELECT 1 FROM trial_previews t WHERE t.id=ai_jobs.usage_id AND t.status='completed'))))",[sourceJobId,owner]);
 if(!source.rowCount)throw Error('ไม่พบรูปที่ประมวลผลสำเร็จของคุณ กรุณาเปิดรูปเดิมอีกครั้ง');
 const purchases=await c.query('SELECT package_id FROM payments WHERE wallet_id=$1 UNION ALL SELECT package_id FROM promo_redemptions WHERE wallet_id=$1',[owner]);
 const paid=purchases.rowCount>0,bucket=paid?'paid':'trial';
 const limit=paid?hairPurchaseAllowance(purchases.rows):String(source.rows[0].usage_id).startsWith('trial_')?1:0;
 let used;
 if(bucket==='trial'){
  const trial=await c.query('SELECT fingerprint FROM trial_previews WHERE id=$1',[source.rows[0].usage_id]);
  if(!trial.rowCount)throw Error('ไม่พบเครดิตทดลองของรูปนี้');
  const fingerprint=trial.rows[0].fingerprint;
  // Same device/day is shared by both trial portraits, including linked wallets.
  if(reserving){
   const devices=await c.query('SELECT device_key FROM trial_daily_devices WHERE trial_id=$1',[source.rows[0].usage_id]);
   const locks=[...new Set(['fingerprint:'+fingerprint,...devices.rows.map(r=>'device:'+r.device_key)])].sort();
   for(const key of locks)await c.query("SELECT pg_advisory_xact_lock(hashtext($1))",['hair-trial:'+key]);
  }
  used=await c.query(`SELECT count(*)::integer AS n FROM youcam_hair_usage u
   JOIN ai_jobs j ON j.id=u.source_job_id JOIN trial_previews t ON t.id=j.usage_id
   WHERE u.bucket='trial' AND (u.created_at AT TIME ZONE 'Asia/Bangkok')::date=(now() AT TIME ZONE 'Asia/Bangkok')::date
   AND (u.wallet_id=$1 OR t.fingerprint=$2 OR EXISTS (
    SELECT 1 FROM trial_daily_devices d JOIN trial_daily_devices own ON own.device_key=d.device_key AND own.trial_day=d.trial_day
    WHERE d.trial_id=t.id AND own.trial_id=$3))
   AND (u.status='completed' OR (u.status='reserved' AND u.expires_at>now()))`,[owner,fingerprint,source.rows[0].usage_id]);
 }else used=await c.query("SELECT count(*)::integer AS n FROM youcam_hair_usage WHERE bucket='paid' AND wallet_id=$1 AND (status='completed' OR (status='reserved' AND expires_at>now()))",[owner]);
 return {remaining:Math.max(0,limit-Number(used.rows[0].n)),bucket};
}
export async function hairAiAccess(owner,jobId){await ready();return access(pool,owner,jobId)}
export async function reserveHairAi(owner,jobId){await ready();const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT id FROM wallets WHERE id=$1 FOR UPDATE',[owner]);const a=await access(c,owner,jobId,true);if(a.remaining<1){await c.query('ROLLBACK');return null}const id=randomUUID();await c.query('INSERT INTO youcam_hair_usage(id,wallet_id,source_job_id,bucket) VALUES($1,$2,$3,$4)',[id,owner,jobId,a.bucket]);await c.query('COMMIT');return id}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
export async function settleHairAi(id,success){
 if(!id)return success?'completed':'released';await ready();
 const r=await pool.query(success?"UPDATE youcam_hair_usage SET status='completed' WHERE id=$1 AND status='reserved' AND expires_at>now() RETURNING status":"UPDATE youcam_hair_usage SET status='released' WHERE id=$1 AND status='reserved' RETURNING status",[id]);
 if(r.rowCount)return r.rows[0].status;
 const old=await pool.query('SELECT status FROM youcam_hair_usage WHERE id=$1',[id]);const status=old.rows[0]?.status;
 if(success&&status!=='completed')throw Error('เครดิตงานนี้หมดอายุ กรุณาลองใหม่');return status;
}

