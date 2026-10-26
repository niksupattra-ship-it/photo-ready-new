// Execute real policy SQL in disposable PostgreSQL WASM, never DATABASE_URL.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const query=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.rowCount??r.affectedRows??r.rows.length}};
const pool={query,async connect(){return {query,release(){}}}};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const data=b=>'data:image/jpeg;base64,'+b.toString('base64');
const original=Buffer.from('original untouched upload A'),chrome=Buffer.from('chromium normalized A'),webkit=Buffer.from('webkit normalized A'),other=Buffer.from('different person B');
const source=await readFile(new URL('../download-policy-store.js',import.meta.url),'utf8');
const factory=new Function('crypto',source.slice(source.indexOf('export function createDownloadPolicy'),source.lastIndexOf('\nconst pool=')).replace(/^export /,'')+';return createDownloadPolicy')(crypto);
let passed=0;
async function test(name,run){await run();passed++;console.log('PASS '+name)}
try{
 await db.exec(`CREATE TABLE wallets(id text PRIMARY KEY,generation_remaining int DEFAULT 0,hair_remaining int DEFAULT 0);
 CREATE TABLE payments(wallet_id text);CREATE TABLE promo_redemptions(wallet_id text);
 CREATE TABLE ai_jobs(id text PRIMARY KEY,wallet_id text,status text,usage_id text);
 CREATE TABLE saved_studio_work(id text PRIMARY KEY,wallet_id text,project jsonb);
 CREATE TABLE download_works(id text PRIMARY KEY,wallet_id text NOT NULL,source_hash text NOT NULL,legacy_work_id text,created_at timestamptz DEFAULT now());`);
 for(const wallet of ['account','foreign'])await query('INSERT INTO wallets(id) VALUES($1)',[wallet]);
 for(const [id,bytes] of [['old-saved',chrome],['old-unsaved',chrome],['old-fallback',original],['old-tampered',chrome],['old-ambiguous',chrome]])await query('INSERT INTO download_works(id,wallet_id,source_hash) VALUES($1,$2,$3)',[id,'account',sha(bytes)]);
 await query('INSERT INTO saved_studio_work(id,wallet_id,project) VALUES($1,$2,$3)',['saved-before-upgrade','account',{downloadWorkId:'old-saved',downloadSource:data(original),layers:[]}]);
 await query('INSERT INTO saved_studio_work(id,wallet_id,project) VALUES($1,$2,$3)',['ambiguous-a','account',{downloadWorkId:'old-ambiguous',downloadSource:data(original),layers:[]}]);
 await query('INSERT INTO saved_studio_work(id,wallet_id,project) VALUES($1,$2,$3)',['ambiguous-b','account',{downloadWorkId:'old-ambiguous',downloadSource:data(other),layers:[]}]);
 const policy=factory(pool);await policy.ready();
 await test('pre-upgrade saved raw original is frozen and permits another browser encoder',async()=>{
  assert.equal(await policy.beginWork('account',webkit,'old-saved','',original),'old-saved');
  assert.deepEqual((await policy.inputForWork('account','old-saved')).buffer,original);
  assert.equal((await query("SELECT original_source_hash FROM download_works WHERE id='old-saved'")).rows[0].original_source_hash,sha(original));
  await assert.rejects(policy.beginWork('foreign',webkit,'old-saved','',original),e=>e.status===409);
  await assert.rejects(policy.beginWork('account',webkit,'old-saved','',other),e=>e.status===409);
 });
 await test('new work binds raw bytes across first fallback then recovered normalization',async()=>{
  const work=await policy.beginWork('account',original,'','',original);
  assert.equal(await policy.beginWork('account',chrome,work,'',original),work);
  assert.equal(await policy.beginWork('account',webkit,work,'',original),work);
  assert.deepEqual((await policy.inputForWork('account',work)).buffer,original);
  await assert.rejects(policy.beginWork('account',webkit,work,'',other),e=>e.status===409);
 });
 await test('historical fallback work safely binds when raw upload equals its prior submitted hash',async()=>{
  assert.equal(await policy.beginWork('account',webkit,'old-fallback','',original),'old-fallback');
  assert.equal(await policy.beginWork('account',chrome,'old-fallback','',original),'old-fallback');
 });
 await test('exact historical canonical proof can establish stable raw binding',async()=>{
  assert.equal(await policy.beginWork('account',chrome,'old-unsaved','',original),'old-unsaved');
  assert.equal(await policy.beginWork('account',webkit,'old-unsaved','',original),'old-unsaved');
 });
 await test('post-upgrade edits cannot rebind an old paid work and migration never repeats',async()=>{
  await query('INSERT INTO saved_studio_work(id,wallet_id,project) VALUES($1,$2,$3)',['saved-after-upgrade','account',{downloadWorkId:'old-tampered',downloadSource:data(other),layers:[]}]);
  const restarted=factory(pool);await restarted.ready();
  await assert.rejects(restarted.beginWork('account',webkit,'old-tampered','',other),e=>e.status===409);
  await query('UPDATE saved_studio_work SET project=$2 WHERE id=$1',['saved-before-upgrade',{downloadWorkId:'old-saved',downloadSource:data(other),layers:[]}]);
  await assert.rejects(restarted.beginWork('account',webkit,'old-saved','',other),e=>e.status===409);
  assert.equal(await restarted.beginWork('account',webkit,'old-saved','',original),'old-saved');
  assert.equal((await query('SELECT count(*)::int AS n FROM download_source_binding_migrations')).rows[0].n,1);
 });
 await test('conflicting historical saved originals do not fabricate migration proof',async()=>{
  assert.equal((await query("SELECT original_source_hash FROM download_works WHERE id='old-ambiguous'")).rows[0].original_source_hash,null);
  await assert.rejects(policy.beginWork('account',webkit,'old-ambiguous','',original),e=>e.status===409);
 });
 await test('older clients still require exact bytes and no source is silently granted another work',async()=>{
  const work=await policy.beginWork('account',chrome);assert.equal(await policy.beginWork('account',chrome,work),work);
  await assert.rejects(policy.beginWork('account',webkit,work),e=>e.status===409);
  await assert.rejects(policy.beginWork('account',other,'old-saved','',other),e=>e.status===409);
 });
 await test('actual AI-submit handler ignores substituted image pixels beside an old raw proof',async()=>{
  const work=await policy.beginWork('account',chrome,'','',original),server=await readFile(new URL('../server.js',import.meta.url),'utf8');
  const start=server.indexOf("app.post('/api/ai-jobs',upload.fields("),end=server.indexOf("\napp.post('/api/ai-jobs/:id/:action'",start);assert(start>=0&&end>start);
  let handler,received;
  const env={app:{post:(...args)=>{handler=args.at(-1)}},upload:{fields:()=>null},validateProductionPortrait:()=>{},requireCredit:async()=>({usageId:'free_local'}),downloadPolicy:policy,walletId:()=> 'account',createAiJob:async args=>{received=args;await query('INSERT INTO ai_jobs(id,wallet_id,status,usage_id) VALUES($1,$2,$3,$4)',['local-job','account','queued','free_local']);return 'local-job'},refundCredit:async()=>{},failAiJob:async()=>{},setImmediate:()=>{},runAiJob:()=>{throw Error('No generation in source contract test')},console:{info(){},error(){}}};
  new Function('env','with(env){'+server.slice(start,end)+'}')(env);
  const req={files:{image:[{buffer:other,mimetype:'image/png'}],originalSource:[{buffer:original,mimetype:'image/jpeg'}]},body:{hairId:'original',portraitMode:'male',downloadWorkId:work,faceIdentityBox:'[0,0,1,1]'},get:()=>''};
  const res={headersSent:false,statusCode:200,status(n){this.statusCode=n;return this},json(body){this.body=body;this.headersSent=true;return this}};
  await handler(req,res);assert.equal(res.statusCode,202);assert.equal(res.body.downloadWorkId,work);
  assert.deepEqual(received.image.buffer,chrome);assert.notDeepEqual(received.image.buffer,other);assert.equal(received.fields.faceIdentityBox,undefined);
  assert.deepEqual((await policy.inputForWork('account',work)).buffer,chrome);
 });
 console.log(`PASS ${passed} real SQL source-binding/migration scenarios; isolated PGlite only.`);
}finally{await db.close()}
