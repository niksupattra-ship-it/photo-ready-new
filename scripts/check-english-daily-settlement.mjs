// Execute the actual reservation/refund/settlement functions against isolated
// PostgreSQL WASM. No DATABASE_URL, customer balances or AI providers are used.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),cases=[];
const query=async(sql,args=[])=>{const r=await db.query(sql,args);return {...r,rowCount:r.rowCount??r.affectedRows??r.rows.length}};
const pool={query,connect:async()=>({query,release(){}})};
const row=async(sql,args=[])=> (await query(sql,args)).rows[0];
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
function extract(source,name){const a=source.indexOf('export async function '+name+'('),b=source.indexOf('\nexport ',a+1);assert(a>=0,name);return source.slice(a,b<0?undefined:b).replace(/^export /,'')}
const payment=await read('payment-store.js'),jobs=await read('job-store.js');
const functions=new Function('pool','crypto','ready','const ENGLISH_DAILY_AI_OUTFIT_LIMIT=2;'+['reserveEnglishDailyAiOutfit','refundCredit'].map(name=>extract(payment,name)).join('\n')+'\n'+extract(jobs,'settleAiJobDelivery')+'\n;return {reserveEnglishDailyAiOutfit,refundCredit,settleAiJobDelivery};')(pool,crypto,async()=>{});
const {reserveEnglishDailyAiOutfit:reserve,refundCredit:refund,settleAiJobDelivery:settle}=functions;
const balance=()=>row("SELECT generation_remaining,hair_remaining,full_edit_remaining,usd_premium_remaining FROM wallets WHERE id='owner'");
const addJob=async(id,usage,wallet='owner',status='queued',extra={})=>query('INSERT INTO ai_jobs(id,wallet_id,usage_id,status,fields,image) VALUES($1,$2,$3,$4,$5,$6)',[id,wallet,usage,status,{delivery_pending:true,...extra},Buffer.from('input')]);
async function check(name,fn){await fn();cases.push(name);console.log('PASS '+name)}
try{
 await db.exec(`CREATE TABLE wallets(id text PRIMARY KEY,generation_remaining int NOT NULL DEFAULT 7,hair_remaining int NOT NULL DEFAULT 11,full_edit_remaining int NOT NULL DEFAULT 3,usd_premium_remaining int NOT NULL DEFAULT 4,usd_premium_cycle text DEFAULT 'current',usd_premium_expires_at timestamptz DEFAULT now()+interval '30 days');
 CREATE TABLE credit_usage(id text PRIMARY KEY,wallet_id text NOT NULL,kind text NOT NULL,status text NOT NULL,credit_column text,full_edit_output boolean NOT NULL DEFAULT false,usd_premium_cycle text,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,refunded_at timestamptz);
 CREATE TABLE trial_previews(id text PRIMARY KEY,status text,completed_at timestamptz);
 CREATE TABLE ai_jobs(id text PRIMARY KEY,wallet_id text NOT NULL,usage_id text NOT NULL,status text NOT NULL,fields jsonb NOT NULL DEFAULT '{}',image bytea,result bytea,result_makeup bytea,mask bytea,error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE paid_image_unlocks(wallet_id text NOT NULL,job_id text NOT NULL,full_edit boolean,created_at timestamptz,PRIMARY KEY(wallet_id,job_id));
 CREATE TABLE premium_hair_unlocks(wallet_id text NOT NULL,job_id text NOT NULL,PRIMARY KEY(wallet_id,job_id));
 INSERT INTO wallets(id) VALUES('owner'),('foreign');`);
 const initial=await balance();let first,second;
 await check('two reserved daily slots block a third without changing any paid balance',async()=>{
  first=await reserve('owner');second=await reserve('owner');assert(first?.usageId);assert(second?.usageId);assert.equal(await reserve('owner'),null);assert.deepEqual(await balance(),initial);
  await addJob('daily-confirm',first.usageId,'owner','completed');await addJob('daily-cancel',second.usageId);
 });
 await check('foreign cancellation cannot release an owned daily reservation',async()=>{
  assert.equal((await settle('daily-cancel','foreign','cancel')).status,404);assert.equal((await row('SELECT status FROM credit_usage WHERE id=$1',[second.usageId])).status,'reserved');assert.deepEqual(await balance(),initial);
 });
 await check('cancelling a daily free job releases its slot without adding a paid generation credit',async()=>{
  const out=await settle('daily-cancel','owner','cancel');assert.equal(out.status,200);assert.equal(out.cancelled,true);assert.deepEqual(await balance(),initial);assert.equal((await row('SELECT status FROM credit_usage WHERE id=$1',[second.usageId])).status,'refunded');assert.equal((await row("SELECT status,error FROM ai_jobs WHERE id='daily-cancel'")).error,'USER_CANCELLED');
 });
 await check('repeated cancellation is idempotent and the cancelled output cannot be confirmed',async()=>{
  assert.equal((await settle('daily-cancel','owner','cancel')).status,200);assert.equal((await settle('daily-cancel','owner','confirm')).status,409);assert.deepEqual(await balance(),initial);
 });
 await check('an AI failure releases the replacement daily slot exactly once and creates no paid credits',async()=>{
  const replacement=await reserve('owner');assert(replacement?.usageId);assert.equal(await reserve('owner'),null);assert.equal(await refund(replacement.usageId),true);assert.equal(await refund(replacement.usageId),false);assert.deepEqual(await balance(),initial);
 });
 await check('daily delivery confirmation consumes its slot without granting paid download or hair entitlements',async()=>{
  assert.equal((await settle('daily-confirm','owner','confirm')).status,200);assert.equal((await settle('daily-confirm','owner','confirm')).status,200);assert.equal((await settle('daily-confirm','owner','cancel')).status,409);
  assert.equal((await row('SELECT status FROM credit_usage WHERE id=$1',[first.usageId])).status,'completed');assert.equal((await row('SELECT count(*)::int AS n FROM paid_image_unlocks')).n,0);assert.equal((await row('SELECT count(*)::int AS n FROM premium_hair_unlocks')).n,0);assert.deepEqual(await balance(),initial);
  const last=await reserve('owner');assert(last?.usageId);assert.equal(await reserve('owner'),null);await refund(last.usageId);
 });
 await check('canceling ordinary paid generation still restores its original credit once',async()=>{
  await query("UPDATE wallets SET generation_remaining=generation_remaining-1 WHERE id='owner'");
  await query("INSERT INTO credit_usage(id,wallet_id,kind,status,credit_column) VALUES('paid-generation','owner','ai-finish','reserved','generation_remaining')");await addJob('paid-cancel','paid-generation');
  assert.equal((await settle('paid-cancel','owner','cancel')).status,200);assert.equal((await settle('paid-cancel','owner','cancel')).status,200);assert.deepEqual(await balance(),initial);
 });
 await check('canceling active USD Premium restores only its same-cycle credit once',async()=>{
  await query("UPDATE wallets SET usd_premium_remaining=usd_premium_remaining-1 WHERE id='owner'");
  await query("INSERT INTO credit_usage(id,wallet_id,kind,status,credit_column,usd_premium_cycle,full_edit_output) VALUES('usd-use','owner','ai-finish','reserved','usd_premium_remaining','current',true)");await addJob('usd-cancel','usd-use');
  assert.equal((await settle('usd-cancel','owner','cancel')).status,200);assert.equal((await settle('usd-cancel','owner','cancel')).status,200);assert.deepEqual(await balance(),initial);
 });
 await check('expired or replaced USD cycles never receive credits from an older cancelled job',async()=>{
  for(const [id,cycle] of [['old-cycle','previous'],['expired-cycle','current']]){
   if(id==='expired-cycle')await query("UPDATE wallets SET usd_premium_expires_at=now()-interval '1 minute' WHERE id='owner'");
   await query("INSERT INTO credit_usage(id,wallet_id,kind,status,credit_column,usd_premium_cycle) VALUES($1,'owner','ai-finish','reserved','usd_premium_remaining',$2)",[id,cycle]);await addJob(id,id);assert.equal((await settle(id,'owner','cancel')).status,200);assert.deepEqual(await balance(),initial);
  }
 });
 await check('legacy trial cancellation retains its original delete-only refund behavior',async()=>{
  await query("INSERT INTO trial_previews(id,status) VALUES('trial_fixture','reserved')");await addJob('trial-cancel','trial_fixture');assert.equal((await settle('trial-cancel','owner','cancel')).status,200);assert.equal((await query("SELECT id FROM trial_previews WHERE id='trial_fixture'")).rowCount,0);assert.deepEqual(await balance(),initial);
 });
 console.log(JSON.stringify({passed:cases.length,cases,scope:'actual SQL functions against isolated PostgreSQL WASM; no production data, payments or AI calls',limits:'single database session; multi-connection races not simulated'}));
}finally{await db.close()}
