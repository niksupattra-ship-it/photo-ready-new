// Actual claim route and policy SQL, executed only in disposable PostgreSQL WASM.
// No DATABASE_URL, customer account, provider, payment, or external HTTP is used.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=process.env.CLAIM_LINEAGE_SOURCE_ROOT||path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),results=[],registeredWallets=new Set();
const query=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.rowCount??r.affectedRows??r.rows.length}};
const pool={query,async connect(){return {query,release(){}}}};
const policySource=await readFile(path.join(root,'download-policy-store.js'),'utf8');
const policy=new Function('crypto',policySource.slice(policySource.indexOf('export function createDownloadPolicy'),policySource.lastIndexOf('\nconst pool=')).replace(/^export /,'')+'\nreturn createDownloadPolicy')(crypto)(pool);
const jobSource=await readFile(path.join(root,'job-store.js'),'utf8');
function jobHelper(name){
 const a=jobSource.indexOf('export async function '+name+'('),b=jobSource.indexOf('\nexport ',a+1);assert(a>=0,'missing production '+name);
 return new Function('pool','ready',jobSource.slice(a,b<0?undefined:b).replace(/^export /,'')+'\nreturn '+name)(pool,async()=>{});
}
const claimTrialImage=jobHelper('claimTrialImage'),getAiJobResult=jobHelper('getAiJobResult');
const server=await readFile(path.join(root,'server.js'),'utf8'),start=server.indexOf("app.post('/api/images/:id/claim'"),end=server.indexOf("app.get('/api/images/:id/rights'",start);assert(start>=0&&end>start);
let claimHandler;
new Function('env','with(env){'+server.slice(start,end)+'}')({
 app:{post:(...args)=>{claimHandler=args.at(-1)}},authUser:async req=>req.accountUser,
 walletHasAccount:async wallet=>registeredWallets.has(wallet),downloadPolicy:policy,claimTrialImage,getAiJobResult
});
async function fixture(name,usages){
 const source='guest_'+name,target='member_'+name,jobs=usages.map((usage,index)=>({id:'job_'+name+'_'+index,usage,result:Buffer.from('native-result:'+name+':'+index)}));
 await query('INSERT INTO wallets(id) VALUES($1),($2)',[source,target]);
 const work=await policy.beginWork(source,Buffer.from('original:'+name));
 for(const job of jobs){await query("INSERT INTO ai_jobs(id,wallet_id,status,usage_id,result) VALUES($1,$2,'completed',$3,$4)",[job.id,source,job.usage,job.result]);await policy.attach(source,work,job.id)}
 return {source,target,jobs,work};
}
async function claim(f,index,source=f.source){
 const response={statusCode:200,status(n){this.statusCode=n;return this},json(value){this.body=value;return this}};
 await claimHandler({accountUser:{wallet_id:f.target},body:{sourceWalletId:source},params:{id:f.jobs[index].id}},response);return response;
}
async function assertEligibleResults(f,indexes){
 for(const i of indexes){const job=f.jobs[i],owned=await policy.ownedJob(f.target,job.id),result=await getAiJobResult(job.id,f.target);assert.equal(owned.status,'completed');assert(result,'member must be able to reopen '+job.id);assert.deepEqual(Buffer.from(result.result),job.result);assert.equal(await getAiJobResult(job.id,f.source),null)}
 const mapping=await query('SELECT job_id,wallet_id FROM download_work_jobs WHERE work_id=$1',[f.work]);assert(mapping.rows.every(row=>row.wallet_id===f.target));
}
async function snapshot(f){return (await query('SELECT id,wallet_id,status,usage_id,result,updated_at FROM ai_jobs WHERE id=ANY($1::text[]) ORDER BY id',[f.jobs.map(job=>job.id)])).rows}
async function check(name,run){try{await run();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.message});console.error('FAIL '+name+': '+error.message)}}
try{
 await db.exec(`CREATE TABLE wallets(id text PRIMARY KEY,generation_remaining int DEFAULT 0,hair_remaining int DEFAULT 0);
 CREATE TABLE payments(wallet_id text);CREATE TABLE promo_redemptions(wallet_id text);
 CREATE TABLE ai_jobs(id text PRIMARY KEY,wallet_id text,status text,usage_id text,result bytea,error text,updated_at timestamptz DEFAULT now());
 CREATE TABLE saved_studio_work(id text PRIMARY KEY,wallet_id text,project jsonb);
 CREATE TABLE paid_image_unlocks(wallet_id text,job_id text,full_edit boolean DEFAULT true,created_at timestamptz DEFAULT now());`);
 await policy.ready();
 await check('standard legacy trial then premium free result transfers both variants when claiming premium',async()=>{
  const f=await fixture('legacy_free',['trial_standard','free_diamond']),r=await claim(f,1);assert.equal(r.statusCode,200);assert.deepEqual(r.body,{ok:true});await assertEligibleResults(f,[0,1]);
 });
 await check('two legacy trial variants transfer together when the latest premium result is claimed',async()=>{
  const f=await fixture('legacy_trial',['trial_standard','trial_diamond']);assert.equal((await claim(f,1)).statusCode,200);await assertEligibleResults(f,[0,1]);
 });
 await check('current free standard and free premium results retain the existing successful transfer',async()=>{
  const f=await fixture('current_free',['free_standard','free_diamond']);assert.equal((await claim(f,1)).statusCode,200);await assertEligibleResults(f,[0,1]);
 });
 await check('claiming the standard legacy result also preserves the later free variant',async()=>{
  const f=await fixture('standard_selected',['trial_standard','free_diamond']);assert.equal((await claim(f,0)).statusCode,200);await assertEligibleResults(f,[0,1]);
 });
 await check('paid and private siblings stay outside the trial/free transfer and retain exact bytes',async()=>{
  const f=await fixture('ineligible_peers',['free_standard','free_diamond','use_paid','private_full_owner']);assert.equal((await claim(f,1)).statusCode,200);await assertEligibleResults(f,[0,1]);
  for(const i of [2,3]){const job=f.jobs[i];assert.equal(await getAiJobResult(job.id,f.target),null);await assert.rejects(policy.ownedJob(f.target,job.id),error=>error.status===404);const prior=await getAiJobResult(job.id,f.source);assert.deepEqual(Buffer.from(prior.result),job.result)}
 });
 await check('repeated claims remain idempotent without debits, grants, or result changes',async()=>{
  const f=await fixture('repeat',['free_standard','free_diamond']);assert.equal((await claim(f,1)).statusCode,200);const before=await snapshot(f),balances=(await query('SELECT * FROM wallets WHERE id=ANY($1::text[]) ORDER BY id',[[f.source,f.target]])).rows;
  for(let i=0;i<3;i++)assert.equal((await claim(f,1)).statusCode,200);assert.equal((await claim(f,1,f.target)).statusCode,200);assert.deepEqual(await snapshot(f),before);assert.deepEqual((await query('SELECT * FROM wallets WHERE id=ANY($1::text[]) ORDER BY id',[[f.source,f.target]])).rows,balances);assert.equal((await query('SELECT count(*)::int AS count FROM paid_image_unlocks')).rows[0].count,0);
 });
 await check('another registered source account is rejected before any ownership changes',async()=>{
  const f=await fixture('registered_source',['trial_standard','free_diamond']);registeredWallets.add(f.source);const before=await snapshot(f);const r=await claim(f,1);assert.equal(r.statusCode,403);assert.equal(r.body.error,'image_account_mismatch');assert.deepEqual(await snapshot(f),before);assert((await query('SELECT wallet_id FROM download_work_jobs WHERE work_id=$1',[f.work])).rows.every(row=>row.wallet_id===f.source));
 });
 await check('an unrelated guest wallet cannot transfer or read either variant',async()=>{
  const f=await fixture('wrong_guest',['trial_standard','free_diamond']);const before=await snapshot(f);const r=await claim(f,1,'unrelated_guest');assert.equal(r.statusCode,404);assert.deepEqual(await snapshot(f),before);assert.equal(await getAiJobResult(f.jobs[0].id,f.target),null);assert.equal(await getAiJobResult(f.jobs[1].id,f.target),null);
 });
 const report={passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,sourceRoot:root,policySha256:crypto.createHash('sha256').update(policySource).digest('hex'),scope:'Actual production claim route, trial/free job helpers and download-policy SQL in disposable PGlite. No external API, DATABASE_URL, customer, payment or provider actions.',results};
 if(process.env.CLAIM_LINEAGE_OUTPUT)await writeFile(process.env.CLAIM_LINEAGE_OUTPUT,JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.failed)process.exitCode=1;
}finally{await db.close()}
