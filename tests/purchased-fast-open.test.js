import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import {registerPurchasedPhotoApi} from '../purchased-photo-api.js';
import {unpackSavedProjectTransfer} from '../src/saved-work-transfer.js';

// HTTP/storage boundaries are inert fixtures. No production data or provider.
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0X8AAAAASUVORK5CYII=';
const pixels=Buffer.from(image.split(',')[1],'base64'),preview=Buffer.from('small-preview'),scope='dwork_'+'a'.repeat(36);
const project={format:'idprom-studio',version:1,width:900,height:1200,layers:[{kind:'head',name:'หัว · คอ · ผม',jobId:'job-owned',source:image,sourceFrame:{x:123,y:81,w:640,h:832},x:5,y:8,scale:1.1,rotation:2,opacity:.9,visible:true,locked:false}],downloadSource:image,canonicalInput:image,downloadWorkId:scope,compareSource:image};
const baseline={work_scope:scope,job_ids:['job-owned'],has_image:true,expired:false,editor_project:null,updated_at:'2026-11-16T01:00:00.000Z',purchased_at:'2026-11-15T01:00:00.000Z',expires_at:'2026-11-22T01:00:00.000Z',package_id:'159'};
const calls=[],stored=new Map();
const row=(wallet,id)=>wallet==='owner'&&id!=='missing'?{...baseline,id,...(id==='expired'?{expired:true}:{}),...(id==='purged'?{has_image:false}:{}),...(id==='revoked'?{job_ids:['revoked-job']}:{}),...(id==='stored'?{editor_project:project}:{}),...(stored.has(id)?{editor_project:stored.get(id)}:{})}:null;
const store={
 owned:async()=>assert.fail('Wide image+preview+project reads are forbidden on these paths'),
 ownedEditor:async(wallet,id)=>{calls.push(['editor',id]);return row(wallet,id)},
 ownedAccess:async(wallet,id)=>{calls.push(['access',id]);const found=row(wallet,id);if(found)delete found.editor_project;return found},
 ownedAsset:async(wallet,id,kind)=>{calls.push(['asset',id,kind]);const found=row(wallet,id);if(!found)return null;delete found.editor_project;return {...found,[kind]:kind==='image'?pixels:preview}},
 storeEditor:async(wallet,id,p)=>{calls.push(['write',id]);assert.equal(wallet,'owner');stored.set(id,p);return {updated_at:baseline.updated_at}}
};
const app=express();app.use((req,res,next)=>{if(req.get('Authorization'))req.accountUser={wallet_id:req.get('Authorization')};next()});
registerPurchasedPhotoApi(app,{
 store,
 policy:{allowedJobs:async(wallet,ids)=>{calls.push(['rights',wallet]);return wallet==='owner'&&!ids.includes('revoked-job')},jobIds:async()=>['job-owned'],scopeForJob:async(wallet,id)=>{calls.push(['scope',id]);return scope},inputForWork:async(wallet,work)=>{calls.push(['original',work]);assert.equal(wallet,'owner');assert.equal(work,scope);if(mode==='missing')throw Object.assign(Error('missing canonical'),{status:409});if(mode==='outage')throw Error('private database detail');return {buffer:pixels,mimetype:'image/png'}}},
 findEditableWorks:async(wallet,rows)=>rows[0].id==='imported'?{imported:'saved-owned'}:{},
 loadSavedWork:async(wallet,id)=>{assert.equal(wallet,'owner');assert.equal(id,'saved-owned');return {project}},
 getJobContext:async(id,wallet)=>{calls.push(['native',id]);assert.equal(wallet,'owner');return {id,status:'completed',fields:{portraitMode:'female',hairId:'seedream-49',femaleEyeStyle:'natural',femaleFinishSingleVersion:'female-single-finish-v1',secret:'never expose'},result:pixels,result_makeup:Buffer.from('alternate-not-overlay')}}
});
let mode='ready';
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))});
const get=(id,{kind='editor',token='owner',native='1'}={})=>fetch(origin+'/api/purchased-photos/'+id+'/'+kind,{headers:{...(token?{Authorization:token}:{}),...(native===null?{}:{'X-IDPROM-Native-Recovery':native})}});
const since=(start,kind)=>calls.slice(start).filter(c=>c[0]===kind);
test('negotiated historical restore returns native context in one response and reads canonical input only once',async()=>{
 const start=calls.length,r=await get('owned');assert.equal(r.status,200);const work=await r.json();
 assert.equal(work.reconstructed,true);assert.equal(work.project,undefined);assert.equal(work.updatedAt,baseline.updated_at);
 assert.equal(work.nativeContext.originalSource,image);assert.equal(work.nativeContext.resultSource,image);assert.equal(work.nativeContext.downloadWorkId,scope);
 assert.equal(work.nativeContext.job.femaleFinishSingleVersion,'female-single-finish-v1');assert.equal(work.nativeContext.makeupSource,undefined);assert(!JSON.stringify(work).includes('never expose'));
 assert.equal(since(start,'original').length,1);assert.equal(since(start,'native').length,1);assert.equal(since(start,'asset').length,0);assert.equal(since(start,'access').length,0);
 const direct=await get('owned',{kind:'edit'});assert.equal(direct.status,200);assert.deepEqual((await direct.json()),work.nativeContext);
});
test('stored and compatibility-imported manual snapshots keep exact layers and avoid all native/result reads',async()=>{
 for(const id of ['stored','imported']){
  const start=calls.length,r=await get(id);assert.equal(r.status,200);const work=await r.json();
  assert.equal(work.reconstructed,false);assert.equal(work.nativeContext,undefined);assert.deepEqual(unpackSavedProjectTransfer(work.project),project);
  assert.equal(since(start,'original').length,0);assert.equal(since(start,'native').length,0);assert.equal(since(start,'asset').length,0);
 }
 assert.deepEqual(stored.get('imported'),project);
});
test('older clients retain the existing flattened project contract without reading an unrelated project or preview blob',async()=>{
 const start=calls.length,r=await get('owned',{native:null});assert.equal(r.status,200);const work=await r.json(),p=unpackSavedProjectTransfer(work.project);
 assert.equal(work.reconstructed,true);assert.equal(work.nativeContext,undefined);assert.equal(p.canonicalInput,image);assert.equal(p.downloadWorkId,scope);assert.equal(p.layers[0].jobId,'job-owned');
 assert.equal(since(start,'native').length,0);assert.equal(since(start,'original').length,1);assert.deepEqual(since(start,'asset'),[['asset','owned','image']]);
});
test('authentication, ownership, expiry, purging and paid revocation gate every accelerated original/result read',async()=>{
 for(const [id,options,status] of [['owned',{token:null},401],['owned',{token:'foreign'},404],['expired',{},410],['purged',{},410],['revoked',{},403]]){
  const start=calls.length,r=await get(id,options);assert.equal(r.status,status);
  assert.equal(since(start,'original').length,0);assert.equal(since(start,'native').length,0);assert.equal(since(start,'asset').length,0);
 }
});
test('native negotiation preserves permanent-missing versus retryable-storage errors',async()=>{
 mode='missing';let r=await get('owned');assert.equal(r.status,409);assert.equal((await r.json()).error,'original_unavailable');
 mode='outage';r=await get('owned');assert.equal(r.status,503);assert(!JSON.stringify(await r.json()).includes('private database detail'));mode='ready';
});
test('preview, download and native context use their narrow projections with fresh paid checks',async()=>{
 const start=calls.length;
 let r=await get('owned',{kind:'preview'});assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),preview);
 r=await get('owned',{kind:'image'});assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),pixels);
 r=await get('owned',{kind:'edit'});assert.equal(r.status,200);assert.equal((await r.json()).jobId,'job-owned');
 assert.deepEqual(since(start,'asset'),[['asset','owned','preview'],['asset','owned','image']]);assert.equal(since(start,'access').length,1);assert.equal(since(start,'rights').length,3);
 assert.equal((await get('revoked',{kind:'preview'})).status,403);assert.equal((await get('expired',{kind:'preview'})).status,410);
});
test('saving edits reads access metadata rather than the previous editable project',async()=>{
 const start=calls.length,form=new FormData();form.append('project',new Blob([JSON.stringify(project)],{type:'application/json'}),'project.json');
 const r=await fetch(origin+'/api/purchased-photos/owned/editor',{method:'POST',headers:{Authorization:'owner'},body:form});assert.equal(r.status,200);
 assert.equal(since(start,'access').length,1);assert.equal(since(start,'editor').length,0);assert.equal(since(start,'asset').length,0);assert.equal(since(start,'write').length,1);
});
