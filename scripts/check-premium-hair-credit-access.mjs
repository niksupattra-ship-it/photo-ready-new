// Actual generation routes + entitlement stores against disposable SQL.
// Providers, token verification and job execution are local inert fixtures.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import express from 'express';
import {requestDownloadPolicy} from '../account-feature-policy.js';
import {createPremiumDownloadCredits,recipientHashForEmail} from '../premium-download-credits.js';
import {PRODUCTION_HAIR_CATALOG,downloadHairAllowed} from '../hairstyle-catalog.js';
import {hasPrivateTrial,isPrivateOwner} from '../private-trial.js';

const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),cases=[],providerCalls=[],commits=[];
const query=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.rowCount??r.affectedRows??r.rows.length}};
const pool={query,async connect(){return {query,release(){}}}};
const accounts=Object.fromEntries(['member','other','basic'].map(name=>[name,{id:'user-'+name,email:name+'@example.test',wallet_id:'wallet-'+name}]));
const member=accounts.member,walletId=req=>req.accountUser?.wallet_id||String(req.get('X-Wallet-Id')||'').trim();
const batches=[{batchId:'hair-access-local-v1',recipientHash:recipientHashForEmail(member.email),quantity:2}];
const check=async(name,test)=>{await test();cases.push(name);console.log('PASS '+name)};
let policy,credits,server,serial=0;
const one=async(sql,args)=>(await query(sql,args)).rows[0];
const balance=async()=> (await credits.summary(member.wallet_id)).premiumDownloadRemaining;
const policyFor=req=>requestDownloadPolicy(req,policy,{premiumCredits:credits});
const reqFor=(user,body={})=>({accountUser:user,body,get:()=>''});
const source=await readFile(new URL('../server.js',import.meta.url),'utf8');
const capture=(from,to)=>{const a=source.indexOf(from),b=source.indexOf(to,a);assert(a>=0&&b>a,from);return source.slice(a,b)};
const addJob=async(wallet,id,scope='')=>{
 const work=scope||await policy.beginWork(wallet,Buffer.from('original-'+id));
 await query("INSERT INTO ai_jobs(id,wallet_id,usage_id,status) VALUES($1,$2,'free_fixture','completed')",[id,wallet]);
 await policy.attach(wallet,work,id);return work;
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
 for(const user of Object.values(accounts)){
  await query('INSERT INTO wallets(id) VALUES($1)',[user.wallet_id]);
  await query('INSERT INTO users(id,email,wallet_id) VALUES($1,$2,$3)',[user.id,user.email,user.wallet_id]);
 }
 const store=await readFile(new URL('../download-policy-store.js',import.meta.url),'utf8');
 policy=new Function('crypto',store.slice(store.indexOf('export function createDownloadPolicy'),store.lastIndexOf('\nconst pool=')).replace(/^export /,'')+';return createDownloadPolicy;')(crypto)(pool);
 await policy.ready();credits=createPremiumDownloadCredits(pool,{prepare:policy.ready,batches,allowed:policy.allowed,premiumHair:policy.premiumHair});
 const scopeA=await addJob(member.wallet_id,'a1');await addJob(member.wallet_id,'a1-peer',scopeA);
 const scopeB=await addJob(member.wallet_id,'a2');await addJob(member.wallet_id,'a3');
 const basicScope=await addJob(accounts.basic.wallet_id,'basic1');
 await query('INSERT INTO paid_image_unlocks(wallet_id,job_id,full_edit) VALUES($1,$2,true)',[accounts.basic.wallet_id,'basic1']);
 const getWallet=async wallet=>({walletId:wallet,processRemaining:0,generationRemaining:0,hairRemaining:0});
 const gateEnv={walletId,accountPolicy:policyFor,hasPrivateTrial,isPrivateOwner,crypto,getWallet,PRODUCTION_HAIR_CATALOG,downloadHairAllowed};
 const requireCredit=new Function('env',`with(env){${capture('async function requireCredit(','\nconst upload=')};return requireCredit}`)(gateEnv);
 const app=express();app.use(express.json());
 app.use(async(req,res,next)=>{try{req.accountUser=accounts[req.get('X-Test-Session')]||null;let buffer=Buffer.from('input-png-local');if(req.body?.downloadWorkId){try{buffer=(await policy.inputForWork(walletId(req),req.body.downloadWorkId)).buffer}catch{}}const image={buffer,mimetype:'image/png',originalname:'fixture.png'};req.file=image;req.files={image:[image]};next()}catch(error){next(error)}});
 const noopUpload=(req,res,next)=>next(),upload={single:()=>noopUpload,fields:()=>noopUpload};
 const env={...gateEnv,app,upload,requireCredit,dir:'/unused-local-fixture',downloadPolicy:policy,
  process:{env:{ARK_API_KEY:'fixture-provider-never-sent'}},validateProductionPortrait(){},getModnetSession:async()=>{},
  editHairstyle:async args=>{providerCalls.push(['hairstyle',args.hairId]);return {provider:'fixture',png:Buffer.from('fixture-png')}},
  processProductionPortrait:async args=>{providerCalls.push(['portrait',args.fields.hairId]);return Buffer.from('fixture-png')},
  modnetRemoveBackground:async buffer=>buffer,commitCredit:async id=>commits.push(id),refundCredit:async()=>{},
  createAiJob:async args=>{const id='generated-'+(++serial);await query("INSERT INTO ai_jobs(id,wallet_id,usage_id,status) VALUES($1,$2,$3,'queued')",[id,args.walletId,args.usageId]);return id},
  failAiJob:async()=>{},runAiJob:()=>{throw Error('No live AI execution allowed')},setImmediate:()=>{},console:{info(){},error(){},warn(){}}
 };
 new Function('env',`with(env){${capture('app.post("/api/hairstyle/edit"','\n// Optional, post-head')}}`)(env);
 new Function('env',`with(env){${capture("app.post('/api/ai-jobs',","app.post('/api/ai-jobs/:id/:action'")}}`)(env);
 new Function('env',`with(env){${capture("app.get('/api/ai-jobs/:id/result'",'\nconst resumeQueuedAiJobs=')}}`)({...env,
  getAiJobResult:async(id,wallet)=>{const j=await one('SELECT * FROM ai_jobs WHERE id=$1 AND wallet_id=$2',[id,wallet]);return j?{...j,result:Buffer.from('fixture-png')}:null},authUser:async req=>req.accountUser,walletHasAccount:async()=>true,claimTrialImage:async()=>false
 });
 server=http.createServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 const request=async(path,{session='member',body,method=body?'POST':'GET',headers={}}={})=>{
  const r=await fetch(origin+path,{method,headers:{...(session?{'X-Test-Session':session}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
  const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data,headers:r.headers};
 };
 const routes=['/api/ai-jobs','/api/ai-finish','/api/hairstyle/edit'];
 const hairOptions=['seedream-07','seedream-29'];
 assert(hairOptions.every(id=>PRODUCTION_HAIR_CATALOG.some(h=>h.id===id)));
 const generate=async({session='member',work='',expected=200,headers={},extra={}}={})=>{
  for(const route of routes)for(const hairId of hairOptions){const r=await request(route,{session,headers,body:{hairId,downloadWorkId:work,...extra}});assert.equal(r.status,expected===200&&route==='/api/ai-jobs'?202:expected,route+' '+hairId+' '+JSON.stringify(r.data));}
 };
 await check('verified balance opens male and female premium hair on every production generation entry without spending a download credit',async()=>{
  assert.equal(await balance(),0);await generate();assert.equal(await balance(),2);
  assert.equal(await policy.allowed(member.wallet_id,'a1'),false);assert.equal(await policy.premiumHair(member.wallet_id,'a1'),false);
  assert.deepEqual((await request('/api/images/a1/rights')).data,{unlocked:false,fullEdit:false,premiumHair:false,paidDownload:false});
  assert.equal((await request('/api/ai-jobs/a1/result')).headers.get('X-IDPROM-Trial'),'1');
  assert.equal((await one('SELECT count(*)::int AS n FROM premium_download_redemptions')).n,0);
 });
 await check('anonymous copied wallet and another signed-in account cannot use or activate recipient hair access',async()=>{
  const calls=providerCalls.length;
  await generate({session:null,headers:{'X-Wallet-Id':member.wallet_id},expected:403,extra:{email:member.email,premiumDownloadRemaining:99}});
  await generate({session:'other',headers:{'X-Wallet-Id':member.wallet_id},expected:403,extra:{email:member.email,premiumDownloadRemaining:99}});
  assert.equal(providerCalls.length,calls);assert.equal(await balance(),2);
  assert.equal(await policyFor(reqFor(accounts.other)).canGeneratePremiumHair(member.wallet_id),false);
  assert.equal((await credits.summary(accounts.other.wallet_id)).premiumDownloadRemaining,0);
 });
 await check('basic-paid work with no premium support balance retains its original premium lock',async()=>{
  await generate({session:'basic',work:basicScope,expected:403});
  assert.equal(await policy.allowed(accounts.basic.wallet_id,'basic1'),true);assert.equal(await policy.premiumHair(accounts.basic.wallet_id,'basic1'),false);
  assert.equal((await policy.suits(accounts.basic.wallet_id,'basic1',['/basic-suit.png'])).limit,3);
 });
 await check('using the first support credit leaves premium hair available at balance one',async()=>{
  const out=await request('/api/images/a1/unlock',{body:{premium:true}});assert.equal(out.status,200);assert.equal(out.data.premiumDownloadRemaining,1);
  await generate();assert.equal(await balance(),1);
  assert.deepEqual((await request('/api/images/a1-peer/rights')).data,{unlocked:true,fullEdit:true,premiumHair:true,paidDownload:true});
 });
 await check('using the second credit revokes fresh-work premium hair while keeping redeemed work and later renders usable',async()=>{
  const out=await request('/api/images/a2/unlock',{body:{premium:true}});assert.equal(out.status,200);assert.equal(out.data.premiumDownloadRemaining,0);
  await generate({expected:403});await generate({work:scopeA});await generate({work:scopeB});
  await addJob(member.wallet_id,'a1-later',scopeA);
  assert.equal(await policy.premiumHair(member.wallet_id,'a1-later'),true);assert.equal(await policy.allowed(member.wallet_id,'a1-later'),true);
  assert.equal((await policy.suits(member.wallet_id,'a1-later',['/suit-a.png'])).limit,5);
  assert.equal(await balance(),0);assert.equal((await one('SELECT count(*)::int AS n FROM premium_download_redemptions')).n,2);
 });
 await check('zero balance never silently renews and does not unlock a third work or leak a foreign paid-work entitlement',async()=>{
  const count=providerCalls.length;
  for(let i=0;i<2;i++){assert.equal((await policyFor(reqFor(member)).summary(member.wallet_id)).premiumDownloadRemaining,0);await generate({expected:403})}
  await generate({session:'other',work:scopeA,expected:403});assert.equal(providerCalls.length,count);
  assert.deepEqual((await request('/api/images/a3/rights')).data,{unlocked:false,fullEdit:false,premiumHair:false,paidDownload:false});
  assert.equal((await request('/api/images/a3/unlock',{body:{premium:true}})).status,402);
  assert.equal((await one('SELECT count(*)::int AS n FROM premium_download_grants')).n,1);
 });
 await check('standard hairstyles keep working after premium credits expire without financial or generation debits',async()=>{
  for(const route of routes){const r=await request(route,{body:{hairId:'seedream-16'}});assert.equal(r.status,route==='/api/ai-jobs'?202:200)}
  assert.equal(await balance(),0);assert.equal((await one('SELECT count(*)::int AS n FROM payments')).n,0);
  assert.equal((await one('SELECT count(*)::int AS n FROM credit_usage')).n,0);
  assert.equal((await one('SELECT sum(generation_remaining+hair_remaining)::int AS n FROM wallets')).n,0);
  assert(commits.every(id=>/^free_[a-f0-9]+$/.test(id)));
 });
 await check('stale verified recipient identity fails closed against the current database account',async()=>{
  const changed={...member,email:member.email};await query('UPDATE users SET email=$2 WHERE id=$1',[member.id,'retired@example.test']);
  await assert.rejects(policyFor(reqFor(changed)).canGeneratePremiumHair(member.wallet_id),e=>e.status===403);
  await query('UPDATE users SET email=$2 WHERE id=$1',[member.id,member.email]);
 });
 await check('missing storage and malformed balances never authorize premium generation',async()=>{
  const req=reqFor(member),base={premiumWork:async()=>false};
  for(const value of [undefined,null,NaN,Infinity,-1,0,.5,'2',{},true]){
   const testPolicy=requestDownloadPolicy(req,base,{premiumCredits:{activateForAccount:async()=>{},summary:async()=>({premiumDownloadRemaining:value})}});
   assert.equal(await testPolicy.canGeneratePremiumHair(member.wallet_id),false,String(value));
  }
  await assert.rejects(requestDownloadPolicy(req,base,{premiumCredits:{activateForAccount:async()=>{},summary:async()=>{throw Error('storage_unavailable')}}}).canGeneratePremiumHair(member.wallet_id),/storage_unavailable/);
 });
 const result={passed:cases.length,failed:0,cases,scope:'Actual production requireCredit, ai-jobs, ai-finish, hairstyle/edit, output/rights/unlock routes and real download/premium credit SQL stores. All auth sessions, image inputs, provider execution and jobs are local fixtures; no customer account, AI provider or production database is contacted.'};
 if(process.env.PREMIUM_HAIR_RESULTS)await writeFile(process.env.PREMIUM_HAIR_RESULTS,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{if(server){server.close();server.closeAllConnections();await once(server,'close')}await db.close()}
