#!/usr/bin/env node
// Support-only inspection. Never initializes storage or changes customer rights.
import {pathToFileURL} from 'node:url';
import {PACKAGES} from '../package-rules.js';
import {readDownloadAuditRights} from '../download-audit-store.js';

const TABLES=['users','payments','download_payment_receipts','package_unlock_code_redemptions','premium_download_grants','premium_download_redemptions','paid_image_unlocks','premium_hair_unlocks','ai_jobs','download_work_jobs','download_works','download_legacy_works','download_attempts','download_events'];
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ROWS=500;
const normalizeEmail=value=>String(value||'').trim().toLowerCase();
const bounded=(rows,limit)=>({rows:rows.slice(0,limit),truncated:rows.length>limit});
const iso=value=>value instanceof Date?value.toISOString():value==null?null:String(value);
const product=id=>({packageId:id,catalogPrice:PACKAGES[id]?.price??(['89','159'].includes(id)?Number(id):null),packageName:PACKAGES[id]?.name??(id==='89'?'รับรูปนี้':id==='159'?'รับรูปนี้ + ทรงผม':null)});
const EVENT_LABELS={rights_observed:'เซิร์ฟเวอร์ตรวจสิทธิ์ ณ เวลารับเหตุการณ์',download_clicked:'ผู้ใช้กดดาวน์โหลด',file_prepared:'หน้าเว็บรายงานว่าสร้างไฟล์พร้อมส่งแล้ว',save_panel_opened:'แสดงหน้าบันทึกภาพ',download_requested:'ส่งคำขอดาวน์โหลดให้เบราว์เซอร์',save_clicked:'ผู้ใช้กดลิงก์บันทึกภาพ',share_clicked:'ผู้ใช้กดแชร์',share_handoff:'ส่งภาพต่อให้ระบบแชร์แล้ว',share_cancelled:'ผู้ใช้ยกเลิกแชร์',download_failed:'หน้าเว็บรายงานข้อผิดพลาด',panel_closed:'ปิดหน้าบันทึกภาพ',crop_cancelled:'ยกเลิกเลือกขนาดภาพ',rights_blocked:'หน้าเว็บยังไม่ผ่านขั้นตอนอนุญาตส่งภาพ'};
const thaiTime=value=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(value));

async function catalog(client){
 const {rows}=await client.query(`SELECT t.name,a.attname FROM unnest($1::text[]) AS t(name)
  JOIN pg_attribute a ON a.attrelid=to_regclass(t.name) AND a.attnum>0 AND NOT a.attisdropped`,[TABLES]);
 const columns=new Map();for(const row of rows){if(!columns.has(row.name))columns.set(row.name,new Set());columns.get(row.name).add(row.attname)}
 return {columns,has:(name,required=[])=>columns.has(name)&&required.every(col=>columns.get(name).has(col))};
}

