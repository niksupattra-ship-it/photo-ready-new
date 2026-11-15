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
  const env={studioPhotoTransactionRef:{current:false},busy:false,hairBusy:false,hairResultMode:()=>gender,portraitFinishChoice,firstUploadedPhotoRef:{current:original},editCache:{current:{lock:{templatePath:'/old-outfit.png'}}},englishPreviewEnabled:()=>true,currentOutputJobRef:{current:'accepted-job'},processStudioPhoto:async(...args)=>{calls.push(args);return 'pending-result'}};
  const change=extract(' const changeStudioHair=async',' const LegacyPaidWarningUI=','changeStudioHair',env);
  assert.equal(await change('new-hair',gender,'makeup','/selected-outfit.png'),'pending-result');
  assert.equal(calls.length,1);assert.equal(calls[0][0],original);assert.equal(calls[0][1],'/selected-outfit.png');assert.equal(calls[0][2],'new-hair');assert.equal(calls[0][4],gender==='female'?'makeup':'natural');
  assert.deepEqual(calls[0][5],{creditKind:'hairstyle',sourceJobId:'accepted-job'});assert.equal(await original.text(),'original pixels');
 }
});

function thaiFixture({cached=false,failed=false}={}){
 const original=Object.assign(new File(['original pixels'],'source.png',{type:'image/png'}),{idpromFemaleEyeStyle:'natural'}),master=Object.assign(new Blob(['new generated pixels']),{idpromJobId:'new-job'}),calls=[],entries=[],settlements=[];
 const env={createPortraitOperation,portraitOperationScope:()=> 'same-account-work',walletHeaders:()=>({'X-Wallet-Id':'owner-A'}),cancellationStillUnwinding:()=>false,pendingCancelMessage:()=>'',hairRequestRef:{current:false},hairBusy:false,busy:false,editCache:{current:{master:new Blob(['accepted pixels']),lock:{templatePath:'/selected-outfit.png'}}},firstUploadedPhotoRef:{current:original},hairResultScope:()=> 'same-account-work',hairResultMode:()=> 'female',portraitFinishChoice,cachedHairResult:()=>cached?{master,jobId:'cached-job'}:null,activeProcessOperation:{cancelled:false},liveAdjustRef:{current:{}},liveCollarWarpRef:{current:0},liveCollarHeightRef:{current:0},liveNeckAdjustRef:{current:{}},
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
