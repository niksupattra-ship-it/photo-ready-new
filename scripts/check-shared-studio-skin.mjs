import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {makeSavedProject,prepareSavedProject,validateSavedProject,assertSavedProjectResources} from '../src/saved-project.js';
import {packSavedProjectTransfer,unpackSavedProjectTransfer,getSavedWorkRequestSize,SAVED_WORK_TRANSFER_MAX_BYTES} from '../src/saved-work-transfer.js';
import {compactSavedWorkPreview} from '../saved-work-thumbnail.js';
import {STUDIO_SKIN_WORKFLOW_VERSION} from '../studio-skin-treatment.js';
import {hasOriginalPortraitAiFinish} from '../original-portrait-ai.js';
import {NATURAL_STUDIO_SKIN_VERSION} from '../natural-studio-skin.js';
import {hasCurrentStudioSkin,studioSkinWorkflowMetadata} from '../studio-skin-metadata.js';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
import {canReuseStudioSkinBase,sharedStudioSkinSource,studioSkinBlobFromSource,copyStudioSkinBlobMetadata,isStudioSkinGeometry,studioSkinMasterFrame} from '../src/shared-studio-skin.js';
import {replaceHairstyleLayer} from '../src/replace-hairstyle-layer.js';
import {preserveLocalSkinLook} from '../src/preserve-local-skin-look.js';
import {headPose} from '../src/hair-preview-fit.js';
import {HAIR_DESIGN_VERSION} from '../hairstyle-catalog.js';
import {isFreeFemaleHair} from '../src/free-female-hair.js';
import {fitHairMasterFrame} from '../src/hair-master-frame.js';

const data=(buffer,type='png')=>'data:image/'+type+';base64,'+buffer.toString('base64');
const bytes=source=>Buffer.from(source.slice(source.indexOf(',')+1),'base64');
async function image(tint=0,width=128,height=192){
 const raw=Buffer.alloc(width*height*3);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++)raw[(y*width+x)*3+c]=[184,145,133][c]+tint+Math.round(5*Math.sin(x*1.3)*Math.cos(y*1.1));
 return data(await sharp(raw,{raw:{width,height,channels:3}}).png().toBuffer());
}
const base=await image(),madeUp=await image(2),otherSize=await image(0,64,96);
const nativeGeometry={width:128,height:192,chinY:150,faceCX:64,faceWidth:80};
const head=extra=>({studioSkinGeometry:nativeGeometry,id:'head',kind:'head',name:'หัว · คอ · ผม',jobId:'unchanged-accepted-job',portraitMode:'female',femaleEyeStyle:'makeup',source:madeUp,studioSkinBaseSource:base,studioSkinVersion:STUDIO_SKIN_WORKFLOW_VERSION,studioCosmeticsVersion:STUDIO_SKIN_WORKFLOW_VERSION+':makeup',x:12,y:-7,scale:1.1,rotation:3,opacity:.85,visible:true,sourceFrame:{x:21,y:4,w:700,h:1050},...extra});
const project=layer=>({format:'idprom-studio',version:1,width:900,height:1200,layers:[layer],unknown:{keep:'future metadata'}});
const clone=value=>JSON.parse(JSON.stringify(value));
const decode=async source=>{const metadata=await sharp(bytes(source)).metadata();return {width:metadata.width,height:metadata.height}};
const cases=[];
async function test(name,run){await run();cases.push(name);console.log('PASS '+name)}

