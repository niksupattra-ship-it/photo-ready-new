import crypto from 'node:crypto';
import pg from 'pg';

// The first request is committed before contacting Stripe. Every replica can
// recover an interrupted creation using its exact key and frozen parameters.
export function createPromptpayIntentStore(pool,{prepare=async()=>{}}={}){
 let initialized;
 const ready=()=>initialized||(initialized=(async()=>{
  await prepare();const c=await pool.connect();try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='15s'");await c.query('SELECT pg_advisory_xact_lock(714269047)');
  await c.query(`CREATE TABLE IF NOT EXISTS promptpay_work_intents(
   id text PRIMARY KEY,wallet_id text NOT NULL,work_scope text NOT NULL,package_id text NOT NULL,
   job_id text NOT NULL,email text NOT NULL,attempt_key text NOT NULL,idempotency_key text NOT NULL,
   channel text NOT NULL DEFAULT 'promptpay',payload jsonb,
   intent_id text UNIQUE,state text NOT NULL DEFAULT 'creating',active boolean NOT NULL DEFAULT true,
   created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
   UNIQUE(wallet_id,package_id,attempt_key))`);
  await c.query('CREATE UNIQUE INDEX IF NOT EXISTS promptpay_work_one_active ON promptpay_work_intents(wallet_id,work_scope) WHERE active');
  await c.query(`CREATE TABLE IF NOT EXISTS promptpay_work_reconciliation(wallet_id text NOT NULL,work_scope text NOT NULL,job_id text NOT NULL,paid_id text NOT NULL,pending boolean NOT NULL DEFAULT true,error_code text,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(wallet_id,work_scope))`);
  await c.query('COMMIT');
  }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
 })().catch(error=>{initialized=null;throw error}));
 const transaction=async(walletId,scope,run)=>{
  await ready();const c=await pool.connect();try{
   await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='15s'");
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['promptpay:'+walletId+':'+scope]);
   const out=await run(c);await c.query('COMMIT');return out;
  }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
 };
 return {ready,
  async reserve({walletId,scope,packageId,jobId,email,attempt,channel='promptpay',payload=null}){
   return transaction(walletId,scope,async c=>{
    // A stale client can retry an old basic checkout after the price cutover.
    // Keep its exact historical reservation/key even when its public alias now
    // resolves to 89; never create a second charge for the same basic attempt.
    const replayPackages=packageId==='download_89_v1'?['download_89_v1','download_119_v1']:[packageId];
    const replay=await c.query('SELECT * FROM promptpay_work_intents WHERE wallet_id=$1 AND package_id=ANY($2::text[]) AND attempt_key=$3 ORDER BY created_at,id LIMIT 1',[walletId,replayPackages,attempt]);
    if(replay.rows[0]){if(replay.rows[0].work_scope!==scope)throw Error('payment_attempt_mismatch');return replay.rows[0]}
    const active=await c.query('SELECT * FROM promptpay_work_intents WHERE wallet_id=$1 AND work_scope=$2 AND active',[walletId,scope]);
    if(active.rows[0])return active.rows[0];
    const key=crypto.createHash('sha256').update(channel==='checkout'?JSON.stringify(['idprom_checkout_v1',walletId,packageId,jobId,attempt]):'idprom_promptpay_v1'+walletId+packageId+attempt).digest('hex');
    const inserted=await c.query(`INSERT INTO promptpay_work_intents(id,wallet_id,work_scope,package_id,job_id,email,attempt_key,idempotency_key,channel,payload)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,['pqr_'+crypto.randomBytes(18).toString('hex'),walletId,scope,packageId,jobId,email,attempt,key,channel,payload]);
    return inserted.rows[0];
   });
  },
  async bind(id,intent){await ready();const q=await pool.query('UPDATE promptpay_work_intents SET intent_id=COALESCE(intent_id,$2),state=$3,updated_at=now() WHERE id=$1 AND (intent_id IS NULL OR intent_id=$2) RETURNING *',[id,intent.id,intent.status]);if(!q.rows[0])throw Error('payment_reservation_mismatch');return q.rows[0]},
  async close(id,intentId){await ready();await pool.query('UPDATE promptpay_work_intents SET active=false,updated_at=now() WHERE id=$1 AND intent_id=$2',[id,intentId])},
  async findByIntent(intentId){await ready();return (await pool.query('SELECT * FROM promptpay_work_intents WHERE intent_id=$1',[intentId])).rows[0]||null},
  async findActive(walletId,scope){await ready();return (await pool.query('SELECT * FROM promptpay_work_intents WHERE wallet_id=$1 AND work_scope=$2 AND active',[walletId,scope])).rows[0]||null},
  async queueReconcile(walletId,scope,jobId,paidId){await ready();await pool.query('INSERT INTO promptpay_work_reconciliation(wallet_id,work_scope,job_id,paid_id) VALUES($1,$2,$3,$4) ON CONFLICT(wallet_id,work_scope) DO UPDATE SET job_id=EXCLUDED.job_id,paid_id=EXCLUDED.paid_id,pending=true,error_code=NULL,updated_at=now()',[walletId,scope,jobId,paidId])},
  async pendingReconciliations(){await ready();return (await pool.query('SELECT * FROM promptpay_work_reconciliation WHERE pending ORDER BY updated_at LIMIT 10')).rows},
  async finishReconcile(walletId,scope,error='',paidId){await ready();await pool.query('UPDATE promptpay_work_reconciliation SET pending=$3,error_code=NULLIF($4,\'\'),updated_at=now() WHERE wallet_id=$1 AND work_scope=$2 AND ($5::text IS NULL OR paid_id=$5)',[walletId,scope,Boolean(error),String(error).replace(/[^a-zA-Z0-9_:-]/g,'').slice(0,80),paidId||null])},
  async adopt({walletId,scope,intent}){
   return transaction(walletId,scope,async c=>{
    const known=await c.query('SELECT * FROM promptpay_work_intents WHERE intent_id=$1',[intent.id]);if(known.rows[0])return known.rows[0];
    const active=await c.query('SELECT * FROM promptpay_work_intents WHERE wallet_id=$1 AND work_scope=$2 AND active',[walletId,scope]);if(active.rows[0])return active.rows[0];
    const q=await c.query(`INSERT INTO promptpay_work_intents(id,wallet_id,work_scope,package_id,job_id,email,attempt_key,idempotency_key,intent_id,state)
     VALUES($1,$2,$3,$4,$5,$6,$7,'',$8,$9) RETURNING *`,['pqr_'+crypto.randomBytes(18).toString('hex'),walletId,scope,intent.metadata.package_id,intent.metadata.job_id,'','adopt:'+intent.id,intent.id,intent.status]);return q.rows[0];
   });
  }
 };
}
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,ssl:process.env.DATABASE_URL?.includes('localhost')?false:{rejectUnauthorized:false}});
export const promptpayIntentStore=createPromptpayIntentStore(pool);
