import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {STUDIO_SKIN_WORKFLOW_VERSION,parseStudioSkinEvidence} from '../studio-skin-treatment.js';
import {ORIGINAL_PORTRAIT_AI_VERSION,isOriginalPortraitAiRequest,markOriginalPortraitAiFinish,hasOriginalPortraitAiFinish,needsOriginalAiSkinPolish} from '../original-portrait-ai.js';
import {studioSkinWorkflowMetadata,hasCurrentStudioSkin} from '../studio-skin-metadata.js';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
import {captureStudioSkinEvidence} from '../src/studio-skin-evidence.js';
import {PRODUCTION_HAIR_CATALOG} from '../hairstyle-catalog.js';
import {NATURAL_STUDIO_SKIN_VERSION} from '../natural-studio-skin.js';
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const cosmeticSource=await readFile(new URL('../src/studio-post-cosmetics.js',import.meta.url),'utf8');
const noop=()=>{};
function extract(source,start,end,name,env){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,'missing actual '+name);return Function('env',`with(env){${source.slice(a,b)};return ${name}}`)(env)}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const cancelled=()=>Object.assign(Error('cancelled'),{name:'AbortError'});
function assertActive(operation){if(operation?.cancelled)throw cancelled()}
function finishWrapper(render){
 // Evaluate the actual wrapper with an inert pixel renderer. Pixel-mask and
 // native-texture invariants are exercised by the separate cosmetics browser test.
 const source=cosmeticSource.replace(/^import .*;\n/gm,'').replace('export async function finishStudioPostCosmetics','async function finishStudioPostCosmetics');
 return Function('env',`with(env){${source};return finishStudioPostCosmetics}`)({STUDIO_SKIN_WORKFLOW_VERSION,renderLocalMakeup:render});
}
function completionFixture(fields={studioSkinVersion:STUDIO_SKIN_WORKFLOW_VERSION,portraitMode:'female',femaleEyeStyle:'natural'},options={}){
 const raw=new Blob(['inert native AI output'],{type:'image/png'}),operation={cancelled:false},events=[],calls=[],urls=[];
 const state={failPrepare:false,failEncode:false,cancelRender:false,failRights:false};
 const env={STUDIO_SKIN_WORKFLOW_VERSION,ORIGINAL_PORTRAIT_AI_VERSION,isOriginalPortraitAiRequest,markOriginalPortraitAiFinish,hasOriginalPortraitAiFinish,needsOriginalAiSkinPolish,portraitFinishChoice,activeProcessOperation:operation,assertProcessActive:assertActive,walletHeaders:()=>({'x-wallet-id':'inert'}),analyticsTagError:error=>error,portraitJobError:value=>Error(value),
  async portraitFetch(url){calls.push(url);if(url.endsWith('/result'))return {ok:true,headers:{get:name=>name==='X-IDPROM-Trial'?'1':null},blob:async()=>raw};return {ok:true,json:async()=>({status:'completed',stage:'edges',...fields})}},
  async levelPortraitCutout(blob){events.push('level');assert.equal(blob,raw);if(state.cancelLevel)operation.cancelled=true;return blob},
  async verifyOutputRights(){events.push('rights');if(state.failRights)throw Error('rights unavailable');return {checked:true,unlocked:false,fullEdit:true}},
  URL:{createObjectURL(blob){assert.equal(blob,raw);urls.push('created');return 'blob:inert-completed-output'},revokeObjectURL(url){assert.equal(url,'blob:inert-completed-output');urls.push('revoked')}},
  async prepareStudioMakeup(url){assert.equal(url,'blob:inert-completed-output');events.push('prepare');if(state.failPrepare)throw Error('prepare failed');return {original:{native:true},face:[],hairMask:{},skinMask:{}}},
  async canvasPng(canvas){events.push('encode');assert.equal(canvas.native,true);if(state.failEncode)throw Error('encode failed');return new Blob(['inert cosmetic output'],{type:'image/png'})}
 };
 env.finishStudioPostCosmetics=finishWrapper(async evidence=>{events.push('cosmetics');assert.equal(evidence.cosmeticsOnly,true);assert.equal(evidence.original.native,true);assert.equal(raw.idpromStudioSkinVersion,STUDIO_SKIN_WORKFLOW_VERSION);if(state.cancelRender)operation.cancelled=true;return {native:true}});
 Object.assign(state,options);
 const wait=extract(main,'async function waitForAiJob(','\n\nlet landmarkerPromise;','waitForAiJob',env);
 return {raw,operation,events,calls,urls,state,env,wait};
}
let passed=0;
async function test(name,run){await run();passed++;console.log('PASS '+name)}
await test('a completed staged natural job returns the leveled image without cosmetics or preparation',async()=>{
 const f=completionFixture(),blob=await f.wait('job-natural');assert.equal(blob,f.raw);assert(hasCurrentStudioSkin(blob,'natural'));assert.equal(blob.idpromStudioCosmeticsVersion,undefined);assert.equal(blob.idpromJobId,'job-natural');assert.equal(blob.idpromTrial,true);assert.equal(blob.idpromFullEdit,true);assert(!f.events.includes('prepare'));assert(!f.events.includes('cosmetics'));assert.deepEqual(f.urls,[]);assert.equal(f.calls.length,2);
});
await test('all staged finish choices return the same bare leveled base before clothing cleanup and local cosmetics',async()=>{
 for(const style of ['korean-rosy-v1','makeup','soft-rosy-v1']){
  const f=completionFixture({studioSkinVersion:STUDIO_SKIN_WORKFLOW_VERSION,portraitMode:'female',femaleEyeStyle:style}),blob=await f.wait('job-'+style);
  assert.equal(blob,f.raw);assert(hasCurrentStudioSkin(blob,'natural'));assert.equal(blob.idpromStudioCosmeticsVersion,undefined);assert.equal(blob.idpromJobId,'job-'+style);
  assert(!f.events.includes('prepare'));assert(!f.events.includes('cosmetics'));assert(!f.events.includes('encode'));assert.deepEqual(f.urls,[]);
  assert.equal(blob.idpromTrial,true);assert.equal(blob.idpromFullEdit,true);assert.equal(f.calls.length,2);
 }
});
await test('legacy jobs and male jobs remain unchanged even beside unrelated staged metadata',async()=>{
 for(const fields of [{portraitMode:'female',femaleEyeStyle:'korean-rosy-v1'},{studioSkinVersion:'older-staged-version',portraitMode:'female',femaleEyeStyle:'makeup'},{studioSkinVersion:STUDIO_SKIN_WORKFLOW_VERSION,portraitMode:'male',femaleEyeStyle:'makeup'}]){
  const f=completionFixture(fields),blob=await f.wait('legacy');assert.equal(blob,f.raw);assert.equal(blob.idpromStudioSkinVersion,undefined);assert.equal(blob.idpromStudioCosmeticsVersion,undefined);assert(!f.events.includes('prepare'));assert(!f.events.includes('cosmetics'));
 }
});
await test('failed rights cannot return a partially accepted base',async()=>{
 const f=completionFixture({studioSkinVersion:STUDIO_SKIN_WORKFLOW_VERSION,portraitMode:'female',femaleEyeStyle:'korean-rosy-v1'},{failRights:true});
 await assert.rejects(f.wait('failed'));assert.equal(f.raw.idpromJobId,undefined);assert.equal(f.raw.idpromStudioCosmeticsVersion,undefined);assert.equal(f.raw.idpromStudioSkinVersion,undefined);
 assert(!f.events.includes('prepare'));assert(!f.events.includes('cosmetics'));
});
await test('an older Natural response cannot silently satisfy the current clear-skin request',async()=>{
 const f=submissionFixture();f.state.oldNatural=true;await assert.rejects(f.submit(f.original,'',f.options),/ระบบปรับผิวกำลังอัปเดต/);
});
await test('cancellation while leveling the native base prevents acceptance before any cosmetic stage',async()=>{
 const f=completionFixture({studioSkinVersion:STUDIO_SKIN_WORKFLOW_VERSION,portraitMode:'female',femaleEyeStyle:'korean-rosy-v1'},{cancelLevel:true});await assert.rejects(f.wait('cancelled'),{name:'AbortError'});assert(!f.events.includes('encode'));assert.equal(f.raw.idpromJobId,undefined);assert.equal(f.raw.idpromStudioSkinVersion,undefined);
});
await test('skin metadata exposes only current processed markers and preserves style-specific cache eligibility',async()=>{
 const original=new Blob(['immutable original'],{type:'image/jpeg'});
 for(const style of ['natural','korean-rosy-v1','makeup','soft-rosy-v1']){
  const processed=new Blob(['processed'],{type:'image/png'});processed.idpromStudioSkinVersion=STUDIO_SKIN_WORKFLOW_VERSION;if(style!=='natural')processed.idpromStudioCosmeticsVersion=STUDIO_SKIN_WORKFLOW_VERSION+':'+style;
  const head=studioSkinWorkflowMetadata(processed);assert(hasCurrentStudioSkin(head,style));assert(!hasCurrentStudioSkin(head,style==='natural'?'makeup':'natural'));
 }
 assert.deepEqual(studioSkinWorkflowMetadata(original),{});assert.equal(original.idpromStudioSkinVersion,undefined);assert.equal(original.idpromStudioCosmeticsVersion,undefined);assert.equal(await original.text(),'immutable original');
});

