import {
 DOWNLOAD_AUDIT_CLIENT_EVENTS,DOWNLOAD_AUDIT_ERROR_STAGES,DOWNLOAD_AUDIT_ERROR_CODES,
 normalizeDownloadAuditBatch
} from '../download-audit-schema.js';

// Observational only. This module has its own fetch path: an audit failure must
// never invoke the application's authentication, payment, or export handlers.
const STORAGE_KEY='idprom_download_audit_v1';
const MAX_EVENTS=100,TTL=48*60*60*1000,MAX_TRIES=6;
const BACKOFF=[2000,10000,30000,120000,600000,3600000];
const NOOP=Object.freeze({emit(){},delivery(){}});
let serial=0,configured=null;
function newId(prefix){
 let random='';try{random=globalThis.crypto.randomUUID().replace(/-/g,'')}catch{}
 if(!random)try{random=Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('')}catch{}
 if(!random)random=Date.now().toString(36)+'_'+(++serial).toString(36)+'_'+Math.random().toString(36).slice(2).padEnd(12,'0');
 return prefix+'_'+random;
}
function deviceMetadata(navigatorValue){
 const ua=String(navigatorValue?.userAgent||'');
 const browserFamily=/Line\/|\bFBAN\b|\bFBAV\b|FB_IAB|Instagram|TikTok|musical_ly|Bytedance|ByteLocale|Aweme|\bwv\b/i.test(ua)?'in_app':/Edg\//i.test(ua)?'edge':/Firefox\/|FxiOS\//i.test(ua)?'firefox':/Chrome\/|Chromium\/|CriOS\//i.test(ua)?'chrome':/Safari\//i.test(ua)?'safari':'other';
 const deviceClass=/iPad|Tablet|Silk\/|Kindle/i.test(ua)||(/Macintosh/i.test(ua)&&navigatorValue?.maxTouchPoints>1)?'tablet':navigatorValue?.userAgentData?.mobile===true||/Android|Mobile|iPhone|iPod/i.test(ua)?'mobile':'desktop';
 return {browserFamily,deviceClass};
}
function metadata(details={}){
 // No filenames, raw error messages, email, token, photo, or arbitrary objects.
 const result={};
 for(const key of ['sizeId','fileType','byteSize','method'])if(details?.[key]!=null)result[key]=details[key];
 if(details?.errorStage!=null)result.errorStage=DOWNLOAD_AUDIT_ERROR_STAGES.includes(details.errorStage)?details.errorStage:'unknown';
 if(details?.errorCode!=null)result.errorCode=DOWNLOAD_AUDIT_ERROR_CODES.includes(details.errorCode)?details.errorCode:'unknown';
 return result;
}

