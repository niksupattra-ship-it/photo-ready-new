import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ENGLISH_BODY_PORTRAIT_VERSION} from '../english-body-portrait.js';
import {STUDIO_SKIN_WORKFLOW_VERSION} from '../studio-skin-treatment.js';
import {ORIGINAL_PORTRAIT_AI_VERSION,isOriginalPortraitAiRequest,markOriginalPortraitAiFinish,hasOriginalPortraitAiFinish} from '../original-portrait-ai.js';
import {NATURAL_STUDIO_SKIN_VERSION} from '../natural-studio-skin.js';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const a=main.indexOf('async function waitForAiJob('),z=main.indexOf('\n\nlet landmarkerPromise;',a);
assert(a>=0&&z>a);
function fixture(legacyState,status='completed'){
 const calls=[],natural=new Blob(['finished-natural'],{type:'image/png'}),makeup=new Blob(['finished-makeup'],{type:'image/png'});let polls=0;
 const env={ENGLISH_BODY_PORTRAIT_VERSION,STUDIO_SKIN_WORKFLOW_VERSION,ORIGINAL_PORTRAIT_AI_VERSION,isOriginalPortraitAiRequest,markOriginalPortraitAiFinish,hasOriginalPortraitAiFinish,portraitFinishChoice,activeProcessOperation:{},assertProcessActive(){},analyticsTagError:e=>e,portraitJobError:message=>Error(message),walletHeaders:()=>({}),needsOriginalAiSkinPolish:()=>false,verifyOutputRights:async()=>({checked:true,unlocked:false,fullEdit:false}),levelPortraitCutout:async()=>{throw Error('complete English portrait must not use head-only preprocessing')},portraitFetch:async url=>{
  calls.push(url);assert(!url.includes('/proportions'),'no second AI request');
  if(url==='/api/ai-jobs/job-ready'){assert(++polls===1,'a completed image must not wait on obsolete correction flags');return {ok:true,json:async()=>({status,error:'provider failed',proportionCorrection:legacyState,portraitMode:'female',portraitComposition:ENGLISH_BODY_PORTRAIT_VERSION,studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,femaleEyeStyle:'natural',naturalFinishVersion:NATURAL_STUDIO_SKIN_VERSION,hasMakeupVariant:true})}}
  return {ok:true,headers:{get:name=>name==='X-IDPROM-Trial'?'1':null},blob:async()=>url.includes('finish=makeup')?makeup:natural};
 }};
 const wait=Function('env',`with(env){${main.slice(a,z)};return waitForAiJob}`)(env);return {wait,calls};
}
test('completed English image and makeup deliver despite obsolete correction states',async()=>{
 for(const state of [undefined,'processing','done','failed']){
  const f=fixture(state),result=await f.wait('job-ready');assert.equal(result.idpromJobId,'job-ready');assert.equal(await result.text(),'finished-natural');assert.equal(await result.idpromAiMakeupBlob.text(),'finished-makeup');assert(hasOriginalPortraitAiFinish(result,'natural'));assert.equal(result.idpromPortraitComposition,ENGLISH_BODY_PORTRAIT_VERSION);assert.equal(f.calls.length,3);
 }
});
test('genuine provider failures remain failures and do not deliver a fake success',async()=>{
 const f=fixture('processing','failed');await assert.rejects(f.wait('job-ready'),/provider failed/);assert.equal(f.calls.length,1);
});
