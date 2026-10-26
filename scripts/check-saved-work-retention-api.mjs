import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import http from 'node:http';
import express from 'express';
import {packSavedProjectTransfer,getSavedWorkRequestSize} from '../src/saved-work-transfer.js';

// Replace only database dependencies; exercise the actual HTTP/worker modules.
const stub='data:text/javascript,'+encodeURIComponent('const fail=()=>{throw Error("unexpected default store call")};export const MAX_SAVED_WORKS=3,saveWork=fail,listWorks=fail,getWork=fail,deleteWork=fail,getSavedWorkRetentionPolicy=fail,purgeExpiredWorks=fail;');
async function isolated(path){
 const source=await readFile(new URL(path,import.meta.url),'utf8');
 const code=source.replace(/from '\.\/saved-work-store\.js'/g,`from '${stub}'`).replace(/from '(\.\/(?:src\/saved-work-transfer|src\/saved-project|saved-work-response)\.js)'/g,(_,relative)=>`from '${new URL(relative,new URL(path,import.meta.url)).href}'`);
 assert.notEqual(code,source,'store import must be replaced');
 return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
const {registerSavedWorkApi}=await isolated('../saved-work-api.js');
const {startSavedWorkRetentionCleanup}=await isolated('../saved-work-retention-worker.js');
let checks=0;
async function check(name,run){await run();checks++;console.log('PASS '+name)}
const policy={days:45,version:'saved-work-45-v1',effectiveAt:'2026-10-24T08:00:00.000Z',legacyExpiresAt:'2026-12-08T08:00:00.000Z',serverNow:'2026-10-24T08:00:00.000Z'};
const project={format:'idprom-studio',version:1,width:900,height:1200,layers:[{jobId:'job_a',name:'หัว · คอ · ผม',source:'data:image/png;base64,AAAA',x:0,y:0,scale:1,rotation:0,opacity:1}]},work={id:'work_a',name:'รูป IDพร้อม',project,expires_at:policy.legacyExpiresAt};
const error=code=>Object.assign(Error(code),{code});
let mode='ok',rights=true,calls=[],canSave=true;
const store={MAX_SAVED_WORKS:3,
 async getSavedWorkRetentionPolicy(){calls.push(['policy']);if(mode==='policy-error')throw error('08006');return policy},
 async listWorks(wallet){calls.push(['list',wallet]);if(mode==='list-error')throw error('08006');return [{id:work.id,expires_at:work.expires_at}]},
 async saveWork(wallet,id,p){calls.push(['save',wallet,id,p]);if(mode==='expired')throw error('saved_work_expired');if(mode==='limit')throw error('saved_work_limit');if(mode==='save-error')throw error('invalid_project');return mode==='missing'?null:work},
 async getWork(wallet,id){calls.push(['get',wallet,id]);if(mode==='expired')throw error('saved_work_expired');if(mode==='get-error')throw error('08006');return mode==='missing'?null:work},
 async deleteWork(wallet,id){calls.push(['delete',wallet,id]);if(mode==='expired')throw error('saved_work_expired');if(mode==='delete-error')throw error('08006');return mode==='missing'?null:{id:work.id}}
};
const app=express();app.use(express.json());app.use((req,res,next)=>{if(req.get('X-Test-Account')==='A')req.accountUser={wallet_id:'wallet_A'};next()});
registerSavedWorkApi(app,{store,downloadPolicy:{summary:async()=>({canSave}),isLegacySaved:async()=>false},savedWorkRights:async(wallet,p)=>{calls.push(['rights',wallet,p]);return rights}});
const server=http.createServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');
const base='http://127.0.0.1:'+server.address().port;
async function request(path,{method='GET',account=true,body}={}){
 const headers={'X-Wallet-Id':'untrusted_wallet_B'};if(account)headers['X-Test-Account']='A';
 if(body)headers['Content-Type']='application/json';
 const r=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});
 assert.equal(r.headers.get('cache-control'),'no-store');return {status:r.status,data:await r.json()};
}
try{
 await check('public policy contains only retention metadata and needs no account',async()=>{
  mode='ok';calls=[];const r=await request('/api/saved-work/policy',{account:false});assert.equal(r.status,200);assert.deepEqual(r.data,policy);assert.deepEqual(calls,[['policy']]);
 });
 await check('all saved-project operations still require authentication',async()=>{
  for(const [method,path] of [['GET','/api/saved-work'],['GET','/api/saved-work/work_a'],['DELETE','/api/saved-work/work_a'],['POST','/api/saved-work']]){
   calls=[];assert.equal((await request(path,{method,account:false,body:method==='POST'?{project}:undefined})).status,401);assert.equal(calls.length,0);
  }
 });
 await check('list uses authenticated wallet and returns active-work expiry metadata',async()=>{
  calls=[];const r=await request('/api/saved-work');assert.equal(r.status,200);assert.deepEqual(r.data,{items:[{id:work.id,expires_at:work.expires_at}],limit:3,retention:policy});assert(calls.some(c=>c[0]==='list'&&c[1]==='wallet_A'));
 });
 await check('accounts without grandfathered saving cannot write even an otherwise unlocked project',async()=>{
  canSave=false;calls=[];const r=await request('/api/saved-work',{method:'POST',body:{project}});assert.equal(r.status,403);assert.equal(r.data.error,'saving_disabled');assert.deepEqual(calls,[]);canSave=true;
 });
 await check('save retains the existing authoritative output-rights check',async()=>{
  rights=false;calls=[];const r=await request('/api/saved-work',{method:'POST',body:{id:'work_a',project}});assert.equal(r.status,403);assert.deepEqual(calls,[['rights','wallet_A',project]]);rights=true;
 });
 await check('normal save passes only account-owned wallet and preserves metadata',async()=>{
  calls=[];const r=await request('/api/saved-work',{method:'POST',body:{id:'work_a',project}});assert.equal(r.status,200);assert.deepEqual(r.data,work);assert.deepEqual(calls,[['rights','wallet_A',project],['save','wallet_A','work_a',project]]);
 });
 await check('normal open rechecks output rights before returning full project',async()=>{
  calls=[];const r=await request('/api/saved-work/work_a');assert.equal(r.status,200);assert.deepEqual(r.data,{...work,unlocked:true,legacyDownload:false});assert.deepEqual(calls,[['get','wallet_A','work_a'],['rights','wallet_A',project]]);
  rights=false;assert.equal((await request('/api/saved-work/work_a')).status,403);rights=true;
 });
 await check('normal delete remains wallet-scoped and returns removed id',async()=>{
  calls=[];const r=await request('/api/saved-work/work_a',{method:'DELETE'});assert.equal(r.status,200);assert.deepEqual(r.data,{ok:true,id:'work_a'});assert.deepEqual(calls,[['delete','wallet_A','work_a']]);
 });
 await check('missing and cross-account work still returns404 rather than expiry details',async()=>{
  mode='missing';for(const method of ['GET','DELETE','POST'])assert.equal((await request(method==='POST'?'/api/saved-work':'/api/saved-work/work_B',{method,body:method==='POST'?{id:'work_B',project}:undefined})).status,404);mode='ok';
 });
 await check('owned expired get, save and delete all return typed410 without project',async()=>{
  mode='expired';for(const method of ['GET','DELETE','POST']){
   const r=await request(method==='POST'?'/api/saved-work':'/api/saved-work/work_a',{method,body:method==='POST'?{id:'work_a',project}:undefined});
   assert.equal(r.status,410);assert.equal(r.data.error,'saved_work_expired');assert(r.data.message.includes('หมดอายุ'));assert(!r.data.project);
  }mode='ok';
 });
 await check('capacity limit stays409 and returns unchanged3-work limit',async()=>{
  mode='limit';const r=await request('/api/saved-work',{method:'POST',body:{project}});assert.equal(r.status,409);assert.equal(r.data.limit,3);assert.equal(r.data.error,'saved_work_limit');mode='ok';
 });
 await check('policy/database/validation failures return controlled responses',async()=>{
  for(const [next,path,method,status] of [['policy-error','/api/saved-work/policy','GET',503],['list-error','/api/saved-work','GET',500],['get-error','/api/saved-work/work_a','GET',500],['delete-error','/api/saved-work/work_a','DELETE',500],['save-error','/api/saved-work','POST',400]]){
   mode=next;const r=await request(path,{method,body:method==='POST'?{project}:undefined});assert.equal(r.status,status);assert(!JSON.stringify(r.data).includes('08006'));
  }mode='ok';
 });
}finally{server.close();server.closeAllConnections();await once(server,'close')}

