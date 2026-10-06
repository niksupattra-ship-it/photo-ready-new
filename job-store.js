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
export async function completeAiJob(id,result){await ready();await pool.query(`UPDATE ai_jobs SET status='completed',result=$2,error=NULL,image='\\x'::bytea,mask=NULL,updated_at=now() WHERE id=$1`,[id,result])}
export async function failAiJob(id,error){await ready();await pool.query(`UPDATE ai_jobs SET status='failed',error=$2,image='\\x'::bytea,mask=NULL,updated_at=now() WHERE id=$1`,[id,String(error||'AI processing failed').slice(0,2000)])}
export async function getAiJob(id,walletId){await ready();const {rows}=await pool.query(`SELECT id,status,error,created_at,updated_at,(result IS NOT NULL) AS has_result FROM ai_jobs WHERE id=$1 AND wallet_id=$2`,[id,walletId]);return rows[0]||null}
export async function getAiJobResult(id,walletId){await ready();const {rows}=await pool.query(`SELECT status,result,error,usage_id FROM ai_jobs WHERE id=$1 AND wallet_id=$2`,[id,walletId]);return rows[0]||null}
export async function queuedAiJobs(){await ready();const {rows}=await pool.query(`UPDATE ai_jobs SET status='queued',updated_at=now() WHERE status='processing' AND updated_at < now()-interval '3 minutes' RETURNING id`);const q=await pool.query(`SELECT id FROM ai_jobs WHERE status='queued' ORDER BY created_at ASC LIMIT 20`);return q.rows.map(r=>r.id)}

export async function claimTrialImage(id,sourceWalletId,targetWalletId){await ready();const r=await pool.query("UPDATE ai_jobs SET wallet_id=$3,updated_at=now() WHERE id=$1 AND wallet_id=$2 AND status='completed' AND usage_id LIKE 'trial_%' RETURNING id",[id,sourceWalletId,targetWalletId]);return r.rowCount>0}
