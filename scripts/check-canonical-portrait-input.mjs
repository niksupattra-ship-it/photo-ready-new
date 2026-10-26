import assert from 'node:assert/strict';
import {canonicalPortraitInput} from '../src/canonical-portrait-input.js';
import {submitPortraitJob,cancelPortraitJob} from '../src/portrait-operation.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const photo=value=>new File([value],'portrait.jpg',{type:'image/jpeg'});
let count=0;
async function test(name,run){await run();count++;console.log('PASS '+name)}
await test('one source shares one normalization and retains the exact first submitted Blob',async()=>{
 const source=photo('original'),gate=deferred(),canonical=new Blob(['chrome-png'],{type:'image/png'});let calls=0;
 const normalize=()=>{calls++;return gate.promise};
 const a=canonicalPortraitInput(source,{normalize}),b=canonicalPortraitInput(source,{normalize});
 gate.resolve(canonical);assert.equal(await a,canonical);assert.equal(await b,canonical);assert.equal(calls,1);
 assert.equal(await canonicalPortraitInput(source,{normalize:()=>{throw Error('must reuse')}}),canonical);
});
await test('a first optional-leveling fallback remains the canonical input after the model recovers',async()=>{
 const source=photo('raw-fallback');assert.equal(await canonicalPortraitInput(source,{normalize:async()=>source}),source);
 assert.equal(await canonicalPortraitInput(source,{normalize:async()=>new Blob(['later-level'],{type:'image/png'})}),source);
});
await test('restored canonical bytes bypass a different browser encoder and uploads stay isolated',async()=>{
 const source=photo('original'),canonical=new Blob(['stored-canonical'],{type:'image/png'});source.idpromCanonicalInput=canonical;
 assert.equal(await canonicalPortraitInput(source,{normalize:()=>{throw Error('must not encode')}}),canonical);
 const other=photo('other');assert.notEqual(await canonicalPortraitInput(other,{normalize:async()=>other}),canonical);
});
await test('invalid normalization is not cached and legacy originals retain their frozen bytes',async()=>{
 const source=photo('original');await assert.rejects(canonicalPortraitInput(source,{normalize:async()=>null}));
 assert.equal(source.idpromCanonicalInput,undefined);assert.equal(await canonicalPortraitInput(source,{normalize:async()=>source}),source);
 source.idpromCanonicalInput=new Blob(['new-png'],{type:'image/png'});assert.equal(await canonicalPortraitInput(source,{legacy:true}),source);
});
await test('cancel waits through preparation and a delayed response, then settles the late job only once',async()=>{
 const operation={cancelled:true,settled:false},gate=deferred();let settled=0,done=false;
 const submission=submitPortraitJob(operation,()=>gate.promise);
 const settle=async()=>{assert.equal(operation.jobId,'late-job');settled++;operation.settled=true};
 const cancel=cancelPortraitJob(operation,settle).then(()=>{done=true});
 assert.equal(cancelPortraitJob(operation,settle),operation.cancellation);await Promise.resolve();assert.equal(done,false);assert.equal(settled,0);
 gate.resolve({jobId:'late-job'});await submission;await cancel;assert.equal(done,true);assert.equal(settled,1);
});
await test('a failed pending submission releases cancellation without inventing a job',async()=>{
 const operation={},gate=deferred();let settled=0;
 const submission=submitPortraitJob(operation,()=>gate.promise);const cancellation=cancelPortraitJob(operation,async()=>{settled++});
 gate.reject(Error('offline'));await assert.rejects(submission);await cancellation;assert.equal(settled,0);assert.equal(operation.jobId,undefined);
});
await test('settlement failure can be retried without resubmitting the portrait',async()=>{
 const operation={jobId:'existing'};let calls=0;
 await assert.rejects(cancelPortraitJob(operation,async()=>{calls++;throw Error('temporary cancel failure')}));
 await cancelPortraitJob(operation,async()=>{calls++;operation.settled=true});assert.equal(calls,2);assert.equal(operation.settled,true);
});
console.log(`PASS ${count} canonical input and cancellation lifecycle scenarios; no network, AI, storage or financial writes.`);
