import test from 'node:test';
import assert from 'node:assert/strict';
import {requestReviewSeedream} from '../seedream-review-transport.js';

const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64');
const input={key:'unit-test-key',prompt:'test identity-safe studio portrait',portrait:Buffer.from([1,2,3]),portraitMime:'image/png'};
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('AI provider retries one transient 503 inside the same submission',async()=>{
 let attempts=0;
 const fetchImpl=async()=>{attempts++;return attempts===1?reply(503,{error:{code:'provider_unavailable'}}):reply(200,{data:[{b64_json:png}]})};
 const result=await requestReviewSeedream(input,{fetchImpl,timeoutMs:1000});
 assert.equal(attempts,2);
 assert.deepEqual(result.png.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
});
test('AI provider never retries rejected or moderated images',async()=>{
 let attempts=0;
 const fetchImpl=async()=>{attempts++;return reply(400,{error:{code:'InputImageSensitiveContentDetected',message:'Image rejected'}})};
 await assert.rejects(requestReviewSeedream(input,{fetchImpl,timeoutMs:1000}),error=>error.status===400&&error.code==='InputImageSensitiveContentDetected');
 assert.equal(attempts,1);
});
test('AI provider retries one empty result, then accepts valid PNG',async()=>{
 let attempts=0;
 const fetchImpl=async()=>{attempts++;return attempts===1?reply(200,{data:[{}]}):reply(200,{data:[{b64_json:png}]})};
 await requestReviewSeedream(input,{fetchImpl,timeoutMs:1000});
 assert.equal(attempts,2);
});
