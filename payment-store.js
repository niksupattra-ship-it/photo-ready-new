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
  await pool.query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS full_edit_remaining integer NOT NULL DEFAULT 0`);
  await pool.query(`CREATE TABLE IF NOT EXISTS payments (session_id text PRIMARY KEY, wallet_id text NOT NULL REFERENCES wallets(id), credits integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS package_id text`);
  await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS generation_qty integer NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS hair_qty integer NOT NULL DEFAULT 0`);
  await pool.query(`CREATE TABLE IF NOT EXISTS credit_usage (id text PRIMARY KEY,wallet_id text NOT NULL REFERENCES wallets(id),kind text NOT NULL,status text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,refunded_at timestamptz)`);
  await pool.query(`ALTER TABLE credit_usage ADD COLUMN IF NOT EXISTS credit_column text`);
  await pool.query(`ALTER TABLE credit_usage ADD COLUMN IF NOT EXISTS full_edit_output boolean NOT NULL DEFAULT false`);
  await pool.query(`CREATE TABLE IF NOT EXISTS paid_image_unlocks (wallet_id text NOT NULL REFERENCES wallets(id),job_id text NOT NULL,full_edit boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(wallet_id,job_id))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS trial_previews (id text PRIMARY KEY,wallet_id text NOT NULL REFERENCES wallets(id),fingerprint text NOT NULL UNIQUE,status text NOT NULL CHECK(status IN ('reserved','completed')),created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS trial_daily_devices (device_key text NOT NULL,trial_day date NOT NULL,trial_id text NOT NULL REFERENCES trial_previews(id) ON DELETE CASCADE,PRIMARY KEY(device_key,trial_day))`);
  // Keep previous trials; two slots per device per Bangkok calendar day.
  await pool.query(`ALTER TABLE trial_previews DROP CONSTRAINT IF EXISTS trial_previews_fingerprint_key`);
  await pool.query(`ALTER TABLE trial_previews ADD COLUMN IF NOT EXISTS trial_slot integer NOT NULL DEFAULT 1`);
  await pool.query(`DROP INDEX IF EXISTS trial_previews_device_day_key`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS trial_previews_device_day_slot_key ON trial_previews (fingerprint, ((created_at AT TIME ZONE 'Asia/Bangkok')::date), trial_slot)`);
  await pool.query(`ALTER TABLE trial_daily_devices DROP CONSTRAINT IF EXISTS trial_daily_devices_pkey`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS trial_daily_devices_use_key ON trial_daily_devices(device_key,trial_day,trial_id)`);
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
   if(packageId==='79_v2')await c.query('UPDATE wallets SET full_edit_remaining=full_edit_remaining+1 WHERE id=$1',[walletId]);
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
  await c.query('BEGIN');const w=await c.query('SELECT generation_remaining,hair_remaining,full_edit_remaining FROM wallets WHERE id=$1 FOR UPDATE',[walletId]);
  if(!w.rows[0]||remaining(w.rows[0])<1){await c.query('ROLLBACK');return null}
  const fullEdit=Number(w.rows[0].full_edit_remaining)>0;
  const column=Number(w.rows[0].generation_remaining)>0?'generation_remaining':'hair_remaining';
  const id='use_'+crypto.randomBytes(18).toString('hex');await c.query(`UPDATE wallets SET ${column}=${column}-1 WHERE id=$1`,[walletId]);
  if(fullEdit)await c.query('UPDATE wallets SET full_edit_remaining=full_edit_remaining-1 WHERE id=$1',[walletId]);
  await c.query("INSERT INTO credit_usage(id,wallet_id,kind,status,credit_column,full_edit_output) VALUES($1,$2,$3,'reserved',$4,$5)",[id,walletId,kind,column,fullEdit]);
  const after=await c.query('SELECT generation_remaining,hair_remaining FROM wallets WHERE id=$1',[walletId]);await c.query('COMMIT');return {usageId:id,...shape(walletId,after.rows[0])};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export async function reserveTrialPreview(walletId,fingerprint,networkFingerprint=null){
  await ready();
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(77149231)');
    const purchasedToday=await c.query("SELECT 1 FROM payments WHERE wallet_id=$1 AND (created_at AT TIME ZONE 'Asia/Bangkok')::date=(now() AT TIME ZONE 'Asia/Bangkok')::date LIMIT 1",[walletId]);
    if(purchasedToday.rowCount){await c.query('COMMIT');return null}
    const used=await c.query("SELECT id,fingerprint,trial_slot FROM trial_previews WHERE (created_at AT TIME ZONE 'Asia/Bangkok')::date=(now() AT TIME ZONE 'Asia/Bangkok')::date AND (wallet_id=$1 OR fingerprint=$2 OR id IN (SELECT trial_id FROM trial_daily_devices WHERE device_key=$3 AND trial_day=(now() AT TIME ZONE 'Asia/Bangkok')::date))",[walletId,fingerprint,networkFingerprint]);
    if(used.rowCount>=2){await c.query('COMMIT');return null;}
    const slot=used.rows.some(r=>r.fingerprint===fingerprint&&r.trial_slot===1)?2:1;
    const id='trial_'+crypto.randomBytes(18).toString('hex');
    await c.query("INSERT INTO trial_previews(id,wallet_id,fingerprint,status,trial_slot) VALUES($1,$2,$3,'reserved',$4)",[id,walletId,fingerprint,slot]);
    if(networkFingerprint)await c.query("INSERT INTO trial_daily_devices(device_key,trial_day,trial_id) VALUES($1,(now() AT TIME ZONE 'Asia/Bangkok')::date,$2)",[networkFingerprint,id]);
    await c.query('COMMIT');
    return {usageId:id,trialPreview:true,trialRemaining:1-used.rowCount,generationRemaining:0,hairRemaining:0};
  }catch(e){await c.query('ROLLBACK');if(e?.code==='23505')return null;throw e}
  finally{c.release()}
}
export async function commitCredit(usageId){await ready();if(String(usageId||'').startsWith('trial_')){const r=await pool.query("UPDATE trial_previews SET status='completed',completed_at=now() WHERE id=$1 AND status='reserved' RETURNING id",[usageId]);return !!r.rowCount}const r=await pool.query("UPDATE credit_usage SET status='completed',completed_at=now() WHERE id=$1 AND status='reserved' RETURNING id",[usageId]);return !!r.rowCount}
export async function refundCredit(usageId){await ready();if(String(usageId||'').startsWith('trial_')){const r=await pool.query("DELETE FROM trial_previews WHERE id=$1 AND status='reserved' RETURNING id",[usageId]);return !!r.rowCount}const c=await pool.connect();try{await c.query('BEGIN');const u=await c.query("SELECT wallet_id,kind,status,credit_column,full_edit_output FROM credit_usage WHERE id=$1 FOR UPDATE",[usageId]);if(!u.rows[0]||u.rows[0].status!=='reserved'){await c.query('ROLLBACK');return false}const col=u.rows[0].credit_column==='hair_remaining'?'hair_remaining':u.rows[0].credit_column==='generation_remaining'?'generation_remaining':u.rows[0].kind==='hairstyle'?'hair_remaining':'generation_remaining';await c.query(`UPDATE wallets SET ${col}=${col}+1 WHERE id=$1`,[u.rows[0].wallet_id]);if(u.rows[0].full_edit_output)await c.query('UPDATE wallets SET full_edit_remaining=full_edit_remaining+1 WHERE id=$1',[u.rows[0].wallet_id]);await c.query("UPDATE credit_usage SET status='refunded',refunded_at=now() WHERE id=$1",[usageId]);await c.query('COMMIT');return true}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
export async function walletHistory(walletId){await ready();const {rows}=await pool.query(`SELECT session_id AS id,'purchase' AS type,package_id AS kind,(generation_qty+hair_qty) AS credits,created_at AS at FROM payments WHERE wallet_id=$1 UNION ALL SELECT id,CASE WHEN status='refunded' THEN 'refund' ELSE 'usage' END AS type,kind,CASE WHEN status='refunded' THEN 1 ELSE -1 END AS credits,COALESCE(refunded_at,completed_at,created_at) AS at FROM credit_usage WHERE wallet_id=$1 ORDER BY at DESC LIMIT 30`,[walletId]);return rows.map(r=>({...r,at:new Date(r.at).toISOString()}))}

export async function creditOutputFullEdit(id){await ready();const r=await pool.query("SELECT full_edit_output FROM credit_usage WHERE id=$1 AND status='completed'",[id]);return Boolean(r.rows[0]?.full_edit_output)}

// One global redemption per new promotional link, independent of browser/device.
const singleUsePromoPackages={"428d5aae2eeeefc8d86b5cb4d0a4bde55fe9bcccd89b66742d1b701827e09132": "79", "053067e34ce311a57498fef520f14afb1ff959111936f74eecae7a67dd98bbe0": "79", "62e479ac2c6f6164f935e4031c216e85ccfe6181b7370c9d49b5d4dc15566e3f": "79", "e2354a1fa636a4ac0f3df3c5bcfa5fc2b52710f8fefe2c214ebdbce9996ebae2": "79", "7457d4bce3b8d243e3688093b447e6781a1f16c8b0de595ce45483fd39fe52dc": "79", "a9abe2d74ab61e26567fdb64e8417014847dea7d91bc5ca7bb5376282efa813b": "79", "68b6fb3a5c5eb565f9aa2f4353f4f7b033338f4e3bc2092f5af54f547a802f17": "79", "85b69a0742cdd397d45666f684ae64193f1d291f5e3315b47da832db8ea66a8f": "79", "81745a592afea582a057184a80b9c5502b24efbfc23816b15e3e0ca8f17362e9": "79", "5b1077143ca0356e5064b103ccee39cce5cfee930d9714422247bd1d640f4115": "79", "3975451c8220d91db148f937431f72428d7d9d330de12a6173cfed7b00d5c014": "149", "d40b63511f14f1865cb47143a60e6e58fde26da9aeb01fa8f60a915564163fa0": "149", "8f301f2bdef4725568a3538c9407ac4d255b3d83c344d77202553038eaf3f1ad": "149", "6862fb80230195e3fc51ab99e4948c08ae2fd38bc33e7cd90fb3df32d0df4e0e": "149", "a37c1a3ea30e3f9fd4ce54bd663c12443a324f8b76b0c89e81a8a55316b38c46": "149", "9722be7d83f6744ac7fa3c2d1ad6be18eda46b19115148e1f03c1a6b6ae9e0a8": "149", "88e20acc923875e0fc9aeedc50477adf79e18b4545dcfa9b46150875bb9be00f": "149", "1cb1041b594f783d5ac6c05f740d7553a607ff062c4f5e82afa0f640c14488bc": "149", "43ed2b544cac6ff91b26a838b92a4c264ca960d2c54cd7814664b99a45a39a7b": "149", "baf7af17e8448f948899cbc6a5e4d48a8cda6ca01b1b6b314091afcde3438366": "149"};
// New 89-baht gifts always include one generation credit, even with a trial image.
Object.assign(singleUsePromoPackages,{"af21d633ab29b3349855bba4c6db6118f1d2df160b4d8bf523dde60fcfefef7f": "89_credit", "b981af9a559d53739360a67d1bec12b0327587f87e9c28a564c08e29fb520808": "89_credit", "61e4c23f40113765fd36605037914d7a8a17b20798d22faa997b5026842f2adf": "89_credit", "f763e78d4626df143d5adae7cb9087fc9e3368d75be308289eeb5a03831e20d0": "89_credit", "da0c2f4140e633c677d56f2388549391415bb79e9abee02b8c59d643426d3df1": "89_credit", "32d4066bd18d703da65a0e586c6d51135f431a27f656565708f0dcf3debd4e6b": "89_credit", "12b6d40ab4ced5ce69ccc46bd42a49ac95b476cd2c1362cb20479aca976d0636": "89_credit", "3202914e28c3a2143fad752d531bfb74b8c30b98698543a0ce5a83f8178bf0a6": "89_credit", "9451fcd788b297621f3b33ea77f5c1982c539c863c24f55ebdd3bc048d4dda79": "89_credit", "482cadd9f777294f864aa7482536e0406e724d3b7ec4e586e60524b66deff70f": "89_credit"});
export async function redeemPromoPackage(walletId,code,jobId=''){
 await ready();const key=crypto.createHash('sha256').update(String(code||'').trim().toUpperCase()).digest('hex');
 const offer=singleUsePromoPackages[key];if(!offer)return {ok:false,reason:'invalid'};
 const packageId=offer==='89_credit'?'79_v2':offer==='79'?(jobId?'79':'79_v2'):(jobId?'149_trial_v3':'149_v2');const p=packageFor(packageId);
 const c=await pool.connect();try{
  await c.query('BEGIN');
  await c.query('INSERT INTO wallets(id,credits,generation_remaining,hair_remaining) VALUES($1,0,0,0) ON CONFLICT(id) DO NOTHING',[walletId]);
  const ins=await c.query('INSERT INTO promo_redemptions(code,wallet_id,package_id) VALUES($1,$2,$3) ON CONFLICT(code) DO NOTHING RETURNING code',['promo_v2_'+key,walletId,packageId]);
  if(!ins.rowCount){await c.query('ROLLBACK');return {ok:false,reason:'used'}}
  await c.query('UPDATE wallets SET generation_remaining=generation_remaining+$2,hair_remaining=hair_remaining+$3,full_edit_remaining=full_edit_remaining+$4 WHERE id=$1',[walletId,p.g,p.h,packageId==='79_v2'?1:0]);
  if(jobId)await c.query('INSERT INTO paid_image_unlocks(wallet_id,job_id,full_edit) VALUES($1,$2,$3) ON CONFLICT(wallet_id,job_id) DO UPDATE SET full_edit=paid_image_unlocks.full_edit OR EXCLUDED.full_edit',[walletId,jobId,Boolean(p.fullEdit)]);
  const w=await c.query('SELECT generation_remaining,hair_remaining FROM wallets WHERE id=$1',[walletId]);await c.query('COMMIT');
  return {ok:true,packagePrice:packageFor(['79','89_credit'].includes(offer)?'79_v2':'149_v2').price,...shape(walletId,w.rows[0]),...await imageEntitlements(walletId)};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}

export async function trialOptionAccess(walletId,fingerprint,networkFingerprint){
 await ready();const paid=await pool.query('SELECT EXISTS(SELECT 1 FROM payments WHERE wallet_id=$1) OR EXISTS(SELECT 1 FROM promo_redemptions WHERE wallet_id=$1) AS purchased',[walletId]);
 if(!fingerprint)return {hasPurchased:Boolean(paid.rows[0]?.purchased),trialAvailable:false,trialRemaining:0};
 const used=await pool.query("SELECT count(*)::integer AS n FROM trial_previews WHERE (created_at AT TIME ZONE 'Asia/Bangkok')::date=(now() AT TIME ZONE 'Asia/Bangkok')::date AND (wallet_id=$1 OR fingerprint=$2 OR id IN (SELECT trial_id FROM trial_daily_devices WHERE device_key=$3 AND trial_day=(now() AT TIME ZONE 'Asia/Bangkok')::date))",[walletId,fingerprint,networkFingerprint]);
 const purchasedToday=await pool.query("SELECT 1 FROM payments WHERE wallet_id=$1 AND (created_at AT TIME ZONE 'Asia/Bangkok')::date=(now() AT TIME ZONE 'Asia/Bangkok')::date LIMIT 1",[walletId]);
 const trialRemaining=purchasedToday.rowCount?0:Math.max(0,2-Number(used.rows[0]?.n||0));
 return {hasPurchased:Boolean(paid.rows[0]?.purchased),trialAvailable:trialRemaining>0,trialRemaining};
}
