import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deadlineFetch} from '../src/deadline-fetch.js';
import express from 'express';
import multer from 'multer';
import {once} from 'node:events';
import {createPortraitSubmissionId,submitPortraitTransfer} from '../src/portrait-transfer.js';
import {createPortraitOperation,submitPortraitJob,cancelPortraitJob} from '../src/portrait-operation.js';
import {portraitSubmissionJobId,validPortraitSubmissionId} from '../portrait-submission-key.js';
import {preparePortraitUpload,provenCanonicalInput} from '../portrait-upload.js';
import {recoverPortraitWork} from '../portrait-work-recovery.js';
import {validateProductionPortrait} from '../production-portrait-pipeline.js';
import {isOriginalPortraitAiRequest,validateOriginalPortraitUpload} from '../original-portrait-ai.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const png=await readFile(new URL('../public/assets/job-uniforms/female-formal-suit-example.png',import.meta.url));
const raw=Buffer.from('untouched original bytes'),wallet='owner',work='dwork_'+'a'.repeat(36),source=new Blob([raw]);
function form(){const fd=new FormData();fd.append('image',new Blob([png],{type:'image/png'}),'canonical.png');fd.append('originalSource',new Blob([raw],{type:'image/png'}),'raw.png');fd.append('portraitMode','male');fd.append('hairId','original');fd.append('downloadWorkId',work);fd.append('clientSubmissionId',createPortraitSubmissionId());return fd;}
const digest=async b=>hash(Buffer.from(await b.arrayBuffer()));
const valid=id=>({jobId:portraitSubmissionJobId(wallet,id),downloadWorkId:work,status:'queued',trialPreview:false});
const quick={timeoutMs:30,pause:()=>Promise.resolve()};
test('unpredictable submission IDs bind durable receipts to their original wallet',()=>{
 const ids=Array.from({length:100},createPortraitSubmissionId);assert.equal(new Set(ids).size,100);assert(ids.every(validPortraitSubmissionId));
 const id=ids[0];assert.notEqual(portraitSubmissionJobId(wallet,id),portraitSubmissionJobId('other-wallet',id));assert.equal(portraitSubmissionJobId(wallet,id),portraitSubmissionJobId(wallet,id));
 for(const value of ['',null,'../../job',id+'x'])assert.equal(portraitSubmissionJobId(wallet,value),null);
});
test('lost POST headers, broken response JSON and a gateway error recover the same job without another creation',async()=>{
 for(const fault of ['network','json','gateway']){
  const fd=form(),id=fd.get('clientSubmissionId'),calls=[];let recoveries=0;
  const request=async(url,options)=>{calls.push({url,options});if(options.method==='POST'){
   if(fault==='network')throw TypeError('Failed to fetch');
   if(fault==='json')return new Response('{',{status:202});
   return new Response('gateway error',{status:502});
  }
  if(calls.filter(c=>c.options.method!=='POST').length===1)return new Response('restarting',{status:503});
  return Response.json(valid(id));};
  const response=await submitPortraitTransfer(request,fd,{headers:{'X-Wallet-Id':wallet},onRecover:()=>recoveries++,recovery:quick});
  assert.deepEqual(await response.json(),valid(id));assert.equal(calls.filter(c=>c.options.method==='POST').length,1);assert.equal(recoveries,1);assert(calls.slice(1).every(c=>c.url==='/api/ai-submissions/'+id&&c.options.headers['X-Wallet-Id']===wallet));
 }
});
test('missing receipts exhaust only status reads and preserve the original failure; rejected requests do not probe or retry',async()=>{
 const fd=form(),calls=[];
 const request=async(url,options)=>{calls.push(options.method||'GET');if(options.method==='POST')throw TypeError('Failed to fetch');return new Response('missing',{status:404});};
 await assert.rejects(submitPortraitTransfer(request,fd,{recovery:quick}),e=>e.stage==='submit_job'&&e.message==='Failed to fetch');assert.equal(calls.filter(x=>x==='POST').length,1);
 for(const status of [400,401,402,403,429]){let n=0;const r=await submitPortraitTransfer(async()=>{n++;return Response.json({error:'rejected'},{status});},form());assert.equal(r.status,status);assert.equal(n,1);}
});
test('rapid double Create shares one pending submit; Cancel settles the recovered late job exactly once',async()=>{
 const op=createPortraitOperation({headers:{'X-Wallet-Id':wallet}}),fd=form();let release,posts=0,settles=0;
 const request=async(_url,options)=>{if(options.method==='POST'){posts++;await new Promise(r=>release=r);throw TypeError('Failed to fetch');}return Response.json(valid(fd.get('clientSubmissionId')));};
 const submit=async()=> (await submitPortraitTransfer(request,fd,{headers:op.headers,recovery:quick})).json();
 const first=submitPortraitJob(op,submit),second=submitPortraitJob(op,submit);assert.equal(first,second);await Promise.resolve();op.cancelled=true;
 const cancel=cancelPortraitJob(op,async()=>{settles++;assert.equal(op.jobId,valid(fd.get('clientSubmissionId')).jobId);});release();await first;await cancel;
 assert.equal(posts,1);assert.equal(settles,1);
});
test('canonical reuse proves both original and exact prepared bytes; it never reconstructs or substitutes a raw photo',async()=>{
 const row={canonical_image:png,canonical_type:'image/png',original_source_hash:hash(raw)};
 assert.deepEqual(provenCanonicalInput(row,hash(raw),hash(png)).buffer,png);
 for(const [r,a,b]of [[null,hash(raw),hash(png)],[row,'f'.repeat(64),hash(png)],[row,hash(raw),'f'.repeat(64)],[{...row,canonical_image:raw},hash(raw),hash(png)]])assert.equal(provenCanonicalInput(r,a,b),null);
 const req={body:{reuseCanonicalInput:'1',originalSourceSha256:hash(raw),canonicalInputSha256:hash(png),downloadWorkId:work,portraitMode:'male'},is:()=>true};
 await preparePortraitUpload(req,{wallet,policy:{canonicalInputForWork:async(w,k,a,b)=>{assert.equal(w,wallet);assert.equal(k,work);return provenCanonicalInput(row,a,b);}},recoverWork:async()=>work,isOriginalRequest:isOriginalPortraitAiRequest});
 assert.equal(req.reusedPortraitWork,work);assert.equal(req.files.originalSource,undefined);assert.deepEqual(req.files.image[0].buffer,png);assert.equal(req.body.reuseCanonicalInput,undefined);
});
test('consecutive male generation sends JSON source proofs; explicit missing-source responses allow one upload fallback',async()=>{
 for(const missing of [false,true]){
  const fd=form(),calls=[];
  const request=async(_url,options)=>{calls.push(options);return missing&&calls.length===1?Response.json({error:'original_upload_required'},{status:428}):Response.json(valid(fd.get('clientSubmissionId')),{status:202});};
  await submitPortraitTransfer(request,fd,{source,hashSource:digest,originalAi:false});
  const body=JSON.parse(calls[0].body);assert.equal(body.reuseCanonicalInput,'1');assert.equal(body.originalSourceSha256,hash(raw));assert.equal(body.canonicalInputSha256,hash(png));assert(calls[0].body.length<1000);
  assert.equal(calls.length,missing?2:1);if(missing)assert.equal(calls[1].body,fd);
 }
});
test('actual submission route uses verified stored male input and replays a known receipt before reserving credit',async()=>{
 const serverSource=await readFile(new URL('../server.js',import.meta.url),'utf8'),a=serverSource.indexOf("app.post('/api/ai-jobs',"),b=serverSource.indexOf("app.post('/api/ai-jobs/:id/:action'",a);
 const app=express();app.use(express.json());const receipts=new Map(),events=[];
 const receipt=(w,id)=>receipts.get(portraitSubmissionJobId(w,id))||null;
 const policy={canonicalInputForWork:async(w,id,rawHash,inputHash)=>w===wallet&&id===work?provenCanonicalInput({canonical_image:png,canonical_type:'image/png',original_source_hash:hash(raw)},rawHash,inputHash):null,beginWork:()=>{throw Error('Verified stored inputs must not re-upload or create work')},inputForWork:async()=>({buffer:png,mimetype:'image/png'}),attach:async()=>events.push('attach')};
 const env={app,crypto:await import('node:crypto'),upload:multer({storage:multer.memoryStorage()}),downloadPolicy:policy,recoverPortraitWork,preparePortraitUpload,isOriginalPortraitAiRequest,validateOriginalPortraitUpload,validateProductionPortrait,validPortraitSubmissionId,getAiSubmissionReceipt:async(w,id)=>receipt(w,id),walletId:req=>req.get('X-Wallet-Id'),loadCurrentHairReference:async()=>{},getAiJobResult:async()=>null,
  requireCredit:async()=>{events.push('reserve');return{usageId:'credit',trialPreview:false};},refundCredit:async()=>events.push('refund'),failAiJob:async()=>events.push('fail'),
  createAiJob:async job=>{assert.deepEqual(job.image.buffer,png);assert.equal(job.fields.downloadWorkId,work);assert.equal(job.fields.reuseCanonicalInput,undefined);const value=valid(job.fields.clientSubmissionId);receipts.set(value.jobId,value);events.push('create');return value.jobId;},setImmediate:run=>run(),runAiJob:()=>events.push('run'),console:{info(){},warn(){},error(){}}};
 Function('env','with(env){'+serverSource.slice(a,b)+'}')(env);
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 const request=(url,options)=>fetch(base+url,options),headers={'X-Wallet-Id':wallet};
 try{
  const fd=form();const response=await submitPortraitTransfer(request,fd,{headers,source,hashSource:digest,originalAi:false});assert.deepEqual(await response.json(),{...valid(fd.get('clientSubmissionId')),generationRemaining:0,hairRemaining:0});
  const replay=await submitPortraitTransfer(request,fd,{headers,source,hashSource:digest,originalAi:false});assert.equal(replay.status,202);assert.deepEqual(events,['reserve','create','attach','run']);
  let r=await fetch(base+'/api/ai-submissions/'+fd.get('clientSubmissionId'),{headers});assert.equal(r.status,200);assert.deepEqual(await r.json(),valid(fd.get('clientSubmissionId')));assert.match(r.headers.get('cache-control'),/no-store/);
  r=await fetch(base+'/api/ai-submissions/'+fd.get('clientSubmissionId'),{headers:{'X-Wallet-Id':'other-wallet'}});assert.equal(r.status,404);
  const bad=form();bad.set('clientSubmissionId','bad');r=await request('/api/ai-jobs',{method:'POST',body:bad,headers});assert.equal(r.status,400);assert.deepEqual(events,['reserve','create','attach','run']);
  const rejected={clientSubmissionId:createPortraitSubmissionId(),portraitMode:'male',hairId:'original',downloadWorkId:work,reuseCanonicalInput:'1',originalSourceSha256:hash(raw),canonicalInputSha256:hash(png)};r=await request('/api/ai-jobs',{method:'POST',headers:{'X-Wallet-Id':'other-wallet','Content-Type':'application/json'},body:JSON.stringify(rejected)});assert.equal(r.status,428);assert.equal(events.filter(x=>x==='reserve').length,1);
  const racing=form();env.createAiJob=async job=>{const value=valid(job.fields.clientSubmissionId);receipts.set(value.jobId,value);events.push('duplicate');throw Object.assign(Error('existing'),{code:'ai_submission_exists'});};
  const raced=await submitPortraitTransfer(request,racing,{headers,source,hashSource:digest,originalAi:false});assert.deepEqual(await raced.json(),valid(racing.get('clientSubmissionId')));assert.deepEqual(events.slice(-3),['reserve','duplicate','refund']);assert.equal(events.filter(x=>x==='run').length,1);assert(!events.includes('fail'));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('actual job store serializes duplicate submission keys and scopes receipt lookup by wallet',async()=>{
 const source=await readFile(new URL('../job-store.js',import.meta.url),'utf8');
 const start=source.indexOf('export async function createAiJob('),end=source.indexOf('export async function createSourceDownloadJob(',start);
 const jobs=new Map(),tails=new Map();let inserts=0;
 const makeClient=()=>{let unlock;
  const release=()=>{unlock?.();unlock=null;};
  return {release,async query(sql,values=[]){
   if(sql==='BEGIN')return{};
   if(sql==='COMMIT'||sql==='ROLLBACK'){release();return{};}
   if(sql.includes('FROM wallets')&&sql.includes('FOR UPDATE')){const key=values[0],previous=tails.get(key)||Promise.resolve();let resolve;const next=new Promise(r=>resolve=r);tails.set(key,next);await previous;unlock=resolve;return{rowCount:1,rows:[{id:key}]};}
   if(sql.startsWith('SELECT id FROM ai_jobs WHERE id=')){const j=jobs.get(values[0]);return{rowCount:j?.wallet===values[1]?1:0,rows:j?[{id:values[0]}]:[]};}
   if(sql.includes("status IN ('queued','processing')")){const j=[...jobs].find(([,j])=>j.wallet===values[0]);return{rowCount:j?1:0,rows:j?[{id:j[0]}]:[]};}
   if(sql.startsWith('INSERT INTO ai_jobs')){inserts++;jobs.set(values[0],{wallet:values[1],fields:values[3]});return{rowCount:1};}
   throw Error('Unexpected SQL '+sql);
  }};
 };
 const env={portraitSubmissionJobId,crypto:await import('node:crypto'),ready:async()=>{},pool:{connect:async()=>makeClient(),query:async(sql,values)=>{if(sql.includes('WHERE id=$1 AND wallet_id=$2')){const j=jobs.get(values[0]);return{rows:j?.wallet===values[1]?[{jobId:values[0],downloadWorkId:j.fields.downloadWorkId,status:'queued',trialPreview:false}]:[]};}assert(sql.includes("wallet_id=$1 AND fields->>'clientSubmissionId'=$2"));assert(sql.includes("interval '5 minutes'"));const j=[...jobs].find(([,j])=>j.wallet===values[0]&&j.fields.clientSubmissionId===values[1]);return{rows:j?[{jobId:j[0],downloadWorkId:j[1].fields.downloadWorkId,status:'queued',trialPreview:false}]:[]};}}};
 const functions=Function('env','with(env){'+source.slice(start,end).replaceAll('export async function','async function')+';return {createAiJob,getAiSubmissionReceipt}}')(env);
 const id=createPortraitSubmissionId(),args={walletId:wallet,usageId:'credit',fields:{clientSubmissionId:id,downloadWorkId:work},image:{buffer:png,mimetype:'image/png'}};
 const [first,second]=await Promise.allSettled([functions.createAiJob(args),functions.createAiJob(args)]);
 assert.equal(first.status,'fulfilled');assert.equal(second.status,'rejected');assert.equal(second.reason.code,'ai_submission_exists');assert.equal(inserts,1);
 assert.deepEqual(await functions.getAiSubmissionReceipt(wallet,id),valid(id));assert.equal(await functions.getAiSubmissionReceipt('other-wallet',id),null);
 await assert.rejects(functions.createAiJob({...args,fields:{clientSubmissionId:createPortraitSubmissionId()}}),e=>e.code==='active_ai_job');assert.equal(inserts,1);
 const legacy=createPortraitSubmissionId(),legacyJob='job_'+'f'.repeat(36);jobs.set(legacyJob,{wallet,fields:{clientSubmissionId:legacy,downloadWorkId:work}});
 assert.equal(await functions.getAiSubmissionReceipt(wallet,legacy),null);assert.equal((await functions.getAiSubmissionReceipt(wallet,legacy,true)).jobId,legacyJob);assert.equal(await functions.getAiSubmissionReceipt('other-wallet',legacy,true),null);
});


test('a stalled accepted response body reaches its deadline then reconnects to the same job',async()=>{
 const previous=globalThis.fetch,fd=form(),id=fd.get('clientSubmissionId');let posts=0,reads=0;
 globalThis.fetch=async(_url,options)=>{if(options.method==='POST'){posts++;return new Response(new ReadableStream({start(){}}),{status:202});}reads++;return new Response(JSON.stringify(valid(id)),{status:200});};
 try{const response=await submitPortraitTransfer((url,options)=>deadlineFetch(url,options,{timeoutMs:15}),fd,{recovery:quick});assert.deepEqual(await response.json(),valid(id));assert.equal(posts,1);assert.equal(reads,1);}
 finally{globalThis.fetch=previous;}
});
