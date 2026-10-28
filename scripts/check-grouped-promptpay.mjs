import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {packageFor,remaining} from '../package-rules.js';
import {registerPromptpayApi} from '../promptpay-api.js';
import {createPromptpayIntentStore} from '../promptpay-intent-store.js';

// Actual route bodies and SQL, isolated in PostgreSQL WASM. The gateway below
// has no network capability. Its idempotency map models one provider operation
// while callers pause/retry across separate serialized database transactions.
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),cases=[],gatewayCalls=[],gatewayReads=[],intents=new Map(),sessions=new Map(),refunds=new Map(),idempotent=new Map(),idempotentParams=new Map();
let dbTail=Promise.resolve(),sequence=0,nextCreatePause=null,concurrentTrace=[],failNextRefund=false,nextRefundStatus='succeeded',dropNextCreateResponse=false,failNextCancel=false;
const acquire=async()=>{let release;const previous=dbTail;dbTail=new Promise(resolve=>release=resolve);await previous;return release};
const rawQuery=async(sql,args=[])=>{const r=await db.query(sql,args);return {...r,rowCount:r.rowCount??r.affectedRows??r.rows.length}};
const pool={
 async query(sql,args){const release=await acquire();try{return await rawQuery(sql,args)}finally{release()}},
 async connect(){const release=await acquire();return {query:rawQuery,release}}
};
const pg={Pool:class{constructor(){return pool}}};
const load=(source,names)=>new Function('crypto','pg','packageFor','remaining','process',source.replace(/^import .*;\n/gm,'').replace(/export /g,'')+'\nreturn {'+names.join(',')+'};')(crypto,pg,packageFor,remaining,{env:{DATABASE_URL:'postgres://localhost/isolated-grouped-test'}});
const payment=load(await readFile(new URL('../payment-store.js',import.meta.url),'utf8'),['ready','creditPaid','getWallet','ensureWallet','recordDownloadRefund','pendingDownloadRefunds']);
const policySource=await readFile(new URL('../download-policy-store.js',import.meta.url),'utf8');
const {createDownloadPolicy}=load(policySource.slice(0,policySource.indexOf('\nconst pool=')),['createDownloadPolicy']);
const policy=createDownloadPolicy(pool),intentStore=createPromptpayIntentStore(pool,{prepare:payment.ready});
const clone=value=>structuredClone(value);
function makeIntent({walletId,jobId,packageId='download_119_v1',status='requires_action',id='pi_grouped'+(++sequence)}){
 const amount=packageFor(packageId).price*100;
 return {id,status,amount,amount_received:status==='succeeded'?amount:0,currency:'thb',metadata:{flow:'idprom_promptpay_v1',wallet_id:walletId,job_id:jobId,package_id:packageId},next_action:{promptpay_display_qr_code:{image_url_png:'https://qr.stripe.com/local-fixture.png',expires_at:Math.floor(Date.now()/1000)+3600}}};
}
function pauseNextCreation(){
 let start,release;const started=new Promise(r=>start=r),resume=new Promise(r=>release=r);nextCreatePause={start,resume};return {started,release};
}
const stripePost=async(endpoint,params={},key)=>{
 gatewayCalls.push({endpoint,params:clone(params),key});
 if(endpoint==='checkout/sessions'){
  if(idempotent.has(key)){assert.deepEqual(params,idempotentParams.get(key));return clone(await idempotent.get(key))}
  idempotentParams.set(key,clone(params));
  const session={id:'cs_grouped'+(++sequence),mode:'payment',payment_status:'unpaid',status:'open',currency:params['line_items[0][price_data][currency]'],amount_total:Number(params['line_items[0][price_data][unit_amount]']),metadata:{wallet_id:params['metadata[wallet_id]'],job_id:params['metadata[job_id]'],package_id:params['metadata[package_id]']},url:'https://checkout.stripe.com/fixture/'+sequence,payment_intent:null};
  sessions.set(session.id,session);idempotent.set(key,Promise.resolve(session));return clone(session);
 }
 if(endpoint==='payment_intents'){
  if(idempotent.has(key)){assert.deepEqual(params,idempotentParams.get(key),'a recovered Stripe key must retain exact creation parameters');return clone(await idempotent.get(key))}
  idempotentParams.set(key,clone(params));
  const pause=nextCreatePause;nextCreatePause=null;
  const pending=(async()=>{
   if(pause){concurrentTrace.push('provider_create_paused');pause.start();await pause.resume;concurrentTrace.push('provider_create_resumed')}
   const intent=makeIntent({walletId:params['metadata[wallet_id]'],jobId:params['metadata[job_id]'],packageId:params['metadata[package_id]']});
   intents.set(intent.id,intent);return intent;
  })();idempotent.set(key,pending);const out=clone(await pending);if(dropNextCreateResponse){dropNextCreateResponse=false;throw Error('simulated provider response lost after creation')}return out;
 }
 const expire=endpoint.match(/^checkout\/sessions\/(cs_[A-Za-z0-9]+)\/expire$/);
 if(expire){const session=sessions.get(expire[1]);assert(session);assert.equal(session.status,'open');session.status='expired';return clone(session)}
 const cancel=endpoint.match(/^payment_intents\/(pi_[A-Za-z0-9]+)\/cancel$/);
 if(cancel){if(failNextCancel){failNextCancel=false;throw Object.assign(Error('fixture cancellation temporarily unavailable'),{code:'TEMPORARY'})}const intent=intents.get(cancel[1]);assert(intent,'cancel requires a fixture');if(['succeeded','processing'].includes(intent.status))throw Error('intent_not_cancellable');intent.status='canceled';return clone(intent)}
 if(endpoint==='refunds'){
  if(failNextRefund){failNextRefund=false;throw Object.assign(Error('fixture temporary refund failure'),{code:'TEMPORARY'})}
  if(idempotent.has(key)){assert.deepEqual(params,idempotentParams.get(key));return clone(await idempotent.get(key))}
  const intent=intents.get(params.payment_intent);assert.equal(intent?.status,'succeeded');assert.equal(params.amount,intent.amount);assert.equal(params.reason,'duplicate');
  const refund={id:'re_grouped'+(++sequence),status:nextRefundStatus,payment_intent:params.payment_intent,amount:params.amount,currency:'thb'};nextRefundStatus='succeeded';refunds.set(refund.id,refund);idempotentParams.set(key,clone(params));idempotent.set(key,Promise.resolve(refund));return clone(refund);
 }
 throw Error('unexpected_mock_gateway_endpoint:'+endpoint);
};
const stripeGet=async endpoint=>{gatewayReads.push(endpoint);const [kind,id]=endpoint.split('/');const value=kind==='payment_intents'?intents.get(id):kind==='refunds'?refunds.get(id):kind==='checkout'?sessions.get(endpoint.split('/')[2]):null;assert(value,'gateway object exists: '+endpoint);return clone(value)};
const routes=new Map(),app={post:(path,handler)=>routes.set('POST '+path,handler),get:(path,handler)=>routes.set('GET '+path,handler)};
const apiOptions={stripePost,stripeGet,ensureWallet:payment.ensureWallet,getAiJobResult:async(id,wallet)=>(await pool.query('SELECT * FROM ai_jobs WHERE id=$1 AND wallet_id=$2',[id,wallet])).rows[0],creditPaid:payment.creditPaid,recordDownloadRefund:payment.recordDownloadRefund,pendingDownloadRefunds:payment.pendingDownloadRefunds,isUnlocked:(wallet,id)=>policy.allowed(wallet,id),isPremium:(wallet,id)=>policy.premiumHair(wallet,id),intentStore,scopeForJob:(wallet,id)=>policy.scopeForJob(wallet,id),walletRights:payment.getWallet,appUrl:'https://fixture.invalid'};
const paymentApi=registerPromptpayApi(app,apiOptions);
routes.set('POST /api/payments/checkout',paymentApi.checkout);
const route=async(method,path,{wallet='walletA',body={},attempt='attempt_grouped_0001',id=''}={})=>{
 const req={accountUser:wallet?{wallet_id:wallet,email:wallet+'@fixture.invalid'}:null,body,params:{id},get:name=>name==='X-Checkout-Attempt'?attempt:''};let status=200,data;
 const res={status(value){status=value;return this},set(){return this},json(value){data=value;return this},send(value){data=value;return this},sendStatus(value){status=value;return this}};
 await routes.get(method+' '+path)(req,res);return {status,data};
};
const create=(jobId,{wallet='walletA',packageId='89',attempt='attempt_'+jobId+'_0001'}={})=>route('POST','/api/payments/promptpay',{wallet,body:{jobId,packageId},attempt});
const checkout=(jobId,{wallet='walletA',packageId='89',attempt='attempt_checkout_'+jobId+'_0001'}={})=>route('POST','/api/payments/checkout',{wallet,body:{jobId,packageId},attempt});
const poll=(id,wallet='walletA')=>route('GET','/api/payments/promptpay/:id',{wallet,id});
const cancel=(id,wallet='walletA')=>route('POST','/api/payments/promptpay/:id/cancel',{wallet,id});
const pay=id=>{const intent=intents.get(id);intent.status='succeeded';intent.amount_received=intent.amount};
const paySession=id=>{const session=sessions.get(id),intent=makeIntent({walletId:session.metadata.wallet_id,jobId:session.metadata.job_id,packageId:session.metadata.package_id,status:'succeeded'});intents.set(intent.id,intent);session.payment_status='paid';session.status='complete';session.payment_intent=intent.id;return clone(session)};
const check=async(name,test)=>{await test();cases.push(name);console.log('PASS '+name)};
const group=async(label,wallet='walletA')=>{
 await payment.ensureWallet(wallet);const scope=await policy.beginWork(wallet,Buffer.from('original-'+label)),jobs=[label+'A',label+'B'];
 for(const id of jobs){await pool.query("INSERT INTO ai_jobs(id,wallet_id,status,usage_id) VALUES($1,$2,'completed','free_fixture')",[id,wallet]);await policy.attach(wallet,scope,id)}
 return {scope,jobs,wallet};
};
const unlocked=out=>{assert.equal(out.status,200);assert.equal(out.data.ok,true);assert.equal(out.data.status,'work_unlocked');assert.equal(out.data.qrImage,null)};
const originalConsole=console.error;console.error=()=>{};
try{
 await payment.ready();await pool.query('CREATE TABLE ai_jobs(id text PRIMARY KEY,wallet_id text,status text,usage_id text)');await pool.query('CREATE TABLE saved_studio_work(id text PRIMARY KEY,wallet_id text,project jsonb)');await policy.ready();await intentStore.ready();
 await check('independent coordinator instances share one durable reservation and bind attempts to owned scope',async()=>{
  const g=await group('replicas'),replica=createPromptpayIntentStore(pool,{prepare:payment.ready});await replica.ready();
  const first={walletId:g.wallet,scope:g.scope,packageId:'download_119_v1',jobId:g.jobs[0],email:'first@fixture.invalid',attempt:'attempt_replica_first_01'};
  const [a,b]=await Promise.all([intentStore.reserve(first),replica.reserve({...first,jobId:g.jobs[1],email:'second@fixture.invalid',attempt:'attempt_replica_second_01'})]);
  assert.equal(a.id,b.id);assert.equal(b.job_id,g.jobs[0]);assert.equal(b.email,first.email);assert.equal(b.idempotency_key,a.idempotency_key);
  await assert.rejects(replica.reserve({...first,scope:'job:foreignscope'}),/payment_attempt_mismatch/);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM promptpay_work_intents WHERE wallet_id=$1 AND work_scope=$2 AND active',[g.wallet,g.scope])).rows[0].n,1);
 });
 await check('a delayed older settlement cannot clear a newer reconciliation queue item',async()=>{
  const g=await group('queueversion');await intentStore.queueReconcile(g.wallet,g.scope,g.jobs[0],'pi_older119');await intentStore.queueReconcile(g.wallet,g.scope,g.jobs[1],'pi_newer159');
  await intentStore.finishReconcile(g.wallet,g.scope,'','pi_older119');const pending=(await intentStore.pendingReconciliations()).find(row=>row.work_scope===g.scope);assert.equal(pending?.paid_id,'pi_newer159');
  await intentStore.finishReconcile(g.wallet,g.scope,'','pi_newer159');assert.equal((await intentStore.pendingReconciliations()).some(row=>row.work_scope===g.scope),false);
 });
 await check('sibling jobs and distinct devices reuse one pending intent and frozen legacy key',async()=>{
  const g=await group('siblings'),attempt='attempt_device_A_0001';
  const a=await create(g.jobs[0],{attempt}),b=await create(g.jobs[1],{attempt:'attempt_device_B_0001'});
  assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.data.paymentIntentId,b.data.paymentIntentId);
  const request=gatewayCalls.find(call=>call.endpoint==='payment_intents'&&call.params['metadata[job_id]']===g.jobs[0]);
  assert.equal(request.key,crypto.createHash('sha256').update('idprom_promptpay_v1walletAdownload_89_v1'+attempt).digest('hex'));
  assert.equal(request.params['metadata[job_id]'],g.jobs[0]);
  const row=await intentStore.findByIntent(a.data.paymentIntentId);assert.equal(row.work_scope,g.scope);assert.equal(row.job_id,g.jobs[0]);
 });
 await check('paused provider creation across two route callers creates at most one payable intent',async()=>{
  const g=await group('concurrent'),pause=pauseNextCreation();
  const first=create(g.jobs[0],{attempt:'attempt_concurrent_A_001'});await pause.started;
  const second=create(g.jobs[1],{attempt:'attempt_concurrent_B_001'});concurrentTrace.push('second_route_started');
  // Both callers may recover the durable reservation; provider idempotency
  // collapses the operation. Release without time-based polling or sleeps.
  await new Promise(resolve=>setImmediate(resolve));pause.release();
  const [a,b]=await Promise.all([first,second]);assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.data.paymentIntentId,b.data.paymentIntentId);
  const calls=gatewayCalls.filter(call=>call.endpoint==='payment_intents'&&[...g.jobs].includes(call.params['metadata[job_id]']));assert.equal(new Set(calls.map(call=>call.key)).size,1);assert(calls.every(call=>call.params['metadata[job_id]']===g.jobs[0]));
 });
 await check('lost provider response recovers its durable reservation with the same original key and parameters',async()=>{
  const g=await group('lostresponse'),before=intents.size;dropNextCreateResponse=true;const first=await create(g.jobs[0]);assert.equal(first.status,400);assert.equal(intents.size,before+1);
  const second=await create(g.jobs[1],{attempt:'attempt_lost_response_sibling_01'});assert.equal(second.status,200);assert.equal(intents.size,before+1);
  const calls=gatewayCalls.filter(call=>call.endpoint==='payment_intents'&&g.jobs.includes(call.params['metadata[job_id]']));assert.equal(calls.length,2);assert.equal(calls[0].key,calls[1].key);assert.deepEqual(calls[0].params,calls[1].params);
 });
 await check('crash after provider success before binding cannot create another sibling intent',async()=>{
  const g=await group('lostbind'),before=intents.size,bind=intentStore.bind;let fail=true;
  intentStore.bind=async(...args)=>{if(fail){fail=false;throw Error('simulated database connection lost before bind')}return bind(...args)};
  try{assert.equal((await create(g.jobs[0])).status,400)}finally{intentStore.bind=bind}
  assert.equal(intents.size,before+1);const second=await create(g.jobs[1]);assert.equal(second.status,200);assert.equal(intents.size,before+1);
 });
 await check('aged unbound reservations cannot blindly recreate provider objects after idempotency retention',async()=>{
  for(const channel of ['promptpay','checkout']){
   const g=await group('agedunbound'+channel),row=await intentStore.reserve({walletId:g.wallet,scope:g.scope,packageId:'download_119_v1',jobId:g.jobs[0],email:'fixture@invalid.test',attempt:'attempt_aged_'+channel+'_0001',channel,payload:{}});
   await pool.query("UPDATE promptpay_work_intents SET created_at=now()-interval '24 hours' WHERE id=$1",[row.id]);const before=gatewayCalls.filter(call=>['payment_intents','checkout/sessions'].includes(call.endpoint)).length;
   const out=channel==='promptpay'?await create(g.jobs[1]):await checkout(g.jobs[1]);assert.equal(out.status,409);assert.equal(out.data.error,'payment_recovery_required');assert.equal(gatewayCalls.filter(call=>['payment_intents','checkout/sessions'].includes(call.endpoint)).length,before);
  }
 });
 await check('old bound reservations still retrieve their original PI or Checkout without a new provider POST',async()=>{
  const qrGroup=await group('agedboundpi'),qr=await create(qrGroup.jobs[0]),qrRow=await intentStore.findByIntent(qr.data.paymentIntentId);await pool.query("UPDATE promptpay_work_intents SET created_at=now()-interval '48 hours' WHERE id=$1",[qrRow.id]);
  const csGroup=await group('agedboundcheckout'),cs=await checkout(csGroup.jobs[0]),session=[...sessions.values()].find(value=>value.metadata.job_id===csGroup.jobs[0]),csRow=await intentStore.findByIntent(session.id);await pool.query("UPDATE promptpay_work_intents SET created_at=now()-interval '48 hours' WHERE id=$1",[csRow.id]);
  const before=gatewayCalls.filter(call=>['payment_intents','checkout/sessions'].includes(call.endpoint)).length;const qrAgain=await create(qrGroup.jobs[1]),csAgain=await checkout(csGroup.jobs[1]);assert.equal(qrAgain.status,200);assert.equal(qrAgain.data.paymentIntentId,qr.data.paymentIntentId);assert.equal(csAgain.status,200);assert.equal(csAgain.data.url,cs.data.url);assert.equal(gatewayCalls.filter(call=>['payment_intents','checkout/sessions'].includes(call.endpoint)).length,before);
 });
 await check('processing intent cannot be replaced or canceled',async()=>{
  const g=await group('processing'),a=await create(g.jobs[0]);intents.get(a.data.paymentIntentId).status='processing';
  const b=await create(g.jobs[1]);assert.equal(b.status,200);assert.equal(b.data.paymentIntentId,a.data.paymentIntentId);assert.equal(b.data.status,'processing');assert.equal(b.data.qrImage,null);assert.equal((await cancel(a.data.paymentIntentId)).status,409);assert.equal((await route('GET','/api/payments/promptpay/:id/image',{id:a.data.paymentIntentId})).status,404);
 });
 await check('changing offers never leaves two independently payable QRs for one work',async()=>{
  const g=await group('offerchange'),a=await create(g.jobs[0]),b=await create(g.jobs[1],{packageId:'159'});
  assert.equal(a.status,200);assert.equal(b.status,200);
  const payable=[...intents.values()].filter(intent=>g.jobs.includes(intent.metadata.job_id)&&['requires_action','processing'].includes(intent.status));assert.equal(payable.length,1);
  if(a.data.paymentIntentId!==b.data.paymentIntentId){assert.equal(intents.get(a.data.paymentIntentId).status,'canceled');assert.equal(b.data.amount,159)}
 });
 await check('confirmed cancellation releases work for a new attempt and stale replay never becomes a fresh QR',async()=>{
  const g=await group('canceled'),attempt='attempt_cancel_original_01',a=await create(g.jobs[0],{attempt});
  assert.equal((await cancel(a.data.paymentIntentId)).data.status,'canceled');const b=await create(g.jobs[1],{attempt:'attempt_cancel_replacement_01'});assert.equal(b.status,200);assert.notEqual(b.data.paymentIntentId,a.data.paymentIntentId);
  const before=intents.size,replay=await create(g.jobs[0],{attempt});assert.equal(intents.size,before);assert(replay.status>=400||replay.data.status==='canceled'||replay.data.paymentIntentId===b.data.paymentIntentId);assert.equal(replay.data?.status==='requires_action'&&replay.data?.paymentIntentId===a.data.paymentIntentId,false);
 });
 await check('provider-expired QR is canceled before a replacement becomes payable',async()=>{
  const g=await group('expired'),a=await create(g.jobs[0]);intents.get(a.data.paymentIntentId).next_action.promptpay_display_qr_code.expires_at=Math.floor(Date.now()/1000)-1;
  let b=await create(g.jobs[1],{attempt:'attempt_expired_replacement_01'});assert.equal(b.status,200);assert.equal(intents.get(a.data.paymentIntentId).status,'canceled');
  if(b.data.status==='canceled')b=await create(g.jobs[1],{attempt:'attempt_expired_replacement_01'});
  assert.equal(b.status,200);assert.notEqual(b.data.paymentIntentId,a.data.paymentIntentId);
 });
 await check('legacy pending sibling QR is hidden and canceled after another payment unlocks the work',async()=>{
  const g=await group('legacycovered'),a=await create(g.jobs[0]);
  const old=makeIntent({walletId:g.wallet,jobId:g.jobs[1]});intents.set(old.id,old);pay(a.data.paymentIntentId);assert.equal((await poll(a.data.paymentIntentId)).data.ok,true);
  const covered=await poll(old.id);unlocked(covered);assert.equal(intents.get(old.id).status,'canceled');assert.equal(await policy.allowed(g.wallet,g.jobs[1]),true);
 });
 await check('legacy pending intent is adopted and reused on another sibling job',async()=>{
  const g=await group('adopt'),old=makeIntent({walletId:g.wallet,jobId:g.jobs[0]});intents.set(old.id,old);assert.equal((await poll(old.id)).status,200);
  const b=await create(g.jobs[1]);assert.equal(b.status,200);assert.equal(b.data.paymentIntentId,old.id);assert.equal((await intentStore.findByIntent(old.id)).work_scope,g.scope);
 });
 await check('polling an unknown legacy QR cancels its conflict with an existing new pending intent',async()=>{
  const g=await group('legacyconflict'),old=makeIntent({walletId:g.wallet,jobId:g.jobs[0]});intents.set(old.id,old);
  const current=await create(g.jobs[1]);assert.equal(current.status,200);const found=await poll(old.id);assert.equal(found.status,200);
  const payable=[...intents.values()].filter(intent=>g.jobs.includes(intent.metadata.job_id)&&['requires_action','processing'].includes(intent.status));assert.equal(payable.length,1);assert.equal(intents.get(old.id).status,'canceled');
 });
 await check('legacy processing takes precedence over a new pending QR and image export stays closed',async()=>{
  const g=await group('legacyprocessing'),old=makeIntent({walletId:g.wallet,jobId:g.jobs[0],status:'processing'});intents.set(old.id,old);const current=await create(g.jobs[1]);assert.equal(current.status,200);
  const found=await poll(old.id);assert.equal(found.status,200);assert.equal(found.data.status,'processing');assert.equal(found.data.qrImage,null);assert.equal(intents.get(current.data.paymentIntentId).status,'canceled');assert.equal((await intentStore.findByIntent(old.id)).active,true);
  const image=await route('GET','/api/payments/promptpay/:id/image',{id:old.id});assert([404,409].includes(image.status));
 });
 await check('paid legacy webhook cancels the active sibling QR with browser polling paused',async()=>{
  const g=await group('pausedbrowser'),b=await create(g.jobs[1]),old=makeIntent({walletId:g.wallet,jobId:g.jobs[0],status:'succeeded'});intents.set(old.id,old);
  const paid=await paymentApi.settleIntent(clone(old));assert.equal(paid.overlap,false);assert.equal(intents.get(b.data.paymentIntentId).status,'canceled');assert.equal(await policy.allowed(g.wallet,g.jobs[1]),true);assert.equal((await intentStore.pendingReconciliations()).some(row=>row.work_scope===g.scope),false);
 });
 await check('paid119 webhook preserves an active159 upgrade with browser polling paused',async()=>{
  const g=await group('pausedupgrade'),b=await create(g.jobs[1],{packageId:'159'}),old=makeIntent({walletId:g.wallet,jobId:g.jobs[0],status:'succeeded'});intents.set(old.id,old);await paymentApi.settleIntent(clone(old));
  assert.equal(intents.get(b.data.paymentIntentId).status,'requires_action');assert.equal(await policy.premiumHair(g.wallet,g.jobs[0]),false);pay(b.data.paymentIntentId);const upgraded=await paymentApi.settleIntent(clone(intents.get(b.data.paymentIntentId)));assert.equal(upgraded.overlap,false);assert.equal(await policy.premiumHair(g.wallet,g.jobs[0]),true);
 });
 await check('provider cancellation failure survives as a durable retry without browser requests',async()=>{
  const g=await group('retrycancel'),b=await create(g.jobs[1]),old=makeIntent({walletId:g.wallet,jobId:g.jobs[0],status:'succeeded'});intents.set(old.id,old);failNextCancel=true;
  await paymentApi.settleIntent(clone(old));assert.equal(intents.get(b.data.paymentIntentId).status,'requires_action');assert.equal((await intentStore.pendingReconciliations()).some(row=>row.work_scope===g.scope),true);
  await paymentApi.retryReconciliations();assert.equal(intents.get(b.data.paymentIntentId).status,'canceled');assert.equal((await intentStore.pendingReconciliations()).some(row=>row.work_scope===g.scope),false);
 });
 await check('processing duplicate success is settled and refunded by the durable worker alone',async()=>{
  const g=await group('workerprocessing'),b=await create(g.jobs[1]),old=makeIntent({walletId:g.wallet,jobId:g.jobs[0],status:'succeeded'});intents.set(old.id,old);intents.get(b.data.paymentIntentId).status='processing';
  await paymentApi.settleIntent(clone(old));assert.equal((await intentStore.pendingReconciliations()).some(row=>row.work_scope===g.scope),true);pay(b.data.paymentIntentId);await paymentApi.retryReconciliations();
  const receipt=(await pool.query('SELECT overlap,refund_status FROM download_payment_receipts WHERE session_id=$1',[b.data.paymentIntentId])).rows[0];assert.equal(receipt.overlap,true);assert.equal(receipt.refund_status,'succeeded');assert.equal((await intentStore.pendingReconciliations()).some(row=>row.work_scope===g.scope),false);assert.equal(await policy.allowed(g.wallet,g.jobs[0]),true);
 });
 await check('settlement recovers and cancels a sibling still creating under its first provider key',async()=>{
  const g=await group('settlementduringcreate'),pause=pauseNextCreation(),creation=create(g.jobs[1]);await pause.started;const old=makeIntent({walletId:g.wallet,jobId:g.jobs[0],status:'succeeded'});intents.set(old.id,old);
  const paid=paymentApi.settleIntent(clone(old));await new Promise(resolve=>setImmediate(resolve));pause.release();const [created]=await Promise.all([creation,paid]);assert.equal(created.status,200);assert.equal(intents.get(created.data.paymentIntentId).status,'canceled');assert.equal(await policy.allowed(g.wallet,g.jobs[1]),true);
 });
 await check('89 payment permits a distinct full-price159 premium upgrade with five retained suit choices',async()=>{
  const g=await group('upgrade'),a=await create(g.jobs[0]);pay(a.data.paymentIntentId);assert.equal((await poll(a.data.paymentIntentId)).data.ok,true);assert.equal(await policy.premiumHair(g.wallet,g.jobs[0]),false);
  const basicSuits=await policy.suits(g.wallet,g.jobs[0],['/suit/1','/suit/2','/suit/3']);assert.equal(basicSuits.limit,3);await assert.rejects(policy.suits(g.wallet,g.jobs[1],['/suit/4']));
  const premium=await create(g.jobs[1],{packageId:'159'});assert.equal(premium.status,200);assert.notEqual(premium.data.paymentIntentId,a.data.paymentIntentId);assert.equal(premium.data.amount,159);pay(premium.data.paymentIntentId);assert.equal((await poll(premium.data.paymentIntentId)).data.ok,true);assert.equal(await policy.premiumHair(g.wallet,g.jobs[0]),true);
  const expanded=await policy.suits(g.wallet,g.jobs[1],['/suit/4','/suit/5']);assert.equal(expanded.limit,5);assert.deepEqual(expanded.choices,['/suit/1','/suit/2','/suit/3','/suit/4','/suit/5']);await assert.rejects(policy.suits(g.wallet,g.jobs[0],['/suit/6']));
 });
 await check('159 premium right suppresses a redundant legacy119 QR without hiding a genuine159 upgrade',async()=>{
  const g=await group('premiumcovered'),a=await create(g.jobs[0],{packageId:'159'});pay(a.data.paymentIntentId);assert.equal((await poll(a.data.paymentIntentId)).data.ok,true);
  const old=makeIntent({walletId:g.wallet,jobId:g.jobs[1]});intents.set(old.id,old);unlocked(await poll(old.id));assert.equal(intents.get(old.id).status,'canceled');
 });
 await check('frozen credit packages are not canceled or treated as redundant download purchases',async()=>{
  const g=await group('frozencredits'),a=await create(g.jobs[0]);pay(a.data.paymentIntentId);await poll(a.data.paymentIntentId);
  const old=makeIntent({walletId:g.wallet,jobId:g.jobs[1],packageId:'79_v2'});intents.set(old.id,old);
  const pending=await poll(old.id);assert.equal(pending.status,200);assert.equal(pending.data.status,'requires_action');assert.equal(intents.get(old.id).status,'requires_action');
  const before=(await payment.getWallet(g.wallet)).processRemaining;pay(old.id);assert.equal((await poll(old.id)).data.ok,true);assert.equal((await payment.getWallet(g.wallet)).processRemaining,before+1);
 });
 await check('overlapping succeeded receipt retries one exact refund and preserves the first paid right',async()=>{
  const g=await group('refundrace'),a=await create(g.jobs[0]);pay(a.data.paymentIntentId);const winner=await poll(a.data.paymentIntentId);assert.equal(winner.data.overlap,false);
  const extra=makeIntent({walletId:g.wallet,jobId:g.jobs[1],status:'succeeded'});intents.set(extra.id,extra);failNextRefund=true;
  const failed=await poll(extra.id);assert.equal(failed.data.overlap,true);assert.equal(failed.data.refundStatus,'failed');assert.equal(await policy.allowed(g.wallet,g.jobs[1]),true);
  const retried=await poll(extra.id);assert.equal(retried.data.duplicate,true);assert.equal(retried.data.refundStatus,'succeeded');
  const posts=gatewayCalls.filter(call=>call.endpoint==='refunds'&&call.params.payment_intent===extra.id);assert.equal(posts.length,2);assert.equal(posts[0].key,posts[1].key);assert.equal(posts[1].params.amount,11900);
  assert.equal(posts[1].key,crypto.createHash('sha256').update('idprom-duplicate-refund-v1:'+extra.id).digest('hex'));
  const receipt=(await pool.query('SELECT overlap,refund_status,refund_id FROM download_payment_receipts WHERE session_id=$1',[extra.id])).rows[0];assert.equal(receipt.refund_status,'succeeded');assert.equal(receipt.refund_id,retried.data.refundId);
  const before=gatewayCalls.filter(call=>call.endpoint==='refunds').length;await poll(extra.id);await poll(a.data.paymentIntentId);assert.equal(gatewayCalls.filter(call=>call.endpoint==='refunds').length,before);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM paid_image_unlocks WHERE wallet_id=$1 AND job_id=ANY($2::text[])',[g.wallet,g.jobs])).rows[0].n,1);
 });
 await check('worker polls the exact pending refund receipt without a second refund POST',async()=>{
  const g=await group('pendingrefund'),a=await create(g.jobs[0]);pay(a.data.paymentIntentId);await poll(a.data.paymentIntentId);const extra=makeIntent({walletId:g.wallet,jobId:g.jobs[1],status:'succeeded'});intents.set(extra.id,extra);nextRefundStatus='pending';
  const pending=await poll(extra.id);assert.equal(pending.data.refundStatus,'pending');const posts=gatewayCalls.filter(call=>call.endpoint==='refunds').length;refunds.get(pending.data.refundId).status='succeeded';
  await paymentApi.retryReconciliations();assert.equal(gatewayCalls.filter(call=>call.endpoint==='refunds').length,posts);assert.equal((await pool.query('SELECT refund_status FROM download_payment_receipts WHERE session_id=$1',[extra.id])).rows[0].refund_status,'succeeded');
 });
 await check('refund transport failure recovers after coordinator restart without any browser request',async()=>{
  const g=await group('refundrestart'),a=await create(g.jobs[0]);pay(a.data.paymentIntentId);await paymentApi.settleIntent(clone(intents.get(a.data.paymentIntentId)));
  const extra=makeIntent({walletId:g.wallet,jobId:g.jobs[1],status:'succeeded'});intents.set(extra.id,extra);failNextRefund=true;const failed=await paymentApi.settleIntent(clone(extra));assert.equal(failed.refundStatus,'failed');assert((await payment.pendingDownloadRefunds()).some(row=>row.session_id===extra.id));
  const restartedStore=createPromptpayIntentStore(pool,{prepare:payment.ready}),restarted=registerPromptpayApi({post(){},get(){}},{...apiOptions,intentStore:restartedStore});await restarted.retryReconciliations();
  const receipt=(await pool.query('SELECT refund_status FROM download_payment_receipts WHERE session_id=$1',[extra.id])).rows[0];assert.equal(receipt.refund_status,'succeeded');const posts=gatewayCalls.filter(call=>call.endpoint==='refunds'&&call.params.payment_intent===extra.id);assert.equal(posts.length,2);assert.equal(posts[0].key,posts[1].key);assert.equal(await policy.allowed(g.wallet,g.jobs[0]),true);
 });
 await check('definitive provider refund failure stays recorded and is not repeatedly resubmitted',async()=>{
  const g=await group('refundfailed'),a=await create(g.jobs[0]);pay(a.data.paymentIntentId);await paymentApi.settleIntent(clone(intents.get(a.data.paymentIntentId)));const extra=makeIntent({walletId:g.wallet,jobId:g.jobs[1],status:'succeeded'});intents.set(extra.id,extra);nextRefundStatus='failed';
  const failed=await paymentApi.settleIntent(clone(extra));assert.equal(failed.refundStatus,'failed');assert.equal((await payment.pendingDownloadRefunds()).some(row=>row.session_id===extra.id),false);const posts=gatewayCalls.filter(call=>call.endpoint==='refunds').length;await paymentApi.retryReconciliations();assert.equal(gatewayCalls.filter(call=>call.endpoint==='refunds').length,posts);
  assert.equal((await pool.query('SELECT error_code FROM download_payment_receipts WHERE session_id=$1',[extra.id])).rows[0].error_code,'provider_refund_failed');
 });
 await check('Checkout and embedded QR share one work reservation across both creation orders',async()=>{
  const g=await group('checkoutfirst'),attempt='attempt_checkout_stable_01',a=await checkout(g.jobs[0],{attempt});assert.equal(a.status,200);assert.match(a.data.url,/checkout\.stripe\.com/);
  const b=await create(g.jobs[1]);assert.equal(b.status,409);assert.equal(b.data.error,'payment_pending_checkout');
  const replay=await checkout(g.jobs[1],{attempt:'attempt_checkout_sibling_01'});assert.equal(replay.status,200);assert.equal(replay.data.url,a.data.url);
  const call=gatewayCalls.find(item=>item.endpoint==='checkout/sessions'&&item.params['metadata[job_id]']===g.jobs[0]);assert.equal(call.key,crypto.createHash('sha256').update(JSON.stringify(['idprom_checkout_v1',g.wallet,'download_89_v1',g.jobs[0],attempt])).digest('hex'));
  const other=await group('qrbeforecheckout'),qr=await create(other.jobs[0]),blocked=await checkout(other.jobs[1]);assert.equal(blocked.status,409);assert.equal(blocked.data.error,'payment_pending_promptpay');assert.equal(blocked.data.paymentIntentId,qr.data.paymentIntentId);
 });
 await check('Checkout89 success permits159 upgrade and same-session replay never refunds its own grant',async()=>{
  const g=await group('checkoutupgrade'),a=await checkout(g.jobs[0]);assert.equal(a.status,200);const session=[...sessions.values()].find(value=>value.metadata.job_id===g.jobs[0]),paid=paySession(session.id);
  const out=await paymentApi.settleSession(paid,g.wallet);assert.equal(out.overlap,false);const ownReplay=await paymentApi.settleSession(paid,g.wallet);assert.equal(ownReplay.duplicate,true);assert.equal(ownReplay.overlap,false);
  let upgrade=await create(g.jobs[1],{packageId:'159'});if(upgrade.status===409&&upgrade.data.error==='payment_finished')upgrade=await create(g.jobs[1],{packageId:'159'});
  assert.equal(upgrade.status,200);assert.equal(upgrade.data.amount,159);pay(upgrade.data.paymentIntentId);const premium=await poll(upgrade.data.paymentIntentId);assert.equal(premium.data.overlap,false);assert.equal(await policy.premiumHair(g.wallet,g.jobs[0]),true);
 });
 await check('expired Checkout permits a fresh QR while replaying its old attempt stays terminal',async()=>{
  const g=await group('checkoutexpired'),attempt='attempt_checkout_expired_01',a=await checkout(g.jobs[0],{attempt});assert.equal(a.status,200);const session=[...sessions.values()].find(value=>value.metadata.job_id===g.jobs[0]);session.status='expired';
  const qr=await create(g.jobs[1]);assert.equal(qr.status,200);assert.match(qr.data.paymentIntentId,/^pi_/);const before=sessions.size,replay=await checkout(g.jobs[0],{attempt});assert.equal(replay.status,409);assert.equal(replay.data.error,'payment_expired');assert.equal(sessions.size,before);
 });
 await check('legacy processing expires a conflicting open Checkout before being adopted',async()=>{
  const g=await group('processingcheckout'),old=makeIntent({walletId:g.wallet,jobId:g.jobs[0],status:'processing'});intents.set(old.id,old);assert.equal((await checkout(g.jobs[1])).status,200);const session=[...sessions.values()].find(value=>value.metadata.job_id===g.jobs[1]);
  const found=await poll(old.id);assert.equal(found.status,200);assert.equal(found.data.status,'processing');assert.equal(found.data.qrImage,null);assert.equal(session.status,'expired');assert.equal((await intentStore.findByIntent(old.id)).active,true);
 });
 await check('Checkout overlap refund persists its successful status and cannot settle for another account',async()=>{
  const g=await group('checkoutrefund'),a=await create(g.jobs[0]);pay(a.data.paymentIntentId);await poll(a.data.paymentIntentId);
  const intent=makeIntent({walletId:g.wallet,jobId:g.jobs[1],status:'succeeded'});intents.set(intent.id,intent);
  const session={id:'cs_overlapfixture',mode:'payment',payment_status:'paid',status:'complete',currency:'thb',amount_total:11900,payment_intent:intent.id,metadata:{wallet_id:g.wallet,package_id:'download_119_v1',job_id:g.jobs[1]}};
  await assert.rejects(paymentApi.settleSession(session,'walletB'),/wallet_mismatch/);
  const out=await paymentApi.settleSession(session,g.wallet);assert.equal(out.overlap,true);assert.equal(out.refundStatus,'succeeded');const receipt=(await pool.query('SELECT refund_status,refund_id FROM download_payment_receipts WHERE session_id=$1',[session.id])).rows[0];assert.equal(receipt.refund_status,'succeeded');assert.equal(receipt.refund_id,out.refundId);
  const before=refunds.size;await paymentApi.settleSession(session,g.wallet);assert.equal(refunds.size,before);assert.equal(await policy.allowed(g.wallet,g.jobs[0]),true);
 });
 await check('owned scopes and provider metadata isolate accounts and unrelated works',async()=>{
  const a=await group('isolate'),b=await group('unrelated'),c=await group('foreign','walletB');const one=await create(a.jobs[0]),two=await create(b.jobs[0]),three=await create(c.jobs[0],{wallet:'walletB'});
  assert.notEqual(one.data.paymentIntentId,two.data.paymentIntentId);assert.notEqual(one.data.paymentIntentId,three.data.paymentIntentId);assert.equal((await poll(one.data.paymentIntentId,'walletB')).status,403);assert((await create(c.jobs[0])).status>=400);
  const malicious=makeIntent({walletId:'walletA',jobId:c.jobs[0]});intents.set(malicious.id,malicious);assert((await poll(malicious.id)).status>=400);
 });
 await check('current89 and premium159 create exact THB prices with distinct public offer IDs',async()=>{
  for(const [publicId,key,amount] of [['89','download_89_v1',8900],['159','download_159_hair_v1',15900]]){
   const g=await group('currentprice'+publicId),out=await create(g.jobs[0],{packageId:publicId});assert.equal(out.status,200);assert.equal(out.data.amount,amount/100);assert.equal(out.data.packageId,publicId);assert.equal(out.data.packageKey,key);
   const intent=intents.get(out.data.paymentIntentId);assert.equal(intent.amount,amount);assert.equal(intent.metadata.package_id,key);const before=(await payment.getWallet(g.wallet)).processRemaining;pay(intent.id);const paid=await poll(intent.id);assert.equal(paid.data.ok,true);assert.equal((await payment.getWallet(g.wallet)).processRemaining,before);assert.equal(await policy.allowed(g.wallet,g.jobs[1]),true);
  }
 });
 await check('obsolete119 aliases create new89 charges in both QR and Checkout without changing frozen descriptors',async()=>{
  assert.equal(packageFor('download_119_v1').price,119);assert.equal(packageFor('download_89_v1').price,89);
  for(const publicId of ['119','download_119_v1'])for(const channel of ['qr','checkout']){
   const g=await group('obsolete'+publicId+channel),out=await (channel==='qr'?create:checkout)(g.jobs[0],{packageId:publicId});assert.equal(out.status,200);assert.equal(out.data.packageId,'89');assert.equal(out.data.packageKey,'download_89_v1');
   const row=await intentStore.findActive(g.wallet,g.scope);assert.equal(row.package_id,'download_89_v1');assert.equal(channel==='qr'?intents.get(row.intent_id).amount:sessions.get(row.intent_id).amount_total,8900);
  }
 });
 await check('pending unbound119 retry preserves the original key, price, email and job across the cutover',async()=>{
  const g=await group('cutoverpending119'),attempt='attempt_cutover_pending119_01',row=await intentStore.reserve({walletId:g.wallet,scope:g.scope,packageId:'download_119_v1',jobId:g.jobs[0],email:'frozen119@fixture.invalid',attempt});
  const out=await create(g.jobs[1],{packageId:'89',attempt});assert.equal(out.status,200);assert.equal(out.data.amount,119);assert.equal(out.data.packageId,'119');assert.equal(out.data.packageKey,'download_119_v1');
  const post=gatewayCalls.find(call=>call.endpoint==='payment_intents'&&call.key===row.idempotency_key);assert(post);assert.equal(post.params.amount,11900);assert.equal(post.params['metadata[job_id]'],g.jobs[0]);assert.equal(post.params['payment_method_data[billing_details][email]'],row.email);assert.equal((await intentStore.findActive(g.wallet,g.scope)).id,row.id);
  const again=await create(g.jobs[1],{packageId:'89',attempt:'attempt_cutover_other_device_01'});assert.equal(again.data.paymentIntentId,out.data.paymentIntentId);assert.equal(again.data.amount,119);
  pay(out.data.paymentIntentId);assert.equal((await poll(out.data.paymentIntentId)).data.ok,true);assert.equal(await policy.allowed(g.wallet,g.jobs[1]),true);assert.equal((await create(g.jobs[1],{packageId:'89'})).status,409);
 });
 await check('closed119 attempt stays terminal while an explicitly new attempt uses89',async()=>{
  const g=await group('cutoverclosed119'),attempt='attempt_cutover_closed119_01';await intentStore.reserve({walletId:g.wallet,scope:g.scope,packageId:'download_119_v1',jobId:g.jobs[0],email:'old@fixture.invalid',attempt});
  const old=await create(g.jobs[0],{packageId:'89',attempt});assert.equal(old.data.amount,119);assert.equal((await cancel(old.data.paymentIntentId)).data.status,'canceled');const created=intents.size;
  const replay=await create(g.jobs[0],{packageId:'89',attempt});assert.equal(replay.data.status,'canceled');assert.equal(intents.size,created);assert.equal(replay.data.paymentIntentId,old.data.paymentIntentId);
  const fresh=await create(g.jobs[1],{packageId:'89',attempt:'attempt_cutover_fresh89_01'});assert.equal(fresh.data.amount,89);assert.equal(fresh.data.packageId,'89');assert.notEqual(fresh.data.paymentIntentId,old.data.paymentIntentId);
 });
 await check('frozen119 Checkout retry reuses its stored payload and settles at119 after cutover',async()=>{
  const g=await group('cutovercheckout119'),attempt='attempt_cutover_checkout119_01',offer=packageFor('download_119_v1'),payload={mode:'payment','line_items[0][price_data][currency]':'thb','line_items[0][price_data][unit_amount]':11900,'line_items[0][price_data][product_data][name]':`IDพร้อม — ${offer.name}`,'line_items[0][quantity]':1,'payment_method_types[0]':'promptpay',success_url:'https://frozen.invalid/?payment=success&session_id={CHECKOUT_SESSION_ID}',cancel_url:'https://frozen.invalid/?payment=cancelled','metadata[wallet_id]':g.wallet,'metadata[package_id]':'download_119_v1','metadata[job_id]':g.jobs[0]};
  const row=await intentStore.reserve({walletId:g.wallet,scope:g.scope,packageId:'download_119_v1',jobId:g.jobs[0],email:'old@fixture.invalid',attempt,channel:'checkout',payload});
  const out=await checkout(g.jobs[1],{packageId:'89',attempt});assert.equal(out.status,200);assert.equal(out.data.packageId,'119');assert.equal(out.data.packageKey,'download_119_v1');const post=gatewayCalls.find(call=>call.endpoint==='checkout/sessions'&&call.key===row.idempotency_key);assert.deepEqual(post.params,payload);
  const bound=await intentStore.findActive(g.wallet,g.scope),paid=paySession(bound.intent_id),settled=await paymentApi.settleSession(paid,g.wallet);assert.equal(settled.overlap,false);assert.equal(await policy.allowed(g.wallet,g.jobs[1]),true);assert.equal((await create(g.jobs[1],{packageId:'89'})).status,409);
 });
 await check('89 duplicate after a paid119 uses one8900 refund and retains the original paid work',async()=>{
  const g=await group('duplicate89after119'),first=makeIntent({walletId:g.wallet,jobId:g.jobs[0],status:'succeeded'});intents.set(first.id,first);await paymentApi.settleIntent(clone(first));const duplicate=makeIntent({walletId:g.wallet,jobId:g.jobs[1],packageId:'download_89_v1',status:'succeeded'});intents.set(duplicate.id,duplicate);
  const settled=await paymentApi.settleIntent(clone(duplicate));assert.equal(settled.overlap,true);assert.equal(settled.refundStatus,'succeeded');await paymentApi.settleIntent(clone(duplicate));const posts=gatewayCalls.filter(call=>call.endpoint==='refunds'&&call.params.payment_intent===duplicate.id);assert.equal(posts.length,1);assert.equal(posts[0].params.amount,8900);assert.equal(await policy.allowed(g.wallet,g.jobs[1]),true);
 });
 await check('historic89 own receipt replay does not fabricate a refund or rewrite the old ledger',async()=>{
  const g=await group('historic89own'),old=makeIntent({walletId:g.wallet,jobId:g.jobs[0],packageId:'download_89_v1',status:'succeeded'});intents.set(old.id,old);
  await pool.query('INSERT INTO payments(session_id,wallet_id,credits,package_id,generation_qty,hair_qty,full_edit_reconciled) VALUES($1,$2,0,$3,0,0,false)',[old.id,g.wallet,'download_89_v1']);await pool.query('INSERT INTO paid_image_unlocks(wallet_id,job_id,full_edit) VALUES($1,$2,true)',[g.wallet,g.jobs[0]]);
  const before=refunds.size,out=await paymentApi.settleIntent(clone(old));assert.equal(out.duplicate,true);assert.equal(out.overlap,undefined);assert.equal(refunds.size,before);assert.equal((await pool.query('SELECT count(*)::int AS n FROM download_payment_receipts WHERE session_id=$1',[old.id])).rows[0].n,0);assert.equal(await policy.allowed(g.wallet,g.jobs[1]),true);
 });
 const prioritize=async id=>pool.query("UPDATE promptpay_work_intents SET updated_at='2020-01-01' WHERE id=$1",[id]);
 await check('worker recovers paid89 and159 QR and Checkout without a webhook or browser request',async()=>{
  for(const packageId of ['89','159'])for(const channel of ['promptpay','checkout']){
   const g=await group('workerpaid'+packageId+channel),created=await (channel==='promptpay'?create:checkout)(g.jobs[0],{packageId});assert.equal(created.status,200);
   const row=await intentStore.findActive(g.wallet,g.scope);if(channel==='promptpay')pay(row.intent_id);else paySession(row.intent_id);
   await prioritize(row.id);const posts=gatewayCalls.length;await paymentApi.retryReconciliations();
   assert.equal(gatewayCalls.length,posts,'recovery reads the bound payment without another provider POST');assert.equal(await policy.allowed(g.wallet,g.jobs[1]),true);
   assert.equal(await policy.premiumHair(g.wallet,g.jobs[1]),packageId==='159');assert.equal((await intentStore.findByIntent(row.intent_id)).active,false);
   const count=async()=>(await pool.query('SELECT count(*)::int AS n FROM payments WHERE session_id=$1',[row.intent_id])).rows[0].n;assert.equal(await count(),1);
   if(channel==='promptpay')await paymentApi.settleIntent(clone(intents.get(row.intent_id)));else await paymentApi.settleSession(clone(sessions.get(row.intent_id)),g.wallet);
   await paymentApi.retryReconciliations();assert.equal(await count(),1);assert.equal((await pool.query('SELECT overlap FROM download_payment_receipts WHERE session_id=$1',[row.intent_id])).rows[0].overlap,false);
  }
 });
 await check('worker preserves unpaid and processing payments and skips aged unbound reservations',async()=>{
  for(const status of ['requires_action','processing','canceled']){
   const g=await group('workerstate'+status),created=await create(g.jobs[0]),row=await intentStore.findByIntent(created.data.paymentIntentId);intents.get(row.intent_id).status=status;await prioritize(row.id);
   const posts=gatewayCalls.length;await paymentApi.retryReconciliations();assert.equal(gatewayCalls.length,posts);assert.equal(await policy.allowed(g.wallet,g.jobs[1]),false);assert.equal((await intentStore.findByIntent(row.intent_id)).active,status!=='canceled');
  }
  for(const status of ['open','complete','expired']){
   const g=await group('workercheckoutstate'+status);await checkout(g.jobs[0]);const row=await intentStore.findActive(g.wallet,g.scope);sessions.get(row.intent_id).status=status;await prioritize(row.id);
   const posts=gatewayCalls.length;await paymentApi.retryReconciliations();assert.equal(gatewayCalls.length,posts);assert.equal(await policy.allowed(g.wallet,g.jobs[1]),false);assert.equal((await intentStore.findByIntent(row.intent_id)).active,status!=='expired');
  }
  for(const channel of ['promptpay','checkout']){
   const g=await group('workerunbound'+channel),row=await intentStore.reserve({walletId:g.wallet,scope:g.scope,packageId:'download_89_v1',jobId:g.jobs[0],email:'fixture@invalid.test',attempt:'attempt_worker_unbound_'+channel,channel,payload:{}});
   await pool.query("UPDATE promptpay_work_intents SET created_at=now()-interval '48 hours',updated_at='2020-01-01' WHERE id=$1",[row.id]);const posts=gatewayCalls.length;await paymentApi.retryReconciliations();assert.equal(gatewayCalls.length,posts);assert.equal((await intentStore.findActive(g.wallet,g.scope)).intent_id,null);assert.equal(await policy.allowed(g.wallet,g.jobs[0]),false);
  }
 });
 await check('worker verifies every bound provider identity, frozen amount and owned work before granting',async()=>{
  const variants=[['id',p=>p.id='pi_other'],['wallet',p=>p.metadata.wallet_id='walletB'],['job',p=>p.metadata.job_id='foreign'],['package',p=>p.metadata.package_id='download_159_hair_v1'],['flow',p=>p.metadata.flow='other_flow'],['currency',p=>p.currency='usd'],['amount',p=>p.amount=15900],['received',p=>p.amount_received=0],['scope',null]];
  for(const [name,mutate] of variants){
   const g=await group('workerbad'+name),created=await create(g.jobs[0]),row=await intentStore.findByIntent(created.data.paymentIntentId);pay(row.intent_id);const payment=intents.get(row.intent_id);if(mutate)mutate(payment);else await pool.query('UPDATE promptpay_work_intents SET work_scope=$2 WHERE id=$1',[row.id,'wrong_scope']);
   await prioritize(row.id);await paymentApi.retryReconciliations();assert.equal((await pool.query('SELECT count(*)::int AS n FROM payments WHERE session_id=$1',[row.intent_id])).rows[0].n,0,name);assert.equal(await policy.allowed(g.wallet,g.jobs[0]),false,name);await intentStore.close(row.id,row.intent_id);
  }
  for(const [name,mutate] of [['mode',p=>p.mode='subscription'],['wallet',p=>p.metadata.wallet_id='walletB'],['job',p=>p.metadata.job_id='foreign'],['package',p=>p.metadata.package_id='download_159_hair_v1'],['id',p=>p.id='cs_other'],['amount',p=>p.amount_total=15900],['currency',p=>p.currency='usd']]){
   const g=await group('workerbadcheckout'+name);await checkout(g.jobs[0]);const row=await intentStore.findActive(g.wallet,g.scope);paySession(row.intent_id);mutate(sessions.get(row.intent_id));await prioritize(row.id);await paymentApi.retryReconciliations();assert.equal((await pool.query('SELECT count(*)::int AS n FROM payments WHERE session_id=$1',[row.intent_id])).rows[0].n,0,name);assert.equal(await policy.allowed(g.wallet,g.jobs[0]),false,name);await intentStore.close(row.id,row.intent_id);
  }
 });
 await check('post-grant queue or close failure still reports paid rights and durable recovery stays idempotent',async()=>{
  for(const packageId of ['89','159'])for(const channel of ['promptpay','checkout'])for(const method of ['queueReconcile','close']){
   const g=await group('workeraftergrant'+packageId+channel+method);await (channel==='promptpay'?create:checkout)(g.jobs[0],{packageId});const row=await intentStore.findActive(g.wallet,g.scope);if(channel==='promptpay')pay(row.intent_id);else paySession(row.intent_id);
   const original=intentStore[method];intentStore[method]=async()=>{throw Object.assign(Error('fixture storage temporarily unavailable'),{code:'TEMPORARY'})};
   try{
    const out=channel==='promptpay'?await poll(row.intent_id):{status:200,data:await paymentApi.settleSession(clone(sessions.get(row.intent_id)),g.wallet)};
    assert.equal(out.status,200);if(channel==='promptpay')assert.equal(out.data.ok,true);assert.equal(out.data.reconciliationPending,true);assert(out.data.unlockedJobIds.includes(g.jobs[0]));assert.equal(await policy.allowed(g.wallet,g.jobs[1]),true);assert.equal((await intentStore.findByIntent(row.intent_id)).active,true);
   }finally{intentStore[method]=original}
   await prioritize(row.id);await paymentApi.retryReconciliations();assert.equal((await intentStore.findByIntent(row.intent_id)).active,false);assert.equal((await pool.query('SELECT count(*)::int AS n FROM payments WHERE session_id=$1',[row.intent_id])).rows[0].n,1);assert.equal((await pool.query('SELECT overlap FROM download_payment_receipts WHERE session_id=$1',[row.intent_id])).rows[0].overlap,false);
  }
 });
 await check('bounded oldest-checked batches remain fair through provider outages and overlapping timer calls',async()=>{
  // Previous cases are finished; isolate scheduling order in this test database.
  await pool.query('UPDATE promptpay_work_intents SET active=false');await pool.query('UPDATE promptpay_work_reconciliation SET pending=false');
  const blocked=new Set();let paid;
  for(let i=0;i<13;i++){
   const g=await group('workerfair'+i),created=await create(g.jobs[0]),row=await intentStore.findByIntent(created.data.paymentIntentId);await pool.query("UPDATE promptpay_work_intents SET updated_at='2020-01-01'::timestamptz+$2::int*interval '1 second' WHERE id=$1",[row.id,i]);
   if(i<12)blocked.add(row.intent_id);else{pay(row.intent_id);paid={g,row}}
  }
  const reads=[],worker=registerPromptpayApi({post(){},get(){}},{...apiOptions,stripeGet:async endpoint=>{reads.push(endpoint);if(blocked.has(endpoint.split('/').at(-1)))throw Object.assign(Error('fixture provider unavailable'),{code:'TEMPORARY'});return stripeGet(endpoint)}});
  await Promise.all([worker.retryReconciliations(),worker.retryReconciliations()]);assert.equal(reads.length,10);assert.equal(await policy.allowed(paid.g.wallet,paid.g.jobs[0]),false);
  const posts=gatewayCalls.length;await worker.retryReconciliations();assert.equal(reads.length,20);assert.equal(await policy.allowed(paid.g.wallet,paid.g.jobs[1]),true);assert.equal(gatewayCalls.length,posts);assert.equal(new Set(reads).size,13);
 });
 const results={passed:cases.length,cases,concurrentTrace,fixtureIntentCount:intents.size,scope:'Actual grouped PromptPay API, reservation SQL, download-policy SQL and payment grants in isolated PGlite; inert provider fixtures only',limits:'PGlite has one connection; a serialized connection adapter plus paused gateway models transaction interleavings and provider idempotency, not native PostgreSQL multi-process lock execution'};
 if(process.env.GROUPED_PROMPTPAY_RESULTS){await mkdir(dirname(process.env.GROUPED_PROMPTPAY_RESULTS),{recursive:true});await writeFile(process.env.GROUPED_PROMPTPAY_RESULTS,JSON.stringify(results,null,2)+'\n')}
 console.log(JSON.stringify(results));
}finally{console.error=originalConsole;await db.close()}
