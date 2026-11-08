// Execute the production submit callback and job-store SQL in inert fixtures.
// No provider, account, payment, production database or external HTTP is used.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import {validateProductionPortrait} from '../production-portrait-pipeline.js';
import {recoverPortraitWork} from '../portrait-work-recovery.js';
import {STUDIO_SKIN_WORKFLOW_VERSION} from '../studio-skin-treatment.js';
import {ORIGINAL_PORTRAIT_AI_VERSION,isOriginalPortraitAiRequest,validateOriginalPortraitUpload} from '../original-portrait-ai.js';

const serverSource=await readFile(new URL('../server.js',import.meta.url),'utf8');
const jobSource=await readFile(new URL('../job-store.js',import.meta.url),'utf8');
const routeStart=serverSource.indexOf("app.post('/api/ai-jobs',");
const routeEnd=serverSource.indexOf("app.post('/api/ai-jobs/:id/:action'",routeStart);
assert(routeStart>=0&&routeEnd>routeStart,'Production submit route must be available');
const routeSource=serverSource.slice(routeStart,routeEnd);
const version=STUDIO_SKIN_WORKFLOW_VERSION,owner='fixture-owner',work='dwork_'+'a'.repeat(36);
const portrait=await sharp({create:{width:128,height:160,channels:4,background:'#c6967e'}}).png().toBuffer();
const rawOriginal=Buffer.from('immutable original upload bytes');
const face=Array.from({length:468},()=>[.5,.5]);
face[10]=[.5,.15];face[152]=[.5,.8];face[234]=[.2,.5];face[454]=[.8,.5];
const evidence=JSON.stringify({version,width:128,height:160,face,maskWidth:2,maskHeight:2,labels:[3,3,2,2]});
let passed=0;
const results=[];
async function check(name,run){await run();passed++;results.push(name);console.log('PASS '+name)}

function submitFixture({staged=true,pinned=portrait,pinnedType='image/png',mode='female',body={},credit=true,scopeError=null,beginError=null,attachError=null}={}){
 const events=[],queued=[],scheduled=[],refunds=[],failed=[],begins=[],attachments=[];
 const request={body:{hairId:'original',portraitMode:mode,femaleEyeStyle:'natural',sourceJobId:'job-previous',faceIdentityBox:JSON.stringify([.1,.1,.9,.9]),...(staged?{studioSkinVersion:version,studioSkinEvidence:evidence}:{}),...body},files:{image:[{buffer:portrait,mimetype:'image/png',originalname:'upright.png'}],originalSource:[{buffer:rawOriginal,mimetype:'image/jpeg',originalname:'original.jpg'}]},get:name=>name.toLowerCase()==='x-idprom-saved-work'?'saved-work-proof':''};
 const response={statusCode:200,headersSent:false,headers:{},status(n){this.statusCode=n;return this},set(values){Object.assign(this.headers,values);return this},json(value){this.body=value;this.headersSent=true;events.push('response');return this},send(value){this.body=value;this.headersSent=true;events.push('send');return this}};
 const policy={async scopeForJob(wallet,id){events.push('recover');assert.equal(wallet,owner);assert.equal(id,'job-previous');if(scopeError)throw scopeError;return work},async beginWork(...args){events.push('begin');begins.push(args);if(beginError)throw beginError;return work},async inputForWork(wallet,id){events.push('pinned');assert.equal(wallet,owner);assert.equal(id,work);return {buffer:pinned,mimetype:pinnedType}},async attach(...args){events.push('attach');attachments.push(args);if(attachError)throw attachError}};
 let handler;
 const env={app:{post:(...args)=>{handler=args.at(-1)}},upload:{fields:()=>null},validateProductionPortrait,isOriginalPortraitAiRequest,validateOriginalPortraitUpload,recoverPortraitWork,downloadPolicy:policy,walletId:()=>owner,
  requireCredit:async(req,res,kind)=>{events.push('reserve');assert.equal(req,request);assert.equal(kind,request.body.creditKind==='hairstyle'?'hairstyle':'ai-finish');if(!credit){res.status(402).json({error:'fixture-no-credit'});return null}return {usageId:'fixture-reservation',generationRemaining:2,hairRemaining:1,trialPreview:false}},
  createAiJob:async input=>{events.push('create');queued.push(input);return 'job-staged-fixture'},refundCredit:async id=>{events.push('refund');refunds.push(id)},failAiJob:async(...args)=>{events.push('fail');failed.push(args)},
  setImmediate:fn=>{events.push('schedule');scheduled.push(fn)},runAiJob:id=>{events.push('worker:'+id)},console:{info(){},error(){}}};
 new Function('env','with(env){'+routeSource+'}')(env);
 assert.equal(typeof handler,'function');
 return {request,response,events,queued,scheduled,refunds,failed,begins,attachments,async run(){const imageBefore=Buffer.from(portrait),originalBefore=Buffer.from(rawOriginal);await handler(request,response);assert.deepEqual(portrait,imageBefore);assert.deepEqual(rawOriginal,originalBefore);return this}};
}

