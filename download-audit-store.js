import crypto from 'node:crypto';
import {normalizeDownloadAuditBatch} from './download-audit-schema.js';
const fail=(code,status)=>Object.assign(Error(code),{code,status});
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const stamp=value=>value instanceof Date?value.toISOString():value==null?null:String(value);
const TABLES=['ai_jobs','download_work_jobs','download_works','paid_image_unlocks','premium_hair_unlocks','download_legacy_works','download_payment_receipts','package_unlock_code_redemptions','premium_download_redemptions'];
const q=async(c,sql,args=[])=>c.query(sql,args);
async function availableTables(c){const r=await q(c,'SELECT name,to_regclass(name) IS NOT NULL AS present FROM unnest($1::text[]) AS name',[TABLES]);return new Set(r.rows.filter(row=>row.present).map(row=>row.name))}

// Reads only metadata and never initializes, grants, refunds or consumes rights.
export async function readDownloadAuditRights(c,wallet,jobIds,{savedWorkId='',ownerAccess=false,tables}={}){
 tables ||= await availableTables(c);
 if(!tables.has('ai_jobs'))throw Error('audit_source_unavailable');
 const jobs=(await q(c,'SELECT id,status,usage_id FROM ai_jobs WHERE wallet_id=$1 AND id=ANY($2::text[]) ORDER BY id',[wallet,jobIds])).rows;
 if(jobs.length!==jobIds.length||jobs.some(row=>row.status!=='completed'))throw fail('download_audit_image_not_owned',404);
 let mappings=[];
 if(tables.has('download_work_jobs')&&tables.has('download_works')){
  mappings=(await q(c,`SELECT m.job_id,m.work_id,w.id AS owned_work_id,w.legacy_work_id FROM download_work_jobs m
   LEFT JOIN download_works w ON w.id=m.work_id AND w.wallet_id=m.wallet_id AND m.wallet_id=$1 WHERE m.job_id=ANY($2::text[])`,[wallet,jobIds])).rows;
  if(mappings.some(row=>!row.owned_work_id))throw fail('download_audit_image_not_owned',404);
 }
 const works=[...new Set(mappings.map(row=>row.work_id))].sort(),peerIds=new Set(jobIds);
 // A peer's metadata may be retained after its image job was deleted. The
 // production policy still honors a grant on that owned work's peer ID.
 if(works.length){const peers=await q(c,'SELECT job_id FROM download_work_jobs WHERE wallet_id=$1 AND work_id=ANY($2::text[])',[wallet,works]);for(const row of peers.rows)peerIds.add(row.job_id)}
 const ids=[...peerIds].sort();
 const paid=tables.has('paid_image_unlocks')?(await q(c,'SELECT job_id,full_edit,created_at FROM paid_image_unlocks WHERE wallet_id=$1 AND job_id=ANY($2::text[]) ORDER BY job_id',[wallet,ids])).rows:[];
 const premium=tables.has('premium_hair_unlocks')?(await q(c,'SELECT job_id FROM premium_hair_unlocks WHERE wallet_id=$1 AND job_id=ANY($2::text[]) ORDER BY job_id',[wallet,ids])).rows:[];
 const historical=(await q(c,"SELECT id FROM ai_jobs WHERE wallet_id=$1 AND id=ANY($2::text[]) AND status='completed' AND left(usage_id,4)='use_' ORDER BY id",[wallet,ids])).rows;
 const legacy=tables.has('download_legacy_works')?(await q(c,'SELECT work_id,job_ids FROM download_legacy_works WHERE wallet_id=$1 AND (work_id=$2 OR work_id=ANY($3::text[])) ORDER BY work_id',[wallet,savedWorkId,mappings.map(row=>row.legacy_work_id).filter(Boolean)])).rows:[];
 const scopes=jobIds.map(id=>mappings.find(row=>row.job_id===id)?.work_id||'job:'+id),workScopes=[...new Set(scopes)].sort();
 const receipts=tables.has('download_payment_receipts')?(await q(c,'SELECT session_id,work_scope,package_id,overlap,refund_status,created_at FROM download_payment_receipts WHERE wallet_id=$1 AND work_scope=ANY($2::text[]) ORDER BY created_at,session_id',[wallet,workScopes])).rows:[];
 const codes=tables.has('package_unlock_code_redemptions')?(await q(c,'SELECT package_id,work_scope,created_at FROM package_unlock_code_redemptions WHERE wallet_id=$1 AND work_scope=ANY($2::text[]) ORDER BY created_at,package_id',[wallet,workScopes])).rows:[];
 const support=tables.has('premium_download_redemptions')?(await q(c,'SELECT work_scope,created_at FROM premium_download_redemptions WHERE wallet_id=$1 AND work_scope=ANY($2::text[]) ORDER BY created_at',[wallet,workScopes])).rows:[];
 const policyKnown=['download_work_jobs','download_works','paid_image_unlocks','premium_hair_unlocks','download_legacy_works'].every(name=>tables.has(name));
 const perJob=jobs.map(job=>{
  const mapping=mappings.find(row=>row.job_id===job.id),scope=mapping?.work_id||'job:'+job.id;
  return {job,mapping,scope};
 });
 // Resolve exact peer IDs for each work, retaining historical standalone jobs.
 let allMappings=[];
 if(works.length)allMappings=(await q(c,'SELECT job_id,work_id FROM download_work_jobs WHERE wallet_id=$1 AND work_id=ANY($2::text[]) ORDER BY job_id',[wallet,works])).rows;
 const items=perJob.map(({job,mapping,scope})=>{
  const peers=mapping?allMappings.filter(row=>row.work_id===mapping.work_id).map(row=>row.job_id):[job.id];
  const grant=paid.some(row=>peers.includes(row.job_id)),hair=premium.some(row=>peers.includes(row.job_id)),old=historical.some(row=>peers.includes(row.id));
  const legacyAllowed=legacy.some(row=>(row.work_id===savedWorkId&&row.job_ids.includes(job.id))||row.work_id===mapping?.legacy_work_id);
  const paidDownload=grant||old||legacyAllowed;
  const allowed=ownerAccess||paidDownload?true:policyKnown?false:null;
  const sources=[];
  for(const row of receipts.filter(row=>row.work_scope===scope))sources.push({kind:'payment',packageId:row.package_id,reference:row.session_id,overlap:row.overlap===true,refundStatus:row.refund_status,at:stamp(row.created_at)});
  for(const row of codes.filter(row=>row.work_scope===scope))sources.push({kind:'code',packageId:row.package_id,at:stamp(row.created_at)});
  for(const row of support.filter(row=>row.work_scope===scope))sources.push({kind:'support_credit',packageId:'159',at:stamp(row.created_at)});
  if(old)sources.push({kind:'legacy_generation'});if(legacyAllowed)sources.push({kind:'legacy_saved_work'});if(ownerAccess)sources.push({kind:'owner_access'});
  if(grant&&!sources.some(row=>['payment','code','support_credit','legacy_generation','legacy_saved_work'].includes(row.kind)))sources.push({kind:'existing_grant'});
  return {jobId:job.id,workScope:scope,unlocked:allowed,paidDownload:paidDownload?true:policyKnown?false:null,premiumHair:ownerAccess||hair?true:policyKnown?false:null,sources};
 });
 return {workScopes,snapshot:{version:1,unlocked:items.every(row=>row.unlocked===true)?true:items.some(row=>row.unlocked===false)?false:null,paidDownload:items.every(row=>row.paidDownload===true)?true:items.some(row=>row.paidDownload===false)?false:null,premiumHair:items.every(row=>row.premiumHair===true)?true:items.some(row=>row.premiumHair===false)?false:null,ownerAccess:ownerAccess===true,jobs:items}};
}

