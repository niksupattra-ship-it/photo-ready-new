// Native PostgreSQL contention tests. Uses only a cached image and disposable
// in-memory database; no production connection or payment provider is used.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import pg from 'pg';
import {createPremiumDownloadCredits} from '../premium-download-credits.js';

const run=promisify(execFile),dockerEnv={...process.env};
for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete dockerEnv[key];
const docker=async(...args)=>(await run('docker',['--host=unix:///var/run/docker.sock',...args],{env:dockerEnv,timeout:30000,maxBuffer:1024*1024})).stdout.trim();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const suffix=crypto.randomBytes(5).toString('hex');
const name='idprom-premium-native-'+suffix,applicationName='idprom-premium-test-'+suffix;
const cases=[],contention=[];
let pool,observer,started=false,cleaned=false,result,error;
const check=async(name,test)=>{await test();cases.push(name);console.log('PASS '+name)};

try{
 await docker('info','--format','{{.ServerVersion}}');
 const image=await docker('image','inspect','postgres:16-alpine','--format','{{.Id}}');
 await docker('run','--pull=never','--rm','-d','--name',name,'--tmpfs','/var/lib/postgresql/data:rw,size=256m','-e','POSTGRES_HOST_AUTH_METHOD=trust','-p','127.0.0.1::5432','postgres:16-alpine');
 started=true;
 const portOutput=await docker('port',name,'5432/tcp');
 const match=/^127\.0\.0\.1:(\d+)$/m.exec(portOutput);assert(match,'PostgreSQL must bind only to a loopback port');
 const connection={host:'127.0.0.1',port:Number(match[1]),user:'postgres',database:'postgres',application_name:applicationName,connectionTimeoutMillis:3000,statement_timeout:20000};
 for(let attempt=0;;attempt++){
  // The entrypoint first starts a temporary Unix-only initialization server.
  // Require TCP so the probe cannot succeed just before that server restarts.
  try{await docker('exec',name,'pg_isready','-h','127.0.0.1','-U','postgres');break}
  catch(e){if(attempt>=79)throw e;await pause(100)}
 }
 pool=new pg.Pool({...connection,max:24});observer=new pg.Pool({...connection,max:1,application_name:applicationName+'-observer'});
 await pool.query(`CREATE TABLE wallets(id text PRIMARY KEY,generation_remaining int NOT NULL DEFAULT 11,hair_remaining int NOT NULL DEFAULT 7,full_edit_remaining int NOT NULL DEFAULT 4);
  CREATE TABLE users(id text PRIMARY KEY,email text UNIQUE NOT NULL,wallet_id text UNIQUE NOT NULL REFERENCES wallets(id));
  CREATE TABLE ai_jobs(id text PRIMARY KEY,status text NOT NULL,wallet_id text NOT NULL);
  CREATE TABLE download_works(id text PRIMARY KEY,wallet_id text NOT NULL);
  CREATE TABLE download_work_jobs(job_id text PRIMARY KEY,work_id text NOT NULL,wallet_id text NOT NULL);
  CREATE TABLE paid_image_unlocks(wallet_id text NOT NULL,job_id text NOT NULL,full_edit boolean NOT NULL DEFAULT false,PRIMARY KEY(wallet_id,job_id));
  CREATE TABLE premium_hair_unlocks(wallet_id text NOT NULL,job_id text NOT NULL,PRIMARY KEY(wallet_id,job_id));
  CREATE TABLE payments(session_id text PRIMARY KEY,wallet_id text NOT NULL);
  CREATE TABLE credit_usage(id text PRIMARY KEY,wallet_id text NOT NULL);
  CREATE TABLE download_legacy_wallets(wallet_id text PRIMARY KEY);`);
 const ids=async(wallet,job,db)=>{
  const group=await db.query('SELECT m.work_id FROM download_work_jobs m JOIN download_works w ON w.id=m.work_id AND w.wallet_id=m.wallet_id WHERE m.job_id=$1 AND m.wallet_id=$2',[job,wallet]);
  if(!group.rowCount)return [job];
  return (await db.query('SELECT job_id FROM download_work_jobs WHERE wallet_id=$1 AND work_id=$2',[wallet,group.rows[0].work_id])).rows.map(row=>row.job_id);
 };
 const allowed=async(wallet,job,{db=pool}={})=>(await db.query('SELECT 1 FROM paid_image_unlocks WHERE wallet_id=$1 AND job_id=ANY($2::text[]) LIMIT 1',[wallet,await ids(wallet,job,db)])).rowCount>0;
 const premiumHair=async(wallet,job,{db=pool}={})=>(await db.query('SELECT 1 FROM premium_hair_unlocks WHERE wallet_id=$1 AND job_id=ANY($2::text[]) LIMIT 1',[wallet,await ids(wallet,job,db)])).rowCount>0;
 const fixture=async(label)=>{
  const wallet='wallet-'+label,email=label+'@premium-credit.test',account={id:'user-'+label,email,wallet_id:wallet};
  await pool.query('INSERT INTO wallets(id) VALUES($1)',[wallet]);
  await pool.query('INSERT INTO users(id,email,wallet_id) VALUES($1,$2,$3)',[account.id,email,wallet]);
  const jobs=[];
  for(const number of [1,2,3]){
   const work='work-'+label+'-'+number,job='job-'+label+'-'+number;jobs.push(job);
   await pool.query('INSERT INTO download_works(id,wallet_id) VALUES($1,$2)',[work,wallet]);
   await pool.query("INSERT INTO ai_jobs(id,status,wallet_id) VALUES($1,'completed',$2)",[job,wallet]);
   await pool.query('INSERT INTO download_work_jobs(job_id,work_id,wallet_id) VALUES($1,$2,$3)',[job,work,wallet]);
  }
  const peer=jobs[0]+'-peer';
  await pool.query("INSERT INTO ai_jobs(id,status,wallet_id) VALUES($1,'completed',$2)",[peer,wallet]);
  await pool.query('INSERT INTO download_work_jobs(job_id,work_id,wallet_id) VALUES($1,$2,$3)',[peer,'work-'+label+'-1',wallet]);
  const batches=[{batchId:'native-'+label,recipientHash:crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex'),quantity:2}];
  const store=()=>createPremiumDownloadCredits(pool,{batches,allowed,premiumHair});
  return {wallet,account,jobs,peer,store};
 };
 const scalar=async(sql,args=[])=>Number((await pool.query(sql,args)).rows[0].n);
 const remaining=async(fixture,store=fixture.store())=>(await store.summary(fixture.wallet)).premiumDownloadRemaining;
 const contend=async(wallet,label,operations,{beforeRelease}={})=>{
  const control=await pool.connect();let locked=false,pending;
  try{
   await control.query('BEGIN');locked=true;
   await control.query('SELECT id FROM wallets WHERE id=$1 FOR UPDATE',[wallet]);
   const holder=Number((await control.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
   pending=Promise.allSettled(operations.map(operation=>operation()));
   let blocked=[];
   for(let attempt=0;;attempt++){
    blocked=(await observer.query("SELECT pid,wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0",[applicationName])).rows;
    if(blocked.length>=operations.length)break;
    if(attempt>=399)throw Error(label+': expected '+operations.length+' independently blocked sessions, observed '+blocked.length);
    await pause(25);
   }
   assert(blocked.some(row=>row.blockers.includes(holder)),label+': PostgreSQL must identify the held wallet transaction as a blocker');
   contention.push({case:label,requests:operations.length,blockedSessions:blocked.length,holderPid:holder,blocked});
   if(beforeRelease)await beforeRelease(control);
   await control.query('COMMIT');locked=false;
   const settled=await pending;
   for(const entry of settled)if(entry.status==='rejected')throw entry.reason;
   return settled.map(entry=>entry.value);
  }finally{
   if(locked)await control.query('ROLLBACK');
   control.release();
   if(pending)await pending;
  }
 };

 const same=await fixture('same-work');
 await check('concurrent authenticated activations grant exactly two credits once',async()=>{
  const stores=Array.from({length:8},()=>same.store());
  await Promise.all(stores.map(store=>store.summary(same.wallet)));
  await contend(same.wallet,'activation-once',stores.map(store=>()=>store.activateForAccount(same.account)));
  assert.equal(await scalar('SELECT count(*) AS n FROM premium_download_grants WHERE wallet_id=$1',[same.wallet]),1);
  assert.equal(await scalar('SELECT sum(quantity) AS n FROM premium_download_grants WHERE wallet_id=$1',[same.wallet]),2);
  assert.equal(await remaining(same),2);
 });
 await check('simultaneous jobs from one work debit one credit and all retries reuse it',async()=>{
  const store=same.store();await store.summary(same.wallet);
  const results=await contend(same.wallet,'same-work-once',Array.from({length:8},(_,index)=>()=>store.redeem(same.wallet,index%2?same.peer:same.jobs[0],{premium:true})));
  assert(results.every(value=>value.ok===true));
  assert.equal(results.filter(value=>value.reused===false).length,1);
  assert.equal(results.filter(value=>value.reused===true).length,7);
  assert.equal(await scalar('SELECT count(*) AS n FROM premium_download_redemptions WHERE wallet_id=$1',[same.wallet]),1);
  assert.equal(await remaining(same),1);
  assert.equal(await allowed(same.wallet,same.peer),true);assert.equal(await premiumHair(same.wallet,same.peer),true);
 });
 await check('application restarts preserve the spent balance and original grant',async()=>{
  for(let attempt=0;attempt<3;attempt++)await same.store().activateForAccount(same.account);
  assert.equal(await scalar('SELECT count(*) AS n FROM premium_download_grants WHERE wallet_id=$1',[same.wallet]),1);
  assert.equal(await remaining(same),1);
 });

 const distinct=await fixture('distinct-works'),distinctStore=distinct.store();
 await distinctStore.activateForAccount(distinct.account);
 await check('three different works competing for two credits yield exactly two unlocks',async()=>{
  const results=await contend(distinct.wallet,'two-credits-three-works',distinct.jobs.map(job=>()=>distinctStore.redeem(distinct.wallet,job,{premium:true})));
  assert.equal(results.filter(value=>value.ok===true).length,2);
  assert.equal(results.filter(value=>value.ok===false&&value.error==='premium_download_credit_required').length,1);
  assert.equal(await scalar('SELECT count(*) AS n FROM premium_download_redemptions WHERE wallet_id=$1',[distinct.wallet]),2);
  assert.equal(await scalar('SELECT count(*) AS n FROM premium_hair_unlocks WHERE wallet_id=$1',[distinct.wallet]),2);
  assert.equal(await scalar('SELECT count(*) AS n FROM paid_image_unlocks WHERE wallet_id=$1 AND full_edit',[distinct.wallet]),2);
  assert.equal(await remaining(distinct),0);
 });

 const stripe=await fixture('stripe-race'),stripeStore=stripe.store();
 await stripeStore.activateForAccount(stripe.account);
 await check('a premium payment holding the wallet lock makes pending credit requests reuse rights',async()=>{
  const results=await contend(stripe.wallet,'stripe-premium-wins',Array.from({length:6},(_,index)=>()=>stripeStore.redeem(stripe.wallet,index%2?stripe.peer:stripe.jobs[0],{premium:true})),{beforeRelease:async control=>{
   // The payment writer uses the same wallet-first lock order as creditPaid.
   await control.query('INSERT INTO paid_image_unlocks(wallet_id,job_id,full_edit) VALUES($1,$2,true)',[stripe.wallet,stripe.jobs[0]]);
   await control.query('INSERT INTO premium_hair_unlocks(wallet_id,job_id) VALUES($1,$2)',[stripe.wallet,stripe.jobs[0]]);
  }});
  assert(results.every(value=>value.ok===true&&value.reused===true));
  assert.equal(await scalar('SELECT count(*) AS n FROM premium_download_redemptions WHERE wallet_id=$1',[stripe.wallet]),0);
  assert.equal(await remaining(stripe),2);
 });
 await check('contention preserves legacy counters and creates no payment or legacy exemption',async()=>{
  const wallets=(await pool.query('SELECT generation_remaining,hair_remaining,full_edit_remaining FROM wallets')).rows;
  assert(wallets.every(row=>row.generation_remaining===11&&row.hair_remaining===7&&row.full_edit_remaining===4));
  for(const table of ['payments','credit_usage','download_legacy_wallets'])assert.equal(await scalar('SELECT count(*) AS n FROM '+table),0);
 });
 result={passed:cases.length,cases,engine:'PostgreSQL 16 native Docker',image,contention,productionAccess:false,providerCalls:0,limits:'Rights callbacks use native SQL fixtures; payment race models creditPaid wallet-lock order and premium writes without contacting Stripe.'};
}catch(e){error=e;result={passed:cases.length,cases,contention,error:{name:e.name,message:e.message,stack:e.stack},productionAccess:false,providerCalls:0};}
finally{
 if(pool)await pool.end();if(observer)await observer.end();
 if(started){try{await docker('rm','-f',name);cleaned=true}catch(e){error??=e;}}
 result={...result,containerCleaned:cleaned};
 if(process.env.PREMIUM_NATIVE_OUTPUT){await mkdir(dirname(process.env.PREMIUM_NATIVE_OUTPUT),{recursive:true});await writeFile(process.env.PREMIUM_NATIVE_OUTPUT,JSON.stringify(result,null,2)+'\n');}
 console.log(JSON.stringify(result));
}
if(error)throw error;
