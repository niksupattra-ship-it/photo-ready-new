// Observational only: no API calls, credit changes, UI state, or blocking waits.
const PENDING='idprom_analytics_checkout_v1';
let context={},seenPurchases=new Set(),internal=false;
const read=(key)=>{try{return JSON.parse(sessionStorage.getItem(key)||'null')}catch{return null}};
const write=(key,value)=>{try{sessionStorage.setItem(key,JSON.stringify(value))}catch{}};
try{internal=localStorage.getItem('idprom-private-trial-active')==='1'||new URLSearchParams(location.hash.slice(1)).has('privateTrial')||new URLSearchParams(location.search).has('free199')}catch{}
const safeText=v=>String(v||'').replace(/[^a-zA-Z0-9_./-]/g,'').slice(0,100);
const attribution={};
try{const q=new URLSearchParams(location.search);for(const [key,param] of [['campaign_source','utm_source'],['campaign_medium','utm_medium'],['campaign_name','utm_campaign'],['clip_id','utm_content']]){if(q.get(param))attribution[key]=safeText(q.get(param))}if(Object.keys(attribution).length)write('idprom_analytics_source_v1',attribution);else Object.assign(attribution,read('idprom_analytics_source_v1')||{})}catch{}
export function analyticsContext(value){try{context={uniform_category:safeText(value.category),uniform_style:safeText(value.template?.split('/').pop()?.replace(/\.[^.]+$/,'')),uniform_gender:safeText(value.gender),uniform_level:value.category==='government'?safeText(value.level):'not_applicable'}}catch{}}
export function analyticsEvent(name,extra={}){try{if(internal||localStorage.getItem('idprom-private-trial-active')==='1')return;const params={...attribution,...context,...extra};const send=()=>{try{if(typeof window.gtag==='function')window.gtag('event',name,params)}catch{}};queueMicrotask(send)}catch{}}
const item=packageId=>({item_id:'package_'+packageId,item_name:'IDPROM '+packageId,price:Number(packageId),quantity:1});
export function analyticsCheckout(packageId,checkoutUrl){try{const session=String(checkoutUrl||'').match(/\/(cs_(?:live|test)_[A-Za-z0-9]+)(?:[\/#?]|$)/)?.[1]||(String(checkoutUrl||'').match(/^pi_[A-Za-z0-9]+$/)?.[0]||'');const pending={...context,...attribution,package_id:String(packageId),checkout_session:session,internal,at:Date.now()};write(PENDING,pending);analyticsEvent('begin_checkout',{package_id:String(packageId),currency:'THB',value:Number(packageId),items:[item(packageId)]})}catch{}}
// Call ONLY after the existing /payments/confirm endpoint has returned ok:true.
export function analyticsPurchase(sessionId){try{if(!sessionId||seenPurchases.has(sessionId))return;const pending=read(PENDING);if(pending?.internal)return;const sent=read('idprom_analytics_purchases_v1')||[];if(sent.includes(sessionId))return;seenPurchases.add(sessionId);write('idprom_analytics_purchases_v1',[...sent,sessionId].slice(-100));const valid=pending&&pending.checkout_session===sessionId&&Date.now()-pending.at<7*86400000&&['79','89','149','159','199'].includes(pending.package_id);const extra={transaction_id:sessionId,...(valid?pending:{uniform_category:'unknown',uniform_style:'unknown',uniform_gender:'unknown',uniform_level:'unknown'})};delete extra.internal;delete extra.at;delete extra.checkout_session;analyticsEvent('idprom_payment_confirmed',extra);if(valid)analyticsEvent('purchase',{...extra,currency:'THB',value:Number(pending.package_id),items:[item(pending.package_id)]})}catch{}}

// Diagnostic annotations stay in memory; original Error objects/messages are unchanged.
const diagnosticErrors=new WeakMap();
export function analyticsTagError(error,details){try{if(error&&typeof error==='object')diagnosticErrors.set(error,details)}catch{}return error}
export function analyticsProcessFailure(error,stage,extra={}){try{
 const details=error&&typeof error==='object'?diagnosticErrors.get(error)||{}:{};
 const errorStage=details.error_stage||stage||'unknown';
 let code='';try{code=JSON.parse(String(error?.message||'')).error||''}catch{}
 let reason='unknown',blocked=false;
 if(code==='credit_required'||details.http_status===402){reason='trial_or_credit_required';blocked=true}
 else if(code==='private_trial_inactive'){reason='private_trial_inactive';blocked=true}
 else if(error?.name==='AbortError')reason='request_aborted';
 else if(/failed to fetch|load failed|networkerror|fetch failed/i.test(String(error?.message||'')))reason='network_error';
 else if(errorStage==='ai_job')reason='ai_job_failed';
 else if(errorStage==='compose')reason='compose_failed';
 else if(errorStage==='cleanup')reason='local_cleanup_failed';
 else if(details.http_status>=500)reason='server_response_error';
 else if(details.http_status>=400)reason='request_rejected';
 analyticsEvent(blocked?'idprom_process_blocked':'idprom_process_error',{...extra,error_stage:errorStage,failure_reason:reason,...(details.http_status?{http_status:details.http_status}:{})});
 }catch{}}
