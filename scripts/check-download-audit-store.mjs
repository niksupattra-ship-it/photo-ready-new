// Disposable PostgreSQL WASM and local HTTP only: no DATABASE_URL, customer,
// provider, payment, or production writes. Native concurrent workers are not
// modeled by PGlite's single session.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {createDownloadAuditStore,readDownloadAuditRights} from '../download-audit-store.js';
import {createDownloadAuditAuth,registerDownloadAuditApi} from '../download-audit-api.js';
import {normalizeDownloadAuditBatch} from '../download-audit-schema.js';
import {isPrivateOwner} from '../private-trial.js';

const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),cases=[],queries=[];
const query=async(sql,args=[])=>{queries.push(sql);const r=await db.query(sql,args);return {...r,rowCount:r.rowCount??r.affectedRows??r.rows.length}};
const pool={query,async connect(){return {query,release(){}}}};
const check=async(name,run)=>{await run();cases.push(name);console.log('PASS '+name)};
const one=async(sql,args)=>(await query(sql,args)).rows[0];
const count=async(table)=>(await one('SELECT count(*)::int AS n FROM '+table)).n;
const user={id:'user-main',email:'MEMBER@example.test',wallet_id:'wallet-main'};
const foreign={id:'user-foreign',email:'foreign@example.test',wallet_id:'wallet-foreign'};
const owner={id:'user-owner',email:'treeradech009@gmail.com',wallet_id:'wallet-owner'};
const tokens=Object.fromEntries(['main','foreign','owner','expired','revoked'].map(name=>[name,crypto.randomBytes(32).toString('hex')]));
const tokenHash=value=>crypto.createHash('sha256').update(value).digest('hex');
let sequence=0,server;
const id=prefix=>prefix+'_'+String(++sequence).padStart(16,'0');
const event=(type='download_clicked',extra={})=>({eventId:id('evt'),type,clientAt:'2026-10-29T03:00:00.000Z',...extra});
const batch=(jobIds=['basic-a'],extra={})=>({attemptId:id('aud'),expectedWalletId:user.wallet_id,jobIds,mode:'studio',initiator:'user',browserFamily:'chrome',deviceClass:'desktop',events:[event()],...extra});
const addJob=async(job,wallet=user.wallet_id,usage='free_fixture',status='completed')=>query('INSERT INTO ai_jobs(id,wallet_id,usage_id,status) VALUES($1,$2,$3,$4)',[job,wallet,usage,status]);
const businessTables=['wallets','users','user_sessions','payments','credit_usage','ai_jobs','download_works','download_work_jobs','paid_image_unlocks','premium_hair_unlocks','download_legacy_wallets','download_legacy_works','download_policy','download_payment_receipts','package_unlock_code_redemptions','premium_download_grants','premium_download_redemptions','download_suit_choices','saved_studio_work'];
const businessSnapshot=async()=>Object.fromEntries(await Promise.all(businessTables.map(async name=>[name,(await query('SELECT row_to_json(t) AS data FROM '+name+' t ORDER BY row_to_json(t)::text')).rows])));
const rights=async(jobIds,options={})=>readDownloadAuditRights(pool,user.wallet_id,jobIds,options);

