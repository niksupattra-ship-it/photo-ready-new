import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fetchOutputRights,outputAccessResult,mergeOutputRights,unavailableOutputRights} from '../src/output-rights.js';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
for(const status of [401,403,404,429,500,503]){
 const rights=await fetchOutputRights('paid_job',async()=>({status,ok:false}),{});
 assert.equal(rights.unlocked,null);assert.equal(outputAccessResult([rights]).purchase,false);
}
const failures=[async()=>{throw Error('offline')},async()=>({ok:true,status:200,json:async()=>{throw Error('bad JSON')}}),async()=>({ok:true,status:200,json:async()=>({})})];
for(const request of failures)assert.equal(outputAccessResult([await fetchOutputRights('job',request,{})]).purchase,false);
const granted=await fetchOutputRights('job',async()=>({status:200,ok:true,json:async()=>({unlocked:true,fullEdit:true})}),{});
const denied=await fetchOutputRights('job',async()=>({status:200,ok:true,json:async()=>({unlocked:false,fullEdit:false})}),{});
assert.equal(outputAccessResult([granted]).allowed,true);assert.equal(outputAccessResult([denied]).purchase,true);
assert.equal(outputAccessResult([granted,unavailableOutputRights()]).purchase,false);
assert.equal(outputAccessResult([undefined]).purchase,false);assert.equal(outputAccessResult([]).purchase,false);
assert.equal(mergeOutputRights({job:granted},[['job',unavailableOutputRights()]]).job,granted);
assert.equal(mergeOutputRights({job:granted},[['job',denied]]).job,denied);
const main=await read('src/main.jsx'),editor=await read('src/studio-editor.jsx');
const start=editor.indexOf(' const allowOutput=async'),end=editor.indexOf('\n const canUseAllSuits',start);
const makeAllow=new Function('env','with(env){'+editor.slice(start,end)+';return allowOutput;}');
for(const [name,reply,allowed,purchase] of [['paid-zero-credits',granted,true,false],['promo-zero-credits',granted,true,false],['offline',unavailableOutputRights(),false,false],['unpaid',denied,false,true]]){
 const e={state:{current:[{jobId:'job'}]},outputHeads:l=>l,onVerifyOutput:async()=>reply,outputAccessResult,unavailableOutputRights,mergeOutputRights,setVerifiedJobs:()=>{},sessionUnlockedJobs:{current:new Set()},setStatus:m=>{e.message=m},onRequestUnlock:()=>{e.opened=true}};
 assert.equal(await makeAllow(e)(),allowed,name);assert.equal(!!e.opened,purchase,name);
 if(allowed)assert(e.sessionUnlockedJobs.current.has('job'));
}
let reply=unavailableOutputRights();const retryEnv={state:{current:[{jobId:'job'}]},outputHeads:l=>l,onVerifyOutput:async()=>reply,outputAccessResult,unavailableOutputRights,mergeOutputRights,setVerifiedJobs:()=>{},sessionUnlockedJobs:{current:new Set()},setStatus:()=>{},onRequestUnlock:()=>{throw Error('must not buy')}};
const retry=makeAllow(retryEnv);assert.equal(await retry(),false);reply=granted;assert.equal(await retry(),true);
const classicStart=main.indexOf(' const requireOutputAccess=async'),classicEnd=main.indexOf('\n useEffect',classicStart);
const classic=new Function('env','with(env){'+main.slice(classicStart,classicEnd)+';return requireOutputAccess}');
for(const r of [unavailableOutputRights(),granted,denied]){const e={verifyOutputRights:async()=>r,currentOutputJobRef:{current:'job'},outputAccessResult,setMsg:()=>{},setPayMsg:()=>{},setTrialPreview:()=>{},setBuyOpen:v=>{e.bought=v}};assert.equal(await classic(e)(),r===granted);assert.equal(!!e.bought,r===denied)}
const redeemText=main.slice(main.indexOf(' const redeemFreeLink=async'),main.indexOf(' const requireOutputAccess=async'));
const promoEnv={refreshWallet:async()=>{},portraitFetch:async()=>({ok:true,json:async()=>({packagePrice:89,processRemaining:2,unlockedJobIds:['job']})}),walletHeaders:()=>({}),currentOutputJobRef:{current:'job'},currentOutputTrialRef:{current:true},studioTrialRef:{current:true},normalizedRights:d=>d,setRights:()=>{},setPurchaseEditing:()=>{},setTrialPreview:()=>{},setPayMsg:()=>{},setMsg:()=>{},setBuyOpen:v=>{promoEnv.open=v},setAccountSaveNotice:n=>{promoEnv.notice=n},history:{replaceState:()=>{}},location:{pathname:'/'}};
await new Function('env','with(env){'+redeemText+';return redeemFreeLink}')(promoEnv)('TEST');
assert.equal(promoEnv.open,false);assert.equal(promoEnv.currentOutputTrialRef.current,false);assert.equal(promoEnv.notice.title,'รับสิทธิ์สำเร็จ');
assert(!main.includes('if(!(await verifyOutputRights(currentOutputJobRef.current)).unlocked)'));
console.log('PASS: paid/promo images at zero credits, offline/timeouts/HTTP failures/malformed responses, retry success, mixed layers, retained verified preview, explicit denial, all legacy output gates and promo success without opening checkout.');
