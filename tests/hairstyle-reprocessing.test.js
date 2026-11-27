import {readFileSync} from 'node:fs';
import {createPortraitOperation} from '../src/portrait-operation.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
const code=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const extract=(start,end,name,env)=>{const a=code.indexOf(start),b=code.indexOf(end,a);assert(a>=0&&b>a);return Function('env','with(env){'+code.slice(a,b)+';return '+name+'}')(env)};

test('English hairstyle callback passes the untouched first upload, selected outfit and previous job to first-processing pipeline',async()=>{
 for(const gender of ['female','male']){
  const original=new File(['original pixels'],'source.png',{type:'image/png'}),calls=[];
  const env={hairId:'',studioPhotoTransactionRef:{current:false},busy:false,hairBusy:false,hairResultMode:()=>gender,portraitFinishChoice,firstUploadedPhotoRef:{current:original},editCache:{current:{lock:{templatePath:'/old-outfit.png'}}},englishPreviewEnabled:()=>true,currentOutputJobRef:{current:'accepted-job'},processStudioPhoto:async(...args)=>{calls.push(args);return 'pending-result'}};
  const change=extract(' const changeStudioHair=async',' const LegacyPaidWarningUI=','changeStudioHair',env);
  assert.equal(await change('new-hair',gender,'makeup','/selected-outfit.png'),'pending-result');
  assert.equal(calls.length,1);assert.equal(calls[0][0],original);assert.equal(calls[0][1],'/selected-outfit.png');assert.equal(calls[0][2],'new-hair');assert.equal(calls[0][4],gender==='female'?'makeup':'natural');
  assert.deepEqual(calls[0][5],{creditKind:'hairstyle',sourceJobId:'accepted-job',freeOppositeFinish:false});assert.equal(await original.text(),'original pixels');
 }
});

