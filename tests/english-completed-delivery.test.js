import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ENGLISH_HEAD_BALANCE_VERSION} from '../src/english-head-balance.js';
const raw=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const start=raw.indexOf('async function balanceEnglishPortrait('),end=raw.indexOf('\nasync function aiFinishPortrait(',start);
test('a completed English pair is retained without another AI correction, even if ratios or local measurements fail',async()=>{
 const forbidden=()=>{throw Error('No second AI edit or ratio-based delivery gate')};
 const env={ENGLISH_HEAD_BALANCE_VERSION,assertProcessActive(){},portraitFetch:forbidden,waitForAiJob:forbidden,measureEnglishProportions:forbidden,portraitFaceLandmarks:forbidden,decodedPortraitImage:forbidden};
 const balance=Function('env','with(env){'+raw.slice(start,end)+';return balanceEnglishPortrait}')(env);
 for(const correction of [undefined,'done','failed']){
  const makeup=new Blob(['makeup']),natural=Object.assign(new Blob(['natural']),{idpromAiMakeupBlob:makeup,idpromEnglishProportionCorrection:correction});
  assert.equal(await balance(natural),natural);assert.equal(natural.idpromAiMakeupBlob,makeup);
 }
 assert(raw.includes('await checkPortraitCompletion(originalFile,cached.value,hairId)'));
});
test('worker logs distinguish completed jobs from failed responses and worker exit',async()=>{
 const server=await readFile(new URL('../server.js',import.meta.url),'utf8');
 const a=server.indexOf('async function runAiJob('),b=server.indexOf("app.post('/api/ai-jobs'",a);
 for(const status of [200,500]){
  const events=[],logs=[];const env={activeAiJobs:new Set(),claimAiJob:async()=>({fields:{},image:new Uint8Array([1]),wallet_id:'owner',usage_id:'usage'}),setInterval:()=>({unref(){}}),clearInterval(){},touchAiJob:async()=>{},captureResponse:()=>({res:{},done:Promise.resolve(),get:()=>({statusCode:status,payload:Buffer.from(status===200?'PNG':'makeup failed')})}),aiFinishHandler:async req=>{req.aiMakeupVariant=Buffer.from('paired PNG')},completeAiJob:async()=>events.push('complete'),refundCredit:async()=>events.push('refund'),failAiJob:async()=>events.push('fail'),console:{info:(...x)=>logs.push(x),error:(...x)=>logs.push(x)}};
  const run=Function('env','with(env){'+server.slice(a,b)+';return runAiJob}')(env);await run('job-fixture');
  assert(logs.some(x=>x[0]===(status===200?'AI job completed':'AI job failed')&&x[1]==='job-fixture'));
  assert(logs.some(x=>x[0]==='AI job worker stopped'));
  assert.deepEqual(events,status===200?['complete']:['refund','fail']);
 }
});
