// Development database only. All changes live in a temporary schema.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
if(!process.env.TEST_DATABASE_URL)throw Error('Set TEST_DATABASE_URL to a development database');
const schema='test_delivery_recovery_'+crypto.randomBytes(8).toString('hex'),admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL,ssl:false});await admin.connect();let exitCode=0;
try{
 await admin.query(`CREATE SCHEMA ${schema}`);
 const url=new URL(process.env.TEST_DATABASE_URL);url.searchParams.set('options','-c search_path='+schema);process.env.DATABASE_URL=url.href;process.env.PGSSLMODE='disable';
 const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();
 try{
  await db.query('CREATE TABLE wallets(id text PRIMARY KEY,generation_remaining integer,full_edit_remaining integer)');await db.query("INSERT INTO wallets VALUES('owner',9,0)");
  await db.query('CREATE TABLE credit_usage(id text PRIMARY KEY,wallet_id text,status text,credit_column text,kind text,full_edit_output boolean,completed_at timestamptz,refunded_at timestamptz)');
  const store=await import('../job-store.js');let n=0;
  const create=async()=>{
   const usage='recovery_'+(++n);await db.query("INSERT INTO credit_usage VALUES($1,'owner','reserved','generation_remaining','ai-finish',false,NULL,NULL)",[usage]);
   const id=await store.createAiJob({walletId:'owner',usageId:usage,fields:{interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',delivery_pending:true,delivery_confirmed:false,proportion_correction:'processing'},image:{buffer:Buffer.from('source'),mimetype:'image/png'}});await store.claimAiJob(id);await store.completeAiJob(id,Buffer.from('finished-natural'),Buffer.from('finished-makeup'));return {id,usage};
  };
  const ready=await create();assert.equal((await store.settleAiJobDelivery(ready.id,'other','confirm')).status,404);
  assert.equal((await store.settleAiJobDelivery(ready.id,'owner','confirm')).status,200,'legacy correction flag cannot block a completed portrait');assert.equal((await store.settleAiJobDelivery(ready.id,'owner','confirm')).status,200);
  const result=await store.getAiJobResult(ready.id,'owner',true);assert.equal(result.result.toString(),'finished-natural');assert.equal(result.result_makeup.toString(),'finished-makeup');assert.equal((await db.query("SELECT generation_remaining FROM wallets WHERE id='owner'")).rows[0].generation_remaining,9,'no additional charge');
  const cancelled=await create();assert.equal((await store.settleAiJobDelivery(cancelled.id,'owner','cancel')).status,200);assert.equal((await store.settleAiJobDelivery(cancelled.id,'owner','cancel')).status,200);assert.equal((await db.query("SELECT generation_remaining FROM wallets WHERE id='owner'")).rows[0].generation_remaining,10,'cancel refunds exactly once');
  const dead=await store.getAiJobResult(cancelled.id,'owner',true);assert.equal(dead.result,null);assert.equal(dead.result_makeup,null);
  console.log('PASS PostgreSQL recovery: completed English jobs confirm despite legacy correction flags, both finishes survive, no duplicate charge, ownership enforced, cancellation refunds once.');
 }finally{await db.end()}
}catch(error){console.error(error.message);exitCode=1}
finally{await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end()}
process.exit(exitCode);