function thaiFixture({cached=false,failed=false}={}){
 const original=Object.assign(new File(['original pixels'],'source.png',{type:'image/png'}),{idpromFemaleEyeStyle:'natural'}),master=Object.assign(new Blob(['new generated pixels']),{idpromJobId:'new-job'}),calls=[],entries=[],settlements=[];
 const env={hairId:'',createPortraitOperation,portraitOperationScope:()=> 'same-account-work',walletHeaders:()=>({'X-Wallet-Id':'owner-A'}),cancellationStillUnwinding:()=>false,pendingCancelMessage:()=>'',hairRequestRef:{current:false},hairBusy:false,busy:false,editCache:{current:{master:new Blob(['accepted pixels']),lock:{templatePath:'/selected-outfit.png'}}},firstUploadedPhotoRef:{current:original},hairResultScope:()=> 'same-account-work',hairResultMode:()=> 'female',portraitFinishChoice,cachedHairResult:()=>cached?{master,jobId:'cached-job'}:null,activeProcessOperation:{cancelled:false},liveAdjustRef:{current:{}},liveCollarWarpRef:{current:0},liveCollarHeightRef:{current:0},liveNeckAdjustRef:{current:{}},
  setHairGenerating:value=>{env.generating=value},setHairBusy:value=>{env.hairBusy=value},beginProgress:()=>{env.begun=true},setMsg(){},setProgressStage(){},
  aiFinishPortrait:async(...args)=>{calls.push(args);if(failed)throw Object.assign(Error('provider failure'),{status:503});return master},finishFirstPortraitMaster:async value=>value,assertProcessActive:()=>{},fitChangedHairMaster:async()=>({templatePath:'/selected-outfit.png'}),sharedStudioSkinSource:()=>null,
  verifyOutputRights:async()=>({checked:true,unlocked:true,fullEdit:true}),finishProgress:async success=>settlements.push(success),beginOptionRender(){},currentOutputJobRef:{current:'accepted-job'},currentOutputTrialRef:{current:false},studioTrialRef:{current:false},setOutputJobId(){},setTrialPreview(){},setHairId(){},rememberHairResult:(...args)=>{const entry={args};entries.push(entry);return entry},PROCESS_FAILURE_MESSAGE:'failed'
 };
 const run=extract(' const changeHairForStudio=async',' const downloadHairDonor=','changeHairForStudio',env);
 return {env,original,master,calls,entries,settlements,run:()=>run('seedream-41','female',{studioOnly:true,femaleEyeStyle:'makeup',sourceJobId:'accepted-job'})};
}
test('Thai uncached hairstyle runs first-processing once from original; replacement remains pending until the editor commits it',async()=>{
 const f=thaiFixture(),result=await f.run();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],f.original);assert.equal(f.calls[0][1],'seedream-41');assert.equal(f.calls[0][2].sourceJobId,'accepted-job');assert.equal(f.calls[0][2].creditKind,'hairstyle');assert.equal(f.calls[0][2].femaleEyeStyle,'makeup');
 assert.equal(f.env.currentOutputJobRef.current,'accepted-job');assert.equal(f.entries.length,0);assert.deepEqual(f.settlements,[]);assert.equal(f.original.idpromFemaleEyeStyle,'natural');
 result.commit();assert.equal(f.env.currentOutputJobRef.current,'new-job');assert.equal(f.entries.length,1);assert.equal(f.entries[0].confirmed,true);assert.equal(f.original.idpromFemaleEyeStyle,'makeup');assert.equal(await f.original.text(),'original pixels');assert(!f.env.hairBusy&&!f.env.generating&&!f.env.hairRequestRef.current);
});
test('Thai cached hairstyle reuses accepted result without submitting or reserving another generation',async()=>{
 const f=thaiFixture({cached:true}),result=await f.run();assert.equal(result.reused,true);assert.equal(f.calls.length,0);assert.equal(f.env.begun,undefined);assert.deepEqual(f.settlements,[]);assert.equal(f.env.currentOutputJobRef.current,'accepted-job');result.commit();assert.equal(f.env.currentOutputJobRef.current,'cached-job');
});
test('failed hairstyle keeps previous output and original finish, clears busy flags and preserves the precise failure stage',async()=>{
 const f=thaiFixture({failed:true});await assert.rejects(f.run(),e=>e.status===503&&e.idpromProcessStage==='generation');assert.equal(f.env.currentOutputJobRef.current,'accepted-job');assert.equal(f.original.idpromFemaleEyeStyle,'natural');assert.equal(f.entries.length,0);assert.deepEqual(f.settlements,[false]);assert(!f.env.hairBusy&&!f.env.generating&&!f.env.hairRequestRef.current);
});
test('a late hairstyle cannot commit after a different source photo is selected',async()=>{
 const f=thaiFixture(),result=await f.run();f.env.firstUploadedPhotoRef.current=new File(['another person'],'source.png',{type:'image/png'});assert.throws(()=>result.commit(),/บัญชี รูปต้นฉบับ หรืองานเปลี่ยน/);assert.equal(f.env.currentOutputJobRef.current,'accepted-job');assert.equal(f.entries.length,0);
});

