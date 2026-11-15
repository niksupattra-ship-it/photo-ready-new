import crypto from 'node:crypto';
export const PURCHASED_PHOTO_DAYS=7;
export function createPurchasedPhotoStore(pool){
 let pending;
 const ready=()=>pending||(pending=(async()=>{
  await pool.query(`CREATE TABLE IF NOT EXISTS purchased_photo_files (
   id text PRIMARY KEY,wallet_id text NOT NULL,work_scope text NOT NULL,job_ids text[] NOT NULL,
   image_hash text NOT NULL,token text NOT NULL UNIQUE,package_id text NOT NULL,
   image bytea,preview bytea,width integer NOT NULL,height integer NOT NULL,
   purchased_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
   UNIQUE(wallet_id,work_scope,image_hash))`);
  await pool.query('ALTER TABLE purchased_photo_files ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()');
  await pool.query('ALTER TABLE purchased_photo_files ADD COLUMN IF NOT EXISTS editor_project jsonb');
  await pool.query('CREATE INDEX IF NOT EXISTS purchased_photo_expiry_idx ON purchased_photo_files(expires_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS purchased_photo_wallet_idx ON purchased_photo_files(wallet_id,created_at DESC)');
 })().catch(e=>{pending=null;throw e}));
 const metadata='id,work_scope,job_ids,token,package_id,width,height,purchased_at,created_at,updated_at,expires_at';
 return {ready,
  async put({walletId,scope,jobIds,lineage=jobIds,packageId,image,preview,width,height}){
   await ready();const hash=crypto.createHash('sha256').update(image).digest('hex');
   // Freeze the expiry to the first paid right, including later edits of a work.
   const row=await pool.query(`WITH paid AS (
    SELECT COALESCE(min(created_at),clock_timestamp()) AS at FROM paid_image_unlocks WHERE wallet_id=$1 AND job_id=ANY($4::text[])
   ),started AS (
    SELECT LEAST(paid.at,COALESCE((SELECT min(purchased_at) FROM purchased_photo_files WHERE wallet_id=$1 AND work_scope=$2),paid.at)) AS at FROM paid
   ) INSERT INTO purchased_photo_files(id,wallet_id,work_scope,job_ids,image_hash,token,package_id,image,preview,width,height,purchased_at,expires_at)
   SELECT $5,$1,$2,$3,$6,$7,$8,$9,$10,$11,$12,at,at+interval '7 days' FROM started WHERE at+interval '7 days'>clock_timestamp()
   ON CONFLICT(wallet_id,work_scope,image_hash) DO UPDATE SET image=EXCLUDED.image,preview=EXCLUDED.preview,updated_at=clock_timestamp()
   WHERE purchased_photo_files.expires_at>clock_timestamp() RETURNING ${metadata}`,
   [walletId,scope,jobIds,lineage,'photo_'+crypto.randomBytes(18).toString('hex'),hash,crypto.randomBytes(32).toString('hex'),packageId,image,preview,width,height]);
   if(!row.rows[0])throw Object.assign(Error('งานนี้พ้นระยะเก็บรูป 7 วันแล้ว ยังบันทึกไฟล์ที่เปิดอยู่ในหน้านี้ได้'),{status:410,code:'photo_expired'});
   return row.rows[0];
  },
  async list(walletId){await ready();return (await pool.query(`SELECT * FROM (SELECT DISTINCT ON(work_scope) ${metadata},(editor_project IS NOT NULL) AS editor_project_stored FROM purchased_photo_files WHERE wallet_id=$1 AND expires_at>clock_timestamp() AND image IS NOT NULL ORDER BY work_scope,updated_at DESC,created_at DESC,id DESC) AS works ORDER BY updated_at DESC,created_at DESC LIMIT 100`,[walletId])).rows},
  async owned(walletId,id){await ready();return (await pool.query(`SELECT ${metadata},image,preview,editor_project,(expires_at<=clock_timestamp()) AS expired FROM purchased_photo_files WHERE wallet_id=$1 AND id=$2`,[walletId,id])).rows[0]||null},
  // Editing only needs its project and access metadata. Avoid transferring the
  // full-resolution delivery image and preview from PostgreSQL on every open.
  async ownedEditor(walletId,id){await ready();return (await pool.query(`SELECT ${metadata},editor_project,(image IS NOT NULL) AS has_image,(expires_at<=clock_timestamp()) AS expired FROM purchased_photo_files WHERE wallet_id=$1 AND id=$2`,[walletId,id])).rows[0]||null},
  async storeEditor(walletId,id,project){await ready();const r=await pool.query("UPDATE purchased_photo_files SET editor_project=$3::jsonb,updated_at=clock_timestamp() WHERE wallet_id=$1 AND id=$2 AND image IS NOT NULL AND expires_at>clock_timestamp() RETURNING id,updated_at",[walletId,id,JSON.stringify(project)]);return r.rows[0]||null},
  async byToken(token){await ready();return (await pool.query(`SELECT ${metadata},wallet_id,image,preview,(expires_at<=clock_timestamp()) AS expired FROM purchased_photo_files WHERE token=$1`,[token])).rows[0]||null},
  async purge(){await ready();return (await pool.query('UPDATE purchased_photo_files SET image=NULL,preview=NULL,editor_project=NULL WHERE expires_at<=clock_timestamp() AND (image IS NOT NULL OR preview IS NOT NULL OR editor_project IS NOT NULL)')).rowCount},
 };
}
