import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {packageFor} from './package-rules.js';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?.includes('localhost')?false:{rejectUnauthorized:false}});
let initialized;
const ready=()=>initialized||(initialized=pool.query(`CREATE TABLE IF NOT EXISTS youcam_hair_usage (id text PRIMARY KEY,wallet_id text NOT NULL,source_job_id text NOT NULL,bucket text NOT NULL,status text NOT NULL DEFAULT 'reserved',expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',created_at timestamptz NOT NULL DEFAULT now())`));
export function hairPurchaseAllowance(rows){return rows.reduce((total,row)=>{try{const p=packageFor(row.package_id);return total+(p.price===89?1:p.price===159?10:p.g+p.h)}catch{return total}},0)}
async function access(c,owner,sourceJobId){
 const source=await c.query("SELECT usage_id FROM ai_jobs WHERE id=$1 AND wallet_id=$2 AND status='completed' AND COALESCE(fields->>'delivery_confirmed','false')='true'",[sourceJobId,owner]);
 if(!source.rowCount)throw Error('ไม่พบรูปที่ประมวลผลสำเร็จของคุณ กรุณาเปิดรูปเดิมอีกครั้ง');
 const purchases=await c.query('SELECT package_id FROM payments WHERE wallet_id=$1 UNION ALL SELECT package_id FROM promo_redemptions WHERE wallet_id=$1',[owner]);
 const paid=purchases.rowCount>0,bucket=paid?'paid':'trial';
 const limit=paid?hairPurchaseAllowance(purchases.rows):String(source.rows[0].usage_id).startsWith('trial_')?1:0;
 const used=await c.query("SELECT count(*)::integer AS n FROM youcam_hair_usage WHERE wallet_id=$1 AND bucket=$2 AND ($2='paid' OR source_job_id=$3) AND (status='completed' OR (status='reserved' AND expires_at>now()))",[owner,bucket,sourceJobId]);
 return {remaining:Math.max(0,limit-Number(used.rows[0].n)),bucket};
}
export async function hairAiAccess(owner,jobId){await ready();return access(pool,owner,jobId)}
export async function reserveHairAi(owner,jobId){await ready();const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT id FROM wallets WHERE id=$1 FOR UPDATE',[owner]);const a=await access(c,owner,jobId);if(a.remaining<1){await c.query('ROLLBACK');return null}const id=randomUUID();await c.query('INSERT INTO youcam_hair_usage(id,wallet_id,source_job_id,bucket) VALUES($1,$2,$3,$4)',[id,owner,jobId,a.bucket]);await c.query('COMMIT');return id}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
export async function settleHairAi(id,success){if(!id)return;await ready();const r=await pool.query(success?"UPDATE youcam_hair_usage SET status='completed' WHERE id=$1 AND status='reserved' AND expires_at>now() RETURNING id":"UPDATE youcam_hair_usage SET status='released' WHERE id=$1 AND status='reserved' RETURNING id",[id]);if(success&&!r.rowCount){const old=await pool.query("SELECT id FROM youcam_hair_usage WHERE id=$1 AND status='completed'",[id]);if(!old.rowCount)throw Error('สิทธิ์งานนี้หมดอายุ กรุณาลองใหม่')} }
