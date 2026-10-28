import crypto from 'node:crypto';

const normalizeEmail=email=>String(email||'').trim().toLowerCase();
export const recipientHashForEmail=email=>crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex');
const forbidden=()=>Object.assign(Error('verified_account_mismatch'),{status:403});
const missingJob=()=>Object.assign(Error('ไม่พบรูปที่ประมวลผลสำเร็จของบัญชีนี้'),{status:404});

// These grants are download entitlements, independent of generation counters,
// purchases, saving exemptions and the owner's private access policy.
export function createPremiumDownloadCredits(pool,{prepare=async()=>{},batches=[],allowed=async()=>false,premiumHair=async()=>false}={}){
 const unique=new Map();
 for(const batch of batches){
  const batchId=String(batch?.batchId||''),recipientHash=String(batch?.recipientHash||'').toLowerCase(),quantity=batch?.quantity;
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(batchId)||!/^[a-f0-9]{64}$/.test(recipientHash)||!Number.isSafeInteger(quantity)||quantity<1||quantity>1000)throw Error('invalid_premium_download_batch');
  const key=batchId+':'+recipientHash,prior=unique.get(key);
  if(prior&&prior.quantity!==quantity)throw Error('conflicting_premium_download_batch');
  unique.set(key,Object.freeze({batchId,recipientHash,quantity}));
 }
 const trustedBatches=[...unique.values()];
 let initialized;
 const ready=()=>initialized||(initialized=(async()=>{
  await prepare();
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   await c.query("SET LOCAL lock_timeout='5s'");
   await c.query("SET LOCAL statement_timeout='30s'");
   await c.query('SELECT pg_advisory_xact_lock(714269048)');
   await c.query(`CREATE TABLE IF NOT EXISTS premium_download_grants(
    batch_id text NOT NULL,recipient_hash text NOT NULL,user_id text NOT NULL,
    wallet_id text NOT NULL REFERENCES wallets(id),quantity integer NOT NULL CHECK(quantity>0),
    created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(batch_id,recipient_hash))`);
   await c.query('CREATE INDEX IF NOT EXISTS premium_download_grants_wallet_idx ON premium_download_grants(wallet_id)');
   await c.query(`CREATE TABLE IF NOT EXISTS premium_download_redemptions(
    wallet_id text NOT NULL REFERENCES wallets(id),work_scope text NOT NULL,job_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(wallet_id,work_scope))`);
   await c.query('COMMIT');
  }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
 })().catch(error=>{initialized=null;throw error}));
 const remaining=async(wallet,db=pool)=>{
  const q=await db.query(`SELECT GREATEST(0,
   (SELECT COALESCE(SUM(quantity),0) FROM premium_download_grants WHERE wallet_id=$1)-
   (SELECT COUNT(*) FROM premium_download_redemptions WHERE wallet_id=$1)) AS remaining`,[wallet]);
  return Number(q.rows[0]?.remaining||0);
 };
 return {ready,
  async activateForAccount(verifiedUser){
   const id=verifiedUser?.id,wallet=verifiedUser?.wallet_id,email=normalizeEmail(verifiedUser?.email);
   if(typeof id!=='string'||!id||typeof wallet!=='string'||!wallet||!email)return {granted:0};
   const recipientHash=recipientHashForEmail(email),eligible=trustedBatches.filter(batch=>batch.recipientHash===recipientHash);
   if(!eligible.length)return {granted:0};
   await ready();const c=await pool.connect();
   try{
    await c.query('BEGIN');
    const lock=await c.query('SELECT id FROM wallets WHERE id=$1 FOR UPDATE',[wallet]);
    if(!lock.rowCount)throw forbidden();
    // The session object selects a candidate; the current database account is
    // authoritative. Body emails and wallet headers cannot activate a grant.
    const q=await c.query('SELECT id,email,wallet_id FROM users WHERE id=$1 AND wallet_id=$2 FOR SHARE',[id,wallet]);
    const account=q.rows[0];
    if(!account||normalizeEmail(account.email)!==email||recipientHashForEmail(account.email)!==recipientHash)throw forbidden();
    let granted=0;
    for(const batch of eligible){
     const inserted=await c.query(`INSERT INTO premium_download_grants(batch_id,recipient_hash,user_id,wallet_id,quantity)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(batch_id,recipient_hash) DO NOTHING RETURNING quantity`,[batch.batchId,recipientHash,id,wallet,batch.quantity]);
     if(inserted.rowCount)granted+=batch.quantity;
     else{
      const prior=await c.query('SELECT user_id,wallet_id FROM premium_download_grants WHERE batch_id=$1 AND recipient_hash=$2',[batch.batchId,recipientHash]);
      if(prior.rows[0]?.user_id!==id||prior.rows[0]?.wallet_id!==wallet)throw forbidden();
     }
    }
    const premiumDownloadRemaining=await remaining(wallet,c);
    await c.query('COMMIT');return {granted,premiumDownloadRemaining};
   }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
  },
  async summary(wallet){await ready();return {premiumDownloadRemaining:await remaining(wallet)}},
  async redeem(wallet,job,{premium=false}={}){
   await ready();const c=await pool.connect();
   try{
    await c.query('BEGIN');
    const lock=await c.query('SELECT id FROM wallets WHERE id=$1 FOR UPDATE',[wallet]);
    if(!lock.rowCount)throw missingJob();
    const owned=await c.query("SELECT id FROM ai_jobs WHERE id=$1 AND wallet_id=$2 AND status='completed' FOR SHARE",[job,wallet]);
    if(!owned.rowCount)throw missingJob();
    const mapping=await c.query(`SELECT m.work_id,w.id AS owned_work_id FROM download_work_jobs m
     LEFT JOIN download_works w ON w.id=m.work_id AND w.wallet_id=m.wallet_id AND m.wallet_id=$2
     WHERE m.job_id=$1`,[job,wallet]);
    if(mapping.rowCount&&!mapping.rows[0].owned_work_id)throw missingJob();
    const scope=mapping.rows[0]?.work_id||'job:'+job;
    const previous=await c.query('SELECT 1 FROM premium_download_redemptions WHERE wallet_id=$1 AND work_scope=$2',[wallet,scope]);
    const isPremium=previous.rowCount>0||await premiumHair(wallet,job,{db:c});
    if(isPremium||(!premium&&await allowed(wallet,job,{db:c}))){
     const premiumDownloadRemaining=await remaining(wallet,c);
     await c.query('COMMIT');return {ok:true,reused:true,premiumHair:isPremium,premiumDownloadRemaining};
    }
    const balance=await remaining(wallet,c);
    if(balance<1){
     await c.query('ROLLBACK');
     return premium?{ok:false,error:'premium_download_credit_required',premiumDownloadRemaining:0}:null;
    }
    await c.query('INSERT INTO premium_download_redemptions(wallet_id,work_scope,job_id) VALUES($1,$2,$3)',[wallet,scope,job]);
    await c.query(`INSERT INTO paid_image_unlocks(wallet_id,job_id,full_edit) VALUES($1,$2,true)
     ON CONFLICT(wallet_id,job_id) DO UPDATE SET full_edit=true`,[wallet,job]);
    await c.query('INSERT INTO premium_hair_unlocks(wallet_id,job_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[wallet,job]);
    await c.query('COMMIT');return {ok:true,reused:false,premiumHair:true,premiumDownloadRemaining:balance-1};
   }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
  }
 };
}
