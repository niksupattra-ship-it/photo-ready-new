import {pathToFileURL} from 'node:url';
import {createPremiumDownloadCredits,recipientHashForEmail} from '../premium-download-credits.js';
import {activateConfiguredPremiumAccounts} from '../premium-download-support.js';

export function parseGrantArgs(args){
 if(args.some(arg=>!['--apply','--dry-run','--help'].includes(arg))||(args.includes('--apply')&&args.includes('--dry-run')))throw Error('invalid_arguments');
 return {apply:args.includes('--apply'),help:args.includes('--help')};
}
const safeError=error=>['verified_account_mismatch','invalid_premium_download_batch','conflicting_premium_download_batch'].includes(error?.message)?error.message:'database_operation_failed';

// Dry runs use only this read-only snapshot. Calling store.ready/summary here
// would run schema setup, which is deliberately reserved for explicit --apply.
async function snapshot(pool,batches){
 const c=await pool.connect();
 try{
  await c.query('BEGIN READ ONLY');
  await c.query("SET LOCAL statement_timeout='15s'");
  const schema=(await c.query("SELECT to_regclass('users') IS NOT NULL AS users,to_regclass('premium_download_grants') IS NOT NULL AS grants,to_regclass('premium_download_redemptions') IS NOT NULL AS redemptions")).rows[0];
  const hashes=[...new Set(batches.map(batch=>batch.recipientHash))];
  const users=schema.users?(await c.query(`SELECT id,email,wallet_id FROM users
   WHERE encode(sha256(convert_to(lower(btrim(email)),'UTF8')),'hex')=ANY($1::text[]) ORDER BY id`,[hashes])).rows:[];
  const grants=schema.grants?(await c.query('SELECT batch_id,recipient_hash,user_id,wallet_id,quantity FROM premium_download_grants WHERE recipient_hash=ANY($1::text[])',[hashes])).rows:[];
  const balances=new Map();
  if(schema.grants&&schema.redemptions)for(const wallet of new Set(users.map(user=>user.wallet_id))){
   const q=await c.query(`SELECT GREATEST(0,(SELECT COALESCE(SUM(quantity),0) FROM premium_download_grants WHERE wallet_id=$1)-(SELECT COUNT(*) FROM premium_download_redemptions WHERE wallet_id=$1)) AS remaining`,[wallet]);
   balances.set(wallet,Number(q.rows[0].remaining));
  }
  await c.query('COMMIT');return {schema,users,grants,balances};
 }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
}

export async function runPremiumDownloadGrants({pool,batches,apply=false,makeStore=()=>createPremiumDownloadCredits(pool,{batches})}){
 // Validate immutable trusted configuration without initializing its schema.
 createPremiumDownloadCredits(pool,{batches});
 const approved=[...new Map(batches.map(batch=>[batch.batchId+':'+batch.recipientHash,{...batch,recipientHash:batch.recipientHash.toLowerCase()}])).values()];
 const before=await snapshot(pool,approved);
 const results=approved.map(batch=>{
  const matches=before.users.filter(user=>recipientHashForEmail(user.email)===batch.recipientHash);
  const out={batchId:batch.batchId,recipientHash:batch.recipientHash,quantity:batch.quantity,state:'missing'};
  if(matches.length>1)return {...out,state:'conflict',reason:'ambiguous_account'};
  if(!matches.length)return out;
  const user=matches[0],prior=before.grants.find(grant=>grant.batch_id===batch.batchId&&grant.recipient_hash===batch.recipientHash);
  Object.assign(out,{userId:user.id,walletId:user.wallet_id,premiumDownloadRemaining:before.balances.get(user.wallet_id)??(before.schema.grants?null:0)});
  if(prior&&(prior.user_id!==user.id||prior.wallet_id!==user.wallet_id))return {...out,state:'conflict',reason:'verified_account_mismatch'};
  return {...out,state:prior?'already_granted':'pending',...(prior?{grantedQuantity:prior.quantity}:{})};
 });
 let activation;
 if(apply){
  activation=await activateConfiguredPremiumAccounts(pool,makeStore(),approved);
  for(const entry of results){
   const applied=activation.results.find(result=>result.batchId===entry.batchId&&result.recipientHash===entry.recipientHash);
   if(applied?.state==='active')Object.assign(entry,{state:entry.state==='already_granted'?'already_granted':'granted',userId:applied.userId,walletId:applied.walletId,premiumDownloadRemaining:applied.premiumDownloadRemaining});
   else if(applied)Object.assign(entry,applied);
  }
 }
 return {mode:apply?'apply':'dry-run',ok:!results.some(entry=>['failed','conflict'].includes(entry.state)),...(activation?{granted:activation.granted,retryable:activation.retryable}:{}),results};
}

async function main(){
 const options=parseGrantArgs(process.argv.slice(2));
 if(options.help){console.log('Usage: node scripts/grant-premium-download-credits.mjs [--dry-run | --apply]\nDefaults to read-only inspection of the approved server batch. Requires runtime DATABASE_URL.');return}
 if(!process.env.DATABASE_URL)throw Error('database_url_required');
 const [{default:pg},{PREMIUM_DOWNLOAD_BATCHES}]=await Promise.all([import('pg'),import('../premium-download-batches.js')]);
 const url=new URL(process.env.DATABASE_URL);
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:5000,ssl:['localhost','127.0.0.1','[::1]'].includes(url.hostname)||process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false},...(!options.apply?{options:'-c default_transaction_read_only=on'}:{})});
 try{
  let policy;
  if(options.apply){const {createDownloadPolicy}=await import('../download-policy-store.js');policy=createDownloadPolicy(pool)}
  const report=await runPremiumDownloadGrants({pool,batches:PREMIUM_DOWNLOAD_BATCHES,apply:options.apply,makeStore:()=>createPremiumDownloadCredits(pool,{batches:PREMIUM_DOWNLOAD_BATCHES,prepare:policy.ready,allowed:policy.allowed,premiumHair:policy.premiumHair})});
  console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;
 }finally{await pool.end()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{const known=['invalid_arguments','database_url_required'];console.error(JSON.stringify({ok:false,error:known.includes(error?.message)?error.message:safeError(error)}));process.exitCode=1});
