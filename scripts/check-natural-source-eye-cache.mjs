import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
import {NATURAL_STUDIO_SKIN_VERSION} from '../natural-studio-skin.js';
import {ORIGINAL_PORTRAIT_AI_VERSION,ORIGINAL_PORTRAIT_AI_PREVIOUS_VERSION,hasOriginalPortraitAiFinish} from '../original-portrait-ai.js';

const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
const priorVersion='natural-studio-skin-v1';
assert.notEqual(NATURAL_STUDIO_SKIN_VERSION,priorVersion,'Natural policy revision must invalidate the previous accepted result');
let passed=0;
async function test(name,run){await run();passed++;console.log('PASS '+name)}
function section(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,start);return source.slice(a,b)}
const appBody=section(main,'async function aiFinishPortrait(','\nasync function aiFinishPortraitUncached(');
async function portraitKey(style,version,mode='female'){
 const stop=Error('key captured');let key;
 const env={activeProcessOperation:{},assertProcessActive(){},PRODUCTION_HAIR_CATALOG:[],portraitFinishChoice,
  currentResultCacheScope:()=> 'same-account',resultSourceDigest:async()=> 'same-immutable-upload',uploadGenerationScope:()=> 'same-upload',
  HAIR_DESIGN_VERSION:'same-hair-policy',NATURAL_STUDIO_SKIN_VERSION:version,ORIGINAL_PORTRAIT_AI_VERSION,
  portraitResultCache:{get:async value=>{key=value;throw stop}},cancelledProcessError:()=>Error('cancelled')};
 const run=Function('env','with(env){'+appBody+';return aiFinishPortrait}')(env);
 await assert.rejects(run(new Blob(['original']),'original',{portraitMode:mode,femaleEyeStyle:style}),error=>error===stop);
 return key;
}
function hairKey(style,version,mode='female'){
 const env={PRODUCTION_HAIR_CATALOG:[],HAIR_DESIGN_VERSION:'same-hair-policy',NATURAL_STUDIO_SKIN_VERSION:version,ORIGINAL_PORTRAIT_AI_VERSION,portraitFinishChoice,
  firstUploadedPhotoRef:{current:{idpromPortraitMode:mode}},editCache:{current:{lock:{templatePath:'same-outfit'}}},activeUniformTemplate:'same-outfit'};
 const body=section(main,' const hairResultMode=','\n const hairResultScope=');
 return Function('env',`with(env){${body};return hairResultKey}`)(env)('original',mode,style);
}
await test('both real App cache keys invalidate old natural output while makeup, hidden soft and male keys remain unchanged',async()=>{
 for(const keyOf of [portraitKey,hairKey]){
  assert.notEqual(await keyOf('natural',priorVersion),await keyOf('natural',NATURAL_STUDIO_SKIN_VERSION));
  for(const style of ['makeup','korean-rosy-v1','soft-rosy-v1'])assert.equal(await keyOf(style,priorVersion),await keyOf(style,NATURAL_STUDIO_SKIN_VERSION),style);
  assert.equal(await keyOf('natural',priorVersion,'male'),await keyOf('natural',NATURAL_STUDIO_SKIN_VERSION,'male'));
 }
});

function head(style,version){return {id:'head',kind:'head',jobId:'saved-job',portraitMode:'female',hairId:'same-hair',hairPolicyVersion:'same-hair-policy',femaleEyeStyle:style,
 studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,...(style==='natural'?{naturalStudioSkinVersion:version}:{studioCosmeticsVersion:ORIGINAL_PORTRAIT_AI_VERSION+':'+style})}}
