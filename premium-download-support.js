import {recipientHashForEmail} from './premium-download-credits.js';

// Server-only startup/operator activation. Account emails stay inside this
// function; callers receive only approved hashes, account IDs and balances.
export async function activateConfiguredPremiumAccounts(pool,credits,batches){
 const approved=[...new Map(batches.map(batch=>[batch.batchId+':'+batch.recipientHash,{...batch,recipientHash:batch.recipientHash.toLowerCase()}])).values()];
 const hashes=[...new Set(approved.map(batch=>batch.recipientHash))];
 const present=await pool.query("SELECT to_regclass('users') IS NOT NULL AS present");
 const accounts=present.rows[0]?.present?(await pool.query(`SELECT id,email,wallet_id FROM users
  WHERE encode(sha256(convert_to(lower(btrim(email)),'UTF8')),'hex')=ANY($1::text[]) ORDER BY id`,[hashes])).rows:[];
 const results=[],processed=new Map();let granted=0,retryable=false;
 for(const batch of approved){
  const base={batchId:batch.batchId,recipientHash:batch.recipientHash,quantity:batch.quantity};
  const matching=accounts.filter(account=>recipientHashForEmail(account.email)===batch.recipientHash);
  if(!matching.length){results.push({...base,state:'missing'});continue}
  if(matching.length>1){results.push({...base,state:'conflict',reason:'ambiguous_account'});continue}
  const account=matching[0];
  if(!processed.has(account.id)){
   try{
    const activation=await credits.activateForAccount(account);granted+=activation.granted;
    const summary=await credits.summary(account.wallet_id);
    processed.set(account.id,{state:'active',userId:account.id,walletId:account.wallet_id,premiumDownloadRemaining:summary.premiumDownloadRemaining});
   }catch(error){
    const conflict=error?.status===403;retryable||=!conflict;
    processed.set(account.id,{state:conflict?'conflict':'failed',userId:account.id,walletId:account.wallet_id,reason:conflict?'verified_account_mismatch':'database_operation_failed'});
   }
  }
  results.push({...base,...processed.get(account.id)});
 }
 return {ok:!results.some(result=>['conflict','failed'].includes(result.state)),granted,retryable,results};
}
