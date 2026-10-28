// Integration checks use disposable SQL and local HTTP. No real account or payment access.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import express from 'express';
import {requestDownloadPolicy} from '../account-feature-policy.js';
import {createPremiumDownloadCredits,recipientHashForEmail} from '../premium-download-credits.js';
import {PREMIUM_DOWNLOAD_BATCHES} from '../premium-download-batches.js';

const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),cases=[],jobs=new Map();
const query=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.rowCount??r.affectedRows??r.rows.length}};
const pool={query,async connect(){return {query,release(){}}}};
const accounts=Object.fromEntries(['member-a','member-b','foreign'].map(name=>[name,{id:'user-'+name,email:name+'@example.test',wallet_id:'wallet-'+name}]));
const batches=['member-a','member-b'].map(name=>({batchId:'integration-finite-v1',recipientHash:recipientHashForEmail(accounts[name].email),quantity:2}));
const check=async(name,test)=>{await test();cases.push(name);console.log('PASS '+name)};
const one=async(sql,args)=>(await query(sql,args)).rows[0];
let policy,credits,server;
const walletId=req=>req.accountUser?.wallet_id||String(req.get('X-Wallet-Id')||'').trim();
const policyFor=req=>requestDownloadPolicy(req,policy,{premiumCredits:credits});
const reqFor=(account,headers={},body={})=>({accountUser:account,body,get:name=>headers[name.toLowerCase()]||''});
const walletShape=async wallet=>{const r=await one('SELECT * FROM wallets WHERE id=$1',[wallet]),n=r.generation_remaining+r.hair_remaining;return {walletId:wallet,generationRemaining:n,hairRemaining:n,processRemaining:n,downloadRemaining:n}};
const count=async(table,wallet)=>(await one(`SELECT count(*)::int AS n FROM ${table} WHERE wallet_id=$1`,[wallet])).n;
const addJob=async(name,id,{scope='',status='completed'}={})=>{
 const wallet=accounts[name].wallet_id;
 const work=scope||await policy.beginWork(wallet,Buffer.from('immutable-original-'+id));
 await query('INSERT INTO ai_jobs(id,wallet_id,usage_id,status) VALUES($1,$2,$3,$4)',[id,wallet,'free_fixture',status]);
 await policy.attach(wallet,work,id);
 jobs.set(id,{id,wallet_id:wallet,status,result:Buffer.from('fixture-clean-png-'+id)});return work;
};
try{
 await db.exec(`CREATE TABLE wallets(id text PRIMARY KEY,credits int NOT NULL DEFAULT 0,generation_remaining int NOT NULL DEFAULT 0,hair_remaining int NOT NULL DEFAULT 0,full_edit_remaining int NOT NULL DEFAULT 0);
 CREATE TABLE users(id text PRIMARY KEY,email text UNIQUE NOT NULL,wallet_id text UNIQUE NOT NULL REFERENCES wallets(id));
 CREATE TABLE payments(session_id text PRIMARY KEY,wallet_id text NOT NULL);
 CREATE TABLE promo_redemptions(code text PRIMARY KEY,wallet_id text NOT NULL);
 CREATE TABLE paid_image_unlocks(wallet_id text NOT NULL,job_id text NOT NULL,full_edit boolean NOT NULL DEFAULT false,PRIMARY KEY(wallet_id,job_id));
 CREATE TABLE credit_usage(id text PRIMARY KEY,wallet_id text NOT NULL,kind text NOT NULL,status text NOT NULL,credit_column text,full_edit_output boolean NOT NULL DEFAULT false,completed_at timestamptz);
 CREATE TABLE ai_jobs(id text PRIMARY KEY,wallet_id text NOT NULL,usage_id text NOT NULL,status text NOT NULL);
 CREATE TABLE saved_studio_work(id text PRIMARY KEY,wallet_id text NOT NULL,name text NOT NULL,project jsonb NOT NULL);`);
 for(const [name,user] of Object.entries(accounts)){
  await query('INSERT INTO wallets(id,credits,generation_remaining,hair_remaining,full_edit_remaining) VALUES($1,23,$2,$3,7)',[user.wallet_id,name==='member-b'?3:0,name==='member-b'?2:0]);
  await query('INSERT INTO users(id,email,wallet_id) VALUES($1,$2,$3)',[user.id,user.email,user.wallet_id]);
 }
 const source=await readFile(new URL('../download-policy-store.js',import.meta.url),'utf8');
 const factory=new Function('crypto',source.slice(source.indexOf('export function createDownloadPolicy'),source.lastIndexOf('\nconst pool=')).replace(/^export /,'')+';return createDownloadPolicy;')(crypto);
 policy=factory(pool);await policy.ready();
 credits=createPremiumDownloadCredits(pool,{prepare:policy.ready,batches,allowed:policy.allowed,premiumHair:policy.premiumHair});await credits.ready();
 const serverSource=await readFile(new URL('../server.js',import.meta.url),'utf8');
 const app=express();app.use(express.json());
 // Only this fixture replaces token verification; production handlers consume the verified object.
 app.use((req,res,next)=>{req.accountUser=accounts[req.get('X-Test-Session')]||null;next()});
 app.get('/fixture/summary',async(req,res)=>{try{res.json({...await walletShape(walletId(req)),...await policyFor(req).summary(walletId(req))})}catch(error){res.status(error.status||503).json({error:'summary_failed'})}});
 const start=serverSource.indexOf("app.get('/api/ai-jobs/:id/result'"),end=serverSource.indexOf('\nconst resumeQueuedAiJobs=',start);
 assert(start>=0&&end>start);
 new Function('env',`with(env){${serverSource.slice(start,end)}}`)({
  app,walletId,accountPolicy:policyFor,getWallet:walletShape,downloadPolicy:policy,
  getAiJobResult:async(id,wallet)=>{const j=jobs.get(id);return j?.wallet_id===wallet?j:null},
  authUser:async req=>req.accountUser,walletHasAccount:async()=>true,claimTrialImage:async()=>{throw Error('unexpected claim')}
 });
 server=http.createServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');
 const origin='http://127.0.0.1:'+server.address().port;
 const request=async(path,{session='member-a',method='GET',body,headers={}}={})=>{
  const r=await fetch(origin+path,{method,headers:{...headers,...(session?{'X-Test-Session':session}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,headers:r.headers,data};
 };
 await check('production wiring uses two hashed two-credit recipients and strict explicit premium intent',async()=>{
  assert.equal(PREMIUM_DOWNLOAD_BATCHES.length,2);assert.equal(new Set(PREMIUM_DOWNLOAD_BATCHES.map(row=>row.recipientHash)).size,2);
  for(const row of PREMIUM_DOWNLOAD_BATCHES){assert.equal(row.quantity,2);assert.match(row.recipientHash,/^[a-f0-9]{64}$/)}
  const config=await readFile(new URL('../premium-download-batches.js',import.meta.url),'utf8');assert(!config.includes('@'));
  assert.match(serverSource,/batches:PREMIUM_DOWNLOAD_BATCHES/);assert.match(serverSource,/premiumCredits:premiumDownloadCredits/);assert.match(serverSource,/premium:req\.body\?\.premium===true/);
 });
 await check('anonymous and wrong-wallet summaries never activate or reveal premium credits',async()=>{
  const wallet=accounts['member-a'].wallet_id;
  const anon=await policyFor(reqFor(null,{'x-wallet-id':wallet},{email:accounts['member-a'].email})).summary(wallet);
  assert.equal(anon.premiumDownloadRemaining,0);assert.equal(await count('premium_download_grants',wallet),0);
  const other=await policyFor(reqFor(accounts.foreign)).summary(wallet);
  assert.equal(other.premiumDownloadRemaining,0);assert.equal(await count('premium_download_grants',wallet),0);
  await assert.rejects(policyFor(reqFor({...accounts.foreign,email:accounts['member-a'].email})).summary(accounts.foreign.wallet_id),error=>error.status===403);
 });
 const aScope=await addJob('member-a','a1');await addJob('member-a','a1-peer',{scope:aScope});await addJob('member-a','a2');await addJob('member-a','a3');await addJob('member-a','a-pending',{status:'queued'});await addJob('foreign','foreign-job');
 await check('verified summaries activate once and preserve legacy counters and saving policy',async()=>{
  for(const name of ['member-a','member-b']){
   const wallet=accounts[name].wallet_id,before=await one('SELECT * FROM wallets WHERE id=$1',[wallet]),base=await policy.summary(wallet);
   const out=await request('/fixture/summary',{session:name});assert.equal(out.status,200);assert.equal(out.data.premiumDownloadRemaining,2);
   assert.equal(out.data.canSave,base.canSave);assert.equal(out.data.unlimitedDownloads,false);assert.equal(out.data.allFeatures,false);assert.equal(out.data.ownerAccess,false);
   assert.deepEqual(await one('SELECT * FROM wallets WHERE id=$1',[wallet]),before);
   assert.equal((await request('/fixture/summary',{session:name})).data.premiumDownloadRemaining,2);assert.equal(await count('premium_download_grants',wallet),1);
  }
  assert.equal((await request('/fixture/summary')).data.canSave,false);
 });
 await check('unlock rejects anonymous requests and foreign or unfinished jobs without debit',async()=>{
  const wallet=accounts['member-a'].wallet_id;
  const fake={email:accounts['member-a'].email,walletId:wallet,premiumDownloadRemaining:99,premium:true};
  assert.equal((await request('/api/images/a1/unlock',{session:null,method:'POST',body:fake,headers:{'X-Wallet-Id':wallet}})).status,401);
  for(const id of ['foreign-job','a-pending','missing'])assert.equal((await request('/api/images/'+id+'/unlock',{method:'POST',body:fake})).status,404);
  assert.equal((await request('/api/images/a1/unlock',{session:'foreign',method:'POST',body:fake,headers:{'X-Wallet-Id':wallet}})).status,404);
  assert.equal(await count('premium_download_redemptions',wallet),0);assert.equal(await count('premium_download_grants',accounts.foreign.wallet_id),0);
 });
 await check('an unpaid completed work becomes clean with premium hair and five suits after one support credit',async()=>{
  assert.deepEqual((await request('/api/images/a1/rights')).data,{unlocked:false,fullEdit:false,premiumHair:false,paidDownload:false});
  const preview=await request('/api/ai-jobs/a1/result');assert.equal(preview.status,200);assert.equal(preview.headers.get('X-IDPROM-Trial'),'1');
  const unlock=await request('/api/images/a1/unlock',{method:'POST'});assert.equal(unlock.status,200);assert.equal(unlock.data.premiumDownloadRemaining,1);assert.equal(unlock.data.processRemaining,0);
  assert.deepEqual((await request('/api/images/a1-peer/rights')).data,{unlocked:true,fullEdit:true,premiumHair:true,paidDownload:true});
  const clean=await request('/api/ai-jobs/a1/result');assert.equal(clean.status,200);assert.equal(clean.headers.get('X-IDPROM-Trial'),'0');assert.equal(clean.data,preview.data);
  for(let i=0;i<5;i++){const suit=await request('/api/images/a1/suits',{method:'POST',body:{templates:['/suit-'+i+'.png']}});assert.equal(suit.status,200);assert.equal(suit.data.limit,5)}
  assert.equal((await request('/api/images/a1-peer/suits',{method:'POST',body:{templates:['/suit-six.png']}})).status,409);
 });
 await check('repeated files and grouped renders reuse one unlock while the third distinct work stays locked',async()=>{
  for(const id of ['a1','a1-peer'])for(let i=0;i<2;i++){
   const reuse=await request('/api/images/'+id+'/unlock',{method:'POST',body:{premium:true}});assert.equal(reuse.status,200);assert.equal(reuse.data.reused,true);assert.equal(reuse.data.premiumDownloadRemaining,1);
  }
  assert.equal((await request('/api/images/a2/unlock',{method:'POST'})).data.premiumDownloadRemaining,0);
  const denied=await request('/api/images/a3/unlock',{method:'POST',body:{premium:true}});assert.equal(denied.status,402);assert.equal(denied.data.error,'premium_download_credit_required');
  assert.equal((await request('/api/images/a3/unlock',{method:'POST'})).status,402);
  assert.deepEqual((await request('/api/images/a3/rights')).data,{unlocked:false,fullEdit:false,premiumHair:false,paidDownload:false});
  assert.equal((await request('/api/ai-jobs/a3/result')).headers.get('X-IDPROM-Trial'),'1');
  assert.equal(await count('premium_download_redemptions',accounts['member-a'].wallet_id),2);
  assert.equal((await request('/fixture/summary')).data.premiumDownloadRemaining,0);
 });
 await addJob('member-b','b-basic');await addJob('member-b','b-new');await addJob('member-b','b-third');
 await query('INSERT INTO paid_image_unlocks(wallet_id,job_id,full_edit) VALUES($1,$2,true)',[accounts['member-b'].wallet_id,'b-basic']);
 await check('basic-paid work reuses existing rights and only intentional premium upgrade consumes support credit',async()=>{
  const wallet=accounts['member-b'].wallet_id,before=await one('SELECT * FROM wallets WHERE id=$1',[wallet]);
  const reused=await request('/api/images/b-basic/unlock',{session:'member-b',method:'POST'});assert.equal(reused.status,200);assert.equal(reused.data.reused,true);assert.equal(reused.data.premiumDownloadRemaining,2);
  assert.equal((await request('/api/images/b-basic/rights',{session:'member-b'})).data.premiumHair,false);
  const upgraded=await request('/api/images/b-basic/unlock',{session:'member-b',method:'POST',body:{premium:true}});assert.equal(upgraded.status,200);assert.equal(upgraded.data.premiumDownloadRemaining,1);
  assert.equal((await request('/api/images/b-basic/rights',{session:'member-b'})).data.premiumHair,true);
  assert.deepEqual(await one('SELECT * FROM wallets WHERE id=$1',[wallet]),before);
 });
 await check('premium exhaustion never debits old credits for an explicit upgrade and legacy fallback stays basic',async()=>{
  const wallet=accounts['member-b'].wallet_id;
  assert.equal((await request('/api/images/b-new/unlock',{session:'member-b',method:'POST'})).data.premiumDownloadRemaining,0);
  const before=await one('SELECT * FROM wallets WHERE id=$1',[wallet]);
  assert.equal((await request('/api/images/b-third/unlock',{session:'member-b',method:'POST',body:{premium:true}})).status,402);
  assert.deepEqual(await one('SELECT * FROM wallets WHERE id=$1',[wallet]),before);
  const legacy=await request('/api/images/b-third/unlock',{session:'member-b',method:'POST'});assert.equal(legacy.status,200);assert.equal(legacy.data.premiumDownloadRemaining,0);assert.equal(legacy.data.processRemaining,4);
  assert.deepEqual((await request('/api/images/b-third/rights',{session:'member-b'})).data,{unlocked:true,fullEdit:true,premiumHair:false,paidDownload:true});
  assert.equal((await request('/api/images/b-third/suits',{session:'member-b',method:'POST',body:{templates:['/legacy-suit.png']}})).data.limit,3);
  assert.equal(await count('premium_download_redemptions',wallet),2);assert.equal((await one('SELECT count(*)::int AS n FROM payments')).n,0);
 });
 const result={passed:cases.length,cases,scope:'Actual account policy, SQL credit and legacy download stores, and production result/rights/suit/unlock HTTP handlers. Local verified-session fixtures replace authentication only; no real account, Stripe call, image generation, or live deployment was tested.'};
 if(process.env.PREMIUM_ACCOUNT_RESULTS)await writeFile(process.env.PREMIUM_ACCOUNT_RESULTS,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}finally{
 if(server){server.close();server.closeAllConnections();await once(server,'close')}
 await db.close();
}
