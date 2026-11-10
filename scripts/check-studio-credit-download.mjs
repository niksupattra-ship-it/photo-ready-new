// Actual Studio preview/authorization/delivery handlers. All accounts, credits,
// encoding and service calls are inert fixtures; no real payment or AI calls.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {outputAccessResult,unavailableOutputRights,mergeOutputRights} from '../src/output-rights.js';
import {rememberDownloadChoice,downloadChoiceForJobs} from '../src/download-choice.js';
const source=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
const grant={checked:true,unlocked:true,fullEdit:true,premiumHair:true,paidDownload:true},deny={checked:true,unlocked:false,fullEdit:false,premiumHair:false,paidDownload:false};
const head={id:'head-a',kind:'head',jobId:'job-a',source:'native-photo'};
const crop={sizeId:'2-inch',x:.44,y:.56,zoom:1.2,format:'png',freePosition:true};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const tick=()=>new Promise(r=>setImmediate(r));
const extract=(start,end,name,env)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,name);return Function('env','with(env){'+source.slice(a,b)+';return '+name+'}')(env)};
function fixture({balance=2,paid=false}={}){
 const events=[],unlocked=new Set(paid?['job-a']:[]);let remaining=balance;
 const e={onCheckoutPreview:null,onReceiveImage:null,downloadUnlockSignal:null,ready:true,processActive:false,assetBusy:false,hydratingRef:{current:false},suitRequestRef:{current:null},prepareSourceDownload:async()=>{},accountScope:'account-a',outputScopeRef:{current:'account-a'},state:{current:[{...head}]},outputHeads:ls=>ls.filter(l=>l.kind==='head'),layerKind:l=>l.kind,warningProofForJob:()=> 'proof',outputAccessResult,unavailableOutputRights,mergeOutputRights,sessionUnlockedJobs:{current:new Set()},pendingDownloadChoiceRef:{current:null},rememberDownloadChoice,downloadChoiceForJobs,DEFAULT_PHOTO_CROP:{sizeId:'original',x:.5,y:.5,zoom:1},
  onVerifyOutput:async id=>{events.push(['verify',id]);return unlocked.has(id)?grant:deny},
  onUseDownloadCredit:async id=>{events.push(['credit',id]);if(!remaining)return {available:false,unlocked:false};if(!unlocked.has(id)){remaining--;unlocked.add(id)}return {available:true,unlocked:true}},
  setVerifiedJobs:fn=>{e.verified=fn(e.verified||{})},setStatus:message=>events.push(['status',message]),setSavePopup:value=>events.push(['popup',value]),onRequestUnlock:()=>events.push(['purchase']),setDownloadCrop:value=>{e.downloadCrop=value;events.push(['preview',value])},
  onSelectSuit:async()=>({limited:true,choices:[]}),setSuitPolicy(){},exportingRef:{current:false},saveSequenceRef:{current:0},flushTransforms(){},placementRef:{current:{W:900,H:1200}},assets:{current:new Map()},paintLayers:[],
  assertPortraitExportReady(){if(!e.state.current.length||e.state.current.some(l=>l.kind==='source-photo'||!l.jobId))throw Error('unprocessed source')},
  nativeCanvas:()=>{events.push(['canvas']);return {width:900,height:1200,getContext:()=>({fillRect(){},drawImage(){}}),toBlob:fn=>fn(new Blob(['native-source'],{type:'image/png'}))}},paintScene(){},onSaveWork:null,trialUnlocked:false,easyMode:false,withDeadline:run=>run(),beginDownloadAudit:()=>({emit:(...args)=>events.push(['audit',...args])}),download:(blob,name)=>{events.push(['download',blob,name]);return 'download'},setDownloadCropBusy(){},STUDIO_DOWNLOAD_SIZES:[{id:'2-inch',width:40,height:53}],cropPhotoForDownload:async()=>{events.push(['encode']);return new Blob(['cropped'],{type:'image/png'})}
 };
 e.allowOutput=extract(' const allowOutput=async','\n const [suitPolicy','allowOutput',e);
 const open=extract(' const exportImage=async','\n const authorizeDownloadCrop=','exportImage',e);
 const authorize=extract(' const authorizeDownloadCrop=async','\n const initialDownloadOpened=','authorizeDownloadCrop',e);
 const finish=extract(' const finishDownloadCrop=async','\n const duplicate=','finishDownloadCrop',e);
 return {e,events,unlocked,open,authorize,finish,get balance(){return remaining},count:name=>events.filter(row=>row[0]===name).length,async choose(choice=crop,file=null){if(!await authorize(choice))return false;await finish(choice,file);return true}};
}
let passed=0;const test=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
await test('first Download opens the size preview at positive, zero and already-paid balances without verifying, debiting, buying or delivering',async()=>{
 for(const options of [{balance:2},{balance:0},{balance:0,paid:true}]){const f=fixture(options);await f.open('image/png');assert(f.e.downloadCrop?.blob.size);assert.equal(f.count('verify'),0);assert.equal(f.count('credit'),0);assert.equal(f.count('purchase'),0);assert.equal(f.count('download'),0);assert.equal(f.balance,options.balance)}
});
await test('only the final preview button opens packages; it retains PDF size, crop and copies for the same output',async()=>{
 const f=fixture({balance:0}),choice={...crop,format:'pdf',copies:4};await f.open('image/png');assert.equal(await f.authorize(choice),false);assert.equal(f.count('purchase'),1);assert.equal(f.e.downloadCrop,null);assert.equal(f.count('download'),0);assert.equal(f.count('encode'),0);assert.deepEqual(downloadChoiceForJobs(f.e.pendingDownloadChoiceRef.current,['job-a']),choice);assert(f.e.pendingDownloadChoiceRef.current.requested);
});
await test('final preview action redeems one credit and delivers the chosen file with no extra original or second size dialog',async()=>{
 const f=fixture(),received=[],file=new Blob(['chosen-photo'],{type:'image/png'});f.e.onReceiveImage=async(blob,context)=>received.push({blob,context});await f.open('image/png');assert(await f.choose(crop,file));assert.equal(f.balance,1);assert.equal(f.count('credit'),1);assert.equal(f.count('purchase'),0);assert.equal(received.length,1);assert.equal(received[0].blob,file);assert(received[0].context.preparedDownload);assert.deepEqual(received[0].context.crop,crop);assert.equal(received[0].context.sourceBlob.size,'native-source'.length);assert.equal(f.e.downloadCrop,null);assert.equal(f.e.pendingDownloadChoiceRef.current,null);
});
await test('repeated paid downloads do not debit again; the next output consumes a separate credit only on final click',async()=>{
 const f=fixture();await f.open('image/png');assert(await f.choose());await f.open('image/png');assert(await f.choose());assert.equal(f.count('credit'),1);assert.equal(f.balance,1);f.e.state.current=[{...head,jobId:'job-b'}];await f.open('image/png');assert.equal(f.balance,1);assert(await f.choose());assert.equal(f.balance,0);assert.equal(f.count('download'),3);f.e.state.current=[{...head,jobId:'job-c'}];await f.open('image/png');assert(f.e.downloadCrop);assert.equal(f.count('purchase'),0);assert.equal(await f.authorize(crop),false);assert.equal(f.count('purchase'),1);assert.equal(f.count('download'),3);
});
await test('already unlocked output at zero balance downloads normally without packages or debit',async()=>{
 const f=fixture({balance:0,paid:true});await f.open('image/png');assert(await f.choose());assert.equal(f.count('credit'),0);assert.equal(f.count('purchase'),0);assert.equal(f.count('download'),1);
});
await test('unavailable rights cannot debit, buy again or deliver a clean file',async()=>{
 const f=fixture();f.e.onVerifyOutput=async()=>unavailableOutputRights();await f.open('image/png');assert.equal(await f.authorize(crop),false);assert.equal(f.count('credit'),0);assert.equal(f.count('purchase'),0);assert.equal(f.count('download'),0);assert.equal(f.count('encode'),0);
});
await test('failed, unknown and malformed credit replies stay retryable and never permit delivery or a new purchase',async()=>{
 for(const reply of [undefined,{}, {available:true}, {available:true,unlocked:false,message:'retry'}]){const f=fixture();f.e.onUseDownloadCredit=async()=>reply;await f.open('image/png');assert.equal(await f.authorize(crop),false);assert.equal(f.count('purchase'),0);assert.equal(f.count('encode'),0);assert.equal(f.count('download'),0);assert.equal(f.e.sessionUnlockedJobs.current.size,0)}
});
await test('redemption alone is insufficient: fresh rights must authorize the same output',async()=>{
 for(const reply of [deny,unavailableOutputRights()]){const f=fixture();let n=0;f.e.onVerifyOutput=async()=>++n===1?deny:reply;await f.open('image/png');assert.equal(await f.authorize(crop),false);assert.equal(f.balance,1);assert.equal(f.count('purchase'),0);assert.equal(f.count('download'),0)}
});
await test('changed account/output before or during authorization cannot debit or deliver a replacement',async()=>{
 for(const phase of ['before','during'])for(const change of ['account','output']){const f=fixture();await f.open('image/png');const gate=deferred();f.e.onVerifyOutput=async()=>gate.promise;const pending=phase==='during'?f.authorize(crop):null;if(phase==='during')await tick();if(change==='account')f.e.outputScopeRef.current='other';else f.e.state.current=[{...head,jobId:'other'}];gate.resolve(grant);assert.equal(await(pending||f.authorize(crop)),false);assert.equal(f.count('credit'),0);assert.equal(f.count('purchase'),0);assert.equal(f.count('download'),0)}
});
await test('final delivery rechecks access after encoding, discarding late account/output changes',async()=>{
 for(const change of ['account','output']){const f=fixture({paid:true});await f.open('image/png');assert(await f.authorize(crop));if(change==='account')f.e.outputScopeRef.current='other';else f.e.state.current=[{...head,jobId:'other'}];await f.finish(crop,new Blob(['clean'],{type:'image/png'}));assert.equal(f.count('download'),0);assert.equal(f.count('purchase'),0)}
});
await test('a verified payment resumes the retained size/format instead of an original-size automatic file',async()=>{
 const f=fixture({balance:0,paid:true}),choice={...crop,format:'pdf',copies:4};f.e.pendingDownloadChoiceRef.current=rememberDownloadChoice(choice,['job-a'],{requested:true});f.e.downloadUnlockSignal={id:'pi_fixture',jobId:'job-a'};await f.open('image/png',{automatic:true});assert.equal(f.e.downloadCrop.automaticId,'pi_fixture');assert.deepEqual(f.e.downloadCrop.choice,choice);assert.equal(f.count('download'),0);assert.equal(f.count('credit'),0);assert(await f.choose(choice,new Blob(['sheet'],{type:'application/pdf'})));assert.equal(f.count('download'),1);assert(f.events.find(e=>e[0]==='download')[2].endsWith('-Letter.pdf'));
});
await test('rapid first clicks share one rendering lock and never consume a credit',async()=>{
 const f=fixture(),gate=deferred();f.e.prepareSourceDownload=()=>gate.promise;const first=f.open('image/png');await f.open('image/png');gate.resolve();await first;assert.equal(f.count('canvas'),1);assert.equal(f.count('credit'),0);assert(f.e.downloadCrop);
});
await test('empty and unprocessed sources never open packages or a downloadable preview',async()=>{
 for(const layers of [[],[{...head,jobId:''}],[head,{kind:'source-photo'}]]){const f=fixture();f.e.state.current=layers;await f.open('image/png');assert.equal(f.count('verify'),0);assert.equal(f.count('credit'),0);assert.equal(f.count('purchase'),0);assert.equal(f.count('canvas'),0)}
});
console.log(JSON.stringify({passed,scope:'Actual Studio preparation-first, final credit/rights authorization, scoped selection retention and clean delivery. No live services.'}));