function scheduler(options={}){
 const timers=[],logs=[],purges=[];let policyCalls=0;
 const worker=startSavedWorkRetentionCleanup({getPolicy:async()=>{policyCalls++;return policy},purge:async arg=>{purges.push(arg);return 0},logger:{info:(...a)=>logs.push(['info',...a]),error:(...a)=>logs.push(['error',...a])},schedule:(fn,delay)=>{const timer={fn,delay,unrefs:0,unref(){this.unrefs++}};timers.push(timer);return timer},cancel:timer=>{timer.cancelled=true},...options});
 return {worker,timers,logs,purges,get policyCalls(){return policyCalls}};
}
await check('cleanup starts asynchronously and unrefs its timer',async()=>{
 const s=scheduler();assert.equal(s.policyCalls,0);assert.equal(s.timers[0].delay,5000);assert.equal(s.timers[0].unrefs,1);s.worker.stop();assert(s.timers[0].cancelled);
});
await check('successful cleanup uses bounded store purge and hourly scheduling',async()=>{
 const s=scheduler();await s.timers[0].fn();assert.equal(s.policyCalls,1);assert.deepEqual(s.purges,[{limit:100}]);assert.equal(s.timers.at(-1).delay,3600000);assert.equal(s.timers.at(-1).unrefs,1);s.worker.stop();
});
await check('backlog is capped at five batches and resumes after one minute',async()=>{
 const calls=[];const s=scheduler({purge:async arg=>{calls.push(arg);return 100}});await s.timers[0].fn();assert.equal(calls.length,5);assert(calls.every(c=>c.limit===100));assert.equal(s.timers.at(-1).delay,60000);assert(s.logs.some(c=>c[1]==='Expired saved works removed'&&c[2].count===500));s.worker.stop();
});
await check('short final batch stops drain and retains hourly schedule',async()=>{
 const batches=[100,12];let n=0;const s=scheduler({purge:async()=>batches[n++]});await s.timers[0].fn();assert.equal(n,2);assert.equal(s.timers.at(-1).delay,3600000);s.worker.stop();
});
await check('migration failure is contained, does not purge and retries',async()=>{
 const s=scheduler({getPolicy:async()=>{throw error('55P03')}});await s.timers[0].fn();assert.equal(s.purges.length,0);assert.equal(s.timers.at(-1).delay,60000);assert(s.logs.some(c=>c[0]==='error'&&c[2].code==='55P03'));s.worker.stop();
});
await check('purge failure is contained without blocking the next retry',async()=>{
 let attempt=0;const s=scheduler({purge:async()=>{if(attempt++===0)throw error('08006');return 0}});await s.timers[0].fn();assert.equal(s.timers.at(-1).delay,60000);await s.timers.at(-1).fn();assert.equal(attempt,2);assert.equal(s.timers.at(-1).delay,3600000);s.worker.stop();
});
await check('overlapping timers cannot run simultaneous purges',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r});let n=0;
 const s=scheduler({purge:async()=>{n++;await pending;return 0}});const first=s.timers[0].fn();await Promise.resolve();await s.timers[0].fn();assert.equal(n,1);resolve();await first;assert.equal(s.timers.length,2);s.worker.stop();
});
await check('stop prevents later work and rescheduling during an in-flight operation',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r});const s=scheduler({getPolicy:async()=>{await pending;return policy}});const active=s.timers[0].fn();s.worker.stop();resolve();await active;assert.equal(s.purges.length,0);assert.equal(s.timers.length,1);await s.timers[0].fn();assert.equal(s.purges.length,0);
});

