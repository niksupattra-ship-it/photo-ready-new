import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {packageFor} from '../package-rules.js';
const source=await readFile(new URL('../server.js',import.meta.url),'utf8');
const section=source.slice(source.indexOf("app.post('/api/payments/english-checkout'"),source.indexOf("app.post('/api/payments/checkout'"));
function fixture(options={}){
 let handler,calls=[];const app={post(_path,fn){handler=fn}};
 Function('app','packageFor','getWallet','getAiJob','accountPolicy','ensureWallet','APP_URL','stripePost','crypto','console',section)(app,packageFor,async()=>{if(options.storageFailure)throw Error('inert database failure');return options.wallet||{}},async(id,wallet)=>id==='job_fixture'&&wallet==='wallet_fixture'?(options.job===undefined?{status:'completed',has_result:true,created_at:new Date().toISOString()}:options.job):null,()=>({allowed:async()=>Boolean(options.unlocked)}),async()=>{},'https://example.test',async(endpoint,params,key)=>{calls.push({endpoint,params,key});const session={currency:'usd',amount_total:Number(params['line_items[0][price_data][unit_amount]']),metadata:{wallet_id:params['metadata[wallet_id]'],job_id:params['metadata[job_id]'],package_id:params['metadata[package_id]']},url:'https://checkout.stripe.com/fixture'};return options.gateway?options.gateway(session):session},crypto,{error(){}});
 const request=async(patch={})=>{
  let status=200,data;const headers={};const res={status(n){status=n;return this},json(value){data=value;return this},set(k,v){headers[k]=v;return this}};
  const req={accountUser:{id:'user_fixture',wallet_id:'wallet_fixture',email:'fixture@example.test'},body:{packageId:'usd_single_690_v2',jobId:'job_fixture',amount:1,currency:'thb',...patch.body},get:k=>k==='X-Checkout-Attempt'?(patch.attempt||'attempt_fixture_123456'):'example.test',protocol:'https'};
  if(patch.anonymous)delete req.accountUser;
  await handler(req,res);return{status,data,headers};
 };
 return{request,calls};
}
test('English checkout requires an account, an owned completed photo, a current plan and a valid attempt',async()=>{
 const f=fixture();assert.equal((await f.request({anonymous:true})).status,401);
 for(const body of [{packageId:'89'},{jobId:'other'},{packageId:'invalid'}])assert.equal((await f.request({body})).status,400);
 assert.equal((await f.request({attempt:'bad'})).status,400);assert.equal(f.calls.length,0);
 for(const job of [null,{status:'processing',has_result:false},{status:'completed',has_result:false}]){
  const f=fixture({job});assert.equal((await f.request()).status,400);assert.equal(f.calls.length,0);
 }
});
test('expired or unlocked photos and an active Premium plan cannot start another charge',async()=>{
 const expired=fixture({job:{status:'completed',has_result:true,created_at:new Date(Date.now()-7*86400000-1000).toISOString()}});assert.equal((await expired.request()).status,410);assert.equal(expired.calls.length,0);
 const paid=fixture({unlocked:true});assert.equal((await paid.request()).status,409);assert.equal(paid.calls.length,0);
 const premium=fixture({wallet:{usdPremiumActive:true,usdPremiumRemaining:7}});assert.equal((await premium.request({body:{packageId:'usd_premium_1490_v2'}})).status,409);assert.equal(premium.calls.length,0);
});
test('checkout fixes USD prices on the server and uses a stable scoped idempotency key for retries',async()=>{
 for(const [id,cents]of [['usd_single_690_v2',690],['usd_premium_1490_v2',1490]]){
  const f=fixture();const first=await f.request({body:{packageId:id}}),retry=await f.request({body:{packageId:id}});
  assert.equal(first.status,200);assert.equal(retry.status,200);assert.equal(first.data.currency,'usd');assert.equal(first.data.amountCents,cents);assert.equal(first.headers['Cache-Control'],'no-store');
  assert.equal(f.calls[0].key,f.calls[1].key);assert.equal(f.calls[0].params['line_items[0][price_data][currency]'],'usd');assert.equal(f.calls[0].params['line_items[0][price_data][unit_amount]'],cents);assert.equal(f.calls[0].params['payment_method_types[0]'],'card');
 }
});
test('gateway currency, amount, ownership and destination mismatches never produce a redirect',async()=>{
 for(const gateway of [s=>({...s,currency:'thb'}),s=>({...s,amount_total:1}),s=>({...s,metadata:{...s.metadata,wallet_id:'other'}}),s=>({...s,metadata:{...s.metadata,job_id:'other'}}),s=>({...s,url:'https://checkout.stripe.com@other.invalid/'}),s=>({...s,url:'http://checkout.stripe.com/'})]){
  const f=fixture({gateway}),r=await f.request();assert.equal(r.status,503);assert.equal(r.data.url,undefined);
 }
 const f=fixture({storageFailure:true});const r=await f.request({body:{packageId:'usd_premium_1490_v2'}});assert.equal(r.status,503);assert.equal(f.calls.length,0);assert(!JSON.stringify(r.data).includes('inert database'));
});
