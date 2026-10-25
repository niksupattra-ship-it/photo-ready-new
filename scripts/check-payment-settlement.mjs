import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {PACKAGES} from '../package-rules.js';
import {verifyStripeSignature,settleCheckout} from '../stripe-payment-validation.js';
import {registerPromptpayApi,settlePromptpay} from '../promptpay-api.js';

let passed=0;
async function check(name,run){await run();passed++;console.log('PASS '+name)}
const secret='local-test-signing-secret',now=Date.now(),timestamp=String(Math.floor(now/1000));
const raw=Buffer.from('{"type":"fixture","text":"ทดสอบ"}');
const sign=(body,t=timestamp)=>crypto.createHmac('sha256',secret).update(t+'.').update(body).digest('hex');
await check('Stripe signature validates the exact raw UTF-8 bytes',()=>assert(verifyStripeSignature(raw,`t=${timestamp},v1=${sign(raw)}`,secret,now)));
await check('rotated signatures work in either order and allow header whitespace',()=>{
 const good=sign(raw),other='0'.repeat(64);
 for(const header of [`t=${timestamp},v1=${good},v1=${other}`,`t=${timestamp}, v1=${other}, v1=${good}`])assert(verifyStripeSignature(raw,header,secret,now));
});
await check('altered bodies, stale, malformed and nonnumeric timestamps fail',()=>{
 for(const [body,header] of [[Buffer.from('{}'),`t=${timestamp},v1=${sign(raw)}`],[raw,`t=${Number(timestamp)-301},v1=${sign(raw,String(Number(timestamp)-301))}`],[raw,`t=NaN,v1=${sign(raw,'NaN')}`],[raw,`t=${timestamp},v1=oops`]])assert.equal(verifyStripeSignature(body,header,secret,now),false);
 assert.equal(verifyStripeSignature(raw,`t=${timestamp},v1=${sign(raw)}`,'',now),false);
});
const checkout=(packageId='download_119_v1',overrides={})=>({id:'cs_test_fixture',mode:'payment',payment_status:'paid',currency:'thb',amount_total:PACKAGES[packageId].price*100,metadata:{wallet_id:'walletA',package_id:packageId,job_id:'jobA'},...overrides});
const intent=(packageId='download_119_v1',overrides={})=>({id:'pi_fixture',status:'succeeded',currency:'thb',amount:PACKAGES[packageId].price*100,amount_received:PACKAGES[packageId].price*100,metadata:{flow:'idprom_promptpay_v1',wallet_id:'walletA',package_id:packageId,job_id:'jobA'},...overrides});
await check('every frozen Checkout package retains its original grant and image metadata',async()=>{
 for(const packageId of Object.keys(PACKAGES)){
  let received;await settleCheckout(checkout(packageId),async(...args)=>{received=args},'walletA');
  assert.deepEqual(received,['walletA','cs_test_fixture',packageId,'jobA']);
 }
 let received;await settleCheckout(checkout('149',{metadata:{wallet_id:'walletA'}}),async(...args)=>{received=args});assert.deepEqual(received,['walletA','cs_test_fixture','149','']);
});
await check('Checkout rejects unverified totals, currency, unpaid state, ownership and missing images before granting',async()=>{
 let grants=0;const grant=async()=>{grants++};
 for(const overrides of [{amount_total:1},{amount_total:undefined},{amount_total:NaN},{amount_total:'11900'},{currency:'usd'},{mode:'subscription'},{id:'not-a-session'},{payment_status:'unpaid'},{metadata:{wallet_id:'walletA',package_id:'unknown'}},{metadata:{wallet_id:'walletA',package_id:'download_119_v1'}}])await assert.rejects(settleCheckout(checkout('download_119_v1',overrides),grant));
 await assert.rejects(settleCheckout(checkout(),grant,'walletB'),/wallet_mismatch/);assert.equal(grants,0);
});
await check('PromptPay requires an integer received amount and rejects incomplete metadata',async()=>{
 let grants=0;const grant=async()=>{grants++};await settlePromptpay(intent(),grant);assert.equal(grants,1);
 for(const overrides of [{amount_received:undefined},{amount_received:NaN},{amount_received:'11900'},{amount_received:11899},{amount:NaN},{amount:11899},{currency:'usd'},{id:'not-an-intent'},{metadata:{flow:'idprom_promptpay_v1',wallet_id:'walletA',package_id:'download_119_v1'}}])await assert.rejects(settlePromptpay(intent('download_119_v1',overrides),grant));
 assert.equal(grants,1);
});

