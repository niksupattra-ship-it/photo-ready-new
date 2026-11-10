import {ENGLISH_BODY_PORTRAIT_VERSION,ENGLISH_OUTFIT_LIGHTING_VERSION,ENGLISH_BODY_FRAMING_VERSION} from '../english-body-portrait.js';
import {AI_MAKEUP_PAIR_VERSION} from '../ai-makeup-pair-policy.js';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {createAiResultCache} from '../src/ai-result-cache.js';
import {PRODUCTION_HAIR_CATALOG,HAIR_DESIGN_VERSION} from '../hairstyle-catalog.js';
import {ORIGINAL_PORTRAIT_AI_VERSION,markOriginalPortraitAiFinish,hasOriginalPortraitAiFinish,isOriginalPortraitAiRequest} from '../original-portrait-ai.js';
import {NATURAL_STUDIO_SKIN_VERSION} from '../natural-studio-skin.js';
import {STUDIO_SKIN_WORKFLOW_VERSION} from '../studio-skin-treatment.js';
import {sharedStudioSkinSource,studioSkinBlobFromSource,copyStudioSkinBlobMetadata} from '../src/shared-studio-skin.js';
import {SHARED_PORTRAIT_BASE_VERSION,PORTRAIT_MAKEUP_VERSION,sharedOriginalPortraitSource} from '../shared-portrait-policy.js';
import {hasCurrentStudioSkin} from '../studio-skin-metadata.js';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';

