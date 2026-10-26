// All SQL runs in a disposable PostgreSQL WASM instance, without DATABASE_URL.
// PGLITE_MODULE may point to a locally installed @electric-sql/pglite module.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {validateSavedProject} from '../src/saved-project.js';

const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),queries=[],cases=[];
const query=async(sql,args)=>{queries.push(sql);const result=await db.query(sql,args);return {...result,rowCount:result.rowCount??result.affectedRows??result.rows.length}};
const pool={query,async connect(){return {query,release(){}}}};
const check=async(name,test)=>{await test();cases.push(name);console.log('PASS '+name)};
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0X8AAAAASUVORK5CYII=';
const bytes=Buffer.from(image.split(',')[1],'base64');
const project=(job='legacy-job',extra={})=>({format:'idprom-studio',version:1,width:900,height:1200,layers:[{id:'head',name:'หัว · คอ · ผม',kind:'head',jobId:job,source:image,x:0,y:0,scale:1,rotation:0,opacity:1}],compareSource:image,...extra});
const balance=async wallet=>(await query('SELECT * FROM wallets WHERE id=$1',[wallet])).rows[0];
const job=async(id,wallet='new',usage='free_fixture',status='completed')=>query('INSERT INTO ai_jobs(id,wallet_id,usage_id,status) VALUES($1,$2,$3,$4)',[id,wallet,usage,status]);
let store,policy;
try{
 await db.exec(`CREATE TABLE wallets(id text PRIMARY KEY,credits int NOT NULL DEFAULT 0,generation_remaining int NOT NULL DEFAULT 0,hair_remaining int NOT NULL DEFAULT 0,full_edit_remaining int NOT NULL DEFAULT 0);
 CREATE TABLE payments(session_id text PRIMARY KEY,wallet_id text NOT NULL);
 CREATE TABLE promo_redemptions(code text PRIMARY KEY,wallet_id text NOT NULL);
 CREATE TABLE paid_image_unlocks(wallet_id text NOT NULL,job_id text NOT NULL,full_edit boolean NOT NULL DEFAULT false,PRIMARY KEY(wallet_id,job_id));
 CREATE TABLE credit_usage(id text PRIMARY KEY,wallet_id text NOT NULL,kind text NOT NULL,status text NOT NULL,credit_column text,full_edit_output boolean NOT NULL DEFAULT false,completed_at timestamptz);
 CREATE TABLE ai_jobs(id text PRIMARY KEY,wallet_id text NOT NULL,usage_id text NOT NULL,status text NOT NULL);
 CREATE TABLE saved_studio_work(id text PRIMARY KEY,wallet_id text NOT NULL REFERENCES wallets(id),name text NOT NULL,project jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());`);
 for(const wallet of ['legacy','old-paid','new','guest','target','foreign','retention'])await query('INSERT INTO wallets(id,credits,generation_remaining,hair_remaining,full_edit_remaining) VALUES($1,99,$2,$3,7)',[wallet,wallet==='new'?1:0,wallet==='new'?1:0]);
 await query("INSERT INTO payments VALUES('old-payment','old-paid')");
 await job('legacy-job','legacy','use_historical');await job('old-paid-job','old-paid','use_historical');
 await query("INSERT INTO saved_studio_work(id,wallet_id,name,project) VALUES('legacy-work','legacy','old',$1),('malformed-source','legacy','bad',$2),('malformed-layers','legacy','bad',$3)",[project(),project('legacy-job',{compareSource:'data:image/png;base64,%%%'}),{layers:{},compareSource:'data:image/png;base64,A==='}]);
 const storeSource=(await readFile(new URL('../saved-work-store.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/^const pool=.*;\n/m,'').replace(/^export /gm,'');
 store=new Function('pool','crypto','validateSavedProject',storeSource+';return {getSavedWorkRetentionPolicy,saveWork,listWorks,getWork,deleteWork,purgeExpiredWorks,MAX_SAVED_WORKS};')(pool,crypto,validateSavedProject);
 const source=await readFile(new URL('../download-policy-store.js',import.meta.url),'utf8');
 const factory=new Function('crypto',source.slice(source.indexOf('export function createDownloadPolicy'),source.lastIndexOf('\nconst pool=')).replace(/^export /,'')+';return createDownloadPolicy;')(crypto);
 policy=factory(pool,{prepareSavedWorks:store.getSavedWorkRetentionPolicy});
 const protectedBefore=JSON.stringify((await query('SELECT * FROM wallets ORDER BY id')).rows);
 await check('activation preserves balances, snapshots old rights and tolerates malformed historical originals',async()=>{
  await policy.ready();assert.equal(JSON.stringify((await query('SELECT * FROM wallets ORDER BY id')).rows),protectedBefore);
  assert.equal((await policy.summary('legacy')).canSave,true);assert.equal((await policy.summary('old-paid')).canSave,true);assert.equal((await policy.summary('new')).canSave,true);assert.equal((await policy.summary('guest')).canSave,false);
  assert.equal((await query("SELECT source_hash FROM download_legacy_works WHERE work_id='legacy-work'")).rows[0].source_hash,crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal((await query("SELECT source_hash FROM download_legacy_works WHERE work_id='malformed-source'")).rows[0].source_hash,null);
  assert.deepEqual((await query("SELECT job_ids FROM download_legacy_works WHERE work_id='malformed-layers'")).rows[0].job_ids,[]);
 });
 await check('activation is idempotent and later buyers do not acquire grandfathered saving',async()=>{
  await query("INSERT INTO payments VALUES('new-payment','guest')");await factory(pool,{prepareSavedWorks:store.getSavedWorkRetentionPolicy}).ready();assert.equal((await policy.summary('guest')).canSave,false);
  assert.equal((await query('SELECT count(*)::int AS n FROM download_policy')).rows[0].n,1);
 });
 await check('work identity checks both wallet ownership and exact original bytes',async()=>{
  const work=await policy.beginWork('new',bytes);assert.equal(await policy.beginWork('new',bytes,work),work);
  await assert.rejects(policy.beginWork('foreign',bytes,work),e=>e.status===409);await assert.rejects(policy.beginWork('new',Buffer.from('other'),work),e=>e.status===409);
  await job('foreign-job','foreign');await assert.rejects(policy.attach('new',work,'foreign-job'),e=>e.status===404);assert.equal((await query("SELECT count(*)::int AS n FROM download_work_jobs WHERE job_id='foreign-job'")).rows[0].n,0);
 });
 await check('grandfathered saved-work descendants retain rights without a client header or another credit',async()=>{
  const work=await policy.beginWork('legacy',bytes,'','legacy-work');await job('legacy-descendant','legacy');await policy.attach('legacy',work,'legacy-descendant');
  assert.equal(await policy.allowed('legacy','legacy-descendant'),true);assert.equal((await policy.redeem('legacy','legacy-descendant')).reused,true);
  assert.deepEqual(await policy.suits('legacy','legacy-descendant',['/a','/b','/c','/d']),{limited:false,choices:[]});assert.equal(await policy.premiumHair('legacy','legacy-descendant'),false);
  await assert.rejects(policy.beginWork('foreign',bytes,'','legacy-work'),e=>e.status===409);await assert.rejects(policy.allowed('foreign','legacy-descendant'),e=>e.status===404);
  await assert.rejects(policy.beginWork('legacy',Buffer.from('different'),'','legacy-work'),e=>e.status===409);
 });
 await check('old paid images keep unlimited clothing with no current credit or premium grant',async()=>{
  assert.equal(await policy.allowed('old-paid','old-paid-job'),true);assert.deepEqual(await policy.suits('old-paid','old-paid-job',['/a','/b','/c','/d']),{limited:false,choices:[]});assert.equal((await policy.redeem('old-paid','old-paid-job')).reused,true);assert.equal(await policy.premiumHair('old-paid','old-paid-job'),false);
 });
 await check('one credit unlocks the entire owned work and retries cannot consume another',async()=>{
  const work=await policy.beginWork('new',bytes);for(const id of ['group-a','group-b']){await job(id);await policy.attach('new',work,id)}
  assert.equal(await policy.allowed('new','group-a'),false);assert.equal((await policy.redeem('new','group-a')).reused,false);assert.equal((await policy.redeem('new','group-b')).reused,true);assert.equal(await policy.allowed('new','group-b'),true);
  const wallet=await balance('new');assert.equal(wallet.generation_remaining,0);assert.equal(wallet.hair_remaining,1);assert.equal(wallet.credits,99);assert.equal(wallet.full_edit_remaining,7);
  assert.equal((await query("SELECT count(*)::int AS n FROM credit_usage WHERE wallet_id='new'")).rows[0].n,1);
  assert.equal(await policy.premiumHair('new','group-b'),false);assert.equal(await policy.premiumWork('foreign',work),false);
 });
 await check('basic paid work enforces three distinct suits across all renders and rolls back an over-limit batch',async()=>{
  const first=await policy.suits('new','group-a',['/a','/b']);assert.equal(first.limit,3);assert.deepEqual(first.choices,['/a','/b']);
  const third=await policy.suits('new','group-b',['/b','/c']);assert.equal(third.limit,3);assert.deepEqual(third.choices,['/a','/b','/c']);
  await assert.rejects(policy.suits('new','group-a',['/d','/e']),e=>e.status===409&&e.message.includes('3 ชุด'));
  assert.deepEqual(await policy.suits('new','group-b',['/a']),{limited:true,limit:3,choices:['/a','/b','/c']});
 });
 await check('premium upgrade expands the existing work to five suits without resetting choices or credits',async()=>{
  const before=await balance('new');await query("INSERT INTO premium_hair_unlocks VALUES('new','group-a')");
  assert.equal(await policy.premiumHair('new','group-b'),true);
  assert.deepEqual(await policy.suits('new','group-b'),{limited:true,choices:['/a','/b','/c'],limit:5});
  assert.deepEqual(await policy.suits('new','group-b',['/d']),{limited:true,choices:['/a','/b','/c','/d'],limit:5});
  assert.deepEqual(await policy.suits('new','group-a',['/e']),{limited:true,choices:['/a','/b','/c','/d','/e'],limit:5});
  await assert.rejects(policy.suits('new','group-b',['/f']),e=>e.status===409&&e.message.includes('5 ชุด'));
  assert.deepEqual(await policy.suits('new','group-b',['/b']),{limited:true,choices:['/a','/b','/c','/d','/e'],limit:5});
  assert.deepEqual(await balance('new'),before);
 });
 await check('existing premium works start with five slots while unrelated basic89 and historic119 works stay at three',async()=>{
  for(const offer of ['basic89','historic119','existing159']){
   const work=await policy.beginWork('new',bytes);const id='offer-'+offer;await job(id);await policy.attach('new',work,id);
   await query('INSERT INTO paid_image_unlocks(wallet_id,job_id,full_edit) VALUES($1,$2,true)',['new',id]);
   if(offer==='existing159')await query('INSERT INTO premium_hair_unlocks VALUES($1,$2)',['new',id]);
   else await query('INSERT INTO premium_hair_unlocks VALUES($1,$2)',['foreign',id]);
   const limit=offer==='existing159'?5:3,paths=Array.from({length:limit},(_,i)=>'/'+offer+'-'+i);
   assert.deepEqual(await policy.suits('new',id,paths),{limited:true,choices:paths,limit});
   await assert.rejects(policy.suits('new',id,['/over-'+offer]),e=>e.status===409&&e.message.includes(limit+' ชุด'));
   assert.deepEqual((await policy.suits('new',id,[paths[0]])).choices,paths);
  }
 });
 await check('suit limits preserve ownership and completed-job checks before reading or changing choices',async()=>{
  const before=(await query('SELECT wallet_id,scope,choices FROM download_suit_choices ORDER BY wallet_id,scope')).rows;
  for(const [wallet,id] of [['foreign','group-a'],['new','foreign-job'],['new','missing-job']])await assert.rejects(policy.suits(wallet,id,['/forbidden']),e=>e.status===404);
  await job('incomplete-suit','new','free_fixture','processing');await assert.rejects(policy.suits('new','incomplete-suit',['/forbidden']),e=>e.status===404);
  assert.deepEqual((await query('SELECT wallet_id,scope,choices FROM download_suit_choices ORDER BY wallet_id,scope')).rows,before);
 });
 await check('a failed earlier render cannot hide a later premium unlock for the same work',async()=>{
  const work=await policy.beginWork('new',bytes);await job('premium-failed','new','free_earlier','failed');await policy.attach('new',work,'premium-failed');await job('premium-completed');await policy.attach('new',work,'premium-completed');
  assert.equal(await policy.premiumWork('new',work),false);await query("INSERT INTO premium_hair_unlocks VALUES('new','premium-completed')");assert.equal(await policy.premiumWork('new',work),true);assert.equal(await policy.premiumWork('foreign',work),false);
 });
 await check('unrelated works remain locked and depleted balance never goes negative',async()=>{
  for(const id of ['separate-a','separate-b']){const work=await policy.beginWork('new',bytes);await job(id);await policy.attach('new',work,id)}
  assert.equal(await policy.allowed('new','separate-a'),false);assert.equal((await policy.redeem('new','separate-a')).ok,true);assert.equal((await balance('new')).hair_remaining,0);
  assert.deepEqual(await policy.redeem('new','separate-b'),{ok:false,error:'download_credit_required'});assert.equal((await balance('new')).generation_remaining,0);assert.equal((await balance('new')).hair_remaining,0);
 });
 await check('guest claims transfer the complete owned work and preserve source isolation',async()=>{
  const work=await policy.beginWork('guest',bytes);for(const id of ['guest-a','guest-b']){await job(id,'guest');await policy.attach('guest',work,id)}
  await policy.claim('guest','target','guest-a');for(const id of ['guest-a','guest-b']){assert.equal((await query('SELECT wallet_id FROM ai_jobs WHERE id=$1',[id])).rows[0].wallet_id,'target');await assert.rejects(policy.allowed('guest',id),e=>e.status===404);assert.equal(await policy.allowed('target',id),false)}
  assert.equal(await policy.beginWork('target',bytes,work),work);await assert.rejects(policy.beginWork('guest',bytes,work),e=>e.status===409);
 });
 await check('batched saved-work rights preserve completed ownership and grouped payment proof',async()=>{
  assert.equal(await policy.allowedJobs('legacy',['legacy-descendant']),true);assert.equal(await policy.allowedJobs('old-paid',['old-paid-job']),true);
  assert.equal(await policy.allowedJobs('new',['group-a','group-b','group-a']),true);assert.equal(await policy.allowedJobs('new',['group-a','separate-b']),false);
  assert.equal(await policy.allowedJobs('foreign',['group-a']),false);assert.equal(await policy.allowedJobs('new',['missing']),false);assert.equal(await policy.allowedJobs('new',[]),false);
  for(const status of ['queued','processing','failed']){const id='unready-'+status;await job(id,'new','use_paid',status);assert.equal(await policy.allowedJobs('new',[id]),false)}
  const ids=Array.from({length:20},(_,i)=>'paid-head-'+i);for(const id of ids)await job(id,'old-paid','use_old');
  const before=queries.length;assert.equal(await policy.allowedJobs('old-paid',ids),true);assert.equal(queries.length-before,1);assert(!/\b(?:result|image|project)\b/.test(queries.at(-1)));
 });
 await check('saved-work ownership, three-work quota, immutable 45 days and expired tombstones remain enforced',async()=>{
  const saved=await store.saveWork('retention','',project());const before=(await store.getWork('retention',saved.id));assert.equal(new Date(before.expires_at)-new Date(before.retention_started_at),45*86400000);
  await store.saveWork('retention',saved.id,project('legacy-job',{note:'edited'}));assert.equal(new Date((await store.getWork('retention',saved.id)).expires_at).getTime(),new Date(before.expires_at).getTime());
  assert.equal(await store.getWork('foreign',saved.id),null);assert.equal(await store.saveWork('foreign',saved.id,project()),null);assert.equal(await store.deleteWork('foreign',saved.id),null);
  await store.saveWork('retention','',project());await store.saveWork('retention','',project());await assert.rejects(store.saveWork('retention','',project()),e=>e.code==='saved_work_limit');
  await query("UPDATE saved_studio_work SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[saved.id]);assert.equal((await store.listWorks('retention')).length,2);await assert.rejects(store.getWork('retention',saved.id),e=>e.code==='saved_work_expired');
  await store.saveWork('retention','',project());assert.equal(await store.purgeExpiredWorks({limit:100}),1);await assert.rejects(store.saveWork('retention',saved.id,project()),e=>e.code==='saved_work_expired');await assert.rejects(store.getWork('retention',saved.id),e=>e.code==='saved_work_expired');
 });
 console.log(JSON.stringify({passed:cases.length,cases,scope:'actual download-policy and saved-work SQL on isolated PostgreSQL WASM; no production database, customer writes or charges',limits:'single PostgreSQL session; native concurrent transaction behavior is not exercised'}));
}finally{await db.close()}
