import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldRecoverHairSubmission} from '../src/female-hair-submission.js';
test('only identical current requests resume; changed or retired requests never resume',()=>{
 for(const status of ['queued','processing','completed'])assert(shouldRecoverHairSubmission('current','current',status));
 for(const status of ['queued','processing','completed','failed','cancelled'])assert(!shouldRecoverHairSubmission('retired','current',status));
 for(const status of ['failed','cancelled'])assert(!shouldRecoverHairSubmission('current','current',status));
});

import {readFileSync} from 'node:fs';
test('Thai female Easy and Studio select the same draft and confirm a fresh original-upload request',()=>{
 const source=readFileSync(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 const choose=source.slice(source.indexOf(' const chooseHair='),source.indexOf(' const createThaiHairWithFinish='));
 const confirm=source.slice(source.indexOf(' const confirmThaiHair='),source.indexOf(' const cancelThaiHair='));
 for(const easyMode of [true,false]){
  const calls=[],upload={idpromPortraitMode:'female'},head={id:'old-head',kind:'head',hairId:'seedream-80',portraitMode:'female',femaleEyeStyle:'makeup',portraitComposition:'en-outfit-body-v1'};
  const env={easyMode,englishFlow:false,englishInlineAi:null,thaiOutfitAiDraft:null,hairGender:'female',processRequestRef:{current:false},processActive:false,assetBusy:false,ready:true,processHairPending:false,state:{current:[head]},sourceLayerRef:{current:null},sourcePhoto:upload,currentSuit:'/assets/government-uniforms/female-senior.png',thaiPendingHair:null,thaiChoiceFlow:null,pendingHairProcessRef:{current:null},canRestoreHair:()=>false,isPremiumHair:()=>false,isFreeFemaleHair:()=>false,premiumHairAllowed:true,paidHairAccess:true,trialHairRemaining:2,isTrialHairAllowed:()=>true,firstGenerationHairFor:()=> 'seedream-80',layerKind:l=>l.kind,portraitFinishChoice:(...v)=>v.find(Boolean),processPhoto:opts=>calls.push(opts),applyFreeHair:()=>{throw Error('overlay')},applyHair:()=>{throw Error('legacy path')},setThaiPendingHair:v=>{env.thaiPendingHair=v},setThaiChoiceFlow:v=>{env.thaiChoiceFlow=v},setThaiHairFinishChoice(){},setSelectedHair(){},setAppearanceError(){},setPortraitProcessError(){},setStatus(){}};
  const actions=Function('env','with(env){'+choose+confirm+';return {chooseHair,confirmThaiHair}}')(env);
  for(const id of ['seedream-79','seedream-80','seedream-79']){
   actions.chooseHair(id);assert.equal(env.thaiPendingHair.hairId,id);assert.equal(env.thaiChoiceFlow.step,'ready');
   const before=calls.length;actions.confirmThaiHair();assert.equal(calls.length,before+1);
   assert.deepEqual(calls.at(-1),{hairId:id,portraitMode:'female',continueWithoutSave:true});
   assert.equal(env.sourcePhoto,upload);
   head.hairId=id;
  }
  assert.equal(calls.length,3);
 }
});
