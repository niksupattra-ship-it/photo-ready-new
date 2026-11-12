import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {submitPortraitJob,cancelPortraitJob} from '../src/portrait-operation.js';
const source=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const section=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
function fixture(){
 const operation={jobId:null,cancelled:false,settled:false,cancelling:false,finished:false};let settlements=0,busy=true;
 const e={activeProcessOperation:operation,progress:{active:true,value:48,label:'processing'},progressTimerRef:{current:null},progressValueRef:{current:48},portraitResultCache:{clear(){}},hairResultCacheRef:{current:new Map()},cancelPortraitJob,clearInterval(){},setBusy(v){busy=v},englishPreviewEnabled:()=>true,setProcessProgress(value){e.progress=typeof value==='function'?value(e.progress):value},setMsg(message){e.message=message},refreshWallet:async()=>{},settleProcessOperation:async current=>{settlements++;current.settled=true},assertProcessActive(){if(operation.cancelled)throw Error('cancelled')},setTimeout};
 e.cancel=new Function('env','with(env){'+section(' const cancelProgress=()=>{','\n useEffect(()=>()=>{clearInterval(progressTimerRef.current)')+';return cancelProgress}')(e);
 e.finish=new Function('env','with(env){'+section(' const finishProgress=async success=>{','\n const cancelProgress=')+';return finishProgress}')(e);
 return {e,operation,settlements:()=>settlements,busy:()=>busy};
}
let count=0;async function test(name,run){await run();count++;console.log('PASS '+name)}
await test('cancel during pending upload dismisses overlay without losing late-job settlement',async()=>{
 const f=fixture(),gate=deferred(),submission=submitPortraitJob(f.operation,()=>gate.promise);
 f.e.cancel();await Promise.resolve();
 assert.equal(f.e.progress.active,false,'cancel must immediately hide the blocking overlay');
 assert.equal(f.busy(),false,'cancel must release the busy UI');
 assert.equal(f.operation.cancelled,true,'a late result must remain rejected');
 assert.equal(f.settlements(),0,'never invent a job ID before upload responds');
 gate.resolve({jobId:'late-job'});await submission;await f.operation.cancellation;
 assert.equal(f.settlements(),1,'the actual returned job must still be cancelled exactly once');
 await f.e.finish(false);
 assert.equal(f.e.progress.active,false);
 assert.equal(f.operation.finished,true);
 assert.equal(f.settlements(),1);
});
for(const stage of ['poll','local composition'])await test('cancelled '+stage+' dismisses overlay while preventing a second settlement',async()=>{
 const f=fixture();f.operation.jobId='existing-job';f.operation.pendingSubmission=Promise.resolve({jobId:'existing-job'});
 f.e.cancel();assert.equal(f.e.progress.active,false);assert.equal(f.busy(),false);
 await f.operation.cancellation;assert.equal(f.settlements(),1);
 await f.e.finish(false);assert.equal(f.e.progress.active,false);assert.equal(f.settlements(),1);
});
await test('UI guards prevent late cancellation result from replacing original photo',async()=>{
 assert(source.includes('if(cancellationStillUnwinding())throw Error(pendingCancelMessage())'));
 assert(source.includes('operation.cancelled=true;operation.cancelling=true'));
 assert(!section(' const cancelProgress=()=>{','\n useEffect(()=>()=>{clearInterval(progressTimerRef.current)').includes('operation.cancelled=false'));
});
console.log(`PASS ${count} actual App cancellation lifecycle scenarios; no provider or storage operations.`);
