import test from 'node:test';
import assert from 'node:assert/strict';
import {createFemaleReferenceAnalyzer} from '../female-reference-evidence-client.js';
test('shared female analyzer measures each source once and forwards the complete worker measurement',async()=>{
 const file=new Blob(['person']),other=new Blob(['person']);let calls=0,closed=0;
 const measurement={evidence:{version:'fixture'},landmarks:[{x:.5,y:.4}],width:480,height:640};
 const measure=createFemaleReferenceAnalyzer({createWorker:()=>{calls++;return {terminate(){closed++},postMessage(message){assert.equal(message.evidenceOnly,true);queueMicrotask(()=>this.onmessage({data:measurement}));}}}});
 const a=measure(file),b=measure(file);assert.equal(a,b);assert.equal(await a,measurement);assert.equal(await measure(file),measurement);assert.equal(calls,1);assert.equal(closed,1);
 await measure(other);assert.equal(calls,2);
});
test('failed shared face analysis can retry without retaining a failed cache entry',async()=>{
 let calls=0,closed=0;
 const measure=createFemaleReferenceAnalyzer({createWorker:()=>({terminate(){closed++},postMessage(){calls++;queueMicrotask(()=>this.onmessage({data:{error:'not frontal'}}));}})}),file=new Blob(['person']);
 await assert.rejects(measure(file),/not frontal/);await assert.rejects(measure(file),/not frontal/);assert.equal(calls,2);assert.equal(closed,2);
});