export async function readDownloadHistory(client,{email,days=30,now=Date.now(),limit=MAX_ROWS}={}){
 email=normalizeEmail(email);
 if(email.length>254||!EMAIL.test(email))throw Object.assign(Error('invalid_email'),{code:'invalid_email'});
 if(!Number.isInteger(days)||days<1||days>365||!Number.isFinite(now))throw Object.assign(Error('invalid_window'),{code:'invalid_window'});
 limit=Math.max(1,Math.min(MAX_ROWS,Math.trunc(limit)||MAX_ROWS));
 const since=new Date(now-days*86400000).toISOString();
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  await client.query("SET LOCAL statement_timeout='3000ms'");
  await client.query("SET LOCAL lock_timeout='500ms'");
  await client.query("SET LOCAL idle_in_transaction_session_timeout='15000ms'");
  const schema=await catalog(client),has=schema.has;
  let account={status:'schema_unavailable'},userIds=[],wallet=null;
  if(has('users',['id','email','wallet_id'])){
   const rows=(await client.query('SELECT id,email,wallet_id FROM users WHERE lower(btrim(email))=$1 ORDER BY id LIMIT 2',[email])).rows;
   if(rows.length>1)account={status:'ambiguous_email'};
   else if(rows.length===1){const row=rows[0];account={status:'found',userId:row.id,email:row.email,walletId:row.wallet_id};userIds=[row.id];wallet=row.wallet_id}
   else account={status:'not_found'};
  }
  const sections={},skipped=[];
  const section=async(name,table,required,sql,args=[],map=row=>row)=>{
   if(!has(table,required)){sections[name]={status:'schema_unavailable',rows:[],truncated:false};skipped.push(table);return}
   const rows=(await client.query(sql,args)).rows;
   sections[name]={status:'available',...bounded(rows.map(map),limit)};
  };
  if(wallet){
   const args=[wallet,since,limit+1];
   await section('payments','payments',['session_id','wallet_id','package_id','created_at'],
    'SELECT session_id,package_id,created_at FROM payments WHERE wallet_id=$1 AND created_at>=$2 ORDER BY created_at DESC,session_id LIMIT $3',args,
    row=>({...product(row.package_id),reference:row.session_id,at:iso(row.created_at),evidence:'server_payment_ledger'}));
   await section('receipts','download_payment_receipts',['session_id','wallet_id','work_scope','package_id','overlap','refund_status','created_at'],
    'SELECT session_id,work_scope,package_id,overlap,refund_status,created_at FROM download_payment_receipts WHERE wallet_id=$1 AND created_at>=$2 ORDER BY created_at DESC,session_id LIMIT $3',args,
    row=>({...product(row.package_id),reference:row.session_id,workScope:row.work_scope,overlap:row.overlap,refundStatus:row.refund_status,at:iso(row.created_at),evidence:'server_unlock_receipt'}));
   await section('codes','package_unlock_code_redemptions',['wallet_id','work_scope','job_id','package_id','created_at'],
    'SELECT work_scope,job_id,package_id,created_at FROM package_unlock_code_redemptions WHERE wallet_id=$1 AND created_at>=$2 ORDER BY created_at DESC,work_scope,job_id LIMIT $3',args,
    row=>({...product(row.package_id),workScope:row.work_scope,jobId:row.job_id,at:iso(row.created_at),evidence:'server_code_redemption'}));
   await section('supportRedemptions','premium_download_redemptions',['wallet_id','work_scope','job_id','created_at'],
    'SELECT work_scope,job_id,created_at FROM premium_download_redemptions WHERE wallet_id=$1 AND created_at>=$2 ORDER BY created_at DESC,work_scope LIMIT $3',args,
    row=>({workScope:row.work_scope,jobId:row.job_id,at:iso(row.created_at),evidence:'server_support_credit_redemption'}));
   await section('imageUnlocks','paid_image_unlocks',['wallet_id','job_id','full_edit','created_at'],
    'SELECT job_id,full_edit,created_at FROM paid_image_unlocks WHERE wallet_id=$1 AND created_at>=$2 ORDER BY created_at DESC,job_id LIMIT $3',args,
    row=>({jobId:row.job_id,fullEdit:row.full_edit,at:iso(row.created_at),evidence:'server_image_grant'}));
   if(has('premium_download_grants',['wallet_id','quantity'])&&has('premium_download_redemptions',['wallet_id'])){
    const row=(await client.query(`SELECT
     (SELECT COALESCE(SUM(quantity),0)::int FROM premium_download_grants WHERE wallet_id=$1) AS granted,
     (SELECT COUNT(*)::int FROM premium_download_redemptions WHERE wallet_id=$1) AS redeemed`,[wallet])).rows[0];
    sections.supportBalance={status:'available',scope:'lifetime',granted:Number(row.granted),redeemed:Number(row.redeemed),remaining:Math.max(0,Number(row.granted)-Number(row.redeemed)),evidence:'server_support_credit_ledger'};
   }else sections.supportBalance={status:'schema_unavailable'};
  }else{
   for(const name of ['payments','receipts','codes','supportRedemptions','imageUnlocks','supportBalance'])sections[name]={status:'account_unavailable',rows:[],truncated:false};
  }

  const auditInstalled=has('download_attempts',['user_id','attempt_id','email_snapshot','wallet_id','job_ids','work_scopes','mode','initiator','browser_family','device_class'])&&has('download_events',['id','user_id','event_id','attempt_id','observer','event_type','client_at','received_at','metadata','rights_snapshot']);
  let events={status:'not_installed',rows:[],truncated:false};
  if(auditInstalled&&account.status!=='ambiguous_email'){
   // A preserved snapshot can be inspected even if the account was renamed or
   // removed. It never selects another wallet for current business-ledger reads.
   const rows=(await client.query(`WITH audit_users AS (
     SELECT unnest($1::text[]) AS user_id UNION SELECT DISTINCT user_id FROM download_attempts WHERE email_snapshot=$2
    ) SELECT e.event_id,e.attempt_id,e.observer,e.event_type,e.client_at,e.received_at,e.metadata,e.rights_snapshot,
     a.user_id,a.wallet_id,a.email_snapshot,a.job_ids,a.work_scopes,a.mode,a.initiator,a.browser_family,a.device_class
    FROM download_events e JOIN download_attempts a ON a.user_id=e.user_id AND a.attempt_id=e.attempt_id
    WHERE e.user_id IN (SELECT user_id FROM audit_users) AND e.received_at>=$3
    ORDER BY e.received_at DESC,e.id DESC LIMIT $4`,[userIds,email,since,limit+1])).rows;
   events={status:'available',...bounded(rows.map(row=>({eventId:row.event_id,attemptId:row.attempt_id,observer:row.observer,type:row.event_type,label:EVENT_LABELS[row.event_type]||row.event_type,receivedAt:iso(row.received_at),clientAt:iso(row.client_at),metadata:row.metadata,rights:row.rights_snapshot,userId:row.user_id,walletId:row.wallet_id,emailSnapshot:row.email_snapshot,jobIds:row.job_ids,workScopes:row.work_scopes,mode:row.mode,initiator:row.initiator,browserFamily:row.browser_family,deviceClass:row.device_class})),limit)};
  }else if(account.status==='ambiguous_email')events.status='ambiguous_email';

  // Present rights are a fresh, read-only view of up to 20 candidate jobs;
  // historical rights at an event's receive time remain in that event snapshot.
  const jobIds=wallet?[...new Set([
   ...events.rows.filter(row=>row.walletId===wallet).flatMap(row=>row.jobIds),
   ...sections.codes.rows.map(row=>row.jobId),...sections.supportRedemptions.rows.map(row=>row.jobId),...sections.imageUnlocks.rows.map(row=>row.jobId)
  ])]:[];
  let currentRights={status:wallet?'no_candidate_jobs':'account_unavailable',rows:[],truncated:jobIds.length>20};
  if(wallet&&jobIds.length&&has('ai_jobs',['id','wallet_id','status','usage_id'])){
   const candidates=(await client.query("SELECT id FROM ai_jobs WHERE wallet_id=$1 AND id=ANY($2::text[]) AND status='completed' ORDER BY id LIMIT 21",[wallet,jobIds.slice(0,MAX_ROWS)])).rows.map(row=>row.id);
   if(candidates.length){
    await client.query('SAVEPOINT audit_rights_read');
    try{
     const observed=await readDownloadAuditRights(client,wallet,candidates.slice(0,20));
     currentRights={status:'available',scope:'current_database_grants_without_request_owner_or_saved_work_override',rows:observed.snapshot.jobs,truncated:jobIds.length>20||candidates.length>20};
     await client.query('RELEASE SAVEPOINT audit_rights_read');
    }catch{
     await client.query('ROLLBACK TO SAVEPOINT audit_rights_read');await client.query('RELEASE SAVEPOINT audit_rights_read');
     currentRights={status:'source_unavailable',rows:[],truncated:jobIds.length>20};
    }
   }else currentRights.status='source_no_longer_available';
  }
  const count=type=>events.rows.filter(row=>row.type===type&&row.observer==='client').length;
  const report={version:1,generatedAt:new Date(now).toISOString(),requestedEmail:email,since,days,limits:{rowsPerSection:limit,currentRightsJobs:20},account,
   sections,currentRights,audit:events,observations:{scope:'returned_events_only',serverRightsObservations:events.rows.filter(row=>row.type==='rights_observed'&&row.observer==='server').length,userClicks:count('download_clicked'),filesPrepared:count('file_prepared'),browserDownloadRequests:count('download_requested'),saveLinkClicks:count('save_clicked'),shareHandoffs:count('share_handoff'),reportedFailures:count('download_failed'),rightsBlocked:count('rights_blocked')},
   limitations:['Client events are reports from a browser, not filesystem receipts. A save/share request does not prove a file was saved or retained on the device.','Missing events mean no evidence was received; they do not prove that a customer did not click or that a system error did not happen.','Server rights reflect database state at receive time. They do not prove rights at an earlier client timestamp, nor independently confirm a bank charge.','No historical download events are backfilled. Time-window or truncated output is not the complete account history.','Use the work scope and entitlement source to investigate; this report never changes rights, credits, refunds or support decisions.']};
  if(skipped.length)report.schemaWarnings=[...new Set(skipped)];
  await client.query('COMMIT');return report;
 }catch(error){try{await client.query('ROLLBACK')}catch{}throw error}
}

