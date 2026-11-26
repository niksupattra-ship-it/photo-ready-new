import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {THAI_FREE_FEMALE_SUIT_PATHS,THAI_FREE_MALE_SUIT_PATHS,isThaiPremiumJobSuit} from '../thai-female-suit-policy.js';

const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
const line=prefix=>{const found=editor.split('\n').find(value=>value.trim().startsWith(prefix));assert(found,prefix);return found.trim()};
const a=editor.indexOf(' const selectAsset=async('),b=editor.indexOf('  const target=',a);
assert(a>=0&&b>a);
function selection({easyMode=true,englishFlow=false,pro=false,currentWorkPro=false,otherWorkPro=false}={}){
 const events=[];
 const env={governmentResult:false,easyMode,englishFlow,isThaiPremiumJobSuit,premiumHairCreditAvailable:pro,
  layers:[{kind:'head',jobId:'current-work'}],layerKind:l=>l.kind,
  verifiedJobs:{...(currentWorkPro?{'current-work':{premiumHair:true}}:{}),...(otherWorkPro?{'other-work':{premiumHair:true}}:{})},
  ready:true,processActive:false,comparing:false,assetBusy:false,suitRequestRef:{current:null},thaiOutfitAiDraft:{stage:'existing-draft'},
  setStatus:message=>events.push(['status',message]),setEnglishInlineAi:()=>events.push(['inline']),
  setThaiOutfitAiDraft:()=>events.push(['draft']),setThaiPendingHair:()=>events.push(['hair']),setThaiChoiceFlow:()=>events.push(['choice']),
  trackUniformSelection:()=>events.push(['selection'])};
 const run=Function('env',`with(env){${line('const outputHeads=')}${line('const premiumHairAllowed=')}${line('const suitNeedsPro=')}${editor.slice(a,b)}return 'allowed';};return selectAsset;}`)(env);
 return {events,run};
}

test('actual Easy selection rejects paid suits before clearing drafts, changing a scene or selecting an outfit',async()=>{
 for(const template of ['/assets/job-uniforms/female-job-taupe-cream-blouse.png','/assets/job-uniforms/male-job-charcoal-burgundy-tie.png']){
  for(const options of [{},{manualOverride:true}]){
   const {run,events}=selection();
   assert.equal(await run('suit',{template},options),undefined);
   assert.equal(events.length,1);assert.equal(events[0][0],'status');assert.match(events[0][1],/159/);
  }
 }
});

test('the actual policy keeps four free suits per gender and unlocks only current Pro or retained current-work rights',async()=>{
 for(const template of [...THAI_FREE_FEMALE_SUIT_PATHS,...THAI_FREE_MALE_SUIT_PATHS,'/assets/government-uniforms/female-operational.png']){
  const {run}=selection();assert.equal(await run('suit',{template}),'allowed');
 }
 const template='/assets/job-uniforms/female-job-taupe-cream-blouse.png';
 for(const entitlement of [{pro:true},{currentWorkPro:true}]){
  const {run}=selection(entitlement);assert.equal(await run('suit',{template}),'allowed');
 }
 const other=selection({otherWorkPro:true});assert.equal(await other.run('suit',{template}),undefined);
 assert.deepEqual(other.events.map(event=>event[0]),['status'],'Another photo cannot unlock this photo');
});

test('Studio manual outfit placement and English continue past the unchanged selection path without Pro',async()=>{
 const template='/assets/job-uniforms/female-job-taupe-cream-blouse.png';
 for(const config of [{easyMode:false},{easyMode:true,englishFlow:true}]){
  const {run,events}=selection(config);assert.equal(await run('suit',{template},{manualOverride:true}),'allowed');
  assert(events.some(event=>event[0]==='selection'));assert(!events.some(event=>event[0]==='status'));
 }
});

test('actual mobile outfit callback rejects a locked tile even when a synthetic click bypasses the disabled DOM',async()=>{
 const source=await readFile(new URL('../src/thai-mobile-journey.jsx',import.meta.url),'utf8');
 const choose=source.split('\n').find(value=>value.trim().startsWith('const chooseSuit='));assert(choose);
 const events=[],env={suitUnlocked:true,busy:false,suitLoading:false,
  setOutfitChosen:v=>events.push(['chosen',v]),setChosenOutfitTemplate:v=>events.push(['template',v]),
  setNotice:v=>events.push(['notice',v]),onSuit:v=>events.push(['suit',v.template])};
 const run=Function('env',`with(env){${choose}return chooseSuit}`)(env);
 run({locked:true,template:'paid'});assert.deepEqual(events,[]);
 run({locked:false,template:'free'});assert.deepEqual(events,[['chosen',true],['template','free'],['notice',''],['suit','free']]);
});
