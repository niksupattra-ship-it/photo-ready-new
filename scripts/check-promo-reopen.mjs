import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../payment-store.js',import.meta.url),'utf8');
const start=source.indexOf('export async function redeemPromoPackage'),end=source.indexOf('\nexport async function trialOptionAccess',start);
const code=source.slice(start,end).replace('export ','');
const token='TEST-PROMO-REOPEN',hash=crypto.createHash('sha256').update(token).digest('hex');
const store={redemption:null,balance:0,fullEdit:0,unlocks:new Set(),grants:0};
const queries=[];
const client={release(){},async query(sql,args=[]){queries.push(sql);
 if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]};
 if(sql.startsWith('INSERT INTO wallets'))return {rows:[]};
 if(sql.startsWith('INSERT INTO promo_redemptions')){if(store.redemption)return {rowCount:0,rows:[]};store.redemption={wallet_id:args[1],package_id:args[2]};return {rowCount:1,rows:[{code:args[0]}]}}
 if(sql.startsWith('SELECT wallet_id,package_id'))return {rows:store.redemption?[store.redemption]:[]};
 if(sql.startsWith('UPDATE wallets')){store.balance+=args[1];store.fullEdit+=args[3];store.grants++;return {rows:[]}}
 if(sql.startsWith('INSERT INTO paid_image_unlocks')){store.unlocks.add(args[1]);return {rows:[]}}
 if(sql.startsWith('SELECT generation_remaining'))return {rows:[{generation_remaining:store.balance,hair_remaining:0}]};
 throw Error('Unexpected query: '+sql);
}};
const env={crypto,ready:async()=>{},singleUsePromoPackages:{[hash]:'89_current'},packageFor:()=>({price:89,g:2,h:0,fullEdit:true}),pool:{connect:async()=>client},shape:(walletId,row)=>({walletId,processRemaining:row.generation_remaining+row.hair_remaining}),imageEntitlements:async()=>({unlockedJobIds:[...store.unlocks]})};
const redeem=new Function('env','with(env){'+code+';return redeemPromoPackage}')(env);
let r=await redeem('original-account',token,'first-trial');assert.equal(r.ok,true);assert.equal(r.processRemaining,2);assert.equal(store.grants,1);
store.balance=1;r=await redeem('original-account',token,'second-trial');assert.equal(r.ok,true);assert.equal(r.alreadyRedeemed,true);assert.equal(r.processRemaining,1);assert.equal(store.grants,1);assert(!store.unlocks.has('second-trial'));
store.balance=0;r=await redeem('original-account',token);assert.equal(r.ok,true);assert.equal(r.processRemaining,0);assert.equal(store.grants,1);assert(store.unlocks.has('first-trial'));
assert.deepEqual(await redeem('other-account',token),{ok:false,reason:'used'});
assert.deepEqual(await redeem('original-account','INVALID'),{ok:false,reason:'invalid'});
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const a=main.indexOf(' const redeemFreeLink=async'),b=main.indexOf(' const requireOutputAccess=async',a);const handler=main.slice(a,b);
for(const remaining of [1,0]){
 const events=[];
 const e={claimAccountOutput:async()=>{events.push('claim')},acceptWalletRights:data=>{events.push('rights');e.accepted=data},refreshWallet:async()=>{},portraitFetch:async()=>{events.push('redeem');return {ok:true,json:async()=>({alreadyRedeemed:true,packagePrice:89,processRemaining:remaining,unlockedJobIds:['first-trial']})}},walletHeaders:()=>({}),currentOutputTrialRef:{current:false},currentOutputJobRef:{current:'first-trial'},studioTrialRef:{current:false},normalizedRights:d=>d,setRights:()=>{},setPurchaseEditing:()=>{},setTrialPreview:()=>{},setPayMsg:()=>{},setMsg:()=>{},setBuyOpen:v=>{e.buy=v},setAccountSaveNotice:n=>{e.notice=n},history:{replaceState(){}},location:{pathname:'/'}};
 await new Function('env','with(env){'+handler+';return redeemFreeLink}')(e)(token);
 assert.deepEqual(events,['claim','redeem','rights']);assert.equal(e.accepted.processRemaining,remaining);assert.deepEqual(e.accepted.unlockedJobIds,['first-trial']);assert.equal(e.buy,false);assert.equal(e.notice.state,'success');assert.equal(e.notice.title,'เครดิตในบัญชีของคุณ');assert(e.notice.message.includes(remaining?'1 ครั้ง':'เครดิตหมดแล้ว'));
}
console.log('PASS: first claim grants once; original account resumes remaining/zero credits; repeated claim never grants or unlocks another trial; other account rejected; frontend shows balance without checkout.');
