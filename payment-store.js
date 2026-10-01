import crypto from 'crypto';
import pg from 'pg';
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
  await pool.query(`CREATE TABLE IF NOT EXISTS trial_previews (id text PRIMARY KEY,wallet_id text NOT NULL REFERENCES wallets(id),fingerprint text NOT NULL UNIQUE,status text NOT NULL CHECK(status IN ('reserved','completed')),created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz)`);
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
function shape(id,row){return {walletId:id,generationRemaining:Number(row?.generation_remaining||0),hairRemaining:Number(row?.hair_remaining||0)}}
export async function newWallet(){await ready();const id='wal_'+crypto.randomBytes(24).toString('hex');await pool.query('INSERT INTO wallets(id,credits,generation_remaining,hair_remaining) VALUES($1,0,0,0)',[id]);return shape(id,{})}
export async function getWallet(id){if(!id)return null;await ready();const {rows}=await pool.query('SELECT generation_remaining,hair_remaining FROM wallets WHERE id=$1',[id]);return rows[0]?shape(id,rows[0]):null}
export async function ensureWallet(id){await ready();await pool.query('INSERT INTO wallets(id,credits,generation_remaining,hair_remaining) VALUES($1,0,0,0) ON CONFLICT(id) DO NOTHING',[id]);return getWallet(id)}
export async function creditPaid(walletId,sessionId,packageId='149'){await ready();const packs={'149':{g:1,h:2},'199':{g:2,h:3}};const p=packs[String(packageId)]||packs['149'];const c=await pool.connect();try{await c.query('BEGIN');await c.query('INSERT INTO wallets(id,credits,generation_remaining,hair_remaining) VALUES($1,0,0,0) ON CONFLICT(id) DO NOTHING',[walletId]);const ins=await c.query('INSERT INTO payments(session_id,wallet_id,credits,package_id,generation_qty,hair_qty) VALUES($1,$2,0,$3,$4,$5) ON CONFLICT(session_id) DO NOTHING RETURNING session_id',[sessionId,walletId,String(packageId),p.g,p.h]);if(ins.rowCount)await c.query('UPDATE wallets SET generation_remaining=generation_remaining+$2,hair_remaining=hair_remaining+$3 WHERE id=$1',[walletId,p.g,p.h]);const w=await c.query('SELECT generation_remaining,hair_remaining FROM wallets WHERE id=$1',[walletId]);await c.query('COMMIT');return {duplicate:!ins.rowCount,...shape(walletId,w.rows[0])}}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}

export async function redeemPromo199(walletId,code){
  await ready();
  const normalized=String(code||'').trim().toUpperCase();
  const allowed=new Set(['IDP199-LYHB7V','IDP199-HZ2ZV4','IDP199-HHU8QS','IDP199-MF7TKJ','IDP199-YYPEET']);
  if(!allowed.has(normalized))return {ok:false,reason:'invalid'};
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    await c.query('INSERT INTO wallets(id,credits,generation_remaining,hair_remaining) VALUES($1,0,0,0) ON CONFLICT(id) DO NOTHING',[walletId]);
    const alreadyWallet=await c.query('SELECT code FROM promo_redemptions WHERE wallet_id=$1 LIMIT 1',[walletId]);
    if(alreadyWallet.rowCount){await c.query('ROLLBACK');return {ok:false,reason:'wallet_used'}}
    const ins=await c.query("INSERT INTO promo_redemptions(code,wallet_id,package_id) VALUES($1,$2,'199') ON CONFLICT(code) DO NOTHING RETURNING code",[normalized,walletId]);
    if(!ins.rowCount){await c.query('ROLLBACK');return {ok:false,reason:'used'}}
    await c.query('UPDATE wallets SET generation_remaining=generation_remaining+2,hair_remaining=hair_remaining+2 WHERE id=$1',[walletId]);
    const w=await c.query('SELECT generation_remaining,hair_remaining FROM wallets WHERE id=$1',[walletId]);
    await c.query('COMMIT');
    return {ok:true,...shape(walletId,w.rows[0])};
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}