const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const code=main.slice(main.indexOf(' const saveAccountWork='),main.indexOf(' const savedWorkOpenRequestRef='));
function saveHandler(response){
 const requests=[],env={packSavedProjectTransfer,getSavedWorkRequestSize,encodeSavedWorkRequest:async body=>({body,headers:{}}),workSaveQueueRef:{current:Promise.resolve()},savedWorkIdRef:{current:'work_expired'},savedWorkOpenRequestRef:{current:1},currentWalletId:()=> 'wallet_A',walletHeaders:()=>({}),setSavedWorksOpen:()=>{},Blob,portraitFetch:async(url,options)=>{requests.push(JSON.parse(options.body));return response(requests.length)}};
 return {save:new Function('env','with(env){'+code+';return saveAccountWork}')(env),requests,env};
}
await check('expired410 never falls through to deleted-work replacement or resets active id',async()=>{
 const t=saveHandler(()=>({ok:false,status:410,json:async()=>({error:'saved_work_expired',message:'งานหมดอายุ'})}));await assert.rejects(t.save(project),e=>e.code==='saved_work_expired');assert.equal(t.requests.length,1);assert.equal(t.env.savedWorkIdRef.current,'work_expired');
});
await check('ordinary confirmed404 retains existing manual-delete recovery',async()=>{
 const t=saveHandler(n=>n===1?({ok:false,status:404,json:async()=>({message:'missing'})}):({ok:true,status:200,json:async()=>({id:'work_replacement'})}));assert.equal((await t.save(project)).id,'work_replacement');assert.equal(t.requests.length,2);assert.equal(t.requests[0].id,'work_expired');assert.equal(t.requests[1].id,'');assert.equal(t.env.savedWorkIdRef.current,'work_replacement');
});
const serverSource=await readFile(new URL('../server.js',import.meta.url),'utf8');
await check('server wires saved-work routes once and starts cleanup after listen',async()=>{
 assert.equal(serverSource.split('registerSavedWorkApi(app,{savedWorkRights,downloadPolicy});').length-1,1);assert(!serverSource.includes("app.post('/api/saved-work'"));assert(serverSource.indexOf('startSavedWorkRetentionCleanup();')>serverSource.indexOf('app.listen('));assert(serverSource.includes("app.use('/api/saved-work',express.json({limit:\"64mb\"}));"));
});
console.log(JSON.stringify({passed:checks,scope:'actual saved-work HTTP routes, cleanup scheduler and existing save handler; injected account/store fixtures, no production writes'}));
