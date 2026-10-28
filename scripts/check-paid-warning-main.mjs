import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {walletScope} from '../src/wallet-refresh.js';
import {hasPaidDownloadForJobs} from '../src/paid-work-guard.js';

const source=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const line=name=>source.match(new RegExp('^ const '+name+'=.*$','m'))?.[0];
const section=(start,end)=>{const a=source.indexOf(' const '+start+'='),b=source.indexOf(' const '+end+'=',a);assert(a>=0&&b>a,start);return source.slice(a,b)};
const code=[line('liveLegacyWarningScope'),line('hasCurrentPaidLegacyWork'),line('currentLegacyRightsKnown'),section('readLegacyWarningRights','deferLegacyPhotoLoss'),source.slice(source.indexOf(' const deferLegacyPhotoLoss='),source.indexOf(' useEffect(',source.indexOf(' const deferLegacyPhotoLoss='))),line('cancelLegacyPaidWarning'),section('openLegacyPhotoPicker','requestLegacyPhotoUpload'),section('requestLegacyPhotoUpload','guardLegacyPhotoInputClick'),section('guardLegacyPhotoInputClick','requestLegacyExit'),section('requestLegacyExit','pick'),section('pick','applyAdjust')].join('\n');
const make=new Function('env',`with(env){${code};return {openLegacyPhotoPicker,requestLegacyPhotoUpload,guardLegacyPhotoInputClick,requestLegacyExit,pick,cancelLegacyPaidWarning,readLegacyWarningRights}}`);
function fixture({paid=true,known=true}={}){
 const calls={picker:0,prepare:0,verify:0,msg:[],screen:[],filter:[],rights:[]};
 const env={token:'token_fixture',wallet:'wallet_fixture',authToken:()=>env.token,currentWalletId:()=>env.wallet,walletScope,
  currentOutputJobRef:{current:'job_fixture'},savedWorkOpenRequestRef:{current:0},legacyWarningContextRef:{current:null},legacyPaidVerificationRef:{current:null},legacyUploadConsentRef:{current:null},legacyPickerOpeningRef:{current:false},mobileLandingUploadRef:{current:false},photoPickSequenceRef:{current:0},photoPreparingRef:{current:false},
  busy:false,hairBusy:false,photoPreparing:false,downloadBusy:false,uniformChanging:false,photoSizeBusy:false,screen:'process',uniformCategory:'job',b:'blob:old-paid-preview',
  setMsg:value=>calls.msg.push(value),setLegacyPaidWarning:value=>{env.warning=value},setScreen:value=>calls.screen.push(value),setHomeFilter:value=>calls.filter.push(value),setPhotoPreparing:()=>{},
  preparePhotoInput:async()=>{calls.prepare++;throw Error('fixture_stop_before_source_mutation')},verifyOutputRights:async()=>{calls.verify++;return {checked:false,unlocked:null,code:'rights_unavailable'}}
 };
 env.scope=walletScope(env.token,env.wallet)+'|job_fixture|0';env.legacyWarningContextRef.current={scope:env.scope,stamp:'fixture_revision',paid,known,preview:env.b};
 env.legacyPaidRights={scope:'',jobs:{}};
 env.setLegacyPaidRights=update=>{
  env.legacyPaidRights=update(env.legacyPaidRights);calls.rights.push(env.legacyPaidRights);
  const right=env.legacyPaidRights.scope===env.scope&&env.legacyPaidRights.stamp===env.legacyWarningContextRef.current.stamp?env.legacyPaidRights.jobs.job_fixture:null;
  if(right){env.legacyWarningContextRef.current.paid=hasPaidDownloadForJobs(['job_fixture'],{'job_fixture':right},[]);env.legacyWarningContextRef.current.known=right.code==='output_not_found'||right.checked===true&&(typeof right.paidDownload==='boolean'||right.unlocked===false)}
 };
 env.fileInputRef={current:{value:'old-input',click(){calls.picker++;assert.equal(env.legacyPickerOpeningRef.current,true)}}};
 return {env,calls,api:make(env)};
}
let passed=0;const test=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
await test('paid click warns before chooser and preserves the current output',()=>{
 const {env,calls,api}=fixture();let prevented=0;api.requestLegacyPhotoUpload({preventDefault(){prevented++}});
 assert.equal(prevented,1);assert.equal(calls.picker,0);assert.equal(calls.prepare,0);assert.equal(env.warning.kind,'replace');assert.equal(env.warning.scope,env.scope);assert.equal(env.currentOutputJobRef.current,'job_fixture');
});
await test('unpaid click opens chooser directly; native paid input clicks use the same guard',()=>{
 const free=fixture({paid:false});free.api.requestLegacyPhotoUpload(null,{landing:true});assert.equal(free.calls.picker,1);assert.equal(free.env.mobileLandingUploadRef.current,true);assert.equal(free.env.warning,undefined);
 const paid=fixture();let prevented=0;paid.api.guardLegacyPhotoInputClick({preventDefault(){prevented++}});assert.equal(prevented,1);assert.equal(paid.calls.picker,0);assert.equal(paid.env.warning.kind,'replace');
 paid.env.warning=null;paid.env.legacyPickerOpeningRef.current=true;paid.api.guardLegacyPhotoInputClick({preventDefault(){throw Error('confirmed picker was blocked')}});assert.equal(paid.env.warning,null);
});
await test('programmatic file change retains pending file without decoding or replacing paid work',async()=>{
 const {env,calls,api}=fixture(),file={name:'next.png'},target={files:[file],value:'selected'};await api.pick({target});
 assert.equal(target.value,'');assert.equal(calls.prepare,0);assert.equal(env.warning.file,file);assert.equal(env.currentOutputJobRef.current,'job_fixture');assert.equal(env.b,'blob:old-paid-preview');
});
await test('confirmation consent is consumed once for the exact current scope',async()=>{
 const {env,calls,api}=fixture(),file={name:'next.png'};env.legacyUploadConsentRef.current=env.scope;
 await api.pick({target:{files:[file]}});assert.equal(calls.prepare,1);assert.equal(env.legacyUploadConsentRef.current,null);
 await api.pick({target:{files:[file]}});assert.equal(calls.prepare,1);assert.equal(env.warning.file,file);
 api.cancelLegacyPaidWarning();assert.equal(env.warning,null);assert.equal(env.legacyUploadConsentRef.current,null);assert.equal(env.mobileLandingUploadRef.current,false);
});
await test('stale account or work consent cannot decode or overwrite a replacement',async()=>{
 for(const change of [env=>{env.token='other_token'},env=>{env.currentOutputJobRef.current='other_job'},env=>{env.savedWorkOpenRequestRef.current++}]){
  const {env,calls,api}=fixture();env.legacyUploadConsentRef.current=env.scope;change(env);await api.pick({target:{files:[{name:'next.png'}]}});
  assert.equal(calls.prepare,0);assert.equal(calls.msg.length,1);assert.equal(env.legacyUploadConsentRef.current,null);
 }
});
await test('unknown rights block upload and exit while preserving the old work',async()=>{
 const {env,calls,api}=fixture({paid:false,known:false});api.requestLegacyPhotoUpload({preventDefault(){}});api.requestLegacyExit();await api.pick({target:{files:[{name:'next.png'}],value:'selected'}});
 assert.equal(calls.picker,0);assert.equal(calls.prepare,0);assert.deepEqual(calls.screen,[]);assert.equal(env.warning,undefined);assert(calls.msg.length>=3);assert.equal(env.currentOutputJobRef.current,'job_fixture');
});
await test('account or work changes during image preparation cannot commit the old selection',async()=>{
 for(const change of [env=>{env.token='other_token'},env=>{env.currentOutputJobRef.current='other_job'},env=>{env.savedWorkOpenRequestRef.current++}]){
  const {env,api}=fixture({paid:false});env.preparePhotoInput=async()=>{change(env);return {name:'prepared.png'}};
  await api.pick({target:{files:[{name:'next.png'}]}});assert.notEqual(env.currentOutputJobRef.current,'');assert.equal(env.warning,undefined);
 }
});
await test('payment completing during image preparation opens the warning before source mutation',async()=>{
 const {env,api}=fixture({paid:false}),file={name:'next.png'};env.preparePhotoInput=async()=>{env.legacyWarningContextRef.current.paid=true;return {name:'prepared.png'}};
 await api.pick({target:{files:[file]}});assert.equal(env.warning.file,file);assert.equal(env.warning.kind,'replace');assert.equal(env.currentOutputJobRef.current,'job_fixture');
});
await test('paid exit stays in editor while unpaid exit retains the existing home behavior',()=>{
 const paid=fixture();paid.api.requestLegacyExit();assert.equal(paid.env.warning.kind,'exit');assert.deepEqual(paid.calls.screen,[]);
 const free=fixture({paid:false});free.api.requestLegacyExit();assert.deepEqual(free.calls.screen,['home']);assert.deepEqual(free.calls.filter,['job']);
});
await test('an initial rights outage recovers on a paid upload action and a second click shows the paid warning',async()=>{
 const {env,calls,api}=fixture({paid:false,known:false});await api.readLegacyWarningRights();assert.equal(calls.verify,1);assert.equal(env.legacyWarningContextRef.current.known,false);
 env.verifyOutputRights=async()=>{calls.verify++;return {checked:true,unlocked:true,paidDownload:true}};
 api.requestLegacyPhotoUpload({preventDefault(){}});assert.equal(calls.picker,0);assert.equal(env.warning,undefined);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.verify,2);assert.equal(env.legacyWarningContextRef.current.known,true);assert.equal(env.legacyWarningContextRef.current.paid,true);
 api.requestLegacyPhotoUpload({preventDefault(){}});assert.equal(env.warning.kind,'replace');assert.equal(calls.picker,0);
});
await test('an initial rights outage recovers on an unpaid exit retry without silently leaving',async()=>{
 const {env,calls,api}=fixture({paid:false,known:false});await api.readLegacyWarningRights();
 env.verifyOutputRights=async()=>{calls.verify++;return {checked:true,unlocked:false,paidDownload:false}};
 api.requestLegacyExit();assert.deepEqual(calls.screen,[]);await new Promise(resolve=>setImmediate(resolve));assert.equal(env.legacyWarningContextRef.current.known,true);assert.deepEqual(calls.screen,[]);
 api.requestLegacyExit();assert.deepEqual(calls.screen,['home']);assert.equal(env.warning,undefined);
});
await test('unknown-right retries share one verification and reject a late reply for a changed account',async()=>{
 const {env,calls,api}=fixture({paid:false,known:false});let finish;
 env.verifyOutputRights=()=>{calls.verify++;return new Promise(resolve=>{finish=resolve})};
 api.requestLegacyPhotoUpload({preventDefault(){}});api.requestLegacyExit();await api.pick({target:{files:[{name:'next.png'}]}});assert.equal(calls.verify,1);assert.equal(calls.prepare,0);assert.equal(calls.picker,0);
 env.token='changed-account';finish({checked:true,unlocked:true,paidDownload:true});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls.rights,[]);assert.equal(env.legacyWarningContextRef.current.known,false);assert.deepEqual(calls.screen,[]);
});
await test('a payment revision rejects an older unpaid verification and clears stale unpaid cache on outage',async()=>{
 const {env,calls,api}=fixture({paid:false,known:false});let finish;
 env.verifyOutputRights=()=>new Promise(resolve=>{finish=resolve});const old=api.readLegacyWarningRights();
 env.legacyWarningContextRef.current.stamp='new-payment';env.legacyWarningContextRef.current.paid=true;env.legacyWarningContextRef.current.known=true;
 finish({checked:true,unlocked:false,paidDownload:false});await old;assert.deepEqual(calls.rights,[]);
 env.legacyPaidRights={scope:env.scope,stamp:'fixture_revision',jobs:{job_fixture:{checked:true,unlocked:false,paidDownload:false}}};
 env.verifyOutputRights=async()=>({checked:false,unlocked:null,code:'rights_unavailable'});await api.readLegacyWarningRights();
 assert.equal(env.legacyPaidRights.stamp,'new-payment');assert.equal(env.legacyPaidRights.jobs.job_fixture.paidDownload,undefined);
 assert.equal(hasPaidDownloadForJobs(['job_fixture'],env.legacyPaidRights.jobs,['job_fixture']),true);
});
await test('terminal missing output permits discard after logout while auth and network failures remain blocked',async()=>{
 for(const action of ['upload','exit']){
  const {env,calls,api}=fixture({paid:false,known:false});
  env.verifyOutputRights=async()=>({checked:false,unlocked:null,fullEdit:false,code:'output_not_found'});
  const run=()=>action==='upload'?api.requestLegacyPhotoUpload({preventDefault(){}}):api.requestLegacyExit();
  run();assert.equal(calls.picker,0);assert.deepEqual(calls.screen,[]);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(env.legacyWarningContextRef.current.known,true);assert.equal(env.legacyWarningContextRef.current.paid,false);run();
  assert.equal(env.warning,undefined);assert.equal(calls.picker,action==='upload'?1:0);assert.deepEqual(calls.screen,action==='exit'?['home']:[]);
  assert.equal(hasPaidDownloadForJobs(['job_fixture'],env.legacyPaidRights.jobs,[]),false);
 }
 for(const code of ['auth_required','rights_unavailable']){
  const {env,calls,api}=fixture({paid:false,known:false});env.verifyOutputRights=async()=>({checked:false,unlocked:null,fullEdit:false,code});
  api.requestLegacyPhotoUpload({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));api.requestLegacyExit();
  assert.equal(env.legacyWarningContextRef.current.known,false);assert.equal(calls.picker,0);assert.deepEqual(calls.screen,[]);assert.equal(env.warning,undefined);
 }
 assert(source.includes("legacyCurrentRight?.code==='output_not_found'"));
});
await test('all legacy entry points use guarded handlers and active unload is scoped away from Studio',()=>{
 assert(source.includes('onUpload={()=>requestLegacyPhotoUpload(null,{landing:true})}'));
 assert(source.includes('onClick={requestLegacyPhotoUpload}'));
 assert.equal((source.match(/onClick={guardLegacyPhotoInputClick}/g)||[]).length,2);
 assert(source.includes('onClick={requestLegacyExit} aria-label="กลับหน้าก่อนหน้า"'));
 assert(source.includes("attachPaidBeforeUnload(legacyHasPaidWork&&screen==='process')"));
 assert(source.includes('const legacyHasPaidWork=!studioData&&Boolean(b)&&hasPaidDownloadForJobs'));
 assert(source.includes('paidWarningOutputIds={knownWalletData?rights.unlockedJobIds||[]:[]}'));
 assert(source.includes('onDownload={()=>{cancelLegacyPaidWarning();void downloadCurrentFinal()}}'));
 assert(source.includes("onLogout={({confirmed=false}={})=>{if(confirmed||window.confirm('ออกจากระบบ?'))"));
});
console.log(JSON.stringify({passed,scope:'Actual legacy App warning handlers and source entry-point wiring. Local inert fixtures; no account, payment, production API or file mutation.'}));
