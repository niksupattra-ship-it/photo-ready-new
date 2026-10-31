import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

// Require an explicitly selected local cluster, then create a disposable DB.
// No application, customer, provider or production database is used.
if(!process.argv.includes('--worker')){
 const target=new URL(process.env.SOURCE_DOWNLOAD_TEST_DATABASE_URL||'');
 assert(['localhost','127.0.0.1'].includes(target.hostname),'Use an isolated local PostgreSQL cluster');
 const admin=new pg.Client({connectionString:target.href,ssl:false});await admin.connect();
 const name='source_download_test_'+crypto.randomBytes(8).toString('hex');
 let status=1;
 try{
  await admin.query(`CREATE DATABASE "${name}"`);target.pathname='/'+name;
  const run=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--worker'],{env:{...process.env,DATABASE_URL:target.href,PGSSLMODE:'disable',NODE_ENV:'development'},stdio:'inherit'});
  status=run.status??1;
 }finally{await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);await admin.end()}
 process.exit(status);
}

const {default:express}=await import('express'),{default:multer}=await import('multer'),{default:sharp}=await import('sharp');
const {registerSourceDownloadApi}=await import('../source-download-api.js');
const {newWallet,ensureWallet,getWallet,creditPaid}=await import('../payment-store.js');
const {createSourceDownloadJob,getAiJobResult,createAiJob,claimAiJob,completeAiJob}=await import('../job-store.js');
const {downloadPolicy}=await import('../download-policy-store.js');
const {validateProject,saveWork,getWork}=await import('../saved-work-store.js');
const app=express();
registerSourceDownloadApi(app,{upload:multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024}}),walletId:req=>req.get('X-Wallet-Id')||'',ensureWallet,metadata:buffer=>sharp(buffer).metadata(),createSourceDownloadJob,downloadPolicy});
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
const base='http://127.0.0.1:'+server.address().port;
const image=await sharp({create:{width:24,height:32,channels:3,background:'#cfaa88'}}).png().toBuffer();
const other=await sharp({create:{width:24,height:32,channels:3,background:'#8899cc'}}).png().toBuffer();
const wallet=(await newWallet()).walletId,second=(await newWallet()).walletId,key=crypto.randomUUID();
const register=async(w=wallet,k=key,bytes=image)=>{
 const body=new FormData();body.append('image',new Blob([bytes],{type:'image/png'}),'portrait.png');
 const response=await fetch(base+'/api/source-downloads',{method:'POST',headers:{'X-Wallet-Id':w,'X-IDPROM-Source-Key':k},body});
 return {status:response.status,data:await response.json()};
};
let passed=0;
const check=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
try{
 let source;
 await check('a raw portrait is registered as a completed downloadable work without AI or credit use',async()=>{
  const before=await getWallet(wallet),out=await register();assert.equal(out.status,200);source=out.data;
  assert.match(source.jobId,/^job_/);assert.match(source.downloadWorkId,/^dwork_/);
  const job=await getAiJobResult(source.jobId,wallet);assert.equal(job.status,'completed');assert(job.result.equals(image));assert.match(job.usage_id,/^free_source_/);
  assert.deepEqual(await getWallet(wallet),before);assert.equal(await downloadPolicy.allowed(wallet,source.jobId),false);
 });
 await check('retries and concurrent submissions reuse one job and one work',async()=>{
  const results=await Promise.all([register(),register(),register()]);
  for(const result of results){assert.equal(result.status,200);assert.deepEqual(result.data,source)}
 });
 await check('reusing an upload key for different pixels is rejected without transferring rights',async()=>{assert.equal((await register(wallet,key,other)).status,409)});
 await check('invalid images, missing wallets and invalid upload keys are rejected',async()=>{
  assert.equal((await register(wallet,key,Buffer.from('not an image'))).status,400);
  assert.equal((await register('',key)).status,400);assert.equal((await register(wallet,'short')).status,400);
 });
 await check('another wallet cannot access the first portrait or its canonical input',async()=>{
  await assert.rejects(downloadPolicy.allowed(second,source.jobId),{status:404});
  await assert.rejects(downloadPolicy.inputForWork(second,source.downloadWorkId),{status:409});
  const own=await register(second);assert.equal(own.status,200);assert.notEqual(own.data.jobId,source.jobId);
 });
 await check('a guest source can move through the existing account claim without gaining a paid right',async()=>{
  const guest=(await newWallet()).walletId,out=await register(guest,crypto.randomUUID());assert.equal(out.status,200);
  await downloadPolicy.claim(guest,second,out.data.jobId);
  assert.equal((await getAiJobResult(out.data.jobId,second)).status,'completed');assert.equal(await getAiJobResult(out.data.jobId,guest),null);
  assert.equal(await downloadPolicy.allowed(second,out.data.jobId),false);
  assert((await downloadPolicy.inputForWork(second,out.data.downloadWorkId)).buffer.equals(image));
 });
 await check('the existing per-image purchase unlocks the unprocessed work, with no generation credits',async()=>{
  await creditPaid(wallet,'fixture_payment','download_89_v1',source.jobId);
  assert.equal(await downloadPolicy.allowed(wallet,source.jobId),true);assert.equal((await getWallet(wallet)).processRemaining,0);
 });
 await check('a replacement photo gets a fresh unpaid work, including identical uploaded bytes',async()=>{
  for(const bytes of [image,other]){
   const fresh=await register(wallet,crypto.randomUUID(),bytes);assert.equal(fresh.status,200);
   assert.notEqual(fresh.data.downloadWorkId,source.downloadWorkId);assert.equal(await downloadPolicy.allowed(wallet,fresh.data.jobId),false);
  }
 });
 await check('optional later processing shares rights only with the same proven original',async()=>{
  const work=await downloadPolicy.beginWork(wallet,image,source.downloadWorkId,'',image);assert.equal(work,source.downloadWorkId);
  await assert.rejects(downloadPolicy.beginWork(wallet,other,work,'',other),{status:409});
  const job=await createAiJob({walletId:wallet,usageId:'free_fixture',image:{buffer:image,mimetype:'image/png'}});
  await claimAiJob(job);await completeAiJob(job,image);await downloadPolicy.attach(wallet,work,job);
  assert.equal(await downloadPolicy.allowed(wallet,job),true);
 });
 await check('saved raw-source projects retain their paid job and reject missing output identities',async()=>{
  const layer={id:'source',name:'รูปที่เพิ่ม',kind:'source-photo',jobId:source.jobId,source:'data:image/png;base64,'+image.toString('base64'),x:0,y:0,scale:1,rotation:0,opacity:1,visible:true,locked:false};
  const project={format:'idprom-studio',version:1,width:900,height:1200,layers:[layer]};
  assert.deepEqual(validateProject(project),[source.jobId]);
  assert.equal(await downloadPolicy.allowedJobs(wallet,validateProject(project)),true);
  const saved=await saveWork(wallet,'',project),restored=await getWork(wallet,saved.id);assert.equal(restored.project.layers[0].jobId,source.jobId);assert.equal(restored.project.layers[0].kind,'source-photo');
  assert.throws(()=>validateProject({...project,layers:[{...layer,jobId:''}]}),/paid_image_required/);
 });
 console.log(JSON.stringify({passed,scope:'Actual source-registration HTTP, PostgreSQL stores and download policy in a disposable local DB. Payment grants are local fixtures; no AI/provider calls.'}));
 server.close();process.exit(0);
}catch(error){console.error(error);server.close();process.exit(1)}
