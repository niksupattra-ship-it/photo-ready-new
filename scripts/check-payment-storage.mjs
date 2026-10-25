import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PACKAGES,packageFor,remaining} from '../package-rules.js';

// Optional test dependency only: PGLITE_MODULE may point to a temporary install.
// All SQL executes in an in-memory PostgreSQL engine; DATABASE_URL is ignored.
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),queries=[];
const paymentSource=await readFile(new URL('../payment-store.js',import.meta.url),'utf8');
const jobSource=await readFile(new URL('../job-store.js',import.meta.url),'utf8');
const pool={query:async(sql,params=[])=>{queries.push(sql);const result=await db.query(sql,params);return {...result,rowCount:result.rowCount??result.affectedRows??result.rows.length}},connect:async()=>({...pool,release(){}})};
const pg={Pool:class{constructor(){return pool}}};
const processFixture={env:{DATABASE_URL:'postgres://localhost/isolated-test',PGSSLMODE:'disable'}};
function load(source,names){return new Function('crypto','pg','packageFor','remaining','process',source.replace(/^import .*;\n/gm,'').replace(/export /g,'')+'\nreturn {'+names.join(',')+'};')(crypto,pg,packageFor,remaining,processFixture)}
const storeNames=['newWallet','getWallet','creditPaid','reserveCredit','commitCredit','refundCredit','imageEntitlements','currentPaymentSchema','ready'];
const store=load(paymentSource,storeNames),jobs=load(jobSource,['createAiJob','claimAiJob','completeAiJob','settleAiJobDelivery']);
let passed=0;
async function check(name,run){await run();passed++;console.log('PASS '+name)}
const row=async(sql,params=[])=> (await db.query(sql,params)).rows[0];
try{
 await check('fresh schema initializes all payment and premium tables',async()=>{await store.newWallet();assert.equal(await store.currentPaymentSchema(),true);assert(await row("SELECT 1 FROM pg_class WHERE relname='premium_hair_unlocks'"))});
 await check('download payment persists its selected image without adding or rewriting credits',async()=>{
  const out=await store.creditPaid('walletA','pi_download','download_119_v1','jobA');assert.equal(out.duplicate,false);assert.equal(out.processRemaining,0);assert.deepEqual(out.unlockedJobIds,['jobA']);assert.deepEqual(out.editableJobIds,['jobA']);
  assert.deepEqual(await row('SELECT generation_remaining,hair_remaining,full_edit_remaining FROM wallets WHERE id=$1',['walletA']),{generation_remaining:0,hair_remaining:0,full_edit_remaining:0});
 });
 await check('repeated callback/poll deliveries grant only once and cannot unlock a second image',async()=>{
  for(let i=0;i<10;i++){const out=await store.creditPaid('walletA','pi_download','download_119_v1','jobB');assert.equal(out.duplicate,true);assert.deepEqual(out.unlockedJobIds,['jobA'])}
  assert.equal((await row('SELECT count(*)::int AS n FROM payments WHERE wallet_id=$1',['walletA'])).n,1);
 });
 await check('159 payment persists premium hair rights and replay preserves one premium unlock',async()=>{
  for(let i=0;i<3;i++)await store.creditPaid('walletA','pi_premium','download_159_hair_v1','jobA');
  assert.equal((await row('SELECT count(*)::int AS n FROM premium_hair_unlocks WHERE wallet_id=$1 AND job_id=$2',['walletA','jobA'])).n,1);
  assert.equal((await row('SELECT count(*)::int AS n FROM payments WHERE wallet_id=$1',['walletA'])).n,2);
 });
 await check('all historical package grants retain original generation/hair/full-edit quantities',async()=>{
  for(const [id,offer] of Object.entries(PACKAGES)){
   const wallet='historical_'+id;await store.creditPaid(wallet,'cs_'+id,id,offer.requiresImage?'legacy_job':'');
   assert.deepEqual(await row('SELECT generation_remaining,hair_remaining,full_edit_remaining FROM wallets WHERE id=$1',[wallet]),{generation_remaining:offer.g,hair_remaining:offer.h,full_edit_remaining:offer.fullEdit?offer.g+offer.h:0});
   const before=await row('SELECT * FROM wallets WHERE id=$1',[wallet]);await store.creditPaid(wallet,'cs_'+id,id,offer.requiresImage?'legacy_job':'');assert.deepEqual(await row('SELECT * FROM wallets WHERE id=$1',[wallet]),before);
  }
 });
 await check('failed grants roll back the payment ledger and wallet changes together',async()=>{
  await assert.rejects(store.creditPaid('rollback_wallet','pi_rollback','download_119_v1',''));
  assert.equal((await row('SELECT count(*)::int AS n FROM payments WHERE session_id=$1',['pi_rollback'])).n,0);
  assert.equal((await row('SELECT count(*)::int AS n FROM wallets WHERE id=$1',['rollback_wallet'])).n,0);
 });
 await check('reservation cannot overdraw the available paid quantity',async()=>{
  await store.creditPaid('credits','cs_credits','79_v2');const first=await store.reserveCredit('credits','portrait');assert(first);assert.equal(await store.reserveCredit('credits','portrait'),null);
  assert.equal((await row('SELECT generation_remaining FROM wallets WHERE id=$1',['credits'])).generation_remaining,0);
 });
 await check('refund restores the exact paid column and full-edit allowance once',async()=>{
  const usage=await row('SELECT id FROM credit_usage WHERE wallet_id=$1',['credits']);queries.length=0;
  assert.equal(await store.refundCredit(usage.id),true);
  const walletLock=queries.findIndex(sql=>/SELECT id FROM wallets.*FOR UPDATE/.test(sql)),usageLock=queries.findIndex(sql=>/FROM credit_usage.*FOR UPDATE/.test(sql));assert(walletLock>=0&&usageLock>walletLock,'refund must lock wallet before usage');
  assert.equal(await store.refundCredit(usage.id),false);assert.deepEqual(await row('SELECT generation_remaining,full_edit_remaining FROM wallets WHERE id=$1',['credits']),{generation_remaining:1,full_edit_remaining:1});
 });
 await check('delivery confirmation commits paid credit and prevents later refund/cancel',async()=>{
  const usage=await store.reserveCredit('credits','portrait');const id=await jobs.createAiJob({walletId:'credits',usageId:usage.usageId,image:{buffer:Buffer.from('fixture')}});await jobs.claimAiJob(id);await jobs.completeAiJob(id,Buffer.from('output'));
  assert.equal((await jobs.settleAiJobDelivery(id,'credits','confirm')).status,200);assert.equal(await store.refundCredit(usage.usageId),false);assert.equal((await jobs.settleAiJobDelivery(id,'credits','cancel')).status,409);
 });
 await check('delivery cancellation locks wallet before usage and restores paid credit once',async()=>{
  await store.creditPaid('cancel_wallet','cs_cancel','79_v2');const usage=await store.reserveCredit('cancel_wallet','portrait');const id=await jobs.createAiJob({walletId:'cancel_wallet',usageId:usage.usageId,image:{buffer:Buffer.from('fixture')}});
  queries.length=0;assert.equal((await jobs.settleAiJobDelivery(id,'cancel_wallet','cancel')).status,200);
  const walletLock=queries.findIndex(sql=>/SELECT id FROM wallets.*FOR UPDATE/.test(sql)),usageLock=queries.findIndex(sql=>/FROM credit_usage.*FOR UPDATE/.test(sql));assert(walletLock>=0&&usageLock>walletLock,'cancellation must lock wallet before usage');
  assert.equal((await jobs.settleAiJobDelivery(id,'cancel_wallet','cancel')).status,200);assert.equal(await store.refundCredit(usage.usageId),false);assert.deepEqual(await row('SELECT generation_remaining,full_edit_remaining FROM wallets WHERE id=$1',['cancel_wallet']),{generation_remaining:1,full_edit_remaining:1});
 });
 await check('legacy 159 full-edit repair is idempotent and its reserved credit refunds fully',async()=>{
  await store.creditPaid('legacy159','cs_legacy159','159_v6');
  await db.query('UPDATE payments SET full_edit_reconciled=false WHERE session_id=$1',['cs_legacy159']);await db.query('UPDATE wallets SET full_edit_remaining=0 WHERE id=$1',['legacy159']);
  await store.imageEntitlements('legacy159');await store.imageEntitlements('legacy159');assert.equal((await row('SELECT full_edit_remaining FROM wallets WHERE id=$1',['legacy159'])).full_edit_remaining,10);
  const usage=await store.reserveCredit('legacy159','portrait');assert.equal(await store.refundCredit(usage.usageId),true);assert.equal((await row('SELECT full_edit_remaining FROM wallets WHERE id=$1',['legacy159'])).full_edit_remaining,10);
 });
 await check('a current old database missing premium hair table is repaired before a 159 grant',async()=>{
  await db.query('DROP TABLE premium_hair_unlocks');const restarted=load(paymentSource,storeNames);assert.equal(await restarted.currentPaymentSchema(),false);
  const out=await restarted.creditPaid('post_restart','pi_postrestart','download_159_hair_v1','job_premium');assert.equal(out.duplicate,false);assert.equal((await row('SELECT count(*)::int AS n FROM premium_hair_unlocks WHERE wallet_id=$1',['post_restart'])).n,1);assert.equal(await restarted.currentPaymentSchema(),true);
 });
 await check('mixed-case historical statuses normalize safely before the lifecycle CHECK is installed',async()=>{
  await db.query('ALTER TABLE credit_usage DROP CONSTRAINT credit_usage_status_check');await db.query("INSERT INTO credit_usage(id,wallet_id,kind,status,credit_column) VALUES('mixed_case','credits','portrait','COMPLETED','generation_remaining')");
  const restarted=load(paymentSource,storeNames);await restarted.ready();assert.equal((await row("SELECT status FROM credit_usage WHERE id='mixed_case'")).status,'completed');assert.equal(await restarted.currentPaymentSchema(),true);
 });
 await check('legacy hair-column reservations return hair credit without changing generation credit',async()=>{
  await store.creditPaid('hair_wallet','cs_hairlegacy','149');const first=await store.reserveCredit('hair_wallet','portrait');await store.commitCredit(first.usageId);const hair=await store.reserveCredit('hair_wallet','hairstyle');await store.refundCredit(hair.usageId);
  assert.deepEqual(await row('SELECT generation_remaining,hair_remaining FROM wallets WHERE id=$1',['hair_wallet']),{generation_remaining:0,hair_remaining:2});
 });
}finally{await db.close()}
console.log(JSON.stringify({passed,scope:'Actual payment/job SQL against isolated in-memory PostgreSQL; repeated delivery, rollback, all frozen packages, lifecycle, migration and lock ordering. No production connections or writes. Single-session engine does not reproduce real concurrent PostgreSQL scheduling.'}));