export function createDownloadAuditStore(pool){
 let initialized;
 const ready=()=>initialized||(initialized=(async()=>{
  const c=await pool.connect();try{
   await q(c,'BEGIN');await q(c,"SET LOCAL lock_timeout='750ms'");await q(c,"SET LOCAL statement_timeout='5s'");
   await q(c,'SELECT pg_advisory_xact_lock(714269050)');
   await q(c,`CREATE TABLE IF NOT EXISTS download_attempts(
    user_id text NOT NULL,attempt_id text NOT NULL,wallet_id text NOT NULL,email_snapshot text NOT NULL,
    job_ids text[] NOT NULL,work_scopes text[] NOT NULL,saved_work_id text NOT NULL DEFAULT '',
    mode text NOT NULL CHECK(mode IN ('easy','studio','classic')),initiator text NOT NULL CHECK(initiator IN ('user','automatic_after_unlock')),
    browser_family text NOT NULL,device_class text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
    last_received_at timestamptz NOT NULL DEFAULT now(),latest_rights jsonb NOT NULL,
    PRIMARY KEY(user_id,attempt_id))`);
   await q(c,'CREATE INDEX IF NOT EXISTS download_attempts_email_time_idx ON download_attempts(email_snapshot,created_at DESC)');
   await q(c,`CREATE TABLE IF NOT EXISTS download_events(
    id bigserial NOT NULL,user_id text NOT NULL,event_id text NOT NULL,attempt_id text NOT NULL,
    observer text NOT NULL CHECK(observer IN ('server','client')),event_type text NOT NULL,
    client_at timestamptz,received_at timestamptz NOT NULL DEFAULT now(),metadata jsonb NOT NULL,
    rights_snapshot jsonb NOT NULL,payload_hash text NOT NULL,
    PRIMARY KEY(user_id,event_id),FOREIGN KEY(user_id,attempt_id) REFERENCES download_attempts(user_id,attempt_id))`);
   await q(c,'CREATE INDEX IF NOT EXISTS download_events_user_time_idx ON download_events(user_id,received_at DESC,id DESC)');
   await q(c,'CREATE INDEX IF NOT EXISTS download_events_attempt_idx ON download_events(user_id,attempt_id,id)');
   await q(c,'COMMIT');
  }catch(error){try{await q(c,'ROLLBACK')}catch{}throw error}finally{c.release()}
 })().catch(error=>{initialized=null;throw error}));
 return {ready,
  async record(verifiedUser,body,{ownerAccess=false}={}){
   const batch=normalizeDownloadAuditBatch(body),userId=verifiedUser?.id,wallet=verifiedUser?.wallet_id;
   if(typeof userId!=='string'||!userId||typeof wallet!=='string'||!wallet||(batch.expectedWalletId&&batch.expectedWalletId!==wallet))throw fail('download_audit_account_mismatch',403);
   await ready();const c=await pool.connect();try{
    await q(c,'BEGIN ISOLATION LEVEL REPEATABLE READ');await q(c,"SET LOCAL lock_timeout='500ms'");await q(c,"SET LOCAL statement_timeout='1500ms'");
    const account=(await q(c,'SELECT id,email,wallet_id FROM users WHERE id=$1 AND wallet_id=$2',[userId,wallet])).rows[0];
    if(!account)throw fail('download_audit_account_mismatch',403);
    const existing=(await q(c,'SELECT * FROM download_attempts WHERE user_id=$1 AND attempt_id=$2 FOR UPDATE',[userId,batch.attemptId])).rows[0];
    if(existing&&(existing.wallet_id!==wallet||!same(existing.job_ids,batch.jobIds)||existing.mode!==batch.mode||existing.initiator!==batch.initiator||existing.saved_work_id!==batch.savedWorkId))throw fail('download_attempt_conflict',409);
    const tables=await availableTables(c);let observed;
    try{observed=await readDownloadAuditRights(c,wallet,batch.jobIds,{savedWorkId:batch.savedWorkId,ownerAccess,tables})}
    catch(error){
     // A recorded attempt may outlive the job retention window. Continue its
     // exact frozen identity, marking present rights unknown rather than paid.
     if(existing&&error?.code==='download_audit_image_not_owned')observed={workScopes:existing.work_scopes,snapshot:{version:1,unlocked:null,paidDownload:null,premiumHair:null,ownerAccess:ownerAccess===true,jobs:[],reason:'source_no_longer_available'}};else throw error;
    }
    if(existing&&!same(existing.work_scopes,observed.workScopes))throw fail('download_attempt_conflict',409);
    const email=String(account.email).trim().toLowerCase();
    await q(c,`INSERT INTO download_attempts(user_id,attempt_id,wallet_id,email_snapshot,job_ids,work_scopes,saved_work_id,mode,initiator,browser_family,device_class,latest_rights)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(user_id,attempt_id) DO NOTHING`,[userId,batch.attemptId,wallet,email,batch.jobIds,observed.workScopes,batch.savedWorkId,batch.mode,batch.initiator,batch.browserFamily,batch.deviceClass,observed.snapshot]);
    // Recheck after a concurrent first insert; a reused ID cannot retarget work.
    const frozen=(await q(c,'SELECT wallet_id,job_ids,work_scopes,saved_work_id,mode,initiator FROM download_attempts WHERE user_id=$1 AND attempt_id=$2 FOR UPDATE',[userId,batch.attemptId])).rows[0];
    if(frozen.wallet_id!==wallet||!same(frozen.job_ids,batch.jobIds)||!same(frozen.work_scopes,observed.workScopes)||frozen.saved_work_id!==batch.savedWorkId||frozen.mode!==batch.mode||frozen.initiator!==batch.initiator)throw fail('download_attempt_conflict',409);
    const serverId='server_'+hash({attempt:batch.attemptId,rights:observed.snapshot});
    await q(c,`INSERT INTO download_events(user_id,event_id,attempt_id,observer,event_type,metadata,rights_snapshot,payload_hash)
     VALUES($1,$2,$3,'server','rights_observed','{}'::jsonb,$4,$5) ON CONFLICT(user_id,event_id) DO NOTHING`,[userId,serverId,batch.attemptId,observed.snapshot,hash(observed.snapshot)]);
    for(const event of batch.events){
     const metadata={sizeId:event.sizeId,fileType:event.fileType,byteSize:event.byteSize,method:event.method,errorStage:event.errorStage,errorCode:event.errorCode},digest=hash(event);
     const inserted=await q(c,`INSERT INTO download_events(user_id,event_id,attempt_id,observer,event_type,client_at,metadata,rights_snapshot,payload_hash)
      VALUES($1,$2,$3,'client',$4,$5,$6,$7,$8) ON CONFLICT(user_id,event_id) DO NOTHING RETURNING event_id`,[userId,event.eventId,batch.attemptId,event.type,event.clientAt,metadata,observed.snapshot,digest]);
     if(!inserted.rows.length){const previous=(await q(c,'SELECT attempt_id,payload_hash,observer FROM download_events WHERE user_id=$1 AND event_id=$2',[userId,event.eventId])).rows[0];if(previous?.attempt_id!==batch.attemptId||previous?.payload_hash!==digest||previous?.observer!=='client')throw fail('download_event_conflict',409)}
    }
    await q(c,'UPDATE download_attempts SET last_received_at=now(),latest_rights=$3 WHERE user_id=$1 AND attempt_id=$2',[userId,batch.attemptId,observed.snapshot]);
    await q(c,'COMMIT');return {ok:true,accepted:batch.events.map(event=>event.eventId)};
   }catch(error){try{await q(c,'ROLLBACK')}catch{}throw error}finally{c.release()}
  }
 };
}