await test('same unpainted skin base survives save, lossless transfer and reopen beside current cosmetics',async()=>{
 const original=project(head({processedOriginalSource:madeUp,makeupBaseSource:base})),snapshot=JSON.stringify(original);
 const saved=await makeSavedProject(original),packed=packSavedProjectTransfer(saved),roundtrip=unpackSavedProjectTransfer(clone(packed));
 assert.equal(packed.format,'idprom-project-transfer');
 assert.equal(packed.images.filter(value=>value===base).length,1,'shared bare base must be encoded once on the wire');
 assert.deepEqual(roundtrip,saved);
 assert.equal(getSavedWorkRequestSize('work-fixture',packed),Buffer.byteLength(JSON.stringify({id:'work-fixture',project:saved})));
 const decoded=[],opened=await prepareSavedProject(roundtrip,{decode:async source=>{decoded.push(source);return decode(source)}});
 assert.equal(opened.head.studioSkinBaseSource,base);assert.equal(opened.head.source,madeUp);
 assert.equal(decoded.filter(source=>source===base).length,1,'aliased base should decode once');
 assert.equal(opened.head.jobId,'unchanged-accepted-job');assert.equal(opened.head.rotation,3);assert.equal(opened.head.opacity,.85);
 assert.equal(JSON.stringify(original),snapshot,'save or open mutated the accepted project');
 const natural={...opened.head,source:base,femaleEyeStyle:'natural'};delete natural.studioCosmeticsVersion;
 const reopened=await prepareSavedProject(clone(await makeSavedProject({...saved,layers:[natural]})),{decode});
 assert.equal(reopened.head.studioSkinBaseSource,base);assert.equal(reopened.head.source,base);assert.equal(reopened.head.jobId,opened.head.jobId);
});
await test('base contributes encoded and decoded resource memory without an additional editable canvas',()=>{
 const without=head();delete without.studioSkinBaseSource;
 const a=assertSavedProjectResources(project(without)).summary(),b=assertSavedProjectResources(project(head())).summary();
 assert.equal(b.uniqueImages-a.uniqueImages,1);assert.equal(b.uniquePixels-a.uniquePixels,128*192);
 assert.equal(b.residentBytes-a.residentBytes,128*192*4+base.length*2);
 const shared=assertSavedProjectResources(project(head({source:base}))).summary();
 assert.equal(shared.uniqueImages,1,'Natural source and common base share one decoded resource');
 assert.equal(SAVED_WORK_TRANSFER_MAX_BYTES,64*1024*1024,'existing request limit changed');
});
await test('twenty-layer transfer capacity includes the additional shared-base field without relaxing byte limits',()=>{
 const fields=['source','processedOriginalSource','hairOriginalSource','makeupBaseSource','makeupFullSource','studioSkinBaseSource','mask','warpSource','warpBaseMask','eraseRestoreSource','warpRestoreBase'];
 const images=[],ref=()=>{const index=images.length;images.push('data:image/png;base64,A'+index);return {$image:index}};
 const layers=Array.from({length:20},(_,index)=>({...head({id:'layer-'+index}),...Object.fromEntries(fields.map(key=>[key,ref()])),collarParts:{left:ref(),right:ref()}}));
 const transfer={format:'idprom-project-transfer',version:1,images,project:{...project(),layers,compareSource:ref(),downloadSource:ref(),canonicalInput:ref()}};
 assert.equal(images.length,263);const restored=unpackSavedProjectTransfer(transfer);
 assert.equal(restored.layers[19].studioSkinBaseSource,images[19*13+5]);
 assert.equal(getSavedWorkRequestSize('max-slots',transfer),Buffer.byteLength(JSON.stringify({id:'max-slots',project:restored})));
});
await test('invalid shared base URLs are rejected before any decode or active-project replacement',async()=>{
 let decodes=0;const current={accepted:true},active={value:current};
 for(const invalid of ['https://example.invalid/base.png',{$image:0},'data:image/svg+xml;base64,AAAA']){
  const incoming=project(head({studioSkinBaseSource:invalid}));
  assert.throws(()=>validateSavedProject(incoming));
  await assert.rejects(async()=>{active.value=await prepareSavedProject(incoming,{decode:async source=>{decodes++;return decode(source)}})});
  assert.equal(active.value,current);
 }
 assert.equal(decodes,0);
});
await test('corrupt and mismatched base pixels fail before replacing the active project',async()=>{
 const current={accepted:true},active={value:current};
 for(const source of ['data:image/png;base64,AAAA',otherSize]){
  await assert.rejects(async()=>{active.value=await prepareSavedProject(project(head({studioSkinBaseSource:source})),{decode})});
  assert.equal(active.value,current);
 }
 const original=project(head());
 await assert.rejects(prepareSavedProject(original,{decode:async source=>source===base?{width:256,height:384}:decode(source)}),/ขนาดภาพ/);
 assert.equal(original.layers[0].studioSkinBaseSource,base);
});
await test('oversized shared base is included in the existing native-pixel import limit',()=>{
 const oversized=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(oversized);oversized.write('IHDR',12);oversized.writeUInt32BE(3000,16);oversized.writeUInt32BE(3000,20);
 assert.throws(()=>assertSavedProjectResources(project(head({studioSkinBaseSource:data(oversized)}))),error=>error.code==='PROJECT_RESOURCE_LIMIT');
});
await test('older projects remain optional and compact previews omit the full common skin base',async()=>{
 const legacy=head();delete legacy.studioSkinBaseSource;delete legacy.studioSkinVersion;delete legacy.studioCosmeticsVersion;
 const original=project(legacy),opened=await prepareSavedProject(clone(original),{decode});assert.deepEqual(opened.project,original);assert.equal(opened.head.studioSkinBaseSource,undefined);
 const preview=await compactSavedWorkPreview(project(head())),plain=await compactSavedWorkPreview(project(legacy));
 assert.deepEqual(preview,plain);assert(!JSON.stringify(preview).includes('studioSkinBase'));assert(!JSON.stringify(preview).includes(base));
});

