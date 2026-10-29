// Production handler bodies with local rights/renderer/audit boundaries. This
// exercises their integration, not a second implementation of export policy.
// No live account, payment, AI, filesystem save or production database is used.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {outputAccessResult,unavailableOutputRights,mergeOutputRights} from '../src/output-rights.js';

const studio=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const rows=[];
const check=async(name,run)=>{await run();rows.push({name,passed:true});console.log('PASS '+name)};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
function handler(source,start,end,name,env){
 const a=source.indexOf(start),b=source.indexOf(end,a);
 assert(a>=0&&b>a,'Production handler marker: '+name);
 return new Function('env',`with(env){${source.slice(a,b)};return ${name}}`)(env);
}
const granted={checked:true,unlocked:true,fullEdit:true,premiumHair:true,paidDownload:true};
const denied={checked:true,unlocked:false,fullEdit:false,premiumHair:false,paidDownload:false};
const head={id:'head-a',kind:'head',name:'หัว · คอ · ผม',jobId:'job-a'};
function auditBoundary(env,{throws=''}={}){
 const audit=[],attempts=[];
 const emit=(type,details={})=>{if(throws==='emit')throw Error('fixture telemetry storage error');audit.push({type,...details})};
 env.beginDownloadAudit=context=>{if(throws==='begin')throw Error('fixture telemetry unavailable');attempts.push(context);return {emit,delivery:emit}};
 const observeDelivery=options=>{try{options?.onEvent?.('download_requested',{method:'desktop_anchor'})}catch{}};
 return {audit,attempts,observeDelivery};
}
function studioFixture({paid=false,balance=2,throws='',easyMode=false}={}){
 const events=[],unlocked=new Set(paid?['job-a']:[]);let remaining=balance;
 const e={easyMode,accountScope:'account-a',outputScopeRef:{current:'account-a'},state:{current:[{...head}]},
  outputHeads:ls=>ls.filter(l=>l.kind==='head'),layerKind:l=>l.kind,warningProofForJob:()=> 'fixture-proof',
  outputAccessResult,unavailableOutputRights,mergeOutputRights,sessionUnlockedJobs:{current:new Set()},
  onVerifyOutput:async id=>{events.push(['verify',id]);return unlocked.has(id)?granted:denied},
  onUseDownloadCredit:async id=>{events.push(['credit',id]);if(!remaining)return {available:false,unlocked:false};remaining--;unlocked.add(id);return {available:true,unlocked:true}},
  setVerifiedJobs:fn=>{e.verified=fn(e.verified||{})},setStatus:message=>events.push(['status',message]),setSavePopup:value=>events.push(['popup',value]),
  onRequestUnlock:()=>events.push(['purchase']),setDownloadCrop:value=>{e.downloadCrop=value;events.push(['crop',value])},
  onSelectSuit:async id=>({limited:true,limit:unlocked.has(id)?5:3,choices:[]}),setSuitPolicy:value=>events.push(['suit-policy',value]),
  exportingRef:{current:false},saveSequenceRef:{current:0},flushTransforms:()=>events.push(['flush']),placementRef:{current:{W:900,H:1200}},assets:{current:new Map()},
  nativeCanvas:()=>{events.push(['canvas']);return {width:900,height:1200,getContext:()=>({fillRect(){},drawImage(){}}),toBlob:callback=>callback(new Blob(['fixture-render'],{type:'image/png'}))}},
  paintScene:()=>events.push(['paint']),onSaveWork:null,trialUnlocked:false,withDeadline:operation=>operation(),
  setDownloadCropBusy:value=>events.push(['crop-busy',value]),STUDIO_DOWNLOAD_SIZES:[{id:'2inch',width:40,height:53}],
  cropPhotoForDownload:async(blob,crop,options)=>{events.push(['encode',crop,options]);return new Blob(['fixture-cropped'],{type:options.type})}
 };
 const observation=auditBoundary(e,{throws});
 e.download=(blob,name,options)=>{events.push(['download',blob,name]);observation.observeDelivery(options);return 'requested'};
 e.allowOutput=handler(studio,' const allowOutput=async','\n const [suitPolicy','allowOutput',e);
 const exportImage=handler(studio,' const exportImage=async','\n const autoDownloadAttempted=','exportImage',e);
 const finishDownloadCrop=handler(studio,' const finishDownloadCrop=async','\n const duplicate=','finishDownloadCrop',e);
 const block=studio.indexOf('{downloadCrop&&createPortal('),a=studio.indexOf('onClose={',block)+'onClose={'.length,b=studio.indexOf('/></div>,document.body)',a);
 assert(block>0&&a>block&&b>a,'Production crop cancellation marker');
 const onClose=new Function('env',`with(env){return ${studio.slice(a,b).replace(/\}\s*$/,'')}}`)(e);
 return {e,events,...observation,exportImage,finishDownloadCrop,onClose,get balance(){return remaining},count:type=>events.filter(row=>row[0]===type).length};
}
function classicFixture({paid=false,balance=2,throws=''}={}){
 const events=[],identity={token:'fixture-token',wallet:'fixture-wallet'};let remaining=balance,unlocked=paid;
 const e={editCache:{current:{master:{},lock:{}}},downloadBusyRef:{current:false},downloadBusy:false,hairBusy:false,busy:false,uniformChanging:false,photoSizeBusy:false,
  currentOutputJobRef:{current:'job-a'},savedWorkOpenRequestRef:{current:1},currentWalletId:()=>identity.wallet,authToken:()=>identity.token,
  DEFAULT_PHOTO_CROP:{sizeId:'original'},photoCrop:{sizeId:'2inch',x:0,y:0,scale:1},trialPreview:!paid,outputAccessResult,withDeadline:operation=>operation(),analyticsEvent(){},
  verifyOutputRights:async()=>unlocked?granted:denied,
  unlockOutputWithCredit:async()=>{events.push(['credit']);if(!remaining)return {available:false,unlocked:false};remaining--;unlocked=true;return {available:true,unlocked:true}},
  beautyTimerRef:{current:null},beautyRenderRef:{current:0},renderTimer:{current:null},renderSeqRef:{current:0},liveAdjustRef:{current:{}},liveCollarWarpRef:{current:0},liveNeckAdjustRef:{current:{}},backgroundRef:{current:null},ribbonRef:{current:null},ribbonAdjustRef:{current:{}},collarPinRef:{current:null},collarPinAdjustRef:{current:{left:{},right:{}}},liveCollarHeightRef:{current:0},chestPinRef:{current:null},chestPinAdjustRef:{current:{}},beautyRef:{current:{}},
  beautyBaseRef:{current:null},beautyPreviewBaseRef:{current:null},showBlob(){},
  renderAdjustedFinal:async()=>{events.push(['render']);return new Blob(['fixture-render'],{type:'image/png'})},applyLocalBeauty:async blob=>blob,
  cropPhotoForDownload:async()=>new Blob(['fixture-crop'],{type:'image/png'})
 };
 for(const setter of ['setDownloadBusy','setMsg','setDownloadNotice','setPayMsg','setTrialPreview','setBuyOpen'])e[setter]=value=>events.push([setter,value]);
 const observation=auditBoundary(e,{throws});
 e.deliverImage=(blob,name,options)=>{events.push(['download',blob,name]);observation.observeDelivery(options);return 'requested'};
 const download=handler(main,' const downloadCurrentFinal=async','\n const classicAutoDownloadRef=','downloadCurrentFinal',e);
 return {e,events,identity,...observation,download,get balance(){return remaining},count:type=>events.filter(row=>row[0]===type).length};
}
const failures=f=>f.audit.filter(row=>row.type==='download_failed');
const has=(f,type,code)=>f.audit.some(row=>row.type===type&&(!code||row.errorCode===code));
const noImage=f=>{assert.equal(f.count('download'),0);assert(!has(f,'file_prepared'))};

