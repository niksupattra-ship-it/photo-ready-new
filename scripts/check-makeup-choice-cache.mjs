import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
import {isFreeFemaleHair} from '../src/free-female-hair.js';
import {NATURAL_STUDIO_SKIN_VERSION,naturalStudioSkinMetadata} from '../natural-studio-skin.js';
import {PRODUCTION_HAIR_CATALOG,HAIR_DESIGN_VERSION} from '../hairstyle-catalog.js';
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const noop=()=>{};
function extract(start,end,name,env){const a=main.indexOf(start),b=main.indexOf(end,a);assert(a>=0&&b>a,`missing ${name}`);return new Function('env',`with(env){${main.slice(a,b)};return ${name}}`)(env)}
function fixture(){
 const file=Object.assign(new Blob(['immutable uploaded photo']),{idpromPortraitMode:'female',idpromFemaleEyeStyle:'makeup'}),calls=[],rights=[],messages=[];
 let wallet='wallet-A',privateTrial=false;
 const env={studioPhotoTransactionRef:{current:false},window:{dispatchEvent(){}},CustomEvent:class{},PRODUCTION_HAIR_CATALOG,HAIR_DESIGN_VERSION,NATURAL_STUDIO_SKIN_VERSION,naturalStudioSkinMetadata,portraitFinishChoice,isFreeFemaleHair,firstUploadedPhotoRef:{current:file},editCache:{current:{master:new Blob(['accepted first makeup']),lock:{templatePath:'female.png'}}},hairResultCacheRef:{current:new Map()},hairRequestRef:{current:false},hairBusy:false,busy:false,activeProcessOperation:{jobId:'job-first',cancelled:false,settled:true},currentOutputJobRef:{current:'job-first'},currentOutputTrialRef:{current:true},studioTrialRef:{current:true},activeUniformTemplate:'female.png',liveAdjustRef:{current:{}},liveCollarWarpRef:{current:0},liveCollarHeightRef:{current:0},liveNeckAdjustRef:{current:{}},backgroundRef:{current:'background'},currentResultCacheScope:()=>wallet,privateTrialRequested:()=>privateTrial,
  setHairGenerating:noop,setHairBusy:v=>{env.hairBusy=v},setMsg:v=>messages.push(v),setProgressStage:noop,setOutputJobId:noop,setTrialPreview:noop,setHairId:noop,beginOptionRender:noop,
  beginProgress:()=>{env.activeProcessOperation={jobId:null,cancelled:false,settled:false}},assertProcessActive:(operation=env.activeProcessOperation)=>{if(operation?.cancelled)throw Error('cancelled')},
  async aiFinishPortrait(source,id,options){calls.push({source,id,options});if(env.failGeneration)throw Error('generation failed');const value=Object.assign(new Blob([`result-${id}-${options.femaleEyeStyle}-${calls.length}`]),{idpromJobId:'job-'+calls.length,idpromTrial:true,...(options.portraitMode==='female'&&options.femaleEyeStyle==='natural'?{idpromNaturalStudioSkinVersion:NATURAL_STUDIO_SKIN_VERSION}:{})});env.activeProcessOperation.jobId=value.idpromJobId;env.currentOutputJobRef.current=value.idpromJobId;return value},
  finishFirstPortraitMaster:async value=>value,fitChangedHairMaster:async(_master,current)=>current.lock,
  async verifyOutputRights(jobId){rights.push(jobId);if(env.failRights)return {checked:false,message:'rights unavailable'};return {checked:true,unlocked:env.paid===true}},
  async renderAdjustedFinal(...args){if(env.failRender)throw Error('render failed');args.at(-1).push({name:'หัว · คอ · ผม',...naturalStudioSkinMetadata(args[0]),source:args[0]})},femaleFinishMetadata:()=>({}),finishProgress:async success=>{if(!success)env.activeProcessOperation.cancelled=true}
 };
 const a=main.indexOf(' const hairResultMode='),b=main.indexOf(' const changeHair=async',a);assert(a>=0&&b>a);
 const memory=new Function('env',`with(env){${main.slice(a,b)};return {rememberHairResult,rememberRestoredHairResult,cachedHairResult,canReuseHair,hairResultKey,hairResultScope}}`)(env);Object.assign(env,memory);
 // The change handler also resolves gender, so provide the real sibling helper.
 env.hairResultMode=extract(' const hairResultMode=','\n const hairResultKey=','hairResultMode',env);
 env.changeHairForStudio=extract(' const changeHairForStudio=async (','\n const downloadHairDonor=','changeHairForStudio',env);
 const change=extract(' const changeStudioHair=async(id,portraitMode,femaleEyeStyle,outfitReferencePath)=>{','\n const LegacyPaidWarningUI=','changeStudioHair',env);
 memory.rememberHairResult('seedream-19',env.editCache.current.master,'female','makeup').confirmed=true;
 return {file,calls,rights,messages,env,memory,change,setWallet:v=>{wallet=v},setPrivateTrial:v=>{privateTrial=v}};
}
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS',name)}
await test('makeup → natural → makeup → natural reuses exact two masters without another AI job',async()=>{
 const f=fixture(),initial=f.env.editCache.current.master;
 const natural=await f.change('seedream-19','female','natural');assert.equal(f.calls.length,1);assert.equal(f.file.idpromFemaleEyeStyle,'makeup');assert.equal(natural.layer.femaleEyeStyle,'natural');assert.equal(natural.layer.naturalStudioSkinVersion,NATURAL_STUDIO_SKIN_VERSION);natural.commit();const naturalMaster=f.env.editCache.current.master;assert.equal(f.file.idpromFemaleEyeStyle,'natural');
 const makeup=await f.change('seedream-19','female','makeup');assert.equal(makeup.reused,true);assert.equal(f.calls.length,1);makeup.commit();assert.equal(f.env.editCache.current.master,initial);assert.equal(f.file.idpromFemaleEyeStyle,'makeup');
 const again=await f.change('seedream-19','female','natural');assert.equal(again.reused,true);again.commit();assert.equal(f.env.editCache.current.master,naturalMaster);assert.equal(f.calls.length,1);assert.equal(f.memory.canReuseHair('seedream-19','female','makeup'),true);assert.equal(f.memory.canReuseHair('seedream-19','female','natural'),true);
 assert(f.calls.every(c=>c.source===f.file));assert.deepEqual(f.rights,['job-first','job-1']);assert.equal(await f.file.text(),'immutable uploaded photo');
});
await test('requested finish cannot reuse the other finish when source metadata still names old one',async()=>{
 const f=fixture();assert.notEqual(f.memory.hairResultKey('seedream-19','female','natural'),f.memory.hairResultKey('seedream-19','female','makeup'));assert.equal(f.memory.canReuseHair('seedream-19','female','natural'),false);const staged=await f.change('seedream-19','female','natural');assert.equal(staged.reused,false);assert.equal(f.calls[0].options.femaleEyeStyle,'natural');assert.equal(f.file.idpromFemaleEyeStyle,'makeup');staged.rollback();assert.equal(f.file.idpromFemaleEyeStyle,'makeup');assert.equal(f.env.currentOutputJobRef.current,'job-first');
});
await test('each hair and finish combination remains separately reusable',async()=>{
 const f=fixture();for(const [hair,style] of [['seedream-21','makeup'],['seedream-21','natural'],['seedream-03','natural'],['seedream-03','makeup']]){const result=await f.change(hair,'female',style);assert(!result.reused);result.commit()}
 assert.equal(f.calls.length,4);for(const [hair,style] of [['seedream-19','makeup'],['seedream-21','natural'],['seedream-03','makeup'],['seedream-21','makeup'],['seedream-03','natural']]){const result=await f.change(hair,'female',style);assert(result.reused);result.commit()}
 assert.equal(f.calls.length,4);assert.equal(f.env.hairResultCacheRef.current.size,5);
});
await test('failed generation or decode leaves old source finish, master and job unchanged',async()=>{
 for(const kind of ['failGeneration','failRender']){const f=fixture(),master=f.env.editCache.current.master;f.env[kind]=true;await assert.rejects(f.change('seedream-19','female','natural'));assert.equal(f.file.idpromFemaleEyeStyle,'makeup');assert.equal(f.env.editCache.current.master,master);assert.equal(f.env.currentOutputJobRef.current,'job-first');assert.equal(f.memory.canReuseHair('seedream-19','female','natural'),false)}
});
await test('cancelled or stale staged result cannot commit finish or master',async()=>{
 for(const kind of ['cancel','source','account','trial']){const f=fixture(),master=f.env.editCache.current.master,staged=await f.change('seedream-19','female','natural');if(kind==='cancel')f.env.activeProcessOperation.cancelled=true;else if(kind==='account')f.setWallet('wallet-B');else if(kind==='trial')f.setPrivateTrial(true);else f.env.firstUploadedPhotoRef.current=new Blob(['another person']);assert.throws(()=>staged.commit());staged.rollback();assert.equal(f.file.idpromFemaleEyeStyle,'makeup');assert.equal(f.env.editCache.current.master,master);assert.equal(f.env.currentOutputJobRef.current,'job-first');assert.equal(f.env.hairResultCacheRef.current.size,1)}
});
await test('cached selection freshly verifies purchased rights and never sends AI',async()=>{
 const f=fixture();f.env.paid=true;const staged=await f.change('seedream-19','female','makeup');assert.equal(staged.reused,true);assert.equal(staged.layer.restrictedTrial,false);assert.equal(staged.layer.outputUnlocked,true);staged.commit();assert.equal(f.env.currentOutputTrialRef.current,false);assert.equal(f.calls.length,0);assert.deepEqual(f.rights,['job-first']);
});
await test('rights lookup failure leaves current appearance and selected finish intact',async()=>{
 const f=fixture();const staged=await f.change('seedream-19','female','natural');staged.commit();const master=f.env.editCache.current.master,job=f.env.currentOutputJobRef.current;f.env.failRights=true;await assert.rejects(f.change('seedream-19','female','makeup'));assert.equal(f.file.idpromFemaleEyeStyle,'natural');assert.equal(f.env.editCache.current.master,master);assert.equal(f.env.currentOutputJobRef.current,job);assert.equal(f.calls.length,1);
});
await test('another source, account or private-trial scope cannot reuse prior results',async()=>{
 for(const kind of ['source','account','trial']){const f=fixture();if(kind==='source')f.env.firstUploadedPhotoRef.current=new Blob(['another photo']);else if(kind==='account')f.setWallet('wallet-B');else f.setPrivateTrial(true);assert.equal(f.memory.canReuseHair('seedream-19','female','makeup'),false)}
});
await test('restored current variant seeds active finish and is reusable without generation',async()=>{
 const f=fixture();f.env.hairResultCacheRef.current.clear();f.file.idpromFemaleEyeStyle='makeup';const initial=f.env.editCache.current.master;f.memory.rememberRestoredHairResult({jobId:'job-first',hairId:'seedream-19',portraitMode:'female',femaleEyeStyle:'natural',initialFemaleEyeStyle:'makeup',naturalStudioSkinVersion:NATURAL_STUDIO_SKIN_VERSION});assert.equal(f.file.idpromFemaleEyeStyle,'natural');assert.equal(f.memory.canReuseHair('seedream-19','female','natural'),true);assert.equal(f.memory.canReuseHair('seedream-19','female','makeup'),false);const makeup=await f.change('seedream-19','female','makeup');makeup.commit();const natural=await f.change('seedream-19','female','natural');assert.equal(natural.reused,true);natural.commit();assert.equal(f.env.editCache.current.master,initial);assert.equal(f.calls.length,1);
});
await test('restored incomplete head cannot seed an unrelated job or no master',async()=>{
 const f=fixture();f.env.hairResultCacheRef.current.clear();f.memory.rememberRestoredHairResult({jobId:'other-job',hairId:'seedream-19',portraitMode:'female',femaleEyeStyle:'natural',naturalStudioSkinVersion:NATURAL_STUDIO_SKIN_VERSION});assert.equal(f.env.hairResultCacheRef.current.size,0);f.env.editCache.current=null;f.memory.rememberRestoredHairResult({jobId:'job-first',hairId:'seedream-19',portraitMode:'female',femaleEyeStyle:'natural',naturalStudioSkinVersion:NATURAL_STUDIO_SKIN_VERSION});assert.equal(f.env.hairResultCacheRef.current.size,0);
});
await test('restored free hairstyles remember their untouched AI base under the underlying no-hair key',async()=>{
 for(const metadata of [{hairId:'hair-21',freeHairBaseOriginal:true},{hairId:'hair-21'},{hairId:'',freeHairBaseOriginal:true}]){
  const f=fixture();f.env.hairResultCacheRef.current.clear();const bytes=Buffer.from('untouched AI base including native ears and inner hair');const head={...metadata,jobId:'job-first',portraitMode:'female',femaleEyeStyle:'makeup',hairOriginalSource:'data:image/png;base64,'+bytes.toString('base64')};f.memory.rememberRestoredHairResult(head);const cached=f.memory.cachedHairResult('','female','makeup');assert(cached?.confirmed);assert.equal(await cached.master.text(),bytes.toString());assert.equal(cached.master.type,'image/png');assert.notEqual(cached.master,f.env.editCache.current.master);assert.equal(f.memory.canReuseHair('hair-21','female','makeup'),false);
  const natural=await f.change('','female','natural');natural.commit();const makeup=await f.change('','female','makeup');assert.equal(makeup.reused,true);makeup.commit();assert.equal(await f.env.editCache.current.master.text(),bytes.toString());assert.equal(f.calls.length,1);
 }
});
await test('invalid, missing or oversized stored freehair bases never seed the cleaned head as an AI master',async()=>{
 const originals=[undefined,'','https://example.invalid/portrait.png','data:image/svg+xml;base64,PHN2Zy8+','data:image/png;base64,!broken!','data:image/png;base64,A','data:image/png;base64,'+'A'.repeat(32*1024*1024)];
 for(const original of originals){const f=fixture();f.env.hairResultCacheRef.current.clear();f.memory.rememberRestoredHairResult({jobId:'job-first',hairId:'hair-21',portraitMode:'female',femaleEyeStyle:'natural',naturalStudioSkinVersion:NATURAL_STUDIO_SKIN_VERSION,hairOriginalSource:original});assert.equal(f.env.hairResultCacheRef.current.size,0);assert.equal(f.file.idpromFemaleEyeStyle,'natural')}
});
await test('male key ignores female-only appearance and does not reuse female variants',async()=>{
 const f=fixture();assert.equal(f.memory.hairResultKey('seedream-35','male','makeup'),f.memory.hairResultKey('seedream-35','male','natural'));assert.notEqual(f.memory.hairResultKey('','male','natural'),f.memory.hairResultKey('','female','natural'));const result=await f.change('seedream-35','male','makeup');assert.equal(f.calls[0].options.femaleEyeStyle,'natural');result.commit();assert.equal(f.file.idpromFemaleEyeStyle,'makeup');
});
await test('provider/validation failure reaches Studio unchanged instead of a false hair mismatch',async()=>{
 const f=fixture(),cause=Object.assign(Error('ตรวจรูปตาในต้นฉบับไม่ครบ'),{code:'portrait_features_changed'});
 f.env.aiFinishPortrait=async()=>{throw cause};
 await assert.rejects(f.change('seedream-20','female','makeup'),error=>error===cause);
 assert.equal(f.env.currentOutputJobRef.current,'job-first');
});
await test('Korean rosy uses an independent cache and switching back reuses legacy makeup',async()=>{
 const f=fixture(),original=f.env.editCache.current.master;
 assert.notEqual(f.memory.hairResultKey('seedream-19','female','korean-rosy-v1'),f.memory.hairResultKey('seedream-19','female','makeup'));
 const result=await f.change('seedream-19','female','korean-rosy-v1');result.commit();
 assert.equal(f.calls[0].source,f.file);assert.equal(f.calls[0].options.femaleEyeStyle,'korean-rosy-v1');
 const back=await f.change('seedream-19','female','makeup');assert(back.reused);back.commit();assert.equal(f.env.editCache.current.master,original);
 const again=await f.change('seedream-19','female','korean-rosy-v1');assert(again.reused);again.commit();assert.equal(f.calls.length,1);
 f.env.editCache.current.lock.templatePath='another-outfit.png';assert.equal(f.memory.canReuseHair('seedream-19','female','korean-rosy-v1'),false);
});
await test('new soft rosy finish uses original source and selected hair/outfit with an independent reusable cache',async()=>{
 const f=fixture(),original=f.env.editCache.current.master;
 for(const old of ['makeup','natural','korean-rosy-v1'])assert.notEqual(f.memory.hairResultKey('seedream-19','female','soft-rosy-v1'),f.memory.hairResultKey('seedream-19','female',old));
 const result=await f.change('seedream-19','female','soft-rosy-v1');assert.equal(f.calls.length,1);assert.equal(f.calls[0].source,f.file);assert.equal(f.calls[0].id,'seedream-19');assert.equal(f.calls[0].options.femaleEyeStyle,'soft-rosy-v1');assert.equal(f.calls[0].options.templatePath,'female.png');result.commit();
 const rosy=f.env.editCache.current.master;assert.equal(f.file.idpromFemaleEyeStyle,'soft-rosy-v1');
 const back=await f.change('seedream-19','female','makeup');assert(back.reused);back.commit();assert.equal(f.env.editCache.current.master,original);
 const again=await f.change('seedream-19','female','soft-rosy-v1');assert(again.reused);again.commit();assert.equal(f.calls.length,1);assert.equal(f.env.editCache.current.master,rosy);
 f.env.editCache.current.lock.templatePath='another-outfit.png';assert.equal(f.memory.canReuseHair('seedream-19','female','soft-rosy-v1'),false);
});
await test('old saved soft rosy result cannot seed the revised skin finish cache',async()=>{
 const f=fixture();f.env.hairResultCacheRef.current.clear();const head={jobId:'job-first',hairId:'seedream-19',portraitMode:'female',femaleEyeStyle:'soft-rosy-v1'};
 f.memory.rememberRestoredHairResult(head);assert.equal(f.memory.canReuseHair('seedream-19','female','soft-rosy-v1'),false);
 f.memory.rememberRestoredHairResult({...head,softRosyFinishVersion:'soft-radiance-korean-brows-v7'});assert.equal(f.memory.canReuseHair('seedream-19','female','soft-rosy-v1'),true);
});

