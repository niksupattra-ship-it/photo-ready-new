import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeSavedProject,prepareSavedProject,validateSavedProject} from '../src/saved-project.js';
import {packSavedProjectTransfer,getSavedWorkRequestSize} from '../src/saved-work-transfer.js';
import {encodeSavedWorkRequest} from '../src/saved-work-request.js';
import {walletScope} from '../src/wallet-refresh.js';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
import {PRODUCTION_HAIR_CATALOG,HAIR_DESIGN_VERSION} from '../hairstyle-catalog.js';
import {isFreeFemaleHair} from '../src/free-female-hair.js';
const root=new URL('../',import.meta.url),read=p=>readFile(new URL(p,root),'utf8');
const png='data:image/png;base64,AAAA',other='data:image/png;base64,BBBB';
const head={id:'h',kind:'head',name:'หัว · คอ · ผม',jobId:'paid_A',portraitMode:'female',femaleEyeStyle:'makeup',hairId:'seedream-07',source:png,sourceFrame:{x:40,y:60,w:500,h:600},x:9,y:12,scale:1,rotation:0,opacity:1};
const project={format:'idprom-studio',version:1,width:900,height:1200,compareSource:other,placement:{W:1800,H:2400,uX:0,uY:500,uW:1800,uH:1900,hairFitEyeSize:999},layers:[head]};
const deps={decode:async()=>({width:1000,height:1200}),fetchImage:async src=>({blob:async()=>new Blob([src],{type:'image/png'})}),makeFile:blob=>blob};
const restored=await prepareSavedProject(JSON.parse(JSON.stringify(project)),deps);
assert.equal(await restored.source.text(),other);assert.equal(restored.source.idpromFemaleEyeStyle,'makeup');
assert.equal(restored.editCache.lock.hX,80);assert.equal(restored.editCache.lock.hY,120);assert.equal(restored.editCache.lock.scale,1);
assert.equal(restored.editCache.lock.hairFitEyeSize,undefined);assert.deepEqual(restored.project.layers,project.layers);
assert.equal((await prepareSavedProject({...project,compareSource:null},deps)).editCache,null);
await assert.rejects(prepareSavedProject(project,{...deps,decode:async()=>{throw Error('corrupt')}}),/corrupt/);
assert.throws(()=>validateSavedProject({...project,layers:[{...head,sourceFrame:{x:0,y:0,w:NaN,h:10}}]}));
assert.throws(()=>validateSavedProject({...project,layers:[{...head,mask:'https://example.invalid/image.png'}]}));
validateSavedProject({...project,layers:[{...head,source:'data:image/jpeg;base64,AAAA'}]});
assert.deepEqual((await makeSavedProject({layers:[head],placement:project.placement,originalPreview:other})).compareSource,other);
const main=await read('src/main.jsx');
function compile(name,env){
 const start=main.indexOf(' const '+name+'=');assert(start>=0,`missing ${name}`);const end=main.indexOf('\n };',start);assert(end>start,`missing end of ${name}`);
 return new Function('env','with(env){'+main.slice(start,end+4)+';return '+name+'}')(env);
}
function env(){const e={PRODUCTION_HAIR_CATALOG,HAIR_DESIGN_VERSION,isFreeFemaleHair,currentResultCacheScope:()=> 'account-A',privateTrialRequested:()=>false,activeUniformTemplate:'female.png',activeProcessOperation:null,savedWorkOpenRequestRef:{current:0},savedWorkLoadRequestRef:{current:0},refreshWallet:async()=>{},authToken:()=> 'token_A',currentWalletId:()=> 'wallet_A',walletHeaders:()=>({Authorization:'Bearer token_A','X-Wallet-Id':'wallet_A'}),prepareSavedProject:p=>prepareSavedProject(p,deps),decodedStudioImage:deps.decode,firstUploadedPhotoRef:{current:'person_B'},editCache:{current:{master:'person_B'}},initialProcessedMasterRef:{current:null},initialFemaleMakeupRef:{current:null},portraitFinishChoice,femaleFinishAnchor:(source,master)=>({source,master}),activeSavedDownloadWork:'',hairResultCacheRef:{current:new Map([['old',1]])}};
 for(const n of ['preparedHairBaseRef','lastHairDonorRef','cleanHairBaseRef','initialStyledHairRef','liveAdjustRef','liveCollarWarpRef','liveCollarHeightRef','liveNeckAdjustRef','currentOutputJobRef','currentOutputTrialRef','studioTrialRef','studioOriginRef','savedWorkIdRef'])e[n]={current:null};
 for(const n of ['setAccountSaveNotice','setOutputJobId','setTrialPreview','setHairId','setF','setRestoredSourcePhoto','setSavedWorkUnlocked','setPurchaseEditing','setSessionEditJob','setStudioData','setSavedWorkRevision','setScreen'])e[n]=()=>{};
 const a=main.indexOf(' const hairResultMode='),b=main.indexOf(' const changeHair=async',a);assert(a>=0&&b>a);
 Object.assign(e,new Function('env','with(env){'+main.slice(a,b)+';return {rememberRestoredHairResult,cachedHairResult}}')(e));
 return e;}
