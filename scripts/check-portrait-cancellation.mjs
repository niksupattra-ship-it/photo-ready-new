import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {submitPortraitJob,cancelPortraitJob} from '../src/portrait-operation.js';
const source=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const section=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
function fixture(){
 const operation={jobId:null,cancelled:false,settled:false,cancelling:false};let settlements=0;
 const e={activeProcessOperation:operation,progress:{active:true,value:48,label:'processing'},progressTimerRef:{current:null},progressValueRef:{current:48},portraitResultCache:{clear(){}},hairResultCacheRef:{current:new Map()},cancelPortraitJob,clearInterval(){},setProcessProgress(value){e.progress=typeof value==='function'?value(e.progress):value},setMsg(){},refreshWallet:async()=>{},settleProcessOperation:async current=>{settlements++;current.settled=true},assertProcessActive(){if(operation.cancelled)throw Error('cancelled')},setTimeout};
 e.cancel=new Function('env','with(env){'+section(' const cancelProgress=async()=>{','\n useEffect(()=>()=>{clearInterval(progressTimerRef.current)')+';return cancelProgress}')(e);
 e.finish=new Function('env','with(env){'+section(' const finishProgress=async success=>{','\n const cancelProgress=')+';return finishProgress}')(e);
 return {e,operation,settlements:()=>settlements};
}
let count=0;async function test(name,run){await run();count++;console.log('PASS '+name)}
await test('cancel during upload keeps feedback through its late response and pipeline unwind',async()=>{
 const f=fixture(),gate=deferred(),submission=submitPortraitJob(f.operation,()=>gate.promise),cancel=f.e.cancel();await Promise.resolve();assert(f.e.progress.active&&f.e.progress.cancelling);assert.equal(f.settlements(),0);
 gate.resolve({jobId:'late-job'});await submission;await cancel;assert.equal(f.settlements(),1);assert(f.e.progress.active&&f.e.progress.cancelling,'server cancellation must not expose disabled controls while the caller still unwinds');
 await f.e.finish(false);assert.equal(f.e.progress.active,false);assert.equal(f.e.progress.cancelling,false);assert.equal(f.settlements(),1);
});
for(const stage of ['poll','local composition'])await test('cancelled '+stage+' keeps feedback until finish without a second settlement',async()=>{
 const f=fixture();f.operation.jobId='existing-job';f.operation.pendingSubmission=Promise.resolve({jobId:'existing-job'});await f.e.cancel();assert.equal(f.settlements(),1);assert(f.e.progress.active&&f.e.progress.cancelling);await f.e.finish(false);assert.equal(f.e.progress.active,false);assert.equal(f.settlements(),1);
});
console.log(`PASS ${count} actual App cancellation lifecycle scenarios; no provider or storage operations.`);