await check('matching staged submit binds owned immutable input and evidence before scheduling one worker',async()=>{
 const f=await submitFixture({body:{creditKind:'hairstyle'}}).run();
 assert.equal(f.response.statusCode,202);assert.equal(f.queued.length,1);assert.equal(f.scheduled.length,1);assert.deepEqual(f.refunds,[]);
 const queued=f.queued[0];assert.equal(queued.walletId,owner);assert.equal(queued.usageId,'fixture-reservation');assert.equal(queued.image.buffer,portrait);assert.equal(queued.fields.studioSkinVersion,version);assert.equal(queued.fields.studioSkinEvidence,evidence);assert.equal(queued.fields.delivery_pending,true);assert.equal(queued.fields.delivery_confirmed,false);
 assert.equal(f.begins[0][0],owner);assert.equal(f.begins[0][1],portrait);assert.equal(f.begins[0][4],rawOriginal);assert.equal(f.begins[0][3],'saved-work-proof');assert.deepEqual(f.begins[0][5],{imageType:'image/png',originalType:'image/jpeg'});
 assert.deepEqual(f.attachments,[[owner,work,'job-staged-fixture']]);assert(f.events.indexOf('recover')<f.events.indexOf('reserve'));assert(f.events.indexOf('attach')<f.events.indexOf('response'));assert(f.events.indexOf('response')<f.events.indexOf('schedule'));
 f.scheduled[0]();assert.equal(f.events.filter(v=>v==='worker:job-staged-fixture').length,1);
});
await check('stale staged evidence returns exact owned canonical bytes only after refund, without queued/provider work',async()=>{
 for(const [pinned,pinnedType]of [[await sharp(portrait).modulate({brightness:1.02}).png().toBuffer(),'image/png'],[await sharp(portrait).jpeg().toBuffer(),'image/jpeg']]){
  const before=Buffer.from(pinned),f=await submitFixture({pinned,pinnedType}).run();
  assert.equal(f.response.statusCode,409);assert.equal(f.response.headers['X-IDPROM-Canonical-Input'],'1');assert.equal(f.response.headers['Content-Type'],pinnedType);assert.equal(f.response.headers['Cache-Control'],'private, no-store');assert.equal(f.response.headers['X-Content-Type-Options'],'nosniff');assert.equal(f.response.body,pinned);assert.deepEqual(f.response.body,before);
  assert.equal(f.queued.length,0);assert.equal(f.scheduled.length,0);assert.equal(f.attachments.length,0);assert.deepEqual(f.refunds,['fixture-reservation']);assert.deepEqual(pinned,before);assert(f.events.indexOf('refund')<f.events.indexOf('send'));assert(f.events.indexOf('begin')<f.events.indexOf('pinned'));assert(f.events.indexOf('pinned')<f.events.indexOf('refund'));
  assert.equal(f.begins[0][0],owner);assert.equal(f.begins[0][4],rawOriginal);assert.equal(f.request.body.studioSkinEvidence,evidence);assert.equal(f.request.body.studioSkinVersion,version);
 }
});
await check('legacy mismatch still uses pinned input and only drops its stale face crop',async()=>{
 const pinned=Buffer.from('legacy pinned input'),f=await submitFixture({staged:false,pinned}).run();assert.equal(f.response.statusCode,202);assert.equal(f.queued[0].image.buffer,pinned);assert.equal(f.queued[0].fields.faceIdentityBox,undefined);assert.equal(f.queued[0].fields.studioSkinVersion,undefined);assert.equal(f.request.body.faceIdentityBox,JSON.stringify([.1,.1,.9,.9]));assert.deepEqual(f.refunds,[]);
});
await check('invalid staged versions and evidence fail before work recovery or credit reservation',async()=>{
 for(const body of [{studioSkinVersion:'obsolete'},{studioSkinEvidence:'{'},{studioSkinEvidence:''}]){const f=await submitFixture({body}).run();assert.equal(f.response.statusCode,400);assert.deepEqual(f.events,['response']);assert.equal(f.queued.length,0);assert.deepEqual(f.refunds,[])}
});
await check('male requests retain their existing route without staged metadata or added credit actions',async()=>{
 const f=await submitFixture({staged:false,mode:'male'}).run();assert.equal(f.response.statusCode,202);assert.equal(f.queued.length,1);assert.equal(f.queued[0].fields.portraitMode,'male');assert.equal(f.queued[0].fields.studioSkinEvidence,undefined);assert.equal(f.queued[0].image.buffer,portrait);assert.equal(f.events.filter(x=>x==='reserve').length,1);assert.deepEqual(f.refunds,[]);
});
await check('owned-work recovery failures and refused reservations cannot queue a staged job',async()=>{
 const denied=await submitFixture({scopeError:Object.assign(Error('fixture account mismatch'),{status:403})}).run();assert.equal(denied.response.statusCode,403);assert(!denied.events.includes('reserve'));assert.equal(denied.queued.length,0);assert.deepEqual(denied.refunds,[]);
 const empty=await submitFixture({credit:false}).run();assert.equal(empty.response.statusCode,402);assert(!empty.events.includes('begin'));assert.equal(empty.queued.length,0);assert.deepEqual(empty.refunds,[]);
});
await check('foreign requested works and invalid raw-source proofs never return canonical bytes',async()=>{
 for(const error of [Object.assign(Error('fixture foreign wallet'),{status:403}),Object.assign(Error('fixture raw source mismatch'),{status:409})]){
  const f=await submitFixture({body:{downloadWorkId:'dwork_'+'b'.repeat(36)},beginError:error}).run();assert.equal(f.response.statusCode,error.status);assert.equal(f.response.headers['X-IDPROM-Canonical-Input'],undefined);assert.equal(Buffer.isBuffer(f.response.body),false);assert(!f.events.includes('pinned'));assert(!f.events.includes('send'));assert.equal(f.queued.length,0);assert.equal(f.scheduled.length,0);assert.deepEqual(f.refunds,['fixture-reservation']);assert.equal(f.begins[0][0],owner);assert.equal(f.begins[0][4],rawOriginal);
 }
});
await check('failed work attachment fails the created job and refunds once before any worker starts',async()=>{
 const f=await submitFixture({attachError:Object.assign(Error('fixture attachment unavailable'),{status:503})}).run();assert.equal(f.response.statusCode,503);assert.deepEqual(f.failed,[['job-staged-fixture','work_binding_failed']]);assert.deepEqual(f.refunds,['fixture-reservation']);assert.equal(f.scheduled.length,0);
});

