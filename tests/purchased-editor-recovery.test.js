import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import {registerPurchasedPhotoApi} from '../purchased-photo-api.js';
import {unpackSavedProjectTransfer} from '../src/saved-work-transfer.js';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0X8AAAAASUVORK5CYII=';
const pixels=Buffer.from(image.split(',')[1],'base64'),scope='dwork_'+'a'.repeat(36);
const project={format:'idprom-studio',version:1,width:900,height:1200,layers:[{kind:'head',name:'หัว · คอ · ผม',jobId:'job-owned',source:image,sourceFrame:{x:100,y:60,w:700,h:900},x:0,y:0,scale:1,rotation:0,opacity:1,visible:true,locked:false}],downloadSource:image,canonicalInput:image,downloadWorkId:scope,compareSource:image};
const base={id:'photo-owned',wallet_id:'owner',work_scope:scope,job_ids:['job-owned'],has_image:true,image:pixels,expired:false,editor_project:null};
let reads=0,writes=0;
const owned=async(wallet,id)=>wallet==='owner'&&id!=='missing'?{...base,id,...(id==='expired'?{expired:true}:{}),...(id==='stored'?{editor_project:project}:{})}:null;
const app=express();app.use((req,res,next)=>{if(req.get('Authorization'))req.accountUser={wallet_id:req.get('Authorization')};next()});
registerPurchasedPhotoApi(app,{
 store:{owned,ownedEditor:owned,storeEditor:async()=>{writes++;return {updated_at:'2026-11-16T00:00:00Z'}}},
 findEditableWorks:async()=>({}),loadSavedWork:async()=>assert.fail('No historical saved-work match'),
 policy:{allowedJobs:async(wallet,ids)=>wallet==='owner'&&ids.every(id=>id==='job-owned'),jobIds:async()=>['job-owned'],inputForWork:async()=>{reads++;if(mode==='outage')throw Error('private storage outage');if(mode==='missing')throw Object.assign(Error('missing canonical'),{status:409});return {buffer:pixels,mimetype:'image/png'}}}
});
let mode='ready';
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))});
const get=(id,token='owner')=>fetch(origin+'/api/purchased-photos/'+id+'/editor',{headers:token?{Authorization:token}:{}});
const post=async p=>{const body=new FormData();body.append('project',new Blob([JSON.stringify(p)],{type:'application/json'}),'project.json');return fetch(origin+'/api/purchased-photos/photo-owned/editor',{method:'POST',headers:{Authorization:'owner'},body})};
test('historical editor recovery pins canonical input without converting its delivery PNG into an original',async()=>{
 const r=await get('photo-owned');assert.equal(r.status,200);const work=await r.json(),p=unpackSavedProjectTransfer(work.project);
 assert.equal(work.reconstructed,true);assert.equal(p.downloadSource,image);assert.equal(p.canonicalInput,image);assert.equal(p.downloadWorkId,scope);
});
test('stored manual layers bypass recovery and retain original geometry',async()=>{
 const before=reads,r=await get('stored');assert.equal(r.status,200);assert.deepEqual(unpackSavedProjectTransfer((await r.json()).project),project);assert.equal(reads,before);
});
test('transient original storage errors are retryable; genuinely missing originals retain the existing 409 contract',async()=>{
 mode='outage';let r=await get('photo-owned');assert.equal(r.status,503);assert(!JSON.stringify(await r.json()).includes('private storage outage'));
 mode='missing';r=await get('photo-owned');assert.equal(r.status,409);assert.equal((await r.json()).error,'original_unavailable');mode='ready';
});
test('editor auth, ownership and expiry are checked before reading originals',async()=>{
 const before=reads;assert.equal((await get('photo-owned',null)).status,401);assert.equal((await get('photo-owned','foreign')).status,404);assert.equal((await get('expired')).status,410);assert.equal(reads,before);
});
test('saving an editor rejects a foreign job or work without touching the paid archive',async()=>{
 const before=writes;assert.equal((await post({...project,downloadWorkId:'dwork_'+'b'.repeat(36)})).status,403);
 assert.equal((await post({...project,layers:project.layers.map(l=>({...l,jobId:'foreign-job'}))})).status,403);assert.equal(writes,before);
 assert.equal((await post(project)).status,200);assert.equal(writes,before+1);
});