const app=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const callbackStart=app.indexOf(' const syncStudioPortraitFinish='),callbackEnd=app.indexOf(' const changeStudioHair=',callbackStart);
assert(callbackStart>=0&&callbackEnd>callbackStart,'actual shared finish transaction callbacks missing');
const callbacks=Function('env',`with(env){${app.slice(callbackStart,callbackEnd)};return {syncStudioPortraitFinish,changeStudioPortraitFinish}}`);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function transactionFixture({sourceBase=base,sourceMakeup=madeUp,geometry=nativeGeometry,sourceFrame={x:21,y:4,w:700,h:1050},parentLock}={}){
 const upload=new File(['immutable upload'],'upload.jpg',{type:'image/jpeg'});upload.idpromFemaleEyeStyle='natural';
 const master=studioSkinBlobFromSource(sourceBase);Object.assign(master,{idpromStudioSkinVersion:STUDIO_SKIN_WORKFLOW_VERSION,idpromStudioSkinBaseSource:sourceBase,idpromNaturalStudioSkinVersion:NATURAL_STUDIO_SKIN_VERSION,idpromJobId:'unchanged-accepted-job',idpromTrial:true,idpromFullEdit:false});
 const originalCache={master,lock:parentLock||{templatePath:'unchanged-suit',W:900,H:1200,headW:128,headH:192,hX:100,hY:120,scale:2,chinY:150,faceCX:64,hairFitEyeSize:99,hairFitEyeCentreX:88,hairFitChinAnchorY:77}},remembered=[],events=[],gate=deferred(),started=deferred(),state={token:'account-A',wallet:'wallet-A',valid:true,fail:false};
 const env={STUDIO_SKIN_WORKFLOW_VERSION,NATURAL_STUDIO_SKIN_VERSION,canReuseStudioSkinBase,sharedStudioSkinSource,studioSkinBlobFromSource,copyStudioSkinBlobMetadata,isStudioSkinGeometry,studioSkinMasterFrame,studioSkinWorkflowMetadata,hasCurrentStudioSkin,portraitFinishChoice,Blob,URL,
  studioSkinGeometryRef:{current:null},liveAdjustRef:{current:{scale:1.2,x:.1,y:.2,rotation:4}},liveNeckAdjustRef:{current:{width:8,length:9}},initialHeadAdjustRef:{current:null},lockedPlacementRef:{current:{old:true}},lockedMasterRef:{current:master},setHeadAdjust:()=>{},setNeckAdjust:()=>{},setPlacementLocked:()=>{},editCache:{current:originalCache},firstUploadedPhotoRef:{current:upload},studioPhotoTransactionRef:{current:false},currentOutputJobRef:{current:'unchanged-accepted-job'},currentOutputTrialRef:{current:true},studioTrialRef:{current:true},savedWorkOpenRequestRef:{current:1},busy:false,hairBusy:false,
  walletScope:(token,wallet)=>JSON.stringify([token,wallet]),authToken:()=>state.token,currentWalletId:()=>state.wallet,
  blobDataURL:async blob=>data(Buffer.from(await blob.arrayBuffer()),blob.type.split('/')[1]),
  rememberHairResult(id,acceptedMaster,mode,finish){const entry={id,master:acceptedMaster,mode,finish,confirmed:false};remembered.push(entry);return entry},
  async finishSharedStudioSkin(input,{style,signal}){
   events.push('cosmetics-boundary');assert.equal(input.idpromStudioSkinBaseSource,sourceBase);assert.equal(input.idpromStudioCosmeticsVersion,undefined);assert.deepEqual(Buffer.from(await input.arrayBuffer()),bytes(sourceBase));started.resolve();await gate.promise;
   if(signal.aborted)throw Object.assign(Error('cancelled'),{name:'AbortError'});if(state.fail)throw Error('cosmetics failed');
   const result=copyStudioSkinBlobMetadata(input,studioSkinBlobFromSource(style==='natural'?sourceBase:sourceMakeup),{bare:true});result.idpromFemaleEyeStyle=style;
   if(style==='natural')result.idpromNaturalStudioSkinVersion=NATURAL_STUDIO_SKIN_VERSION;else result.idpromStudioCosmeticsVersion=STUDIO_SKIN_WORKFLOW_VERSION+':'+style;
   return result;
  },
  prepareStudioMakeup:async()=>{throw Error('inert cosmetic boundary must not prepare')},canvasPng:async()=>{throw Error('inert cosmetic boundary must not encode')},
  portraitFetch:async()=>{events.push('API');throw Error('local finish must not call API')},aiFinishPortrait:async()=>{events.push('AI');throw Error('local finish must not call AI')},verifyOutputRights:async()=>{events.push('rights');throw Error('local finish must not verify or change rights')}
 };
 const naturalHead=head({source:sourceBase,studioSkinBaseSource:sourceBase,studioSkinGeometry:geometry,sourceFrame,femaleEyeStyle:'natural',initialFemaleEyeStyle:'natural',studioCosmeticsVersion:undefined,naturalStudioSkinVersion:NATURAL_STUDIO_SKIN_VERSION,mask:null,hairId:'original'});
 return {env,upload,originalCache,master,remembered,events,gate,started,state,naturalHead,...callbacks(env)};
}
function assertAcceptedUnchanged(f){assert.equal(f.env.editCache.current,f.originalCache);assert.equal(f.upload.idpromFemaleEyeStyle,'natural');assert.equal(f.env.currentOutputJobRef.current,'unchanged-accepted-job');assert.equal(f.env.currentOutputTrialRef.current,true);assert.equal(f.env.studioTrialRef.current,true);assert.equal(f.remembered.length,0)}
await test('local finish publishes pixels, parent master and confirmed hair cache together after hydration commit',async()=>{
 const f=transactionFixture(),pending=f.changeStudioPortraitFinish(f.naturalHead,'makeup');await f.started.promise;
 assertAcceptedUnchanged(f);assert.equal(f.env.studioPhotoTransactionRef.current,true);f.gate.resolve();const staged=await pending;
 assertAcceptedUnchanged(f);assert.equal(staged.localFinish,true);assert.equal(staged.reused,true);assert.equal(staged.layer.jobId,f.naturalHead.jobId);assert.equal(staged.layer.studioSkinBaseSource,base);assert.equal(staged.layer.source,madeUp);
 staged.commit();assert.equal(f.env.studioPhotoTransactionRef.current,false);assert.equal(f.upload.idpromFemaleEyeStyle,'makeup');assert.deepEqual(f.env.editCache.current.lock,studioSkinMasterFrame(staged.layer,f.originalCache.lock,staged.layer.studioSkinGeometry));assert.deepEqual(f.env.liveAdjustRef.current,{scale:1,x:0,y:0,rotation:0});assert.deepEqual(f.env.liveNeckAdjustRef.current,{width:0,length:0});assert.equal(f.env.lockedMasterRef.current,null);assert.equal(f.env.lockedPlacementRef.current,null);
 assert.equal(f.env.editCache.current.master.idpromJobId,f.naturalHead.jobId);assert(hasCurrentStudioSkin(f.env.editCache.current.master,'makeup'));assert.equal(f.remembered.length,1);assert.equal(f.remembered[0].confirmed,true);assert.equal(f.remembered[0].master,f.env.editCache.current.master);assert.equal(f.remembered[0].finish,'makeup');
 staged.commit();staged.rollback();assert.equal(f.remembered.length,1);assert.equal(f.env.currentOutputJobRef.current,'unchanged-accepted-job');assert.equal(f.env.currentOutputTrialRef.current,true);assert.deepEqual(f.events,['cosmetics-boundary']);
 assert.equal(await f.upload.text(),'immutable upload');assert(!Object.getOwnPropertyNames(f.upload).some(key=>key.startsWith('idpromStudio')),'processed metadata leaked onto upload');
});
await test('rollback and failed cosmetics preserve accepted master, preference, output job and rights',async()=>{
 for(const fail of [false,true]){
  const f=transactionFixture();f.state.fail=fail;const pending=f.changeStudioPortraitFinish(f.naturalHead,'makeup');await f.started.promise;f.gate.resolve();
  if(fail)await assert.rejects(pending,/cosmetics failed/);else{const staged=await pending;staged.rollback();assert.throws(()=>staged.commit(),/ยกเลิก/)}
  assertAcceptedUnchanged(f);assert.equal(f.env.studioPhotoTransactionRef.current,false);assert.deepEqual(f.events,['cosmetics-boundary']);
 }
});
await test('source, account, wallet, work, job, master and editor cancellation invalidate a pending local finish',async()=>{
 const changes=[f=>{f.env.firstUploadedPhotoRef.current=new Blob(['another upload'])},f=>{f.state.token='account-B'},f=>{f.state.wallet='wallet-B'},f=>{f.env.savedWorkOpenRequestRef.current++},f=>{f.env.currentOutputJobRef.current='another-job'},f=>{f.env.editCache.current={...f.originalCache}},f=>{f.state.valid=false}];
 for(const change of changes){
  const f=transactionFixture(),pending=f.changeStudioPortraitFinish(f.naturalHead,'makeup',{isCurrent:()=>f.state.valid});await f.started.promise;change(f);f.gate.resolve();await assert.rejects(pending);
  assert.equal(f.env.studioPhotoTransactionRef.current,false);assert.equal(f.upload.idpromFemaleEyeStyle,'natural');assert.equal(f.remembered.length,0);assert.deepEqual(f.events,['cosmetics-boundary']);
 }
});
await test('late commit checks current context and terminal old rollback cannot release a newer transaction',async()=>{
 const f=transactionFixture(),pending=f.changeStudioPortraitFinish(f.naturalHead,'makeup');await f.started.promise;f.gate.resolve();const old=await pending;old.rollback();assertAcceptedUnchanged(f);
 const next=await f.changeStudioPortraitFinish(f.naturalHead,'makeup');assert.equal(f.env.studioPhotoTransactionRef.current,true);old.rollback();assert.equal(f.env.studioPhotoTransactionRef.current,true);assert.throws(()=>old.commit());assert.equal(f.env.studioPhotoTransactionRef.current,true);
 f.state.token='account-B';assert.throws(()=>next.commit(),/บัญชีหรือรูปเปลี่ยน/);assertAcceptedUnchanged(f);next.rollback();assert.equal(f.env.studioPhotoTransactionRef.current,false);
});
await test('history sync restores exact visible finish and cache metadata while leaving the immutable upload unprocessed',async()=>{
 const f=transactionFixture(),makeupHead=head({hairId:'original'});
 assert(f.syncStudioPortraitFinish(makeupHead));assert.equal(f.upload.idpromFemaleEyeStyle,'makeup');assert(hasCurrentStudioSkin(f.env.editCache.current.master,'makeup'));assert.deepEqual(Buffer.from(await f.env.editCache.current.master.arrayBuffer()),bytes(madeUp));assert.equal(f.remembered.at(-1).confirmed,true);
 assert(f.syncStudioPortraitFinish(f.naturalHead));assert.equal(f.upload.idpromFemaleEyeStyle,'natural');assert(hasCurrentStudioSkin(f.env.editCache.current.master,'natural'));assert.deepEqual(Buffer.from(await f.env.editCache.current.master.arrayBuffer()),bytes(base));assert.equal(f.remembered.at(-1).finish,'natural');assert.equal(f.remembered.at(-1).confirmed,true);
 const count=f.remembered.length;assert.equal(f.syncStudioPortraitFinish({...makeupHead,jobId:'stale-job'}),false);assert.equal(f.remembered.length,count);assert.equal(f.env.currentOutputJobRef.current,'unchanged-accepted-job');
 assert.equal(await f.upload.text(),'immutable upload');assert.equal(f.upload.idpromStudioSkinVersion,undefined);assert.deepEqual(f.events,[]);
});
await test('history of a local PNG hairstyle caches its untrimmed accepted base and preserves the hairstyle identity',async()=>{
 const f=transactionFixture(),freeHairHead=head({freeHairBaseOriginal:true,hairOriginalSource:madeUp,hairId:''});
 assert(f.syncStudioPortraitFinish(freeHairHead));assert.equal(f.remembered.at(-1).id,'');assert.equal(f.remembered.at(-1).finish,'makeup');assert.deepEqual(Buffer.from(await f.env.editCache.current.master.arrayBuffer()),bytes(madeUp));assert.equal(f.env.editCache.current.master.idpromStudioSkinBaseSource,base);assert.deepEqual(f.events,[]);
});

