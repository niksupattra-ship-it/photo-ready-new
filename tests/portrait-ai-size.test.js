import test from 'node:test';
import assert from 'node:assert/strict';
import {PORTRAIT_AI_OUTPUT_SIZE,seedreamProPayload} from '../seedream-pro-payload.js';
import {seedreamReviewPayload,seedreamLabPayload,requestReviewSeedream} from '../seedream-review-transport.js';
import {femalePromptCacheKey} from '../female-prompt-cache-key.js';

test('all Seedream transports enforce the requested budget size without changing model or references',()=>{
 const portrait=Buffer.from('person'),hair=Buffer.from('hair'),outfit=Buffer.from('outfit');
 for(const priorSize of ['2K','1824x2432','1728x2304',undefined]){
  const p=seedreamReviewPayload({prompt:'unchanged',portrait,hair,outfit,size:priorSize});
  assert.equal(p.size,'1.5K');assert.equal(p.model,'dola-seedream-5-0-flash-260915');assert.equal(p.prompt,'unchanged');
  assert.deepEqual(p.image,[portrait,hair,outfit].map(x=>'data:image/png;base64,'+x.toString('base64')));
 }
 assert.equal(seedreamProPayload('same',['person','outfit','hair']).size,PORTRAIT_AI_OUTPUT_SIZE);
 assert.equal(seedreamLabPayload('same',['person','outfit','hair']).size,PORTRAIT_AI_OUTPUT_SIZE);
 assert.notEqual(femalePromptCacheKey('same','same-model','2K'),femalePromptCacheKey('same','same-model','1.5K'));
});

test('the actual Flash provider request uses 1.5K even when an old caller asks for full custom dimensions',async()=>{
 let calls=0;
 await assert.rejects(requestReviewSeedream({key:'inert',prompt:'same',portrait:Buffer.from('same'),size:'1824x2432',singleAttempt:true},{fetchImpl:async(_url,request)=>{
  calls++;assert.equal(JSON.parse(request.body).size,'1.5K');return Response.json({error:{message:'inert rejection'}},{status:400});
 }}));
 assert.equal(calls,1);
});
