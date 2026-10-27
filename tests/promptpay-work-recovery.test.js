import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerPromptpayApi} from '../promptpay-api.js';

async function exercise(oldWallet,oldJob){
 const routes={};const app={post:(path,handler)=>routes['POST '+path]=handler,get:(path,handler)=>routes['GET '+path]=handler};let adopted=0,posts=0;
 const old={id:'pi_old',status:'requires_action',amount:8900,currency:'thb',metadata:{flow:'idprom_promptpay_v1',wallet_id:oldWallet,job_id:oldJob,package_id:'download_89_v1'},next_action:{promptpay_display_qr_code:{image_url_png:'https://stripe.com/old.png'}}};
 const row={id:'row',wallet_id:'wallet',job_id:'new',package_id:'download_89_v1',email:'a@example.com',idempotency_key:'key',channel:'promptpay',created_at:new Date().toISOString()};
 const store={adopt:async()=>{adopted++;return {...row,intent_id:'pi_old'}},reserve:async()=>row,bind:async()=>{},close:async()=>{},findByIntent:async()=>null};
 registerPromptpayApi(app,{intentStore:store,ensureWallet:async()=>{},getAiJobResult:async()=>({status:'completed'}),scopeForJob:async(w,j)=>'scope:'+j,stripeGet:async()=>old,stripePost:async()=>{posts++;return {id:'pi_new',status:'requires_action',amount:8900,currency:'thb',metadata:{flow:'idprom_promptpay_v1',wallet_id:'wallet',job_id:'new',package_id:'download_89_v1'},next_action:{promptpay_display_qr_code:{image_url_png:'https://stripe.com/new.png'}}}},creditPaid:async()=>({})});
 let status=200,data;const res={set(){return this},status(s){status=s;return this},json(d){data=d;return this}};
 await routes['POST /api/payments/promptpay']({accountUser:{wallet_id:'wallet',email:'a@example.com'},body:{packageId:'89',jobId:'new',pendingPaymentIntentId:'pi_old'},get:()=> '1234567890123456'},res);
 return {status,data,adopted,posts};
}
test('previous QR for another work does not block a new QR or get adopted',async()=>{const r=await exercise('wallet','old');assert.equal(r.status,200);assert.equal(r.data.paymentIntentId,'pi_new');assert.equal(r.adopted,0);assert.equal(r.posts,1)});
test('same work resumes existing QR rather than creating another',async()=>{const r=await exercise('wallet','new');assert.equal(r.status,200);assert.equal(r.data.paymentIntentId,'pi_old');assert.equal(r.adopted,1);assert.equal(r.posts,0)});
test('a different account cannot claim the previous QR',async()=>{const r=await exercise('other','new');assert.equal(r.status,403);assert.equal(r.adopted,0);assert.equal(r.posts,0)});
