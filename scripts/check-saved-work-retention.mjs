// Run only against an isolated local PostgreSQL database; never uses DATABASE_URL.
// SAVED_WORK_TEST_DATABASE_URL=postgresql://postgres@localhost:55439/idprom_retention_test node scripts/check-saved-work-retention.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import pg from 'pg';

const target=process.env.SAVED_WORK_TEST_DATABASE_URL;
assert(target,'Set SAVED_WORK_TEST_DATABASE_URL to an isolated local test database');
const url=new URL(target);
assert(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Only a local test PostgreSQL server is allowed');
assert(/^\/idprom_retention_test(?:_[a-z0-9_]+)?$/.test(url.pathname),'Test database name must start with idprom_retention_test');
const schema='retention_'+crypto.randomBytes(8).toString('hex');
url.searchParams.set('options','-csearch_path='+schema+' -cTimeZone=UTC');
const OriginalPool=pg.Pool,originalDatabaseURL=process.env.DATABASE_URL;
const admin=new OriginalPool({connectionString:target,ssl:false});
const pools=[],cases=[];
let failSql=null;
class TrackedPool extends OriginalPool{
 constructor(options){
  super(options);pools.push(this);
  this.on('connect',client=>{
   const query=client.query;
   client.query=function(sql,...args){
    if(failSql?.test(typeof sql==='string'?sql:sql.text)){failSql=null;throw Error('injected_retention_migration_failure')}
    return query.call(this,sql,...args);
   };
  });
 }
}
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0X8AAAAASUVORK5CYII=';
const project=(extra={})=>({format:'idprom-studio',version:1,width:900,height:1200,layers:[{id:'head',kind:'head',name:'หัว · คอ · ผม',jobId:'job_fixture',source:image,x:0,y:0,scale:1,rotation:0,opacity:1}],...extra});
const run=async(name,callback)=>{await callback();cases.push(name);console.log('PASS: '+name)};
const workError=error=>error?.code==='saved_work_expired';
const missing=error=>error?.code==='saved_work_limit';
const protectedTables=['wallets','users','payments','credit_usage','paid_image_unlocks','ai_jobs'];
const snapshot=async()=>Object.fromEntries(await Promise.all(protectedTables.map(async table=>[table,(await admin.query(`SELECT to_jsonb(t) AS value FROM ${schema}.${table} t ORDER BY id`)).rows.map(row=>row.value)])));
const row=async id=>(await admin.query(`SELECT * FROM ${schema}.saved_studio_work WHERE id=$1`,[id])).rows[0];
const expire=async id=>admin.query(`UPDATE ${schema}.saved_studio_work SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,[id]);
const interval=async id=>(await admin.query(`SELECT extract(epoch FROM (expires_at-retention_started_at))::float8 AS seconds FROM ${schema}.saved_studio_work WHERE id=$1`,[id])).rows[0].seconds;
let store,policy,protectedBefore;
try{
 await admin.query(`CREATE SCHEMA ${schema}`);
 await admin.query(`CREATE TABLE ${schema}.wallets(id text PRIMARY KEY,credits integer NOT NULL DEFAULT 19)`);
 const wallets=['legacy','fresh','dedupe','concurrency','concurrent_dedupe','quota','cross','purge','lock','invalid','nullprotected'];
 for(const id of wallets)await admin.query(`INSERT INTO ${schema}.wallets(id) VALUES($1)`,[id]);
 for(const table of protectedTables.slice(1)){
  await admin.query(`CREATE TABLE ${schema}.${table}(id text PRIMARY KEY,payload jsonb)`);
  await admin.query(`INSERT INTO ${schema}.${table} VALUES('protected','{"value":"unchanged"}')`);
 }
 await admin.query(`CREATE TABLE ${schema}.saved_studio_work(id text PRIMARY KEY,wallet_id text NOT NULL REFERENCES ${schema}.wallets(id),name text NOT NULL,project jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())`);
 await admin.query(`INSERT INTO ${schema}.saved_studio_work VALUES('legacy-old','legacy','old',$1,'2001-01-01T00:00:00Z'),('legacy-recent','legacy','recent',$1,'2026-10-01T00:00:00Z')`,[project()]);
 protectedBefore=await snapshot();
 process.env.DATABASE_URL=url.toString();pg.Pool=TrackedPool;
 store=await import(new URL('../saved-work-store.js?retention-test='+schema,import.meta.url));
 await run('migration failure rolls back and the same module retries safely',async()=>{
  failSql=/CREATE\s+(?:UNIQUE\s+)?INDEX/i;
  await assert.rejects(store.getSavedWorkRetentionPolicy(),/injected_retention_migration_failure/);
  const columns=await admin.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2',[schema,'saved_studio_work']);
  assert(!columns.rows.some(r=>r.column_name==='expires_at'),'failed transactional migration must not leave partial retention columns');
  policy=await store.getSavedWorkRetentionPolicy();assert.equal(policy.days,45);assert.equal(policy.version,'saved-work-45-v1');
 });
 await run('old saved projects receive a full 45 days from persistent activation, without data changes',async()=>{
  const old=await row('legacy-old'),recent=await row('legacy-recent');
  assert.deepEqual(old.project,project());assert.equal(new Date(old.updated_at).toISOString(),'2001-01-01T00:00:00.000Z');
  assert.equal(new Date(old.retention_started_at).getTime(),new Date(policy.effectiveAt).getTime());
  assert.equal(new Date(old.expires_at).getTime(),new Date(policy.legacyExpiresAt).getTime());
  assert.equal(new Date(recent.expires_at).getTime(),new Date(old.expires_at).getTime());
  assert.equal(await interval(old.id),45*86400);assert(new Date(old.expires_at)>new Date(policy.serverNow));
  assert.equal((await store.listWorks('legacy')).length,2);
 });
 await run('new work uses server first-save time and ignores client supplied expiry metadata',async()=>{
  const before=(await admin.query('SELECT clock_timestamp() AS at')).rows[0].at;
  const saved=await store.saveWork('fresh','',project({expires_at:'2999-01-01',retention_started_at:'1900-01-01'}));
  const data=await row(saved.id);assert(new Date(data.retention_started_at)>=new Date(before));
  assert.equal(await interval(saved.id),45*86400);assert.equal(new Date(saved.expires_at).getTime(),new Date(data.expires_at).getTime());
  assert.equal(data.retention_policy_version,policy.version);
 });
 await run('opening and editing an active project preserve its first-save and expiry times',async()=>{
  const first=(await store.listWorks('fresh'))[0],before=await row(first.id);
  assert((await store.getWork('fresh',first.id)).project);
  await store.saveWork('fresh',first.id,project({note:'edited'}));
  const after=await row(first.id);assert.equal(after.project.note,'edited');
  for(const key of ['retention_started_at','expires_at'])assert.equal(new Date(after[key]).getTime(),new Date(before[key]).getTime());
 });
 await run('active purchase retry returns the same work and unchanged expiry',async()=>{
  const p=project({purchaseKey:'purchase-dedupe'}),a=await store.saveWork('dedupe','',p),b=await store.saveWork('dedupe','',p);
  assert.equal(a.id,b.id);assert.equal(new Date(a.expires_at).getTime(),new Date(b.expires_at).getTime());
  assert.equal((await store.listWorks('dedupe')).length,1);
 });
 await run('old-version inserts during a rolling deploy still receive immutable 45-day defaults',async()=>{
  const saved=(await admin.query(`INSERT INTO ${schema}.saved_studio_work(id,wallet_id,name,project) VALUES('rolling-old-insert','fresh','old instance',$1) RETURNING *`,[project()])).rows[0];
  assert(saved.retention_started_at);assert(saved.expires_at);assert.equal(saved.retention_policy_version,policy.version);
  assert.equal(await interval(saved.id),45*86400);
  await admin.query(`UPDATE ${schema}.saved_studio_work SET project=$2,updated_at=now() WHERE id=$1`,[saved.id,project({note:'old update'})]);
  const edited=await row(saved.id);assert.equal(new Date(edited.expires_at).getTime(),new Date(saved.expires_at).getTime());
  await store.deleteWork('fresh',saved.id);
 });
 await run('cross-account reads, writes and deletes cannot access or change another account work',async()=>{
  const owned=(await store.listWorks('fresh'))[0],before=await row(owned.id);
  assert.equal(await store.getWork('cross',owned.id),null);
  assert.equal(await store.saveWork('cross',owned.id,project()),null);
  assert.equal(await store.deleteWork('cross',owned.id),null);
  assert.deepEqual(await row(owned.id),before);
 });
 await run('ten simultaneous new saves cannot exceed the three-work limit',async()=>{
  const results=await Promise.allSettled(Array.from({length:10},()=>store.saveWork('concurrency','',project())));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
  assert(results.filter(r=>r.status==='rejected').every(r=>missing(r.reason)));
  assert.equal((await store.listWorks('concurrency')).length,3);
 });
 await run('simultaneous payment retries deduplicate under the wallet lock',async()=>{
  await store.saveWork('concurrent_dedupe','',project());await store.saveWork('concurrent_dedupe','',project());
  const results=await Promise.all(Array.from({length:10},()=>store.saveWork('concurrent_dedupe','',project({purchaseKey:'concurrent-payment'}))));
  assert.equal(new Set(results.map(r=>r.id)).size,1);assert.equal((await store.listWorks('concurrent_dedupe')).length,3);
 });
 await run('expiry hides work immediately and frees quota before the cleanup worker runs',async()=>{
  const a=await store.saveWork('quota','',project()),b=await store.saveWork('quota','',project()),c=await store.saveWork('quota','',project());
  await assert.rejects(store.saveWork('quota','',project()),missing);await expire(a.id);
  assert(await row(a.id),'expired row still exists before purge');assert.equal((await store.listWorks('quota')).length,2);
  const d=await store.saveWork('quota','',project());assert(d.id);assert.equal((await store.listWorks('quota')).length,3);
  assert(await row(b.id));assert(await row(c.id));
 });
 await run('expired owned work returns a typed error and cannot be silently overwritten',async()=>{
  const expired=(await admin.query(`SELECT id FROM ${schema}.saved_studio_work WHERE wallet_id='quota' AND expires_at<clock_timestamp()`)).rows[0].id;
  const before=await row(expired);
  await assert.rejects(store.getWork('quota',expired),workError);
  await assert.rejects(store.saveWork('quota',expired,project({note:'must-not-save'})),workError);
  assert.deepEqual(await row(expired),before);
  assert.equal(await store.getWork('cross',expired),null);assert.equal(await store.saveWork('cross',expired,project()),null);
 });
 await run('a work expiring at the database current time is unavailable',async()=>{
  const saved=await store.saveWork('purge','',project());
  await admin.query(`UPDATE ${schema}.saved_studio_work SET expires_at=clock_timestamp() WHERE id=$1`,[saved.id]);
  await assert.rejects(store.getWork('purge',saved.id),workError);
 });
 await run('expired payment retries cannot return the old work as a successful save',async()=>{
  const old=(await store.listWorks('dedupe'))[0];await expire(old.id);
  await assert.rejects(store.saveWork('dedupe','',project({purchaseKey:'purchase-dedupe'})),workError);
  await assert.rejects(store.saveWork('dedupe',old.id,project({purchaseKey:'purchase-dedupe'})),workError);
 });
 await run('ordinary manual deletion remains a missing work and does not create an expiry tombstone',async()=>{
  const saved=await store.saveWork('fresh','',project());assert.equal((await store.deleteWork('fresh',saved.id)).id,saved.id);
  assert.equal(await store.getWork('fresh',saved.id),null);assert.equal(await store.saveWork('fresh',saved.id,project()),null);
  const tomb=await admin.query(`SELECT id FROM ${schema}.saved_studio_work_expired WHERE id=$1`,[saved.id]);assert.equal(tomb.rowCount,0);
 });
 await run('cleanup respects a batch bound, skips locked rows and never deletes live or uninitialized data',async()=>{
  const live=await store.saveWork('nullprotected','',project());
  await admin.query(`INSERT INTO ${schema}.saved_studio_work(id,wallet_id,name,project,expires_at,retention_started_at,retention_policy_version) VALUES('unmigrated-null','nullprotected','null',$1,NULL,NULL,NULL)`,[project()]);
  const lock=(await admin.query(`SELECT id FROM ${schema}.saved_studio_work WHERE expires_at<clock_timestamp() ORDER BY expires_at LIMIT 1`)).rows[0].id;
  const locker=await admin.connect();await locker.query('BEGIN');await locker.query(`SELECT id FROM ${schema}.saved_studio_work WHERE id=$1 FOR UPDATE`,[lock]);
  try{
   const start=Date.now(),count=await store.purgeExpiredWorks({limit:1});assert.equal(count,1);assert(Date.now()-start<2500,'worker must skip an already locked row');assert(await row(lock));
  }finally{await locker.query('ROLLBACK');locker.release()}
  assert(await row(live.id));assert(await row('unmigrated-null'));
  for(let i=0;i<10;i++){if(!await store.purgeExpiredWorks({limit:2}))break}
  assert(await row(live.id));assert(await row('unmigrated-null'));
  assert.equal(Number((await admin.query(`SELECT count(*) FROM ${schema}.saved_studio_work WHERE expires_at<=clock_timestamp()`)).rows[0].count),0);
  assert.equal(await store.purgeExpiredWorks({limit:2}),0);
 });
 await run('purged work IDs and payment retries stay expired without leaking another account metadata',async()=>{
  await assert.rejects(store.getWork('dedupe',(await admin.query(`SELECT id FROM ${schema}.saved_studio_work_expired WHERE wallet_id='dedupe' LIMIT 1`)).rows[0].id),workError);
  await assert.rejects(store.saveWork('dedupe','',project({purchaseKey:'purchase-dedupe'})),workError);
  assert.equal(await store.getWork('cross',(await admin.query(`SELECT id FROM ${schema}.saved_studio_work_expired WHERE wallet_id='dedupe' LIMIT 1`)).rows[0].id),null);
  const columns=(await admin.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2',[schema,'saved_studio_work_expired'])).rows.map(r=>r.column_name);
  assert(!columns.includes('project'));assert(!columns.includes('source'));assert(!columns.includes('image'));assert(!columns.includes('purchase_key'));
  const hashes=(await admin.query(`SELECT purchase_key_hash FROM ${schema}.saved_studio_work_expired WHERE wallet_id='dedupe'`)).rows;
  assert(hashes.some(r=>r.purchase_key_hash===crypto.createHash('sha256').update('purchase-dedupe').digest('hex')));
 });
 await run('parallel cleanup calls are safe and leave all remaining active works intact',async()=>{
  const a=await store.saveWork('lock','',project()),b=await store.saveWork('lock','',project()),c=await store.saveWork('lock','',project());
  await expire(a.id);await expire(b.id);
  const counts=await Promise.all([store.purgeExpiredWorks({limit:1}),store.purgeExpiredWorks({limit:1}),store.purgeExpiredWorks({limit:1})]);
  assert.equal(counts.reduce((sum,n)=>sum+n,0),2);assert(await row(c.id));
 });
 await run('invalid project validation still rejects malformed or unprocessed work',async()=>{
  await assert.rejects(store.saveWork('invalid','',{...project(),layers:[] }));
  const p=project();delete p.layers[0].jobId;await assert.rejects(store.saveWork('invalid','',p));assert.equal((await store.listWorks('invalid')).length,0);
 });
 await run('a fresh module migration never resets the stored policy or existing expiry',async()=>{
  const before=await row('legacy-old');
  const restarted=await import(new URL('../saved-work-store.js?retention-restart='+schema,import.meta.url));
  const afterPolicy=await restarted.getSavedWorkRetentionPolicy();
  assert.equal(new Date(afterPolicy.effectiveAt).getTime(),new Date(policy.effectiveAt).getTime());assert.equal(new Date(afterPolicy.legacyExpiresAt).getTime(),new Date(policy.legacyExpiresAt).getTime());
  assert.deepEqual(await row('legacy-old'),before);assert(await row('unmigrated-null'),'uninitialized row receives grace instead of being deleted');
  assert(new Date((await row('unmigrated-null')).expires_at)>new Date());
 });
 await run('simultaneous fresh instances serialize migration and retain the same activation',async()=>{
  const modules=await Promise.all(Array.from({length:4},(_,n)=>import(new URL('../saved-work-store.js?retention-concurrent='+schema+'-'+n,import.meta.url))));
  const policies=await Promise.all(modules.map(module=>module.getSavedWorkRetentionPolicy()));
  assert(policies.every(p=>new Date(p.effectiveAt).getTime()===new Date(policy.effectiveAt).getTime()));
  const count=await admin.query(`SELECT count(*)::int AS count FROM ${schema}.saved_studio_work_retention_policy`);assert.equal(count.rows[0].count,1);
 });
 await run('accounts, credit balances, payment history, entitlements and AI outputs are byte-for-byte unchanged',async()=>assert.deepEqual(await snapshot(),protectedBefore));
 const report={database:'isolated local PostgreSQL',postgres:(await admin.query('SELECT version()')).rows[0].version,tests:cases.length,passed:cases.length,cases,source:'actual saved-work-store.js SQL and pg client',policy:{...policy,effectiveAt:new Date(policy.effectiveAt).toISOString(),legacyExpiresAt:new Date(policy.legacyExpiresAt).toISOString()}};
 if(process.env.RETENTION_TEST_REPORT)await writeFile(process.env.RETENTION_TEST_REPORT,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{
 pg.Pool=OriginalPool;
 if(originalDatabaseURL===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=originalDatabaseURL;
 await Promise.all(pools.map(pool=>pool.end()));
 await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
}
