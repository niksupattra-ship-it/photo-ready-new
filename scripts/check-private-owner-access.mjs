import assert from 'node:assert/strict';
import express from 'express';
import crypto from 'node:crypto';
import {isPrivateOwner,hasPrivateTrial,registerPrivateTrial} from '../private-trial.js';

// Only req.accountUser populated by the verified session middleware establishes
// identity. Client email, private-mode, wallet and cookie claims cannot do so.
const owner={id:'owner-user',email:'treeradech009@gmail.com',wallet_id:'owner-wallet'};
const other={id:'other-user',email:'other@example.invalid',wallet_id:'other-wallet'};
const request=(accountUser=null,headers={},body={})=>({accountUser,body,get:name=>headers[name.toLowerCase()]||''});
let passed=0;
const check=async(name,run)=>{await run();passed++;console.log('PASS '+name)};

await check('authenticated owner receives automatic access without a private header or cookie',()=>{
 const req=request(owner);assert.equal(isPrivateOwner(req,owner.wallet_id),true);assert.equal(hasPrivateTrial(req,owner.wallet_id),true);
});
await check('case and surrounding whitespace normalize only the verified account email',()=>{
 assert.equal(isPrivateOwner(request({...owner,email:' TREERADECH009@GMAIL.COM '}),owner.wallet_id),true);
});
await check('owner account cannot authorize a different wallet',()=>{
 assert.equal(isPrivateOwner(request(owner),other.wallet_id),false);assert.equal(hasPrivateTrial(request(owner),other.wallet_id),false);
});
await check('a different authenticated account cannot copy the owner email into client fields',()=>{
 const req=request(other,{'x-wallet-id':owner.wallet_id,'x-idprom-email':owner.email,'x-idprom-private-trial':'1'},{email:owner.email,owner:true});
 assert.equal(isPrivateOwner(req,other.wallet_id),false);assert.equal(isPrivateOwner(req,owner.wallet_id),false);assert.equal(hasPrivateTrial(req,other.wallet_id),false);
});
await check('unauthenticated copied wallet, email, key or private headers never authorize ownership',()=>{
 const req=request(null,{'x-wallet-id':owner.wallet_id,'x-idprom-email':owner.email,'x-idprom-private-trial':'1'},{email:owner.email,key:'owner'});
 assert.equal(isPrivateOwner(req,owner.wallet_id),false);assert.equal(hasPrivateTrial(req,owner.wallet_id),false);
});
await check('missing identity, wallet or email fails closed',()=>{
 for(const user of [null,{}, {...owner,email:null},{...owner,wallet_id:null}])assert.equal(isPrivateOwner(request(user),owner.wallet_id),false);
 assert.equal(isPrivateOwner(request(owner),''),false);
});
await check('legacy signed private cookie remains wallet-bound without granting owner identity',()=>{
 const prevKey=process.env.IDPROM_PRIVATE_TRIAL_KEY,prevSecret=process.env.TRIAL_DEVICE_SECRET;
 try{
  const key='fixture-private-key-'.repeat(4),secret='fixture-signing-secret',device='a'.repeat(64);
  process.env.IDPROM_PRIVATE_TRIAL_KEY=key;process.env.TRIAL_DEVICE_SECRET=secret;
  const signature=crypto.createHmac('sha256',secret).update('private-trial-v1:'+key+':'+device+':'+other.wallet_id).digest('hex');
  const req=request(other,{cookie:'idprom_private_trial='+device+'.'+signature});
  assert.equal(hasPrivateTrial(req,other.wallet_id),true);assert.equal(isPrivateOwner(req,other.wallet_id),false);
  assert.equal(hasPrivateTrial(req,owner.wallet_id),false);
  assert.equal(hasPrivateTrial(request(null,{cookie:'idprom_private_trial='+device+'.'+'0'.repeat(64)}),other.wallet_id),false);
 }finally{
  if(prevKey===undefined)delete process.env.IDPROM_PRIVATE_TRIAL_KEY;else process.env.IDPROM_PRIVATE_TRIAL_KEY=prevKey;
  if(prevSecret===undefined)delete process.env.TRIAL_DEVICE_SECRET;else process.env.TRIAL_DEVICE_SECRET=prevSecret;
 }
});

