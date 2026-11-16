import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import {registerPurchasedPhotoApi} from '../purchased-photo-api.js';

// The HTTP contract uses inert storage/policy callbacks. No database, real
// customer, payment, upload registration or AI provider is contacted.
const scope='dwork_'+'a'.repeat(36),otherScope='dwork_'+'b'.repeat(36);
const original=Buffer.from('immutable-original-customer-upload'),render=Buffer.from('owned-native-portrait'),makeup=Buffer.from('owned-paired-makeup');
const purchasedAt='2026-11-10T12:00:00.000Z',expiresAt='2026-11-17T12:00:00.000Z';
const base={id:'photo-owned',wallet_id:'wallet-a',work_scope:scope,job_ids:['job-paid'],package_id:'159',image:Buffer.from('flattened-archived-file'),purchased_at:purchasedAt,expires_at:expiresAt,expired:false};
const rows=new Map([
 ['photo-owned',base],
 ['photo-expired',{...base,id:'photo-expired',expired:true}],
 ['photo-purged',{...base,id:'photo-purged',image:null}],
 ['photo-revoked',{...base,id:'photo-revoked',job_ids:['job-revoked']}],
 ['photo-no-original',{...base,id:'photo-no-original',job_ids:['job-missing-original']}],
 ['photo-legacy',{...base,id:'photo-legacy',job_ids:['job-legacy']}],
 ['photo-mixed',{...base,id:'photo-mixed',job_ids:['job-paid','job-other-work']}],
 ['photo-peer',{...base,id:'photo-peer',job_ids:['job-no-result','job-peer']}],
 ['photo-single',{...base,id:'photo-single',job_ids:['job-single']}],
 ['photo-source-error',{...base,id:'photo-source-error',job_ids:['job-source-error']}]
]);
const sources=[],contexts=[],reads=[];
const scopes={'job-single':scope,'job-paid':scope,'job-peer':scope,'job-no-result':scope,'job-missing-original':otherScope,'job-other-work':otherScope,'job-legacy':'job:job-legacy','job-source-error':'dwork_'+'c'.repeat(36)};
const policy={
 async allowedJobs(wallet,ids){assert.equal(wallet,'wallet-a');return !ids.includes('job-revoked')},
 async scopeForJob(wallet,id){assert.equal(wallet,'wallet-a');assert(id in scopes);return scopes[id]},
 async inputForWork(wallet,work){sources.push({wallet,work});assert.equal(wallet,'wallet-a');
  if(work===otherScope)throw Object.assign(Error('canonical source unavailable'),{status:409});
  if(work==='dwork_'+'c'.repeat(36))throw Error('inert database failure');
  assert.equal(work,scope);return {buffer:original,mimetype:'image/jpeg'};
 },
 async redeem(){throw Error('Must not redeem another credit on reopen')},
 async registerSource(){throw Error('An archived PNG must never be registered as the original')}
};
const store={
 async owned(wallet,id){reads.push({wallet,id});const row=rows.get(id);return row?.wallet_id===wallet?row:null},
 async list(){return []},async purge(){return 0}
};
const app=express();
app.use((req,res,next)=>{const user=req.get('Authorization');if(user==='Bearer a')req.accountUser={id:'account-a',wallet_id:'wallet-a'};if(user==='Bearer b')req.accountUser={id:'account-b',wallet_id:'wallet-b'};next()});
registerPurchasedPhotoApi(app,{store,policy,getJobContext:async(id,wallet)=>{
 contexts.push({id,wallet});assert.equal(wallet,'wallet-a');
 if(id==='job-no-result')return null;
 if(id==='job-single')return {id,status:'completed',fields:{portraitMode:'female',femaleEyeStyle:'natural',femaleFinishSingleVersion:'female-single-finish-v1',alternateFinish:'makeup',alternateFinishStatus:'completed'},result:render,result_makeup:makeup};
 return {id,status:'completed',fields:{hairId:'seedream-77',portraitMode:'male',portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:'en-natural-head-neck-v9',femaleEyeStyle:'natural',neckOutfitReferencePath:'/assets/job-uniforms/selected.png',downloadWorkId:'forged-field-work',secret:'never-expose-fixture-secret'},result:render,result_makeup:makeup};
}});
const server=app.listen(0,'127.0.0.1');await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port;
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))});
const request=(id,{token='a',query='',headers={}}={})=>fetch(origin+'/api/purchased-photos/'+id+'/edit'+query,{headers:{...(token?{Authorization:'Bearer '+token}:{}),...headers}});

