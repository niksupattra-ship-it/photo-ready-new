// Native PostgreSQL proof for globally one-use package codes. Only disposable
// local SQL and invented fixture codes are used; no actual issued code is read.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import pg from 'pg';
import {createPackageUnlockCodeStore,hashPackageUnlockCode} from '../package-unlock-code-store.js';

const run=promisify(execFile),dockerEnv={...process.env};
for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete dockerEnv[key];
const docker=async(...args)=>(await run('docker',['--host=unix:///var/run/docker.sock',...args],{env:dockerEnv,timeout:30000,maxBuffer:1024*1024})).stdout.trim();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const suffix=crypto.randomBytes(5).toString('hex'),container='idprom-code-native-'+suffix,application='idprom-code-test-'+suffix;
const cases=[],contention=[];
let pool,observer,started=false,cleaned=false,result,error,image;
const check=async(name,test)=>{await test();cases.push(name);console.log('PASS '+name)};
const codes=[];
const makeCode=(label,packageId='159')=>{const plaintext='FIXTURE-'+packageId+'-'+label.toUpperCase()+'-'+suffix.toUpperCase();const codeHash=hashPackageUnlockCode(plaintext);codes.push({codeHash,packageId});return {plaintext,codeHash,packageId}};
const q=async(sql,args=[])=>pool.query(sql,args),scalar=async(sql,args=[])=>Number((await q(sql,args)).rows[0].n);

