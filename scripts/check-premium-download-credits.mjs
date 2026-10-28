// Disposable PostgreSQL WASM checks. Never reads DATABASE_URL or customer data.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createPremiumDownloadCredits,recipientHashForEmail} from '../premium-download-credits.js';

const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),cases=[];
const query=async(sql,args)=>{const result=await db.query(sql,args);return {...result,rowCount:result.rowCount??result.affectedRows??result.rows.length}};
const pool={query,async connect(){return {query,release(){}}}};
const check=async(name,test)=>{await test();cases.push(name);console.log('PASS '+name)};
const identities=Object.fromEntries(['member','preserved','foreign','unlisted','rollback','grant-rollback','paid','standalone'].map(name=>[name,{id:'user-'+name,email:name+'@example.test',wallet_id:name}]));
const batchFor=(name,batchId='fixture-20261028',quantity=2)=>({batchId,recipientHash:recipientHashForEmail(identities[name].email),quantity});
const batches=['member','preserved','rollback','paid','standalone'].map(name=>batchFor(name));
const row=async(sql,args)=>(await query(sql,args)).rows[0];
const count=async(table,wallet)=>(await row(`SELECT COUNT(*)::int AS n FROM ${table} WHERE wallet_id=$1`,[wallet])).n;
let policy,credits;
const work=async(wallet,job,{status='completed',group='',usage='free_fixture'}={})=>{
 const scope=group||await policy.beginWork(wallet,Buffer.from('fixture-image-'+job));
 await query('INSERT INTO ai_jobs(id,wallet_id,usage_id,status) VALUES($1,$2,$3,$4)',[job,wallet,usage,status]);
 await policy.attach(wallet,scope,job);return scope;
};
try{
 await db.exec(`CREATE TABLE wallets(id text PRIMARY KEY,credits int NOT NULL DEFAULT 0,generation_remaining int NOT NULL DEFAULT 0,hair_remaining int NOT NULL DEFAULT 0,full_edit_remaining int NOT NULL DEFAULT 0);
 CREATE TABLE payments(session_id text PRIMARY KEY,wallet_id text NOT NULL);
 CREATE TABLE promo_redemptions(code text PRIMARY KEY,wallet_id text NOT NULL);
 CREATE TABLE paid_image_unlocks(wallet_id text NOT NULL,job_id text NOT NULL,full_edit boolean NOT NULL DEFAULT false,PRIMARY KEY(wallet_id,job_id));
 CREATE TABLE credit_usage(id text PRIMARY KEY,wallet_id text NOT NULL,kind text NOT NULL,status text NOT NULL,credit_column text,full_edit_output boolean NOT NULL DEFAULT false,completed_at timestamptz);
 CREATE TABLE ai_jobs(id text PRIMARY KEY,wallet_id text NOT NULL,usage_id text NOT NULL,status text NOT NULL);
 CREATE TABLE saved_studio_work(id text PRIMARY KEY,wallet_id text NOT NULL,name text NOT NULL,project jsonb NOT NULL);`);
 for(const name of Object.keys(identities))await query('INSERT INTO wallets(id,credits,generation_remaining,hair_remaining,full_edit_remaining) VALUES($1,99,$2,$3,7)',[name,name==='preserved'?3:0,name==='preserved'?5:0]);
 const source=await readFile(new URL('../download-policy-store.js',import.meta.url),'utf8');
 const factory=new Function('crypto',source.slice(source.indexOf('export function createDownloadPolicy'),source.lastIndexOf('\nconst pool=')).replace(/^export /,'')+';return createDownloadPolicy;')(crypto);
 policy=factory(pool);
 const options={prepare:policy.ready,batches,allowed:policy.allowed,premiumHair:policy.premiumHair};
 credits=createPremiumDownloadCredits(pool,options);
 await check('schema prepares before the auth users table exists',async()=>{
  await credits.ready();assert.equal((await row("SELECT to_regclass('users') AS name")).name,null);
  assert.equal((await credits.summary('member')).premiumDownloadRemaining,0);
 });
 await query('CREATE TABLE users(id text PRIMARY KEY,email text NOT NULL UNIQUE,wallet_id text NOT NULL UNIQUE REFERENCES wallets(id))');
 for(const account of Object.values(identities))await query('INSERT INTO users(id,email,wallet_id) VALUES($1,$2,$3)',[account.id,account.email,account.wallet_id]);
 await check('recipient hashes normalize emails and trusted batches reject invalid or conflicting input',async()=>{
  assert.equal(recipientHashForEmail(' MEMBER@EXAMPLE.TEST '),recipientHashForEmail(identities.member.email));
  for(const bad of [{...batchFor('member'),quantity:-1},{...batchFor('member'),quantity:1.5},{...batchFor('member'),recipientHash:'invalid'},{...batchFor('member'),batchId:'unsafe@example.test'}])assert.throws(()=>createPremiumDownloadCredits(pool,{batches:[bad]}),/invalid_premium_download_batch/);
  assert.throws(()=>createPremiumDownloadCredits(pool,{batches:[batchFor('member'),batchFor('member','fixture-20261028',3)]}),/conflicting_premium_download_batch/);
 });
 await check('only a current matching database account receives exactly two credits once',async()=>{
  assert.deepEqual(await credits.activateForAccount(null),{granted:0});
  assert.deepEqual(await credits.activateForAccount(identities.unlisted),{granted:0});
  for(const spoof of [{...identities.member,id:identities.foreign.id},{...identities.member,wallet_id:'foreign'},{...identities.foreign,email:identities.member.email}])await assert.rejects(credits.activateForAccount(spoof),error=>error.status===403);
  assert.equal(await count('premium_download_grants','member'),0);assert.equal(await count('premium_download_grants','foreign'),0);
  assert.deepEqual(await credits.activateForAccount({...identities.member,email:' MEMBER@EXAMPLE.TEST '}),{granted:2,premiumDownloadRemaining:2});
  assert.deepEqual(await credits.activateForAccount(identities.member),{granted:0,premiumDownloadRemaining:2});
  assert.equal(await count('premium_download_grants','member'),1);
 });
 await check('grant adds two to existing premium balance and preserves all original counters and permissions',async()=>{
  const before=await row("SELECT * FROM wallets WHERE id='preserved'");
  await query("INSERT INTO premium_download_grants(batch_id,recipient_hash,user_id,wallet_id,quantity) VALUES('prior-approved', $1,$2,'preserved',4)",[recipientHashForEmail(identities.preserved.email),identities.preserved.id]);
  assert.deepEqual(await credits.activateForAccount(identities.preserved),{granted:2,premiumDownloadRemaining:6});
  assert.deepEqual(await row("SELECT * FROM wallets WHERE id='preserved'"),before);
  assert.equal((await row("SELECT quantity FROM premium_download_grants WHERE batch_id='prior-approved'")).quantity,4);
  assert.equal((await policy.summary('member')).canSave,false);
  assert.equal((await row('SELECT COUNT(*)::int AS n FROM payments')).n,0);
  assert.equal((await row('SELECT COUNT(*)::int AS n FROM credit_usage')).n,0);
 });
 let memberWork;
 await check('one credit unlocks one completed work with premium hair, full edit and five shared suit choices',async()=>{
  memberWork=await work('member','member-a');await work('member','member-a-peer',{group:memberWork});
  assert.equal(await policy.allowed('member','member-a'),false);
  assert.deepEqual(await credits.redeem('member','member-a'),{ok:true,reused:false,premiumHair:true,premiumDownloadRemaining:1});
  assert.equal(await policy.allowed('member','member-a-peer'),true);assert.equal(await policy.premiumHair('member','member-a-peer'),true);assert.equal(await policy.premiumWork('member',memberWork),true);
  assert.equal((await row("SELECT full_edit FROM paid_image_unlocks WHERE wallet_id='member' AND job_id='member-a'")).full_edit,true);
  const suits=['/fixture-a','/fixture-b','/fixture-c','/fixture-d','/fixture-e'];
  assert.deepEqual(await policy.suits('member','member-a',suits),{limited:true,choices:suits,limit:5});
  await assert.rejects(policy.suits('member','member-a-peer',['/fixture-sixth']),error=>error.status===409);
  assert.deepEqual((await policy.suits('member','member-a-peer',['/fixture-b'])).choices,suits);
 });
 await check('repeated downloads, later renders and recreated batches never debit or refill the same work',async()=>{
  await work('member','member-a-later',{group:memberWork});
  for(const job of ['member-a','member-a-peer','member-a-later'])assert.deepEqual(await credits.redeem('member',job,{premium:true}),{ok:true,reused:true,premiumHair:true,premiumDownloadRemaining:1});
  const recreated=createPremiumDownloadCredits(pool,{...options,batches:[batchFor('member','fixture-20261028',9)]});
  assert.deepEqual(await recreated.activateForAccount(identities.member),{granted:0,premiumDownloadRemaining:1});
  assert.equal((await row("SELECT quantity FROM premium_download_grants WHERE wallet_id='member'")).quantity,2);
  assert.equal(await count('premium_download_redemptions','member'),1);
 });
 await check('a second distinct work depletes the grant and a third stays locked without writes',async()=>{
  await work('member','member-b');await work('member','member-c');
  assert.equal((await credits.redeem('member','member-b')).premiumDownloadRemaining,0);
  assert.deepEqual(await credits.redeem('member','member-c',{premium:true}),{ok:false,error:'premium_download_credit_required',premiumDownloadRemaining:0});
  assert.equal(await credits.redeem('member','member-c'),null);
  assert.equal(await policy.allowed('member','member-c'),false);assert.equal(await policy.premiumHair('member','member-c'),false);
  assert.equal(await count('premium_download_redemptions','member'),2);assert.deepEqual(await credits.summary('member'),{premiumDownloadRemaining:0});
  assert.equal((await row("SELECT generation_remaining+hair_remaining AS n FROM wallets WHERE id='member'")).n,0);
  assert.equal((await row('SELECT COUNT(*)::int AS n FROM payments')).n,0);
 });
 await check('foreign, missing, queued and failed jobs cannot spend or obtain rights',async()=>{
  await work('foreign','foreign-complete');await work('preserved','preserved-queued',{status:'queued'});await work('preserved','preserved-failed',{status:'failed'});
  for(const job of ['foreign-complete','missing','preserved-queued','preserved-failed'])await assert.rejects(credits.redeem('preserved',job,{premium:true}),error=>error.status===404);
  assert.equal(await count('premium_download_redemptions','preserved'),0);assert.equal((await credits.summary('preserved')).premiumDownloadRemaining,6);
 });
 await check('basic rights upgrade only with explicit intent and existing premium purchases cost no grant credit',async()=>{
  await credits.activateForAccount(identities.paid);const basicWork=await work('paid','basic-paid');await work('paid','stripe-premium');
  await query("INSERT INTO paid_image_unlocks(wallet_id,job_id,full_edit) VALUES('paid','basic-paid',true),('paid','stripe-premium',true)");
  await query("INSERT INTO premium_hair_unlocks(wallet_id,job_id) VALUES('paid','stripe-premium')");
  const initial=['/old-a','/old-b','/old-c'];assert.equal((await policy.suits('paid','basic-paid',initial)).limit,3);
  assert.deepEqual(await credits.redeem('paid','basic-paid'),{ok:true,reused:true,premiumHair:false,premiumDownloadRemaining:2});
  assert.equal(await policy.premiumHair('paid','basic-paid'),false);
  assert.deepEqual(await credits.redeem('paid','stripe-premium',{premium:true}),{ok:true,reused:true,premiumHair:true,premiumDownloadRemaining:2});
  assert.deepEqual(await credits.redeem('paid','basic-paid',{premium:true}),{ok:true,reused:false,premiumHair:true,premiumDownloadRemaining:1});
  assert.equal(await policy.premiumWork('paid',basicWork),true);
  assert.deepEqual(await policy.suits('paid','basic-paid',['/new-d','/new-e']),{limited:true,choices:[...initial,'/new-d','/new-e'],limit:5});
 });
 await check('ungrouped legacy jobs retain isolated scope and invalid existing mappings cannot spend credits',async()=>{
  await credits.activateForAccount(identities.standalone);
  for(const id of ['ungrouped-a','ungrouped-b','corrupt-mapping-a','corrupt-mapping-b','corrupt-wallet-mapping'])await query("INSERT INTO ai_jobs(id,wallet_id,usage_id,status) VALUES($1,'standalone','free_fixture','completed')",[id]);
  const foreignWork=await policy.beginWork('foreign',Buffer.from('foreign-source'));
  for(const id of ['corrupt-mapping-a','corrupt-mapping-b'])await query("INSERT INTO download_work_jobs(job_id,work_id,wallet_id) VALUES($1,$2,'standalone')",[id,foreignWork]);
  await query("INSERT INTO download_work_jobs(job_id,work_id,wallet_id) VALUES('corrupt-wallet-mapping',$1,'foreign')",[foreignWork]);
  for(const id of ['corrupt-mapping-a','corrupt-mapping-b','corrupt-wallet-mapping'])await assert.rejects(credits.redeem('standalone',id,{premium:true}),error=>error.status===404);
  assert.equal((await credits.summary('standalone')).premiumDownloadRemaining,2);assert.equal(await count('premium_download_redemptions','standalone'),0);
  assert.equal((await credits.redeem('standalone','ungrouped-a')).premiumDownloadRemaining,1);
  assert.equal((await row("SELECT work_scope FROM premium_download_redemptions WHERE wallet_id='standalone'")).work_scope,'job:ungrouped-a');
  assert.equal((await credits.redeem('standalone','ungrouped-b')).premiumDownloadRemaining,0);
 });
 await check('an already granted recipient cannot transfer the same batch to a different account',async()=>{
  await query("UPDATE users SET email='member-retired@example.test' WHERE id=$1",[identities.member.id]);
  await query('UPDATE users SET email=$2 WHERE id=$1',[identities.unlisted.id,identities.member.email]);
  await assert.rejects(credits.activateForAccount({...identities.unlisted,email:identities.member.email}),error=>error.status===403);
  assert.equal(await count('premium_download_grants','unlisted'),0);assert.equal((await credits.summary('unlisted')).premiumDownloadRemaining,0);
  assert.equal((await row("SELECT quantity FROM premium_download_grants WHERE wallet_id='member'")).quantity,2);
  await query('UPDATE users SET email=$2 WHERE id=$1',[identities.unlisted.id,identities.unlisted.email]);
  await query('UPDATE users SET email=$2 WHERE id=$1',[identities.member.id,identities.member.email]);
 });
 await check('an unlock failure rolls back the debit and every entitlement before a successful retry',async()=>{
  await credits.activateForAccount(identities.rollback);await work('rollback','rollback-job');
  let fail=true;
  const faultyQuery=async(sql,args)=>{if(fail&&/^INSERT INTO premium_hair_unlocks/.test(sql)){fail=false;throw Error('injected-unlock-failure')}return query(sql,args)};
  const faultyPool={query,async connect(){return {query:faultyQuery,release(){}}}};
  const faulty=createPremiumDownloadCredits(faultyPool,options);
  await assert.rejects(faulty.redeem('rollback','rollback-job'),/injected-unlock-failure/);
  assert.equal(await count('premium_download_redemptions','rollback'),0);assert.equal(await count('paid_image_unlocks','rollback'),0);assert.equal(await count('premium_hair_unlocks','rollback'),0);
  assert.equal((await credits.summary('rollback')).premiumDownloadRemaining,2);
  assert.equal((await faulty.redeem('rollback','rollback-job')).premiumDownloadRemaining,1);
 });
 await check('a multi-batch grant failure rolls back all grants and retry credits each immutable batch once',async()=>{
  let fail=true;
  const faultyQuery=async(sql,args)=>{if(fail&&/^INSERT INTO premium_download_grants/.test(sql)&&args?.[0]==='grant-rollback-second'){fail=false;throw Error('injected-grant-failure')}return query(sql,args)};
  const faultyPool={query,async connect(){return {query:faultyQuery,release(){}}}};
  const grantBatches=[batchFor('grant-rollback','grant-rollback-first'),batchFor('grant-rollback','grant-rollback-second')];
  const faulty=createPremiumDownloadCredits(faultyPool,{...options,batches:grantBatches});
  await assert.rejects(faulty.activateForAccount(identities['grant-rollback']),/injected-grant-failure/);
  assert.equal(await count('premium_download_grants','grant-rollback'),0);
  assert.deepEqual(await faulty.activateForAccount(identities['grant-rollback']),{granted:4,premiumDownloadRemaining:4});
  assert.deepEqual(await faulty.activateForAccount(identities['grant-rollback']),{granted:0,premiumDownloadRemaining:4});
 });
 console.log(JSON.stringify({passed:cases.length,cases,scope:'actual premium-credit and existing download-policy SQL in disposable PostgreSQL WASM; generated test identities only',limits:'independent native transaction contention is checked by check-premium-download-concurrency.mjs'}));
}finally{await db.close()}
