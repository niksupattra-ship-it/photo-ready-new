import {isPrivateOwner} from './private-trial.js';

// Account privileges are evaluated from the authenticated request, never from a
// supplied wallet ID, email, private-mode header or saved-project flag alone.
export function requestDownloadPolicy(req,policy,{getJobsAccess}={}){
 const owner=wallet=>isPrivateOwner(req,wallet);
 const owned=async(wallet,job)=>{await policy.ready();return policy.ownedJob(wallet,job)};
 return {...policy,
  async summary(wallet){
   const ownerAccess=owner(wallet);
   return {...await policy.summary(wallet),ownerAccess,unlimitedDownloads:ownerAccess,allFeatures:ownerAccess,...(ownerAccess?{canSave:true}:{})};
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
  async redeem(wallet,job){if(!owner(wallet))return policy.redeem(wallet,job);await owned(wallet,job);return {ok:true,reused:true,ownerAccess:true}}
 };
}
