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
// Catalog choices use GA4's standard Content type / Content ID dimensions,
// so ranking needs no new custom definitions. Selection and committed use are
// separate events; failed or unchanged applications must not count as use.
export function analyticsSelection(value={}){try{
 const {kind,stage}=value;
 if(!['uniform','hair','photo_type'].includes(kind)||!['select','apply'].includes(stage))return;
 const id=String(value.id||'');
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(id))return;
 if(kind==='photo_type'&&!['female','male'].includes(id))return;
 if(stage==='apply'&&value.mode==='unchanged')return;
 const gender=kind==='photo_type'?id:['female','male'].includes(value.gender)?value.gender:'unknown';
 const label=String(value.name||id).replace(/[\u0000-\u001f\u007f]/g,'').slice(0,100);
 analyticsEvent(stage==='select'?'select_content':'idprom_content_apply',{
  content_type:kind==='photo_type'?'photo_type':kind+'_'+gender,content_id:id,content_group:label,
  asset_name:label,asset_gender:gender,asset_category:safeText(value.category)||'unknown',
  asset_provider:['uniform','png','youcam','original','user_choice'].includes(value.provider)?value.provider:'unknown',
  selection_mode:['new','memory','original','initial','remove','unchanged'].includes(value.mode)?value.mode:'new',
  event_source:value.surface==='process'?'process':'studio'
 });
 }catch{}}
const item=packageId=>({item_id:'package_'+packageId,item_name:'IDPROM '+packageId,price:Number(packageId),quantity:1});
export function analyticsCheckout(packageId,checkoutUrl){try{const session=String(checkoutUrl||'').match(/\/(cs_(?:live|test)_[A-Za-z0-9]+)(?:[\/#?]|$)/)?.[1]||(String(checkoutUrl||'').match(/^pi_[A-Za-z0-9]+$/)?.[0]||'');const pending={...context,...attribution,package_id:String(packageId),checkout_session:session,internal,at:Date.now()};write(PENDING,pending);analyticsEvent('begin_checkout',{package_id:String(packageId),currency:'THB',value:Number(packageId),items:[item(packageId)]})}catch{}}
// Call ONLY after the existing /payments/confirm endpoint has returned ok:true.
export function analyticsPurchase(sessionId){try{if(!sessionId||seenPurchases.has(sessionId))return;const pending=read(PENDING);if(pending?.internal)return;const sent=read('idprom_analytics_purchases_v1')||[];if(sent.includes(sessionId))return;seenPurchases.add(sessionId);write('idprom_analytics_purchases_v1',[...sent,sessionId].slice(-100));const valid=pending&&pending.checkout_session===sessionId&&Date.now()-pending.at<7*86400000&&['79','89','119','149','159','199'].includes(pending.package_id);const extra={transaction_id:sessionId,...(valid?pending:{uniform_category:'unknown',uniform_style:'unknown',uniform_gender:'unknown',uniform_level:'unknown'})};delete extra.internal;delete extra.at;delete extra.checkout_session;analyticsEvent('idprom_payment_confirmed',extra);if(valid)analyticsEvent('purchase',{...extra,currency:'THB',value:Number(pending.package_id),items:[item(pending.package_id)]})}catch{}}

// Diagnostic annotations stay in memory; never send image bytes, original errors,
// raw provider responses, job IDs or account identifiers to Analytics.
const diagnosticErrors=new WeakMap();
export function analyticsTagError(error,details){try{if(error&&typeof error==='object')diagnosticErrors.set(error,details)}catch{}return error}
export function classifyProcessFailure(error,stage){
 const details=error&&typeof error==='object'?diagnosticErrors.get(error)||{}:{};
 const errorStage=details.error_stage||stage||'unknown';
 const message=String(error?.message||'');
 let rawCode=String(error?.code||'');
 if(!rawCode)try{rawCode=String(JSON.parse(message).error||'')}catch{}
 const code=/^[a-zA-Z_][a-zA-Z0-9_]{0,60}$/.test(rawCode)?rawCode:'unknown';
 const status=Number(details.http_status||error?.status||0);
 let reason='unknown',event='idprom_process_error';
 if(code==='USER_CANCELLED'){
  reason='user_cancelled';event='idprom_process_cancelled';
 }else if(code==='ACTIVE_AI_JOB'||code==='active_ai_job'||status===429){
  reason='already_processing';event='idprom_process_blocked';
 }else if(code==='credit_required'||code==='usd_premium_credits_exhausted'||status===402){
  reason='trial_or_credit_required';event='idprom_process_blocked';
 }else if(code==='private_trial_inactive'){
  reason='private_trial_inactive';event='idprom_process_blocked';
 }else if(code==='AI_INPUT_REJECTED'||/input image may contain sensitive information/i.test(message)){
  reason='ai_input_rejected';
 }else if(code==='AI_OUTPUT_REJECTED'||/output image may contain sensitive information/i.test(message)){
  reason='ai_output_rejected';
 }else if(code==='AI_CONTENT_REJECTED'){
  reason='ai_content_rejected';
 }else if(error?.name==='AbortError'){
  reason='request_aborted';
 }else if(code==='REQUEST_TIMEOUT'||error?.name==='TimeoutError'){
  reason='request_timeout';
 }else if(/failed to fetch|load failed|networkerror|fetch failed/i.test(message)){
  reason='network_error';
 }else if(status>=500){
  reason='server_response_error';
 }else if(status>=400){
  reason='request_rejected';
 }else if(errorStage==='ai_job'){
  reason='ai_job_failed';
 }else if(errorStage==='compose'){
  reason='compose_failed';
 }else if(errorStage==='cleanup'){
  reason='local_cleanup_failed';
 }
 return {event,error_stage:errorStage,failure_reason:reason,error_code:code,...(status>=400&&status<=599?{http_status:status}:{})};
}
export function analyticsProcessFailure(error,stage,extra={}){try{
 const diagnostic=classifyProcessFailure(error,stage);
 analyticsEvent(diagnostic.event,{...extra,error_stage:diagnostic.error_stage,failure_reason:diagnostic.failure_reason,error_code:diagnostic.error_code,...(diagnostic.http_status?{http_status:diagnostic.http_status}:{})});
 }catch{}}
