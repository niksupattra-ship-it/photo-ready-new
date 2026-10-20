import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const readProject=path=>readFile(new URL(path,root),'utf8');
const main=await readProject('src/main.jsx');
const part=main.slice(main.indexOf(' const changeHairForStudio=async'),main.indexOf(' const downloadHairDonor='));
const file={name:'original-upload.png'},cache=new Map(),requests=[];
const env={hairBusy:false,busy:false,hairRequestRef:{current:false},firstUploadedPhotoRef:{current:file},editCache:{current:{master:{id:'initial'},lock:{id:'anchor'}}},activeProcessOperation:null,liveAdjustRef:{current:{scale:1,x:0,y:0}},liveCollarWarpRef:{current:0},liveCollarHeightRef:{current:0},liveNeckAdjustRef:{current:{width:0,length:0}},currentOutputJobRef:{current:'job-initial'},currentOutputTrialRef:{current:false},studioTrialRef:{current:false},activeUniformTemplate:'uniform',setHairGenerating(){},setHairBusy(){},setMsg(){},setProgressStage(){},setOutputJobId(){},setTrialPreview(){},setHairId(){},beginOptionRender(){},cachedHairResult:id=>cache.get(id)||null,beginProgress(){env.activeProcessOperation={cancelled:false,settled:false,jobId:null}},assertProcessActive(op=env.activeProcessOperation){if(op?.cancelled)throw Error('cancelled')},async aiFinishPortrait(source,id){requests.push({source,id});const blob={id,idpromJobId:'job-'+requests.length,idpromTrial:false};env.activeProcessOperation.jobId=blob.idpromJobId;env.currentOutputJobRef.current='unrelated-stale-event';return blob},finishFirstPortraitMaster:async b=>b,fitChangedHairMaster:async(master,current)=>({...current.lock,for:master.id}),verifyOutputRights:async()=>({unlocked:true}),rememberHairResult(id,master){const e={master,jobId:env.currentOutputJobRef.current,sourcePhoto:env.firstUploadedPhotoRef.current,confirmed:false};cache.set(id,e);return e},finishProgress:async()=>{}};
const change=new Function('env','with(env){'+part+';return changeHairForStudio;}')(env);
for(const id of ['seedream-07','seedream-20','seedream-12','seedream-07','seedream-13','seedream-20','seedream-24','seedream-12']){
 const before=env.editCache.current,wasCached=cache.has(id),count=requests.length;
 const result=await change(id,'female',{studioOnly:true});
 assert.equal(env.editCache.current,before);assert.equal(requests.length,count+(wasCached?0:1));assert.equal(result.hairId,id);assert.equal(result.master.id,id);
 assert.equal(result.jobId,wasCached?cache.get(id).jobId:'job-'+requests.length);
 result.commit();assert.equal(env.editCache.current.master.id,id);assert.equal(cache.get(id).confirmed,true);assert.equal(cache.get(id).jobId,result.jobId);
}
assert(requests.every(r=>r.source===file));
const stable=env.editCache.current,failed=await change('seedream-01','female',{studioOnly:true});env.activeProcessOperation.cancelled=true;
assert.throws(()=>failed.commit(),/cancelled/);assert.equal(env.editCache.current,stable);assert(!cache.has('seedream-01'));
const stale=await change('seedream-22','female',{studioOnly:true});env.firstUploadedPhotoRef.current={name:'new-upload'};assert.throws(()=>stale.commit());assert.equal(env.editCache.current,stable);env.firstUploadedPhotoRef.current=file;
const cat=await import('data:text/javascript;base64,'+Buffer.from(await readProject('hairstyle-catalog.js')).toString('base64'));
for(const h of cat.PRODUCTION_HAIR_CATALOG){const prompt=cat.selectedHairInstruction(h);assert(prompt.includes('ONLY hairstyle design authority'));assert(prompt.includes('never a continuation'));if(h.gender==='female')assert.notEqual(cat.selectedHairDesign(h).description,'the exact parting, fringe, texture, silhouette and cut length in Image 2');}
assert.equal(new Set(cat.PRODUCTION_HAIR_CATALOG.map(h=>h.id)).size,cat.PRODUCTION_HAIR_CATALOG.length);
console.log('PASS: eight sequential long/short/updo switches and cache reuse; original upload each generation; selected result/job IDs; commit only on success; cancelled/stale rejection; 27 female designs described.');
const editor=await readProject('src/studio-editor.jsx');
const applyText=editor.slice(editor.indexOf(' const applyHair=async'),editor.indexOf(' const commitMakeupSource='));
const {replaceHairstyleLayer}=await import('data:text/javascript;base64,'+Buffer.from(await readProject('src/replace-hairstyle-layer.js')).toString('base64'));
for(const mode of ['success','confirm-fails','wrong-style']){
 const events=[],original=[{id:'head',kind:'head',name:'หัว · คอ · ผม',hairId:'seedream-07',source:'old',visible:true},{id:'tail',hairHeadId:'head',source:'old-long'},{id:'suit',kind:'suit',source:'outfit'}];
 const e={placementRef:{current:null},onFitUniform:async(layer,suit)=>{assert.equal(suit.source,'outfit');return {layer:{...layer,sourceFrame:{x:22,y:33,w:444,h:555}},placement:{fitVersion:'test'},commit:()=>events.push('fit-commit')}},processRequestRef:{current:false},processActive:false,assetBusy:false,ready:true,state:{current:original},hairGender:'female',portraitMode:'female',HAIR_DESIGN_VERSION:cat.HAIR_DESIGN_VERSION,layerKind:l=>l.kind,appearanceFailure:()=>events.push('error'),flushTransforms(){},historySnapshot:()=>original,canRestoreHair:()=>false,headPose:()=>({x:0,y:0,scale:1,rotation:0}),replaceHairstyleLayer,isProcessCancelled:()=>false,hydrate:async layers=>{e.state.current=layers;return true},onChangeHair:async()=>({layer:{source:'new-short',hairId:mode==='wrong-style'?'seedream-24':'seedream-12'},reused:false,commit:()=>events.push('commit'),rollback:()=>events.push('rollback')}),onFinishProcess:async success=>{events.push(success?'confirm':'cancel');if(success&&mode==='confirm-fails')throw Error('network')},undo:{current:[]},redo:{current:[]},touch:false,mounted:{current:true},sourcePhoto:null};
 for(const n of ['setAppearanceError','setAssetBusy','setStatus','resetBrushSession','setSelected','setSelectedHair','setHairConfirmed','setHairNotice','setRevision','setTool','setComparing','trackHairSelection'])e[n]=()=>{};
 const apply=new Function('env','with(env){'+applyText+';return applyHair;}')(e);await apply('seedream-12');
 if(mode==='success'){assert.deepEqual(events,['confirm','commit','fit-commit']);assert.equal(e.state.current.find(l=>l.id==='head').source,'new-short');assert(!e.state.current.some(l=>l.id==='tail'));assert.equal(e.undo.current[0],original);assert.equal(e.state.current.find(l=>l.id==='head').sourceFrame.x,22);assert.equal(e.placementRef.current.fitVersion,'test')}else{assert(events.includes('rollback'));assert(!events.includes('commit'));assert.equal(e.state.current,original)}
}
console.log('PASS: actual Studio apply handler confirms before commit, removes linked old hair, preserves Undo; wrong-style and failed-confirmation paths restore previous layers and roll back.');
