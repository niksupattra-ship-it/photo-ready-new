import test from 'node:test';
import assert from 'node:assert/strict';
import {openaiProviderFailure} from '../openai-provider-error.js';
import {requestOpenAIPortrait} from '../openai-portrait-transport.js';
import {describePortraitFailure} from '../src/portrait-process-failure.js';
test('429 billing, rate, request size and unknown limits stay distinct and never expose raw provider secrets',async()=>{
 for(const [body,code] of [[{code:'insufficient_quota'},'openai_quota_exceeded'],[{code:'billing_hard_limit_reached'},'openai_quota_exceeded'],[{code:'rate_limit_exceeded'},'openai_rate_limited'],[{code:'rate_limit_exceeded',message:'Rate limit reached on tokens per min: Limit 30000, Used 29000, Requested 2000'},'openai_rate_limited'],[{code:'rate_limit_exceeded',message:'Request too large for model'},'openai_request_limit'],[{},'openai_throttled']]){
  let calls=0;
  await assert.rejects(requestOpenAIPortrait({key:'test',prompt:'same',portrait:Buffer.from('png')},{fetchImpl:async()=>{calls++;return {ok:false,status:429,json:async()=>({error:{...body,private:'sk-test-private-value'}})}}}),e=>e.code===code&&!e.message.includes('sk-test-private-value'));
  assert.equal(calls,1,'Never retry a potentially billable request');
  const error=openaiProviderFailure(429,{error:body});
  for(const english of [false,true]){
   assert.equal(describePortraitFailure({code,status:429,message:error.message},english).code,code);
   assert.equal(describePortraitFailure({message:'ประมวลผลไม่สำเร็จ: '+error.message,stage:'generation'},english).code,code,'Persisted job text must preserve the cause after code/status are lost');
  }
 }
});
test('active-job conflicts and customer credit shortages keep their own existing error paths',()=>{
 assert.equal(describePortraitFailure({code:'ACTIVE_AI_JOB',status:429}).code,'active_ai_job');
 assert.equal(describePortraitFailure({status:402}).code,'credit_required');
 assert.equal(openaiProviderFailure(500,{error:{message:'private'}}).code,'openai_failed');
 assert.equal(openaiProviderFailure(400,{error:{code:'moderation_blocked'}}).code,'AI_OUTPUT_REJECTED');
});

test('previous generic OpenAI 429 job errors no longer blame the customer photo or another active job',()=>{
 const old={message:'ประมวลผลไม่สำเร็จ: OpenAI ประมวลผลไม่สำเร็จ (429)',stage:'generation'};
 assert.equal(describePortraitFailure(old).code,'openai_throttled');
 assert.equal(describePortraitFailure(old,true).code,'openai_throttled');
});
