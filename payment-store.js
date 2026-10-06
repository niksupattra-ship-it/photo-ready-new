import crypto from 'crypto';
import pg from 'pg';
import {packageFor,remaining} from './package-rules.js';
const {Pool}=pg;
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for payment storage');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('localhost')?false:{rejectUnauthorized:false}});
let initPromise;
async function ready(){if(!initPromise)initPromise=(async()=>{
  await pool.query(`CREATE TABLE IF NOT EXISTS wallets (id text PRIMARY KEY, credits integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS generation_remaining integer NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS hair_remaining integer NOT NULL DEFAULT 0`);
  await pool.query(`CREATE TABLE IF NOT EXISTS payments (session_id text PRIMARY KEY, wallet_id text NOT NULL REFERENCES wallets(id), credits integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS package_id text`);
  await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS generation_qty integer NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS hair_qty integer NOT NULL DEFAULT 0`);
  await pool.query(`CREATE TABLE IF NOT EXISTS credit_usage (id text PRIMARY KEY,wallet_id text NOT NULL REFERENCES wallets(id),kind text NOT NULL,status text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,refunded_at timestamptz)`);
  await pool.query(`ALTER TABLE credit_usage ADD COLUMN IF NOT EXISTS credit_column text`);
  await pool.query(`CREATE TABLE IF NOT EXISTS paid_image_unlocks (wallet_id text NOT NULL REFERENCES wallets(id),job_id text NOT NULL,full_edit boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(wallet_id,job_id))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS trial_previews (id text PRIMARY KEY,wallet_id text NOT NULL REFERENCES wallets(id),fingerprint text NOT NULL UNIQUE,status text NOT NULL CHECK(status IN ('reserved','completed')),created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS trial_daily_devices (device_key text NOT NULL,trial_day date NOT NULL,trial_id text NOT NULL REFERENCES trial_previews(id) ON DELETE CASCADE,PRIMARY KEY(device_key,trial_day))`);
  // Keep previous trials, but enforce one trial per device per Bangkok calendar day.
  await pool.query(`ALTER TABLE trial_previews DROP CONSTRAINT IF EXISTS trial_previews_fingerprint_key`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS trial_previews_device_day_key ON trial_previews (fingerprint, ((created_at AT TIME ZONE 'Asia/Bangkok')::date))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS promo_redemptions (code text PRIMARY KEY,wallet_id text NOT NULL REFERENCES wallets(id),package_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`);
  // Migrate older production rows before installing the current lifecycle constraint.
  // Historical deployments used statuses such as used/success/failed; keeping an
  // unknown historical row as completed is safer than granting a credit again.
  await pool.query(`ALTER TABLE credit_usage DROP CONSTRAINT IF EXISTS credit_usage_status_check`);
  await pool.query(`
    UPDATE credit_usage
    SET status = CASE
      WHEN lower(status) IN ('reserved','pending','processing') THEN 'reserved'
      WHEN lower(status) IN ('refunded','refund','cancelled','canceled') THEN 'refunded'
      ELSE 'completed'
    END
    WHERE status IS NULL OR lower(status) NOT IN ('reserved','completed','refunded')
  `);
  await pool.query(`ALTER TABLE credit_usage ADD CONSTRAINT credit_usage_status_check CHECK (status IN ('reserved','completed','refunded'))`);
})();return initPromise}
function shape(id,row){const count=remaining(row);return {walletId:id,processRemaining:count,generationRemaining:count,hairRemaining:count}}
export async function imageEntitlements(id){await ready();const {rows}=await pool.query('SELECT job_id,full_edit FROM paid_image_unlocks WHERE wallet_id=$1',[id]);return {unlockedJobIds:rows.map(r=>r.job_id),editableJobIds:rows.filter(r=>r.full_edit).map(r=>r.job_id)}}
export async function newWallet(){await ready();const id='wal_'+crypto.randomBytes(24).toString('hex');await pool.query('INSERT INTO wallets(id,credits,generation_remaining,hair_remaining) VALUES($1,0,0,0)',[id]);return {...shape(id,{}),unlockedJobIds:[],editableJobIds:[]}}
export async function getWallet(id){if(!id)return null;await ready();const {rows}=await pool.query('SELECT generation_remaining,hair_remaining FROM wallets WHERE id=$1',[id]);return rows[0]?{...shape(id,rows[0]),...await imageEntitlements(id)}:null}
export async function ensureWallet(id){await ready();await pool.query('INSERT INTO wallets(id,credits,generation_remaining,hair_remaining) VALUES($1,0,0,0) ON CONFLICT(id) DO NOTHING',[id]);return getWallet(id)}
export async function creditPaid(walletId,sessionId,packageId='149',jobId=''){
 await ready();const p=packageFor(packageId);if(p.requiresImage&&!jobId)throw Error('image_required');
 const c=await pool.connect();try{
  await c.query('BEGIN');
  await c.query('INSERT INTO wallets(id,credits,generation_remaining,hair_remaining) VALUES($1,0,0,0) ON CONFLICT(id) DO NOTHING',[walletId]);
  const ins=await c.query('INSERT INTO payments(session_id,wallet_id,credits,package_id,generation_qty,hair_qty) VALUES($1,$2,0,$3,$4,$5) ON CONFLICT(session_id) DO NOTHING RETURNING session_id',[sessionId,walletId,String(packageId),p.g,p.h]);
  if(ins.rowCount){
   await c.query('UPDATE wallets SET generation_remaining=generation_remaining+$2,hair_remaining=hair_remaining+$3 WHERE id=$1',[walletId,p.g,p.h]);
   if(jobId)await c.query('INSERT INTO paid_image_unlocks(wallet_id,job_id,full_edit) VALUES($1,$2,$3) ON CONFLICT(wallet_id,job_id) DO UPDATE SET full_edit=paid_image_unlocks.full_edit OR EXCLUDED.full_edit',[walletId,jobId,Boolean(p.fullEdit)]);
  }
  const w=await c.query('SELECT generation_remaining,hair_remaining FROM wallets WHERE id=$1',[walletId]);await c.query('COMMIT');
  return {duplicate:!ins.rowCount,...shape(walletId,w.rows[0]),...await imageEntitlements(walletId)};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}

export async function redeemPromo199(walletId,code){
  await ready();
  const normalized=String(code||'').trim().toUpperCase();
  const allowed199=new Set(['IDP199-A6SBEQ','IDP199-EAY269','IDP199-4V2QX2','IDP199-K8RXW7','IDP199-WCYMLZ','IDP199-WLU33M','IDP199-YHA846','IDP199-3V5ZAL','IDP199-AECYE9','IDP199-59B2ES']);
  const allowed149=new Set(['IDP149-5A6PMD','IDP149-P6Z39N','IDP149-4VHWWC','IDP149-32DV4Y','IDP149-PFNC4M','IDP149-YB3XQA','IDP149-SH2F7E','IDP149-UR77CT','IDP149-AMQMCT','IDP149-CSJAMQ']);
  const promoPackage=allowed149.has(normalized)?'149':(allowed199.has(normalized)?'199':null);
  if(!promoPackage)return {ok:false,reason:'invalid'};
  const promoGeneration=promoPackage==='149'?1:2;
  const promoHair=2;
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    await c.query('INSERT INTO wallets(id,credits,generation_remaining,hair_remaining) VALUES($1,0,0,0) ON CONFLICT(id) DO NOTHING',[walletId]);
    const ins=await c.query("INSERT INTO promo_redemptions(code,wallet_id,package_id) VALUES($1,$2,$3) ON CONFLICT(code) DO NOTHING RETURNING code",[normalized,walletId,promoPackage]);
    if(!ins.rowCount){await c.query('ROLLBACK');return {ok:false,reason:'used'}}
    await c.query('UPDATE wallets SET generation_remaining=generation_remaining+$2,hair_remaining=hair_remaining+$3 WHERE id=$1',[walletId,promoGeneration,promoHair]);
    const w=await c.query('SELECT generation_remaining,hair_remaining FROM wallets WHERE id=$1',[walletId]);
    await c.query('COMMIT');
    return {ok:true,...shape(walletId,w.rows[0])};
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}

export async function reserveCredit(walletId,kind){
 await ready();const c=await pool.connect();try{
  await c.query('BEGIN');const w=await c.query('SELECT generation_remaining,hair_remaining FROM wallets WHERE id=$1 FOR UPDATE',[walletId]);
  if(!w.rows[0]||remaining(w.rows[0])<1){await c.query('ROLLBACK');return null}
  const column=Number(w.rows[0].generation_remaining)>0?'generation_remaining':'hair_remaining';
  const id='use_'+crypto.randomBytes(18).toString('hex');await c.query(`UPDATE wallets SET ${column}=${column}-1 WHERE id=$1`,[walletId]);
  await c.query("INSERT INTO credit_usage(id,wallet_id,kind,status,credit_column) VALUES($1,$2,$3,'reserved',$4)",[id,walletId,kind,column]);
  const after=await c.query('SELECT generation_remaining,hair_remaining FROM wallets WHERE id=$1',[walletId]);await c.query('COMMIT');return {usageId:id,...shape(walletId,after.rows[0])};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export async function reserveTrialPreview(walletId,fingerprint,dailyLimit=30,networkFingerprint=null){
  await ready();
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(77149231)');
    const exists=await c.query("SELECT id,wallet_id,fingerprint FROM trial_previews WHERE (wallet_id=$1 OR fingerprint=$2) AND (created_at AT TIME ZONE 'Asia/Bangkok')::date=(now() AT TIME ZONE 'Asia/Bangkok')::date LIMIT 1",[walletId,fingerprint]);
    if(exists.rowCount){
      const previous=exists.rows[0];
      // Preserve a previous trial, replacing its old IP/browser hash with this
      // signed device identity. Never use a shared proxy IP to block other wallets.
      if(previous.wallet_id===walletId&&/^[a-f0-9]{64}$/.test(previous.fingerprint)&&String(fingerprint).startsWith('device_v1_')){
        const other=await c.query("SELECT id FROM trial_previews WHERE fingerprint=$1 AND (created_at AT TIME ZONE 'Asia/Bangkok')::date=(now() AT TIME ZONE 'Asia/Bangkok')::date LIMIT 1",[fingerprint]);
        if(!other.rowCount)await c.query('UPDATE trial_previews SET fingerprint=$2 WHERE id=$1',[previous.id,fingerprint]);
      }
      await c.query('COMMIT');
      return null;
    }
    const used=await c.query("SELECT count(*)::int AS n FROM trial_previews WHERE (created_at AT TIME ZONE 'Asia/Bangkok')::date=(now() AT TIME ZONE 'Asia/Bangkok')::date");
    if(Number(used.rows[0]?.n||0)>=dailyLimit){await c.query('ROLLBACK');return null}
    const id='trial_'+crypto.randomBytes(18).toString('hex');
    await c.query("INSERT INTO trial_previews(id,wallet_id,fingerprint,status) VALUES($1,$2,$3,'reserved')",[id,walletId,fingerprint]);
    if(networkFingerprint)await c.query("INSERT INTO trial_daily_devices(device_key,trial_day,trial_id) VALUES($1,(now() AT TIME ZONE 'Asia/Bangkok')::date,$2)",[networkFingerprint,id]);
    await c.query('COMMIT');
    return {usageId:id,trialPreview:true,generationRemaining:0,hairRemaining:0};
  }catch(e){await c.query('ROLLBACK');if(e?.code==='23505')return null;throw e}
  finally{c.release()}
}
export async function commitCredit(usageId){await ready();if(String(usageId||'').startsWith('trial_')){const r=await pool.query("UPDATE trial_previews SET status='completed',completed_at=now() WHERE id=$1 AND status='reserved' RETURNING id",[usageId]);return !!r.rowCount}const r=await pool.query("UPDATE credit_usage SET status='completed',completed_at=now() WHERE id=$1 AND status='reserved' RETURNING id",[usageId]);return !!r.rowCount}
export async function refundCredit(usageId){await ready();if(String(usageId||'').startsWith('trial_')){const r=await pool.query("DELETE FROM trial_previews WHERE id=$1 AND status='reserved' RETURNING id",[usageId]);return !!r.rowCount}const c=await pool.connect();try{await c.query('BEGIN');const u=await c.query("SELECT wallet_id,kind,status,credit_column FROM credit_usage WHERE id=$1 FOR UPDATE",[usageId]);if(!u.rows[0]||u.rows[0].status!=='reserved'){await c.query('ROLLBACK');return false}const col=u.rows[0].credit_column==='hair_remaining'?'hair_remaining':u.rows[0].credit_column==='generation_remaining'?'generation_remaining':u.rows[0].kind==='hairstyle'?'hair_remaining':'generation_remaining';await c.query(`UPDATE wallets SET ${col}=${col}+1 WHERE id=$1`,[u.rows[0].wallet_id]);await c.query("UPDATE credit_usage SET status='refunded',refunded_at=now() WHERE id=$1",[usageId]);await c.query('COMMIT');return true}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
export async function walletHistory(walletId){await ready();const {rows}=await pool.query(`SELECT session_id AS id,'purchase' AS type,package_id AS kind,(generation_qty+hair_qty) AS credits,created_at AS at FROM payments WHERE wallet_id=$1 UNION ALL SELECT id,CASE WHEN status='refunded' THEN 'refund' ELSE 'usage' END AS type,kind,CASE WHEN status='refunded' THEN 1 ELSE -1 END AS credits,COALESCE(refunded_at,completed_at,created_at) AS at FROM credit_usage WHERE wallet_id=$1 ORDER BY at DESC LIMIT 30`,[walletId]);return rows.map(r=>({...r,at:new Date(r.at).toISOString()}))}
