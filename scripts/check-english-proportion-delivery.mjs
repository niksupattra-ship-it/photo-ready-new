// Requires an explicitly selected TEST_DATABASE_URL. Uses an isolated schema
// which is removed on exit; no provider, payment or customer-data requests.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import express from 'express';
import {readFile} from 'node:fs/promises';
import {validateEnglishProportionMetrics} from '../english-proportion-correction.js';
if(!process.env.TEST_DATABASE_URL)throw Error('Set TEST_DATABASE_URL to a development database');
const schema='test_english_proportions_'+crypto.randomBytes(8).toString('hex');
const admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL,ssl:false});await admin.connect();
let server,exitCode=0;
try{
 await admin.query(`CREATE SCHEMA ${schema}`);
 const url=new URL(process.env.TEST_DATABASE_URL);url.searchParams.set('options','-c search_path='+schema);
 process.env.DATABASE_URL=url.href;process.env.PGSSLMODE='disable';
 const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();
 try{
  await db.query('CREATE TABLE wallets(id text PRIMARY KEY,generation_remaining integer,full_edit_remaining integer)');
  await db.query("INSERT INTO wallets VALUES('owner',9,0),('other',9,0)");
  await db.query('CREATE TABLE credit_usage(id text PRIMARY KEY,wallet_id text,status text,credit_column text,kind text,full_edit_output boolean,completed_at timestamptz,refunded_at timestamptz)');
  const store=await import('../job-store.js');
  const fields={interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',delivery_pending:true,delivery_confirmed:false,neckOutfitReferencePath:'/assets/job-uniforms/female-formal-suit.png'};
  let n=0;
  async function job(overrides={}){
   const usage='usage_'+(++n);await db.query("INSERT INTO credit_usage VALUES($1,'owner','reserved','generation_remaining','ai-finish',false,NULL,NULL)",[usage]);
   const id=await store.createAiJob({walletId:'owner',usageId:usage,fields:{...fields,...overrides},image:{buffer:Buffer.from('original'),mimetype:'image/png'}});
   await store.claimAiJob(id);await store.completeAiJob(id,Buffer.from('natural-before'),Buffer.from('makeup-before'));return id;
  }
  let calls=0,start,release,fail=false;
  const started=()=>new Promise(r=>{start=r});
  const correct=async()=>{calls++;start?.();if(fail)throw Error('fixture provider error');await new Promise(r=>{release=r});return {natural:Buffer.from('natural-after'),makeup:Buffer.from('makeup-after')}};
  const app=express();app.use(express.json());
  const raw=await readFile(new URL('../server.js',import.meta.url),'utf8'),a=raw.indexOf("app.post('/api/ai-jobs/:id/proportions'"),z=raw.indexOf("app.get('/api/ai-jobs/:id'",a);
  assert(a>=0&&z>a);
  const env={app,...store,validateEnglishProportionMetrics,walletId:req=>req.get('X-Wallet-Id'),getModnetSession:async()=>{},correctEnglishProportions:correct,dir:'fixture',process:{env:{ARK_API_KEY:'inert'}},modnetRemoveBackground:async x=>x,console:{error(){}}};
  Function('env',`with(env){${raw.slice(a,z)}}`)(env);
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
  const request=(id,wallet='owner',metrics={faceRatio:.44,headRatio:.72,headScale:.80})=>fetch(base+'/api/ai-jobs/'+id+'/proportions',{method:'POST',headers:{'Content-Type':'application/json','X-Wallet-Id':wallet},body:JSON.stringify(metrics)});
  const id=await job();assert.equal((await request(id,'other')).status,409);assert.equal(calls,0);
  assert.equal((await request(id,'owner',{faceRatio:'injection'})).status,400);assert.equal(calls,0);
  let began=started(),pending=request(id);await began;
  assert.equal((await request(id)).status,409,'only one simultaneous correction is allowed');assert.equal(calls,1);
  assert.equal((await store.settleAiJobDelivery(id,'owner','confirm')).status,409,'cannot confirm while pair replacement is in progress');
  release();assert.equal((await pending).status,200);
  const result=await store.getAiJobResult(id,'owner',true);assert.equal(result.result.toString(),'natural-after');assert.equal(result.result_makeup.toString(),'makeup-after');
  assert.equal((await request(id)).status,409,'a completed correction cannot be repeated');
  assert.equal((await db.query("SELECT generation_remaining FROM wallets WHERE id='owner'")).rows[0].generation_remaining,9,'correction spends no additional credit');
  assert.equal((await store.settleAiJobDelivery(id,'owner','confirm')).status,200);
  assert.equal((await db.query("SELECT generation_remaining FROM wallets WHERE id='owner'")).rows[0].generation_remaining,9,'delivery only confirms the existing reserved credit');
  const delivered=await job({delivery_confirmed:true});assert.equal((await request(delivered)).status,409);
  const thai=await job({interfaceLanguage:'th'});assert.equal((await request(thai)).status,409);
  const cancelled=await job();began=started();pending=request(cancelled);await began;
  assert.equal((await store.settleAiJobDelivery(cancelled,'owner','cancel')).status,200);release();assert.equal((await pending).status,409);
  const dead=await store.getAiJobResult(cancelled,'owner',true);assert.equal(dead.status,'failed');assert.equal(dead.result,null);assert.equal(dead.result_makeup,null,'late correction cannot revive a cancelled job');
  assert.equal((await db.query("SELECT generation_remaining FROM wallets WHERE id='owner'")).rows[0].generation_remaining,10,'cancel refunds the original reservation once');
  const failed=await job();fail=true;assert.equal((await request(failed)).status,502);assert.equal((await store.getAiJob(failed,'owner')).proportionCorrection,'failed');
  assert.equal((await request(failed)).status,409,'provider failure still consumes the one correction attempt');
  console.log('PASS actual PostgreSQL + Express route: ownership, bounded metrics, one correction, atomic finish pair, pending-delivery guard, unchanged credit balance, single cancellation refund, no resurrection, Thai isolation and provider failure. No paid AI/payment calls.');
 }finally{await db.end()}
}catch(error){console.error(error.message);exitCode=1}
finally{if(server)await new Promise(r=>server.close(r));await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end()}
process.exit(exitCode);
