import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {once} from 'node:events';
import http from 'node:http';
import express from 'express';

// Exercise the real route and queue. Replace only the unused production store import.
const stub='data:text/javascript,'+encodeURIComponent('const fail=()=>{throw Error("unexpected default store call")};export const MAX_SAVED_WORKS=3,saveWork=fail,listWorks=fail,getWork=fail,deleteWork=fail,getSavedWorkRetentionPolicy=fail;');
const source=await readFile(new URL('../saved-work-api.js',import.meta.url),'utf8');
const code=source.replace(/from '\.\/saved-work-store\.js'/g,`from '${stub}'`).replace(/from '(\.\/(?:src\/saved-work-transfer|src\/saved-project|saved-work-response)\.js)'/g,(_,relative)=>`from '${new URL(relative,new URL('../saved-work-api.js',import.meta.url)).href}'`);
assert.notEqual(code,source);
const {registerSavedWorkApi}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const cases=[];
const check=async(name,run)=>{await run();cases.push(name);console.log('PASS '+name)};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
const until=async predicate=>{const end=Date.now()+2500;while(!predicate()){if(Date.now()>end)throw Error('test condition timed out');await new Promise(resolve=>setTimeout(resolve,5))}};
const failure=code=>Object.assign(Error('private error details: '+code),{code});
const preview={width:900,height:1200,layers:[{id:'head',kind:'head',source:'data:image/webp;base64,SMALL_PREVIEW',x:0,y:0,scale:1,rotation:0,opacity:1,visible:true}]};
const project=id=>({id,layers:[{jobId:'private_job_'+id,source:'data:image/png;base64,FULL_SIZE_PRIVATE_SOURCE'}],compareSource:'PRIVATE_ORIGINAL'});
let mutations=0;

async function fixture(options={}){
 const calls=[],arrivals=[],closed=[],finished=[];
 const store={MAX_SAVED_WORKS:3,
  getSavedWorkRetentionPolicy:async()=>({days:45}),listWorks:async()=>[],
  saveWork:async()=>{mutations++;throw Error('preview must not save')},deleteWork:async()=>{mutations++;throw Error('preview must not delete')},
  getWork:async(wallet,id)=>{calls.push(['get',wallet,id]);return options.getWork?options.getWork(wallet,id):wallet==='wallet_A'&&id!=='foreign'?{id,project:project(id),expires_at:'2099-01-01T00:00:00Z'}:null}
 };
 const app=express();
 app.use((req,res,next)=>{arrivals.push(req.url);res.once('close',()=>closed.push(req.url));res.once('finish',()=>finished.push(req.url));const account=req.get('X-Test-Account');if(account==='A'||account==='B')req.accountUser={wallet_id:'wallet_'+account};next()});
 registerSavedWorkApi(app,{store,
  savedWorkRights:async(wallet,p)=>{calls.push(['rights',wallet,p.id]);return options.rights?options.rights(wallet,p):true},
  buildPreview:async(p,optionsForPreview)=>{calls.push(['build',p.id]);return options.build?options.build(p,optionsForPreview):preview}
 });
 app.get('/test-ready',(req,res)=>res.json({ok:true}));
 const server=http.createServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 const request=async(id,{account='A',signal,path}={})=>{
  const headers={'X-Wallet-Id':'wallet_B'};if(account)headers['X-Test-Account']=account;
  const response=await fetch(base+(path||'/api/saved-work/'+id+'/preview'),{headers,signal});
  const data=await response.json();
  if(!path)assert.equal(response.headers.get('cache-control'),'no-store');
  return {status:response.status,data,retryAfter:response.headers.get('retry-after')};
 };
 return {calls,arrivals,closed,finished,request,async close(){const closing=once(server,'close');server.close();server.closeAllConnections();await closing}};
}
async function withFixture(options,run){const f=await fixture(options);try{await run(f)}finally{await f.close()}}