await check('Studio and Easy distinguish a known unpaid image from unavailable rights without inventing a ready file',async()=>{
 for(const easyMode of [false,true]){
  const unpaid=studioFixture({balance:0,easyMode});await unpaid.exportImage('image/png');
  assert(has(unpaid,'rights_blocked','rights_required'));assert.equal(failures(unpaid).length,0);assert.equal(unpaid.count('purchase'),1);noImage(unpaid);
  assert.equal(unpaid.attempts[0].mode,easyMode?'easy':'studio');assert.deepEqual(unpaid.attempts[0].jobIds,['job-a']);
  for(const right of ['throw',unavailableOutputRights()]){
   const f=studioFixture({easyMode});f.e.onVerifyOutput=async()=>{if(right==='throw')throw Error('private raw transport detail');return right};await f.exportImage('image/png');
   assert(has(f,'download_failed','rights_unavailable'));assert(!has(f,'rights_blocked'));assert.equal(f.count('credit'),0);assert.equal(f.count('purchase'),0);assert.equal(f.balance,2);noImage(f);
   assert(!JSON.stringify(f.audit).includes('private raw transport detail'));
  }
 }
});
await check('a failed suit-policy read is reported separately from rights or image-render failure',async()=>{
 const f=studioFixture({paid:true});f.e.onSelectSuit=async()=>{throw Error('fixture suit storage unavailable')};await f.exportImage('image/png');
 assert(has(f,'download_failed','suit_unavailable'));assert.equal(failures(f)[0].errorStage,'suit');assert.equal(f.count('canvas'),0);assert.equal(f.count('credit'),0);noImage(f);
});
await check('account and output changes during Studio rights reads are cancellations with distinct diagnostic codes',async()=>{
 for(const change of ['account','output']){
  const f=studioFixture({paid:true}),gate=deferred();f.e.onVerifyOutput=()=>gate.promise;
  const pending=f.exportImage('image/png');await tick();if(change==='account')f.e.outputScopeRef.current='account-b';else f.e.state.current=[{...head,jobId:'replacement'}];gate.resolve(granted);await pending;
  assert(has(f,'download_failed',change+'_changed'));assert.equal(failures(f)[0].errorStage,'account');assert.equal(f.count('credit'),0);noImage(f);
 }
});
await check('the final Studio render guard never labels a changed account or work as a rendering error',async()=>{
 for(const change of ['account','output']){
  const f=studioFixture({paid:true}),canvas=f.e.nativeCanvas;f.e.nativeCanvas=()=>{const c=canvas();c.toBlob=callback=>{if(change==='account')f.e.outputScopeRef.current='account-b';else f.e.state.current=[{...head,jobId:'replacement'}];callback(new Blob(['render'],{type:'image/png'}))};return c};
  await f.exportImage('image/png');assert(has(f,'download_failed',change+'_changed'));assert(!has(f,'download_failed','render_failed'));noImage(f);
 }
});
await check('crop preparation, crop errors and closing the size chooser cannot claim a completed image delivery',async()=>{
 const cancelled=studioFixture({paid:true});await cancelled.exportImage('image/png');assert(cancelled.e.downloadCrop);assert(!has(cancelled,'file_prepared'));cancelled.onClose();
 assert(has(cancelled,'crop_cancelled'));assert.equal(cancelled.e.downloadCrop,null);noImage(cancelled);
 for(const timeout of [false,true]){
  const f=studioFixture({paid:true});await f.exportImage('image/png');f.e.cropPhotoForDownload=async()=>{throw Object.assign(Error('private encoder detail'),timeout?{code:'STUDIO_CROP_TIMEOUT'}:{})};await f.finishDownloadCrop({sizeId:'2inch'});
  assert(has(f,'download_failed',timeout?'timeout':'crop_failed'));assert.equal(failures(f)[0].errorStage,'crop');noImage(f);assert.equal(f.e.exportingRef.current,false);
 }
});
await check('the frozen crop attempt cannot deliver or retarget evidence after account or output changes',async()=>{
 for(const change of ['account','output']){
  const f=studioFixture({paid:true}),gate=deferred();await f.exportImage('image/png');f.e.cropPhotoForDownload=()=>gate.promise;
  const pending=f.finishDownloadCrop({sizeId:'2inch'});await tick();if(change==='account')f.e.outputScopeRef.current='account-b';else f.e.state.current=[{...head,jobId:'replacement'}];gate.resolve(new Blob(['crop'],{type:'image/png'}));await pending;
  assert(has(f,'download_failed',change+'_changed'));assert.deepEqual(f.attempts.map(row=>row.jobIds),[['job-a']]);noImage(f);
 }
});
await check('a selected Studio file records MIME, size and selected dimensions only after actual encoding, once',async()=>{
 const f=studioFixture();await f.exportImage('image/png');assert.equal(f.balance,1);assert(!has(f,'file_prepared'));await f.finishDownloadCrop({sizeId:'2inch'});
 assert.equal(f.balance,1);assert.equal(f.count('credit'),1);assert.equal(f.count('download'),1);assert.equal(f.count('purchase'),0);
 assert.deepEqual(f.audit.map(row=>row.type),['download_clicked','file_prepared','download_requested']);
 const ready=f.audit.find(row=>row.type==='file_prepared');assert.equal(ready.sizeId,'2inch');assert.equal(ready.fileType,'image/png');assert(ready.byteSize>0);
 assert.equal(f.attempts[0].initiator,'user');
});
await check('automatic Studio export never invents a user download click or consumes another credit',async()=>{
 const f=studioFixture({paid:true});await f.exportImage('image/png',{automatic:true});assert(!has(f,'download_clicked'));assert(has(f,'file_prepared'));assert.equal(f.count('download'),1);assert.equal(f.count('credit'),0);assert.equal(f.balance,2);assert.equal(f.attempts[0].initiator,'automatic_after_unlock');
});
await check('unconfigured or throwing audit observers cannot interrupt Studio file delivery or change credit use',async()=>{
 for(const throws of ['begin','emit','missing']){
  const f=studioFixture({throws});if(throws==='missing')delete f.e.beginDownloadAudit;await f.exportImage('image/png');await f.finishDownloadCrop({sizeId:'2inch'});
  assert.equal(f.count('credit'),1);assert.equal(f.balance,1);assert.equal(f.count('download'),1);assert.equal(f.count('purchase'),0);assert.equal(f.e.exportingRef.current,false);
 }
});
await check('classic export distinguishes an unpaid image, unavailable rights and a prepared image',async()=>{
 const unpaid=classicFixture({balance:0});await unpaid.download();assert(has(unpaid,'rights_blocked','rights_required'));noImage(unpaid);
 const unknown=classicFixture();unknown.e.verifyOutputRights=async()=>unavailableOutputRights();await unknown.download();assert(has(unknown,'download_failed','rights_unavailable'));assert.equal(unknown.count('credit'),0);noImage(unknown);
 const paid=classicFixture({paid:true});await paid.download();assert.deepEqual(paid.audit.map(row=>row.type),['download_clicked','file_prepared','download_requested']);assert.equal(paid.count('credit'),0);assert.equal(paid.audit.find(row=>row.type==='file_prepared').sizeId,'2inch');
});
await check('classic account/work changes during rendering remain context failures, not render failures',async()=>{
 for(const change of ['account','output']){
  const f=classicFixture({paid:true});f.e.renderAdjustedFinal=async()=>{if(change==='account')f.identity.token='replacement-token';else f.e.currentOutputJobRef.current='replacement';return new Blob(['render'],{type:'image/png'})};await f.download();
  assert(has(f,'download_failed',change+'_changed'));assert.equal(failures(f)[0].errorStage,'account');assert(!has(f,'download_failed','render_failed'));noImage(f);
 }
});
await check('classic automatic and failed-logger exports retain delivery and credit behavior without invented user clicks',async()=>{
 const automatic=classicFixture({paid:true});await automatic.download({original:true,automatic:true});assert(!has(automatic,'download_clicked'));assert.equal(automatic.attempts[0].initiator,'automatic_after_unlock');assert.equal(automatic.count('download'),1);assert.equal(automatic.count('credit'),0);
 for(const throws of ['begin','emit','missing']){
  const f=classicFixture({throws});if(throws==='missing')delete f.e.beginDownloadAudit;await f.download();assert.equal(f.count('download'),1);assert.equal(f.count('credit'),1);assert.equal(f.balance,1);assert.equal(f.e.downloadBusyRef.current,false);
 }
});

const result={passed:rows.length,failed:0,sourceSha256:{studio:createHash('sha256').update(studio).digest('hex'),main:createHash('sha256').update(main).digest('hex')},scope:'Actual Studio/Easy permission/export/crop/cancel handlers and retained classic export, with local read/render/observer fixtures. Existing credit/rights regression suites cover financial paths; no production access.',results:rows};
if(process.env.IDPROM_AUDIT_HANDLERS_OUTPUT){await mkdir(dirname(process.env.IDPROM_AUDIT_HANDLERS_OUTPUT),{recursive:true});await writeFile(process.env.IDPROM_AUDIT_HANDLERS_OUTPUT,JSON.stringify(result,null,2)+'\n')}
console.log(JSON.stringify({passed:rows.length,failed:0}));
