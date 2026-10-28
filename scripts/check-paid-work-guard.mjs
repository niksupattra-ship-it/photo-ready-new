// Local guard and production rights-route checks; never accesses customer data.
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import express from 'express';
import {hasPaidDownloadForJobs,attachPaidBeforeUnload,PAID_WORK_EXIT_MESSAGE} from '../src/paid-work-guard.js';

const cases=[];
const check=async(name,test)=>{await test();cases.push(name);console.log('PASS '+name)};
await check('only current job IDs with verified paid grants trigger the warning',()=>{
 assert.equal(hasPaidDownloadForJobs(['paid'],{paid:{paidDownload:true,checked:true}}),true);
 assert.equal(hasPaidDownloadForJobs(['new'],{paid:{paidDownload:true,checked:true}}),false);
 assert.equal(hasPaidDownloadForJobs(['paid','unpaid'],{paid:{paidDownload:true},unpaid:{paidDownload:false}}),true);
 for(const ids of [undefined,null,[],[''],[null],[12]])assert.equal(hasPaidDownloadForJobs(ids,{paid:{paidDownload:true}}),false);
});
await check('balances and owner private or saved-project flags cannot invent a paid current work',()=>{
 for(const right of [{unlocked:true,fullEdit:true,ownerAccess:true},{unlocked:true,trialUnlocked:true},{savedWorkUnlocked:true},{hasPurchased:true,generationRemaining:10,premiumDownloadRemaining:2}])assert.equal(hasPaidDownloadForJobs(['unpaid'],{unpaid:right}),false);
 assert.equal(hasPaidDownloadForJobs(['unpaid'],{}, {hasCredits:true,unlockedJobIds:['unpaid']}),false);
});
await check('older-server paid IDs remain scoped to the current output',()=>{
 assert.equal(hasPaidDownloadForJobs(['paid'],{},['paid']),true);
 assert.equal(hasPaidDownloadForJobs(['paid'],{paid:{unlocked:true,checked:true}},['paid']),true);
 assert.equal(hasPaidDownloadForJobs(['new'],{paid:{unlocked:true}},['paid']),false);
});
await check('explicit unpaid or malformed rights override stale paid IDs',()=>{
 for(const paidDownload of [false,null,undefined,'true',1])assert.equal(hasPaidDownloadForJobs(['paid'],{paid:{paidDownload}},['paid']),false);
 assert.equal(hasPaidDownloadForJobs(['paid'],{paid:{paidDownload:true,checked:false}},['paid']),false);
});
await check('beforeunload attaches only when enabled and cleanup removes the exact handler',()=>{
 const listeners=new Map(),calls=[];
 const target={addEventListener(name,fn){calls.push(['add',name]);listeners.set(name,fn)},removeEventListener(name,fn){assert.equal(listeners.get(name),fn);calls.push(['remove',name]);listeners.delete(name)}};
 attachPaidBeforeUnload(false,target)();assert.equal(listeners.size,0);assert.equal(calls.length,0);
 const cleanup=attachPaidBeforeUnload(true,target);assert.equal(listeners.size,1);
 const event={prevented:false,preventDefault(){this.prevented=true},returnValue:''};listeners.get('beforeunload')(event);
 assert.equal(event.prevented,true);assert.equal(event.returnValue,PAID_WORK_EXIT_MESSAGE);
 cleanup();assert.equal(listeners.size,0);assert.deepEqual(calls,[['add','beforeunload'],['remove','beforeunload']]);
 attachPaidBeforeUnload(false)();attachPaidBeforeUnload(true,null)();
 assert.match(PAID_WORK_EXIT_MESSAGE,/งานที่ชำระเงินแล้ว/);assert.match(PAID_WORK_EXIT_MESSAGE,/ไม่สามารถเรียกคืนงานหรือขอคืนเงินได้/);
});

const source=await readFile(new URL('../server.js',import.meta.url),'utf8');
const start=source.indexOf("app.get('/api/images/:id/rights'"),end=source.indexOf("app.post('/api/images/:id/suits'",start);
assert(start>=0&&end>start);
const fixtureJobs={basic:{wallet:'member',paid:true,premium:false},premium:{wallet:'member',paid:true,premium:true},free:{wallet:'member',paid:false,premium:false},owner:{wallet:'owner',paid:false,premium:true},pending:{wallet:'member',paid:false,status:'queued'}};
let failStorage=false;const passedOptions=[];
const owned=(wallet,id)=>{if(failStorage)throw Error('local_storage_unavailable');const job=fixtureJobs[id];if(!job||job.wallet!==wallet||job.status==='queued')throw Object.assign(Error('not_found'),{status:404});return job};
const downloadPolicy={async allowed(wallet,id,options){passedOptions.push(options);return owned(wallet,id).paid}};
const accountPolicy=req=>({async allowed(wallet,id){const job=owned(wallet,id);return req.fixtureOwner||job.paid},async premiumHair(wallet,id){return owned(wallet,id).premium}});
const app=express();app.use((req,res,next)=>{req.fixtureWallet=req.get('X-Test-Session')==='owner'?'owner':'member';req.fixtureOwner=req.fixtureWallet==='owner';next()});
new Function('env',`with(env){${source.slice(start,end)}}`)({app,walletId:req=>req.fixtureWallet,accountPolicy,downloadPolicy});
const server=http.createServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');
const request=async(id,headers={})=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/images/'+id+'/rights',{headers});return {status:response.status,data:await response.json(),cache:response.headers.get('cache-control')}};
try{
 await check('actual rights route adds paid metadata without changing basic or premium grants',async()=>{
  assert.deepEqual((await request('basic')).data,{unlocked:true,fullEdit:true,premiumHair:false,paidDownload:true});
  assert.deepEqual((await request('premium')).data,{unlocked:true,fullEdit:true,premiumHair:true,paidDownload:true});
  const free=await request('free');assert.deepEqual(free.data,{unlocked:false,fullEdit:false,premiumHair:false,paidDownload:false});assert.equal(free.cache,'no-store');
 });
 await check('actual owner output remains unlocked but is not falsely classified as paid',async()=>{
  assert.deepEqual((await request('owner',{'X-Test-Session':'owner','X-Wallet-Id':'member'})).data,{unlocked:true,fullEdit:true,premiumHair:true,paidDownload:false});
  const before=passedOptions.length;await request('basic',{'X-IDPROM-Saved-Work':'fixture-saved-work'});assert.equal(passedOptions[before].savedWorkId,'fixture-saved-work');
 });
 await check('missing foreign pending and failed storage responses cannot claim a paid work',async()=>{
  for(const id of ['missing','owner','pending']){const response=await request(id);assert.equal(response.status,404);assert.equal(response.data.paidDownload,undefined)}
  failStorage=true;const failed=await request('basic');assert.equal(failed.status,503);assert.deepEqual(failed.data,{error:'output_rights_unavailable'});failStorage=false;
 });
}finally{server.close();server.closeAllConnections();await once(server,'close')}
const result={passed:cases.length,cases,scope:'Actual pure paid-work guard, beforeunload handler and extracted production rights HTTP route. Local fixture identities/storage only; no production accounts or payments.'};
if(process.env.PAID_WORK_GUARD_RESULTS)await writeFile(process.env.PAID_WORK_GUARD_RESULTS,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
