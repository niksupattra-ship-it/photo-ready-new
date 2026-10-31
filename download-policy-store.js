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
   await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='30s'");
   await c.query('SELECT pg_advisory_xact_lock(714269046)');
   await c.query(`CREATE TABLE IF NOT EXISTS download_policy(version text PRIMARY KEY,activated_at timestamptz NOT NULL DEFAULT now())`);
   await c.query(`CREATE TABLE IF NOT EXISTS download_legacy_wallets(wallet_id text PRIMARY KEY)`);
   await c.query(`CREATE TABLE IF NOT EXISTS download_legacy_works(work_id text PRIMARY KEY,wallet_id text NOT NULL,job_ids text[] NOT NULL,source_hash text)`);
   await c.query(`CREATE TABLE IF NOT EXISTS download_works(id text PRIMARY KEY,wallet_id text NOT NULL,source_hash text NOT NULL,legacy_work_id text,created_at timestamptz NOT NULL DEFAULT now())`);
   await c.query('ALTER TABLE download_works ADD COLUMN IF NOT EXISTS original_source_hash text');
   await c.query('ALTER TABLE download_works ADD COLUMN IF NOT EXISTS canonical_image bytea,ADD COLUMN IF NOT EXISTS canonical_type text');
   await c.query(`CREATE TABLE IF NOT EXISTS download_work_jobs(job_id text PRIMARY KEY,work_id text NOT NULL REFERENCES download_works(id),wallet_id text NOT NULL)`);
   await c.query('CREATE INDEX IF NOT EXISTS download_work_jobs_work_idx ON download_work_jobs(work_id,wallet_id)');
   await c.query('CREATE TABLE IF NOT EXISTS download_suit_choices(wallet_id text NOT NULL,scope text NOT NULL,choices text[] NOT NULL DEFAULT ARRAY[]::text[],PRIMARY KEY(wallet_id,scope))');
   await c.query('CREATE TABLE IF NOT EXISTS premium_hair_unlocks(wallet_id text NOT NULL,job_id text NOT NULL,PRIMARY KEY(wallet_id,job_id))');
   const first=await c.query("INSERT INTO download_policy(version) VALUES('download-v1') ON CONFLICT DO NOTHING RETURNING version");
   if(first.rowCount){
    await c.query(`INSERT INTO download_legacy_wallets(wallet_id) SELECT id FROM wallets WHERE generation_remaining+hair_remaining>0 UNION SELECT wallet_id FROM payments UNION SELECT wallet_id FROM promo_redemptions UNION SELECT wallet_id FROM saved_studio_work ON CONFLICT DO NOTHING`);
    // An invalid historical original must not prevent every account from using
    // the policy. Keep its saved-work exemption, without fabricating image proof.
    await c.query(`INSERT INTO download_legacy_works(work_id,wallet_id,job_ids,source_hash) SELECT id,wallet_id,ARRAY(SELECT DISTINCT layer->>'jobId' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(project->'layers')='array' THEN project->'layers' ELSE '[]'::jsonb END) layer WHERE (layer->>'kind'='head' OR layer->>'name'='หัว · คอ · ผม') AND COALESCE(layer->>'jobId','')<>''),CASE WHEN project->>'compareSource' LIKE 'data:image/%;base64,%' AND split_part(project->>'compareSource',',',2) ~ '^[A-Za-z0-9+/]*={0,2}$' AND length(split_part(project->>'compareSource',',',2))%4=0 THEN encode(sha256(decode(split_part(project->>'compareSource',',',2),'base64')),'hex') ELSE NULL END FROM saved_studio_work ON CONFLICT DO NOTHING`);
   }
   // Freeze existing stored originals once, before upgraded clients can edit
   // them. Never use a later, client-editable saved project to rebind a work.
   await c.query('CREATE TABLE IF NOT EXISTS download_source_binding_migrations(version text PRIMARY KEY,activated_at timestamptz NOT NULL DEFAULT now())');
   const sourceBinding=await c.query("INSERT INTO download_source_binding_migrations(version) VALUES('original-input-v1') ON CONFLICT DO NOTHING RETURNING version");
   if(sourceBinding.rowCount)await c.query(`WITH saved_originals AS (
    SELECT wallet_id,project->>'downloadWorkId' AS work_id,CASE WHEN project->>'downloadSource' LIKE 'data:image/%;base64,%' AND split_part(project->>'downloadSource',',',2) ~ '^[A-Za-z0-9+/]*={0,2}$' AND length(split_part(project->>'downloadSource',',',2))%4=0 THEN encode(sha256(decode(split_part(project->>'downloadSource',',',2),'base64')),'hex') ELSE NULL END AS original_hash
    FROM saved_studio_work WHERE project->>'downloadWorkId' IS NOT NULL
   ),proven AS (
    SELECT wallet_id,work_id,min(original_hash) AS original_hash FROM saved_originals WHERE original_hash IS NOT NULL GROUP BY wallet_id,work_id HAVING count(DISTINCT original_hash)=1
   ) UPDATE download_works w SET original_source_hash=p.original_hash FROM proven p WHERE w.id=p.work_id AND w.wallet_id=p.wallet_id AND w.original_source_hash IS NULL`);
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
 const legacyGroup=async(wallet,job,db=pool)=>{
  const r=await db.query('SELECT 1 FROM download_work_jobs j JOIN download_works w ON w.id=j.work_id AND w.wallet_id=j.wallet_id JOIN download_legacy_works l ON l.work_id=w.legacy_work_id AND l.wallet_id=w.wallet_id WHERE j.job_id=$1 AND j.wallet_id=$2 LIMIT 1',[job,wallet]);
  return r.rowCount>0;
 };
 const oldPaid=async(wallet,ids,db=pool)=>{
  const r=await db.query("SELECT 1 FROM ai_jobs WHERE wallet_id=$1 AND id=ANY($2::text[]) AND status='completed' AND left(usage_id,4)='use_' LIMIT 1",[wallet,ids]);
  return r.rowCount>0;
 };
 const allowed=async(wallet,job,{savedWorkId='',db=pool}={})=>{
  await ready();const j=await ownedJob(wallet,job,db);
  if(String(j.usage_id).startsWith('use_')||await legacyAllows(wallet,savedWorkId,[job])||await legacyGroup(wallet,job,db))return true;
  const ids=await jobIds(wallet,job,db);
  const r=await db.query('SELECT job_id FROM paid_image_unlocks WHERE wallet_id=$1 AND job_id=ANY($2::text[]) LIMIT 1',[wallet,ids]);
  // Historical paid renders also cover later renders of the same owned work.
  return Boolean(r.rowCount||await oldPaid(wallet,ids,db));
 };
 const premiumHair=async(wallet,job,{db=pool}={})=>{await ready();await ownedJob(wallet,job,db);const ids=await jobIds(wallet,job,db);const q=await db.query('SELECT 1 FROM premium_hair_unlocks WHERE wallet_id=$1 AND job_id=ANY($2::text[]) LIMIT 1',[wallet,ids]);return q.rowCount>0};
 const premiumWork=async(wallet,work)=>{await ready();if(!work)return false;const q=await pool.query('SELECT 1 FROM download_work_jobs j JOIN download_works w ON w.id=j.work_id AND w.wallet_id=j.wallet_id JOIN premium_hair_unlocks p ON p.job_id=j.job_id AND p.wallet_id=j.wallet_id WHERE j.wallet_id=$1 AND j.work_id=$2 LIMIT 1',[wallet,work]);return q.rowCount>0};
 const allowedJobs=async(wallet,jobs)=>{
  const ids=[...new Set(jobs)];if(!ids.length)return false;await ready();
  // Saved projects can contain many heads. Read ownership and grouped rights in
  // one metadata query, without loading results or issuing one query per layer.
  const r=await pool.query(`SELECT j.id,j.status,(left(j.usage_id,4)='use_' OR l.work_id IS NOT NULL OR
   EXISTS(SELECT 1 FROM paid_image_unlocks p WHERE p.wallet_id=$1 AND (p.job_id=j.id OR p.job_id IN (SELECT peer.job_id FROM download_work_jobs peer WHERE peer.work_id=w.id AND peer.wallet_id=$1))) OR
   EXISTS(SELECT 1 FROM ai_jobs old WHERE old.wallet_id=$1 AND old.status='completed' AND left(old.usage_id,4)='use_' AND old.id IN (SELECT peer.job_id FROM download_work_jobs peer WHERE peer.work_id=w.id AND peer.wallet_id=$1))) AS unlocked
   FROM ai_jobs j LEFT JOIN download_work_jobs m ON m.job_id=j.id AND m.wallet_id=j.wallet_id
   LEFT JOIN download_works w ON w.id=m.work_id AND w.wallet_id=j.wallet_id
   LEFT JOIN download_legacy_works l ON l.work_id=w.legacy_work_id AND l.wallet_id=w.wallet_id
   WHERE j.wallet_id=$1 AND j.id=ANY($2::text[])`,[wallet,ids]);
  return r.rows.length===ids.length&&r.rows.every(row=>row.status==='completed'&&row.unlocked);
 };
 return {ready,ownedJob,jobIds,legacyAllows,allowed,allowedJobs,premiumHair,premiumWork,
  async scopeForJob(wallet,job){await ready();await ownedJob(wallet,job);const q=await pool.query('SELECT work_id FROM download_work_jobs WHERE wallet_id=$1 AND job_id=$2',[wallet,job]);return q.rows[0]?.work_id||'job:'+job},
  async suits(wallet,job,templates=[],savedWorkId=''){
   await ready();await ownedJob(wallet,job);
   if(!await allowed(wallet,job,{savedWorkId})||await legacyAllows(wallet,savedWorkId,[job])||await legacyGroup(wallet,job)||await oldPaid(wallet,await jobIds(wallet,job)))return {limited:false,choices:[]};
   const w=await pool.query('SELECT work_id FROM download_work_jobs WHERE job_id=$1 AND wallet_id=$2',[job,wallet]),scope=w.rows[0]?.work_id||job,c=await pool.connect();
   try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[wallet+':suits:'+scope]);
    // Read the owned work's current premium grant under the same transaction
    // that serializes its choices. Upgrades retain the existing chosen suits.
    const limit=await premiumHair(wallet,job,{db:c})?5:3;
    await c.query('INSERT INTO download_suit_choices(wallet_id,scope) VALUES($1,$2) ON CONFLICT DO NOTHING',[wallet,scope]);
    const q=await c.query('SELECT choices FROM download_suit_choices WHERE wallet_id=$1 AND scope=$2 FOR UPDATE',[wallet,scope]);const choices=q.rows[0].choices;
    for(const value of templates){if(!value)continue;if(typeof value!=='string'||value.length>500||!value.startsWith('/'))throw Object.assign(Error('ชุดไม่ถูกต้อง'),{status:400});if(!choices.includes(value)){if(choices.length>=limit)throw Object.assign(Error(`เลือกชุดครบ ${limit} ชุดแล้ว กรุณาเลือกชุดที่เคยเลือกไว้`),{status:409});choices.push(value)}}
    await c.query('UPDATE download_suit_choices SET choices=$3 WHERE wallet_id=$1 AND scope=$2',[wallet,scope,choices]);await c.query('COMMIT');return {limited:true,choices,limit};
   }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  },
  async isLegacySaved(wallet,id){await ready();const q=await pool.query('SELECT 1 FROM download_legacy_works WHERE wallet_id=$1 AND work_id=$2',[wallet,id]);return q.rowCount>0},
  async summary(wallet){await ready();const r=await pool.query('SELECT 1 FROM download_legacy_wallets WHERE wallet_id=$1',[wallet]);return {downloadPolicy:'download-v1',freeGeneration:true,canSave:r.rowCount>0}},
  async registerSource(wallet,job,image,imageType){
   await ready();const c=await pool.connect();
   try{
    await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['source:'+job]);
    await ownedJob(wallet,job,c);
    const existing=await c.query('SELECT work_id FROM download_work_jobs WHERE job_id=$1 AND wallet_id=$2',[job,wallet]);
    if(existing.rowCount){await c.query('COMMIT');return existing.rows[0].work_id}
    const id='dwork_'+crypto.randomBytes(18).toString('hex'),hash=crypto.createHash('sha256').update(image).digest('hex');
    await c.query('INSERT INTO download_works(id,wallet_id,source_hash,original_source_hash,canonical_image,canonical_type) VALUES($1,$2,$3,$3,$4,$5)',[id,wallet,hash,image,imageType]);
    await c.query('INSERT INTO download_work_jobs(job_id,work_id,wallet_id) VALUES($1,$2,$3)',[job,id,wallet]);
    await c.query('COMMIT');return id;
   }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
  },
  async beginWork(wallet,image,requested='',savedWorkId='',originalSource=null,{imageType='image/png',originalType='image/png'}={}){
   await ready();const hash=crypto.createHash('sha256').update(image).digest('hex');
   const originalHash=originalSource?.length?crypto.createHash('sha256').update(originalSource).digest('hex'):null;
   if(requested){
    const c=await pool.connect();try{
     await c.query('BEGIN');const r=await c.query('SELECT id,source_hash,original_source_hash,(canonical_image IS NOT NULL) AS has_canonical FROM download_works WHERE id=$1 AND wallet_id=$2 FOR UPDATE',[requested,wallet]),work=r.rows[0];
     // The raw upload is stable across optional leveling and browser encoders.
     // Old clients still prove the exact previously submitted input bytes.
     const matches=work&&(originalHash&&work.original_source_hash?originalHash===work.original_source_hash:hash===work.source_hash||Boolean(originalHash&&originalHash===work.source_hash));
     if(!matches)throw Object.assign(Error('ยังยืนยันต้นฉบับกับงานเดิมไม่ได้ · งานและสิทธิ์เดิมยังอยู่ กรุณาเปิดจากเบราว์เซอร์เดิมหรือติดต่อผู้ดูแล'),{status:409});
     if(originalHash&&!work.original_source_hash)await c.query('UPDATE download_works SET original_source_hash=$3 WHERE id=$1 AND wallet_id=$2 AND original_source_hash IS NULL',[requested,wallet,originalHash]);
     // Existing canonical proof can be pinned as-is. When only the frozen raw
     // original is proven, pin that actual original, never an unproven image
     // supplied beside it. Later requests cannot substitute another person.
     if(!work.has_canonical){const exact=hash===work.source_hash;await c.query('UPDATE download_works SET canonical_image=$3,canonical_type=$4 WHERE id=$1 AND wallet_id=$2 AND canonical_image IS NULL',[requested,wallet,exact?image:originalSource,exact?imageType:originalType]);}
     await c.query('COMMIT');return requested;
    }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
   }
   let legacy=null;if(savedWorkId){const saved=await pool.query('SELECT work_id FROM download_legacy_works WHERE work_id=$1 AND wallet_id=$2 AND source_hash=$3',[savedWorkId,wallet,hash]);if(saved.rowCount)legacy=savedWorkId;else throw Object.assign(Error('ต้นฉบับไม่ตรงกับงานที่บันทึก กรุณาเปิดงานเดิมอีกครั้ง'),{status:409})}
   const id='dwork_'+crypto.randomBytes(18).toString('hex');await pool.query('INSERT INTO download_works(id,wallet_id,source_hash,legacy_work_id,original_source_hash,canonical_image,canonical_type) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,wallet,hash,legacy,originalHash,image,imageType]);return id;
  },
  async inputForWork(wallet,work){await ready();const r=await pool.query('SELECT canonical_image,canonical_type FROM download_works WHERE id=$1 AND wallet_id=$2',[work,wallet]);const row=r.rows[0];if(!row?.canonical_image?.length)throw Object.assign(Error('ยังอ่านต้นฉบับของงานเดิมไม่ได้ กรุณาลองอีกครั้ง'),{status:409});return {buffer:Buffer.from(row.canonical_image),mimetype:row.canonical_type||'image/png'}},
  async attach(wallet,work,job){await ready();const r=await pool.query('INSERT INTO download_work_jobs(job_id,work_id,wallet_id) SELECT $1,w.id,w.wallet_id FROM download_works w JOIN ai_jobs j ON j.id=$1 AND j.wallet_id=w.wallet_id WHERE w.id=$2 AND w.wallet_id=$3 RETURNING job_id',[job,work,wallet]);if(!r.rowCount)throw Object.assign(Error('ไม่พบงานของบัญชีนี้'),{status:404})},
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


