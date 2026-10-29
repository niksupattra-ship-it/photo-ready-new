import assert from 'node:assert/strict';
// Disposable PostgreSQL WASM only. Never uses DATABASE_URL or customer data.
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
import {readDownloadHistory,formatDownloadHistory,parseDownloadHistoryArgs} from './check-download-history.mjs';
import {createDownloadAuditStore} from '../download-audit-store.js';
const db=new PGlite(),queries=[];
const client={query:async(sql,args)=>{queries.push(sql);return db.query(sql,args)},release(){}};
const pool={connect:async()=>client};
const now=Date.parse('2026-10-29T00:00:00Z');
let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
const noMutations=()=>assert(!queries.some(sql=>/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql)));
await check('missing schema is read-only and reports unavailable without creating audit tables',async()=>{
 queries.length=0;const out=await readDownloadHistory(client,{email:' Customer@Example.com ',now});
 assert.equal(out.account.status,'schema_unavailable');assert.equal(out.audit.status,'not_installed');noMutations();assert.equal(queries[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
});
await db.exec(`CREATE TABLE users(id text PRIMARY KEY,email text,wallet_id text); CREATE TABLE payments(session_id text, wallet_id text,package_id text,created_at timestamptz);
CREATE TABLE download_payment_receipts(session_id text,wallet_id text,work_scope text,package_id text,overlap boolean,refund_status text,created_at timestamptz);
CREATE TABLE package_unlock_code_redemptions(code_hash text,user_id text,wallet_id text,work_scope text,job_id text,package_id text,created_at timestamptz);
CREATE TABLE premium_download_grants(recipient_hash text,wallet_id text,quantity int);
CREATE TABLE premium_download_redemptions(wallet_id text,work_scope text,job_id text,created_at timestamptz);
CREATE TABLE paid_image_unlocks(wallet_id text,job_id text,full_edit boolean,created_at timestamptz);
CREATE TABLE premium_hair_unlocks(wallet_id text,job_id text);
CREATE TABLE ai_jobs(id text,wallet_id text,status text,usage_id text);
CREATE TABLE download_work_jobs(job_id text,work_id text,wallet_id text);
CREATE TABLE download_works(id text,wallet_id text,legacy_work_id text);
CREATE TABLE download_legacy_works(work_id text,wallet_id text,job_ids text[]);
INSERT INTO users VALUES('u1','customer@example.com','w1'),('u2','foreign@example.com','w2');
INSERT INTO payments VALUES('cs_89','w1','download_89_v1','2026-10-28'),('pi_159','w1','download_159_hair_v1','2026-10-28'),('cs_119','w1','download_119_v1','2026-10-28'),('cs_foreign','w2','download_159_hair_v1','2026-10-28');
INSERT INTO download_payment_receipts VALUES('cs_89','w1','work1','download_89_v1',false,'not_required','2026-10-28');
INSERT INTO package_unlock_code_redemptions VALUES('NEVER_PRINT_CODE_HASH','u1','w1','work2','job2','159','2026-10-28');
INSERT INTO premium_download_grants VALUES('NEVER_PRINT_RECIPIENT_HASH','w1',2);
INSERT INTO premium_download_redemptions VALUES('w1','work3','job3','2026-10-28');
INSERT INTO paid_image_unlocks VALUES('w1','job1',true,'2026-10-28'),('w1','job2',true,'2026-10-28'),('w1','job3',true,'2026-10-28');
INSERT INTO premium_hair_unlocks VALUES('w1','job2'),('w1','job3');
INSERT INTO ai_jobs VALUES('job1','w1','completed','trial_1'),('job2','w1','completed','trial_2'),('job3','w1','completed','trial_3'),('job_foreign','w2','completed','trial_foreign');
INSERT INTO download_works VALUES('work1','w1',NULL),('work2','w1',NULL),('work3','w1',NULL),('work_foreign','w2',NULL);
INSERT INTO download_work_jobs VALUES('job1','work1','w1'),('job2','work2','w1'),('job3','work3','w1'),('job_foreign','work_foreign','w2');`);
await check('payment 89/159/historical119 code/support facts available even with no audit installed',async()=>{
 queries.length=0;const out=await readDownloadHistory(client,{email:'CUSTOMER@EXAMPLE.COM',now});
 assert.equal(out.audit.status,'not_installed');assert.equal(out.sections.payments.rows.length,3);assert.deepEqual(new Set(out.sections.payments.rows.map(x=>x.catalogPrice)),new Set([89,159,119]));
 assert.equal(out.sections.codes.rows[0].evidence,'server_code_redemption');assert.equal(out.sections.supportBalance.remaining,1);assert(out.currentRights.rows.every(x=>x.unlocked));
 assert(out.currentRights.rows.find(x=>x.jobId==='job2').premiumHair);assert(!JSON.stringify(out).includes('NEVER_PRINT'));assert(!JSON.stringify(out).includes('cs_foreign'));noMutations();
});
await createDownloadAuditStore(pool).ready();
const rights={version:1,unlocked:true,paidDownload:true,premiumHair:false,jobs:[{jobId:'job1',workScope:'work1',unlocked:true}]};
await db.query(`INSERT INTO download_attempts(user_id,attempt_id,wallet_id,email_snapshot,job_ids,work_scopes,mode,initiator,browser_family,device_class,latest_rights)
VALUES('u1','attempt_123456','w1','customer@example.com',ARRAY['job1'],ARRAY['work1'],'easy','user','safari','mobile',$1),('u2','foreign_attempt_1','w2','foreign@example.com',ARRAY['job_foreign'],ARRAY['work_foreign'],'studio','user','chrome','desktop',$1)`,[rights]);
for(const [id,observer,type,received,clientAt] of [
 ['srv_1','server','rights_observed','2026-10-28T01:00:00Z',null],
 ['evt_1','client','download_clicked','2026-10-28T01:00:01Z','2026-10-28T01:00:00Z'],
 ['evt_2','client','file_prepared','2026-10-28T01:00:02Z','2026-10-28T01:00:02Z'],
 ['evt_3','client','save_panel_opened','2026-10-28T01:00:03Z','2026-10-28T01:00:03Z'],
 ['evt_4','client','save_clicked','2026-10-28T01:00:04Z','2026-10-28T01:00:04Z'],
 ['evt_5','client','download_failed','2026-10-28T01:00:05Z','2026-10-28T01:00:05Z'],
 ['evt_old','client','share_handoff','2026-01-01T00:00:00Z','2026-10-28T01:00:05Z']
 ])await db.query(`INSERT INTO download_events(user_id,event_id,attempt_id,observer,event_type,client_at,received_at,metadata,rights_snapshot,payload_hash) VALUES('u1',$1,'attempt_123456',$2,$3,$4,$5,$6,$7,'fixture')`,[id,observer,type,clientAt,received,{sizeId:'original',errorCode:type==='download_failed'?'export_failed':null},rights]);
await db.query(`INSERT INTO download_events(user_id,event_id,attempt_id,observer,event_type,received_at,metadata,rights_snapshot,payload_hash) VALUES('u2','foreign_event','foreign_attempt_1','client','share_handoff','2026-10-28','{}',$1,'fixture')`,[rights]);
await check('history scopes current account, labels observer, received time, panel separate from save',async()=>{
 queries.length=0;const out=await readDownloadHistory(client,{email:'customer@example.com',now});
 assert.equal(out.audit.rows.length,6);assert.equal(out.observations.saveLinkClicks,1);assert.equal(out.observations.shareHandoffs,0);assert.equal(out.observations.serverRightsObservations,1);assert.equal(out.observations.reportedFailures,1);
 assert.equal(out.audit.rows.find(x=>x.type==='save_panel_opened').observer,'client');assert.equal(out.audit.rows.find(x=>x.type==='rights_observed').observer,'server');assert(!JSON.stringify(out).includes('foreign_event'));assert(formatDownloadHistory(out).includes('ไม่ได้ยืนยันว่าไฟล์อยู่ในเครื่อง'));noMutations();
});
await check('bounded rows and explicit truncation, counts are only returned events',async()=>{
 const out=await readDownloadHistory(client,{email:'customer@example.com',now,limit:2});assert(out.audit.truncated);assert(out.sections.payments.truncated);assert.equal(out.audit.rows.length,2);assert.equal(out.observations.scope,'returned_events_only');
});
await check('renamed/deleted account retains prior snapshot history without reading foreign ledgers',async()=>{
 await db.query("UPDATE users SET email='renamed@example.com' WHERE id='u1'");queries.length=0;
 const out=await readDownloadHistory(client,{email:'customer@example.com',now});assert.equal(out.account.status,'not_found');assert.equal(out.audit.rows.length,6);assert.equal(out.sections.payments.status,'account_unavailable');noMutations();
});
await check('ambiguous normalized identity never merges accounts',async()=>{
 await db.query("INSERT INTO users VALUES('u3','RENAMED@example.com','w3')");queries.length=0;const out=await readDownloadHistory(client,{email:'renamed@example.com',now});assert.equal(out.account.status,'ambiguous_email');assert.equal(out.audit.status,'ambiguous_email');assert.equal(out.audit.rows.length,0);assert.equal(out.sections.payments.status,'account_unavailable');noMutations();
});
await check('safe argument parsing bounds window and rejects arbitrary SQL-like input',async()=>{
 assert.deepEqual(parseDownloadHistoryArgs(['--email','customer@example.com','--days','45','--json']),{email:'customer@example.com',days:45,json:true,help:false});
 assert.throws(()=>parseDownloadHistoryArgs(['--email','x@x.test','--days','366']));assert.throws(()=>parseDownloadHistoryArgs(['--email','x@x.test','--drop']));assert.throws(()=>parseDownloadHistoryArgs(['--email','invalid']));
});
await db.close();console.log(JSON.stringify({passed,productionAccess:false,readOnly:true}));