const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const shared=await readFile(new URL('../src/shared-studio-skin.js',import.meta.url),'utf8');
const cosmetic=await readFile(new URL('../src/studio-post-cosmetics.js',import.meta.url),'utf8');
const strip=source=>source.replace(/^import .*;\n/gm,'').replaceAll('export ','');
const png=await sharp({create:{width:128,height:192,channels:4,background:'#bca098'}}).png().toBuffer(),baseSource='data:image/png;base64,'+png.toString('base64');
const a=main.indexOf('async function aiFinishPortrait('),b=main.indexOf('\nlet acceptedPaidTrial=',a);assert(a>=0&&b>a);
function fixture(){
 const events=[],requests=[],upload=new File(['immutable original'],'camera.jpg',{type:'image/jpeg'}),state={scope:'wallet-A',failCosmetics:false,cancelCosmetics:false,rights:true};
 const face=[];face[152]={x:.5,y:.8};face[234]={x:.2,y:.5};face[454]={x:.8,y:.5};
 const env={ENGLISH_BODY_FRAMING_VERSION,ENGLISH_BODY_PORTRAIT_VERSION,ENGLISH_OUTFIT_LIGHTING_VERSION,englishPreviewEnabled:()=>Boolean(state.english),AI_MAKEUP_PAIR_VERSION,Blob,URL,atob,STUDIO_SKIN_WORKFLOW_VERSION,ORIGINAL_PORTRAIT_AI_VERSION,NATURAL_STUDIO_SKIN_VERSION,SHARED_PORTRAIT_BASE_VERSION,PORTRAIT_MAKEUP_VERSION,sharedOriginalPortraitSource,PRODUCTION_HAIR_CATALOG,HAIR_DESIGN_VERSION,hasOriginalPortraitAiFinish,isOriginalPortraitAiRequest,hasCurrentStudioSkin,sharedStudioSkinSource,studioSkinBlobFromSource,copyStudioSkinBlobMetadata,portraitFinishChoice,
  activeProcessOperation:{cancelled:false},assertProcessActive(op){if(op?.cancelled)throw Error('cancelled')},cancelledProcessError:()=>Error('cancelled'),currentResultCacheScope:()=>state.scope,resultSourceDigest:async file=>{assert.equal(file,upload);return 'same-source'},uploadGenerationScope:()=> 'same-upload',portraitResultCache:createAiResultCache(),portraitGeometryBases:new WeakMap(),
  window:{dispatchEvent:()=>events.push('event')},CustomEvent:class{},
  async aiFinishPortraitUncached(source,hair,options){assert.equal(source,upload);requests.push({hair,options});const out=markOriginalPortraitAiFinish(new Blob([png],{type:'image/png'}),'natural');if(state.aiPair)out.idpromAiMakeupSource=baseSource;Object.assign(out,{idpromNaturalStudioSkinVersion:NATURAL_STUDIO_SKIN_VERSION,idpromJobId:'job-'+requests.length,idpromTrial:true});return out},
  balanceEnglishPortrait:async blob=>{events.push('measure-body');return blob},restoreFemalePortraitAspect:async()=>{throw new Error('Automatic face aspect warping must not run')},cleanPortraitClothing:async blob=>{events.push('clean');return blob},decodedPortraitImage:async()=>({naturalWidth:128,naturalHeight:192}),portraitFaceLandmarks:async()=>face,
  canvasFor:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=>baseSource}),canvasPng:async()=>new Blob([png],{type:'image/png'}),prepareSharedPortraitMakeup:async()=>({original:{native:true}}),prepareStudioMakeup:async()=>{throw Error('legacy preprocessing must not run')},
  async checkPortraitProportions(source,result,options){assert.equal(source,upload);assert(options.protectFeatures);assert(hasOriginalPortraitAiFinish(result,'natural'));events.push('proportions')},async checkPortraitCompletion(){events.push('completion')},
  async verifyOutputRights(){events.push('rights');return state.rights?{checked:true,unlocked:true,fullEdit:true}:{checked:false,message:'rights unavailable'}},saveAiJobFile:async file=>assert.equal(file,upload),writeActiveAiJob(){},femaleFinishMetadata:()=>({})
 };
 env.renderLocalMakeup=async evidence=>{events.push('cosmetics');assert.equal(evidence.cosmeticsOnly,true);assert(['shared-pink-nude-gloss-v9','shared-peach-nude-gloss-v9'].includes(evidence.lookId));if(state.failCosmetics)throw Error('cosmetics failed');if(state.cancelCosmetics)env.activeProcessOperation.cancelled=true;return {}};
 env.finishStudioPostCosmetics=Function('env',`with(env){${strip(cosmetic)};return finishStudioPostCosmetics}`)(env);
 env.finishSharedStudioSkin=Function('env',`with(env){${strip(shared)};return finishSharedStudioSkin}`)(env);
 const run=Function('env',`with(env){${main.slice(a,b)};return aiFinishPortrait}`)(env);
 return {run,env,events,requests,state,upload};
}
let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
await test('all female finishes use the same Natural AI base, with one job for a selected hair',async()=>{
 const f=fixture();
 for(const style of ['korean-rosy-v1','natural','makeup','soft-rosy-v1','natural']){
  const out=await f.run(f.upload,'seedream-41',{portraitMode:'female',femaleEyeStyle:style,creditKind:'hairstyle'});
  assert(hasOriginalPortraitAiFinish(out,style));assert.equal(sharedStudioSkinSource(out),baseSource);assert.equal(out.idpromSharedPortraitBaseVersion,SHARED_PORTRAIT_BASE_VERSION);assert.equal(out.idpromJobId,'job-1');assert.equal(out.idpromFemaleEyeStyle,style);assert.equal(Boolean(out.idpromNaturalStudioSkinVersion),style==='natural');
 }
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].options.femaleEyeStyle,'natural');assert(!f.events.includes('aspect'));assert.equal(f.events.filter(x=>x==='clean').length,1);assert.equal(f.events.filter(x=>x==='cosmetics').length,3);assert.equal(f.events.filter(x=>x==='rights').length,4);assert.equal(f.upload.idpromStudioSkinVersion,undefined);assert.equal(f.upload.idpromStudioSkinBaseSource,undefined);
});
await test('paired AI finishes display the requested choice and reuse one job without local cosmetics',async()=>{
 for(const first of ['natural','makeup']){
  const f=fixture();f.state.aiPair=true;
  for(const style of [first,first==='natural'?'makeup':'natural',first]){
   const out=await f.run(f.upload,'original',{portraitMode:'female',femaleEyeStyle:style});
   assert(hasOriginalPortraitAiFinish(out,style));assert.equal(out.idpromAiMakeupSource,baseSource);assert.equal(out.idpromJobId,'job-1');
  }
  assert.equal(f.requests.length,1);assert.equal(f.events.filter(e=>e==='cosmetics').length,0);
 }
});
await test('female Natural and Makeup deliver and reuse the completed base even when landmark ratios would reject it',async()=>{
 for(const style of ['natural','makeup','korean-rosy-v1','soft-rosy-v1'])for(const code of ['face_proportion_changed','portrait_features_changed']){
  const f=fixture();let comparisons=0;
  f.env.checkPortraitProportions=async()=>{comparisons++;throw Object.assign(Error('landmark comparison rejected'),{code})};
  const first=await f.run(f.upload,'original',{portraitMode:'female',femaleEyeStyle:style});
  const repeated=await f.run(f.upload,'original',{portraitMode:'female',femaleEyeStyle:style});
  assert(hasOriginalPortraitAiFinish(first,style));assert(hasOriginalPortraitAiFinish(repeated,style));assert.equal(comparisons,0);assert.equal(f.requests.length,1);assert.equal(f.events.filter(e=>e==='completion').length,2);assert(f.events.includes('rights'));assert(f.events.includes('event'));
 }
});
await test('male validation and female completion failures still prevent delivery',async()=>{
 const male=fixture();let comparisons=0;
 male.env.checkPortraitProportions=async()=>{comparisons++;throw Object.assign(Error('male proportions rejected'),{code:'face_proportion_changed'})};
 await assert.rejects(male.run(male.upload,'seedream-36',{portraitMode:'male'}),e=>e.code==='face_proportion_changed');assert.equal(comparisons,1);assert(!male.events.includes('event'));
 const f=fixture();f.env.checkPortraitCompletion=async()=>{throw Object.assign(Error('retained clothing'),{code:'portrait_finish_incomplete'})};
 await assert.rejects(f.run(f.upload,'original',{portraitMode:'female'}),e=>e.code==='portrait_finish_incomplete');assert(!f.events.includes('event'));
});
await test('different hair and wallet scopes each generate a new base; returning hair reuses its own pixels',async()=>{
 const f=fixture();for(const hair of ['seedream-41','seedream-42','seedream-41'])await f.run(f.upload,hair,{portraitMode:'female',femaleEyeStyle:'makeup',creditKind:'hairstyle'});assert.equal(f.requests.length,2);
 f.state.scope='wallet-B';await f.run(f.upload,'seedream-41',{portraitMode:'female',femaleEyeStyle:'natural'});assert.equal(f.requests.length,3);
});
await test('cosmetic failure retains the successful base for retry without another AI edit',async()=>{
 const f=fixture();f.state.failCosmetics=true;await assert.rejects(f.run(f.upload,'seedream-41',{portraitMode:'female',femaleEyeStyle:'makeup'}),/cosmetics failed/);f.state.failCosmetics=false;const out=await f.run(f.upload,'seedream-41',{portraitMode:'female',femaleEyeStyle:'makeup'});assert(hasOriginalPortraitAiFinish(out,'makeup'));assert.equal(f.requests.length,1);
});
await test('failed rights lookup or cancellation cannot deliver a finished variant',async()=>{
 const f=fixture();await f.run(f.upload,'seedream-41',{portraitMode:'female',femaleEyeStyle:'natural'});f.state.rights=false;await assert.rejects(f.run(f.upload,'seedream-41',{portraitMode:'female',femaleEyeStyle:'makeup'}),/rights unavailable/);assert.equal(f.events.filter(x=>x==='cosmetics').length,0);
 f.state.rights=true;f.state.cancelCosmetics=true;await assert.rejects(f.run(f.upload,'seedream-41',{portraitMode:'female',femaleEyeStyle:'makeup'}),/ยกเลิก|cancelled/);assert.equal(f.requests.length,1);
 f.state.cancelCosmetics=false;f.env.activeProcessOperation={cancelled:false};await f.run(f.upload,'seedream-41',{portraitMode:'female',femaleEyeStyle:'natural'});assert.equal(f.requests.length,2,'cancelled unaccepted base must be generated again');
});
await test('independent old Makeup output and invalid base markers cannot masquerade as a shared Natural base',()=>{
 const old=markOriginalPortraitAiFinish(new Blob([png],{type:'image/png'}),'makeup');old.idpromStudioSkinBaseSource=baseSource;assert.equal(sharedStudioSkinSource(old),null);
 old.idpromSharedPortraitBaseVersion=SHARED_PORTRAIT_BASE_VERSION;assert.equal(sharedStudioSkinSource(old),baseSource);old.idpromStudioSkinBaseSource='https://invalid.example/image.png';assert.equal(sharedStudioSkinSource(old),null);
});
await test('shared lossless base bytes participate in the existing cache memory limit',async()=>{
 const cache=createAiResultCache({maxBytes:20}),blob=new Blob(['x']);blob.idpromStudioSkinBaseSource='large lossless base';let calls=0;await cache.get('one',async()=>{calls++;return blob});await cache.get('one',async()=>{calls++;return blob});assert.equal(calls,2);
});
await test('a new collar reference has its own portrait cache entry',async()=>{
 const f=fixture(),options={portraitMode:'female',femaleEyeStyle:'natural'};
 const first=await f.run(f.upload,'original',{...options,templatePath:'/assets/gown-uniforms/kmitl-female.png'});
 const next=await f.run(f.upload,'original',{...options,templatePath:'/assets/uniform.png'});
 const reused=await f.run(f.upload,'original',{...options,templatePath:'/assets/gown-uniforms/kmitl-female.png'});
 assert.equal(f.requests.length,2);assert.equal(first.idpromJobId,'job-1');assert.equal(next.idpromJobId,'job-2');assert.equal(reused.idpromJobId,'job-1');
});
console.log(JSON.stringify({passed,scope:'Actual App orchestration, versioned shared-base capture and cosmetic wrapper, immutable upload, source/hair/wallet cache, rights, failures and cancellation. Provider and canvas pixels inert; native pixel invariants covered by the browser regression.'}));

await test('English AI clothed output bypasses local head and garment replacement and never shares the Thai cache',async()=>{
 const f=fixture();f.state.aiPair=true;f.state.english=true;
 const options={portraitMode:'female',femaleEyeStyle:'natural',templatePath:'/assets/job-uniforms/female-formal-suit.png'};
 const body=await f.run(f.upload,'original',options);
 assert.equal(body.idpromPortraitComposition,ENGLISH_BODY_PORTRAIT_VERSION);assert(f.events.includes('measure-body'));assert.equal(f.requests[0].options.requiresSegmentation,false);
 assert(!f.events.includes('aspect'));assert(!f.events.includes('clean'));
 f.state.english=false;
 const thai=await f.run(f.upload,'original',options);
 assert.equal(thai.idpromPortraitComposition,undefined);assert.equal(f.requests[1].options.requiresSegmentation,true);assert(f.events.includes('clean'));assert.equal(f.requests.length,2);
});