// Test actual registered HTTP endpoints with an inert session-identity boundary;
// no database, account lookup, email, AI or payment provider is contacted.
const app=express();app.use(express.json());let reads=0;
app.use((req,res,next)=>{req.accountUser=req.get('authorization')==='Bearer owner-session'?owner:req.get('authorization')==='Bearer other-session'?other:null;next()});
registerPrivateTrial(app,{walletId:req=>req.accountUser?.wallet_id||req.get('x-wallet-id')||'',getWallet:async id=>{reads++;return{id}},appUrl:'https://example.invalid'});
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base='http://127.0.0.1:'+server.address().port;
const call=async(path,options={})=>{const r=await fetch(base+path,options);return{status:r.status,cache:r.headers.get('cache-control'),data:await r.json()}};
const activate=headers=>call('/api/private-trial',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({key:'owner'})});
try{
 await check('owner HTTP status activates automatically from authenticated identity',async()=>{
  const r=await call('/api/private-trial',{headers:{Authorization:'Bearer owner-session'}});assert.equal(r.status,200);assert.equal(r.data.active,true);assert.equal(r.data.ownerAccess,true);assert.equal(r.cache,'no-store');
 });
 await check('normal and unauthenticated HTTP requests remain inactive despite forged flags',async()=>{
  for(const headers of [{Authorization:'Bearer other-session','X-Wallet-Id':owner.wallet_id,'X-IDPROM-Private-Trial':'1'},{'X-Wallet-Id':owner.wallet_id,'X-IDPROM-Email':owner.email}]){const r=await call('/api/private-trial',{headers});assert.equal(r.data.active,false);assert.equal(r.data.ownerAccess,false)}
 });
 await check('an anonymous signed private cookie reports active without owner-wide entitlement',async()=>{
  const prevKey=process.env.IDPROM_PRIVATE_TRIAL_KEY,prevSecret=process.env.TRIAL_DEVICE_SECRET;
  try{
   const key='fixture-private-key-'.repeat(4),secret='fixture-signing-secret',device='b'.repeat(64),wallet='anonymous-fixture-wallet';
   process.env.IDPROM_PRIVATE_TRIAL_KEY=key;process.env.TRIAL_DEVICE_SECRET=secret;
   const signature=crypto.createHmac('sha256',secret).update('private-trial-v1:'+key+':'+device+':'+wallet).digest('hex');
   const r=await call('/api/private-trial',{headers:{'X-Wallet-Id':wallet,Cookie:'idprom_private_trial='+device+'.'+signature}});
   assert.equal(r.data.active,true);assert.equal(r.data.ownerAccess,false);
  }finally{
   if(prevKey===undefined)delete process.env.IDPROM_PRIVATE_TRIAL_KEY;else process.env.IDPROM_PRIVATE_TRIAL_KEY=prevKey;
   if(prevSecret===undefined)delete process.env.TRIAL_DEVICE_SECRET;else process.env.TRIAL_DEVICE_SECRET=prevSecret;
  }
 });
 await check('owner activation validates account identity before any wallet read',async()=>{
  const before=reads;assert.equal((await activate({'X-Wallet-Id':owner.wallet_id})).status,401);assert.equal((await activate({Authorization:'Bearer other-session'})).status,403);assert.equal(reads,before);
  const r=await activate({Authorization:'Bearer owner-session','X-Wallet-Id':'forged-wallet'});assert.equal(r.status,200);assert.equal(r.data.active,true);assert.equal(r.data.ownerAccess,true);assert.equal(reads,before+1);
 });
}finally{await new Promise(resolve=>server.close(resolve))}
console.log(JSON.stringify({passed,scope:'Actual private-owner predicate and registered private-trial HTTP routes; verified-session boundary is a local fixture. No production account lookup or provider calls.'}));
