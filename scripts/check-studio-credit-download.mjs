// Run the production Studio access/export/crop handlers with inert local fixtures.
// No account, provider, payment or production credit is contacted or changed.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {outputAccessResult,unavailableOutputRights,mergeOutputRights} from '../src/output-rights.js';
const source=await readFile(process.env.IDPROM_AUDIT_EDITOR||new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const rows=[];
async function test(name,run){await run();rows.push({name,passed:true});console.log('PASS '+name)}
function handler(start,end,name,env){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,name);return new Function('env',`with(env){${source.slice(a,b)};return ${name}}`)(env)}
const granted={checked:true,unlocked:true,fullEdit:true,premiumHair:true,paidDownload:true};
const denied={checked:true,unlocked:false,fullEdit:false,premiumHair:false,paidDownload:false};
const head={id:'head-a',kind:'head',name:'หัว · คอ · ผม',jobId:'job-a',source:'data:image/png;base64,fixture'};
function fixture({balance=2,paid=false}={}){
 const events=[],unlocked=new Set(paid?['job-a']:[]);let remaining=balance;
 const e={suitRequestRef:{current:null},prepareSourceDownload:async()=>{},accountScope:'account-a',outputScopeRef:{current:'account-a'},state:{current:[{...head}]},outputHeads:ls=>ls.filter(l=>l.kind==='head'),layerKind:l=>l.kind,warningProofForJob:()=> 'fixture-proof',
  outputAccessResult,unavailableOutputRights,mergeOutputRights,sessionUnlockedJobs:{current:new Set()},
  onVerifyOutput:async id=>{events.push(['verify',id]);return unlocked.has(id)?granted:denied},
  onUseDownloadCredit:async id=>{events.push(['credit',id]);if(remaining===0)return {available:false,unlocked:false};remaining--;unlocked.add(id);return {available:true,unlocked:true}},
  setVerifiedJobs:fn=>{e.verified=fn(e.verified||{})},setStatus:message=>events.push(['status',message]),setSavePopup:value=>events.push(['popup',value]),onRequestUnlock:()=>events.push(['purchase']),setDownloadCrop:value=>{e.downloadCrop=value;events.push(['crop',value])},
  onSelectSuit:async id=>{events.push(['suits',id]);return {limited:true,limit:unlocked.has(id)?5:3,choices:[]}},setSuitPolicy:value=>events.push(['suit-policy',value]),
  exportingRef:{current:false},saveSequenceRef:{current:0},flushTransforms:()=>events.push(['flush']),placementRef:{current:{W:900,H:1200}},assets:{current:new Map()},
  nativeCanvas:()=>{events.push(['canvas']);return {width:900,height:1200,getContext:()=>({fillRect(){},drawImage(){}}),toBlob:callback=>callback(new Blob(['fixture-render'],{type:'image/png'}))}},
  paintScene:()=>events.push(['paint']),onSaveWork:null,trialUnlocked:false,withDeadline:operation=>operation(),download:(blob,name)=>{events.push(['download',blob,name]);return 'download'},
  setDownloadCropBusy:value=>events.push(['crop-busy',value]),STUDIO_DOWNLOAD_SIZES:[{id:'2inch',width:40,height:53}],
  cropPhotoForDownload:async(blob,crop,options)=>{events.push(['encode',crop,options]);return new Blob(['fixture-cropped'],{type:options.type})}
 };
 e.allowOutput=handler(' const allowOutput=async','\n const [suitPolicy','allowOutput',e);
 const exportImage=handler(' const exportImage=async','\n const autoDownloadAttempted=','exportImage',e);
 const finishDownloadCrop=handler(' const finishDownloadCrop=async','\n const duplicate=','finishDownloadCrop',e);
 return {e,events,unlocked,exportImage,finishDownloadCrop,get balance(){return remaining},count:name=>events.filter(event=>event[0]===name).length};
}
await test('normal Studio/Easy download redeems one premium credit at balances two and one before the size picker',async()=>{
 for(const balance of [2,1]){const f=fixture({balance});await f.exportImage('image/png');assert.equal(f.balance,balance-1);assert.equal(f.count('credit'),1);assert.equal(f.count('verify'),2);assert.equal(f.count('purchase'),0);assert.equal(f.count('download'),0);assert.equal(f.e.downloadCrop.type,'image/png');assert.equal(f.e.downloadCrop.renderedOutputKey,'job-a');assert(f.e.sessionUnlockedJobs.current.has('job-a'));assert(f.events.findIndex(e=>e[0]==='credit')<f.events.findIndex(e=>e[0]==='canvas'));}
});
await test('the chosen two-inch file is delivered once without an automatic original-size download or second credit',async()=>{
 const f=fixture();await f.exportImage('image/png');const crop={sizeId:'2inch',x:8,y:-4,scale:1.12};await f.finishDownloadCrop(crop);assert.equal(f.count('credit'),1);assert.equal(f.balance,1);assert.equal(f.count('download'),1);assert.equal(f.events.find(e=>e[0]==='download')[2],'IDPROM-Studio-2inch.png');assert.deepEqual(f.events.find(e=>e[0]==='encode').slice(1),[crop,{pixelScale:2,type:'image/png'}]);assert.equal(f.e.downloadCrop,null);assert.equal(f.e.exportingRef.current,false);
});
await test('repeated downloads reuse the same work while two distinct works consume two credits and the third offers purchase',async()=>{
 const f=fixture();await f.exportImage('image/png');await f.finishDownloadCrop({sizeId:'2inch'});await f.exportImage('image/png');await f.finishDownloadCrop({sizeId:'2inch'});assert.equal(f.balance,1);assert.equal(f.count('credit'),1);assert.equal(f.count('download'),2);
 f.e.state.current=[{...head,jobId:'job-b'}];await f.exportImage('image/png');await f.finishDownloadCrop({sizeId:'2inch'});assert.equal(f.balance,0);assert.equal(f.count('credit'),2);
 f.e.state.current=[{...head,jobId:'job-c'}];await f.exportImage('image/png');assert.equal(f.balance,0);assert.equal(f.count('purchase'),1);assert.equal(f.count('download'),3);assert(!f.unlocked.has('job-c'));
});
await test('a paid work at zero credits opens its normal size picker without invoking redemption or purchase',async()=>{
 const f=fixture({balance:0,paid:true});for(let i=0;i<3;i++){await f.exportImage('image/png');await f.finishDownloadCrop({sizeId:'2inch'})}assert.equal(f.balance,0);assert.equal(f.count('credit'),0);assert.equal(f.count('purchase'),0);assert.equal(f.count('download'),3);
});
await test('only actual user download may redeem; save access and automatic export never spend remaining credits',async()=>{
 const f=fixture();assert.equal(await f.e.allowOutput({errorTitle:'save'}),false);assert.equal(f.count('credit'),0);await f.exportImage('image/png',{automatic:true});assert.equal(f.count('credit'),0);assert.equal(f.balance,2);assert.equal(f.count('canvas'),0);assert.equal(f.count('download'),0);
});
await test('offline or unknown initial rights never redeem and never suggest another payment',async()=>{
 for(const reply of [unavailableOutputRights(),{checked:false,unlocked:null},undefined]){const f=fixture();f.e.onVerifyOutput=async()=>reply;await f.exportImage('image/png');assert.equal(f.count('credit'),0);assert.equal(f.count('purchase'),0);assert.equal(f.count('canvas'),0);assert.equal(f.balance,2)}
});
await test('a failed or malformed credit reply blocks retryably without rendering, spending again or opening packages',async()=>{
 for(const reply of [{available:true,unlocked:false,message:'fixture retry'},undefined,{available:true},{}]){const f=fixture();f.e.onUseDownloadCredit=async()=>{f.events.push(['credit']);return reply};await f.exportImage('image/png');assert.equal(f.count('credit'),1);assert.equal(f.count('purchase'),0);assert.equal(f.count('canvas'),0);assert.equal(f.e.sessionUnlockedJobs.current.size,0);assert(f.events.some(e=>e[0]==='popup'&&e[1]?.state==='error'))}
 const f=fixture();f.e.onUseDownloadCredit=async()=>{throw Error('fixture storage unavailable')};await f.exportImage('image/png');assert.equal(f.count('purchase'),0);assert.equal(f.count('canvas'),0);assert(f.events.some(e=>e[0]==='popup'&&e[1]?.message==='fixture storage unavailable'));
});
await test('redemption success is never enough: denied or unavailable fresh rights cannot render or open another purchase',async()=>{
 for(const reply of [denied,unavailableOutputRights()]){const f=fixture();let calls=0;f.e.onVerifyOutput=async()=>++calls===1?denied:reply;await f.exportImage('image/png');assert.equal(f.balance,1);assert.equal(f.count('credit'),1);assert.equal(f.count('purchase'),0);assert.equal(f.count('canvas'),0);assert.equal(f.e.sessionUnlockedJobs.current.size,0);assert(f.events.some(e=>e[0]==='popup'&&e[1]?.state==='error'))}
});
await test('account or work changes while credit redemption is pending cannot authorize the replacement',async()=>{
 for(const change of ['account','job']){const f=fixture(),gate=deferred();f.e.onUseDownloadCredit=async()=>{f.events.push(['credit']);return gate.promise};const pending=f.exportImage('image/png');await tick();assert.equal(f.count('credit'),1);if(change==='account')f.e.outputScopeRef.current='other-account';else f.e.state.current=[{...head,jobId:'replacement'}];gate.resolve({available:true,unlocked:true});await pending;assert.equal(f.count('purchase'),0);assert.equal(f.count('canvas'),0);assert.equal(f.e.sessionUnlockedJobs.current.size,0)}
});
await test('account or work changes during the initial or post-redemption rights read are discarded',async()=>{
 for(const stage of ['initial','after-credit'])for(const change of ['account','job']){const f=fixture(),gate=deferred();let checks=0;f.e.onVerifyOutput=async()=>{checks++;return stage==='initial'||checks>1?gate.promise:denied};const pending=f.exportImage('image/png');await tick();if(change==='account')f.e.outputScopeRef.current='other-account';else f.e.state.current=[{...head,jobId:'replacement'}];gate.resolve(granted);await pending;assert.equal(f.count('credit'),stage==='initial'?0:1);assert.equal(f.count('canvas'),0);assert.equal(f.count('purchase'),0);assert.equal(f.e.sessionUnlockedJobs.current.size,0)}
});
await test('one duplicated head job reuses a single debit, while mixed work heads never blindly debit credits',async()=>{
 const same=fixture();same.e.state.current.push({...head,id:'copy-head'});await same.exportImage('image/png');assert.equal(same.count('credit'),1);assert.equal(same.balance,1);assert(same.e.downloadCrop);
 const mixed=fixture();mixed.e.state.current.push({...head,id:'other-head',jobId:'other-job'});await mixed.exportImage('image/png');assert.equal(mixed.count('credit'),0);assert.equal(mixed.balance,2);assert.equal(mixed.count('canvas'),0);assert.equal(mixed.count('purchase'),1);
});
await test('raw, empty or unprocessed sources never verify, redeem, render or open a package',async()=>{
 for(const layers of [[],[{...head,jobId:''}],[head,{id:'raw',kind:'source-photo'}]]){const f=fixture();f.e.state.current=layers;await f.exportImage('image/png');assert.equal(f.count('verify'),0);assert.equal(f.count('credit'),0);assert.equal(f.count('purchase'),0);assert.equal(f.count('canvas'),0)}
});
await test('rapid repeated clicks share the export lock and one credit request',async()=>{
 const f=fixture(),gate=deferred();f.e.onUseDownloadCredit=async id=>{f.events.push(['credit',id]);await gate.promise;f.unlocked.add(id);return {available:true,unlocked:true}};const first=f.exportImage('image/png');await tick();await f.exportImage('image/png');assert.equal(f.count('credit'),1);gate.resolve();await first;assert.equal(f.count('crop'),1);assert.equal(f.count('download'),0);
});
const result={passed:rows.length,failed:0,scope:'Actual Studio allowOutput, exportImage and finishDownloadCrop handlers with local rights, credit, canvas and encoder fixtures. No live account, payment, provider or production credit writes.',results:rows};
if(process.env.IDPROM_STUDIO_CREDIT_OUTPUT){await mkdir(dirname(process.env.IDPROM_STUDIO_CREDIT_OUTPUT),{recursive:true});await writeFile(process.env.IDPROM_STUDIO_CREDIT_OUTPUT,JSON.stringify(result,null,2)+'\n')}
console.log(JSON.stringify({passed:rows.length,failed:0}));
