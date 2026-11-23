import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../server.js',import.meta.url),'utf8');
const section=source.slice(source.indexOf('const jobOutfitGenerationCache=new Map();'),source.indexOf('\nconst activeAiJobs=new Set();'));
function fixture(){
 let handler,generated=0,reserved=0,committed=0,refunded=0,fail=false,allow=true;
 const app={post(_path,...handlers){handler=handlers.at(-1)}};
 Function('app','upload','walletId','isJobOutfitTemplate','getAiJobResult','process','getWallet','reserveUsdPremiumCredit','generateJobOutfit','commitCredit','refundCredit','dir','modnetRemoveBackground','console','setTimeout',section)(
  app,{fields:()=>()=>{}},r=>r.wallet,()=>true,async(id,wallet)=>wallet==='owner'?{status:'completed',result:Buffer.from('owned')}:null,{env:{ARK_API_KEY:'inert'}},async()=>{await new Promise(setImmediate);return{usdPremiumPurchased:true}},async()=>{reserved++;return allow?{usageId:'use_'+reserved}:{}},async()=>{generated++;await new Promise(setImmediate);if(fail)throw Error('inert provider failure');return{png:Buffer.from('result')}},async()=>{committed++;return true},async()=>{refunded++;return true},'/inert',()=>{},{error(){}},()=>({unref(){}}));
 const request=async({wallet='owner',job='a'.repeat(36),template='/assets/job-uniforms/test.png',anonymous=false}={})=>{
  let status=200,body;const req={wallet,accountUser:{wallet_id:wallet},body:{jobId:'job_'+job,templatePath:template},files:{image:[{buffer:Buffer.from('png'),mimetype:'image/png'}],head:[{buffer:Buffer.from('png'),mimetype:'image/png'}]}},res={status(s){status=s;return this},send(b){body=b;return this},type(){return this},set(){return this}};
  if(anonymous)delete req.accountUser;
  await handler(req,res);return{status,body};
 };
 return{request,fail:v=>{fail=v},allow:v=>{allow=v},counts:()=>({generated,reserved,committed,refunded})};
}
test('simultaneous outfit requests reserve one credit and perform one AI generation',async()=>{
 const f=fixture(),results=await Promise.all([f.request(),f.request(),f.request()]);
 assert(results.every(r=>r.status===200));assert.deepEqual(f.counts(),{generated:1,reserved:1,committed:1,refunded:0});
 assert(results.every(r=>r.body.equals(Buffer.from('result'))));
 await f.request();assert.equal(f.counts().generated,1);
});
test('a shared failed outfit request refunds once and permits a later retry',async()=>{
 const f=fixture();f.fail(true);const results=await Promise.all([f.request(),f.request()]);assert(results.every(r=>r.status===502));
 assert.deepEqual(f.counts(),{generated:1,reserved:1,committed:0,refunded:1});
 f.fail(false);assert.equal((await f.request()).status,200);assert.deepEqual(f.counts(),{generated:2,reserved:2,committed:1,refunded:1});
});
test('exhausted credit does not cache a failed result, and ownership is still checked for cached images',async()=>{
 const f=fixture();f.allow(false);assert.equal((await f.request()).status,402);assert.equal(f.counts().generated,0);
 f.allow(true);assert.equal((await f.request()).status,200);assert.equal((await f.request({wallet:'other'})).status,403);assert.equal((await f.request({anonymous:true})).status,401);assert.equal(f.counts().generated,1);
});
