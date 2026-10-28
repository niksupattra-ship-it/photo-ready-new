// Actual code store and HTTP handlers against disposable SQL. Fixture codes
// are unrelated to the approved production list; no real code is redeemed.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import express from 'express';
import {createPackageUnlockCodeStore,normalizePackageUnlockCode,hashPackageUnlockCode} from '../package-unlock-code-store.js';
import {registerPackageUnlockCodeApi} from '../package-unlock-code-api.js';
import {PACKAGE_UNLOCK_CODES} from '../package-unlock-codes.js';
import {requestDownloadPolicy} from '../account-feature-policy.js';

const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),cases=[],jobs=new Map();let server,injectFailure=false,releaseCount=0;
const query=async(sql,args=[])=>{
 if(injectFailure&&sql.startsWith('INSERT INTO paid_image_unlocks')){injectFailure=false;throw Error('inert simulated write failure')}
 const r=await db.query(sql,args);return {...r,rowCount:r.rowCount??r.affectedRows??r.rows.length};
};
const pool={query,async connect(){return {query,release(){releaseCount++}}}};
const accounts=Object.fromEntries(['a','b','other'].map(key=>[key,{id:'user-'+key,email:key+'@example.invalid',wallet_id:'wallet-'+key}]));
const tokens=Object.fromEntries(['basic','premium','upgrade','extra89','extra159','retry','other','standalone'].map((key,index)=>[key,'ID'+(key.includes('159')||['premium','upgrade','retry'].includes(key)?'159':'89')+'-FIXTURE-'+String(index).padStart(6,'0')]));
const codes=Object.values(tokens).map(code=>({codeHash:hashPackageUnlockCode(code),packageId:code.startsWith('ID159-')?'159':'89'}));
const scalar=async(sql,args=[])=>(await query(sql,args)).rows[0];
const count=async()=>Number((await scalar('SELECT count(*)::int AS n FROM package_unlock_code_redemptions')).n);
const check=async(name,test)=>{await test();cases.push(name);console.log('PASS '+name)};
let policy,store;
const makeStore=()=>createPackageUnlockCodeStore(pool,{prepare:policy.ready,codes,allowed:policy.allowed,premiumHair:policy.premiumHair});
const addJob=async(key,id,{scope='',status='completed',standalone=false}={})=>{
 const wallet=accounts[key].wallet_id;
 const work=standalone?'':scope||await policy.beginWork(wallet,Buffer.from('input-'+id));
 await query('INSERT INTO ai_jobs(id,wallet_id,usage_id,status) VALUES($1,$2,$3,$4)',[id,wallet,'free_code_fixture',status]);
 if(work)await policy.attach(wallet,work,id);
 jobs.set(id,{id,wallet_id:wallet,status,result:Buffer.from('clean-fixture-png-'+id)});return work||'job:'+id;
};
try{
 await db.exec(`CREATE TABLE wallets(id text PRIMARY KEY,credits int NOT NULL DEFAULT 42,generation_remaining int NOT NULL DEFAULT 0,hair_remaining int NOT NULL DEFAULT 0,full_edit_remaining int NOT NULL DEFAULT 0);
 CREATE TABLE users(id text PRIMARY KEY,email text UNIQUE NOT NULL,wallet_id text UNIQUE NOT NULL REFERENCES wallets(id));
 CREATE TABLE payments(session_id text PRIMARY KEY,wallet_id text NOT NULL);
 CREATE TABLE promo_redemptions(code text PRIMARY KEY,wallet_id text NOT NULL);
 CREATE TABLE paid_image_unlocks(wallet_id text NOT NULL,job_id text NOT NULL,full_edit boolean NOT NULL DEFAULT false,PRIMARY KEY(wallet_id,job_id));
 CREATE TABLE credit_usage(id text PRIMARY KEY,wallet_id text NOT NULL,usage_id text,status text NOT NULL);
 CREATE TABLE ai_jobs(id text PRIMARY KEY,wallet_id text NOT NULL,usage_id text NOT NULL,status text NOT NULL);
 CREATE TABLE saved_studio_work(id text PRIMARY KEY,wallet_id text NOT NULL,name text NOT NULL,project jsonb NOT NULL);`);
 for(const account of Object.values(accounts)){
  await query('INSERT INTO wallets(id) VALUES($1)',[account.wallet_id]);
  await query('INSERT INTO users(id,email,wallet_id) VALUES($1,$2,$3)',[account.id,account.email,account.wallet_id]);
 }
 const source=await readFile(new URL('../download-policy-store.js',import.meta.url),'utf8');
 policy=new Function('crypto',source.slice(source.indexOf('export function createDownloadPolicy'),source.lastIndexOf('\nconst pool=')).replace(/^export /,'')+';return createDownloadPolicy;')(crypto)(pool);
 await policy.ready();store=makeStore();await store.ready();
 const basicScope=await addJob('a','basic');await addJob('a','basic-peer',{scope:basicScope});
 const premiumScope=await addJob('a','premium');await addJob('a','premium-peer',{scope:premiumScope});
 await addJob('a','new-work');await addJob('a','queued',{status:'queued'});await addJob('other','foreign');
 const otherScope=await addJob('b','b-work');await addJob('a','standalone',{standalone:true});await addJob('a','rollback');
 await addJob('a','bad-mapping');await query('UPDATE download_work_jobs SET work_id=$2 WHERE job_id=$1',['bad-mapping',otherScope]);
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.accountUser=accounts[req.get('X-Test-Session')]||null;next()});
 registerPackageUnlockCodeApi(app,{store,authUser:async()=>null});
 const serverSource=await readFile(new URL('../server.js',import.meta.url),'utf8');
 const a=serverSource.indexOf("app.get('/api/ai-jobs/:id/result'"),b=serverSource.indexOf('\nconst resumeQueuedAiJobs=',a);
 new Function('env',`with(env){${serverSource.slice(a,b)}}`)({
  app,walletId:req=>req.accountUser?.wallet_id||req.get('X-Wallet-Id')||'',getWallet:async wallet=>({walletId:wallet,processRemaining:0}),
  accountPolicy:req=>requestDownloadPolicy(req,policy),downloadPolicy:policy,getAiJobResult:async(id,wallet)=>jobs.get(id)?.wallet_id===wallet?jobs.get(id):null,
  authUser:async req=>req.accountUser,walletHasAccount:async()=>true,claimTrialImage:async()=>false
 });
 server=http.createServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 const request=async(path,{session='a',body,headers={},method=body?'POST':'GET'}={})=>{
  const response=await fetch(origin+path,{method,headers:{...headers,...(session?{'X-Test-Session':session}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:response.status,headers:response.headers,data};
 };
 const redeem=(code,jobId='basic',options={})=>request('/api/package-codes/redeem',{...options,body:{code,jobId,...options.body}});
 const walletsBefore=(await query('SELECT * FROM wallets ORDER BY id')).rows;
 await check('approved catalog contains exactly ten89 and ten159 hashed codes and no plaintext client dependency',async()=>{
  assert.equal(PACKAGE_UNLOCK_CODES.length,20);assert.equal(new Set(PACKAGE_UNLOCK_CODES.map(row=>row.codeHash)).size,20);
  for(const packageId of ['89','159'])assert.equal(PACKAGE_UNLOCK_CODES.filter(row=>row.packageId===packageId).length,10);
  for(const row of PACKAGE_UNLOCK_CODES)assert.match(row.codeHash,/^[a-f0-9]{64}$/);
  const config=await readFile(new URL('../package-unlock-codes.js',import.meta.url),'utf8');assert(!config.includes('ID89-'));assert(!config.includes('ID159-'));
  assert(serverSource.includes('registerPackageUnlockCodeApi(app,{store:packageUnlockCodeStore,authUser})'));
 });
 await check('normalization permits pasted whitespace and lowercase while rejecting nontext oversized and nonASCII values',async()=>{
  assert.equal(normalizePackageUnlockCode(' id89-abc def-234567 \n'),'ID89-ABCDEF-234567');assert.equal(hashPackageUnlockCode(' \n'+tokens.basic.toLowerCase()),hashPackageUnlockCode(tokens.basic));
  for(const value of [null,undefined,true,{},[],[tokens.basic],17,'x'.repeat(257),'ไทย','ID89_ABC'])assert.equal(hashPackageUnlockCode(value),'');
  assert.throws(()=>createPackageUnlockCodeStore(pool,{codes:[{codeHash:'wrong',packageId:'89'}]}),/invalid_package/);
  assert.throws(()=>createPackageUnlockCodeStore(pool,{codes:[{codeHash:codes[0].codeHash,packageId:'89'},{codeHash:codes[0].codeHash,packageId:'159'}]}),/conflicting_package/);
 });
 await check('anonymous forged account and wallet payloads cannot redeem or consume a code',async()=>{
  const response=await redeem(tokens.basic,'basic',{session:null,headers:{'X-Wallet-Id':accounts.a.wallet_id},body:{email:accounts.a.email,userId:accounts.a.id,walletId:accounts.a.wallet_id}});
  assert.equal(response.status,401);assert.equal(response.data.error,'auth_required');assert.equal(await count(),0);assert.equal(response.headers.get('cache-control'),'no-store');
 });
 await check('raw missing queued foreign or malformed-work jobs are refused before consuming a valid code',async()=>{
  for(const id of ['',null,{},'missing','queued','foreign','bad-mapping']){const response=await redeem(tokens.basic,id);assert.equal(response.status,404,String(id));assert.equal(await count(),0)}
  const other=await redeem(tokens.basic,'basic',{session:'other',headers:{'X-Wallet-Id':accounts.a.wallet_id}});assert.equal(other.status,404);assert.equal(await count(),0);
 });
 await check('database account binding rejects a stale session candidate without a code grant',async()=>{
  await assert.rejects(store.redeem({...accounts.a,id:accounts.other.id},tokens.basic,'basic'),error=>error.status===403&&error.code==='verified_account_mismatch');
  await assert.rejects(store.redeem({id:'not-in-db',wallet_id:accounts.a.wallet_id},tokens.basic,'basic'),error=>error.status===403);assert.equal(await count(),0);
 });
 await check('invalid code input and a forged package value cannot create a grant',async()=>{
  for(const value of ['',null,{},'ID89-NOT-A-REAL-CODE']){const response=await redeem(value);assert.equal(response.status,400);assert.equal(response.data.error,'package_code_invalid')}
  assert.equal(await count(),0);
 });
 await check('89 code gives clean grouped downloads and exactly three suits without premium hair or new credits',async()=>{
  const before=await request('/api/ai-jobs/basic/result');assert.equal(before.headers.get('x-idprom-trial'),'1');
  const response=await redeem(' '+tokens.basic.toLowerCase()+'\n','basic',{body:{packageId:'159',walletId:accounts.other.wallet_id}});
  assert.equal(response.status,200);assert.deepEqual(response.data,{ok:true,packageId:'89',jobId:'basic',workScope:basicScope,reused:false});
  assert.deepEqual((await request('/api/images/basic-peer/rights')).data,{unlocked:true,fullEdit:true,premiumHair:false,paidDownload:true});
  const after=await request('/api/ai-jobs/basic/result');assert.equal(after.headers.get('x-idprom-trial'),'0');assert.equal(after.data,before.data);
  for(let i=0;i<3;i++){const suit=await request('/api/images/basic/suits',{body:{templates:['/basic-suit-'+i+'.png']}});assert.equal(suit.status,200);assert.equal(suit.data.limit,3)}
  assert.equal((await request('/api/images/basic/suits',{body:{templates:['/basic-suit-4.png']}})).status,409);assert.equal(await count(),1);
 });
 await check('same account same work retries survive reload and grouped peers but cannot unlock a second work',async()=>{
  for(const jobId of ['basic','basic-peer']){const response=await redeem(tokens.basic,jobId);assert.equal(response.status,200);assert.equal(response.data.reused,true)}
  assert.equal((await makeStore().redeem(accounts.a,tokens.basic,'basic')).reused,true);
  assert.equal((await redeem(tokens.basic,'new-work')).data.error,'package_code_used');
  assert.equal((await redeem(tokens.basic,'b-work',{session:'b'})).data.error,'package_code_used');assert.equal(await count(),1);
  assert.equal((await request('/api/images/new-work/rights')).data.unlocked,false);
 });
 await check('159 code unlocks premium hair and five suits across the owned work without saving privileges',async()=>{
  const saveBefore=await policy.summary(accounts.a.wallet_id);const response=await redeem(tokens.premium,'premium');assert.equal(response.status,200);assert.equal(response.data.packageId,'159');
  assert.deepEqual((await request('/api/images/premium-peer/rights')).data,{unlocked:true,fullEdit:true,premiumHair:true,paidDownload:true});assert.equal(await policy.premiumWork(accounts.a.wallet_id,premiumScope),true);
  for(let i=0;i<5;i++){const suit=await request('/api/images/premium/suits',{body:{templates:['/premium-suit-'+i+'.png']}});assert.equal(suit.status,200);assert.equal(suit.data.limit,5)}
  assert.equal((await request('/api/images/premium/suits',{body:{templates:['/premium-suit-six.png']}})).status,409);
  assert.deepEqual(await policy.summary(accounts.a.wallet_id),saveBefore);assert.equal(saveBefore.canSave,false);
 });
 await check('unused equivalent89 or159 codes are preserved on already-unlocked work',async()=>{
  const before=await count();
  for(const [code,jobId]of [[tokens.extra89,'basic'],[tokens.extra89,'premium'],[tokens.extra159,'premium']]){const response=await redeem(code,jobId);assert.equal(response.status,409);assert.equal(response.data.error,'image_already_unlocked')}
  assert.equal(await count(),before);
  assert.equal((await redeem(tokens.extra89,'new-work')).status,200);assert.equal((await request('/api/images/premium/rights')).data.premiumHair,true);
 });
 await check('159 upgrades a basic work while retaining its existing suit choices and preserving counters',async()=>{
  const response=await redeem(tokens.upgrade,'basic');assert.equal(response.status,200);assert.equal(response.data.packageId,'159');
  assert.equal((await request('/api/images/basic/rights')).data.premiumHair,true);
  for(let i=3;i<5;i++){const suit=await request('/api/images/basic/suits',{body:{templates:['/basic-suit-'+i+'.png']}});assert.equal(suit.status,200);assert.equal(suit.data.limit,5);assert.equal(suit.data.choices.length,i+1)}
  assert.equal((await request('/api/images/basic/suits',{body:{templates:['/new-six.png']}})).status,409);
 });
 await check('a failed grant write rolls back code consumption and retry can use the same code once',async()=>{
  const before=await count();injectFailure=true;const failed=await redeem(tokens.retry,'rollback');assert.equal(failed.status,503);assert.equal(failed.data.error,'package_code_unavailable');assert(!JSON.stringify(failed.data).includes(tokens.retry));assert.equal(await count(),before);
  assert.equal((await request('/api/images/rollback/rights')).data.unlocked,false);
  const retry=await redeem(tokens.retry,'rollback');assert.equal(retry.status,200);assert.equal(retry.data.reused,false);assert.equal(await count(),before+1);
 });
 await check('a completed historical standalone job can use one code with stable job scope',async()=>{
  const response=await redeem(tokens.standalone,'standalone');assert.equal(response.status,200);assert.equal(response.data.workScope,'job:standalone');assert.equal((await request('/api/images/standalone/rights')).data.unlocked,true);
  assert.equal((await redeem(tokens.standalone,'standalone')).data.reused,true);
 });
 await check('redemption touches no wallet payment generation history legacy promo or private-owner balance',async()=>{
  assert.deepEqual((await query('SELECT * FROM wallets ORDER BY id')).rows,walletsBefore);
  for(const table of ['payments','credit_usage','promo_redemptions'])assert.equal(Number((await scalar('SELECT count(*)::int AS n FROM '+table)).n),0);
  const rows=(await query('SELECT * FROM package_unlock_code_redemptions')).rows;assert(rows.every(row=>/^[a-f0-9]{64}$/.test(row.code_hash)&&!JSON.stringify(row).includes('FIXTURE')));
  assert(releaseCount>0);
 });
 const result={passed:cases.length,failed:0,scope:'Actual code store, route, existing output rights/result/suit HTTP handlers and download-policy SQL. Only auth/session/provider inputs use local fixtures; no production code, customer account, payment, live AI or database is used.',cases};
 if(process.env.PACKAGE_CODE_RESULTS)await writeFile(process.env.PACKAGE_CODE_RESULTS,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}finally{if(server){server.close();server.closeAllConnections();await once(server,'close')}await db.close()}