try{
 await docker('info','--format','{{.ServerVersion}}');image=await docker('image','inspect','postgres:16-alpine','--format','{{.Id}}');
 await docker('run','--pull=never','--rm','-d','--name',container,'--tmpfs','/var/lib/postgresql/data:rw,size=244m','-e','POSTGRES_HOST_AUTH_METHOD=trust','-p','127.0.0.1::5432','postgres:16-alpine');started=true;
 const match=/^127\.0\.0\.1:(\d+)$/m.exec(await docker('port',container,'5432/tcp'));assert(match,'native test must bind only to loopback');
 for(let attempt=0;;attempt++){try{await docker('exec',container,'pg_isready','-h','127.0.0.1','-U','postgres');break}catch(e){if(attempt>=79)throw e;await pause(100)}}
 const connection={host:'127.0.0.1',port:Number(match[1]),user:'postgres',database:'postgres',application_name:application,connectionTimeoutMillis:3000,statement_timeout:20000};
 pool=new pg.Pool({...connection,max:24});observer=new pg.Pool({...connection,max:1,application_name:application+'-observer'});
 await q(`CREATE TABLE wallets(id text PRIMARY KEY,generation_remaining int NOT NULL DEFAULT 7,hair_remaining int NOT NULL DEFAULT 4,full_edit_remaining int NOT NULL DEFAULT 3);
 CREATE TABLE users(id text PRIMARY KEY,email text NOT NULL,wallet_id text UNIQUE NOT NULL REFERENCES wallets(id));
 CREATE TABLE ai_jobs(id text PRIMARY KEY,wallet_id text NOT NULL,status text NOT NULL);
 CREATE TABLE download_works(id text PRIMARY KEY,wallet_id text NOT NULL);
 CREATE TABLE download_work_jobs(job_id text PRIMARY KEY,work_id text NOT NULL,wallet_id text NOT NULL);
 CREATE TABLE paid_image_unlocks(wallet_id text NOT NULL,job_id text NOT NULL,full_edit boolean NOT NULL DEFAULT false,PRIMARY KEY(wallet_id,job_id));
 CREATE TABLE premium_hair_unlocks(wallet_id text NOT NULL,job_id text NOT NULL,PRIMARY KEY(wallet_id,job_id));
 CREATE TABLE payments(session_id text PRIMARY KEY,wallet_id text NOT NULL);
 CREATE TABLE credit_usage(id text PRIMARY KEY,wallet_id text NOT NULL);
 CREATE TABLE promo_redemptions(code text PRIMARY KEY,wallet_id text NOT NULL);
 CREATE TABLE download_legacy_wallets(wallet_id text PRIMARY KEY);`);
 const ids=async(wallet,job,db)=>{
  const group=await db.query('SELECT m.work_id FROM download_work_jobs m JOIN download_works w ON w.id=m.work_id AND w.wallet_id=m.wallet_id WHERE m.job_id=$1 AND m.wallet_id=$2',[job,wallet]);
  if(!group.rowCount)return [job];return (await db.query('SELECT job_id FROM download_work_jobs WHERE wallet_id=$1 AND work_id=$2',[wallet,group.rows[0].work_id])).rows.map(row=>row.job_id);
 };
 const allowed=async(wallet,job,{db=pool}={})=>(await db.query('SELECT 1 FROM paid_image_unlocks WHERE wallet_id=$1 AND job_id=ANY($2::text[]) LIMIT 1',[wallet,await ids(wallet,job,db)])).rowCount>0;
 const premiumHair=async(wallet,job,{db=pool}={})=>(await db.query('SELECT 1 FROM premium_hair_unlocks WHERE wallet_id=$1 AND job_id=ANY($2::text[]) LIMIT 1',[wallet,await ids(wallet,job,db)])).rowCount>0;
 const store=()=>createPackageUnlockCodeStore(pool,{codes:[...codes],allowed,premiumHair});
 const fixture=async label=>{
  const wallet='wallet-'+label,account={id:'user-'+label,email:label+'@code-fixture.test',wallet_id:wallet},jobs=[];
  await q('INSERT INTO wallets(id) VALUES($1)',[wallet]);await q('INSERT INTO users(id,email,wallet_id) VALUES($1,$2,$3)',[account.id,account.email,wallet]);
  for(const number of [1,2]){const job='job-'+label+'-'+number,work='work-'+label+'-'+number;jobs.push(job);await q('INSERT INTO download_works(id,wallet_id) VALUES($1,$2)',[work,wallet]);await q("INSERT INTO ai_jobs(id,wallet_id,status) VALUES($1,$2,'completed')",[job,wallet]);await q('INSERT INTO download_work_jobs(job_id,work_id,wallet_id) VALUES($1,$2,$3)',[job,work,wallet]);}
  const peer=jobs[0]+'-peer';await q("INSERT INTO ai_jobs(id,wallet_id,status) VALUES($1,$2,'completed')",[peer,wallet]);await q('INSERT INTO download_work_jobs(job_id,work_id,wallet_id) VALUES($1,$2,$3)',[peer,'work-'+label+'-1',wallet]);return {wallet,account,jobs,peer,work:'work-'+label+'-1'};
 };
 const countCode=code=>scalar('SELECT count(*) AS n FROM package_unlock_code_redemptions WHERE code_hash=$1',[code.codeHash]);
 const countWork=f=>scalar('SELECT count(*) AS n FROM package_unlock_code_redemptions WHERE wallet_id=$1 AND work_scope=$2',[f.wallet,f.work]);
 const contentionRun=async(wallets,label,operations,{beforeRelease}={})=>{
  const control=await pool.connect();let locked=false,pending;
  try{
   await control.query('BEGIN');locked=true;
   for(const wallet of [...new Set(wallets)].sort())await control.query('SELECT id FROM wallets WHERE id=$1 FOR UPDATE',[wallet]);
   const holderPid=Number((await control.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);pending=Promise.allSettled(operations.map(operation=>operation()));let blocked=[];
   for(let attempt=0;;attempt++){
    blocked=(await observer.query("SELECT pid,wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0",[application])).rows;
    if(blocked.length>=operations.length)break;if(attempt>=399)throw Error(label+': expected '+operations.length+' blocked sessions, saw '+blocked.length);await pause(25);
   }
   assert(blocked.some(row=>row.blockers.includes(holderPid)));contention.push({case:label,requests:operations.length,blockedSessions:blocked.length,holderPid,blocked});
   if(beforeRelease)await beforeRelease(control);await control.query('COMMIT');locked=false;return await pending;
  }finally{if(locked)await control.query('ROLLBACK');control.release();if(pending)await pending}
 };
 const errorCode=result=>result.reason?.code;

 for(const packageId of ['89','159'])await check('one '+packageId+' code racing across accounts unlocks exactly one owned work globally',async()=>{
  const code=makeCode('global-'+packageId,packageId),a=await fixture('global-a-'+packageId),b=await fixture('global-b-'+packageId);const stores=Array.from({length:4},store);await Promise.all(stores.map(s=>s.ready()));
  const pending=Array.from({length:12},(_,i)=>{const f=i%2?a:b;return ()=>stores[i%stores.length].redeem(f.account,code.plaintext,f.jobs[0])});
  const results=await contentionRun([a.wallet,b.wallet],'global-once-'+packageId,pending);
  const fulfilled=results.filter(r=>r.status==='fulfilled'),rejected=results.filter(r=>r.status==='rejected');assert.equal(fulfilled.length,6);assert.equal(rejected.length,6);assert.equal(fulfilled.filter(r=>r.value.reused===false).length,1);assert.equal(fulfilled.filter(r=>r.value.reused===true).length,5);assert(rejected.every(r=>r.reason.status===409&&errorCode(r)==='package_code_used'));
  assert.equal(await countCode(code),1);const owner=(await q('SELECT wallet_id FROM package_unlock_code_redemptions WHERE code_hash=$1',[code.codeHash])).rows[0].wallet_id;const winner=owner===a.wallet?a:b,loser=owner===a.wallet?b:a;
  assert.equal(await allowed(winner.wallet,winner.jobs[0]),true);assert.equal(await allowed(loser.wallet,loser.jobs[0]),false);assert.equal(await premiumHair(winner.wallet,winner.peer),packageId==='159');
 });
 await check('concurrent grouped renders and normalized code retries reuse one redemption after restart',async()=>{
  const code=makeCode('grouped'),f=await fixture('grouped'),stores=Array.from({length:8},store);await Promise.all(stores.map(s=>s.ready()));
  const results=await contentionRun([f.wallet],'grouped-retries',stores.map((s,i)=>()=>s.redeem(f.account,i%2?' \t'+code.plaintext.toLowerCase()+' \n':code.plaintext,i%2?f.peer:f.jobs[0])));
  assert(results.every(r=>r.status==='fulfilled'));assert.equal(results.filter(r=>r.value.reused===false).length,1);assert.equal(await countCode(code),1);assert.equal(await allowed(f.wallet,f.peer),true);assert.equal(await premiumHair(f.wallet,f.peer),true);
  for(let i=0;i<3;i++){const restarted=store();const reused=await restarted.redeem(f.account,code.plaintext,f.peer);assert.equal(reused.reused,true)}assert.equal(await countCode(code),1);
  await assert.rejects(store().redeem(f.account,code.plaintext,f.jobs[1]),e=>e.status===409&&e.code==='package_code_used');assert.equal(await allowed(f.wallet,f.jobs[1]),false);
 });
 await check('different premium codes racing for the same work consume only one and preserve every other code',async()=>{
  const f=await fixture('many-codes'),offers=Array.from({length:8},(_,i)=>makeCode('many-'+i)),s=store();await s.ready();
  const results=await contentionRun([f.wallet],'one-work-many-codes',offers.map((code,i)=>()=>s.redeem(f.account,code.plaintext,i%2?f.peer:f.jobs[0])));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert(results.filter(r=>r.status==='rejected').every(r=>r.reason.status===409&&errorCode(r)==='image_already_unlocked'));assert.equal(await countWork(f),1);
  const unused=[];for(const code of offers)if(!await countCode(code))unused.push(code);assert.equal(unused.length,7);assert.equal((await s.redeem(f.account,unused[0].plaintext,f.jobs[1])).reused,false);assert.equal(await countCode(unused[0]),1);
 });
 await check('a committed premium payment or support grant wins the wallet lock without consuming any waiting code',async()=>{
  const f=await fixture('paid-race'),offers=Array.from({length:6},(_,i)=>makeCode('paid-'+i)),s=store();await s.ready();
  const results=await contentionRun([f.wallet],'paid-writer-first',offers.map((code,i)=>()=>s.redeem(f.account,code.plaintext,i%2?f.peer:f.jobs[0])),{beforeRelease:async c=>{
   // The real payment/support stores use this wallet-first transaction order.
   await c.query('INSERT INTO paid_image_unlocks(wallet_id,job_id,full_edit) VALUES($1,$2,true)',[f.wallet,f.jobs[0]]);await c.query('INSERT INTO premium_hair_unlocks(wallet_id,job_id) VALUES($1,$2)',[f.wallet,f.jobs[0]]);
  }});
  assert(results.every(r=>r.status==='rejected'&&r.reason.status===409&&errorCode(r)==='image_already_unlocked'));assert.equal(await countWork(f),0);for(const code of offers)assert.equal(await countCode(code),0);assert.equal((await s.redeem(f.account,offers[0].plaintext,f.jobs[1])).reused,false);
 });
 await check('an entitlement-write failure rolls back code usage and partial rights so the same code can retry',async()=>{
  const f=await fixture('rollback'),code=makeCode('rollback'),s=store();await s.ready();
  await q(`CREATE FUNCTION reject_package_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.wallet_id='wallet-rollback' THEN RAISE EXCEPTION 'fixture_write_failure'; END IF; RETURN NEW; END $$;
   CREATE TRIGGER reject_package_fixture BEFORE INSERT ON premium_hair_unlocks FOR EACH ROW EXECUTE FUNCTION reject_package_fixture();`);
  await assert.rejects(s.redeem(f.account,code.plaintext,f.jobs[0]),/fixture_write_failure/);assert.equal(await countCode(code),0);assert.equal(await allowed(f.wallet,f.jobs[0]),false);assert.equal(await premiumHair(f.wallet,f.jobs[0]),false);
  await q('DROP TRIGGER reject_package_fixture ON premium_hair_unlocks');assert.equal((await s.redeem(f.account,code.plaintext,f.jobs[0])).reused,false);assert.equal(await countCode(code),1);
 });
 await check('package-code contention preserves credit balances and creates no payment or saving exemption',async()=>{
  const rows=(await q('SELECT generation_remaining,hair_remaining,full_edit_remaining FROM wallets')).rows;assert(rows.every(r=>r.generation_remaining===7&&r.hair_remaining===4&&r.full_edit_remaining===3));
  for(const table of ['payments','credit_usage','promo_redemptions','download_legacy_wallets'])assert.equal(await scalar('SELECT count(*) AS n FROM '+table),0);
 });
 result={passed:cases.length,failed:0,cases,engine:'PostgreSQL16 native Docker',image,contention,productionAccess:false,providerCalls:0,issuedCodesRead:false,limits:'Native SQL fixtures model existing paid/support wallet-lock order; no Stripe call, customer record or actual issued code is accessed.'};
}catch(e){error=e;result={passed:cases.length,failed:1,cases,contention,error:{name:e.name,message:e.message,stack:e.stack},productionAccess:false,providerCalls:0,issuedCodesRead:false}}
finally{
 if(pool)await pool.end();if(observer)await observer.end();
 if(started){try{await docker('rm','-f',container);cleaned=true}catch(e){error??=e}}
 result={...result,containerCleaned:cleaned};const output=process.env.PACKAGE_CODE_NATIVE_OUTPUT;
 if(output){await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n')}console.log(JSON.stringify(result));
}
if(error)throw error;