try{
 await db.exec(`
 CREATE TABLE wallets(id text PRIMARY KEY,credits integer DEFAULT 0,generation_remaining integer DEFAULT 0,hair_remaining integer DEFAULT 0,full_edit_remaining integer DEFAULT 0);
 CREATE TABLE users(id text PRIMARY KEY,email text UNIQUE NOT NULL,wallet_id text UNIQUE NOT NULL);
 CREATE TABLE user_sessions(token_hash text PRIMARY KEY,user_id text NOT NULL,expires_at timestamptz NOT NULL);
 CREATE TABLE payments(session_id text PRIMARY KEY,wallet_id text NOT NULL,package_id text,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE credit_usage(id text PRIMARY KEY,wallet_id text NOT NULL,kind text,status text);
 CREATE TABLE promo_redemptions(code text PRIMARY KEY,wallet_id text NOT NULL);
 CREATE TABLE ai_jobs(id text PRIMARY KEY,wallet_id text NOT NULL,usage_id text NOT NULL,status text NOT NULL);
 CREATE TABLE paid_image_unlocks(wallet_id text NOT NULL,job_id text NOT NULL,full_edit boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(wallet_id,job_id));
 CREATE TABLE saved_studio_work(id text PRIMARY KEY,wallet_id text NOT NULL,project jsonb NOT NULL);
 CREATE TABLE download_payment_receipts(session_id text PRIMARY KEY,wallet_id text NOT NULL,work_scope text NOT NULL,package_id text NOT NULL,overlap boolean NOT NULL DEFAULT false,refund_status text NOT NULL DEFAULT 'not_required',created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE package_unlock_code_redemptions(code_hash text PRIMARY KEY,package_id text NOT NULL,user_id text NOT NULL,wallet_id text NOT NULL,work_scope text NOT NULL,job_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE premium_download_grants(batch_id text NOT NULL,recipient_hash text NOT NULL,user_id text NOT NULL,wallet_id text NOT NULL,quantity integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE premium_download_redemptions(wallet_id text NOT NULL,work_scope text NOT NULL,job_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(wallet_id,work_scope));
 `);
 for(const account of [user,foreign,owner]){
  await query('INSERT INTO wallets(id,credits,generation_remaining,hair_remaining,full_edit_remaining) VALUES($1,11,4,3,5)',[account.wallet_id]);
  await query('INSERT INTO users(id,email,wallet_id) VALUES($1,$2,$3)',[account.id,account.email,account.wallet_id]);
 }
 for(const [name,account,expiry]of [['main',user,"now()+interval '30 days'"],['foreign',foreign,"now()+interval '30 days'"],['owner',owner,"now()+interval '30 days'"],['expired',user,"now()-interval '1 second'"],['revoked',user,"now()+interval '30 days'"]])await query('INSERT INTO user_sessions(token_hash,user_id,expires_at) VALUES($1,$2,'+expiry+')',[tokenHash(tokens[name]),account.id]);
 await query('DELETE FROM user_sessions WHERE token_hash=$1',[tokenHash(tokens.revoked)]);
 const policySource=await readFile(new URL('../download-policy-store.js',import.meta.url),'utf8');
 const policyFactory=new Function('crypto',policySource.slice(policySource.indexOf('export function createDownloadPolicy'),policySource.lastIndexOf('\nconst pool=')).replace(/^export /,'')+';return createDownloadPolicy;')(crypto);
 const policy=policyFactory(pool);await policy.ready();
 const group=async(work,ids,{legacy=null}={})=>{
  await query('INSERT INTO download_works(id,wallet_id,source_hash,legacy_work_id) VALUES($1,$2,$3,$4)',[work,user.wallet_id,'immutable-'+work,legacy]);
  for(const job of ids){await addJob(job);await query('INSERT INTO download_work_jobs(job_id,work_id,wallet_id) VALUES($1,$2,$3)',[job,work,user.wallet_id])}
 };
 await group('work-basic',['basic-a','basic-b']);await group('work-premium',['premium-a','premium-b']);
 await group('work-119',['historical-119']);await group('work-code-basic',['code-89']);await group('work-code-premium',['code-159']);
 await group('work-support',['support-a','support-b']);await group('work-unpaid',['unpaid-a']);
 await addJob('standalone');await addJob('old-generation',user.wallet_id,'use_old');
 await addJob('not-ready',user.wallet_id,'free_fixture','processing');await addJob('foreign-job',foreign.wallet_id);
 await addJob('owner-unpaid',owner.wallet_id);
 for(const job of ['basic-a','premium-a','historical-119','code-89','code-159','support-a'])await query('INSERT INTO paid_image_unlocks(wallet_id,job_id,full_edit) VALUES($1,$2,true)',[user.wallet_id,job]);
 for(const job of ['premium-a','code-159','support-a'])await query('INSERT INTO premium_hair_unlocks(wallet_id,job_id) VALUES($1,$2)',[user.wallet_id,job]);
 for(const [session,work,packageId]of [['pi_basic','work-basic','download_89_v1'],['pi_premium','work-premium','download_159_hair_v1'],['cs_historical','work-119','download_119_v1']]){
  await query('INSERT INTO payments(session_id,wallet_id,package_id) VALUES($1,$2,$3)',[session,user.wallet_id,packageId]);
  await query('INSERT INTO download_payment_receipts(session_id,wallet_id,work_scope,package_id) VALUES($1,$2,$3,$4)',[session,user.wallet_id,work,packageId]);
 }
 for(const [code,packageId,work,job]of [['hash-basic','89','work-code-basic','code-89'],['hash-premium','159','work-code-premium','code-159']])await query('INSERT INTO package_unlock_code_redemptions(code_hash,package_id,user_id,wallet_id,work_scope,job_id) VALUES($1,$2,$3,$4,$5,$6)',[code,packageId,user.id,user.wallet_id,work,job]);
 await query("INSERT INTO premium_download_grants(batch_id,recipient_hash,user_id,wallet_id,quantity) VALUES('fixture-batch','private-digest',$1,$2,2)",[user.id,user.wallet_id]);
 await query("INSERT INTO premium_download_redemptions(wallet_id,work_scope,job_id) VALUES($1,'work-support','support-a')",[user.wallet_id]);
 await query("INSERT INTO download_legacy_works(work_id,wallet_id,job_ids) VALUES('saved-legacy',$1,ARRAY['legacy-original'])",[user.wallet_id]);
 await addJob('legacy-original');await group('work-legacy',['legacy-child'],{legacy:'saved-legacy'});
 await group('work-old-group',['old-group-paid','old-group-child']);await query("UPDATE ai_jobs SET usage_id='use_historical' WHERE id='old-group-paid'");
 await group('work-deleted-peer',['deleted-peer','retained-child']);await query('INSERT INTO paid_image_unlocks(wallet_id,job_id,full_edit) VALUES($1,$2,true)',[user.wallet_id,'deleted-peer']);await query("DELETE FROM ai_jobs WHERE id='deleted-peer'");

 const before=await businessSnapshot(),store=createDownloadAuditStore(pool),beforeTables=(await query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row=>row.tablename);
 await check('initialization creates only independent audit tables, without business migrations',async()=>{
  await store.ready();await store.ready();
  const afterTables=(await query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row=>row.tablename);
  assert.deepEqual(afterTables.filter(name=>!beforeTables.includes(name)),['download_attempts','download_events']);
  assert.deepEqual(await businessSnapshot(),before);
 });
 await check('89, 159 and frozen 119 payment provenance matches actual grouped download policy',async()=>{
  for(const [job,packageId,premium]of [['basic-b','download_89_v1',false],['premium-b','download_159_hair_v1',true],['historical-119','download_119_v1',false]]){
   const observed=(await rights([job])).snapshot;
   assert.equal(observed.unlocked,await policy.allowed(user.wallet_id,job));assert.equal(observed.premiumHair,await policy.premiumHair(user.wallet_id,job));
   assert.equal(observed.premiumHair,premium);assert(observed.jobs[0].sources.some(row=>row.kind==='payment'&&row.packageId===packageId));
  }
 });
 await check('code and support unlocks are identified separately from actual payments',async()=>{
  for(const [job,kind,packageId,premium]of [['code-89','code','89',false],['code-159','code','159',true],['support-b','support_credit','159',true]]){
   const observed=(await rights([job])).snapshot;
   assert.equal(observed.unlocked,await policy.allowed(user.wallet_id,job));assert.equal(observed.premiumHair,premium);
   assert(observed.jobs[0].sources.some(row=>row.kind===kind&&row.packageId===packageId));assert(!observed.jobs[0].sources.some(row=>row.kind==='payment'));
  }
 });
 await check('historical paid generations and legacy saved work descendants retain exact exemptions',async()=>{
  for(const [job,options,kind]of [['old-generation',{},'legacy_generation'],['old-group-child',{},'legacy_generation'],['legacy-child',{},'legacy_saved_work'],['legacy-original',{savedWorkId:'saved-legacy'},'legacy_saved_work']]){
   const observed=(await rights([job],options)).snapshot;
   assert.equal(observed.unlocked,await policy.allowed(user.wallet_id,job,options));assert.equal(observed.unlocked,true);assert.equal(observed.premiumHair,false);
   assert(observed.jobs[0].sources.some(row=>row.kind===kind));
  }
  assert.equal((await rights(['unpaid-a'],{savedWorkId:'saved-legacy'})).snapshot.unlocked,false);
 });
 await check('an unlock on a deleted grouped peer remains honored like the production policy',async()=>{
  assert.equal(await policy.allowed(user.wallet_id,'retained-child'),true);assert.equal((await rights(['retained-child'])).snapshot.unlocked,true);
 });
 await check('every exported head needs its own work rights; unrelated grants cannot bleed across scopes',async()=>{
  const observed=(await rights(['basic-b','unpaid-a'])).snapshot;
  assert.equal(observed.unlocked,false);assert.deepEqual(observed.jobs.map(row=>[row.jobId,row.unlocked]),[['basic-b',true],['unpaid-a',false]]);
  assert.equal((await rights(['basic-b','premium-b'])).snapshot.unlocked,true);assert.equal((await rights(['basic-b','premium-b'])).snapshot.premiumHair,false);
 });
 await check('owner override is injected by the server and never fabricates a payment',async()=>{
  const observed=(await rights(['unpaid-a'],{ownerAccess:true})).snapshot;
  assert.equal(observed.unlocked,true);assert.equal(observed.premiumHair,true);assert.equal(observed.paidDownload,false);
  assert.deepEqual(observed.jobs[0].sources,[{kind:'owner_access'}]);
 });
 await check('missing metadata is unknown, while explicit historical positive evidence remains positive',async()=>{
  const tables=new Set(['ai_jobs']);
  assert.equal((await rights(['unpaid-a'],{tables})).snapshot.unlocked,null);
  assert.equal((await rights(['old-generation'],{tables})).snapshot.unlocked,true);
 });
 await check('ownership and completed status are mandatory even when owner mode is enabled',async()=>{
  for(const job of ['foreign-job','not-ready','nonexistent'])await assert.rejects(rights([job],{ownerAccess:true}),error=>error.code==='download_audit_image_not_owned');
 });
 let recorded=batch(['basic-b','basic-a','basic-a'],{email:'fake@example.test',token:'do-not-persist',unlocked:false,credits:999});
 await check('verified identity is stored; duplicate job IDs normalize and body emails or balances are ignored',async()=>{
  const out=await store.record(user,recorded);assert.deepEqual(out.accepted,recorded.events.map(row=>row.eventId));
  const attempt=await one('SELECT * FROM download_attempts WHERE attempt_id=$1',[recorded.attemptId]);
  assert.equal(attempt.email_snapshot,'member@example.test');assert.equal(attempt.wallet_id,user.wallet_id);assert.deepEqual(attempt.job_ids,['basic-a','basic-b']);
  assert.equal(attempt.latest_rights.unlocked,true);assert(!JSON.stringify(attempt).includes('do-not-persist'));assert(!JSON.stringify(attempt).includes('fake@example.test'));
 });
 await check('client reports and server rights facts are separated with server receipt time',async()=>{
  const rows=(await query('SELECT * FROM download_events WHERE attempt_id=$1 ORDER BY id',[recorded.attemptId])).rows;
  assert.deepEqual(rows.map(row=>[row.observer,row.event_type]),[['server','rights_observed'],['client','download_clicked']]);
  assert.equal(new Date(rows[1].client_at).toISOString(),'2026-10-29T03:00:00.000Z');assert(rows[1].received_at);assert(rows[0].client_at===null);
  assert.equal(rows[1].rights_snapshot.unlocked,true);assert(!rows.some(row=>/saved|completed|received_image/.test(row.event_type)));
 });
 await check('retrying the same batch is idempotent and does not create extra clicks or rights observations',async()=>{
  const beforeEvents=await count('download_events');await store.record(user,recorded);await store.record(user,{...recorded,jobIds:['basic-a','basic-b']});
  assert.equal(await count('download_events'),beforeEvents);
 });
 await check('out-of-order delayed events retain client times and append received evidence without ordering assumptions',async()=>{
  const late=event('file_prepared',{clientAt:'2026-10-28T03:00:00Z',fileType:'image/png',byteSize:400,sizeId:'original'});
  await store.record(user,{...recorded,events:[late]});
  const row=await one('SELECT * FROM download_events WHERE event_id=$1',[late.eventId]);
  assert.equal(row.event_type,'file_prepared');assert.equal(new Date(row.client_at).toISOString(),'2026-10-28T03:00:00.000Z');assert.equal(row.metadata.byteSize,400);assert.equal(row.metadata.fileType,'image/png');
 });
 await check('event replay cannot alter payload or be attached to another download attempt',async()=>{
  const beforeEvents=await count('download_events'),beforeAttempts=await count('download_attempts');
  await assert.rejects(store.record(user,{...recorded,events:[{...recorded.events[0],type:'download_requested'}]}),error=>error.code==='download_event_conflict');
  await assert.rejects(store.record(user,batch(['basic-a'],{events:recorded.events})),error=>error.code==='download_event_conflict');
  assert.equal(await count('download_events'),beforeEvents);assert.equal(await count('download_attempts'),beforeAttempts);
 });
 await check('attempt IDs cannot change wallet, account, mode, work, or initiator',async()=>{
  for(const change of [{expectedWalletId:foreign.wallet_id},{jobIds:['premium-a']},{mode:'easy'},{initiator:'automatic_after_unlock'},{savedWorkId:'saved-legacy'}])await assert.rejects(store.record(user,{...recorded,...change}),error=>['download_audit_account_mismatch','download_attempt_conflict'].includes(error.code));
  await assert.rejects(store.record({...user,wallet_id:foreign.wallet_id},batch(['foreign-job'],{expectedWalletId:foreign.wallet_id})),error=>error.code==='download_audit_account_mismatch');
  await assert.rejects(store.record(foreign,{...recorded,expectedWalletId:foreign.wallet_id}),error=>error.code==='download_audit_image_not_owned');
 });
 await check('schema rejects forged server facts, arbitrary errors, image payload fields, and excessive batches',async()=>{
  for(const change of [{expectedWalletId:undefined},{jobIds:[]},{events:[event('rights_observed')]},{events:[event('saved_on_device')]},{events:[event('download_failed',{errorCode:'private_secret'})]},{events:[event('download_failed',{errorStage:'some_raw_error'})]},{events:Array.from({length:21},()=>event())},{events:[event('file_prepared',{byteSize:-1})]},{events:[event('file_prepared',{fileType:'application/json'})]},{photo:'data:image/png;base64,'+'x'.repeat(24000)}])assert.throws(()=>normalizeDownloadAuditBatch(batch(['basic-a'],change)),error=>error.code==='invalid_download_event');
  const safe=normalizeDownloadAuditBatch(batch(['basic-a'],{events:[event('download_failed',{errorStage:'render',errorCode:'blob_failed'})],password:'ignored',photo:'small-ignored'}));
  assert(!JSON.stringify(safe).includes('ignored'));assert.equal(safe.events[0].errorCode,'blob_failed');
 });
 await check('share handoff, cancellation, panel open, and save clicks are distinct client events',async()=>{
  const types=['save_panel_opened','save_clicked','share_clicked','share_handoff','share_cancelled','panel_closed'];
  const attempt=batch(['premium-b'],{mode:'easy',deviceClass:'mobile',browserFamily:'safari',events:types.map(type=>event(type,{method:type.startsWith('share')?'web_share':'mobile_panel'}))});
  await store.record(user,attempt);
  const rows=(await query("SELECT event_type,observer FROM download_events WHERE attempt_id=$1 AND observer='client' ORDER BY id",[attempt.attemptId])).rows;
  assert.deepEqual(rows.map(row=>row.event_type),types);assert(rows.every(row=>row.observer==='client'));
 });
 await check('right snapshots can change on retry without rewriting earlier client evidence',async()=>{
  const unpaid=batch(['unpaid-a']);await store.record(user,unpaid);
  await query('INSERT INTO paid_image_unlocks(wallet_id,job_id,full_edit) VALUES($1,$2,true)',[user.wallet_id,'unpaid-a']);
  await store.record(user,{...unpaid,events:[event('download_requested',{method:'desktop_anchor'})]});
  const rows=(await query('SELECT event_type,rights_snapshot FROM download_events WHERE attempt_id=$1 ORDER BY id',[unpaid.attemptId])).rows;
  assert.equal(rows[0].rights_snapshot.unlocked,false);assert.equal(rows[1].rights_snapshot.unlocked,false);assert.equal(rows.at(-1).rights_snapshot.unlocked,true);
  assert.equal(rows.filter(row=>row.event_type==='rights_observed').length,2);
  await query('DELETE FROM paid_image_unlocks WHERE wallet_id=$1 AND job_id=$2',[user.wallet_id,'unpaid-a']);
 });
 await check('duplicate-payment reconciliation metadata does not revoke the original valid grant',async()=>{
  await query("INSERT INTO download_payment_receipts(session_id,wallet_id,work_scope,package_id,overlap,refund_status) VALUES('pi_duplicate',$1,'work-basic','download_89_v1',true,'succeeded')",[user.wallet_id]);
  const observed=(await rights(['basic-b'])).snapshot;
  assert.equal(observed.unlocked,true);assert(observed.jobs[0].sources.some(row=>row.kind==='payment'&&row.overlap&&row.refundStatus==='succeeded'));
  await query("DELETE FROM download_payment_receipts WHERE session_id='pi_duplicate'");
 });
 await check('deleted source can append exact frozen attempts as unknown; new attempts still require ownership',async()=>{
  const temporary='retention-job';await addJob(temporary);const attempt=batch([temporary]);await store.record(user,attempt);await query('DELETE FROM ai_jobs WHERE id=$1',[temporary]);
  await store.record(user,{...attempt,events:[event('panel_closed')]});
  const stored=await one('SELECT latest_rights FROM download_attempts WHERE attempt_id=$1',[attempt.attemptId]);assert.equal(stored.latest_rights.unlocked,null);assert.equal(stored.latest_rights.reason,'source_no_longer_available');
  await assert.rejects(store.record(user,batch([temporary])),error=>error.code==='download_audit_image_not_owned');
  assert.equal((await query('SELECT * FROM download_events WHERE attempt_id=$1',[attempt.attemptId])).rows.length,4);
 });
 await check('database failures roll back partial audit writes and can recover without business side effects',async()=>{
  let broken=true;
  // Trigger after the attempt and server event have been inserted.
  const throwingPool={async connect(){const client=await pool.connect();return {...client,async query(sql,args){if(broken&&sql.includes("VALUES($1,$2,$3,'client'"))throw Error('injected-write-failure');return client.query(sql,args)}}}};
  const rollbackStore=createDownloadAuditStore(throwingPool);await rollbackStore.ready();const attempt=batch(['basic-a']),beforeEvents=await count('download_events'),beforeAttempts=await count('download_attempts');
  await assert.rejects(rollbackStore.record(user,attempt),/injected-write-failure/);assert.equal(await count('download_events'),beforeEvents);assert.equal(await count('download_attempts'),beforeAttempts);
  broken=false;await rollbackStore.record(user,attempt);assert.equal(await count('download_attempts'),beforeAttempts+1);
  let connections=0;const recovery=createDownloadAuditStore({async connect(){if(connections++===0)throw Error('temporarily-disconnected');return pool.connect()}});
  await assert.rejects(recovery.ready(),/temporarily-disconnected/);await recovery.ready();
 });
 await check('all observation paths leave balances, payments, rights, support and saved works unchanged',async()=>{
  assert.deepEqual(await businessSnapshot(),before);
  const mutations=queries.filter(sql=>/^\s*(?:UPDATE|INSERT INTO|DELETE FROM)/i.test(sql));
  assert(mutations.some(sql=>sql.startsWith('INSERT INTO download_events')));
 });
 let clock=Date.now(),enabled=true;
 const app=express();app.use(express.json({limit:'24kb'}));
 // This route is registered before any business auth middleware, like production.
 const isolatedAuth=createDownloadAuditAuth(pool),verified=express();
 registerDownloadAuditApi(verified,{store,authUser:isolatedAuth,isOwner:isPrivateOwner});app.use('/verified',verified);
 app.use((req,res,next)=>{if(req.get('X-Fixture-Session')==='main')req.accountUser=user;if(req.get('X-Fixture-Session')==='foreign')req.accountUser=foreign;next()});
 registerDownloadAuditApi(app,{store,authUser:async()=>null,isOwner:req=>req.get('X-Fixture-Owner')==='1'&&req.accountUser===user,enabled:()=>enabled,now:()=>clock});
 const unavailable=express();unavailable.use(express.json());registerDownloadAuditApi(unavailable,{store:{record(){throw Error('DB-DOWN-private-message')}},authUser:async()=>user});app.use('/unavailable',unavailable);
 server=http.createServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 const request=async(body,{session='main',path='/api/download-events',headers={}}={})=>{
  const r=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...(session?{'X-Fixture-Session':session}:{}),...headers},body:JSON.stringify(body)});
  const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,headers:r.headers,data};
 };
 await check('isolated audit auth reads only hashed Bearer sessions without schema or business initialization',async()=>{
  const seen=[];const auth=createDownloadAuditAuth({async query(sql,args){seen.push({sql,args});return pool.query(sql,args)}});
  const account=await auth({get:()=>`Bearer ${tokens.main}`});assert.deepEqual(account,user);
  assert.equal(seen.length,1);assert.match(seen[0].sql,/^SELECT u\.id,u\.email,u\.wallet_id FROM user_sessions s JOIN users u/);assert.deepEqual(seen[0].args,[tokenHash(tokens.main)]);
  assert(!seen[0].sql.includes(tokens.main));assert(!JSON.stringify(seen[0]).includes(tokens.main));
  for(const header of ['',`Basic ${tokens.main}`,'Bearer '+('x'.repeat(513)),'Bearer'+(' '.repeat(4096))+tokens.main])assert.equal(await auth({get:()=>header}),null);
  assert.equal(seen.length,1);
 });
 await check('real Bearer auth accepts live sessions and rejects expired, revoked, and unknown sessions',async()=>{
  for(const token of [tokens.expired,tokens.revoked,'unknown-test-token'])assert.equal((await request(batch(),{path:'/verified/api/download-events',headers:{Authorization:'Bearer '+token}})).status,401);
  const out=await request(batch(),{path:'/verified/api/download-events',headers:{Authorization:'Bearer '+tokens.main}});assert.equal(out.status,200);assert.equal(out.data.ok,true);
 });
 await check('Bearer account identity ignores forged wallet/email headers and supplies verified owner identity',async()=>{
  const target=batch(['owner-unpaid'],{expectedWalletId:owner.wallet_id});
  const fakeHeaders={Authorization:'Bearer '+tokens.main,'X-Wallet-Id':owner.wallet_id,'X-Email':owner.email};
  assert.equal((await request(target,{path:'/verified/api/download-events',headers:fakeHeaders})).status,403);
  const out=await request(target,{path:'/verified/api/download-events',headers:{Authorization:'Bearer '+tokens.owner,'X-Wallet-Id':user.wallet_id}});assert.equal(out.status,200);
  const attempt=await one('SELECT latest_rights,wallet_id FROM download_attempts WHERE user_id=$1 AND attempt_id=$2',[owner.id,target.attemptId]);
  assert.equal(attempt.wallet_id,owner.wallet_id);assert.equal(attempt.latest_rights.ownerAccess,true);assert.equal(attempt.latest_rights.unlocked,true);assert.equal(attempt.latest_rights.paidDownload,false);
 });
 await check('missing auth tables return audit-only unavailable without creating them or calling business auth',async()=>{
  await db.exec('CREATE SCHEMA audit_auth_missing;SET search_path TO audit_auth_missing');
  try{
   const out=await request(batch(),{path:'/verified/api/download-events',headers:{Authorization:'Bearer '+tokens.main}});assert.equal(out.status,503);assert.deepEqual(out.data,{error:'download_audit_unavailable'});
   assert.equal((await query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='audit_auth_missing'")).rows[0].n,0);
  }finally{await db.exec('SET search_path TO public;DROP SCHEMA audit_auth_missing')}
 });
 await check('HTTP rejects anonymous and cross-account requests, ignoring spoofed account headers',async()=>{
  assert.equal((await request(batch(),{session:null,headers:{'X-Wallet-Id':user.wallet_id}})).status,401);
  assert.equal((await request(batch(),{session:'foreign'})).status,403);
  const out=await request(batch());assert.equal(out.status,200);assert.equal(out.headers.get('Cache-Control'),'no-store');assert.equal(out.data.ok,true);
 });
 await check('HTTP validation and database errors are bounded generic responses without private details',async()=>{
  assert.equal((await request(batch(['foreign-job']))).status,404);
  assert.equal((await request(batch(['basic-a'],{events:[event('rights_observed')]}))).status,400);
  const out=await request(batch(),{path:'/unavailable/api/download-events'});assert.equal(out.status,503);assert.deepEqual(out.data,{error:'download_audit_unavailable'});
 });
 await check('HTTP feature switch turns off storage with no new side effects',async()=>{
  enabled=false;const beforeEvents=await count('download_events');assert.equal((await request(batch())).status,204);assert.equal(await count('download_events'),beforeEvents);enabled=true;
 });
 await check('authenticated request rate limit is bounded and recovers in a new minute',async()=>{
  const reusable=batch();let limited=false;
  for(let i=0;i<65;i++){const response=await request(reusable);if(response.status===429){limited=true;break}assert.equal(response.status,200)}
  assert.equal(limited,true);clock+=60001;assert.equal((await request(reusable)).status,200);
 });
 await check('HTTP accepted events still preserve every business table',async()=>{assert.deepEqual(await businessSnapshot(),before)});
 console.log(JSON.stringify({passed:cases.length,cases,engine:'PostgreSQL WASM + actual Express HTTP',productionAccess:false,providerCalls:0,scope:'Actual audit schema/store/API, isolated hashed Bearer session SQL, and read-only rights matched against the existing production download policy. Bookkeeping fixtures and additional real Bearer HTTP endpoints run only on local test accounts.',limits:'One PostgreSQL session: native multi-worker contention is not exercised. Client facts cannot establish a file saved on the device.'}));
}finally{
 if(server){server.close();server.closeAllConnections();await once(server,'close')}
 await db.close();
}
