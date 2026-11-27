import test from 'node:test';import assert from 'node:assert/strict';
import {currentGuideOutfit,femaleOutfitGuideRequest} from '../src/portrait-guide-outfit.js';
test('guide selects visible outfit, then actual generated outfit before stale hidden placeholders',()=>{
 const old={kind:'suit',templatePath:'old',visible:false},head={generatedOutfitTemplate:'actual'};
 assert.equal(currentGuideOutfit([old],{templatePath:'placement-old'},head),'actual');
 assert.equal(currentGuideOutfit([old],{},head,'old'),'old');
 assert.equal(currentGuideOutfit([old],{},head,'missing'),'actual');
 assert.equal(currentGuideOutfit([old,{kind:'suit',templatePath:'new'}],{},head),'new');
});
test('all female outfit categories rebuild with the current hair; initial/manual/male/English paths remain untouched',()=>{
 const sourcePhoto={idpromPortraitMode:'female'},head={portraitMode:'female',jobId:'job',hairId:'seedream-05',generatedOutfitTemplate:'old'};
 for(const path of ['job-uniforms/female-job-navy-notch-white-shirt.png','government-uniforms/female-operational.png','gown-uniforms/kmitl-female.png','student-uniforms/female-01.png']){
  const args={sourcePhoto,head,option:{template:'/assets/'+path}};
  assert.deepEqual(femaleOutfitGuideRequest(args),{template:'/assets/'+path,portraitMode:'female',hairId:'seedream-05'});
  for(const change of [{englishFlow:true},{pendingSource:true},{aiSetup:true},{manualOverride:true},{head:{...head,portraitMode:'male'}},{sourcePhoto:null}])assert.equal(femaleOutfitGuideRequest({...args,...change}),null);
 }
});