export async function reserveCredit(walletId,kind){await ready();const column=kind==='hairstyle'?'hair_remaining':'generation_remaining';const c=await pool.connect();try{await c.query('BEGIN');const w=await c.query(`SELECT ${column},generation_remaining,hair_remaining FROM wallets WHERE id=$1 FOR UPDATE`,[walletId]);if(!w.rows[0]||Number(w.rows[0][column])<1){await c.query('ROLLBACK');return null}const id='use_'+crypto.randomBytes(18).toString('hex');await c.query(`UPDATE wallets SET ${column}=${column}-1 WHERE id=$1`,[walletId]);await c.query('INSERT INTO credit_usage(id,wallet_id,kind,status) VALUES($1,$2,$3,\'reserved\')',[id,walletId,kind]);const after=await c.query('SELECT generation_remaining,hair_remaining FROM wallets WHERE id=$1',[walletId]);await c.query('COMMIT');return {usageId:id,...shape(walletId,after.rows[0])}}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
export async function reserveTrialPreview(walletId,fingerprint,dailyLimit=30){await ready();const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(77149231)');const used=await c.query("SELECT count(*)::int AS n FROM trial_previews WHERE created_at>=date_trunc('day',now())");if(Number(used.rows[0]?.n||0)>=dailyLimit){await c.query('ROLLBACK');return null}const exists=await c.query('SELECT id FROM trial_previews WHERE wallet_id=$1 OR fingerprint=$2 LIMIT 1',[walletId,fingerprint]);if(exists.rowCount){await c.query('ROLLBACK');return null}const id='trial_'+crypto.randomBytes(18).toString('hex');await c.query("INSERT INTO trial_previews(id,wallet_id,fingerprint,status) VALUES($1,$2,$3,'reserved')",[id,walletId,fingerprint]);await c.query('COMMIT');return {usageId:id,trialPreview:true,generationRemaining:0,hairRemaining:0}}catch(e){await c.query('ROLLBACK');if(e?.code==='23505')return null;throw e}finally{c.release()}}
export async function commitCredit(usageId){await ready();if(String(usageId||'').startsWith('trial_')){const r=await pool.query("UPDATE trial_previews SET status='completed',completed_at=now() WHERE id=$1 AND status='reserved' RETURNING id",[usageId]);return !!r.rowCount}const r=await pool.query("UPDATE credit_usage SET status='completed',completed_at=now() WHERE id=$1 AND status='reserved' RETURNING id",[usageId]);return !!r.rowCount}
export async function refundCredit(usageId){await ready();if(String(usageId||'').startsWith('trial_')){const r=await pool.query("DELETE FROM trial_previews WHERE id=$1 AND status='reserved' RETURNING id",[usageId]);return !!r.rowCount}const c=await pool.connect();try{await c.query('BEGIN');const u=await c.query("SELECT wallet_id,kind,status FROM credit_usage WHERE id=$1 FOR UPDATE",[usageId]);if(!u.rows[0]||u.rows[0].status!=='reserved'){await c.query('ROLLBACK');return false}const col=u.rows[0].kind==='hairstyle'?'hair_remaining':'generation_remaining';await c.query(`UPDATE wallets SET ${col}=${col}+1 WHERE id=$1`,[u.rows[0].wallet_id]);await c.query("UPDATE credit_usage SET status='refunded',refunded_at=now() WHERE id=$1",[usageId]);await c.query('COMMIT');return true}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
export async function walletHistory(walletId){await ready();const {rows}=await pool.query(`SELECT session_id AS id,'purchase' AS type,package_id AS kind,(generation_qty+hair_qty) AS credits,created_at AS at FROM payments WHERE wallet_id=$1 UNION ALL SELECT id,CASE WHEN status='refunded' THEN 'refund' ELSE 'usage' END AS type,kind,CASE WHEN status='refunded' THEN 1 ELSE -1 END AS credits,COALESCE(refunded_at,completed_at,created_at) AS at FROM credit_usage WHERE wallet_id=$1 ORDER BY at DESC LIMIT 30`,[walletId]);return rows.map(r=>({...r,at:new Date(r.at).toISOString()}))}