// Use the production route bodies with fake authenticated accounts and a local
// gateway. No application server imports, environment secrets or remote calls.
const source=await readFile(new URL('../server.js',import.meta.url),'utf8');
const app=express(),ledger=new Map(),gateway=new Map(),posted=[];
let createResult;
const creditPaid=async(walletId,id,packageId,jobId)=>{
 const duplicate=ledger.has(id);if(!duplicate)ledger.set(id,{walletId,packageId,jobId});
 return {duplicate,walletId,unlockedJobIds:[...ledger.values()].filter(x=>x.walletId===walletId).map(x=>x.jobId)};
};
const stripeGet=async endpoint=>{const value=gateway.get(endpoint);if(!value)throw Error('missing_gateway_fixture');return structuredClone(value)};
const stripePost=async(endpoint,params,key)=>{posted.push({endpoint,params,key});if(endpoint.endsWith('/cancel'))return {status:'canceled'};return structuredClone(createResult)};
const silent={info(){},warn(){},error(){}};
const webhookSource=source.slice(source.indexOf('app.post("/api/payments/stripe-webhook"'),source.indexOf("app.use('/api/saved-work'"));
new Function('app','express','verifyStripeSignature','settleCheckout','creditPaid','settlePromptpay','console','process',webhookSource)(app,express,verifyStripeSignature,settleCheckout,creditPaid,settlePromptpay,silent,{env:{STRIPE_WEBHOOK_SECRET:secret}});
app.use(express.json());
app.use((req,res,next)=>{if(req.get('X-Test-Account'))req.accountUser={wallet_id:req.get('X-Test-Account'),email:'fixture@example.test'};next()});
const confirmSource=source.slice(source.indexOf('app.post("/api/payments/confirm"'),source.indexOf('app.post("/api/wallet"'));
new Function('app','walletId','stripeGet','settleCheckout','creditPaid','console',confirmSource)(app,req=>req.accountUser?.wallet_id||req.get('X-Wallet-Id'),stripeGet,settleCheckout,creditPaid,silent);
const checkoutSource=source.slice(source.indexOf("app.post('/api/payments/checkout',async"),source.indexOf('registerPromptpayApi(app'));
const {checkoutPackage}=await import('../package-rules.js');
new Function('app','authUser','ensureWallet','checkoutPackage','downloadPolicy','APP_URL','crypto','stripePost','console',checkoutSource)(app,async()=>null,async()=>{},checkoutPackage,{ownedJob:async(wid,id)=>{if(wid!=='walletA'||id!=='jobA')throw Error('image_not_owned')},premiumHair:async()=>false,allowed:async()=>false},'https://fixture.invalid',crypto,stripePost,silent);
registerPromptpayApi(app,{stripePost,stripeGet,ensureWallet:async()=>{},getAiJobResult:async(id,wallet)=>id==='jobA'&&wallet==='walletA'?{status:'completed'}:null,creditPaid});
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const request=async(path,{account='walletA',method='GET',body,headers={}}={})=>{
 const response=await fetch(base+path,{method,headers:{...(account?{'X-Test-Account':account}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
 const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:response.status,data};
};
const webhook=async(type,object,{signature=true}={})=>{
 const body=JSON.stringify({type,data:{object}}),signatureHeader=signature?`t=${timestamp},v1=${sign(Buffer.from(body))}`:`t=${timestamp},v1=${'0'.repeat(64)}`;
 const response=await fetch(base+'/api/payments/stripe-webhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':signatureHeader},body});return response.status;
};
const originalConsoleError=console.error;
console.error=()=>{}; // Expected rejected local gateway fixtures exercise error handlers.
try{
 await check('unsigned or tampered webhook cannot grant rights',async()=>{assert.equal(await webhook('checkout.session.completed',checkout(),{signature:false}),400);assert.equal(ledger.size,0)});
 await check('unrelated and unpaid Checkout events are acknowledged without granting',async()=>{assert.equal(await webhook('checkout.session.completed',checkout('download_119_v1',{metadata:{}})),200);assert.equal(await webhook('checkout.session.completed',checkout('download_119_v1',{payment_status:'unpaid'})),200);assert.equal(ledger.size,0)});
 await check('underpaid Checkout webhook cannot grant rights',async()=>{assert.equal(await webhook('checkout.session.completed',checkout('download_119_v1',{amount_total:100})),500);assert.equal(ledger.size,0)});
 await check('return confirmation settles a lost callback and webhook replay preserves one purchase',async()=>{
  const session=checkout();gateway.set('checkout/sessions/'+session.id,session);
  const returned=await request('/api/payments/confirm',{method:'POST',body:{sessionId:session.id}});assert.equal(returned.status,200);assert.equal(returned.data.jobId,'jobA');assert.equal(returned.data.duplicate,false);
  assert.equal(await webhook('checkout.session.async_payment_succeeded',session),200);assert.equal(await webhook('checkout.session.completed',session),200);
  const duplicate=await request('/api/payments/confirm',{method:'POST',body:{sessionId:session.id}});assert.equal(duplicate.data.duplicate,true);assert.equal(ledger.size,1);
 });
 await check('Checkout confirmation cannot transfer another account purchase',async()=>{const out=await request('/api/payments/confirm',{account:'walletB',method:'POST',body:{sessionId:'cs_test_fixture'}});assert.equal(out.status,403);assert.equal(out.data.error,'wallet_mismatch');assert.equal(ledger.size,1)});
 await check('Checkout retries use stable optional keys and fixed PromptPay THB prices',async()=>{
  createResult={url:'https://checkout.stripe.com/fixture'};posted.length=0;
  for(let i=0;i<2;i++)assert.equal((await request('/api/payments/checkout',{method:'POST',body:{packageId:'119',jobId:'jobA'},headers:{'X-Checkout-Attempt':'attempt_fixture_123'}})).status,200);
  assert.equal(posted[0].key,posted[1].key);assert(posted[0].key);assert.equal(posted[0].params['line_items[0][price_data][unit_amount]'],11900);assert.equal(posted[0].params['payment_method_types[0]'],'promptpay');
 });
 await check('PromptPay creation requires account, owned completed image, current offer and attempt',async()=>{
  const valid={packageId:'119',jobId:'jobA'};
  assert.equal((await request('/api/payments/promptpay',{method:'POST',account:'',body:valid})).status,401);
  for(const body of [{...valid,jobId:'someone-else'},valid,{...valid,packageId:'149'}])assert.equal((await request('/api/payments/promptpay',{method:'POST',body})).status,400);
 });
 await check('PromptPay retries keep the deployed idempotency key and return settled rights if already paid',async()=>{
  createResult=intent();posted.length=0;const attempt='attempt_fixture_123';
  const out=await request('/api/payments/promptpay',{method:'POST',body:{packageId:'119',jobId:'jobA'},headers:{'X-Checkout-Attempt':attempt}});
  assert.equal(out.status,200);assert.equal(out.data.ok,true);assert(out.data.unlockedJobIds.includes('jobA'));
  assert.equal(posted[0].key,crypto.createHash('sha256').update('idprom_promptpay_v1'+'walletA'+'download_119_v1'+attempt).digest('hex'));
 });
 await check('owned polling reconciles a lost PromptPay webhook and duplicate webhook remains one grant',async()=>{
  const paid=intent('download_159_hair_v1',{id:'pi_lostcallback'});gateway.set('payment_intents/'+paid.id,paid);
  assert.equal((await request('/api/payments/promptpay/'+paid.id,{account:'walletB'})).status,403);
  const before=ledger.size,out=await request('/api/payments/promptpay/'+paid.id);assert.equal(out.data.ok,true);assert.equal(ledger.size,before+1);
  assert.equal(await webhook('payment_intent.succeeded',paid),200);assert.equal(ledger.size,before+1);
 });
 await check('PromptPay cancellation blocks processing and settles a completed payment',async()=>{
  gateway.set('payment_intents/pi_processing',intent('download_119_v1',{id:'pi_processing',status:'processing'}));assert.equal((await request('/api/payments/promptpay/pi_processing/cancel',{method:'POST',body:{}})).status,409);
  const out=await request('/api/payments/promptpay/pi_lostcallback/cancel',{method:'POST',body:{}});assert.equal(out.status,200);assert.equal(out.data.ok,true);
 });
 await check('unpaid and canceled PromptPay statuses never unlock an image',async()=>{
  const before=ledger.size;for(const status of ['requires_action','canceled','requires_payment_method']){
   gateway.set('payment_intents/pi_unpaid',intent('download_119_v1',{id:'pi_unpaid',status}));assert.equal((await request('/api/payments/promptpay/pi_unpaid')).data.ok,false);
  }assert.equal(ledger.size,before);
 });
 await check('QR image proxy rejects a non-Stripe host without fetching it',async()=>{
  gateway.set('payment_intents/pi_badhost',intent('download_119_v1',{id:'pi_badhost',status:'requires_action',next_action:{promptpay_display_qr_code:{image_url_png:'https://stripe.com.evil.invalid/qr.png'}}}));assert.equal((await request('/api/payments/promptpay/pi_badhost/image')).status,400);
 });
}finally{console.error=originalConsoleError;await new Promise(resolve=>server.close(resolve))}
console.log(JSON.stringify({passed,scope:'Actual payment route bodies, signatures and settlement validators; injected local Stripe/account/ledger fixtures, no production API, payment, database or customer writes'}));
