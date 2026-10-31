import crypto from 'crypto';
import pg from 'pg';
import {validateSavedProject} from './src/saved-project.js';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,ssl:process.env.DATABASE_URL?.includes('localhost')?false:{rejectUnauthorized:false}});
export const MAX_SAVED_WORKS=3;
export const SAVED_WORK_RETENTION_DAYS=45;
const RETENTION_VERSION='saved-work-45-v1';
const WORK_COLUMNS='id,name,updated_at,retention_started_at,expires_at,retention_policy_version';
const ACTIVE_WORK="(expires_at IS NULL OR expires_at > clock_timestamp())";
const expiredWork=()=>Object.assign(Error('งานนี้หมดอายุการจัดเก็บแล้ว กรุณาใช้ไฟล์รูปที่ดาวน์โหลดไว้ในอุปกรณ์'),{code:'saved_work_expired'});
const purchaseHash=key=>typeof key==='string'&&key?crypto.createHash('sha256').update(key).digest('hex'):null;
let init;
async function migrate(){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query("SET LOCAL statement_timeout='30s'");
  await client.query('SELECT pg_advisory_xact_lock(714269045)');
  await client.query('CREATE TABLE IF NOT EXISTS saved_studio_work(id text PRIMARY KEY,wallet_id text NOT NULL REFERENCES wallets(id),name text NOT NULL,project jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())');
  await client.query('ALTER TABLE saved_studio_work ADD COLUMN IF NOT EXISTS retention_started_at timestamptz,ADD COLUMN IF NOT EXISTS expires_at timestamptz,ADD COLUMN IF NOT EXISTS retention_policy_version text');
  await client.query('CREATE TABLE IF NOT EXISTS saved_studio_work_retention_policy(version text PRIMARY KEY,days integer NOT NULL,effective_at timestamptz NOT NULL DEFAULT clock_timestamp())');
  await client.query('INSERT INTO saved_studio_work_retention_policy(version,days) VALUES($1,$2) ON CONFLICT(version) DO NOTHING',[RETENTION_VERSION,SAVED_WORK_RETENTION_DAYS]);
  const policy=await client.query('SELECT days FROM saved_studio_work_retention_policy WHERE version=$1',[RETENTION_VERSION]);
  if(policy.rows[0]?.days!==SAVED_WORK_RETENTION_DAYS)throw Error('saved_work_retention_policy_mismatch');
  // Legacy work receives a full period from the single recorded activation time.
  await client.query("UPDATE saved_studio_work w SET retention_started_at=COALESCE(w.retention_started_at,p.effective_at),expires_at=COALESCE(w.expires_at,p.effective_at+interval '1080 hours'),retention_policy_version=COALESCE(w.retention_policy_version,p.version) FROM saved_studio_work_retention_policy p WHERE p.version=$1 AND (w.retention_started_at IS NULL OR w.expires_at IS NULL OR w.retention_policy_version IS NULL)",[RETENTION_VERSION]);
  // Defaults also cover old instances still accepting saves during a rolling deploy.
  await client.query("ALTER TABLE saved_studio_work ALTER COLUMN retention_started_at SET DEFAULT statement_timestamp(),ALTER COLUMN expires_at SET DEFAULT (statement_timestamp()+interval '1080 hours'),ALTER COLUMN retention_policy_version SET DEFAULT 'saved-work-45-v1'");
  await client.query('CREATE INDEX IF NOT EXISTS saved_studio_work_expiry_idx ON saved_studio_work(expires_at,id) WHERE expires_at IS NOT NULL');
  await client.query('CREATE INDEX IF NOT EXISTS saved_studio_work_wallet_updated_idx ON saved_studio_work(wallet_id,updated_at DESC)');
  // Retain only identifiers and a hashed purchase key, never images or project data.
  await client.query('CREATE TABLE IF NOT EXISTS saved_studio_work_expired(id text PRIMARY KEY,wallet_id text NOT NULL,expires_at timestamptz NOT NULL,purchase_key_hash text)');
  await client.query('CREATE INDEX IF NOT EXISTS saved_studio_work_expired_purchase_idx ON saved_studio_work_expired(wallet_id,purchase_key_hash) WHERE purchase_key_hash IS NOT NULL');
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
async function ready(){if(!init)init=migrate().catch(error=>{init=null;throw error});await init}
async function assertNotPurged(client,walletId,id,key){
 const hash=purchaseHash(key);if(!id&&!hash)return;
 const r=await client.query('SELECT id FROM saved_studio_work_expired WHERE wallet_id=$1 AND (($2::text IS NOT NULL AND id=$2) OR ($3::text IS NOT NULL AND purchase_key_hash=$3)) LIMIT 1',[walletId,id||null,hash]);
 if(r.rows[0])throw expiredWork();
}
async function duplicateWork(client,walletId,key){
 if(typeof key!=='string'||!key)return null;
 const r=await client.query(`SELECT ${WORK_COLUMNS},expires_at <= clock_timestamp() AS expired FROM saved_studio_work WHERE wallet_id=$1 AND project->>'purchaseKey'=$2 ORDER BY expires_at DESC NULLS FIRST LIMIT 1`,[walletId,key]);
 if(!r.rows[0]){await assertNotPurged(client,walletId,null,key);return null}
 const {expired,...work}=r.rows[0];if(expired)throw expiredWork();return work;
}
export async function getSavedWorkRetentionPolicy(){
 await ready();const r=await pool.query("SELECT version,days,effective_at,effective_at+interval '1080 hours' AS legacy_expires_at,clock_timestamp() AS server_now FROM saved_studio_work_retention_policy WHERE version=$1",[RETENTION_VERSION]);
 const p=r.rows[0];return {days:p.days,effectiveAt:p.effective_at,legacyExpiresAt:p.legacy_expires_at,version:p.version,serverNow:p.server_now};
}
export function validateProject(p){
 validateSavedProject(p);
 if(p?.format!=='idprom-studio'||p.version!==1||p.width!==900||p.height!==1200||!Array.isArray(p.layers)||!p.layers.length||p.layers.length>20)throw Error('invalid_project');
 const heads=p.layers.filter(l=>l.kind==='head'||l.name==='หัว · คอ · ผม'||l.kind==='source-photo');if(!heads.length||heads.some(l=>typeof l.jobId!=='string'||!l.jobId))throw Error('paid_image_required');
 for(const l of p.layers){if(typeof l.name!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(l.source)||![l.x,l.y,l.scale,l.rotation,l.opacity].every(Number.isFinite)||l.scale<.1||l.scale>5||l.opacity<0||l.opacity>1)throw Error('invalid_layer');for(const field of ['mask','warpSource','warpBaseMask'])if(l[field]&&!/^data:image\/(png|jpeg|webp);base64,/.test(l[field]))throw Error('invalid_layer')}
 if(p.compareSource&&!/^data:image\/(png|jpeg|webp);base64,/.test(p.compareSource))throw Error('invalid_original');
 if(p.placement&&(!['W','H','uX','uY','uW','uH'].every(k=>Number.isFinite(p.placement[k]))||p.placement.W<=0||p.placement.H<=0))throw Error('invalid_placement');
 return [...new Set(heads.map(l=>l.jobId))];
}
export async function saveWork(walletId,id,project){
 await ready();validateProject(project);const name='รูป IDพร้อม',client=await pool.connect();
 try{
  await client.query('BEGIN');
  // Keep the existing per-account lock for the three-work limit and purchase dedupe.
  await client.query('SELECT id FROM wallets WHERE id=$1 FOR UPDATE',[walletId]);
  if(id){
   const current=await client.query('SELECT id,expires_at <= clock_timestamp() AS expired FROM saved_studio_work WHERE id=$1 AND wallet_id=$2 FOR UPDATE',[id,walletId]);
   if(!current.rows[0]){await assertNotPurged(client,walletId,id,project.purchaseKey);await client.query('COMMIT');return null}
   if(current.rows[0].expired)throw expiredWork();
   const existing=await duplicateWork(client,walletId,project.purchaseKey);if(existing){await client.query('COMMIT');return existing}
   const r=await client.query(`UPDATE saved_studio_work SET project=$3::jsonb || CASE WHEN NOT ($3::jsonb ? 'purchaseKey') AND project ? 'purchaseKey' THEN jsonb_build_object('purchaseKey',project->'purchaseKey') ELSE '{}'::jsonb END,updated_at=clock_timestamp() WHERE id=$1 AND wallet_id=$2 AND ${ACTIVE_WORK} RETURNING ${WORK_COLUMNS}`,[id,walletId,project]);
   if(!r.rows[0])throw expiredWork();
   await client.query('COMMIT');return r.rows[0];
  }
  const existing=await duplicateWork(client,walletId,project.purchaseKey);if(existing){await client.query('COMMIT');return existing}
  const count=await client.query(`SELECT count(*)::int AS count FROM saved_studio_work WHERE wallet_id=$1 AND ${ACTIVE_WORK}`,[walletId]);
  if(count.rows[0].count>=MAX_SAVED_WORKS){const error=Error('บันทึกได้สูงสุด 3 งาน กรุณาลบงานเก่าก่อนเพิ่มงานใหม่');error.code='saved_work_limit';throw error}
  const r=await client.query(`WITH saved_at AS (SELECT clock_timestamp() AS at) INSERT INTO saved_studio_work(id,wallet_id,name,project,retention_started_at,expires_at,retention_policy_version) SELECT $1,$2,$3,$4,saved_at.at,saved_at.at+interval '1080 hours',$5 FROM saved_at RETURNING ${WORK_COLUMNS}`,['work_'+crypto.randomBytes(18).toString('hex'),walletId,name,project,RETENTION_VERSION]);
  await client.query('COMMIT');return r.rows[0];
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
export async function listWorks(walletId){await ready();const r=await pool.query(`SELECT ${WORK_COLUMNS} FROM saved_studio_work WHERE wallet_id=$1 AND ${ACTIVE_WORK} ORDER BY updated_at DESC`,[walletId]);return r.rows}
export async function getWork(walletId,id){
 await ready();const r=await pool.query(`SELECT ${WORK_COLUMNS},project,expires_at <= clock_timestamp() AS expired FROM saved_studio_work WHERE id=$1 AND wallet_id=$2`,[id,walletId]);
 if(!r.rows[0]){await assertNotPurged(pool,walletId,id,null);return null}
 const {expired,...work}=r.rows[0];if(expired)throw expiredWork();return work;
}
export async function deleteWork(walletId,id){
 await ready();const r=await pool.query(`DELETE FROM saved_studio_work WHERE id=$1 AND wallet_id=$2 AND ${ACTIVE_WORK} RETURNING id`,[id,walletId]);
 if(!r.rows[0]){await getWork(walletId,id);return null}return r.rows[0];
}
export async function purgeExpiredWorks({limit=100}={}){
 await ready();const batch=Math.min(500,Math.max(1,Math.trunc(Number(limit)||100)));
 const r=await pool.query(`WITH expired AS (
  SELECT id,wallet_id,expires_at,project->>'purchaseKey' AS purchase_key FROM saved_studio_work
  WHERE expires_at IS NOT NULL AND retention_started_at IS NOT NULL AND retention_policy_version=$1 AND expires_at <= statement_timestamp()
  ORDER BY expires_at,id FOR UPDATE SKIP LOCKED LIMIT $2
 ),remembered AS (
  INSERT INTO saved_studio_work_expired(id,wallet_id,expires_at,purchase_key_hash)
  SELECT id,wallet_id,expires_at,encode(sha256(convert_to(purchase_key,'UTF8')),'hex') FROM expired
  ON CONFLICT(id) DO UPDATE SET expires_at=LEAST(saved_studio_work_expired.expires_at,EXCLUDED.expires_at)
  RETURNING id
 ) DELETE FROM saved_studio_work w USING remembered r WHERE w.id=r.id RETURNING w.id`,[RETENTION_VERSION,batch]);
 return r.rowCount;
}
