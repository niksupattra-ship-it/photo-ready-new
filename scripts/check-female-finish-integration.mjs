import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import sharp from 'sharp';
import {createAiResultCache,resultSourceDigest} from '../src/ai-result-cache.js';
import {isFemaleFinishProfile} from '../src/female-finish-profile.js';
import {isFemaleFinishReference} from '../src/female-finish-reference.js';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
import {PRODUCTION_HAIR_CATALOG,HAIR_DESIGN_VERSION} from '../hairstyle-catalog.js';

// Integration boundaries use the actual main.jsx functions. Codec, landmark,
// transport and pixel-matcher stubs keep these checks deterministic and offline;
// numerical image quality is tested separately by check-female-finish-profile.
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return [a.slice(0,i),a.slice(i+1)]}));
const main=await readFile(args['--main']||new URL('../src/main.jsx',import.meta.url),'utf8');
const baseline=args['--baseline']?await readFile(args['--baseline'],'utf8'):null;
const cases=[],noop=()=>{};
const profile={version:1,kind:'female-finish',coordinate:'face-v1',scale:{faceWidth:200,roughnessRadius:3},regions:['leftCheek','rightCheek'].map(id=>({id,lightness:[50,60,70],chroma:[9,12],roughness:1,samples:100,coverage:.6}))};
const otherProfile={...profile,regions:profile.regions.map(r=>({...r,lightness:[54,64,74]}))};
const jpeg=async colour=>'data:image/jpeg;base64,'+(await sharp({create:{width:32,height:48,channels:3,background:colour}}).jpeg().toBuffer()).toString('base64');
const reference=await jpeg('#d7a693'),otherReference=await jpeg('#c59b89');
assert(isFemaleFinishProfile(profile));assert(isFemaleFinishProfile(otherProfile));assert(isFemaleFinishReference(reference));
const photo=()=>Object.assign(new File(['untouched uploaded pixels'],'portrait.jpg',{type:'image/jpeg',lastModified:1}),{idpromPortraitMode:'female',idpromFemaleEyeStyle:'makeup'});
function section(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,`missing ${start}`);return source.slice(a,b)}
function extract(start,end,name,env,source=main){return new Function('env',`with(env){${section(source,start,end)};return ${name}}`)(env)}
const helpers={isFemaleFinishProfile,isFemaleFinishReference};
const metadata=extract('function femaleFinishMetadata(','\nfunction femaleFinishAnchor(','femaleFinishMetadata',helpers);
const headMetadata=extract('function femaleFinishHeadMetadata(','\nfunction femaleFinishAnchor(','femaleFinishHeadMetadata',{femaleFinishMetadata:metadata});
const anchor=extract('function femaleFinishAnchor(','\nasync function runFemaleFinishWorker(','femaleFinishAnchor',{femaleFinishMetadata:metadata});
const validator=extract('function validateFemaleMakeupReference(','\nasync function aiFinishPortrait(','validateFemaleMakeupReference',{});
async function test(name,run){try{await run();cases.push({name,status:'PASS'});console.log('PASS '+name)}catch(error){cases.push({name,status:'FAIL',error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}

function skinFixture({missingMasks=false,unavailable=false,width=64,height=80,report=null,changed=false}={}){
 const fixturePixels=width*height>8388608?0:width*height;
 const calls=[],pixels=new Uint8ClampedArray(fixturePixels*4).fill(117),corrected=pixels.map((v,i)=>i%4===3?v:v+1),maskData=new Uint8ClampedArray(fixturePixels*4).fill(255),masks={skinMask:null,hairMask:null};
 const mask={getContext:()=>({getImageData:()=>({data:maskData})})};if(!missingMasks)masks.skinMask=masks.hairMask=mask;
 const env={...helpers,v192MasterMaskCache:new WeakMap(),
  decodedPortraitImage:async()=>{calls.push('decode');if(unavailable)throw Error('decode unavailable');return {naturalWidth:width,naturalHeight:height}},
  getLandmarker:async()=>({detect:()=>({faceLandmarks:[[{x:.5,y:.5}]]})}),getV192MasterMasks:async()=>masks,
  canvasFor:(w,h)=>({width:w,height:h,getContext:()=>({drawImage:noop,getImageData:()=>({data:pixels.slice()}),putImageData:frame=>{calls.push('put');assert.deepEqual(frame.data,corrected)}})}),
  canvasPng:async()=>{calls.push('encode');return new Blob(['corrected pixels'],{type:'image/png'})},
  ImageData:class{constructor(data,w,h){this.data=data;this.width=w;this.height=h}},
  runFemaleFinishWorker:async(input,target)=>{assert.equal(input.pixels.length,width*height*4);calls.push(target?'match':'create');if(target)assert.equal(target,profile);return {pixels:corrected,changed:target?changed:false,profile:target||profile,report}},
  femaleMakeupReference:async blob=>{calls.push('guide');assert(blob instanceof Blob);return reference}
 };
 const run=extract('async function finishFemaleSkinContinuityBlob(','\nasync function prepareFemaleFinishAnchor(','finishFemaleSkinContinuityBlob',env);
 return {env,run,calls,masks};
}
await test('first female finish captures plain profile and bounded reference without another render',async()=>{
 const f=skinFixture(),blob=new Blob(['accepted output']),out=await f.run(blob);
 assert.equal(out,blob);assert.equal(out.idpromFemaleFinishProfile,profile);assert.equal(out.idpromFemaleFinishReference,reference);assert.deepEqual(f.calls,['decode','create','guide']);
});
await test('profile matching preserves job property descriptors and shares the native mask cache',async()=>{
 const f=skinFixture({changed:true}),blob=new Blob(['new hairstyle output']);Object.defineProperty(blob,'idpromJobId',{value:'existing-job',enumerable:false});blob.idpromTrial=true;blob.idpromFullEdit=false;
 const cachedMasks={fixture:true};f.env.v192MasterMaskCache.set(blob,cachedMasks);const out=await f.run(blob,profile,reference);
 assert.notEqual(out,blob);assert.equal(out.idpromJobId,'existing-job');assert.equal(Object.getOwnPropertyDescriptor(out,'idpromJobId').enumerable,false);assert.equal(out.idpromTrial,true);assert.equal(out.idpromFullEdit,false);
 assert.equal(out.idpromFemaleFinishProfile,profile);assert.equal(out.idpromFemaleFinishReference,reference);assert.equal(f.env.v192MasterMaskCache.get(out),cachedMasks);assert.deepEqual(f.calls,['decode','match','put','encode']);
});
await test('optional unavailable evidence keeps the current pixels and introduces no failure',async()=>{
 for(const options of [{missingMasks:true},{unavailable:true},{width:4096,height:2049}]){const f=skinFixture(options),blob=new Blob(['native']);assert.equal(await f.run(blob,profile,reference),blob);assert(!f.calls.includes('match'));assert(!f.calls.includes('encode'));assert.equal(blob.idpromFemaleFinishProfile,profile,'native fallback retains the accepted profile');assert.equal(blob.idpromFemaleFinishReference,reference,'native fallback retains the first guide')}
});
await test('only a limited match with at least two comparable regions rejects drift',async()=>{
 for(const report of [null,{status:'unavailable',comparableRegions:0},{status:'limited',comparableRegions:1}]){const f=skinFixture({report});assert(await f.run(new Blob(['native']),profile,reference))}
 const f=skinFixture({report:{status:'limited',comparableRegions:2}});await assert.rejects(f.run(new Blob(['native']),profile,reference),error=>error.code==='FEMALE_FINISH_DRIFT');assert(!f.calls.includes('encode'));assert(!f.calls.includes('guide'));
});
await test('saved first-finish metadata wins over metadata on the current head Blob',()=>{
 const blob=Object.assign(new Blob(['latest head']),{idpromFemaleFinishProfile:otherProfile,idpromFemaleFinishReference:otherReference});
 const saved={femaleFinishProfile:profile,femaleFinishReference:reference};const restored=anchor(photo(),blob,saved);
 assert.equal(restored.femaleFinishProfile,profile);assert.equal(restored.femaleFinishReference,reference);assert.deepEqual(metadata(blob,{femaleFinishProfile:{},femaleFinishReference:'invalid'}),{});
});
await test('older anchors capture missing metadata once and retain each available first-finish field',async()=>{
 let count=0;const env={...helpers,femaleFinishMetadata:metadata,finishFemaleSkinContinuityBlob:async(blob,requestedProfile,requestedReference,captureOnly)=>{count++;assert.equal(captureOnly,true,'fallback capture must not grade current pixels');return Object.assign(new Blob(['fallback']),{idpromFemaleFinishProfile:isFemaleFinishProfile(requestedProfile)?requestedProfile:otherProfile,idpromFemaleFinishReference:isFemaleFinishReference(requestedReference)?requestedReference:otherReference})}};
 const prepare=extract('async function prepareFemaleFinishAnchor(','\nasync function finishFirstPortraitMaster(','prepareFemaleFinishAnchor',env);
 const old={source:photo(),master:new Blob(['old saved head'])};await prepare(old);await prepare(old);assert.equal(count,1);assert.equal(old.femaleFinishProfile,otherProfile);assert.equal(old.femaleFinishReference,otherReference);
 const partialProfile={source:photo(),master:new Blob(['latest']),femaleFinishProfile:profile};await prepare(partialProfile);assert.equal(partialProfile.femaleFinishProfile,profile,'a saved profile must not become current-head measurements');
 const partialReference={source:photo(),master:new Blob(['latest']),femaleFinishReference:reference};await prepare(partialReference);assert.equal(partialReference.femaleFinishReference,reference,'a saved first guide must not become current-head colours');
});
await test('legacy Studio skin recipes measure their clean stored base once before any recipe is reapplied',async()=>{
 const visible=new Blob(['retouched visible skin']),clean=new Blob(['raw AI base']),source=photo();let fetched=0,captured=0;
 const restored=anchor(source,visible,{makeupStyles:{look:'skin-bright-v1'},makeupBaseSource:reference});assert.equal(restored.legacyBaseSource,reference);
 const env={...helpers,femaleFinishMetadata:metadata,withDeadline:async(operation,options)=>{assert.equal(options.timeoutMs,15000);return operation()},fetch:async url=>{fetched++;assert.equal(url,reference);return {ok:true,blob:async()=>clean}},finishFemaleSkinContinuityBlob:async(blob,target,guide,captureOnly)=>{captured++;assert.equal(blob,clean,'profile capture must use the base before local skin treatment');assert.equal(captureOnly,true);return Object.assign(blob,{idpromFemaleFinishProfile:profile,idpromFemaleFinishReference:reference})}};
 const prepare=extract('async function prepareFemaleFinishAnchor(','\nasync function finishFirstPortraitMaster(','prepareFemaleFinishAnchor',env);await prepare(restored);await prepare(restored);
 assert.equal(restored.source,source);assert.equal(restored.master,clean);assert.equal(restored.femaleFinishProfile,profile);assert.equal(restored.femaleFinishReference,reference);assert.equal(restored.legacyBaseSource,undefined);assert.equal(fetched,1);assert.equal(captured,1);assert.equal(await visible.text(),'retouched visible skin');
});
await test('valid first profiles and heads without a local recipe ignore legacy base sources',async()=>{
 const visible=new Blob(['visible head']);for(const head of [{femaleFinishProfile:profile,femaleFinishReference:reference,makeupStyles:{look:'skin-bright-v1'},makeupBaseSource:otherReference},{makeupBaseSource:otherReference},{makeupStyles:{look:'skin-bright-v1'},makeupBaseSource:'https://fixture.invalid/base.png'}])assert.equal(anchor(photo(),visible,head).legacyBaseSource,undefined);
 const restored=anchor(photo(),visible,{femaleFinishProfile:profile,femaleFinishReference:reference,makeupStyles:{look:'skin-bright-v1'},makeupBaseSource:otherReference});restored.legacyBaseSource=otherReference;
 const env={...helpers,femaleFinishMetadata:metadata,fetch:async()=>{throw Error('valid profile must not fetch legacy pixels')},finishFemaleSkinContinuityBlob:async()=>{throw Error('valid finish must not be recaptured')}};
 const prepare=extract('async function prepareFemaleFinishAnchor(','\nasync function finishFirstPortraitMaster(','prepareFemaleFinishAnchor',env);await prepare(restored);assert.equal(restored.master,visible);assert.equal(restored.femaleFinishProfile,profile);assert.equal(restored.femaleFinishReference,reference);
});
await test('failed legacy base reads reject before generation and retain current pixels and known metadata',async()=>{
 for(const failure of ['fetch','http','timeout','empty']){
  const visible=new Blob(['retouched visible skin']),restored=anchor(photo(),visible,{femaleFinishReference:reference,makeupStyles:{look:'skin-smooth-v1'},makeupBaseSource:otherReference});let captured=0;
  const env={...helpers,femaleFinishMetadata:metadata,withDeadline:async operation=>{if(failure==='timeout')throw Error('deadline');return operation()},fetch:async()=>{if(failure==='fetch')throw Error('local read unavailable');return {ok:failure==='empty',blob:async()=>{if(failure==='empty')return new Blob([]);throw Error('failed response must not decode')}}},finishFemaleSkinContinuityBlob:async blob=>{captured++;return Object.assign(blob,{idpromFemaleFinishProfile:otherProfile,idpromFemaleFinishReference:otherReference})}};
  const prepare=extract('async function prepareFemaleFinishAnchor(','\nasync function finishFirstPortraitMaster(','prepareFemaleFinishAnchor',env);await assert.rejects(prepare(restored));assert.equal(restored.master,visible);assert.equal(restored.femaleFinishProfile,undefined);assert.equal(restored.femaleFinishReference,reference);assert.equal(restored.legacyBaseSource,otherReference);assert.equal(captured,0,'failed raw-base read must not capture the retouched visible master');
 }
});
await test('worker transport transfers native buffers, enforces its deadline, and terminates on every exit',async()=>{
 const code=section(main,'async function runFemaleFinishWorker(','\nasync function finishFemaleSkinContinuityBlob(').replace('import.meta.url',JSON.stringify('https://fixture.invalid/src/main.jsx'));
 for(const outcome of ['success','worker-error','timeout']){
  let terminated=0,posted=0,deadline=0;const pixels=new Uint8ClampedArray(16),skin=new Uint8ClampedArray(16),hair=new Uint8ClampedArray(16),response={pixels,profile,changed:false};
  class FakeWorker{constructor(url,options){assert(url.pathname.endsWith('/female-finish-worker.js'));assert.equal(options.type,'module')}postMessage(value,transfers){posted++;assert.equal(value.profile,profile);assert.deepEqual(transfers,[pixels.buffer,skin.buffer,hair.buffer]);queueMicrotask(()=>{if(outcome==='worker-error')this.onerror();else this.onmessage({data:response})})}terminate(){terminated++}}
  const env={Worker:FakeWorker,isFemaleFinishProfile,withDeadline:async(operation,options)=>{deadline=options.timeoutMs;if(outcome==='timeout')throw Object.assign(Error('timed out'),{code:options.code});return operation()}};
  const run=new Function('env',`with(env){${code};return runFemaleFinishWorker}`)(env),pending=run({pixels,skin,hair},profile);
  if(outcome==='success'){assert.equal(await pending,response);assert.equal(posted,1)}else await assert.rejects(pending);
  assert.equal(deadline,15000);assert.equal(terminated,1);
 }
 const noWorker=new Function('env',`with(env){${code};return runFemaleFinishWorker}`)({Worker:undefined,isFemaleFinishProfile}),pixels=new Uint8ClampedArray(16),fallback=await noWorker({pixels},profile);assert.equal(fallback.pixels,pixels);assert.equal(fallback.changed,false);assert.equal(fallback.profile,profile);
});

function restorationFixture(){
 const initial=photo(),master=Object.assign(new Blob(['latest changed hairstyle']),{idpromFemaleFinishProfile:otherProfile,idpromFemaleFinishReference:otherReference}),head={kind:'head',name:'หัว · คอ · ผม',jobId:'saved-job',portraitMode:'female',femaleEyeStyle:'makeup',initialFemaleEyeStyle:'makeup',femaleFinishProfile:profile,femaleFinishReference:reference};
 let wallet='account-A',token='token-A';const oldMaster=new Blob(['active master']),mutations=[];
 const restored={source:initial,editCache:{master,lock:{templatePath:'female.png'}},head,project:{layers:[head],placement:null}};
 const env={...helpers,femaleFinishMetadata:metadata,femaleFinishHeadMetadata:headMetadata,femaleFinishAnchor:anchor,portraitFinishChoice,activeSavedDownloadWork:'',
  currentWalletId:()=>wallet,authToken:()=>token,walletHeaders:()=>({Authorization:token,'X-Wallet-Id':wallet}),refreshWallet:async()=>{},
  savedWorkLoadRequestRef:{current:0},savedWorkOpenRequestRef:{current:0},prepareSavedProject:async()=>restored,decodedStudioImage:noop,
  firstUploadedPhotoRef:{current:photo()},editCache:{current:{master:oldMaster}},initialFemaleMakeupRef:{current:null},initialProcessedMasterRef:{current:oldMaster},
  hairResultCacheRef:{current:new Map([['old','entry']])},preparedHairBaseRef:{current:null},lastHairDonorRef:{current:null},cleanHairBaseRef:{current:null},initialStyledHairRef:{current:null},
  liveAdjustRef:{current:{}},liveCollarWarpRef:{current:0},liveCollarHeightRef:{current:0},liveNeckAdjustRef:{current:{}},
  currentOutputJobRef:{current:'old-job'},currentOutputTrialRef:{current:false},studioTrialRef:{current:false},studioOriginRef:{current:{}},savedWorkIdRef:{current:''},
  setOutputJobId:noop,setTrialPreview:noop,setHairId:noop,setF:noop,setA:noop,setRestoredSourcePhoto:noop,setAccountSaveNotice:noop,setSavedWorkUnlocked:noop,setPurchaseEditing:noop,setSessionEditJob:noop,setSavedWorkRevision:noop,setScreen:noop,setStudioData:layers=>mutations.push(layers),
  paymentStudioRef:{current:null},restoredCheckoutRef:{current:null},URL:{createObjectURL:()=> 'blob:offline'},backgroundRef:{current:'blue'},
  makeSavedProject:async snapshot=>({layers:snapshot.layers,placement:snapshot.placement,compareSource:'fixture-data-url'}),
  renderAdjustedFinal:async(...args)=>args.at(-1).push({kind:'head',name:'หัว · คอ · ผม',source:'fixture-current-head'})
 };
 const open=extract(' const openAccountWork=async(','\n const [downloadUnlockSignal','openAccountWork',env);
 const checkout=extract(' const restorePurchaseDraft=async','\n const fullCatalog=','restorePurchaseDraft',env);
 return {env,open,checkout,restored,initial,master,head,oldMaster,mutations,setWallet:value=>{wallet=value},setToken:value=>{token=value}};
}
await test('account reopen uses saved first finish with latest head pixels and clears previous-person caches',async()=>{
 const f=restorationFixture();await f.open({id:'saved-work',project:{layers:[f.head],placement:null}});
 const a=f.env.initialFemaleMakeupRef.current;assert.equal(a.source,f.initial);assert.equal(a.master,f.master);assert.equal(a.femaleFinishProfile,profile);assert.equal(a.femaleFinishReference,reference);assert.equal(f.env.hairResultCacheRef.current.size,0);assert.equal(f.mutations.length,1);
});
await test('account reopen rejects stale account, work, request and abort before changing the active image',async()=>{
 for(const kind of ['wallet','token','work','request','abort']){
  const f=restorationFixture();let release,entered;const waiting=new Promise(resolve=>{entered=resolve});f.env.prepareSavedProject=async()=>{entered();return new Promise(resolve=>{release=resolve})};const controller=new AbortController(),pending=f.open({project:{layers:[f.head]}},{signal:controller.signal});await waiting;await Promise.resolve();
  if(kind==='wallet')f.setWallet('account-B');if(kind==='token')f.setToken('token-B');if(kind==='work')f.env.savedWorkOpenRequestRef.current++;if(kind==='request')f.env.savedWorkLoadRequestRef.current++;if(kind==='abort')controller.abort();
  release(f.restored);await assert.rejects(pending);assert.equal(f.env.editCache.current.master,f.oldMaster);assert.equal(f.mutations.length,0);
 }
});
await test('checkout restore retains plain first-finish metadata after Blob properties are lost in storage',async()=>{
 const f=restorationFixture(),draft={walletId:'account-A',jobId:'paid-job',isTrial:false,originalFile:new File(['raw source'],'original.jpg',{type:'image/jpeg'}),classicMaster:new Blob(['latest stored head']),classicLock:{templatePath:'female.png'},classicFemaleFinish:{femaleFinishProfile:profile,femaleFinishReference:reference}};
 f.env.loadPurchaseDraft=async()=>draft;const snapshot=await f.checkout(),a=f.env.initialFemaleMakeupRef.current;
 assert.equal(a.femaleFinishProfile,profile);assert.equal(a.femaleFinishReference,reference);assert.equal(snapshot.layers[0].portraitMode,'female');assert.equal(snapshot.layers[0].initialFemaleEyeStyle,'makeup');assert.equal(draft.originalFile.idpromPortraitMode,'female');assert.equal(draft.originalFile.idpromFemaleEyeStyle,'makeup');
});
await test('classic finish metadata includes the mode needed by later account reopen',()=>{
 const blob=Object.assign(new Blob(['classic master']),{idpromFemaleFinishProfile:profile,idpromFemaleFinishReference:reference}),head=headMetadata(blob);
 assert.equal(head.portraitMode,'female');assert.equal(head.initialFemaleEyeStyle,'makeup');assert.equal(head.femaleFinishProfile,profile);assert.equal(head.femaleFinishReference,reference);
 assert(section(main,' const openStudio=async()=>{','\n const downloadCurrentFinal=').includes('femaleFinishHeadMetadata(editCache.current?.master)'));
 assert(section(main,' const startCheckout=async(','\n const ',).includes('classicFemaleFinish:femaleFinishMetadata(editCache.current?.master)'));
});

function pipelineFixture(source=main){
 const calls=[],events=[],keys=[],cache=createAiResultCache(),file=photo();let jobs=0;
 const cancel=()=>Object.assign(Error('cancelled'),{code:'USER_CANCELLED'});
 const uploadGenerationScope=extract('const uploadGenerationScopes=','\nasync function aiFinishPortrait(','uploadGenerationScope',{},source);
 const env={...helpers,PRODUCTION_HAIR_CATALOG,HAIR_DESIGN_VERSION,femaleFinishMetadata:metadata,validateFemaleMakeupReference:validator,activeProcessOperation:{cancelled:false},
  assertProcessActive:operation=>{if(operation?.cancelled)throw cancel()},cancelledProcessError:cancel,currentResultCacheScope:()=> 'fixture-account',resultSourceDigest,uploadGenerationScope,
  portraitResultCache:{...cache,get:(key,generate)=>{keys.push(key);return cache.get(key,generate)}},
  aiFinishPortraitUncached:async(input,hair,options)=>{jobs++;calls.push({stage:'generate',input,hair,options});return Object.assign(new Blob(['generated output']),{idpromJobId:'job-'+jobs,idpromTrial:false,idpromFullEdit:true,...env.generatedMetadata})},
  cleanPortraitClothing:async blob=>{calls.push({stage:'clean'});return blob},finishFemaleMakeupEyeToneBlob:async blob=>{calls.push({stage:'eye'});return blob},
  finishFemaleSkinContinuityBlob:async(blob,target,guide)=>{calls.push({stage:'skin',target,guide});return Object.assign(blob,{idpromFemaleFinishProfile:target||profile,idpromFemaleFinishReference:guide||reference})},
  checkPortraitProportions:async()=>{},checkPortraitCompletion:async()=>{},verifyOutputRights:async()=>({checked:true,unlocked:true,fullEdit:true}),saveAiJobFile:async()=>{},writeActiveAiJob:noop,
  CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail}},window:{dispatchEvent:event=>events.push(event)}
 };
 const run=extract('async function aiFinishPortrait(','\nlet acceptedPaidTrial=','aiFinishPortrait',env,source);
 return {env,run,calls,events,keys,file};
}
await test('female makeup generation uses the upload and ignores previous-profile cosmetic repaint',async()=>{
 const f=pipelineFixture();await f.run(f.file,'seedream-21',{portraitMode:'female',femaleEyeStyle:'makeup',creditKind:'hairstyle',femaleFinishProfile:profile,femaleMakeupReference:reference});
 assert.deepEqual(f.calls.map(c=>c.stage),['generate','clean']);assert.equal(f.calls[0].input,f.file);assert.equal(f.calls[0].options.femaleMakeupReference,null);assert.equal(f.calls[0].options.femaleFinishProfile,null);assert.equal(f.events.length,1);
 assert(f.keys[0].includes('upload-adaptive-korean-v1'));assert(f.keys[0].includes('download-v1'));assert(!f.keys[0].includes('skin-finish-v1:'));
});
await test('initial first-result cache reuse preserves finish metadata without running local work twice',async()=>{
 const f=pipelineFixture();f.env.generatedMetadata={idpromFemaleFinishProfile:profile,idpromFemaleFinishReference:reference};
 const first=await f.run(f.file,'original',{portraitMode:'female',femaleEyeStyle:'makeup'}),again=await f.run(f.file,'original',{portraitMode:'female',femaleEyeStyle:'makeup'});
 assert.notEqual(again,first);assert.equal(again.idpromReused,true);assert.equal(again.idpromJobId,first.idpromJobId);assert.equal(again.idpromFemaleFinishProfile,profile);assert.equal(again.idpromFemaleFinishReference,reference);assert.deepEqual(f.calls.map(c=>c.stage),['generate','clean']);assert.equal(f.events.length,2);
});
await test('new uploads isolate cache entries while obsolete accepted profiles cannot change the current upload',async()=>{
 const f=pipelineFixture();for(const target of [profile,otherProfile])await f.run(f.file,'original',{portraitMode:'female',femaleEyeStyle:'makeup',femaleFinishProfile:target});assert.equal(f.keys[0],f.keys[1]);assert.equal(f.calls.filter(c=>c.stage==='generate').length,1);
 await f.run(photo(),'original',{portraitMode:'female',femaleEyeStyle:'makeup',femaleFinishProfile:profile});assert.notEqual(f.keys[0],f.keys[2]);assert.equal(f.calls.filter(c=>c.stage==='generate').length,2);
});
await test('cancellation and active-operation replacement during portrait cleanup prevent delivery',async()=>{
 for(const kind of ['cancel','replace']){const f=pipelineFixture();f.env.cleanPortraitClothing=async blob=>{if(kind==='cancel')f.env.activeProcessOperation.cancelled=true;else f.env.activeProcessOperation={cancelled:false};return blob};await assert.rejects(f.run(f.file,'original',{portraitMode:'female',femaleEyeStyle:'makeup'}),e=>e.code==='USER_CANCELLED');assert.equal(f.events.length,0)}
});
await test('portrait completion rejection evicts the failed result without another financial settlement',async()=>{
 const f=pipelineFixture();let settlements=0;f.env.settleProcessOperation=async()=>{settlements++};f.env.checkPortraitCompletion=async()=>{throw Object.assign(Error('incomplete fixture portrait'),{code:'PORTRAIT_FINISH_FIXTURE_REJECTION'})};
 for(let i=0;i<2;i++)await assert.rejects(f.run(f.file,'original',{portraitMode:'female',femaleEyeStyle:'makeup'}),e=>e.code==='PORTRAIT_FINISH_FIXTURE_REJECTION');
 assert.equal(f.calls.filter(c=>c.stage==='generate').length,2);assert.equal(f.events.length,0);assert.equal(settlements,0);
});
await test('natural and male paths keep their established cache keys and skip female finish work',async()=>{
 for(const [mode,style,hair] of [['female','natural','seedream-21'],['male','natural','seedream-35'],['male','makeup','seedream-35']]){
  const f=pipelineFixture();f.file.idpromFemaleEyeStyle=style;await f.run(f.file,hair,{portraitMode:mode,femaleEyeStyle:style,femaleFinishProfile:profile,femaleMakeupReference:reference});assert.deepEqual(f.calls.map(c=>c.stage),['generate','clean']);assert(!f.keys[0].includes('skin-finish-v1:'));assert(!f.keys[0].includes('soft-finish-v23'));assert.equal(f.calls[0].options.femaleMakeupReference,null);
  if(baseline){const before=pipelineFixture(baseline);before.file.idpromFemaleEyeStyle=style;await before.run(before.file,hair,{portraitMode:mode,femaleEyeStyle:style,femaleFinishProfile:profile,femaleMakeupReference:reference});assert.equal(f.keys[0],before.keys[0]);assert.deepEqual(f.calls.map(({input,...call})=>call),before.calls.map(({input,...call})=>call))}
 }
});
if(baseline)await test('the outgoing multipart request implementation is byte-for-byte unchanged',()=>{
 assert.equal(section(main,'async function aiFinishPortraitUncached(','\n// V206:'),section(baseline,'async function aiFinishPortraitUncached(','\n// V206:'));
});

const result={status:cases.some(c=>c.status==='FAIL')?'FAIL':'PASS',timestamp:new Date().toISOString(),scope:'Actual main.jsx extraction; fake codec, landmarks, transport and matcher; no live provider or financial writes',mainSha256:createHash('sha256').update(main).digest('hex'),baselineSha256:baseline?createHash('sha256').update(baseline).digest('hex'):null,cases};
if(args['--output']){await mkdir(dirname(args['--output']),{recursive:true});await writeFile(args['--output'],JSON.stringify(result,null,2)+'\n')}
console.log(JSON.stringify({status:result.status,cases:cases.length,failed:cases.filter(c=>c.status==='FAIL').map(c=>c.name)},null,2));
if(result.status!=='PASS')process.exitCode=1;
