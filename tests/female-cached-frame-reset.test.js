import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('cached full female photo reuses accepted AI pixels but never restores a previous enlarged composition lock',async()=>{
 const text=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8'),start=text.indexOf(' const processStudioPhoto=async'),end=text.indexOf(' const applyStudioMakeup=',start);
 const file={idpromPortraitMode:'female',idpromFemaleEyeStyle:'makeup'},master={idpromPortraitComposition:'en-outfit-body-v1'},oldLock={W:900,H:1200,hX:-300,hY:-180,scale:1.8};
 const neutral={W:900,H:1200,hX:0,hY:0,scale:1};let composed=0;
 const env={englishPreviewEnabled:()=>false,isThaiOutfitPath:()=>true,firstUploadedPhotoRef:{current:file},portraitFinishChoice:(...v)=>v.find(Boolean),cachedFullPortraitResult:()=>({master,lock:oldLock,jobId:'accepted'}),cancellationStillUnwinding:()=>false,busy:false,hairBusy:false,studioPhotoTransactionRef:{current:false},activeProcessOperation:null,createPortraitOperation:()=>({}),portraitOperationScope:()=>'',walletHeaders:()=>({}),verifyOutputRights:async()=>({checked:true,unlocked:true}),FEMALE_SINGLE_FINISH_VERSION:'single',ENGLISH_BODY_PORTRAIT_VERSION:'en-outfit-body-v1',composePortrait:async(m)=>{assert.equal(m,master);composed++;return {lock:neutral}},backgroundRef:{current:null},renderAdjustedFinal:async(m,lock,...rest)=>{assert.equal(m,master);rest.at(-1).push({name:'หัว · คอ · ผม',source:'accepted-pixels',sourceFrame:{x:lock.hX,y:lock.hY,w:900*lock.scale,h:1200*lock.scale}})},assertProcessActive(){},femaleFinishMetadata:()=>({}),femaleHairContractMetadata:()=>({}),HAIR_DESIGN_VERSION:'current',setBusy(){}};
 const process=Function('env','with(env){'+text.slice(start,end)+';return processStudioPhoto}')(env);
 const result=await process(file,'same-outfit','seedream-06','female','makeup',{creditKind:'hairstyle'});
 assert.equal(result.reused,true);assert.equal(composed,1);assert.equal(result.layer.source,'accepted-pixels');assert.deepEqual(result.layer.sourceFrame,{x:0,y:0,w:900,h:1200});assert.equal(oldLock.scale,1.8);
});