await test('old natural work stays visible without seeding the revised skin cache',async()=>{
 const f=fixture(),master=f.env.editCache.current.master;
 f.env.hairResultCacheRef.current.clear();
 const head={jobId:'job-first',hairId:'seedream-19',portraitMode:'female',femaleEyeStyle:'natural'};
 for(const metadata of [{},{naturalStudioSkinVersion:'older-revision'}]){
  f.memory.rememberRestoredHairResult({...head,...metadata});
  assert.equal(f.memory.canReuseHair('seedream-19','female','natural'),false);
  assert.equal(f.env.hairResultCacheRef.current.size,0);
  assert.equal(f.env.editCache.current.master,master);
  assert.equal(f.env.currentOutputJobRef.current,'job-first');
  assert.equal(f.calls.length,0);
 }
 f.memory.rememberRestoredHairResult({...head,naturalStudioSkinVersion:NATURAL_STUDIO_SKIN_VERSION});
 assert.equal(f.memory.canReuseHair('seedream-19','female','natural'),true);
 assert.equal(f.memory.cachedHairResult('seedream-19','female','natural').master.idpromNaturalStudioSkinVersion,NATURAL_STUDIO_SKIN_VERSION);
 assert.equal(f.calls.length,0);
});
await test('restoring a current natural head never stamps the immutable uploaded source',async()=>{
 const f=fixture();f.env.hairResultCacheRef.current.clear();f.env.editCache.current.master=f.file;
 f.memory.rememberRestoredHairResult({jobId:'job-first',hairId:'seedream-19',portraitMode:'female',femaleEyeStyle:'natural',naturalStudioSkinVersion:NATURAL_STUDIO_SKIN_VERSION});
 const cached=f.memory.cachedHairResult('seedream-19','female','natural');
 assert(cached?.confirmed);assert.notEqual(cached.master,f.file);
 assert.equal(cached.master.idpromNaturalStudioSkinVersion,NATURAL_STUDIO_SKIN_VERSION);
 assert.equal(f.file.idpromNaturalStudioSkinVersion,undefined);
 assert.equal(await f.file.text(),'immutable uploaded photo');
 assert.equal(f.calls.length,0);
});

console.log(`PASS: ${passed} actual App makeup/cache scenarios; AI, rendering and payment API mocked; no external requests.`);
