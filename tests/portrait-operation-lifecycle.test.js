import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPortraitOperation,assertPortraitOperationActive,waitForPortraitOperation,submitPortraitJob,cancelPortraitJob} from '../src/portrait-operation.js';
import {deadlineFetch} from '../src/deadline-fetch.js';
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const nativeFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=nativeFetch});
const extract=(start,end,name,env)=>{const a=main.indexOf(start),b=main.indexOf(end,a);assert(a>=0&&b>a);return Function('env','with(env){'+main.slice(a,b)+';return '+name+'}')(env)};
function reads(operation,scope=operation.scope){
 const env={activeProcessOperation:operation,assertProcessActive:op=>assertPortraitOperationActive(op,scope),portraitFetch:(url,options)=>deadlineFetch(url,options,{timeoutMs:30000}),walletHeaders:()=>({'X-Wallet-Id':'different-current-owner'}),analyticsTagError:error=>error,console:{warn(){}},waitForPortraitOperation};
 return extract('async function retryExistingAiJobRead(','async function waitForAiJob(','readExistingAiJob',env);
}
test('cancelling a hung response body stops actual status reads immediately and never retries generation',async()=>{
 const operation=createPortraitOperation({scope:'account-A',headers:{'X-Wallet-Id':'owner-A'}});operation.jobId='owned-job';let calls=0,settled=0,request;
 globalThis.fetch=async(url,options)=>{calls++;request={url,options};return new Response(new ReadableStream({start(){}}),{status:200,headers:{'Content-Type':'application/json'}})};
 const started=Date.now(),pending=reads(operation)('owned-job','','poll_job','json');
 await new Promise(resolve=>setTimeout(resolve,10));operation.cancelled=true;
 await cancelPortraitJob(operation,async()=>{settled++});
 await assert.rejects(pending,error=>error.code==='USER_CANCELLED');
 assert(Date.now()-started<1000,'Cancel must not wait for the 30 second network deadline');assert.equal(calls,1);assert.equal(settled,1);assert.equal(request.options.headers['X-Wallet-Id'],'owner-A');assert.equal(request.options.method,undefined);
});
test('cancellation interrupts retry backoff rather than leaving the editor waiting',async()=>{
 const operation=createPortraitOperation({scope:'account-A'});let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('temporary',{status:503})};
 const pending=reads(operation)('owned-job','','poll_job','json');
 await new Promise(resolve=>setTimeout(resolve,15));operation.cancelled=true;await cancelPortraitJob(operation,async()=>{});
 await assert.rejects(pending,error=>error.code==='USER_CANCELLED');assert.equal(calls,1);
});
test('account/work scope changes reject old results and abort their readers',()=>{
 for(const scope of ['account-B','another-saved-work']){
  const operation=createPortraitOperation({scope:'account-A'});assert.throws(()=>assertPortraitOperationActive(operation,scope),e=>e.code==='USER_CANCELLED');assert(operation.cancelled&&operation.readController.signal.aborted);
 }
});
test('headers are captured per operation; late cancellation cannot use another account or clear its active job',async()=>{
 const headers={'X-Wallet-Id':'owner-A',Authorization:'Bearer fixture-A'},operation=createPortraitOperation({scope:'account-A',headers});operation.jobId='old-job';headers.Authorization='Bearer fixture-B';
 let active={jobId:'new-job'},deleted=0,posted;
 const env={walletHeaders:()=>({'X-Wallet-Id':'owner-B'}),readActiveAiJob:()=>active,writeActiveAiJob:value=>{active=value},clearAiJobFile:async()=>{deleted++},portraitFetch:async(_url,options)=>{posted=options;return {ok:true}}};
 env.clearActiveAiJob=extract('function clearActiveAiJob(','async function portraitFetch(','clearActiveAiJob',env);
 const settle=extract('async function settleProcessOperation(','// Reads of an existing job','settleProcessOperation',env);
 await settle(operation,'cancel');assert.equal(posted.headers['X-Wallet-Id'],'owner-A');assert.equal(posted.headers.Authorization,'Bearer fixture-A');assert.deepEqual(active,{jobId:'new-job'});assert.equal(deleted,0);assert.equal(operation.settled,true);assert.equal(operation.headers,null);
});
test('successful settlement does not wait for unavailable legacy photo storage',async()=>{
 const operation=createPortraitOperation();operation.jobId='same-job';let active={jobId:'same-job'},cleanup=0;
 const env={walletHeaders:()=>({}),readActiveAiJob:()=>active,writeActiveAiJob:value=>{active=value},clearAiJobFile:()=>{cleanup++;return new Promise(()=>{})},portraitFetch:async()=>({ok:true})};
 env.clearActiveAiJob=extract('function clearActiveAiJob(','async function portraitFetch(','clearActiveAiJob',env);
 const settle=extract('async function settleProcessOperation(','// Reads of an existing job','settleProcessOperation',env);
 await settle(operation,'confirm');assert.equal(operation.settled,true);assert.equal(active,null);assert.equal(cleanup,1);
});
test('a pending upload retains its late job ID and cancels once after readers were aborted',async()=>{
 const operation=createPortraitOperation({scope:'account-A'});let resolve,settled=0;
 const pending=submitPortraitJob(operation,()=>new Promise(done=>{resolve=done}));await Promise.resolve();operation.cancelled=true;
 const cancellation=cancelPortraitJob(operation,async()=>{settled++;assert.equal(operation.jobId,'late-job')});
 assert(operation.readController.signal.aborted);assert.equal(settled,0);resolve({jobId:'late-job'});await pending;await cancellation;assert.equal(settled,1);
});
test('a failed cancellation keeps the original owner headers available for settlement retry',async()=>{
 const operation=createPortraitOperation({scope:'account-A',headers:{'X-Wallet-Id':'owner-A'}});operation.jobId='owned-job';
 const posted=[];let failures=1;
 const env={activeProcessOperation:operation,walletHeaders:()=>({'X-Wallet-Id':'owner-B'}),clearActiveAiJob(){},portraitFetch:async(_url,options)=>{posted.push(options.headers['X-Wallet-Id']);return{ok:failures--<=0}},portraitResultCache:{clear(){}},hairResultCacheRef:{current:new Map()},clearInterval(){},progressTimerRef:{current:null},setMsg(){},setProcessProgress(){},refreshWallet:async()=>{}};
 env.settleProcessOperation=extract('async function settleProcessOperation(','// Reads of an existing job','settleProcessOperation',env);
 const finish=extract(' const finishProgress=async success=>{',' const cancelProgress=','finishProgress',env);
 await assert.rejects(finish(false));assert.equal(operation.headers['X-Wallet-Id'],'owner-A');assert.equal(operation.settled,false);
 await env.settleProcessOperation(operation,'cancel');assert.deepEqual(posted,['owner-A','owner-A']);assert.equal(operation.headers,null);assert.equal(operation.settled,true);
});