test('full portrait A to B to A restores the accepted pixels and job without AI, including after trial rights end',async()=>{
 const {createStudioPortraitHairHistory}=await import('../src/studio-portrait-hair-history.js');
 const original=new File(['unchanged upload'],'original.png',{type:'image/png'});
 const history=createStudioPortraitHairHistory(),scope='same-wallet',template='/assets/government-uniforms/female-operational.png';
 const version='current-pipeline',lock={templatePath:template},a=new Blob(['complete shoulders A']),b=new Blob(['complete shoulders B']);
 const cachedFullPortraitResult=(hair,mode,finish,selectedTemplate)=>history.find({source:original,scope,template:selectedTemplate,mode,hair,finish,version:JSON.stringify([version,'collar-v6','complete-garment-rear-hair-v2'])});
 history.remember({source:original,scope,template,mode:'female',hair:'seedream-14',finish:'makeup',version:JSON.stringify([version,'collar-v6','complete-garment-rear-hair-v2']),master:a,lock,jobId:'job-A'});
 let requests=0,rendered=null,unwinding=false;
 const env={englishPreviewEnabled:()=>false,isThaiOutfitPath:()=>true,createPortraitOperation,portraitOperationScope:()=>scope,walletHeaders:()=>({}),cancellationStillUnwinding:()=>unwinding,busy:false,hairBusy:false,studioPhotoTransactionRef:{current:false},setBusy(){},beginProgress(){},activeProcessOperation:{},portraitFinishChoice,firstUploadedPhotoRef:{current:original},cachedFullPortraitResult,verifyOutputRights:async()=>({checked:true,unlocked:false,fullEdit:false}),
 aiFinishPortrait:async file=>{assert.equal(file,original);requests++;return Object.assign(b,{idpromJobId:'job-B',idpromTrial:true})},finishFirstPortraitMaster:async value=>value,composePortrait:async()=>({lock}),renderAdjustedFinal:async(master,...args)=>{rendered=master;args.at(-1).push({name:'หัว · คอ · ผม',source:'data:image/png;base64,eA=='})},backgroundRef:{current:''},assertProcessActive(){},HAIR_DESIGN_VERSION:'current',femaleFinishMetadata:()=>({}),femaleHairContractMetadata:extract('function femaleHairContractMetadata','function femaleFinishHeadMetadata','femaleHairContractMetadata',{}),
 setF(){},initialFemaleMakeupRef:{current:null},femaleFinishAnchor:()=>null,editCache:{current:{master:a,lock}},initialProcessedMasterRef:{current:a},currentOutputJobRef:{current:'job-A'},currentOutputTrialRef:{current:true},studioTrialRef:{current:true},setOutputJobId(){},setTrialPreview(){},setLiveCanvasVisible(){},liveAdjustRef:{current:{}},setHeadAdjust(){},liveCollarWarpRef:{current:0},setCollarWarp(){},liveCollarHeightRef:{current:0},setCollarHeight(){},liveNeckAdjustRef:{current:{}},setNeckAdjust(){},setPlacementLocked(){},lockedPlacementRef:{current:null},lockedMasterRef:{current:null},preparedHairBaseRef:{current:null},lastHairDonorRef:{current:null},cleanHairBaseRef:{current:null},initialStyledHairRef:{current:null},studioHairOriginRef:{current:''},setHairId(){},rememberHairResult:()=>({}),fullPortraitHairHistoryRef:{current:history},hairResultScope:()=>scope,hairResultKey:()=>version,THAI_COLLARLESS_VERSION:'collar-v6',window:{dispatchEvent(){}},CustomEvent:class{},setProgressStage(){},analyticsProcessFailure(){},SINGLE_PASS_PORTRAIT_VERSION:'single'};
 const process=extract(' const processStudioPhoto=async',' const applyStudioMakeup=','processStudioPhoto',env);
 const next=await process(original,template,'seedream-41','female','makeup',{creditKind:'hairstyle'});
 assert.equal(requests,1);assert.equal(rendered,b);assert.equal(env.currentOutputJobRef.current,'job-A','Pending results do not replace accepted state');next.commit();
 assert.equal(env.currentOutputJobRef.current,'job-B');
 unwinding=true;
 const back=await process(original,template,'seedream-14','female','makeup',{creditKind:'hairstyle',restoreOnly:true});
 assert.equal(back.reused,true);assert.equal(requests,1);assert.equal(rendered,a,'Restore complete original garment pixels');back.commit();
 assert.equal(env.currentOutputJobRef.current,'job-A');
 const again=await process(original,template,'seedream-41','female','makeup',{creditKind:'hairstyle',restoreOnly:true});
 assert.equal(again.reused,true);assert.equal(requests,1);assert.equal(rendered,b);again.commit();
 assert.equal(env.currentOutputJobRef.current,'job-B');assert.equal(await original.text(),'unchanged upload');
 await assert.rejects(process(original,template,'never-created','female','makeup',{creditKind:'hairstyle',restoreOnly:true}),/ยังไม่มีภาพทรงนี้/);assert.equal(requests,1,'Cache-only misses must never generate');
});


