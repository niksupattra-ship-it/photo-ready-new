import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const start=main.indexOf('async function aiFinishPortraitUncached(');
const end=main.indexOf('\n// V206:',start);
assert(start>=0&&end>start);
const make=env=>Function('env',`with(env){${main.slice(start,end)};return aiFinishPortraitUncached}`)(env);
let passed=0;
{
 const a=main.indexOf('function warmPortraitResources('),b=main.indexOf('\nfunction interp(',a);
 const cause=Error('Failed to fetch');
 const env={getLandmarker:async()=>{throw cause},getPersonSegmenter:async()=>({}),loadImage:async()=>({})};
 const warm=Function('env',`with(env){${main.slice(a,b)};return warmPortraitResources}`)(env);
 await assert.rejects(warm(new Blob()),e=>e.code==='PORTRAIT_MODEL_UNAVAILABLE'&&e.cause===cause&&!e.message.includes('Failed to fetch'));
 passed++;
}
{
 const a=main.indexOf('function warmPortraitResources('),b=main.indexOf('\nfunction interp(',a);let segmented=0;
 const env={getLandmarker:async()=>({}),getPersonSegmenter:async()=>{segmented++;throw Error('unused model offline')},loadImage:async()=>({})};
 const warm=Function('env',`with(env){${main.slice(a,b)};return warmPortraitResources}`)(env);
 await warm(new Blob(),null,{requiresSegmentation:false});assert.equal(segmented,0);
 await assert.rejects(warm(new Blob()),e=>e.code==='PORTRAIT_MODEL_UNAVAILABLE');assert.equal(segmented,1);passed++;
}
for(const hair of ['original','seedream-41']){
 const error=Object.assign(Error('model unavailable'),{code:'PORTRAIT_MODEL_TIMEOUT'});
 let submissions=0;
 const env={activeProcessOperation:{},assertProcessActive(){},async warmPortraitResources(){throw error},submitPortraitJob(){submissions++}};
 await assert.rejects(make(env)(new Blob(),hair),e=>e===error);
 assert.equal(submissions,0);passed++;
}
for(const cancel of [false,true]){
 let ready,submissions=0;
 const gate=new Promise(resolve=>{ready=resolve});
 const operation={cancelled:false},submitted=Error('submission boundary');
 const env={activeProcessOperation:operation,assertProcessActive(){if(operation.cancelled)throw Error('cancelled')},warmPortraitResources:()=>gate,PRODUCTION_HAIR_CATALOG:[],async submitPortraitJob(){submissions++;throw submitted}};
 const pending=make(env)(new Blob(),'seedream-41',{portraitMode:'female'});
 await Promise.resolve();assert.equal(submissions,0);
 operation.cancelled=cancel;ready();
 await assert.rejects(pending,e=>cancel?e.message==='cancelled':e===submitted);
 assert.equal(submissions,cancel?0:1);passed++;
}
console.info(JSON.stringify({passed,scope:'Missing or pending browser models and cancellation prevent AI submission for original and selected hair.'}));
