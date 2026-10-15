import {createHash} from 'node:crypto';

const BASE='https://yce-api-01.makeupar.com';
const checks=new Map();
const COOLDOWN_MS=60000,MAX_KEYS=8,MAX_BATCHES=20;
const ERROR_CODES=new Set(['CreditInsufficiency','InvalidApiKey','InvalidAccessToken','Unauthorized','InvalidParameters','BadRequest','InvalidTaskId','TaskTimeout','TooManyRequests']);
const number=value=>{
 if(typeof value!=='number'&&(typeof value!=='string'||!/^\d+(?:\.\d+)?$/.test(value)))return null;
 const parsed=Number(value);return Number.isFinite(parsed)&&parsed>=0?parsed:null;
};
const providerCode=data=>[data?.error_code,data?.error].find(code=>ERROR_CODES.has(code))||'UnrecognizedProviderError';
const stageFor=endpoint=>endpoint==='/s2s/v2.0/file'?'upload':/^\/s2s\/v[\d.]+\/task\/(hair-transfer|mu-transfer)$/.test(endpoint)?'create':/^\/s2s\/v[\d.]+\/task\/(hair-transfer|mu-transfer)\//.test(endpoint)?'poll':'api';
const write=(logger,event,details)=>{try{logger('[YouCam '+event+']',JSON.stringify(details))}catch{}};

// Diagnostic only: no image requests, account identifiers or raw provider errors.
// Both adapters share the cooldown. A slow balance lookup never delays a failed job.
export function reportYoucamFailure({feature,endpoint,status,data,token,fetchImpl=(...args)=>fetch(...args),now=Date.now,logger=console.warn}){
 try{
  const context={feature:feature==='hair'?'hair':'makeup',stage:stageFor(endpoint)};
  const code=providerCode(data);
  write(logger,'API error',{...context,httpStatus:number(status),code});
  if(code!=='CreditInsufficiency'||typeof token!=='string'||!token)return;
  const key=createHash('sha256').update(token).digest('hex'),previous=checks.get(key),started=now();
  if(previous&&(previous.pending||started-previous.started<COOLDOWN_MS))return previous.promise;
  const entry={started,pending:true,promise:null};checks.set(key,entry);
  while(checks.size>MAX_KEYS)checks.delete(checks.keys().next().value);
  entry.promise=(async()=>{
   try{
    const r=await fetchImpl(BASE+'/s2s/v1.0/client/credit',{method:'GET',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
    const balance=await r.json();
    if(!r.ok||Number(balance.status)>=400){write(logger,'credit check',{...context,httpStatus:r.status,code:providerCode(balance)});return}
    if(!Array.isArray(balance.results)){write(logger,'credit check',{...context,httpStatus:r.status,code:'InvalidBalanceResponse'});return}
    const credits=balance.results.slice(0,MAX_BATCHES).map(batch=>{
     const type=typeof batch?.type==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(batch.type)&&!batch.type.includes(token)?batch.type:'unknown';
     const expiry=number(batch?.expiry);
     return {type,amount_dec:number(batch?.amount_dec)??number(batch?.amount),expiry:expiry>0?expiry:null,expired:expiry>0?expiry<=now():null};
    });
    write(logger,'credit check',{...context,httpStatus:r.status,credits,truncated:balance.results.length>MAX_BATCHES});
   }catch{write(logger,'credit check',{...context,code:'BalanceCheckUnavailable'})}
   finally{entry.pending=false}
  })();
  return entry.promise;
 }catch{}
}