await test('original-AI completion returns already finished natural and makeup pixels without local cosmetics',async()=>{
 for(const style of ['natural','makeup','korean-rosy-v1','soft-rosy-v1']){
  const f=completionFixture({studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,portraitMode:'female',femaleEyeStyle:style}),blob=await f.wait('original-ai-'+style);
  assert.equal(blob,f.raw);assert(hasOriginalPortraitAiFinish(blob,style));assert.equal(blob.idpromStudioSkinBaseSource,undefined);assert(!f.events.includes('prepare'));assert(!f.events.includes('cosmetics'));assert(!f.events.includes('encode'));
  assert.equal(blob.idpromJobId,'original-ai-'+style);assert.equal(blob.idpromTrial,true);
 }
});
await test('completed Natural preserves only the server-reported clear-skin revision',async()=>{
 for(const revision of [undefined,NATURAL_STUDIO_SKIN_VERSION,'natural-studio-skin-v2-source-eyes']){
  const f=completionFixture({studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,portraitMode:'female',femaleEyeStyle:'natural',...(revision?{naturalFinishVersion:revision}:{})});
  assert.equal((await f.wait('natural-version')).idpromNaturalStudioSkinVersion,revision);
 }
});
await test('pending original-AI v1 completion keeps its actual version without seeding the current guided cache',async()=>{
 for(const style of ['natural','makeup']){
  const version='studio-original-ai-v1',f=completionFixture({studioSkinVersion:version,portraitMode:'female',femaleEyeStyle:style}),blob=await f.wait('pending-v1');
  assert.equal(blob.idpromStudioSkinVersion,version);assert.equal(blob.idpromStudioCosmeticsVersion,style==='natural'?undefined:version+':'+style);assert(!hasOriginalPortraitAiFinish(blob,style));assert.equal(studioSkinWorkflowMetadata(blob).studioSkinVersion,version);assert(!f.events.includes('prepare'));assert(!f.events.includes('cosmetics'));
 }
});
await test('only current makeup jobs receive the bounded ten-minute polling budget for the second AI stage',async()=>{
 for(const [version,style,extended,naturalFinishVersion]of [[ORIGINAL_PORTRAIT_AI_VERSION,'makeup',true],[ORIGINAL_PORTRAIT_AI_VERSION,'natural',false],['studio-original-ai-v2','makeup',false],[ORIGINAL_PORTRAIT_AI_VERSION,'natural',true,NATURAL_STUDIO_SKIN_VERSION]]){
  const f=completionFixture({studioSkinVersion:version,portraitMode:'female',femaleEyeStyle:style,naturalFinishVersion});let clock=0,polls=0;
  f.env.Date={now:()=>clock};f.env.setTimeout=fn=>{clock=7*60*1000;fn();return 1};
  const original=f.env.portraitFetch;f.env.portraitFetch=async url=>{if(url.endsWith('/result'))return original(url);polls++;return {ok:true,json:async()=>({studioSkinVersion:version,portraitMode:'female',femaleEyeStyle:style,naturalFinishVersion,status:polls===1?'processing':'completed',stage:polls===1?'skin-polish':'edges'})}};
  const pending=f.wait('slow-polish');if(extended){const result=await pending;assert.equal(result.idpromStudioSkinVersion,version);assert.equal(polls,2)}else{await assert.rejects(pending,/ประมวลผลเกินเวลา/);assert.equal(polls,1)}
 }
});
function submissionFixture(mode='female',style='natural'){
 const original=new File(['immutable upload bytes'],'original.jpg',{type:'image/jpeg'}),canonical=new File(['old canonical derivative'],'canonical.png',{type:'image/png'}),operation={cancelled:false},calls=[],saved=[],events=[],state={legacyResult:false};
 original.idpromPortraitMode=mode;original.idpromCanonicalInput=canonical;
 const env={activeProcessOperation:operation,activeSavedDownloadWork:'saved-work',STUDIO_SKIN_WORKFLOW_VERSION,ORIGINAL_PORTRAIT_AI_VERSION,NATURAL_STUDIO_SKIN_VERSION,PRODUCTION_HAIR_CATALOG,portraitFinishChoice,hasOriginalPortraitAiFinish,assertProcessActive:assertActive,FormData,
  submitPortraitJob:async(_operation,submit)=>submit(),levelPortraitCutout:noop,
  async canonicalPortraitInput(input,{normalize}){assert.equal(mode,'male','Female original-AI must bypass canonical image normalization');assert.equal(input,original);assert.equal(normalize,env.levelPortraitCutout);events.push('male-canonical');return canonical},
  async replacementFaceIdentityBox(){throw Error('Original-AI must not crop or inspect skin before generation')},
  async saveAiJobFile(input){assert.equal(input,original);saved.push(input)},
  acceptedPaidTrial:false,walletHeaders:()=>({'x-wallet-id':'inert'}),analyticsTagError:error=>error,
  async portraitFetch(url,options){assert.equal(url,'/api/ai-jobs');assert.equal(options.method,'POST');calls.push(options.body);return {ok:true,json:async()=>({jobId:'submitted-job',downloadWorkId:'owned-work',trialPreview:true})}},
  warmPortraitResources:noop,writeActiveAiJob:noop,cancelledProcessError:cancelled,cancelPortraitJob:async()=>{throw Error('unexpected cancel')},settleProcessOperation:noop,
  async waitForAiJob(){const blob=new Blob(['completed'],{type:'image/png'});if(mode==='female'&&!state.legacyResult){markOriginalPortraitAiFinish(blob,style);if(style==='natural'&&!state.oldNatural)blob.idpromNaturalStudioSkinVersion=NATURAL_STUDIO_SKIN_VERSION;}return blob}
 };
 const submit=extract(main,'async function aiFinishPortraitUncached(','\n// V206:','aiFinishPortraitUncached',env);
 return {original,canonical,operation,calls,saved,events,state,env,submit,options:{portraitMode:mode,femaleEyeStyle:style,sourceJobId:'owned-previous-job',templatePath:'/assets/job-uniforms/female-job-navy-collared.png'}};
}
await test('actual new female multipart sends exact original bytes, no skin evidence and no pre-generation face crop',async()=>{
 for(const style of ['natural','makeup','korean-rosy-v1','soft-rosy-v1'])for(const hair of ['', 'seedream-19']){
  const f=submissionFixture('female',style);f.original.idpromStudioSourceReplacement=true;f.original.idpromDownloadWorkId='owned-existing-work';
  const result=await f.submit(f.original,hair,f.options),body=f.calls[0];
  assert.equal(await body.get('image').text(),await f.original.text());assert.equal(await body.get('originalSource').text(),await f.original.text());assert.equal(body.get('image').type,'image/jpeg');assert.equal(body.get('studioSkinVersion'),ORIGINAL_PORTRAIT_AI_VERSION);assert.equal(body.get('studioSkinEvidence'),null);assert.equal(body.get('faceIdentityBox'),null);assert.equal(body.get('femaleEyeStyle'),style);assert.equal(body.get('naturalFinishVersion'),style==='natural'?NATURAL_STUDIO_SKIN_VERSION:null);assert.equal(body.get('sourceJobId'),'owned-previous-job');assert.equal(body.get('downloadWorkId'),'owned-existing-work');assert.equal(body.get('hairId'),hair||'original');assert(hasOriginalPortraitAiFinish(result,style));assert.equal(f.original.idpromStudioSkinVersion,undefined);assert.equal(f.original.idpromCanonicalInput,f.canonical);assert.deepEqual(f.events,[]);
 }
});
await test('actual male multipart retains its previous canonical protocol',async()=>{
 const f=submissionFixture('male');await f.submit(f.original,'',f.options);const body=f.calls[0];assert.equal(await body.get('image').text(),await f.canonical.text());assert.equal(body.get('studioSkinVersion'),null);assert.equal(body.get('studioSkinEvidence'),null);assert.deepEqual(f.events,['male-canonical']);
});
await test('new female request rejects old or incomplete server completion without stamping the upload',async()=>{
 const f=submissionFixture('female','makeup');f.state.legacyResult=true;await assert.rejects(f.submit(f.original,'',f.options),/ระบบปรับผิวกำลังอัปเดต/);assert.equal(f.original.idpromStudioSkinVersion,undefined);
});
await test('cancellation while retaining original input stops before submission',async()=>{
 const f=submissionFixture(),gate=deferred();f.env.saveAiJobFile=()=>gate.promise;const pending=f.submit(f.original,'',f.options);await Promise.resolve();await Promise.resolve();f.operation.cancelled=true;gate.resolve();await assert.rejects(pending,{name:'AbortError'});assert.equal(f.calls.length,0);
});
await test('original-AI never substitutes old canonical pixels or retries a stale canonical409',async()=>{
 const f=submissionFixture();f.env.portraitFetch=async(_url,options)=>{f.calls.push(options.body);return {ok:false,status:409,headers:{get:()=> '1'}}};await assert.rejects(f.submit(f.original,'',f.options),/กรอบผิวไม่ตรง/);assert.equal(f.calls.length,1);assert.equal(f.operation.jobId,undefined);assert.equal(f.original.idpromCanonicalInput,f.canonical);
});
console.log(JSON.stringify({passed,scope:'Actual legacy completion, original-AI completion and multipart transport, exact raw bytes, source/cancellation and stale-result isolation. No provider, network, account or financial writes.'}));