test('Thai finished-photo hair click restores immediately instead of creating a pending AI draft',()=>{
 const editor=readFileSync(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 const start=editor.indexOf(' const chooseHair=id=>{'),end=editor.indexOf('// Select the finish',start);
 const calls=[],env={thaiOutfitAiDraft:null,hairGender:'female',englishFlow:false,processRequestRef:{current:false},processActive:false,assetBusy:false,ready:true,processHairPending:false,state:{current:[{id:'head',kind:'head'}]},sourceLayerRef:{current:'upload'},layerKind:l=>l.kind,canRestoreHair:()=>true,easyFaceFinish:'makeup',setThaiPendingHair:v=>calls.push(['pending',v]),setThaiChoiceFlow(){},setThaiHairFinishChoice(){},applyHair:(...args)=>calls.push(['restore',...args])};
 const choose=Function('env','with(env){'+editor.slice(start,end)+';return chooseHair}')(env);
 choose('seedream-14');
 assert.deepEqual(calls,[['pending',null],['restore','seedream-14',{restoreOnly:true}]]);
});

test('restored old hair contracts remain viewable but cannot be reused as the newly corrected hairstyle',()=>{
 const source=new File(['original'],'source.png'),template='/assets/government-uniforms/female-operational.png',current='thai-female-exact-three-ref-flash-v8-hair-replacement';
 let remembered=0,saved={jobId:'old',master:Object.assign(new Blob(['old long hair']),{idpromMakeupPolicyVersion:'thai-female-exact-three-ref-flash-v7-luminous-skin'})};
 const env={firstUploadedPhotoRef:{current:source},editCache:{current:{master:saved.master,lock:{templatePath:template}}},isFreeFemaleHair:()=>false,hairResultMode:()=> 'female',englishPreviewEnabled:()=>false,isThaiOutfitPath:()=>true,FEMALE_EXACT_PROMPT_VERSION:current,portraitReferenceRevision:()=> 'current-files',rememberHairResult:()=>{remembered++;},portraitFinishChoice,fullPortraitHairHistoryRef:{current:{find:()=>saved}},hairResultScope:()=> 'owner',hairResultKey:()=> 'key',THAI_COLLARLESS_VERSION:'collar',activeUniformTemplate:template};
 const restore=extract(' const rememberRestoredHairResult=',' const restoreHairResultRights=','rememberRestoredHairResult',env);
 restore({hairId:'seedream-05',portraitMode:'female',jobId:'old'});assert.equal(remembered,0);
 const lookup=extract(' const cachedFullPortraitResult=',' const canReuseHair=','cachedFullPortraitResult',env);
 assert.equal(lookup('seedream-05','female','makeup',template),null);
 saved.master.idpromMakeupPolicyVersion=current;assert.equal(lookup('seedream-05','female','makeup',template),null);
 saved.master.idpromReferenceRevision='older-files';assert.equal(lookup('seedream-05','female','makeup',template),null);
 saved.master.idpromReferenceRevision='current-files';assert.equal(lookup('seedream-05','female','makeup',template),saved);
 saved.master.idpromMakeupPolicyVersion='older';env.englishPreviewEnabled=()=>true;assert.equal(lookup('seedream-05','female','makeup',template),saved);
});


test('choosing cached hair inside a new outfit draft keeps that outfit draft ready for explicit creation',()=>{
 const editor=readFileSync(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 const start=editor.indexOf(' const chooseHair=id=>{'),end=editor.indexOf('// Select the finish',start),calls=[];
 const env={thaiOutfitAiDraft:{outfit:{template:'new-outfit'}},hairGender:'female',englishFlow:false,processRequestRef:{current:false},processActive:false,assetBusy:false,ready:true,processHairPending:false,state:{current:[{id:'head',kind:'head'}]},sourceLayerRef:{current:'upload'},layerKind:l=>l.kind,canRestoreHair:()=>true,easyFaceFinish:'makeup',isPremiumHair:()=>false,isFreeFemaleHair:()=>false,paidHairAccess:true,setSelectedHair(){},setAppearanceError(){},setPortraitProcessError(){},setThaiPendingHair:v=>calls.push(['pending',v]),setThaiChoiceFlow:v=>calls.push(['flow',v]),setThaiHairFinishChoice(){},setStatus(){},applyHair:()=>{throw Error('Must not restore the previous outfit');}};
 const choose=Function('env','with(env){'+editor.slice(start,end)+';return chooseHair}')(env);choose('seedream-05');
 assert.deepEqual(calls,[['pending',{hairId:'seedream-05',portraitMode:'female',first:false}],['flow',{origin:'hair',step:'ready'}]]);
});
