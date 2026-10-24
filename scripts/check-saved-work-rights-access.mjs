import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the actual accessor and handler with read-only database fixtures.
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const jobSource=await read('../job-store.js'),serverSource=await read('../server.js');
const accessSource=jobSource.match(/^export async function getAiJobsAccess\([^\n]+$/m)?.[0];
assert(accessSource,'metadata accessor must exist');
const start=serverSource.indexOf('async function savedWorkRights('),end=serverSource.indexOf('\nregisterSavedWorkApi',start);
assert(start>=0&&end>start,'actual saved-work rights handler must exist');
const handlerSource=serverSource.slice(start,end);
const factory=(source,name,env)=>new Function('env','with(env){'+source.replace(/^export /,'')+';return '+name+'}')(env);

// Exact predicate used before this optimization (baseline bb6fc27).
const legacySource=`async function savedWorkRights(wid,project){
 const ids=validateProject(project),ent=await imageEntitlements(wid);
 for(const id of ids){const j=await getAiJobResult(id,wid);if(!j||j.status!=='completed'||!(String(j.usage_id||'').startsWith('use_')||ent.unlockedJobIds.includes(id)))return false}return true;
}`;
let passed=0;
const check=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
const fixture=(id,wallet_id='A',status='completed',usage_id='use_fixture')=>({id,wallet_id,status,usage_id});
function environment(records,unlocked=[]){
 const calls={validate:0,ready:0,queries:[],legacy:[],entitlements:[]};
 const env={
  calls,
  validateProject(project){calls.validate++;if(project.invalid)throw Error('invalid_project');return [...new Set(project.ids)]},
  async imageEntitlements(wallet){calls.entitlements.push(wallet);return {unlockedJobIds:unlocked}},
  async getAiJobResult(id,wallet){calls.legacy.push([id,wallet]);return records.find(row=>row.id===id&&row.wallet_id===wallet)||null},
  async ready(){calls.ready++},
  pool:{async query(sql,args){
   assert.equal(sql,'SELECT id,status,usage_id FROM ai_jobs WHERE wallet_id=$1 AND id=ANY($2::text[])');
   calls.queries.push({sql,args});
   const [wallet,ids]=args;
   return {rows:records.filter(row=>row.wallet_id===wallet&&ids.includes(row.id)).map(row=>({id:row.id,status:row.status,usage_id:row.usage_id}))};
  }}
 };
 env.getAiJobsAccess=factory(accessSource,'getAiJobsAccess',env);
 return env;
}

await check('empty ID batch returns immediately without database initialization or query',async()=>{
 const env=environment([]);assert.deepEqual(await env.getAiJobsAccess([],'A'),[]);assert.equal(env.calls.ready,0);assert.equal(env.calls.queries.length,0);
});
await check('actual accessor uses one prepared wallet-scoped SELECT and returns metadata only',async()=>{
 const own=fixture('one'),foreign=fixture('foreign','B');
 Object.defineProperty(own,'result',{get(){throw Error('full image must not be loaded')}});
 const env=environment([own,foreign]);
 assert.deepEqual(await env.getAiJobsAccess(['one','foreign','missing'],'A'),[{id:'one',status:'completed',usage_id:'use_fixture'}]);
 assert.equal(env.calls.ready,1);assert.equal(env.calls.queries.length,1);assert.deepEqual(env.calls.queries[0].args,['A',['one','foreign','missing']]);
 assert(!/\b(?:result|image|error)\b/.test(env.calls.queries[0].sql));
});
await check('IDs and wallet values remain bound parameters rather than SQL interpolation',async()=>{
 const id="'; SELECT secret",wallet="A' OR true--",env=environment([fixture(id,wallet)]);
 assert.equal((await env.getAiJobsAccess([id],wallet)).length,1);assert.deepEqual(env.calls.queries[0].args,[wallet,[id]]);
 assert(!env.calls.queries[0].sql.includes(wallet));assert(!env.calls.queries[0].sql.includes(id));
});

const matrix=[
 ['completed paid output', [fixture('a')], ['a'], [], 'A', true],
 ['completed paid output with null result', [{...fixture('a'),result:null}], ['a'], [], 'A', true],
 ['locked trial output', [fixture('a','A','completed','trial_fixture')], ['a'], [], 'A', false],
 ['unlocked trial output', [fixture('a','A','completed','trial_fixture')], ['a'], ['a'], 'A', true],
 ['missing output stays denied even if listed as unlocked', [], ['a'], ['a'], 'A', false],
 ['output owned by another wallet', [fixture('a','B')], ['a'], ['a'], 'A', false],
 ['failed unlocked output', [fixture('a','A','failed')], ['a'], ['a'], 'A', false],
 ['processing paid output', [fixture('a','A','processing')], ['a'], [], 'A', false],
 ['queued unlocked output', [fixture('a','A','queued')], ['a'], ['a'], 'A', false],
 ['null usage stays locked without entitlement', [fixture('a','A','completed',null)], ['a'], [], 'A', false],
 ['null usage stays allowed with entitlement', [fixture('a','A','completed',null)], ['a'], ['a'], 'A', true],
 ['private usage does not bypass saved-work entitlement', [fixture('a','A','completed','private_fixture')], ['a'], [], 'A', false],
 ['private usage with existing unlock', [fixture('a','A','completed','private_fixture')], ['a'], ['a'], 'A', true],
 ['paid prefix behavior remains unchanged', [fixture('a','A','completed','use_')], ['a'], [], 'A', true],
 ['status comparison remains case-sensitive', [fixture('a','A','Completed')], ['a'], ['a'], 'A', false],
 ['wrong unlocked ID does not authorize a trial', [fixture('a','A','completed','trial_fixture')], ['a'], ['other'], 'A', false],
 ['all mixed paid and unlocked trial heads', [fixture('a'),fixture('b','A','completed','trial_b')], ['a','b'], ['b'], 'A', true],
 ['one missing head denies the whole project', [fixture('a')], ['a','b'], ['b'], 'A', false],
 ['one locked head denies the whole project', [fixture('a'),fixture('b','A','completed','trial_b')], ['a','b'], [], 'A', false],
 ['mixed ownership denies the whole project', [fixture('a'),fixture('b','B')], ['a','b'], ['b'], 'A', false],
 ['duplicate job IDs preserve unique validation behavior', [fixture('a')], ['a','a'], [], 'A', true],
 ['numeric usage still relies on existing unlock', [fixture('a','A','completed',123)], ['a'], ['a'], 'A', true]
];
for(const [name,records,ids,unlocked,wallet,expected] of matrix){
 await check('old/new authorization match: '+name,async()=>{
  const oldEnv=environment(records,unlocked),newEnv=environment(records,unlocked);
  const before=await factory(legacySource,'savedWorkRights',oldEnv)(wallet,{ids});
  const after=await factory(handlerSource,'savedWorkRights',newEnv)(wallet,{ids});
  assert.equal(before,expected);assert.equal(after,before);
  assert.equal(newEnv.calls.queries.length,1);assert.equal(newEnv.calls.legacy.length,0);assert.deepEqual(newEnv.calls.entitlements,[wallet]);
  assert.deepEqual(newEnv.calls.queries[0].args,[wallet,[...new Set(ids)]]);
 });
}
await check('twenty valid heads require one metadata query rather than twenty result reads',async()=>{
 const rows=Array.from({length:20},(_,i)=>fixture('head_'+i)),ids=rows.map(row=>row.id);
 const before=environment(rows),after=environment(rows);
 assert(await factory(legacySource,'savedWorkRights',before)('A',{ids}));assert(await factory(handlerSource,'savedWorkRights',after)('A',{ids}));
 assert.equal(before.calls.legacy.length,20);assert.equal(after.calls.queries.length,1);
});
await check('invalid project fails before reading jobs or entitlements',async()=>{
 const env=environment([]);await assert.rejects(factory(handlerSource,'savedWorkRights',env)('A',{ids:[],invalid:true}),/invalid_project/);
 assert.equal(env.calls.ready,0);assert.equal(env.calls.queries.length,0);assert.equal(env.calls.entitlements.length,0);
});
await check('metadata and entitlement reads begin independently without serialized round trips',async()=>{
 let jobsResolve,entResolve;const started=[];
 const env={validateProject:()=>['a'],getAiJobsAccess:()=>{started.push('jobs');return new Promise(resolve=>{jobsResolve=resolve})},imageEntitlements:()=>{started.push('entitlements');return new Promise(resolve=>{entResolve=resolve})}};
 const pending=factory(handlerSource,'savedWorkRights',env)('A',{});assert.deepEqual(started,['jobs','entitlements']);
 jobsResolve([{id:'a',status:'completed',usage_id:'use_fixture'}]);entResolve({unlockedJobIds:[]});assert.equal(await pending,true);
});
await check('database and entitlement failures remain rejected rather than granting access',async()=>{
 for(const failing of ['getAiJobsAccess','imageEntitlements']){
  const env=environment([fixture('a')]);env[failing]=async()=>{throw Error('storage_unavailable')};
  await assert.rejects(factory(handlerSource,'savedWorkRights',env)('A',{ids:['a']}),/storage_unavailable/);
 }
});
console.log(JSON.stringify({passed,scope:'actual metadata query and savedWorkRights source; legacy predicate comparison; no database/account/payment writes'}));