export function formatDownloadHistory(report){
 const lines=[`บัญชี: ${report.requestedEmail}`,`ตรวจเมื่อ: ${thaiTime(report.generatedAt)} (เวลาไทย)`, `ช่วงประวัติ: ${thaiTime(report.since)} เป็นต้นมา (${report.days} วัน)`, `สถานะบัญชี: ${report.account.status}`];
 if(report.account.status==='ambiguous_email')lines.push('พบอีเมลที่ตรงกันมากกว่าหนึ่งบัญชี จึงไม่รวมข้อมูลต่างบัญชีเข้าด้วยกัน');
 for(const [name,label] of Object.entries({payments:'รายการในบัญชีรับชำระ',receipts:'หลักฐานปลดล็อกจากการชำระ',codes:'การใช้โค้ด',supportRedemptions:'การใช้สิทธิ์ชดเชย',imageUnlocks:'สิทธิ์ภาพที่ให้แล้ว'})){
  const section=report.sections[name];lines.push(`\n${label}: ${section.status} (${section.rows.length} รายการ${section.truncated?' — ยังมีรายการอื่นนอกผลลัพธ์':''})`);
  for(const row of section.rows)lines.push('  '+JSON.stringify(row));
 }
 lines.push('\nสิทธิ์ชดเชยคงเหลือ (ตลอดอายุบัญชี): '+JSON.stringify(report.sections.supportBalance));
 lines.push('สิทธิ์ปัจจุบันของงานที่ตรวจ: '+JSON.stringify(report.currentRights));
 lines.push(`\nเหตุการณ์ดาวน์โหลด: ${report.audit.status} (${report.audit.rows.length} รายการ${report.audit.truncated?' — ยังมีรายการอื่นนอกผลลัพธ์':''})`);
 for(const event of [...report.audit.rows].reverse())lines.push(`  ${thaiTime(event.receivedAt)} (ไทย) [${event.observer}] ${event.label} | ${event.mode}/${event.browserFamily}/${event.deviceClass} | ${event.attemptId} | `+JSON.stringify({workScopes:event.workScopes,clientAt:event.clientAt,...event.metadata,...(event.observer==='server'?{rights:event.rights}:{})}));
 lines.push('\nสรุปเฉพาะเหตุการณ์ที่แสดง: '+JSON.stringify(report.observations));
 lines.push('\nข้อจำกัด: กดบันทึก/แชร์ไม่ได้ยืนยันว่าไฟล์อยู่ในเครื่องแล้ว และไม่มีประวัติไม่ได้แปลว่าลูกค้าไม่ได้กด ต้องตรวจสิทธิ์ งาน และข้อผิดพลาดร่วมกัน ห้ามใช้รายงานนี้ปฏิเสธคืนเงินโดยอัตโนมัติ');
 return lines.join('\n');
}

