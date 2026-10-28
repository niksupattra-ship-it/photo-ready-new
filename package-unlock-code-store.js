import crypto from 'node:crypto';

const failure=(code,status,message)=>Object.assign(Error(message),{code,status});
const invalidCode=()=>failure('package_code_invalid',400,'โค้ดไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง');
const usedCode=()=>failure('package_code_used',409,'โค้ดนี้ถูกใช้แล้ว');
const missingJob=()=>failure('image_not_owned',404,'ไม่พบรูปที่ประมวลผลสำเร็จของบัญชีนี้ กรุณาสร้างรูปก่อนใช้โค้ด');
const accountMismatch=()=>failure('verified_account_mismatch',403,'บัญชีเปลี่ยนแล้ว กรุณาเข้าสู่ระบบด้วยบัญชีเดิม');

export function normalizePackageUnlockCode(value){
 if(typeof value!=='string'||value.length>256)return '';
 const code=value.replace(/\s+/g,'').toUpperCase();
 return code.length>0&&code.length<=128&&/^[A-Z0-9-]+$/.test(code)?code:'';
}
export function hashPackageUnlockCode(value){
 const code=normalizePackageUnlockCode(value);
 return code?crypto.createHash('sha256').update(code).digest('hex'):'';
}

// Codes unlock a current work through the same paid-image grants as checkout.
// The finite code ledger stays separate from balances and payment receipts.
export function createPackageUnlockCodeStore(pool,{prepare=async()=>{},codes=[],allowed=async()=>false,premiumHair=async()=>false}={}){
 const catalog=new Map();
 for(const entry of codes){
  if(typeof entry?.codeHash!=='string'||!/^[a-f0-9]{64}$/.test(entry.codeHash)||!['89','159'].includes(entry.packageId))throw Error('invalid_package_unlock_code_config');
  const prior=catalog.get(entry.codeHash);
  if(prior&&prior!==entry.packageId)throw Error('conflicting_package_unlock_code_config');
  catalog.set(entry.codeHash,entry.packageId);
 }
 let initialized;
 const ready=()=>initialized||(initialized=(async()=>{
  await prepare();
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   await c.query("SET LOCAL lock_timeout='5s'");
   await c.query("SET LOCAL statement_timeout='30s'");
   await c.query('SELECT pg_advisory_xact_lock(714269049)');
   await c.query(`CREATE TABLE IF NOT EXISTS package_unlock_code_redemptions(
    code_hash text PRIMARY KEY CHECK(code_hash ~ '^[a-f0-9]{64}$'),
    package_id text NOT NULL CHECK(package_id IN ('89','159')),
    user_id text NOT NULL,wallet_id text NOT NULL REFERENCES wallets(id),
    work_scope text NOT NULL,job_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now())`);
   await c.query('CREATE INDEX IF NOT EXISTS package_unlock_code_redemptions_work_idx ON package_unlock_code_redemptions(wallet_id,work_scope)');
   await c.query('COMMIT');
  }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
 })().catch(error=>{initialized=null;throw error}));
 return {ready,
  async redeem(verifiedUser,value,jobId){
   const userId=verifiedUser?.id,wallet=verifiedUser?.wallet_id;
   if(typeof userId!=='string'||!userId||typeof wallet!=='string'||!wallet)throw accountMismatch();
   if(typeof jobId!=='string'||!jobId||jobId.length>200)throw missingJob();
   const codeHash=hashPackageUnlockCode(value),packageId=catalog.get(codeHash);
   if(!packageId)throw invalidCode();
   await ready();const c=await pool.connect();
   try{
    await c.query('BEGIN');
    await c.query("SET LOCAL lock_timeout='5s'");
    await c.query("SET LOCAL statement_timeout='30s'");
    const lock=await c.query('SELECT id FROM wallets WHERE id=$1 FOR UPDATE',[wallet]);
    if(!lock.rowCount)throw accountMismatch();
    // A request/session selects the candidate; current account ownership in the
    // database is authoritative, never a body email or wallet header.
    const account=await c.query('SELECT id,wallet_id FROM users WHERE id=$1 AND wallet_id=$2 FOR SHARE',[userId,wallet]);
    if(!account.rowCount)throw accountMismatch();
    const job=await c.query("SELECT id FROM ai_jobs WHERE id=$1 AND wallet_id=$2 AND status='completed' FOR SHARE",[jobId,wallet]);
    if(!job.rowCount)throw missingJob();
    const mapping=await c.query(`SELECT m.work_id,w.id AS owned_work_id FROM download_work_jobs m
     LEFT JOIN download_works w ON w.id=m.work_id AND w.wallet_id=m.wallet_id AND m.wallet_id=$2
     WHERE m.job_id=$1`,[jobId,wallet]);
    if(mapping.rowCount&&!mapping.rows[0].owned_work_id)throw missingJob();
    const workScope=mapping.rows[0]?.work_id||'job:'+jobId;
    const existing=await c.query('SELECT user_id,wallet_id,work_scope,package_id FROM package_unlock_code_redemptions WHERE code_hash=$1',[codeHash]);
    const sameRedemption=row=>row?.user_id===userId&&row.wallet_id===wallet&&row.work_scope===workScope&&row.package_id===packageId;
    const result=reused=>({ok:true,packageId,jobId,workScope,reused});
    if(existing.rowCount){
     if(!sameRedemption(existing.rows[0]))throw usedCode();
     await c.query('COMMIT');return result(true);
    }
    const equivalent=packageId==='159'?await premiumHair(wallet,jobId,{db:c}):await allowed(wallet,jobId,{db:c});
    if(equivalent)throw failure('image_already_unlocked',409,'งานนี้ปลดล็อกโปรนี้แล้ว โค้ดยังไม่ถูกใช้ เก็บไว้ใช้กับงานใหม่ได้');
    const inserted=await c.query(`INSERT INTO package_unlock_code_redemptions(code_hash,package_id,user_id,wallet_id,work_scope,job_id)
     VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(code_hash) DO NOTHING RETURNING code_hash`,[codeHash,packageId,userId,wallet,workScope,jobId]);
    if(!inserted.rowCount){
     const prior=await c.query('SELECT user_id,wallet_id,work_scope,package_id FROM package_unlock_code_redemptions WHERE code_hash=$1',[codeHash]);
     if(!sameRedemption(prior.rows[0]))throw usedCode();
     await c.query('COMMIT');return result(true);
    }
    await c.query(`INSERT INTO paid_image_unlocks(wallet_id,job_id,full_edit) VALUES($1,$2,true)
     ON CONFLICT(wallet_id,job_id) DO UPDATE SET full_edit=paid_image_unlocks.full_edit OR EXCLUDED.full_edit`,[wallet,jobId]);
    if(packageId==='159')await c.query('INSERT INTO premium_hair_unlocks(wallet_id,job_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[wallet,jobId]);
    await c.query('COMMIT');return result(false);
   }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
  }
 };
}
