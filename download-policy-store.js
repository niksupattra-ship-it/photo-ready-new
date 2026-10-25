import crypto from 'node:crypto';
import pg from 'pg';
import {getSavedWorkRetentionPolicy} from './saved-work-store.js';
// Credits stay in their original columns and ledger. Their new use is one
// download unlock per work; no balance rewrite or destructive migration.
export function createDownloadPolicy(pool,{prepareSavedWorks=async()=>{}}={}){
 let initialized;
 const ready=()=>initialized||(initialized=(async()=>{
  await prepareSavedWorks();
  const c=await pool.connect();try{
   await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");
   await c.query('SELECT pg_advisory_xact_lock(714269046)');
   await c.query(`CREATE TABLE IF NOT EXISTS download_policy(version text PRIMARY KEY,activated_at timestamptz NOT NULL DEFAULT now())`);
   await c.query(`CREATE TABLE IF NOT EXISTS download_legacy_wallets(wallet_id text PRIMARY KEY)`);
   await c.query(`CREATE TABLE IF NOT EXISTS download_legacy_works(work_id text PRIMARY KEY,wallet_id text NOT NULL,job_ids text[] NOT NULL,source_hash text)`);
   await c.query(`CREATE TABLE IF NOT EXISTS download_works(id text PRIMARY KEY,wallet_id text NOT NULL,source_hash text NOT NULL,legacy_work_id text,created_at timestamptz NOT NULL DEFAULT now())`);
   await c.query(`CREATE TABLE IF NOT EXISTS download_work_jobs(job_id text PRIMARY KEY,work_id text NOT NULL REFERENCES download_works(id),wallet_id text NOT NULL)`);
   await c.query('CREATE INDEX IF NOT EXISTS download_work_jobs_work_idx ON download_work_jobs(work_id,wallet_id)');
   await c.query('CREATE TABLE IF NOT EXISTS download_suit_choices(wallet_id text NOT NULL,scope text NOT NULL,choices text[] NOT NULL DEFAULT ARRAY[]::text[],PRIMARY KEY(wallet_id,scope))');
   const first=await c.query("INSERT INTO download_policy(version) VALUES('download-v1') ON CONFLICT DO NOTHING RETURNING version");
   if(first.rowCount){
    await c.query(`INSERT INTO download_legacy_wallets(wallet_id) SELECT id FROM wallets WHERE generation_remaining+hair_remaining>0 UNION SELECT wallet_id FROM payments UNION SELECT wallet_id FROM promo_redemptions UNION SELECT wallet_id FROM saved_studio_work ON CONFLICT DO NOTHING`);
    await c.query(`INSERT INTO download_legacy_works(work_id,wallet_id,job_ids,source_hash) SELECT id,wallet_id,ARRAY(SELECT DISTINCT layer->>'jobId' FROM jsonb_array_elements(project->'layers') layer WHERE (layer->>'kind'='head' OR layer->>'name'='หัว · คอ · ผม') AND COALESCE(layer->>'jobId','')<>''),CASE WHEN project->>'compareSource' LIKE 'data:image/%;base64,%' THEN encode(sha256(decode(split_part(project->>'compareSource',',',2),'base64')),'hex') ELSE NULL END FROM saved_studio_work ON CONFLICT DO NOTHING`);
   }
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 })().catch(e=>{initialized=null;throw e}));
 const ownedJob=async(wallet,job,db=pool)=>{
  const r=await db.query('SELECT id,status,usage_id FROM ai_jobs WHERE id=$1 AND wallet_id=$2',[job,wallet]);
  if(!r.rows[0]||r.rows[0].status!=='completed')throw Object.assign(Error('ไม่พบรูปที่ประมวลผลสำเร็จของบัญชีนี้'),{status:404});return r.rows[0];
 };
 const jobIds=async(wallet,job,db=pool)=>{
  const r=await db.query('SELECT work_id FROM download_work_jobs WHERE job_id=$1 AND wallet_id=$2',[job,wallet]);
  if(!r.rows[0])return [job];
  const ids=await db.query('SELECT job_id FROM download_work_jobs WHERE work_id=$1 AND wallet_id=$2',[r.rows[0].work_id,wallet]);return ids.rows.map(r=>r.job_id);
 };
 const legacyAllows=async(wallet,work,ids)=>{
  await ready();if(!work||!ids.length)return false;
  const r=await pool.query('SELECT job_ids FROM download_legacy_works WHERE work_id=$1 AND wallet_id=$2',[work,wallet]);
  return Boolean(r.rows[0]&&ids.every(id=>r.rows[0].job_ids.includes(id)));
 };
 const allowed=async(wallet,job,{savedWorkId='',db=pool}={})=>{
  await ready();const j=await ownedJob(wallet,job,db);
  if(await legacyAllows(wallet,savedWorkId,[job]))return true;
  if(savedWorkId){const inherited=await db.query('SELECT 1 FROM download_work_jobs j JOIN download_works w ON w.id=j.work_id WHERE j.job_id=$1 AND j.wallet_id=$2 AND w.legacy_work_id=$3',[job,wallet,savedWorkId]);if(inherited.rowCount)return true}
  const ids=await jobIds(wallet,job,db);
  const r=await db.query('SELECT job_id FROM paid_image_unlocks WHERE wallet_id=$1 AND job_id=ANY($2::text[]) LIMIT 1',[wallet,ids]);
  // Old paid renders remain paid; free_ renders never inherit this shortcut.
  return Boolean(r.rowCount||String(j.usage_id).startsWith('use_'));
 };
 return {ready,ownedJob,jobIds,legacyAllows,allowed,
  async suits(wallet,job,templates=[],savedWorkId=''){
   await ready();await ownedJob(wallet,job);
   if(!await allowed(wallet,job,{savedWorkId})||await legacyAllows(wallet,savedWorkId,[job]))return {limited:false,choices:[]};
   const w=await pool.query('SELECT work_id FROM download_work_jobs WHERE job_id=$1 AND wallet_id=$2',[job,wallet]),scope=w.rows[0]?.work_id||job,c=await pool.connect();
   try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[wallet+':suits:'+scope]);
    await c.query('INSERT INTO download_suit_choices(wallet_id,scope) VALUES($1,$2) ON CONFLICT DO NOTHING',[wallet,scope]);
    const q=await c.query('SELECT choices FROM download_suit_choices WHERE wallet_id=$1 AND scope=$2 FOR UPDATE',[wallet,scope]);const choices=q.rows[0].choices;
    for(const value of templates){if(!value)continue;if(typeof value!=='string'||value.length>500||!value.startsWith('/'))throw Object.assign(Error('ชุดไม่ถูกต้อง'),{status:400});if(!choices.includes(value)){if(choices.length>=3)throw Object.assign(Error('เลือกชุดครบ 3 ชุดแล้ว กรุณาเลือกชุดที่เคยเลือกไว้'),{status:409});choices.push(value)}}
    await c.query('UPDATE download_suit_choices SET choices=$3 WHERE wallet_id=$1 AND scope=$2',[wallet,scope,choices]);await c.query('COMMIT');return {limited:true,choices,limit:3};
   }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  },
  async isLegacySaved(wallet,id){await ready();const q=await pool.query('SELECT 1 FROM download_legacy_works WHERE wallet_id=$1 AND work_id=$2',[wallet,id]);return q.rowCount>0},
  async summary(wallet){await ready();const r=await pool.query('SELECT 1 FROM download_legacy_wallets WHERE wallet_id=$1',[wallet]);return {downloadPolicy:'download-v1',freeGeneration:true,canSave:r.rowCount>0}},
  async beginWork(wallet,image,requested='',savedWorkId=''){
   await ready();const hash=crypto.createHash('sha256').update(image).digest('hex');
   if(requested){const r=await pool.query('SELECT id FROM download_works WHERE id=$1 AND wallet_id=$2 AND source_hash=$3',[requested,wallet,hash]);if(!r.rows[0])throw Object.assign(Error('รูปต้นฉบับไม่ตรงกับงานเดิม กรุณาเริ่มงานใหม่'),{status:409});return requested}
   let legacy=null;if(savedWorkId){const saved=await pool.query('SELECT work_id FROM download_legacy_works WHERE work_id=$1 AND wallet_id=$2 AND source_hash=$3',[savedWorkId,wallet,hash]);if(saved.rowCount)legacy=savedWorkId;else throw Object.assign(Error('ต้นฉบับไม่ตรงกับงานที่บันทึก กรุณาเปิดงานเดิมอีกครั้ง'),{status:409})}
   const id='dwork_'+crypto.randomBytes(18).toString('hex');await pool.query('INSERT INTO download_works(id,wallet_id,source_hash,legacy_work_id) VALUES($1,$2,$3,$4)',[id,wallet,hash,legacy]);return id;
  },
  async attach(wallet,work,job){await ready();await pool.query('INSERT INTO download_work_jobs(job_id,work_id,wallet_id) VALUES($1,$2,$3)',[job,work,wallet])},
  async claim(source,target,job){
   await ready();const ids=await jobIds(source,job),c=await pool.connect();try{
    await c.query('BEGIN');
    await c.query('UPDATE ai_jobs SET wallet_id=$3 WHERE wallet_id=$1 AND id=ANY($2::text[]) AND usage_id LIKE \'free_%\'',[source,ids,target]);
    await c.query('UPDATE download_works SET wallet_id=$3 WHERE wallet_id=$1 AND id IN (SELECT work_id FROM download_work_jobs WHERE job_id=$2)',[source,job,target]);
    await c.query('UPDATE download_work_jobs SET wallet_id=$3 WHERE wallet_id=$1 AND job_id=ANY($2::text[])',[source,ids,target]);await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  },
  async redeem(wallet,job){
   await ready();const c=await pool.connect();try{
    await c.query('BEGIN');const w=await c.query('SELECT generation_remaining,hair_remaining FROM wallets WHERE id=$1 FOR UPDATE',[wallet]);
    await ownedJob(wallet,job,c);
    if(await allowed(wallet,job,{db:c})){await c.query('COMMIT');return {ok:true,reused:true}}
    const row=w.rows[0];if(!row||Number(row.generation_remaining)+Number(row.hair_remaining)<1){await c.query('ROLLBACK');return {ok:false,error:'download_credit_required'}}
    const col=Number(row.generation_remaining)>0?'generation_remaining':'hair_remaining';
    await c.query(`UPDATE wallets SET ${col}=${col}-1 WHERE id=$1`,[wallet]);
    await c.query("INSERT INTO credit_usage(id,wallet_id,kind,status,credit_column,full_edit_output,completed_at) VALUES($1,$2,'download','completed',$3,true,now())",['download_'+crypto.randomBytes(18).toString('hex'),wallet,col]);
    await c.query('INSERT INTO paid_image_unlocks(wallet_id,job_id,full_edit) VALUES($1,$2,true) ON CONFLICT(wallet_id,job_id) DO UPDATE SET full_edit=true',[wallet,job]);
    await c.query('COMMIT');return {ok:true,reused:false};
   }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  }
 };
}
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,ssl:process.env.DATABASE_URL?.includes('localhost')?false:{rejectUnauthorized:false}});
export const downloadPolicy=createDownloadPolicy(pool,{prepareSavedWorks:getSavedWorkRetentionPolicy});