function selectFixture(current){
 const applied=[],restored=[];
 const env={state:{current:[current]},layerKind:l=>l.kind,portraitMode:'female',sourcePhoto:{},processHairPending:false,sourceLayerRef:{current:null},portraitFinishChoice,
  NATURAL_STUDIO_SKIN_VERSION,hasOriginalPortraitAiFinish,restoreMakeup:()=>restored.push(true),applyHair:(...args)=>applied.push(args)};
 const body=section(editor,' const selectPortraitFinish=style=>','\n const commitMakeupSource=');
 return {select:Function('env',`with(env){${body};return selectPortraitFinish}`)(env),applied,restored};
}
await test('old natural underneath a removed soft overlay enters the updated handler instead of restoring stale skin',()=>{
 for(const look of ['soft-rosy-ai-v1','soft-rosy-makeup-v1']){
  const f=selectFixture({...head('natural',priorVersion),makeupStyles:{look},makeupBaseSource:'old-natural'});
  f.select('natural');assert.equal(f.restored.length,0);assert.equal(f.applied.length,1);assert.equal(f.applied[0][1].femaleEyeStyle,'natural');
 }
});
await test('current natural restores its explicit legacy overlay without another generation; changing finish still uses original handler',()=>{
 for(const look of ['soft-rosy-ai-v1','soft-rosy-makeup-v1']){
  const f=selectFixture({...head('natural',NATURAL_STUDIO_SKIN_VERSION),makeupStyles:{look},makeupBaseSource:'current-natural'});
  f.select('natural');assert.equal(f.restored.length,1);assert.equal(f.applied.length,0);
  f.select('korean-rosy-v1');assert.equal(f.applied.length,1);assert.equal(f.applied[0][1].femaleEyeStyle,'korean-rosy-v1');
 }
});

// Execute the real early-return block, stopping before any rendering or service call.
const prelude=section(editor,' const applyHair=async','  flushTransforms();const previous=historySnapshot();');
async function sameChoice(current,style){
 const chosen=[],needsGeneration=[];
 const env={processRequestRef:{current:false},processActive:false,assetBusy:false,ready:true,state:{current:[current]},layerKind:l=>l.kind,onChangeHair:()=>{},
  portraitMode:'female',hairGender:'female',sourcePhoto:{},portraitFinishChoice,NATURAL_STUDIO_SKIN_VERSION,hasOriginalPortraitAiFinish,HAIR_DESIGN_VERSION:'same-hair-policy',
  isFreeFemaleHair:()=>false,setSelected:v=>chosen.push(v),setSelectedHair(){},setTool(){}};
 const run=Function('env','needsGeneration',`with(env){${prelude} needsGeneration.push(finish); };return applyHair}`)(env,needsGeneration);
 await run('same-hair',{femaleEyeStyle:style});return {chosen,needsGeneration};
}
await test('same-hair/same-natural selection refreshes old revisions once but reuses current metadata',async()=>{
 for(const version of [undefined,priorVersion]){const f=await sameChoice(head('natural',version),'natural');assert.equal(f.needsGeneration.length,1);assert.equal(f.chosen.length,0)}
 const f=await sameChoice(head('natural',NATURAL_STUDIO_SKIN_VERSION),'natural');assert.deepEqual(f.needsGeneration,[]);assert.deepEqual(f.chosen,['head']);
});
await test('same-hair makeup and hidden soft accepted-result selections retain their existing fast path',async()=>{
 for(const style of ['makeup','korean-rosy-v1','soft-rosy-v1']){const f=await sameChoice(head(style,priorVersion),style);assert.deepEqual(f.needsGeneration,[]);assert.deepEqual(f.chosen,['head'])}
});
await test('previous original-AI v1 results cannot satisfy current v2 source-eye or makeup selections',async()=>{
 for(const style of ['natural','makeup','korean-rosy-v1','soft-rosy-v1']){const current={...head(style,NATURAL_STUDIO_SKIN_VERSION),studioSkinVersion:ORIGINAL_PORTRAIT_AI_PREVIOUS_VERSION,...(style==='natural'?{}:{studioCosmeticsVersion:ORIGINAL_PORTRAIT_AI_PREVIOUS_VERSION+':'+style})};const f=await sameChoice(current,style);assert.deepEqual(f.needsGeneration,[style]);assert.deepEqual(f.chosen,[])}
});
console.log(JSON.stringify({passed,scope:'Actual App keys and Studio stale/current choice guards. No image generation, services, accounts or payments.'}));
