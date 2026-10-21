import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),read=path=>readFile(new URL(path,root),'utf8');
const editor=await read('src/studio-editor.jsx');
const body=editor.slice(editor.indexOf(' const applyHair=async'),editor.indexOf(' const commitMakeupSource='));
const makeApply=new Function('env','with(env){'+body+';return applyHair}');
for(const mode of ['accept','decline','check-error','cached','unmounted']){
 const events=[],old={id:'head',kind:'head',name:'หัว · คอ · ผม',jobId:'paid_old',source:'original',hairId:'seedream-07',visible:true};
 const original=[old,{id:'suit',kind:'suit',source:'uniform'}];
 const e={processRequestRef:{current:false},processActive:false,assetBusy:false,ready:true,state:{current:original},layerKind:l=>l.kind,HAIR_DESIGN_VERSION:'test',portraitMode:'female',hairGender:'female',appearanceFailure:(kind,msg)=>events.push('error'),flushTransforms(){},historySnapshot:()=>original,canRestoreHair:()=>mode==='cached',mounted:{current:true},sourcePhoto:null,headPose:l=>({x:0,y:0,scale:1,rotation:0}),replaceHairstyleLayer:(layers,id,layer)=>layers.map(l=>l.id===id?layer:l),isProcessCancelled:()=>false,undo:{current:[]},redo:{current:[]},touch:false};
 e.onBeforeProcess=async()=>{events.push('confirm-trial');assert.equal(e.processRequestRef.current,true);if(mode==='check-error')throw Error('offline');if(mode==='unmounted')e.mounted.current=false;return mode!=='decline'};
 e.onChangeHair=async id=>{events.push('generate');if(mode!=='cached')assert(events.includes('confirm-trial'));return {reused:mode==='cached',layer:{source:'new',hairId:id,restrictedTrial:true,outputUnlocked:false,jobId:'trial_new'},commit:()=>events.push('commit')}};
 e.hydrate=async layers=>{e.state.current=layers;return true};e.onFinishProcess=async ok=>events.push(ok?'settled':'cancelled');
 for(const key of ['setAppearanceError','setAssetBusy','setStatus','resetBrushSession','setSelected','setSelectedHair','setHairConfirmed','setHairNotice','setRevision','setTool','setComparing','trackHairSelection'])e[key]=()=>{};
 await makeApply(e)('seedream-12');assert.equal(e.processRequestRef.current,false);
 if(['decline','check-error','unmounted'].includes(mode)){assert.equal(e.state.current,original);assert(!events.includes('generate'));assert(!events.includes('settled'));}
 if(mode==='accept'){assert.deepEqual(events,['confirm-trial','generate','settled','commit']);assert.equal(e.state.current[0].restrictedTrial,true);assert.equal(e.undo.current[0],original)}
 if(mode==='cached'){assert(!events.includes('confirm-trial'));assert(!events.includes('settled'));assert(events.includes('commit'))}
}
const main=await read('src/main.jsx');
assert(main.includes('ผลใหม่จะมีลายน้ำและแทนรูปที่กำลังแก้ไข'));
const a=main.indexOf(' const beforeProcess=async'),b=main.indexOf(' const TrialChoiceUI=',a),beforeText=main.slice(a,b);
for(const credits of [1,0]){
 const e={privateTrialActive:false,trialChoiceResolve:{current:null},refreshWallet:async()=>{},fetch:async()=>({ok:true,json:async()=>({processRemaining:credits,trialRemaining:2,hasPurchased:true})}),walletHeaders:()=>({}),setRights:()=>{},normalizedRights:d=>d,acceptedPaidTrial:false,setTrialChoice:()=>{e.prompted=true;queueMicrotask(()=>{e.acceptedPaidTrial=true;e.trialChoiceResolve.current(true)})}};
 const before=new Function('env','with(env){'+beforeText+';return beforeProcess}')(e);
 assert.equal(await before(),true);assert.equal(!!e.prompted,credits===0);assert.equal(e.acceptedPaidTrial,credits===0);
}
console.log('PASS: confirm daily trial before generating a new hairstyle; decline/error leaves paid work untouched; cached styles skip confirmation and settlement; accepted trial keeps watermark flag and Undo; credits skip trial dialog.');
