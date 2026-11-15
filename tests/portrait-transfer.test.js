import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import multer from 'multer';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {preparePortraitUpload,provenOriginalInput} from '../portrait-upload.js';
import {isOriginalPortraitAiRequest,validateOriginalPortraitUpload,ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {submitPortraitTransfer,portraitTransferError} from '../src/portrait-transfer.js';
import {resultSourceDigest} from '../src/ai-result-cache.js';
import {describePortraitFailure} from '../src/portrait-process-failure.js';
import {recoverPortraitWork} from '../portrait-work-recovery.js';
import {validateProductionPortrait} from '../production-portrait-pipeline.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const png=await readFile(new URL('../public/assets/job-uniforms/female-formal-suit-example.png',import.meta.url));
const work='dwork_'+'a'.repeat(36),wallet='wallet-owner',fields={portraitMode:'female',studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,femaleEyeStyle:'natural',hairId:'seedream-54'};
const form=(legacy=false)=>{const fd=new FormData();fd.append('image',new Blob([png],{type:'image/png'}),'original.png');for(const[k,v]of Object.entries(fields))fd.append(k,v);if(legacy)fd.append('originalSource',new Blob([png],{type:'image/png'}),'original.png');else fd.append('originalSourceIsImage','1');return fd};

test('real multipart parser accepts old two-file clients and new one-file clients with identical original pixels',async()=>{
 const app=express();let jobs=0;
 app.use(express.json({limit:'64kb'}));
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:2,fields:20,parts:24}});
 app.post('/api/ai-jobs',upload.fields([{name:'image',maxCount:1},{name:'originalSource',maxCount:1}]),async(req,res)=>{
  const bytes=Number(req.get('content-length')),files=Object.keys(req.files||{}).length;
  try{
   await preparePortraitUpload(req,{policy:{originalInputForWork:async(w,id,digest)=>{assert.equal(w,wallet);assert.equal(id,work);return provenOriginalInput({canonical_image:png,canonical_type:'image/png',original_source_hash:hash(png)},digest)}},wallet,recoverWork:async()=>work,isOriginalRequest:isOriginalPortraitAiRequest});
   validateOriginalPortraitUpload(req.body,req.files.image[0],req.files.originalSource[0]);
   assert.deepEqual(req.files.image[0].buffer,png);assert.deepEqual(req.files.originalSource[0].buffer,png);
   res.status(202).json({jobId:'same-test-job',bytes,files,number:++jobs});
  }catch(error){res.status(error.status||500).json({error:error.code||error.message})}
 });
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const request=(url,options)=>fetch('http://127.0.0.1:'+server.address().port+url,options);
 try{
  const old=await(await request('/api/ai-jobs',{method:'POST',body:form(true)})).json();
  const single=await(await submitPortraitTransfer(request,form(),{})).json();
  const fd=form();fd.append('downloadWorkId',work);
  const reused=await(await submitPortraitTransfer(request,fd,{source:new Blob([png]),originalAi:true,hashSource:resultSourceDigest})).json();
  assert.equal(old.files,2);assert.equal(single.files,1);assert.equal(reused.files,0);
  assert(single.bytes<old.bytes*.51);assert(reused.bytes<1000);assert.equal(jobs,3);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
test('stored source proof rejects a changed encoder, wrong original hash, empty row or invalid hash',()=>{
 const row={canonical_image:png,canonical_type:'image/png',original_source_hash:hash(png)};
 assert.deepEqual(provenOriginalInput(row,hash(png)).buffer,png);
 for(const [value,digest] of [[null,hash(png)],[{...row,canonical_image:Buffer.from('changed pixels')},hash(png)],[{...row,original_source_hash:hash(Buffer.from('other person'))},hash(png)],[row,'bad']])assert.equal(provenOriginalInput(value,digest),null);
});
test('actual production submission validates reused originals before reservation and queues exactly one job per accepted request',async()=>{
 const source=await readFile(new URL('../server.js',import.meta.url),'utf8'),start=source.indexOf("app.post('/api/ai-jobs',"),end=source.indexOf("app.post('/api/ai-jobs/:id/:action'",start);
 const app=express();app.use(express.json({limit:'64kb'}));
 const events=[],policy={
  originalInputForWork:async(w,id,digest)=>w===wallet&&id===work?provenOriginalInput({canonical_image:png,canonical_type:'image/png',original_source_hash:hash(png)},digest):null,
  beginWork:async(w,image,_id,_saved,original)=>{assert.equal(w,wallet);assert.deepEqual(image,png);assert.deepEqual(original,png);return work},
  attach:async()=>events.push('attach')
 };
 const env={app,crypto:{randomBytes:await import('node:crypto').then(m=>m.randomBytes)},preparePortraitUpload,downloadPolicy:policy,recoverPortraitWork,isOriginalPortraitAiRequest,validateOriginalPortraitUpload,validateProductionPortrait,
  upload:multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:2,fields:20,parts:24}}),walletId:req=>req.get('X-Wallet-Id'),getAiJobResult:async()=>null,loadCurrentHairReference:async()=>{},
  requireCredit:async()=>{events.push('reserve');return {usageId:'test-usage'}},refundCredit:async()=>events.push('refund'),
  createAiJob:async job=>{assert.deepEqual(job.image.buffer,png);assert.equal(job.fields.reuseOriginalSource,undefined);events.push('create');return 'job_'+'a'.repeat(36)},failAiJob:async()=>events.push('fail'),
  setImmediate:run=>run(),runAiJob:()=>events.push('run'),console:{info(){},warn(){},error(){}}
 };
 Function('env','with(env){'+source.slice(start,end)+'}')(env);
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port+'/api/ai-jobs';
 try{
  const fd=form();fd.set('hairId','original');
  let r=await fetch(url,{method:'POST',body:fd,headers:{'X-Wallet-Id':wallet}});assert.equal(r.status,202,await r.text());
  const body={...fields,hairId:'original',downloadWorkId:work,reuseOriginalSource:'1',originalSourceSha256:hash(png)};
  r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Wallet-Id':wallet},body:JSON.stringify(body)});assert.equal(r.status,202,await r.text());
  assert.deepEqual(events,['reserve','create','attach','run','reserve','create','attach','run']);
  for(const [w,b] of [['other-wallet',body],[wallet,{...body,originalSourceSha256:'f'.repeat(64)}]]){
   r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Wallet-Id':w},body:JSON.stringify(b)});assert.equal(r.status,428);assert.equal((await r.json()).error,'original_upload_required');
  }
  assert.equal(events.filter(x=>x==='reserve').length,2,'Rejected ownership or source proof cannot spend credit');
  assert(!events.includes('refund')&&!events.includes('fail'));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
test('source reuse cannot alias another uploaded file or a non-original request',async()=>{
 const fail=()=>{throw Error('ownership must be checked before credit/generation')};
 for(const request of [{body:{reuseOriginalSource:'1'},is:()=>false},{body:{reuseOriginalSource:'1'},is:()=>true,files:{image:[{}]}},{body:{originalSourceIsImage:'1'},files:{image:[{}],originalSource:[{}]}},{body:{originalSourceIsImage:'1'},files:{}}]){
  await assert.rejects(preparePortraitUpload(request,{policy:{originalInputForWork:fail},wallet,recoverWork:fail,isOriginalRequest:()=>false}),e=>e.status===400);
 }
 const req={body:{...fields,reuseOriginalSource:'1',originalSourceSha256:hash(png)},is:()=>true};
 await assert.rejects(preparePortraitUpload(req,{policy:{originalInputForWork:async()=>null},wallet,recoverWork:async()=>work,isOriginalRequest:isOriginalPortraitAiRequest}),e=>e.status===428&&e.code==='original_upload_required');
});
test('only the explicit no-job 428 response permits a fallback upload; ambiguous submit failures never retry',async()=>{
 const fd=form();fd.append('downloadWorkId',work);
 for(const scenario of ['legacy','502','timeout','network','invalid-428']){
  const calls=[];const request=async(_url,options)=>{calls.push(options);if(calls.length===2)return new Response('{"jobId":"one"}',{status:202});if(scenario==='legacy')return Response.json({error:'original_upload_required'},{status:428});if(scenario==='invalid-428')return Response.json({error:'other'},{status:428});if(scenario==='timeout')throw Object.assign(Error('timeout'),{code:'REQUEST_TIMEOUT'});if(scenario==='network')throw TypeError('Failed to fetch');return new Response('upstream',{status:502})};
  const run=()=>submitPortraitTransfer(request,fd,{source:new Blob([png]),originalAi:true,hashSource:resultSourceDigest});
  if(['timeout','network','invalid-428'].includes(scenario))await assert.rejects(run(),e=>e.stage==='submit_job');else await run();
  assert.equal(calls.length,scenario==='legacy'?2:1,scenario);
  assert.equal(calls[0].headers['Content-Type'],'application/json');if(calls[1])assert.equal(calls[1].body,fd);
 }
});
test('both languages distinguish interrupted uploads from AI generation and keep the job-check advice',()=>{
 for(const english of [false,true]){
  const error=portraitTransferError(Object.assign(Error('timeout'),{code:'REQUEST_TIMEOUT'}),'submit_job');
  const result=describePortraitFailure(error,english);assert.equal(result.code,'upload');assert.equal(result.stage,'submit_job');assert.match(result.message,english?/existing job/:/งานเดิม/);
 }
});