test('reopening a paid work returns its authoritative scope and original; it never rebinds the rendered PNG',async()=>{
 const r=await request('photo-owned',{query:'?workId=forged&jobId=foreign&packageId=89'});assert.equal(r.status,200);
 const data=await r.json();assert.equal(data.id,'photo-owned');assert.equal(data.workId,scope);assert.equal(data.downloadWorkId,scope);assert.equal(data.originalAvailable,true);
 assert.equal(data.originalSource,'data:image/jpeg;base64,'+original.toString('base64'));assert.equal(data.originalType,'image/jpeg');
 assert.notEqual(data.originalSource,'data:image/png;base64,'+base.image.toString('base64'));
 assert.equal(data.jobId,'job-paid');assert.deepEqual(data.jobIds,['job-paid']);assert.equal(data.packageId,'159');
 assert.equal(data.purchasedAt,purchasedAt);assert.equal(data.expiresAt,expiresAt,'Opening never extends the seven-day window');
 assert.equal(data.resultSource,'data:image/png;base64,'+render.toString('base64'));assert.equal(data.makeupSource,'data:image/png;base64,'+makeup.toString('base64'));
 assert.equal(data.job.hairId,'seedream-77');assert.equal(data.job.neckOutfitReferencePath,'/assets/job-uniforms/selected.png');
 assert(!JSON.stringify(data).includes('never-expose-fixture-secret'));assert(!JSON.stringify(data).includes('forged-field-work'));
 assert.match(r.headers.get('cache-control'),/private, no-store/);assert.equal(r.headers.get('referrer-policy'),'no-referrer');
});

test('member authentication and owned paid authorization precede all original/result reads',async()=>{
 const sourceCount=sources.length,contextCount=contexts.length;
 assert.equal((await request('photo-owned',{token:null,headers:{'X-Wallet-ID':'wallet-a'}})).status,401);
 assert.equal((await request('photo-owned',{token:'b',headers:{'X-Wallet-ID':'wallet-a'}})).status,404);
 assert.equal((await request('photo-missing')).status,404);
 assert.equal((await request('photo-revoked')).status,403);
 assert.equal(sources.length,sourceCount);assert.equal(contexts.length,contextCount);
});

test('expired or purged seven-day archives cannot be reopened even with valid ownership and payment',async()=>{
 const sourceCount=sources.length,contextCount=contexts.length;
 for(const id of ['photo-expired','photo-purged']){const r=await request(id);assert.equal(r.status,410);assert.equal((await r.json()).error,'photo_expired')}
 assert.equal(sources.length,sourceCount);assert.equal(contexts.length,contextCount);
});

test('historical archives without canonical inputs retain their job anchor without manufacturing source proof',async()=>{
 for(const id of ['photo-no-original','photo-legacy']){
  const r=await request(id);assert.equal(r.status,200);const data=await r.json();
  assert.equal(data.originalAvailable,false);assert(!('originalSource' in data));assert(data.resultSource);assert(data.jobId);
  if(id==='photo-legacy'){assert.equal(data.workId,'job:job-legacy');assert(!('downloadWorkId' in data))}
 }
});

test('mixed-work archives do not attach one portrait original to other independently paid jobs',async()=>{
 const sourceCount=sources.length,r=await request('photo-mixed');assert.equal(r.status,200);const data=await r.json();
 assert.equal(data.originalAvailable,false);assert(!('originalSource' in data));assert(!('downloadWorkId' in data));assert.equal(sources.length,sourceCount);
});

test('a later owned sibling may restore available pixels without changing its work entitlement scope',async()=>{
 const r=await request('photo-peer');assert.equal(r.status,200);const data=await r.json();
 assert.equal(data.jobId,'job-peer');assert.equal(data.downloadWorkId,scope);assert.deepEqual(data.jobIds,['job-no-result','job-peer']);assert(data.originalAvailable);
});

test('new single-finish work keeps its free alternate-finish protocol without turning the alternate image into a makeup overlay',async()=>{
 const r=await request('photo-single');assert.equal(r.status,200);const data=await r.json();
 assert.equal(data.job.femaleFinishSingleVersion,'female-single-finish-v1');assert.equal(data.job.femaleEyeStyle,'natural');assert.equal(data.job.alternateFinish,'makeup');assert.equal(data.makeupSource,undefined);
});

test('temporary canonical-storage failures are retryable errors rather than false permanent missing-source claims',async()=>{
 const r=await request('photo-source-error');assert.equal(r.status,503);const data=await r.json();assert.equal(data.error,'purchased_photo_unavailable');assert(!JSON.stringify(data).includes('inert database failure'));
});
