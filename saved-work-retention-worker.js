import {getSavedWorkRetentionPolicy,purgeExpiredWorks} from './saved-work-store.js';

export function startSavedWorkRetentionCleanup({getPolicy=getSavedWorkRetentionPolicy,purge=purgeExpiredWorks,logger=console,schedule=setTimeout,cancel=clearTimeout,initialDelayMs=5000,intervalMs=3600000,retryMs=60000,batchSize=100,maxBatches=5}={}){
 let timer,stopped=false,running=false,announced=false;
 const queue=delay=>{if(!stopped){timer=schedule(run,delay);timer?.unref?.()}};
 const run=async()=>{
  if(stopped||running)return;
  running=true;let delay=intervalMs;
  try{
   const policy=await getPolicy();
   if(!announced){logger.info('Saved work retention ready',{days:policy.days,effectiveAt:policy.effectiveAt,legacyExpiresAt:policy.legacyExpiresAt});announced=true}
   let total=0,last=0;
   for(let batch=0;batch<maxBatches&&!stopped;batch++){
    last=await purge({limit:batchSize});total+=last;if(last<batchSize)break;
   }
   if(total)logger.info('Expired saved works removed',{count:total});
   if(last===batchSize)delay=retryMs;
  }catch(error){delay=retryMs;logger.error('Saved work retention cleanup will retry',{code:error.code||'cleanup_failed'})}
  finally{running=false;queue(delay)}
 };
 queue(initialDelayMs);
 return {stop(){stopped=true;cancel(timer)}};
}
