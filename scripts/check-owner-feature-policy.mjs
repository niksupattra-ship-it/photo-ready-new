import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {requestDownloadPolicy} from '../account-feature-policy.js';
import {hasPrivateTrial,isPrivateOwner} from '../private-trial.js';
import {registerSavedWorkApi} from '../saved-work-api.js';
import {validateProject,MAX_SAVED_WORKS,SAVED_WORK_RETENTION_DAYS} from '../saved-work-store.js';

const OWNER={id:'owner-user',email:'treeradech009@gmail.com',wallet_id:'wallet_owner'};
const CUSTOMER={id:'customer-user',email:'customer@example.invalid',wallet_id:'wallet_customer'};
const source=await readFile(new URL('../server.js',import.meta.url),'utf8');
const jobs=[
 {id:'owner_free',wallet_id:OWNER.wallet_id,status:'completed',usage_id:'free_before_owner',result:Buffer.from('owned original PNG')},
 {id:'owner_private',wallet_id:OWNER.wallet_id,status:'completed',usage_id:'private_full_fixture',result:Buffer.from('owned private PNG')},
 {id:'owner_pending',wallet_id:OWNER.wallet_id,status:'queued',usage_id:'free_pending'},
 {id:'owner_failed',wallet_id:OWNER.wallet_id,status:'failed',usage_id:'free_failed'},
 {id:'customer_free',wallet_id:CUSTOMER.wallet_id,status:'completed',usage_id:'free_customer',result:Buffer.from('customer PNG')}
];
const reqFor=(user,headers={},body={})=>({accountUser:user,body,get:name=>headers[name.toLowerCase()]||''});
const walletId=req=>req.accountUser?.wallet_id||String(req.get('X-Wallet-Id')||'').trim();
const ownerReq=reqFor(OWNER),customerReq=reqFor(CUSTOMER);
const calls=[],balances={generationRemaining:0,hairRemaining:0,processRemaining:0};
const base={
 async ready(){calls.push(['ready'])},
 async ownedJob(wallet,id){calls.push(['owned',wallet,id]);const job=jobs.find(j=>j.id===id&&j.wallet_id===wallet&&j.status==='completed');if(!job)throw Object.assign(Error('not_owned_completed'),{status:404});return job},
 async summary(wallet){calls.push(['summary',wallet]);return {downloadPolicy:'download-v1',freeGeneration:true,canSave:false,...balances}},
 async allowed(...args){calls.push(['allowed',...args]);return false},
 async premiumHair(...args){calls.push(['premium',...args]);return false},
 async allowedJobs(...args){calls.push(['allowedJobs',...args]);return false},
 async suits(...args){calls.push(['suits',...args]);return {limited:true,limit:3,choices:['/existing.png']}},
 async redeem(...args){calls.push(['redeem',...args]);return {ok:false,error:'download_credit_required'}},
 async legacyAllows(...args){calls.push(['legacy',...args]);return false},
 async isLegacySaved(){return false},
 async premiumWork(){calls.push(['premiumWork']);return false}
};
// Reuse the actual wallet-bound metadata accessor with an inert local query.
const jobSource=await readFile(new URL('../job-store.js',import.meta.url),'utf8');
const metadataSource=jobSource.match(/^export async function getAiJobsAccess\([^\n]+$/m)?.[0];
assert(metadataSource);
const getJobsAccess=new Function('env',`with(env){${metadataSource.replace(/^export /,'')};return getAiJobsAccess}`)({
 ready:async()=>{},pool:{async query(sql,[wallet,ids]){
  calls.push(['metadata',wallet,ids,sql]);
  return {rows:jobs.filter(j=>j.wallet_id===wallet&&ids.includes(j.id)).map(({id,status,usage_id})=>({id,status,usage_id}))};
 }}
});
const accountPolicy=req=>requestDownloadPolicy(req,base,{getJobsAccess});
let passed=0;
const check=async(name,run)=>{calls.length=0;await run();passed++;console.log('PASS '+name)};
await check('owner summary enables features without inventing balances or rewriting base data',async()=>{
 const before=JSON.stringify(balances),p=await accountPolicy(ownerReq).summary(OWNER.wallet_id);
 assert.equal(p.ownerAccess,true);assert.equal(p.unlimitedDownloads,true);assert.equal(p.allFeatures,true);assert.equal(p.canSave,true);
 for(const key of Object.keys(balances))assert.equal(p[key],0);
 assert.equal(JSON.stringify(balances),before);
 const ordinary=await accountPolicy(customerReq).summary(CUSTOMER.wallet_id);
 assert.equal(ordinary.canSave,false);assert.equal(ordinary.ownerAccess,false);assert.equal(ordinary.unlimitedDownloads,false);
});
await check('owner repeatedly unlocks old free and private outputs at zero credits without charge or suit ledger writes',async()=>{
 const p=accountPolicy(ownerReq);
 for(let i=0;i<8;i++)for(const job of ['owner_free','owner_private']){
  assert.equal(await p.allowed(OWNER.wallet_id,job),true);assert.equal(await p.premiumHair(OWNER.wallet_id,job),true);
  assert.deepEqual(await p.redeem(OWNER.wallet_id,job),{ok:true,reused:true,ownerAccess:true});
  assert.deepEqual(await p.suits(OWNER.wallet_id,job,['/suit-'+i+'.png']),{limited:false,limit:null,choices:[]});
 }
 assert(!calls.some(c=>['allowed','premium','redeem','suits'].includes(c[0])));
 assert.deepEqual(balances,{generationRemaining:0,hairRemaining:0,processRemaining:0});
});
await check('owner cannot unlock, edit or select suits for missing foreign failed or unfinished jobs',async()=>{
 for(const id of ['missing','customer_free','owner_pending','owner_failed'])for(const method of ['allowed','premiumHair','redeem','suits']){
  await assert.rejects(accountPolicy(ownerReq)[method](OWNER.wallet_id,id),e=>e.status===404);
 }
});
await check('anonymous forged email wallet private headers and cookie testers retain normal policy',async()=>{
 for(const req of [
  reqFor(null,{'x-wallet-id':OWNER.wallet_id,'x-email':OWNER.email,'x-idprom-private-trial':'1','cookie':'idprom_private_trial=claimed'},{email:OWNER.email,ownerAccess:true}),
  reqFor(CUSTOMER,{'x-wallet-id':OWNER.wallet_id,'x-idprom-private-trial':'1'},{email:OWNER.email}),
  reqFor({...OWNER,wallet_id:'different-wallet'})
 ]){
  const p=accountPolicy(req),options={savedWorkId:'old-work'};
  assert.equal(await p.allowed(OWNER.wallet_id,'owner_free',options),false);
  assert.equal(await p.premiumHair(OWNER.wallet_id,'owner_free',options),false);
  assert.equal((await p.summary(OWNER.wallet_id)).ownerAccess,false);
  assert.equal((await p.suits(OWNER.wallet_id,'owner_free',['/new.png'],'old-work')).limit,3);
  assert.equal((await p.redeem(OWNER.wallet_id,'owner_free')).ok,false);
  assert(calls.some(c=>c[0]==='allowed'&&c[3]===options));
 }
});
await check('owner policy is bound to the current verified account and wallet on every call',async()=>{
 const req=reqFor(OWNER),p=accountPolicy(req);
 assert.equal(await p.allowed(OWNER.wallet_id,'owner_free'),true);
 req.accountUser=CUSTOMER;
 assert.equal(await p.allowed(OWNER.wallet_id,'owner_free'),false);
 assert.equal((await p.summary(OWNER.wallet_id)).ownerAccess,false);
});
await check('saved multihead policy checks all unique jobs with one actual wallet-scoped metadata accessor',async()=>{
 const p=accountPolicy(ownerReq);
 assert.equal(await p.allowedJobs(OWNER.wallet_id,['owner_free','owner_private','owner_free']),true);
 assert.equal(calls.filter(c=>c[0]==='metadata').length,1);
 assert.deepEqual(calls.find(c=>c[0]==='metadata').slice(1,3),[OWNER.wallet_id,['owner_free','owner_private']]);
 for(const ids of [[],['owner_free','customer_free'],['owner_free','missing'],['owner_free','owner_pending']])assert.equal(await p.allowedJobs(OWNER.wallet_id,ids),false);
});
await check('storage failures and invalid suit inputs cannot silently grant owner access',async()=>{
 for(const method of ['summary','ownedJob']){
  const faulty={...base,[method]:async()=>{throw Error('storage_unavailable')}};
  const p=requestDownloadPolicy(ownerReq,faulty,{getJobsAccess});
  await assert.rejects(method==='summary'?p.summary(OWNER.wallet_id):p.allowed(OWNER.wallet_id,'owner_free'),/storage_unavailable/);
 }
 await assert.rejects(requestDownloadPolicy(ownerReq,base,{getJobsAccess:async()=>{throw Error('metadata_unavailable')}}).allowedJobs(OWNER.wallet_id,['owner_free']),/metadata_unavailable/);
 await assert.rejects(accountPolicy(ownerReq).suits(OWNER.wallet_id,'owner_free',['not-a-path']),e=>e.status===400);
});

const creditStart=source.indexOf('async function requireCredit('),creditEnd=source.indexOf('\nconst upload=',creditStart);
assert(creditStart>=0&&creditEnd>creditStart);
const requireCredit=new Function('env',`with(env){${source.slice(creditStart,creditEnd)};return requireCredit}`)({
 walletId,hasPrivateTrial,isPrivateOwner,crypto,
 getWallet:async wallet=>({walletId:wallet,...balances}),
 downloadHairAllowed:id=>['seedream_14','seedream_99'].includes(id),
 PRODUCTION_HAIR_CATALOG:[{id:'seedream_14',gender:'female'},{id:'seedream_99',gender:'female'}],downloadPolicy:base
});
const response=()=>({statusCode:200,status(code){this.statusCode=code;return this},json(data){this.data=data;return this}});
await check('actual generation credit gate grants owner nontrial output without a private header or debit',async()=>{
 const req=reqFor(OWNER,{}, {hairId:'seedream_99'}),res=response(),out=await requireCredit(req,res,'ai-finish');
 assert.match(out.usageId,/^private_full_[a-f0-9]+$/);assert.equal(out.trialPreview,false);assert.equal(out.generationRemaining,0);assert.equal(res.statusCode,200);
 assert(!calls.some(c=>['redeem','premiumWork'].includes(c[0])));
});
await check('actual generation credit gate preserves ordinary free previews premium lock and private-header rejection',async()=>{
 const ordinary=reqFor(CUSTOMER,{}, {hairId:'seedream_14'}),res=response(),out=await requireCredit(ordinary,res,'ai-finish');
 assert.match(out.usageId,/^free_/);assert.equal(out.trialPreview,true);
 const premiumRes=response();assert.equal(await requireCredit(reqFor(CUSTOMER,{}, {hairId:'seedream_99'}),premiumRes,'ai-finish'),null);assert.equal(premiumRes.statusCode,403);assert.equal(premiumRes.data.error,'premium_hair_required');
 for(const user of [null,CUSTOMER]){
  const denied=response();assert.equal(await requireCredit(reqFor(user,{'x-wallet-id':OWNER.wallet_id,'x-idprom-private-trial':'1'},{hairId:'seedream_99'}),denied,'ai-finish'),null);assert.equal(denied.statusCode,403);assert.equal(denied.data.error,'private_trial_inactive');
 }
});

// Register the production image/result and saving handlers, replacing only
// authentication/storage/provider boundaries with local deterministic fixtures.
const routeStart=source.indexOf("app.get('/api/ai-jobs/:id/result'"),routeEnd=source.indexOf('\nconst resumeQueuedAiJobs=',routeStart);
assert(routeStart>=0&&routeEnd>routeStart);
const app=express();app.use(express.json());
app.use((req,res,next)=>{const session=req.get('X-Test-Session');if(session==='owner')req.accountUser=OWNER;else if(session==='customer')req.accountUser=CUSTOMER;next()});
const getAiJobResult=async(id,wallet)=>jobs.find(j=>j.id===id&&j.wallet_id===wallet)||null;
new Function('env',`with(env){${source.slice(routeStart,routeEnd)}}`)({
 app,walletId,accountPolicy,getAiJobResult,getWallet:async wallet=>({walletId:wallet,...balances}),
 authUser:async req=>req.accountUser,downloadPolicy:base,
 walletHasAccount:async()=>true,claimTrialImage:async()=>{throw Error('unexpected claim')}
});
const rightsStart=source.indexOf('async function savedWorkRights('),rightsEnd=source.indexOf('\nregisterSavedWorkApi',rightsStart);
const savedWorkRights=new Function('env',`with(env){${source.slice(rightsStart,rightsEnd)};return savedWorkRights}`)({validateProject,downloadPolicy:base});
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const projectFor=id=>({format:'idprom-studio',version:1,width:900,height:1200,layers:[{kind:'head',name:'หัว · คอ · ผม',jobId:id,source:PNG,x:0,y:0,scale:1,rotation:0,opacity:1}]});
const retained={days:SAVED_WORK_RETENTION_DAYS,version:'saved-work-45-v1'},work={id:'work_owner',name:'รูป IDพร้อม',project:projectFor('owner_free'),expires_at:'2099-01-01T00:00:00.000Z'};
let saveMode='ok';
const store={MAX_SAVED_WORKS,
 async getSavedWorkRetentionPolicy(){return retained},
 async listWorks(wallet){calls.push(['listWorks',wallet]);return wallet===OWNER.wallet_id?[{id:work.id,expires_at:work.expires_at}]:[]},
 async saveWork(wallet,id,project){calls.push(['saveWork',wallet,id,project]);if(saveMode==='limit')throw Object.assign(Error('saved_work_limit'),{code:'saved_work_limit'});if(saveMode==='expired')throw Object.assign(Error('saved_work_expired'),{code:'saved_work_expired'});return {...work,project}},
 async getWork(wallet,id){calls.push(['getWork',wallet,id]);if(saveMode==='expired')throw Object.assign(Error('saved_work_expired'),{code:'saved_work_expired'});return wallet===OWNER.wallet_id&&id===work.id?work:null},
 async deleteWork(){throw Error('unexpected delete')}
};
registerSavedWorkApi(app,{store,downloadPolicy:base,policyForRequest:accountPolicy,savedWorkRights,buildPreview:async()=>({url:PNG,width:1,height:1})});
const server=http.createServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port;
async function request(path,{session='owner',method='GET',body,headers={}}={}){
 const h={...headers,...(session?{'X-Test-Session':session}:{})};if(body)h['Content-Type']='application/json';
 const r=await fetch(origin+path,{method,headers:h,body:body?JSON.stringify(body):undefined});
 const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}
 return {status:r.status,headers:r.headers,data};
}
try{
 await check('actual result route returns clean owner PNG and ordinary customer preview marker',async()=>{
  const owner=await request('/api/ai-jobs/owner_free/result');assert.equal(owner.status,200);assert.equal(owner.headers.get('X-IDPROM-Trial'),'0');assert.equal(owner.data,'owned original PNG');
  const ordinary=await request('/api/ai-jobs/customer_free/result',{session:'customer'});assert.equal(ordinary.status,200);assert.equal(ordinary.headers.get('X-IDPROM-Trial'),'1');
  for(const id of ['customer_free','missing'])assert.equal((await request('/api/ai-jobs/'+id+'/result')).status,404);
  assert.equal((await request('/api/ai-jobs/owner_pending/result')).status,202);assert.equal((await request('/api/ai-jobs/owner_failed/result')).status,409);
 });
 await check('actual output rights route grants complete owner rights only after owned completed lookup',async()=>{
  const r=await request('/api/images/owner_free/rights',{headers:{'X-Wallet-Id':CUSTOMER.wallet_id}});assert.equal(r.status,200);assert.deepEqual(r.data,{unlocked:true,fullEdit:true,premiumHair:true});
  for(const id of ['customer_free','missing','owner_pending'])assert.equal((await request('/api/images/'+id+'/rights')).status,404);
  const ordinary=await request('/api/images/customer_free/rights',{session:'customer'});assert.deepEqual(ordinary.data,{unlocked:false,fullEdit:false,premiumHair:false});
 });
 await check('actual owner suit and unlock routes remain unlimited with zero wallet balance and no debit',async()=>{
  for(let i=0;i<7;i++){
   const r=await request('/api/images/owner_free/suits',{method:'POST',body:{templates:['/suit-'+i+'.png']}});assert.equal(r.status,200);assert.equal(r.data.limited,false);
  }
  const unlock=await request('/api/images/owner_free/unlock',{method:'POST'});assert.equal(unlock.status,200);assert.equal(unlock.data.ownerAccess,true);assert.equal(unlock.data.unlimitedDownloads,true);assert.equal(unlock.data.processRemaining,0);
  assert(!calls.some(c=>['suits','redeem'].includes(c[0])));
  assert.equal((await request('/api/images/owner_free/unlock',{session:null,method:'POST',headers:{'X-Wallet-Id':OWNER.wallet_id}})).status,401);
  assert.equal((await request('/api/images/customer_free/suits',{session:'customer',method:'POST',body:{templates:['/normal.png']}})).data.limit,3);
 });
 await check('actual save open and preview use owner scoped policy while validating every project head',async()=>{
  const save=await request('/api/saved-work',{method:'POST',body:{project:projectFor('owner_free')},headers:{'X-Wallet-Id':CUSTOMER.wallet_id}});assert.equal(save.status,200);assert(calls.some(c=>c[0]==='saveWork'&&c[1]===OWNER.wallet_id));
  const open=await request('/api/saved-work/work_owner');assert.equal(open.status,200);assert.equal(open.data.unlocked,true);assert.equal(open.data.project.layers[0].jobId,'owner_free');
  assert.equal((await request('/api/saved-work/work_owner/preview')).status,200);
  const denied=await request('/api/saved-work',{method:'POST',body:{project:projectFor('customer_free')}});assert.equal(denied.status,403);
  assert.equal((await request('/api/saved-work/work_owner',{session:'customer'})).status,404);
 });
 await check('ordinary accounts and anonymous forged owner claims cannot gain cloud saving',async()=>{
  const ordinary=await request('/api/saved-work',{session:'customer',method:'POST',body:{project:projectFor('customer_free'),ownerAccess:true}});assert.equal(ordinary.status,403);assert.equal(ordinary.data.error,'saving_disabled');
  assert.equal((await request('/api/saved-work',{session:null,method:'POST',body:{project:projectFor('owner_free'),email:OWNER.email},headers:{'X-Wallet-Id':OWNER.wallet_id,'X-IDPROM-Private-Trial':'1'}})).status,401);
 });
 await check('owner storage capacity retention expiry and project-resource validation stay enforced',async()=>{
  assert.equal(MAX_SAVED_WORKS,3);assert.equal(SAVED_WORK_RETENTION_DAYS,45);
  const list=await request('/api/saved-work');assert.equal(list.data.limit,3);assert.equal(list.data.retention.days,45);
  saveMode='limit';const capped=await request('/api/saved-work',{method:'POST',body:{project:projectFor('owner_free')}});assert.equal(capped.status,409);assert.equal(capped.data.limit,3);
  saveMode='expired';assert.equal((await request('/api/saved-work/work_owner')).status,410);assert.equal((await request('/api/saved-work',{method:'POST',body:{project:projectFor('owner_free')}})).status,410);
  saveMode='ok';const invalid=projectFor('owner_free');invalid.layers[0].scale=99;assert.equal((await request('/api/saved-work',{method:'POST',body:{project:invalid}})).status,400);
 });
}finally{server.close();server.closeAllConnections();await once(server,'close')}
console.log(JSON.stringify({passed,scope:'Actual request-scoped owner policy, server generation/result/rights/suit/unlock handlers, and saved-work save/open/preview HTTP routes. Auth, metadata, wallet and store boundaries are local fixtures; no production DB, provider, AI or payment call.'}));