const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
function editorFunction(start,end,name,env){const a=editor.indexOf(start),b=editor.indexOf(end,a);assert(a>=0&&b>a,'missing actual '+name);return Function('env',`with(env){${editor.slice(a,b)};return ${name}}`)(env)}
const maskStart=editor.indexOf('function identityStudioMask('),maskEnd=editor.indexOf('\nfunction dirtyRegion(',maskStart);
const identityStudioMask=Function(editor.slice(maskStart,maskEnd)+';return identityStudioMask')();
function editorFixture(){
 const parent=transactionFixture();parent.gate.resolve();
 const mask={width:4,height:4,getContext(){return {getImageData(){return {data:new Uint8ClampedArray(4*4*4).fill(255)}}}}};
 const visible={...parent.naturalHead,hairPolicyVersion:HAIR_DESIGN_VERSION,squeezeX:.93,squeezeY:1.17,mask:null};
 const counters={before:0,settle:0,AI:0,resets:0,local:0,restored:0,failures:[],hydrate:0};
 const noop=()=>{},env={HAIR_DESIGN_VERSION,NATURAL_STUDIO_SKIN_VERSION,hasCurrentStudioSkin,hasOriginalPortraitAiFinish,canReuseStudioSkinBase,sharedStudioSkinSource,portraitFinishChoice,isFreeFemaleHair,identityStudioMask,headPose,preserveLocalSkinLook,replaceHairstyleLayer,
  state:{current:[visible]},assets:{current:new Map([[visible.id,{mask,warped:null,eraseRestoreSource:null}]])},processRequestRef:{current:false},processActive:false,assetBusy:false,ready:true,mounted:{current:true},hairGender:'female',portraitMode:'female',sourcePhoto:parent.upload,sourcePhotoRef:{current:parent.upload},accountScope:'same-account',outputScopeRef:{current:'same-account'},sourceLayerRef:{current:null},undo:{current:[]},redo:{current:[]},historyTruncatedRef:{current:false},historyBoundaryNoticeRef:{current:false},hydratingRef:{current:false},touch:false,
  layerKind:layer=>layer.kind,canRestoreHair:()=>false,isProcessCancelled:()=>false,isPremiumHair:()=>false,premiumHairAllowed:false,
  flushTransforms:noop,historySnapshot:()=>env.state.current.map(layer=>({...layer,mask:layer.id===visible.id?mask:layer.mask})),resetPhotoHistory:()=>{counters.resets++;env.undo.current=[];env.redo.current=[]},resetBrushSession:noop,
  onBeforeProcess:()=>{counters.before++;throw Error('local finish must not request generation balance')},checkProcessCredits:async()=>{counters.before++;throw Error('local finish must not request generation balance')},onFinishProcess:async()=>{counters.settle++;throw Error('local finish must not settle an AI job')},
  onChangeHair:async()=>{counters.AI++;throw Error('local finish must not generate AI')},
  onLocalPortraitFinish:async(...args)=>{counters.local++;return parent.changeStudioPortraitFinish(...args)},onRestorePortraitFinish:head=>{counters.restored++;return parent.syncStudioPortraitFinish(head)},
  appearanceFailure:(kind,message)=>counters.failures.push({kind,message}),
  async hydrate(next,_unchanged,canCommit=()=>true){counters.hydrate++;if(env.beforeHydrate)await env.beforeHydrate(next);if(env.failHydrate){env.failHydrate=false;return false}if(!canCommit())return false;env.state.current=next;return true},
  restoreHistory:()=>false,lastItem:list=>list.at(-1),surfaceURL:value=>value,onMakeup:noop,mixMakeupLookSources:noop,
  setAssetBusy:value=>{env.assetBusy=value},setRevision:noop,setSelected:noop,setSelectedHair:noop,setTool:noop,setComparing:noop,setHairConfirmed:noop,setHairNotice:noop,setPicker:noop,setTouchMore:noop,setTouchOpen:noop,setToolRailOpen:noop,setAppearanceError:noop,setStatus:noop,setHistoryNotice:noop,trackHairSelection:noop,reportProcessedResult:noop,
  fresh:layer=>({...layer,id:'fresh-'+Math.random()}),refitActiveSuit:async next=>next
 };
 const apply=editorFunction(' const applyHair=async (','\n const selectPortraitFinish=','applyHair',env),history=editorFunction(' const history=async back=>','\n const point=','history',env);
 return {parent,env,visible,mask,counters,apply,history};
}
await test('actual editor local finish bypasses AI and settlement, keeps pose and squeeze, and supports undo/redo',async()=>{
 const f=editorFixture();await f.apply('original',{femaleEyeStyle:'makeup',portraitMode:'female',appearanceKind:'makeup'});
 assert.deepEqual(f.counters.failures,[]);assert.equal(f.counters.local,1);assert.equal(f.counters.AI,0);assert.equal(f.counters.before,0);assert.equal(f.counters.settle,0);assert.equal(f.counters.resets,0);assert.equal(f.env.undo.current.length,1);
 const accepted=f.env.state.current[0];for(const key of ['id','x','y','scale','rotation','opacity','squeezeX','squeezeY'])assert.equal(accepted[key],f.visible[key],key+' changed');assert.deepEqual(accepted.sourceFrame,f.visible.sourceFrame);assert.equal(accepted.jobId,f.visible.jobId);assert.equal(accepted.source,madeUp);assert.equal(accepted.studioSkinBaseSource,base);assert(hasCurrentStudioSkin(f.parent.env.editCache.current.master,'makeup'));
 await f.history(true);assert.equal(f.env.state.current[0].source,base);assert.equal(f.env.redo.current.length,1);assert(hasCurrentStudioSkin(f.parent.env.editCache.current.master,'natural'));assert.equal(f.parent.upload.idpromFemaleEyeStyle,'natural');
 await f.history(false);assert.equal(f.env.state.current[0].source,madeUp);assert(hasCurrentStudioSkin(f.parent.env.editCache.current.master,'makeup'));assert.equal(f.parent.upload.idpromFemaleEyeStyle,'makeup');assert.equal(f.counters.restored,2);
 await f.apply('original',{femaleEyeStyle:'natural',portraitMode:'female',appearanceKind:'makeup'});assert.equal(f.env.state.current[0].source,base);assert.equal(f.counters.local,2);assert.equal(f.counters.AI,0);assert.equal(f.counters.settle,0);assert.deepEqual(f.counters.failures,[]);
});
await test('editor failed hydration or changed source/scope rolls back local parent and visible finish',async()=>{
 for(const scenario of ['hydrate','source','scope']){
  const f=editorFixture();if(scenario==='hydrate')f.env.failHydrate=true;else f.env.beforeHydrate=async()=>{if(scenario==='source')f.env.sourcePhotoRef.current=new Blob(['other']);else f.env.outputScopeRef.current='other-account'};
  await f.apply('original',{femaleEyeStyle:'makeup',portraitMode:'female',appearanceKind:'makeup'});
  assert.equal(f.env.state.current[0].source,base);assert.equal(f.env.undo.current.length,0);assertAcceptedUnchanged(f.parent);assert.equal(f.parent.env.studioPhotoTransactionRef.current,false);assert.equal(f.env.processRequestRef.current,false);assert.equal(f.env.assetBusy,false);assert.equal(f.counters.AI,0);assert.equal(f.counters.before,0);assert.equal(f.counters.settle,0);assert.equal(f.counters.failures.length,1);
 }
});
await test('Natural → Makeup → Natural → undo → redo → Natural retains one skin base without generation',async()=>{
 const f=editorFixture(),choose=style=>f.apply('original',{femaleEyeStyle:style,portraitMode:'female',appearanceKind:'makeup'});
 await choose('makeup');await choose('natural');assert.equal(f.counters.local,2);assert.equal(f.env.state.current[0].source,base);
 await f.history(true);assert.equal(f.env.state.current[0].source,madeUp);assert.equal(f.parent.upload.idpromFemaleEyeStyle,'makeup');
 await f.history(false);assert.equal(f.env.state.current[0].source,base);assert.equal(f.parent.upload.idpromFemaleEyeStyle,'natural');
 const before=f.parent.env.editCache.current.master;await choose('natural');assert.equal(f.counters.local,3,'legacy v5 is no longer the current original-AI finish');assert.deepEqual(Buffer.from(await f.parent.env.editCache.current.master.arrayBuffer()),Buffer.from(await before.arrayBuffer()));assert.equal(f.env.state.current[0].studioSkinBaseSource,base);
 assert.equal(f.counters.AI,0);assert.equal(f.counters.before,0);assert.equal(f.counters.settle,0);assert.deepEqual(f.counters.failures,[]);assert(hasCurrentStudioSkin(before,'natural'));
});
await test('local finish refits an existing free hairstyle and keeps its untrimmed base through history',async()=>{
 const f=editorFixture(),overlay={id:'front-hair',kind:'hair-preview',hairHeadId:f.visible.id,hairId:'hair-21',hairRole:'front',name:'ทรงผมเดิม',x:8,y:3,scale:1.07,squeezeX:.99,squeezeY:1.02,rotation:1,opacity:.8,visible:true,locked:false,source:base};
 f.env.state.current=[{...f.visible,hairId:'',freeHairBaseOriginal:true,hairOriginalSource:base},overlay];let fits=0;
 f.env.onPrepareHairOverlay=async(source,id,options)=>{fits++;assert.equal(source,madeUp);assert.equal(id,'hair-21');assert.equal(options.sourceJobId,f.visible.jobId);return {cleanedHeadSource:madeUp,source:base,backSource:base,aiComposed:false}};
 await f.apply('',{femaleEyeStyle:'makeup',portraitMode:'female',appearanceKind:'makeup'});assert.deepEqual(f.counters.failures,[]);assert.equal(fits,1);assert.equal(f.counters.AI,0);assert.equal(f.counters.settle,0);
 const accepted=f.env.state.current.find(layer=>layer.kind==='head'),front=f.env.state.current.find(layer=>layer.hairRole==='front'),back=f.env.state.current.find(layer=>layer.hairRole==='back');
 assert.equal(accepted.hairOriginalSource,madeUp);assert.equal(accepted.studioSkinBaseSource,base);assert.equal(accepted.freeHairBaseOriginal,true);assert.equal(accepted.hairId,'');assert(front&&back);assert.equal(front.hairId,'hair-21');for(const key of ['x','y','scale','rotation','opacity'])assert.equal(front[key],overlay[key]);assert.equal(front.hairHeadId,accepted.id);assert.equal(f.parent.remembered.at(-1).id,'');
 await f.history(true);assert.deepEqual(Buffer.from(await f.parent.env.editCache.current.master.arrayBuffer()),bytes(base));await f.history(false);assert.deepEqual(Buffer.from(await f.parent.env.editCache.current.master.arrayBuffer()),bytes(madeUp));assert.equal(f.parent.remembered.at(-1).id,'');
});
await test('actual mask inspection accepts only fully opaque masks for local base reuse',()=>{
 assert(identityStudioMask(null));assert(identityStudioMask(editorFixture().mask));assert(!identityStudioMask({width:2,height:2,getContext:()=>null}));
 const edited={width:4,height:4,getContext(){return {getImageData(){const pixels=new Uint8ClampedArray(64).fill(255);pixels[19]=254;return {data:pixels}}}}};assert(!identityStudioMask(edited));
});

