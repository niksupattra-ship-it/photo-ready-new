import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise actual accessors/handler with injected read-only metadata and policy.
// scripts/check-download-policy.mjs verifies the policy SQL on PostgreSQL WASM.
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const jobSource=await read('../job-store.js'),serverSource=await read('../server.js');
const accessSource=jobSource.match(/^export async function getAiJobsAccess\([^\n]+$/m)?.[0];
assert(accessSource);
const start=serverSource.indexOf('async function savedWorkRights('),end=serverSource.indexOf('\nregisterSavedWorkApi',start);
assert(start>=0&&end>start);
const handlerSource=serverSource.slice(start,end);
const factory=(source,name,env)=>new Function('env','with(env){'+source.replace(/^export /,'')+';return '+name+'}')(env);
let passed=0;
const check=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
function environment({legacy=false,allowed=true,records=[]}={}){
 const calls={validate:0,ready:0,queries:[],legacy:[],batch:[]};
 const env={calls,
  validateProject(project){calls.validate++;if(project.invalid)throw Error('invalid_project');return [...new Set(project.ids)]},
  async ready(){calls.ready++},
  pool:{async query(sql,args){calls.queries.push({sql,args});const [wallet,ids]=args;return {rows:records.filter(row=>row.wallet_id===wallet&&ids.includes(row.id)).map(({id,status,usage_id})=>({id,status,usage_id}))}}},
  downloadPolicy:{async legacyAllows(wallet,id,ids){calls.legacy.push([wallet,id,ids]);return legacy},async allowedJobs(wallet,ids){calls.batch.push([wallet,ids]);return allowed}}
 };
 env.getAiJobsAccess=factory(accessSource,'getAiJobsAccess',env);env.savedWorkRights=factory(handlerSource,'savedWorkRights',env);return env;
}
await check('empty metadata batch avoids schema initialization and database reads',async()=>{
 const env=environment();assert.deepEqual(await env.getAiJobsAccess([],'A'),[]);assert.equal(env.calls.ready,0);assert.equal(env.calls.queries.length,0);
});
await check('metadata accessor performs one bound wallet-scoped query without reading image results',async()=>{
 const record={id:'one',wallet_id:'A',status:'completed',usage_id:'use_fixture'};Object.defineProperty(record,'result',{get(){throw Error('image data must not load')}});
 const env=environment({records:[record,{...record,id:'foreign',wallet_id:'B'}]});
 assert.deepEqual(await env.getAiJobsAccess(['one','foreign','missing'],'A'),[{id:'one',status:'completed',usage_id:'use_fixture'}]);
 assert.equal(env.calls.ready,1);assert.equal(env.calls.queries.length,1);assert.equal(env.calls.queries[0].sql,'SELECT id,status,usage_id FROM ai_jobs WHERE wallet_id=$1 AND id=ANY($2::text[])');
 assert.deepEqual(env.calls.queries[0].args,['A',['one','foreign','missing']]);
});
await check('wallet and job values remain SQL parameters',async()=>{
 const id="'; SELECT secret",wallet="A' OR true--",env=environment({records:[{id,wallet_id:wallet,status:'completed',usage_id:'use_fixture'}]});
 assert.equal((await env.getAiJobsAccess([id],wallet)).length,1);assert.deepEqual(env.calls.queries[0].args,[wallet,[id]]);assert(!env.calls.queries[0].sql.includes(wallet));assert(!env.calls.queries[0].sql.includes(id));
});
await check('saved-work rights validate first and send unique heads to the wallet-scoped batch policy',async()=>{
 const env=environment();assert.equal(await env.savedWorkRights('A',{ids:['one','two','one']},'work_A'),true);
 assert.deepEqual(env.calls.legacy,[['A','work_A',['one','two']]]);assert.deepEqual(env.calls.batch,[['A',['one','two']]]);
});
await check('twenty saved heads require one policy batch rather than a call per layer',async()=>{
 const ids=Array.from({length:20},(_,i)=>'head_'+i),env=environment();assert.equal(await env.savedWorkRights('A',{ids}),true);assert.equal(env.calls.batch.length,1);assert.deepEqual(env.calls.batch[0],['A',ids]);
});
await check('a legacy snapshot preserves saved pixels without requiring old job result rows',async()=>{
 const env=environment({legacy:true,allowed:false});assert.equal(await env.savedWorkRights('A',{ids:['retired-job']},'legacy-work'),true);assert.equal(env.calls.batch.length,0);assert.deepEqual(env.calls.legacy,[['A','legacy-work',['retired-job']]]);
});
await check('missing, foreign, incomplete or locked output decisions fail closed',async()=>{
 const env=environment({allowed:false});assert.equal(await env.savedWorkRights('A',{ids:['denied']},'work_A'),false);assert.deepEqual(env.calls.batch,[['A',['denied']]]);
});
await check('invalid projects fail before policy or database reads',async()=>{
 const env=environment();await assert.rejects(env.savedWorkRights('A',{ids:[],invalid:true}),/invalid_project/);assert.equal(env.calls.legacy.length,0);assert.equal(env.calls.batch.length,0);assert.equal(env.calls.ready,0);
});
await check('legacy and grouped entitlement failures reject instead of granting access',async()=>{
 for(const method of ['legacyAllows','allowedJobs']){const env=environment();env.downloadPolicy[method]=async()=>{throw Error('storage_unavailable')};await assert.rejects(env.savedWorkRights('A',{ids:['one']}),/storage_unavailable/)}
});
console.log(JSON.stringify({passed,scope:'actual metadata accessor and savedWorkRights delegation; read-only fixtures; grouped entitlement SQL covered separately; no production writes'}));