export function parseDownloadHistoryArgs(args){
 const out={email:'',days:30,json:false,help:false};
 for(let i=0;i<args.length;i++){
  if(args[i]==='--email')out.email=args[++i]||'';
  else if(args[i]==='--days')out.days=Number(args[++i]);
  else if(args[i]==='--json')out.json=true;
  else if(args[i]==='--help'||args[i]==='-h')out.help=true;
  else throw Error('unknown_argument');
 }
 if(!out.help&&(!EMAIL.test(normalizeEmail(out.email))||out.email.length>254||!Number.isInteger(out.days)||out.days<1||out.days>365))throw Error('invalid_arguments');
 return out;
}

async function main(){
 let args;try{args=parseDownloadHistoryArgs(process.argv.slice(2))}catch{console.error('ใช้: node scripts/check-download-history.mjs --email customer@example.com [--days 30] [--json]');process.exitCode=2;return}
 if(args.help){console.log('Read-only support report\nnode scripts/check-download-history.mjs --email customer@example.com [--days 30] [--json]\nRun inside the application runtime with its existing DATABASE_URL. No rights, credits, refunds or schema are changed.');return}
 if(!process.env.DATABASE_URL){console.error('DATABASE_URL is not configured. Run this command inside the application runtime; do not paste database credentials into chat.');process.exitCode=2;return}
 const {default:pg}=await import('pg');
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:3000,query_timeout:4000,idleTimeoutMillis:1000,options:'-c default_transaction_read_only=on',ssl:process.env.DATABASE_URL.includes('localhost')||process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false}});
 pool.on('error',()=>{});
 let client;
 try{client=await pool.connect();const report=await readDownloadHistory(client,args);console.log(args.json?JSON.stringify(report,null,2):formatDownloadHistory(report))}
 catch(error){console.error('download_history_unavailable'+(typeof error?.code==='string'&&/^[A-Z0-9_]{1,40}$/i.test(error.code)?': '+error.code:''));process.exitCode=1}
 finally{client?.release();await pool.end().catch(()=>{})}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
