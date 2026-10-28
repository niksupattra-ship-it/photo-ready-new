import {isPrivateOwner} from './private-trial.js';

// Account privileges are evaluated from the authenticated request, never from a
// supplied wallet ID, email, private-mode header or saved-project flag alone.
export function requestDownloadPolicy(req,policy,{getJobsAccess,premiumCredits}={}){
 const owner=wallet=>isPrivateOwner(req,wallet);
 const account=wallet=>req.accountUser?.id&&req.accountUser.wallet_id===wallet?req.accountUser:null;
 const activate=async wallet=>{const user=account(wallet);if(premiumCredits&&user)await premiumCredits.activateForAccount(user);return !!user};
 const owned=async(wallet,job)=>{await policy.ready();return policy.ownedJob(wallet,job)};
 return {...policy,
  async summary(wallet){
   const ownerAccess=owner(wallet);
   const verified=await activate(wallet);
   const premium=verified&&premiumCredits?await premiumCredits.summary(wallet):{premiumDownloadRemaining:0};
   return {...await policy.summary(wallet),...premium,ownerAccess,unlimitedDownloads:ownerAccess,allFeatures:ownerAccess,...(ownerAccess?{canSave:true}:{})};
  },
  async allowed(wallet,job,options){if(!owner(wallet))return policy.allowed(wallet,job,options);await owned(wallet,job);return true},
  async premiumHair(wallet,job,options){if(!owner(wallet))return policy.premiumHair(wallet,job,options);await owned(wallet,job);return true},
  async allowedJobs(wallet,jobs){
   if(!owner(wallet))return policy.allowedJobs(wallet,jobs);
   const ids=[...new Set(jobs)];if(!ids.length)return false;
   const rows=await getJobsAccess(ids,wallet);
   return rows.length===ids.length&&rows.every(row=>ids.includes(row.id)&&row.status==='completed');
  },
  async suits(wallet,job,templates=[],savedWorkId=''){
   if(!owner(wallet))return policy.suits(wallet,job,templates,savedWorkId);
   if(templates.length>2||templates.some(value=>value&&(typeof value!=='string'||value.length>500||!value.startsWith('/'))))throw Object.assign(Error('ชุดไม่ถูกต้อง'),{status:400});
   await owned(wallet,job);return {limited:false,limit:null,choices:[]};
  },
  async redeem(wallet,job,options={}){
   if(owner(wallet)){await owned(wallet,job);return {ok:true,reused:true,ownerAccess:true}}
   if(premiumCredits){
    if(!await activate(wallet))throw Object.assign(Error('auth_required'),{status:401});
    const premium=await premiumCredits.redeem(wallet,job,{premium:options.premium===true});
    if(premium)return premium;
   }
   return policy.redeem(wallet,job);
  }
 };
}