// Dependency injection is used by failure/gesture tests; normal callers only
// configure the current-session getter and call beginDownloadAudit below.
export function createDownloadAuditClient({session,enabled=true}={},dependencies={}){
 const clock=dependencies.now||Date.now;
 const later=dependencies.setTimeout||globalThis.setTimeout.bind(globalThis);
 const cancel=dependencies.clearTimeout||globalThis.clearTimeout.bind(globalThis);
 const target=dependencies.target??globalThis.window;
 const navigatorValue=dependencies.navigator??globalThis.navigator;
 const fetcher=dependencies.fetch??globalThis.fetch?.bind(globalThis);
 let storage;try{storage=dependencies.storage??globalThis.localStorage}catch{}
 let active=true,queue=[],timer=null,timerDue=Infinity,inFlight=false,lastWallet=null,generation=0,blockedToken='',controller=null;
 const isEnabled=()=>{try{return active&&(typeof enabled==='function'?enabled():enabled)!==false}catch{return false}};
 const readSession=()=>{
  try{const value=session?.()||{},walletId=typeof value.walletId==='string'?value.walletId:'',token=typeof value.token==='string'?value.token:'';return walletId&&token?{walletId,token,savedWorkId:typeof value.savedWorkId==='string'?value.savedWorkId:''}:null}catch{return null}
 };
 const current=()=>{
  const value=readSession(),wallet=value?.walletId||'';
  if(lastWallet!==wallet){lastWallet=wallet;generation++;blockedToken=''}
  return value;
 };
 const prune=()=>{const time=clock();queue=queue.filter(row=>row.queuedAt>=time-TTL&&row.queuedAt<=time+60000).slice(-MAX_EVENTS)};
 const persist=()=>{try{prune();if(queue.length)storage?.setItem(STORAGE_KEY,JSON.stringify(queue));else storage?.removeItem(STORAGE_KEY)}catch{}};
 const normalizeRow=input=>{
  if(!input||typeof input!=='object'||!Number.isFinite(input.queuedAt)||!Number.isInteger(input.tries)||input.tries<0||input.tries>MAX_TRIES||!Number.isFinite(input.nextAt))return null;
  const batch=normalizeDownloadAuditBatch({...input.batch,events:[input.event]});
  const {events,...context}=batch;
  return {batch:context,event:events[0],queuedAt:input.queuedAt,tries:input.tries,nextAt:input.nextAt};
 };
 try{
  const raw=storage?.getItem(STORAGE_KEY);
  if(raw&&raw.length<=2*1024*1024){const saved=JSON.parse(raw);if(Array.isArray(saved))for(const input of saved.slice(-MAX_EVENTS))try{const row=normalizeRow(input);if(row&&!queue.some(existing=>existing.event.eventId===row.event.eventId))queue.push(row)}catch{}}
 }catch{}
 prune();current();
 const schedule=(delay=0)=>{
  if(!active)return;
  const due=clock()+Math.max(0,delay);
  if(timer!==null){if(timerDue<=due)return;cancel(timer)}
  timerDue=due;
  timer=later(()=>{timer=null;timerDue=Infinity;void flush().catch(()=>{})},Math.max(0,delay));timer?.unref?.();
 };
 const next=()=>{
  if(!active||inFlight||!isEnabled())return;
  const account=current();if(!account||account.token===blockedToken)return;
  const eligible=queue.filter(row=>row.batch.expectedWalletId===account.walletId&&row.tries<MAX_TRIES);
  if(eligible.length)schedule(Math.max(0,Math.min(...eligible.map(row=>row.nextAt))-clock()));
 };
 async function flush({force=false}={}){
  if(inFlight||!isEnabled()||typeof fetcher!=='function')return;
  const account=current();if(!account||account.token===blockedToken)return;
  prune();
  if(navigatorValue?.onLine===false){persist();return}
  const first=queue.find(row=>row.batch.expectedWalletId===account.walletId&&row.tries<MAX_TRIES&&(force||row.nextAt<=clock()));
  if(!first){next();return}
  const rows=queue.filter(row=>row.batch.expectedWalletId===account.walletId&&row.batch.attemptId===first.batch.attemptId&&row.tries<MAX_TRIES&&(force||row.nextAt<=clock())).slice(0,20);
  const body={...first.batch,events:rows.map(row=>row.event)};
  const capturedGeneration=generation,ids=new Set(rows.map(row=>row.event.eventId));
  inFlight=true;persist();let timeout=null;
  try{
   controller=typeof AbortController==='function'?new AbortController():null;
   const {response,data}=await Promise.race([
    Promise.resolve().then(async()=>{
     const response=await fetcher('/api/download-events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+account.token},body:JSON.stringify(body),keepalive:true,...(controller?{signal:controller.signal}:{})});
     let data;if(response?.ok&&response.status!==204)try{data=await response.json()}catch{}
     return {response,data};
    }),
    new Promise((_,reject)=>{timeout=later(()=>{try{controller?.abort()}catch{}reject(Error('audit_timeout'))},3000);timeout?.unref?.()})
   ]);
   current();
   // The old request may have been accepted under its original verified account,
   // but it must not mutate a different account's queue or schedule a retry there.
   if(capturedGeneration!==generation)return;
   if(response?.status===204){queue=queue.filter(row=>!ids.has(row.event.eventId))}
   else if(response?.ok){
    const accepted=new Set(Array.isArray(data?.accepted)?data.accepted.filter(id=>ids.has(id)):[]);
    queue=queue.filter(row=>!accepted.has(row.event.eventId));
    for(const row of rows)if(!accepted.has(row.event.eventId)){row.tries++;row.nextAt=clock()+BACKOFF[Math.min(row.tries-1,BACKOFF.length-1)]}
   }else if(response?.status===401){blockedToken=account.token}
   else if(response?.status>=400&&response.status<500&&![408,429].includes(response.status)){queue=queue.filter(row=>!ids.has(row.event.eventId))}
   else throw Error('audit_unavailable');
  }catch{
   current();if(capturedGeneration===generation)for(const row of rows){row.tries++;row.nextAt=clock()+BACKOFF[Math.min(row.tries-1,BACKOFF.length-1)]}
  }finally{
   if(timeout!==null)cancel(timeout);controller=null;inFlight=false;persist();next();
  }
 }
 function refresh(){try{current();if(timer!==null){cancel(timer);timer=null}next()}catch{}}
 const onOnline=()=>{try{void flush({force:true}).catch(()=>{})}catch{}};
 const onPageHide=()=>{try{persist();void flush({force:true}).catch(()=>{})}catch{}};
 try{target?.addEventListener?.('online',onOnline);target?.addEventListener?.('pagehide',onPageHide)}catch{}
 next();
 return {
  begin(context={}){
   try{
    if(!isEnabled())return NOOP;
    const account=current();if(!account)return NOOP;
    const capturedGeneration=generation;
    const batch=normalizeDownloadAuditBatch({
     attemptId:newId('aud'),jobIds:context.jobIds,mode:context.mode,initiator:context.initiator||'user',
     savedWorkId:context.savedWorkId??account.savedWorkId,expectedWalletId:account.walletId,
     ...deviceMetadata(navigatorValue),events:[{eventId:newId('evt'),type:'download_clicked'}]
    });
    delete batch.events;
    const emit=(type,details={})=>{
     try{
      if(!isEnabled()||!DOWNLOAD_AUDIT_CLIENT_EVENTS.includes(type))return;
      const live=current();if(!live||live.walletId!==account.walletId||generation!==capturedGeneration)return;
      const value=normalizeDownloadAuditBatch({...batch,events:[{eventId:newId('evt'),type,clientAt:clock(),...metadata({sizeId:context.sizeId,...details})}]}).events[0];
      queue.push({batch,event:value,queuedAt:clock(),tries:0,nextAt:clock()});persist();schedule();
     }catch{}
    };
    return Object.freeze({emit,delivery:emit});
   }catch{return NOOP}
  },
  refresh,
  flush:()=>flush({force:true}),
  stop(){active=false;generation++;if(timer!==null)cancel(timer);timer=null;try{controller?.abort()}catch{}persist();try{target?.removeEventListener?.('online',onOnline);target?.removeEventListener?.('pagehide',onPageHide)}catch{}}
 };
}

export function configureDownloadAudit(options){
 try{configured?.stop();const client=createDownloadAuditClient(options);configured=client;return()=>{try{client.stop();if(configured===client)configured=null}catch{}}}catch{return()=>{}}
}
export function beginDownloadAudit(context){try{return configured?.begin(context)||NOOP}catch{return NOOP}}
export function refreshDownloadAuditSession(){try{configured?.refresh()}catch{}}