const e=env();await compile('openAccountWork',e)({id:'work_A',unlocked:true,project});assert.equal(await e.firstUploadedPhotoRef.current.text(),other);assert(e.editCache.current.master instanceof Blob);assert.equal(e.currentOutputJobRef.current,'paid_A');assert.equal(e.hairResultCacheRef.current.size,1);assert.equal(e.hairResultCacheRef.current.has('old'),false);assert.equal(e.cachedHairResult(head.hairId,'female','makeup').master,e.editCache.current.master);assert.equal(e.initialFemaleMakeupRef.current.source,e.firstUploadedPhotoRef.current);
const failed=env();failed.prepareSavedProject=async()=>{throw Error('corrupt')};await assert.rejects(compile('openAccountWork',failed)({id:'bad',project}),/corrupt/);assert.equal(failed.firstUploadedPhotoRef.current,'person_B');assert.equal(failed.editCache.current.master,'person_B');
await compile('openAccountWork',e)({id:'legacy',unlocked:true,project:{...project,compareSource:null}});assert.equal(e.firstUploadedPhotoRef.current,null);assert.equal(e.editCache.current,null);assert.equal(e.initialFemaleMakeupRef.current,null);
const requests=[],saveEnv={workSaveQueueRef:{current:Promise.resolve()},savedWorkIdRef:{current:''},savedWorkOpenRequestRef:{current:1},currentWalletId:()=> 'wallet_A',walletHeaders:()=>({}),setSavedWorksOpen:()=>{},Blob,packSavedProjectTransfer,getSavedWorkRequestSize,encodeSavedWorkRequest,portraitFetch:async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({id:'work_new'})}}};
const save=compile('saveAccountWork',saveEnv);
await Promise.all([save(project),save(project)]);assert.equal(requests[0].id,'');assert.equal(requests[1].id,'work_new');
await assert.rejects(save(project,{workScope:0}),/งานเปลี่ยน/);
saveEnv.portraitFetch=async()=>({ok:false,status:413,json:async()=>{throw Error('HTML')}});await assert.rejects(save(project),/ขนาดใหญ่/);
function paidEnv(){const e={currentOutputJobRef:{current:'paid_A'},savedWorkOpenRequestRef:{current:1},authToken:()=> 'token_A',currentWalletId:()=> 'wallet_A',walletScope,verifyOutputRights:async()=>({checked:true,unlocked:true}),setTrialPreview:value=>{e.trial=value},setAccountSaveNotice:value=>{e.notice=value},setDownloadUnlockSignal:value=>{e.unlock=value},setPayMsg:value=>{e.message=value},saveAccountWork:()=>{throw Error('payment must not overwrite saved work')}};return e}
for(const paymentId of ['cs_return','pi_promptpay']){
 const e=paidEnv(),paid=compile('savePaidCheckout',e);assert.equal(await paid(paymentId),true);assert.deepEqual(e.unlock,{id:paymentId,jobId:'paid_A'});assert.equal(e.trial,false);assert.equal(e.notice,null);
}
for(const right of [{checked:false,unlocked:null},{checked:true,unlocked:false}]){
 const e=paidEnv();e.verifyOutputRights=async()=>right;assert.equal(await compile('savePaidCheckout',e)('pi_pending'),false);assert.equal(e.unlock,undefined);assert(e.message.includes('ไม่ต้องชำระซ้ำ'));
}
const changedPhoto=paidEnv();changedPhoto.verifyOutputRights=async()=>{changedPhoto.currentOutputJobRef.current='paid_B';return {checked:true,unlocked:true}};assert.equal(await compile('savePaidCheckout',changedPhoto)('pi_old',{jobId:'paid_A'}),true);assert.equal(changedPhoto.unlock,undefined);
const changedWork=paidEnv();changedWork.verifyOutputRights=async()=>{changedWork.savedWorkOpenRequestRef.current++;return {checked:true,unlocked:true}};assert.equal(await compile('savePaidCheckout',changedWork)('pi_old'),true);assert.equal(changedWork.unlock,undefined);
const changedAccount=paidEnv();changedAccount.verifyOutputRights=async()=>{changedAccount.authToken=()=> 'token_B';return {checked:true,unlocked:true}};await assert.rejects(compile('savePaidCheckout',changedAccount)('pi_old'),/บัญชีเปลี่ยน/);assert.equal(changedAccount.unlock,undefined);
console.log('PASS: saved original/master/placement roundtrip, cross-person isolation, makeup continuity, legacy missing-original isolation, corrupt image rejection, JPEG compatibility, queued saves, stale save rejection, oversized response, verified card/PromptPay unlock signals without implicit saved-work writes, pending rights, and changed-photo/work/account isolation.');