// Use real PostgreSQL semantics for ownership predicates, quoted aliases and
// jsonb evidence removal. This database exists only in process memory.
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const query=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.rowCount??r.affectedRows??r.rows.length}};
const pool={query,async connect(){return {query,release(){}}}};
function jobHelper(name){const a=jobSource.indexOf('export async function '+name+'('),b=jobSource.indexOf('\nexport ',a+1);assert(a>=0);return new Function('pool','ready',jobSource.slice(a,b<0?undefined:b).replace(/^export /,'')+'\nreturn '+name)(pool,async()=>{})}
const getAiJob=jobHelper('getAiJob'),claimAiJob=jobHelper('claimAiJob'),completeAiJob=jobHelper('completeAiJob'),failAiJob=jobHelper('failAiJob'),settleAiJobDelivery=jobHelper('settleAiJobDelivery'),getAiJobResult=jobHelper('getAiJobResult');
const schema=jobSource.match(/await pool\.query\(`(CREATE TABLE IF NOT EXISTS ai_jobs[\s\S]*?)`\)/)?.[1];assert(schema);
await db.exec(schema);
await db.exec('CREATE TABLE wallets(id text PRIMARY KEY,generation_remaining int DEFAULT 0,hair_remaining int DEFAULT 0,full_edit_remaining int DEFAULT 0);CREATE TABLE credit_usage(id text PRIMARY KEY,status text,wallet_id text,kind text,credit_column text,full_edit_output boolean);CREATE TABLE trial_previews(id text PRIMARY KEY,status text);');
await query('INSERT INTO wallets(id) VALUES($1)',['fixture-owner']);
const metadata={studioSkinVersion:version,studioSkinEvidence:evidence,femaleMakeupReference:'private legacy reference',femaleEyeStyle:'korean-rosy-v1',portraitMode:'female',delivery_pending:true,delivery_confirmed:false};
async function seed(id,status='queued'){await query('INSERT INTO ai_jobs(id,wallet_id,usage_id,status,fields,image,image_name,image_type,mask) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,owner,'free_'+id,status,metadata,portrait,'input.png','image/png',Buffer.from('mask')])}
async function row(id){return (await query('SELECT * FROM ai_jobs WHERE id=$1',[id])).rows[0]}
try{
 await check('actual job SQL keeps evidence for queued work, returns exact metadata aliases and enforces wallet ownership',async()=>{
  await seed('job-claim');const status=await getAiJob('job-claim',owner);assert.equal(status.studioSkinVersion,version);assert.equal(status.femaleEyeStyle,'korean-rosy-v1');assert.equal(status.portraitMode,'female');assert(!Object.hasOwn(status,'studioSkinEvidence'));assert.equal(await getAiJob('job-claim','other-wallet'),null);assert.equal(await getAiJobResult('job-claim','other-wallet'),null);
  const claimed=await claimAiJob('job-claim');assert.equal(claimed.fields.studioSkinEvidence,evidence);assert.equal(claimed.fields.studioSkinVersion,version);assert.deepEqual(Buffer.from(claimed.image),portrait);assert.equal(await claimAiJob('job-claim'),null);
 });
 await check('actual completion drops sensitive evidence and raw input while retaining only client finish metadata',async()=>{
  await completeAiJob('job-claim',Buffer.from('bare completed master'));const r=await row('job-claim');assert.equal(r.status,'completed');assert.equal(r.image.length,0);assert.equal(r.mask,null);assert.equal(r.fields.studioSkinEvidence,undefined);assert.equal(r.fields.femaleMakeupReference,undefined);assert.equal(r.fields.studioSkinVersion,version);assert.equal(r.fields.femaleEyeStyle,'korean-rosy-v1');assert.equal(r.fields.portraitMode,'female');assert.equal((await getAiJob('job-claim',owner)).has_result,true);
  assert.equal((await settleAiJobDelivery('job-claim',owner,'confirm')).status,200);assert.equal((await settleAiJobDelivery('job-claim',owner,'confirm')).status,200);assert.equal((await row('job-claim')).fields.delivery_confirmed,true);
 });
 await check('actual failure and cancellation scrub evidence and cannot expose another wallet or revive a cancelled job',async()=>{
  await seed('job-fail');await failAiJob('job-fail','fixture failure');const failed=await row('job-fail');assert.equal(failed.status,'failed');assert.equal(failed.image.length,0);assert.equal(failed.fields.studioSkinEvidence,undefined);assert.equal(failed.fields.femaleMakeupReference,undefined);assert.equal(failed.fields.studioSkinVersion,version);
  await seed('job-cancel');assert.equal((await settleAiJobDelivery('job-cancel','other-wallet','cancel')).status,404);assert.equal((await row('job-cancel')).status,'queued');assert.equal((await settleAiJobDelivery('job-cancel',owner,'cancel')).status,200);assert.equal((await settleAiJobDelivery('job-cancel',owner,'cancel')).status,200);await completeAiJob('job-cancel',Buffer.from('late provider output'));const cancelled=await row('job-cancel');assert.equal(cancelled.status,'failed');assert.equal(cancelled.result,null);assert.equal(cancelled.image.length,0);assert.equal(cancelled.mask,null);assert.equal(cancelled.fields.studioSkinEvidence,undefined);assert.equal(cancelled.fields.femaleMakeupReference,undefined);assert.equal(cancelled.fields.studioSkinVersion,version);assert.equal((await settleAiJobDelivery('job-cancel',owner,'confirm')).status,409);
 });
}finally{await db.close()}

await check('actual bounded multer accepts two files plus eleven fields and rejects excess fields or files',async()=>{
 const uploadStart=serverSource.indexOf('const upload=multer({'),uploadEnd=serverSource.indexOf('\nregisterYoucamHairApi',uploadStart);assert(uploadStart>=0&&uploadEnd>uploadStart);
 const upload=new Function('multer',serverSource.slice(uploadStart,uploadEnd)+'\nreturn upload')(multer);
 const middleware=upload.fields([{name:'image',maxCount:1},{name:'mask',maxCount:1},{name:'originalSource',maxCount:1}]);
 const app=express();app.post('/',(req,res)=>middleware(req,res,error=>res.status(error?400:200).json(error?{error:error.code}:{fields:Object.keys(req.body).length,files:Object.keys(req.files).length,evidence:req.body.studioSkinEvidence})));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  const largeEvidence=JSON.stringify({...JSON.parse(evidence),maskWidth:256,maskHeight:256,labels:Array(256*256).fill(3)});
  const names=['hairId','downloadWorkId','sourceJobId','femaleEyeStyle','outfitReferencePath','faceIdentityBox','portraitMode','necklineProfile','creditKind','studioSkinVersion','studioSkinEvidence'];
  async function post(count,extraFile=false){const data=new FormData();data.append('image',new Blob([portrait],{type:'image/png'}),'input.png');data.append('originalSource',new Blob([rawOriginal],{type:'image/jpeg'}),'original.jpg');if(extraFile)data.append('mask',new Blob(['mask']),'mask.png');for(let i=0;i<count;i++)data.append(names[i]||'extra'+i,names[i]==='studioSkinEvidence'?largeEvidence:'fixture');const response=await fetch('http://127.0.0.1:'+server.address().port,{method:'POST',body:data});return {http:response.status,...await response.json()}}
  const accepted=await post(11);assert.equal(accepted.http,200);assert.equal(accepted.fields,11);assert.equal(accepted.files,2);assert.equal(accepted.evidence,largeEvidence);assert.equal((await post(13)).error,'LIMIT_FIELD_COUNT');assert.equal((await post(11,true)).error,'LIMIT_FILE_COUNT');
 }finally{await new Promise(resolve=>server.close(resolve))}
});

await check('original-AI submissions use the proven raw upload even beside an older canonical derivative',async()=>{
 for(const style of ['natural','makeup','korean-rosy-v1','soft-rosy-v1']){
  const raw=await sharp(portrait).jpeg().toBuffer(),f=submitFixture({staged:false,pinned:portrait,body:{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,femaleEyeStyle:style}});
  f.request.files.image=[{buffer:raw,mimetype:'image/jpeg',originalname:'original.jpg'}];f.request.files.originalSource=[{buffer:raw,mimetype:'image/jpeg',originalname:'original.jpg'}];
  await f.run();assert.equal(f.response.statusCode,202);assert.equal(f.queued.length,1);assert.equal(f.queued[0].image.buffer,raw);assert.equal(f.queued[0].image.mimetype,'image/jpeg');assert.equal(f.queued[0].fields.studioSkinVersion,ORIGINAL_PORTRAIT_AI_VERSION);assert.equal(f.queued[0].fields.studioSkinEvidence,undefined);assert(!f.events.includes('pinned'));assert.equal(f.begins[0][4],raw);assert.equal(f.scheduled.length,1);
 }
});
await check('original-AI rejects substituted pixels, missing original and mismatched MIME before reservation',async()=>{
 for(const kind of ['different','missing','mime']){
  const f=submitFixture({staged:false,body:{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION}});
  if(kind==='missing')delete f.request.files.originalSource;
  if(kind==='mime')f.request.files.originalSource=[{buffer:portrait,mimetype:'image/jpeg'}];
  await f.run();assert.equal(f.response.statusCode,400);assert.equal(f.queued.length,0);assert.equal(f.scheduled.length,0);assert(!f.events.includes('reserve'));assert(!f.events.includes('begin'));
 }
});
await check('original-AI retains owned-work source validation and refunds a refused binding without generation',async()=>{
 const f=submitFixture({staged:false,body:{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION},beginError:Object.assign(Error('wrong original or wallet'),{status:409})});
 f.request.files.originalSource=[{buffer:portrait,mimetype:'image/png'}];await f.run();assert.equal(f.response.statusCode,409);assert.equal(f.queued.length,0);assert.equal(f.scheduled.length,0);assert.deepEqual(f.refunds,['fixture-reservation']);assert(!f.events.includes('pinned'));
});

console.log(JSON.stringify({passed,failed:0,scope:'Production submit callback, disposable PostgreSQL job-store SQL, and real localhost multipart middleware. No provider, production database, real account or payment requests.',checks:results}));