await check('unauthenticated previews return401 before reading a full project',()=>withFixture({},async f=>{
 const r=await f.request('legacy',{account:false});assert.equal(r.status,401);assert.deepEqual(f.calls,[]);
}));
await check('preview reads use the authenticated wallet and ignore spoofed wallet headers',()=>withFixture({},async f=>{
 const r=await f.request('legacy');assert.equal(r.status,200);assert.deepEqual(f.calls,[['get','wallet_A','legacy'],['rights','wallet_A','legacy'],['build','legacy']]);
}));
await check('legacy and new saved projects both render without a preexisting thumbnail',()=>withFixture({},async f=>{
 for(const id of ['legacy','new']){const r=await f.request(id);assert.equal(r.status,200);assert.deepEqual(r.data,preview)}
 assert.equal(f.calls.filter(c=>c[0]==='build').length,2);
}));
await check('preview response contains the compact scene and no full project or original fields',()=>withFixture({},async f=>{
 const r=await f.request('legacy');assert.deepEqual(r.data,preview);const body=JSON.stringify(r.data);
 for(const privateValue of ['FULL_SIZE_PRIVATE_SOURCE','PRIVATE_ORIGINAL','private_job','compareSource'])assert(!body.includes(privateValue));
}));
await check('missing and foreign projects return404 without checking rights or rendering',()=>withFixture({},async f=>{
 for(const [id,account] of [['foreign','A'],['legacy','B']]){f.calls.length=0;const r=await f.request(id,{account});assert.equal(r.status,404);assert.equal(f.calls.length,1);assert(!r.data.project)}
}));
await check('output rights remain authoritative and denied previews never render',()=>withFixture({rights:async()=>false},async f=>{
 const r=await f.request('legacy');assert.equal(r.status,403);assert(!f.calls.some(c=>c[0]==='build'));assert(!r.data.layers);
}));
await check('expired or purged work returns410 and never creates or renders a project',()=>withFixture({getWork:async()=>{throw failure('saved_work_expired')}},async f=>{
 const r=await f.request('expired');assert.equal(r.status,410);assert.equal(r.data.error,'saved_work_expired');assert(!r.data.project);assert(!f.calls.some(c=>c[0]!=='get'));
}));
await check('builder failures return controlled422 and release the next preview',async()=>{
 let n=0;await withFixture({build:async()=>{if(n++===0)throw failure('SAVED_WORK_PREVIEW_UNAVAILABLE');return preview}},async f=>{
  const failed=await f.request('corrupt');assert.equal(failed.status,422);assert.equal(failed.data.error,'saved_work_preview_unavailable');assert(!JSON.stringify(failed.data).includes('private error'));
  assert.equal((await f.request('valid')).status,200);
 });
});
await check('store and rights failures do not leak details or permanently hold the queue',async()=>{
 for(const stage of ['getWork','rights']){let fail=true;const options={[stage]:async(...args)=>{if(fail){fail=false;throw failure('08006')}return stage==='getWork'?{id:args[1],project:project(args[1])}:true}};
  await withFixture(options,async f=>{const r=await f.request('failed');assert.equal(r.status,422);assert(!JSON.stringify(r.data).includes('08006'));assert.equal((await f.request('valid')).status,200)});
 }
});
await check('full project reads and rendering are serialized across thumbnail requests',async()=>{
 const gate=deferred();let resident=0,maximum=0;
 await withFixture({getWork:async(wallet,id)=>{resident++;maximum=Math.max(maximum,resident);return {id,project:project(id)}},build:async p=>{if(p.id==='first')await gate.promise;resident--;return preview}},async f=>{
  const first=f.request('first');await until(()=>f.calls.some(c=>c[0]==='build'&&c[1]==='first'));
  const second=f.request('second'),third=f.request('third');await until(()=>f.arrivals.length===3);await nextTurn();
  assert.equal(f.calls.filter(c=>c[0]==='get').length,1);assert.equal((await f.request('',{path:'/test-ready'})).status,200);
  gate.resolve();assert((await Promise.all([first,second,third])).every(r=>r.status===200));assert.equal(maximum,1);assert.equal(resident,0);
 });
});
await check('queue is bounded, returns retryable503, and still rejects unauthenticated calls immediately',async()=>{
 const gate=deferred();await withFixture({build:async p=>{if(p.id==='active')await gate.promise;return preview}},async f=>{
  const first=f.request('active');await until(()=>f.calls.some(c=>c[0]==='build'));
  const waiting=Array.from({length:6},(_,i)=>f.request('waiting_'+i));await until(()=>f.arrivals.length===7);await nextTurn();
  const overflow=await f.request('overflow');assert.equal(overflow.status,503);assert.equal(overflow.data.error,'saved_work_preview_busy');assert.equal(overflow.retryAfter,'2');
  assert.equal((await f.request('unauth',{account:false})).status,401);assert.equal(f.calls.filter(c=>c[0]==='get').length,1);
  gate.resolve();assert((await Promise.all([first,...waiting])).every(r=>r.status===200));assert(!f.calls.some(c=>c[0]==='get'&&c[2]==='overflow'));
 });
});
await check('aborted queued previews are removed without loading their full project',async()=>{
 const gate=deferred();await withFixture({build:async p=>{if(p.id==='active')await gate.promise;return preview}},async f=>{
  const first=f.request('active');await until(()=>f.calls.some(c=>c[0]==='build'));
  const controller=new AbortController(),cancelled=f.request('cancelled',{signal:controller.signal}).catch(error=>error);
  await until(()=>f.arrivals.some(p=>p.includes('/cancelled/')));controller.abort();const error=await cancelled;assert.equal(error.name,'AbortError');
  await until(()=>f.closed.some(p=>p.includes('/cancelled/')));await nextTurn();
  const pending=Array.from({length:6},(_,i)=>f.request('after_cancel_'+i));await until(()=>f.arrivals.length===8);await nextTurn();
  gate.resolve();assert((await Promise.all([first,...pending])).every(r=>r.status===200));assert(!f.calls.some(c=>c[0]==='get'&&c[2]==='cancelled'));
 });
});
await check('aborting an active response keeps memory serialization until its builder finishes',async()=>{
 const gate=deferred();await withFixture({build:async p=>{if(p.id==='active_cancelled')await gate.promise;return preview}},async f=>{
  const controller=new AbortController(),first=f.request('active_cancelled',{signal:controller.signal}).catch(error=>error);
  await until(()=>f.calls.some(c=>c[0]==='build'));controller.abort();assert.equal((await first).name,'AbortError');
  await until(()=>f.closed.some(p=>p.includes('/active_cancelled/')));
  const second=f.request('next');await until(()=>f.arrivals.length===2);await nextTurn();assert.equal(f.calls.filter(c=>c[0]==='get').length,1);
  gate.resolve();assert.equal((await second).status,200);assert.equal((await f.request('still_available')).status,200);
 });
});
await check('active response cancellation aborts its builder signal and releases the slot without sending a response',async()=>{
 let builderSignal,aborted=false;
 await withFixture({build:async(p,{signal})=>{
  assert(signal instanceof AbortSignal);
  if(p.id!=='abortable')return preview;
  builderSignal=signal;assert.equal(signal.aborted,false);
  await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Object.assign(Error('cancelled'),{name:'AbortError'}))},{once:true}));
  throw Error('aborted builder must not complete');
 }},async f=>{
  const controller=new AbortController(),active=f.request('abortable',{signal:controller.signal}).catch(error=>error);
  await until(()=>builderSignal);controller.abort();assert.equal((await active).name,'AbortError');
  await until(()=>aborted);assert.equal(builderSignal.aborted,true);
  assert.equal((await f.request('after_abort')).status,200);
  assert(!f.finished.some(path=>path.includes('/abortable/')),'cancelled response must not be sent');
  assert(f.finished.some(path=>path.includes('/after_abort/')));
 });
});
await check('queued previews time out after15 seconds, avoid a full read and allow later recovery',async()=>{
 const gate=deferred();await withFixture({build:async p=>{if(p.id==='held')await gate.promise;return preview}},async f=>{
  const first=f.request('held');await until(()=>f.calls.some(c=>c[0]==='build'));
  const start=Date.now(),r=await f.request('wait_timeout');const elapsed=Date.now()-start;
  assert.equal(r.status,503);assert.equal(r.retryAfter,'2');assert(elapsed>=14500&&elapsed<20000,'expected real bounded wait, got '+elapsed);
  assert(!f.calls.some(c=>c[0]==='get'&&c[2]==='wait_timeout'));gate.resolve();assert.equal((await first).status,200);assert.equal((await f.request('recovered')).status,200);
 });
});
await check('all thumbnail scenarios perform zero save/delete/credit mutations',async()=>{assert.equal(mutations,0)});

const report={passed:cases.length,cases,scope:'actual Express thumbnail route and queue; injected authenticated store/rights/compact-render fixtures; no production DB, customer data, payment or AI calls'};
if(process.env.SAVED_THUMBNAIL_API_REPORT)await writeFile(process.env.SAVED_THUMBNAIL_API_REPORT,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
