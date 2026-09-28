import crypto from 'crypto';
import pg from 'pg';

const {Pool}=pg;
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for payment storage');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false}});
let readyPromise=null;
function ready(){
  if(!readyPromise) readyPromise=(async()=>{
    await pool.query(`CREATE TABLE IF NOT EXISTS wallets (id text PRIMARY KEY, credits integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS payments (session_id text PRIMARY KEY, wallet_id text NOT NULL REFERENCES wallets(id), credits integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS credit_usage (id text PRIMARY KEY, wallet_id text NOT NULL REFERENCES wallets(id), kind text NOT NULL, status text NOT NULL CHECK(status IN ('reserved','used','refunded')), created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, refunded_at timestamptz)`);
  })().catch(e=>{readyPromise=null;throw e});
  return readyPromise;
}
export async function newWallet(){await ready();const id='wal_'+crypto.randomBytes(24).toString('hex');await pool.query('INSERT INTO wallets(id,credits) VALUES($1,0)',[id]);return {walletId:id,credits:0}}
export async function getWallet(id){if(!id)return null;await ready();const {rows}=await pool.query('SELECT credits FROM wallets WHERE id=$1',[id]);return rows[0]?{walletId:id,credits:Number(rows[0].credits)}:null}
export async function ensureWallet(id){await ready();await pool.query('INSERT INTO wallets(id,credits) VALUES($1,0) ON CONFLICT(id) DO NOTHING',[id]);return getWallet(id)}
export async function creditPaid(walletId,sessionId,amount=2){await ready();const c=await pool.connect();try{await c.query('BEGIN');await c.query('INSERT INTO wallets(id,credits) VALUES($1,0) ON CONFLICT(id) DO NOTHING',[walletId]);const ins=await c.query('INSERT INTO payments(session_id,wallet_id,credits) VALUES($1,$2,$3) ON CONFLICT(session_id) DO NOTHING RETURNING session_id',[sessionId,walletId,amount]);if(ins.rowCount)await c.query('UPDATE wallets SET credits=credits+$2 WHERE id=$1',[walletId,amount]);const w=await c.query('SELECT credits FROM wallets WHERE id=$1',[walletId]);await c.query('COMMIT');return {duplicate:!ins.rowCount,credits:Number(w.rows[0]?.credits||0)}}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
export async function reserveCredit(walletId,kind){await ready();const c=await pool.connect();try{await c.query('BEGIN');const w=await c.query('SELECT credits FROM wallets WHERE id=$1 FOR UPDATE',[walletId]);if(!w.rows[0]||Number(w.rows[0].credits)<1){await c.query('ROLLBACK');return null}const id='use_'+crypto.randomBytes(18).toString('hex');const updated=await c.query('UPDATE wallets SET credits=credits-1 WHERE id=$1 RETURNING credits',[walletId]);await c.query('INSERT INTO credit_usage(id,wallet_id,kind,status) VALUES($1,$2,$3,\'reserved\')',[id,walletId,kind]);await c.query('COMMIT');return {usageId:id,credits:Number(updated.rows[0].credits)}}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
export async function commitCredit(usageId){await ready();await pool.query("UPDATE credit_usage SET status='used',completed_at=now() WHERE id=$1 AND status='reserved'",[usageId]);return true}
export async function refundCredit(usageId){await ready();const c=await pool.connect();try{await c.query('BEGIN');const u=await c.query("SELECT wallet_id,status FROM credit_usage WHERE id=$1 FOR UPDATE",[usageId]);if(!u.rows[0]||u.rows[0].status!=='reserved'){await c.query('ROLLBACK');return false}await c.query('UPDATE wallets SET credits=credits+1 WHERE id=$1',[u.rows[0].wallet_id]);await c.query("UPDATE credit_usage SET status='refunded',refunded_at=now() WHERE id=$1",[usageId]);await c.query('COMMIT');return true}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
export async function walletHistory(walletId){await ready();const {rows}=await pool.query(`SELECT session_id AS id,'purchase' AS type,NULL::text AS kind,credits,created_at AS at FROM payments WHERE wallet_id=$1 UNION ALL SELECT id,CASE WHEN status='refunded' THEN 'refund' ELSE 'usage' END AS type,kind,CASE WHEN status='refunded' THEN 1 ELSE -1 END AS credits,COALESCE(refunded_at,completed_at,created_at) AS at FROM credit_usage WHERE wallet_id=$1 ORDER BY at DESC LIMIT 30`,[walletId]);return rows.map(r=>({...r,at:new Date(r.at).toISOString()}))}
