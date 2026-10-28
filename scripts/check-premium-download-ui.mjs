import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {walletScope,hasWalletBalance} from '../src/wallet-refresh.js';
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const dialog=await readFile(new URL('../src/studio-rights-dialog.jsx',import.meta.url),'utf8');
const normalizedRights=new Function(main.slice(main.indexOf('function normalizedRights('),main.indexOf('\nconst GOVERNMENT_FINANCE_TEMPLATE'))+';return normalizedRights')();
const summary=new Function(dialog.slice(dialog.indexOf('export function rightsSummary'),dialog.indexOf('export function StudioRightsDialog')).replace('export ','')+';return rightsSummary')();
function compile(name,e){const a=main.indexOf(' const '+name+'='),b=main.indexOf('\n };',a);assert(a>=0&&b>a,name);return new Function('env',`with(env){${main.slice(a,b+4)};return ${name}}`)(e)}
const rows=[];
async function test(name,run){await run();rows.push({name,passed:true});console.log('PASS '+name)}
const fixture=()=>{
 const events=[],unlocked=new Set(),storage={token:'fixture-token',wallet:'fixture-wallet'};let premium=2,job='work-a',currentRights=normalizedRights({processRemaining:0,premiumDownloadRemaining:premium});
 const e={walletScope,hasWalletBalance,normalizedRights,checkoutReturnRef:{current:null},checkoutBusyRef:{current:false},currentOutputJobRef:{current:job},savedWorkOpenRequestRef:{current:1},
 authToken:()=>storage.token,currentWalletId:()=>storage.wallet,walletHeaders:()=>({Authorization:'Bearer fixture-token','X-Wallet-Id':storage.wallet}),claimAccountOutput:async()=>{},
 portraitFetch:async(url,options)=>{events.push(['request',url,options]);assert.equal(JSON.parse(options.body||'{}').premium,true);const id=decodeURIComponent(url.split('/')[3]);if(!unlocked.has(id)){if(!premium)return {ok:false,status:402,json:async()=>({error:'premium_download_credit_required'})};premium--;unlocked.add(id)}return {ok:true,status:200,json:async()=>({walletId:storage.wallet,processRemaining:0,premiumDownloadRemaining:premium})}},
 refreshWallet:async()=>({walletId:storage.wallet,processRemaining:0,premiumDownloadRemaining:premium}),
 acceptWalletRights:data=>{currentRights=normalizedRights(data);events.push(['balance',currentRights.downloadRemaining])},verifyOutputRights:async id=>({checked:true,unlocked:unlocked.has(id),premiumHair:unlocked.has(id),fullEdit:unlocked.has(id)}),
 };
 for(const name of ['setPendingPackage','setAuthMode','setAuthOpen','setPayMsg','setPayBusy','setBuyOpen','setTrialPreview','setAccountSaveNotice','setDownloadUnlockSignal'])e[name]=value=>events.push([name,value]);
 e.savePaidCheckout=compile('savePaidCheckout',e);e.useDownloadCredit=compile('useDownloadCredit',e);
 return {e,events,storage,unlocked,get premium(){return premium},get rights(){return currentRights},setJob(id){job=id;e.currentOutputJobRef.current=id;e.savedWorkOpenRequestRef.current++}};
};
await test('premium credits add only to download balance; generation, save, and owner remain unchanged',()=>{
 const r=normalizedRights({processRemaining:0,premiumDownloadRemaining:2});assert.equal(r.downloadRemaining,2);assert.equal(r.premiumDownloadRemaining,2);assert.equal(r.generationRemaining,0);assert.equal(r.hairRemaining,0);assert.equal(r.canSave,false);assert.equal(r.ownerAccess,false);assert.equal(r.allFeatures,false);assert.equal(r.unlimitedDownloads,false);assert.equal(summary({...r,processRemaining:0}).credits,2);
 assert.equal(normalizedRights({processRemaining:3,premiumDownloadRemaining:2}).downloadRemaining,5);assert.equal(summary({processRemaining:3,premiumDownloadRemaining:2}).credits,5);assert.equal(summary({processRemaining:3,hairRemaining:3,premiumDownloadRemaining:2}).credits,5,'legacy alias is not counted twice');
});
await test('malformed or absent premium balance never produces finite privileges or invented credit',()=>{
 for(const value of [undefined,null,'bad',-2])assert.equal(normalizedRights({processRemaining:0,premiumDownloadRemaining:value}).premiumDownloadRemaining,0);
 assert.equal(normalizedRights({processRemaining:0,premiumDownloadRemaining:1.9}).premiumDownloadRemaining,1);
 assert.equal(normalizedRights({processRemaining:0,premiumDownloadRemaining:0}).downloadRemaining,0);
});
await test('scoped partial wallet updates preserve premium without counting it twice',()=>{
 let rights=normalizedRights({processRemaining:1,premiumDownloadRemaining:2});const e={walletScope,hasWalletBalance,normalizedRights,authToken:()=> 'token',currentWalletId:()=> 'wallet',walletRefreshRef:{current:{invalidate(){}}},setWalletBalance(){},setRights:fn=>{rights=fn(rights)}};
 const accept=compile('acceptWalletRights',e);for(let i=0;i<3;i++)accept({walletId:'wallet',processRemaining:1});assert.equal(rights.downloadRemaining,3);assert.equal(rights.premiumDownloadRemaining,2);
 accept({walletId:'wallet',processRemaining:0,premiumDownloadRemaining:1});assert.equal(rights.downloadRemaining,1);
 accept({walletId:'wrong',processRemaining:99,premiumDownloadRemaining:99});assert.equal(rights.downloadRemaining,1);
});
await test('two distinct works consume 2→1→0 and keep completed premium work reusable',async()=>{
 const f=fixture();await f.e.useDownloadCredit({premium:true});assert.equal(f.premium,1);assert.equal(f.rights.downloadRemaining,1);assert.equal(f.events.filter(([k])=>k==='setDownloadUnlockSignal').length,1);
 await f.e.useDownloadCredit({premium:true});assert.equal(f.premium,1);assert.equal(f.events.filter(([k])=>k==='setDownloadUnlockSignal').length,2);
 f.setJob('work-b');await f.e.useDownloadCredit({premium:true});assert.equal(f.premium,0);assert.equal(f.rights.downloadRemaining,0);
 f.setJob('work-c');await f.e.useDownloadCredit({premium:true});assert.equal(f.premium,0);assert(!f.unlocked.has('work-c'));assert.equal(f.events.filter(([k])=>k==='setDownloadUnlockSignal').length,3);assert(f.events.some(([k,v])=>k==='setPayMsg'&&v.includes('หมดแล้ว')));
 f.setJob('work-a');await f.e.useDownloadCredit({premium:true});assert.equal(f.premium,0);assert.equal(f.events.filter(([k])=>k==='setDownloadUnlockSignal').length,4);
});
await test('explicit159 upgrade verifies premium hair before closing or removing watermark',async()=>{
 const f=fixture();f.e.verifyOutputRights=async()=>({checked:true,unlocked:true,premiumHair:false});await f.e.useDownloadCredit({premium:true});assert.equal(f.events.filter(([k])=>k==='setDownloadUnlockSignal').length,0);assert(!f.events.some(([k,v])=>k==='setBuyOpen'&&v===false));assert(f.events.some(([k,v])=>k==='setPayMsg'&&v.includes('ไม่ต้องชำระซ้ำ')));
});
await test('normal legacy button does not turn React click event into premium intent',async()=>{
 const f=fixture();f.e.portraitFetch=async(url,options)=>{assert.equal(options.body,undefined);assert.equal(options.headers['Content-Type'],undefined);f.unlocked.add('work-a');return {ok:true,status:200,json:async()=>({walletId:'fixture-wallet',processRemaining:0,premiumDownloadRemaining:2})}};
 await f.e.useDownloadCredit({type:'click'});assert.equal(f.premium,2);assert.equal(f.events.filter(([k])=>k==='setDownloadUnlockSignal').length,1);
});
await test('changing account, job, or work while claiming prevents a credit request',async()=>{
 for(const changed of ['account','job','work']){const f=fixture();f.e.claimAccountOutput=async()=>{if(changed==='account')f.storage.token='other';else if(changed==='job')f.e.currentOutputJobRef.current='other';else f.e.savedWorkOpenRequestRef.current++};await f.e.useDownloadCredit({premium:true});assert.equal(f.events.filter(([k])=>k==='request').length,0,changed);assert.equal(f.premium,2);assert.equal(f.e.checkoutBusyRef.current,false)}
});
await test('late response after replacing work cannot unlock or close the replacement',async()=>{
 const f=fixture();f.e.portraitFetch=async()=>{f.setJob('replacement');return {ok:true,status:200,json:async()=>({walletId:'fixture-wallet',processRemaining:0,premiumDownloadRemaining:1})}};await f.e.useDownloadCredit({premium:true});assert.equal(f.events.filter(([k])=>k==='setDownloadUnlockSignal').length,0);assert(!f.events.some(([k,v])=>k==='setBuyOpen'&&v===false));
});
await test('guest and pending checkout cannot spend credits',async()=>{
 const f=fixture();f.storage.token='';await f.e.useDownloadCredit({premium:true});assert.equal(f.events.filter(([k])=>k==='request').length,0);assert(f.events.some(([k,v])=>k==='setAuthOpen'&&v));f.storage.token='fixture';f.e.checkoutReturnRef.current={};await f.e.useDownloadCredit({premium:true});assert.equal(f.events.filter(([k])=>k==='request').length,0);
});
const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'});
try{
 const {PackageOffers}=await server.ssrLoadModule('/src/package-offers.jsx');
 const nodes=value=>!value||typeof value!=='object'?[]:[value,...[value.props?.children].flat(Infinity).flatMap(nodes)];
 const text=value=>value==null||typeof value==='boolean'?'':typeof value==='string'||typeof value==='number'?String(value):Array.isArray(value)?value.map(text).join(''):text(value.props?.children);
 await test('rendered159 offer uses available premium credit instead of starting checkout',()=>{
  const calls=[],tree=PackageOffers({hasTrial:true,isAuthenticated:true,premiumCreditBalance:2,creditBalance:0,onUseCredit:arg=>calls.push(['credit',arg]),startCheckout:p=>calls.push(['pay',p])});const items=nodes(tree),button=items.find(n=>n.type==='button'&&text(n)==='ใช้ 1 สิทธิ์โปร 159');assert(button);button.props.onClick();assert.deepEqual(calls,[['credit',{premium:true}]]);assert(text(tree).includes('โปร 159 จำนวน 2 งาน'));assert(text(tree).includes('เลือกชุดได้ 5 ชุด'));
 });
 await test('exhausted or guest premium balances preserve normal package pricing and disabled raw-photo gate',()=>{
  for(const props of [{isAuthenticated:true,premiumCreditBalance:0},{isAuthenticated:false,premiumCreditBalance:2}]){const calls=[],tree=PackageOffers({...props,hasTrial:true,onUseCredit:()=>{throw Error('credit cannot run')},startCheckout:p=>calls.push(p)}),button=nodes(tree).find(n=>n.type==='button'&&text(n)==='เลือกโปร 159 บาท');assert(button);button.props.onClick();assert.deepEqual(calls,['159'])}
  const tree=PackageOffers({isAuthenticated:true,premiumCreditBalance:2,hasTrial:false});for(const button of nodes(tree).filter(n=>n.type==='button'))assert.equal(button.props.disabled,true);
 });
}finally{await server.close()}
if(process.env.IDPROM_PREMIUM_UI_OUTPUT){await mkdir(process.env.IDPROM_PREMIUM_UI_OUTPUT,{recursive:true});await writeFile(process.env.IDPROM_PREMIUM_UI_OUTPUT+'/results.json',JSON.stringify({passed:rows.length,failed:0,scope:'Actual App credit normalization/redeem/verification functions and rendered package component. Local mocked HTTP only; no customer or provider writes.',results:rows},null,2))}
console.log(`${rows.length} premium-credit client scenarios passed; no live payment or account mutations.`);
