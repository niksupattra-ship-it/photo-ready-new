// Run once during deployment, after stopping old instances and before serving traffic.
import {getWallet} from '../payment-store.js';
import {downloadPolicy} from '../download-policy-store.js';
try{
 await getWallet('__download_policy_schema_check__');
 await downloadPolicy.ready();
 console.log('download-v1 initialized; original balances preserved and existing saved-work exemptions snapshotted.');
 process.exit(0);
}catch(error){console.error('Download policy initialization failed:',error.message);process.exit(1)}