await test('an already placed full-frame skin master is not placed a second time when outfits change',async()=>{
 const source=await image(0,180,240),geometry={width:180,height:240,chinY:180,faceCX:90,faceWidth:72};
 const previous={W:1800,H:2400,hX:321,hY:207,headW:1984,headH:2256,scale:.55,chinY:1320,faceCX:984,placedFaceW:620,templatePath:'old-suit.png',hairFitEyeSize:12,hairFitEyeCentreX:17,hairFitChinAnchorY:19};
 const normalized=studioSkinMasterFrame({source,sourceFrame:null},previous,geometry);
 assert(normalized);assert.equal(normalized.hX,0);assert.equal(normalized.hY,0);assert.equal(normalized.headW,180);assert.equal(normalized.headH,240);assert.equal(normalized.scale,10);
 assert.equal(normalized.headW*normalized.scale,1800);assert.equal(normalized.headH*normalized.scale,2400);
 assert.equal(normalized.hX+normalized.faceCX*normalized.scale,900);assert.equal(normalized.hY+normalized.chinY*normalized.scale,1800);
 for(const key of ['hairFitEyeSize','hairFitEyeCentreX','hairFitChinAnchorY'])assert.equal(normalized[key],undefined);
 // Changing the outfit retains these absolute head bounds. An old native
 // placement would instead scale/translate the full-frame image a second time.
 const changedOutfit={...normalized,templatePath:'new-suit.png'};
 assert.deepEqual([changedOutfit.hX,changedOutfit.hY,changedOutfit.headW*changedOutfit.scale,changedOutfit.headH*changedOutfit.scale],[0,0,1800,2400]);
 assert.equal(previous.hX,321);assert.equal(previous.scale,.55);
 const native=studioSkinMasterFrame({source:base,sourceFrame:{x:21,y:4,w:700,h:1050}},{W:900,H:1200},nativeGeometry);
 assert(native);assert.equal(native.hX,21);assert.equal(native.hY,4);assert.equal(native.headW*native.scale,700);assert.equal(native.headH*native.scale,1050);
});
await test('a later AI hairstyle fits the accepted eye size and chin anchor after full-frame finish reuse',async()=>{
 const source=await image(0,180,240),geometry={width:180,height:240,chinY:180,faceCX:90,faceWidth:72};
 const lock=studioSkinMasterFrame({source},{W:1800,H:2400,hairFitEyeSize:12,hairFitEyeCentreX:17,hairFitChinAnchorY:19},geometry);
 const face=Array.from({length:478},()=>({x:.5,y:.5}));
 face[33]={x:.35,y:.35};face[263]={x:.65,y:.35};face[152]={x:.5,y:.75};face[234]={x:.3,y:.5};face[454]={x:.7,y:.5};
 const replacement=face.map(point=>({...point}));replacement[33].x=.32;replacement[263].x=.68;
 const fitted=fitHairMasterFrame(lock,{width:180,height:240,face},{width:500,height:650,face:replacement});
 assert(Math.abs(fitted.hairFitEyeSize-540)<1e-8);assert(Math.abs(fitted.hairFitEyeCentreX-900)<1e-8);assert(Math.abs(fitted.hairFitChinAnchorY-1800)<1e-8);
 assert(Math.abs(fitted.scale-3)<1e-8);assert(Math.abs(fitted.hX-150)<1e-8);assert(Math.abs(fitted.hY-337.5)<1e-8);
 assert(Math.abs(fitted.hX+250*fitted.scale-900)<1e-8);assert(Math.abs(fitted.hY+487.5*fitted.scale-1800)<1e-8);
});

console.log(JSON.stringify({passed:cases.length,cases,scope:'Shared native skin save/restore, codec/resource safety, actual App and editor local finish/history callbacks with inert cosmetics and hydration boundaries. No providers, account, payment or database calls'}));
