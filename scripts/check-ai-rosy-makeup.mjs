import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {makeupLook} from '../makeup-presets.js';
import {registerRosyMakeupApi,ROSY_AI_LOOK,ROSY_AI_PROMPT} from '../rosy-makeup-api.js';
import {requestAiRosyMakeup} from '../src/ai-rosy-makeup.js';
import {preserveLocalSkinLook} from '../src/preserve-local-skin-look.js';
const png=await sharp({create:{width:64,height:80,channels:4,background:'#ba9680'}}).png().toBuffer();
const routes=new Map(),app={get:(p,...h)=>routes.set('GET '+p,h.at(-1)),post:(p,...h)=>routes.set('POST '+p,h.at(-1))};
let reserves=0,generations=0,allow=true,token='test-only',pending=[],settlements=[];
registerRosyMakeupApi(app,{upload:{single:()=>()=>{}},walletId:req=>req.owner,getWallet:async owner=>owner==='owner',getAiJobResult:async(id,owner)=>id==='source'&&owner==='owner'?{status:'completed'}:null,hasPrivateTrial:()=>false,key:()=>token,access:async()=>({remaining:1}),reserve:async()=>allow?'use-'+(++reserves):null,settle:async(id,success)=>{settlements.push([id,success]);return success?'completed':'released'},generate:options=>{generations++;assert.equal(options.prompt,ROSY_AI_PROMPT);assert.equal(options.size,'2K');return new Promise((resolve,reject)=>pending.push({resolve,reject}))}});
async function call(method,path,{owner='owner',body={},file,params={},query={}}={}){
 const res={statusCode:200,headersSent:false,status(n){this.statusCode=n;return this},set(){return this},type(){return this},json(data){this.data=data;this.headersSent=true;return this},send(data){this.data=data;this.headersSent=true;return this}};
 await routes.get(method+' '+path)({owner,body,file,params,query},res);return res;
}
const submit=(extra={})=>call('POST','/api/makeup/rosy/jobs',{body:{lookId:ROSY_AI_LOOK,sourceJobId:'source'},file:{mimetype:'image/png',buffer:png},...extra});
const tick=()=>new Promise(r=>setTimeout(r,5));
const waitUntil=async test=>{for(let i=0;i<200;i++){if(await test())return;await tick()}throw Error('Fixture timed out')};
assert.equal((await submit({owner:'other'})).statusCode,401);
assert.equal((await submit({body:{lookId:ROSY_AI_LOOK,sourceJobId:'foreign'}})).statusCode,403);
assert.equal((await submit({body:{lookId:'skin-smooth-v1',sourceJobId:'source'}})).statusCode,400);
token='';assert.equal((await submit()).statusCode,503);token='test-only';
allow=false;assert.equal((await submit()).statusCode,402);allow=true;assert.equal(generations,0);
const first=await submit();assert.equal(first.statusCode,202);await waitUntil(()=>generations===1);
assert.equal((await submit()).data.jobId,first.data.jobId);assert.equal(reserves,1);assert.equal(generations,1);
assert.equal((await call('GET','/api/makeup/rosy/jobs/:id',{owner:'other',params:{id:first.data.jobId}})).statusCode,404);
assert.equal((await call('POST','/api/makeup/rosy/jobs/:id/confirm',{params:{id:first.data.jobId}})).statusCode,409);
await call('POST','/api/makeup/rosy/jobs/:id/cancel',{params:{id:first.data.jobId}});assert.deepEqual(settlements.at(-1),['use-1',false]);
pending.shift().resolve({png});await tick();
const second=await submit();assert.equal(second.statusCode,202);await waitUntil(()=>generations===2);pending.shift().resolve({png});
await waitUntil(async()=>(await call('GET','/api/makeup/rosy/jobs/:id',{params:{id:second.data.jobId}})).data.status==='completed');
assert.equal((await call('GET','/api/makeup/rosy/jobs/:id/image',{params:{id:second.data.jobId}})).statusCode,200);
await call('POST','/api/makeup/rosy/jobs/:id/confirm',{params:{id:second.data.jobId}});await call('POST','/api/makeup/rosy/jobs/:id/confirm',{params:{id:second.data.jobId}});
assert.equal(settlements.filter(([id,ok])=>id==='use-2'&&ok).length,1);assert.equal((await submit()).data.jobId,second.data.jobId);assert.equal(generations,2);

// Client protocol is tested with intercepted requests, including late submit/cancel.
for(const scenario of ['success','validation-failure','cancel-during-submit','failed-provider']){
 const events=[],controller=new AbortController();let compose=0;
 const fetcher=async(url,options)=>{events.push(url);if(url.endsWith('/jobs')){assert.equal(options.body.get('lookId'),ROSY_AI_LOOK);if(scenario==='cancel-during-submit')controller.abort();return {ok:true,json:async()=>({jobId:'job'})}}
  if(url.endsWith('/image'))return {ok:true,blob:async()=>new Blob([png],{type:'image/png'})};
  if(url.endsWith('/confirm')||url.endsWith('/cancel'))return {ok:true,json:async()=>({ok:true})};
  return {ok:true,json:async()=>({status:scenario==='failed-provider'?'failed':'completed'})};
 };
 let failed=false;try{await requestAiRosyMakeup('source',{sourceJobId:'source',headers:{},fetcher,signal:controller.signal,readSource:async()=>new Blob([png],{type:'image/png'}),compose:async()=>{compose++;if(scenario==='validation-failure')throw Error('geometry');return 'AI-canvas'}})}catch{failed=true}
 assert.equal(failed,scenario!=='success');assert.equal(events.some(x=>x.endsWith('/confirm')),scenario==='success');assert.equal(events.some(x=>x.endsWith('/cancel')),scenario!=='success');
 if(scenario==='cancel-during-submit'||scenario==='failed-provider')assert.equal(compose,0);
}
let renders=0;const replacement={portraitMode:'female',source:'new-hair'};
assert.equal(await preserveLocalSkinLook({portraitMode:'female',makeupStyles:{look:ROSY_AI_LOOK}},replacement,{render:()=>{renders++}}),replacement);assert.equal(renders,0,'Hair changes must not silently start another paid makeup request');
// Exercise the production dispatch, not just the isolated network helper.
const main=await readFile('src/main.jsx','utf8'),start=main.indexOf('async function requestStudioMakeupUncached('),end=main.indexOf('\nfunction opaqueBounds(',start);
let aiDispatches=0;
const dispatch=Function('env',`with(env){${main.slice(start,end)};return requestStudioMakeupUncached}`)({makeupLook,ROSY_AI_LOOK,currentResultCacheScope:()=> 'owner-scope',walletHeaders:()=>({'X-Wallet-ID':'owner'}),requestAiRosyMakeup:async(source,options)=>{assert.equal(source,'CURRENT-HEAD');assert.equal(options.sourceJobId,'source');assert.equal(typeof options.compose,'function');aiDispatches++;return 'AI-RESULT'},renderLocalSkin:()=>{throw Error('AI look silently fell back to local skin')}});
assert.equal(await dispatch('CURRENT-HEAD',{look:ROSY_AI_LOOK},{sourceJobId:'source'}),'AI-RESULT');assert.equal(aiDispatches,1);
console.log('PASS real async AI route and client protocol: owner checks, credits, independent cache, one generation, confirm/cancel, validation failure, late-submit cancellation, no silent paid reapplication. All providers and wallets mocked; no paid AI.');
