import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {STUDIO_SKIN_WORKFLOW_VERSION,parseStudioSkinEvidence} from '../studio-skin-treatment.js';
import {studioSkinWorkflowMetadata,hasCurrentStudioSkin} from '../studio-skin-metadata.js';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
import {captureStudioSkinEvidence} from '../src/studio-skin-evidence.js';
import {PRODUCTION_HAIR_CATALOG} from '../hairstyle-catalog.js';
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
 const env={STUDIO_SKIN_WORKFLOW_VERSION,portraitFinishChoice,activeProcessOperation:operation,assertProcessActive:assertActive,walletHeaders:()=>({'x-wallet-id':'inert'}),analyticsTagError:error=>error,portraitJobError:value=>Error(value),
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
function submissionFixture(mode='female',style='natural'){
 const original=new File(['immutable upload bytes'],'original.jpg',{type:'image/jpeg'}),canonical=new File(['immutable canonical bytes'],'canonical.png',{type:'image/png'}),operation={cancelled:false},calls=[],saved=[],events=[];
 original.idpromPortraitMode=mode;
 const image={naturalWidth:900,naturalHeight:1200},landmarks=Array.from({length:478},(_,i)=>({x:.25+(i%20)*.025,y:.15+Math.floor(i/20)*.025}));
 const state={legacyResult:false},env={activeProcessOperation:operation,activeSavedDownloadWork:null,STUDIO_SKIN_WORKFLOW_VERSION,PRODUCTION_HAIR_CATALOG,portraitFinishChoice,hasCurrentStudioSkin,assertProcessActive:assertActive,FormData,
  submitPortraitJob:async(_operation,submit)=>submit(),levelPortraitCutout:noop,
  async canonicalPortraitInput(input,{normalize}){assert.equal(input,original);assert.equal(normalize,env.levelPortraitCutout);return canonical},
  captureStudioSkinEvidence,
  async decodedPortraitImage(input){assert.equal(input,canonical);events.push('decode-canonical');return image},
  async getLandmarker(){return {detect(input){assert.equal(input,image);return {faceLandmarks:[landmarks]}}}},
  async getPersonSegmenter(){return {segment(input,callback){assert.equal(input,image);callback({categoryMask:{width:16,height:16,getAsUint8Array:()=>new Uint8Array(256).fill(3),close(){events.push('close-mask')}}})}}},
  async replacementFaceIdentityBox(input){assert.equal(input,canonical);return [.1,.1,.9,.9]},
  async saveAiJobFile(input){assert.equal(input,original);saved.push(input)},
  acceptedPaidTrial:false,walletHeaders:()=>({'x-wallet-id':'inert'}),analyticsTagError:error=>error,
  async portraitFetch(url,options){assert.equal(url,'/api/ai-jobs');assert.equal(options.method,'POST');calls.push(options.body);return {ok:true,json:async()=>({jobId:'submitted-job',downloadWorkId:'owned-work',trialPreview:true})}},
  warmPortraitResources:noop,writeActiveAiJob:noop,cancelledProcessError:cancelled,cancelPortraitJob:async()=>{throw Error('unexpected cancel')},settleProcessOperation:noop,
  async waitForAiJob(){const blob=new Blob(['completed'],{type:'image/png'});if(mode==='female'&&!state.legacyResult)blob.idpromStudioSkinVersion=STUDIO_SKIN_WORKFLOW_VERSION;return blob}
 };
 const submit=extract(main,'async function aiFinishPortraitUncached(','\n// V206:','aiFinishPortraitUncached',env);
 return {original,canonical,operation,calls,saved,events,state,env,submit,options:{portraitMode:mode,femaleEyeStyle:style,sourceJobId:'owned-previous-job',templatePath:'/assets/job-uniforms/female-job-navy-collared.png'}};
}
await test('actual female multipart measures the canonical frame while preserving both submitted images',async()=>{
 for(const style of ['natural','korean-rosy-v1','makeup','soft-rosy-v1']){
  const f=submissionFixture('female',style),result=await f.submit(f.original,'',f.options),body=f.calls[0];
  assert.equal(f.calls.length,1);assert.equal(await body.get('image').text(),await f.canonical.text());assert.equal(await body.get('originalSource').text(),await f.original.text());assert.equal(body.get('sourceJobId'),'owned-previous-job');assert.equal(body.get('studioSkinVersion'),STUDIO_SKIN_WORKFLOW_VERSION);
  const evidence=JSON.parse(body.get('studioSkinEvidence'));assert(Array.isArray(evidence.labels));assert.doesNotThrow(()=>parseStudioSkinEvidence(evidence));assert.equal(evidence.width,900);assert.equal(evidence.height,1200);assert.deepEqual(f.events,['decode-canonical','close-mask']);assert(hasCurrentStudioSkin(result,'natural'));assert.equal(result.idpromStudioCosmeticsVersion,undefined);assert.equal(f.saved[0],f.original);assert.equal(f.original.idpromStudioSkinVersion,undefined);assert.equal(f.canonical.idpromStudioSkinVersion,undefined);
 }
});
await test('actual male multipart keeps its existing protocol and never requests skin evidence',async()=>{
 const f=submissionFixture('male','natural');await f.submit(f.original,'',f.options);const body=f.calls[0];assert.equal(body.get('studioSkinVersion'),null);assert.equal(body.get('studioSkinEvidence'),null);assert.deepEqual(f.events,[]);assert.equal(await body.get('originalSource').text(),'immutable upload bytes');
});
await test('a new female request cannot accept an unversioned server result into the staged cache',async()=>{
 const f=submissionFixture('female','natural');f.state.legacyResult=true;await assert.rejects(f.submit(f.original,'',f.options),/ระบบปรับผิวกำลังอัปเดต/);assert.equal(f.original.idpromStudioSkinVersion,undefined);
});
await test('getter-only cancellation during canonical evidence preparation stops before job submission',async()=>{
 const f=submissionFixture(),gate=deferred();f.env.decodedPortraitImage=()=>gate.promise;
 const pending=f.submit(f.original,'',f.options);await Promise.resolve();await Promise.resolve();f.operation.cancelled=true;await assert.rejects(pending,{name:'AbortError'});gate.resolve({naturalWidth:900,naturalHeight:1200});assert.equal(f.calls.length,0);assert.equal(f.saved.length,0);
});
await test('canonical409 recovery remeasures the exact frozen input inside one submit transaction',async()=>{
 const f=submissionFixture('female','makeup'),frozen=new Blob(['owned frozen canonical input'],{type:'image/png'}),inputs=[],faceInputs=[],writes=[];let submissions=0,accepted=0;
 f.original.idpromDownloadWorkId='owned-existing-work';f.original.idpromCanonicalInput=f.canonical;
 f.env.submitPortraitJob=async(operation,submit)=>{assert.equal(operation,f.operation);submissions++;return await submit()};
 f.env.decodedPortraitImage=async input=>{inputs.push(input);assert(input===f.canonical||input===frozen);return {naturalWidth:input===f.canonical?900:560,naturalHeight:input===f.canonical?1200:637}};
 const landmarks=Array.from({length:478},(_,i)=>({x:.25+(i%20)*.025,y:.15+Math.floor(i/20)*.025}));
 f.env.getLandmarker=async()=>({detect:()=>({faceLandmarks:[landmarks]})});
 f.env.getPersonSegmenter=async()=>({segment(_image,callback){callback({categoryMask:{width:16,height:16,getAsUint8Array:()=>new Uint8Array(256).fill(3),close(){}}})}});
 f.env.replacementFaceIdentityBox=async input=>{faceInputs.push(input);return input===f.canonical?[.1,.1,.9,.9]:[.2,.2,.8,.8]};
 f.env.writeActiveAiJob=job=>writes.push(job);
 f.env.portraitFetch=async(url,options)=>{
  assert.equal(url,'/api/ai-jobs');f.calls.push(options.body);assert.equal(f.operation.jobId,undefined);assert.equal(f.original.idpromCanonicalInput,f.canonical);
  if(f.calls.length===1)return {ok:false,status:409,headers:{get:name=>name==='X-IDPROM-Canonical-Input'?'1':null},blob:async()=>frozen};
  assert.equal(f.calls.length,2);accepted++;return {ok:true,status:202,json:async()=>({jobId:'accepted-once',downloadWorkId:'owned-existing-work',trialPreview:true})};
 };
 const result=await f.submit(f.original,'',f.options);assert(hasCurrentStudioSkin(result,'natural'));assert.equal(result.idpromStudioCosmeticsVersion,undefined);assert.equal(submissions,1);assert.equal(accepted,1);assert.equal(writes.length,1);assert.equal(writes[0].jobId,'accepted-once');assert.deepEqual(inputs,[f.canonical,frozen]);assert.deepEqual(faceInputs,[f.canonical,frozen]);
 assert.equal(f.original.idpromCanonicalInput,frozen);assert.equal(f.original.idpromDownloadWorkId,'owned-existing-work');assert.equal(f.operation.jobId,'accepted-once');assert.equal(await f.original.text(),'immutable upload bytes');
 for(let i=0;i<2;i++){
  const body=f.calls[i];assert.equal(body.get('downloadWorkId'),'owned-existing-work');assert.equal(body.get('sourceJobId'),'owned-previous-job');assert.equal(await body.get('originalSource').text(),'immutable upload bytes');
  assert.equal(await body.get('image').text(),i===0?await f.canonical.text():await frozen.text());const evidence=JSON.parse(body.get('studioSkinEvidence'));assert.deepEqual([evidence.width,evidence.height],i===0?[900,1200]:[560,637]);assert.deepEqual(JSON.parse(body.get('faceIdentityBox')),i===0?[.1,.1,.9,.9]:[.2,.2,.8,.8]);
 }
});
await test('canonical recovery rejects invalid content, cancellation and a second409 without accepting a job',async()=>{
 const invalid=[new Blob(['bad'],{type:'application/octet-stream'}),new Blob([],{type:'image/png'}),new Blob([new Uint8Array(20*1024*1024+1)],{type:'image/png'})];
 for(const scenario of [...invalid.map(blob=>({blob})),{second:true},{cancel:true},{missingHeader:true}]){
  const f=submissionFixture(),frozen=scenario.blob||new Blob(['frozen'],{type:'image/png'});let submissions=0,activeWrites=0;
  f.original.idpromDownloadWorkId='owned-existing-work';f.original.idpromCanonicalInput=f.canonical;
  f.env.submitPortraitJob=async(_operation,submit)=>{submissions++;return await submit()};
  // The second409 case needs a usable frozen frame, while all other cases stop
  // before a second measurement or queue request can occur.
  f.env.decodedPortraitImage=async()=>({naturalWidth:900,naturalHeight:1200});
  f.env.getLandmarker=async()=>({detect:()=>({faceLandmarks:[Array.from({length:478},(_,i)=>({x:.25+(i%20)*.025,y:.15+Math.floor(i/20)*.025}))]})});
  f.env.getPersonSegmenter=async()=>({segment(_image,callback){callback({categoryMask:{width:16,height:16,getAsUint8Array:()=>new Uint8Array(256).fill(3),close(){}}})}});
  f.env.writeActiveAiJob=()=>activeWrites++;
  f.env.portraitFetch=async(_url,options)=>{
   f.calls.push(options.body);assert(f.calls.length<=2);return {ok:false,status:409,headers:{get:name=>!scenario.missingHeader&&name==='X-IDPROM-Canonical-Input'?'1':null},blob:async()=>{if(scenario.cancel)f.operation.cancelled=true;return frozen},text:async()=> 'canonical recovery unavailable'};
  };
  await assert.rejects(f.submit(f.original,'',f.options),scenario.cancel?{name:'AbortError'}:undefined);assert.equal(submissions,1);assert.equal(f.calls.length,scenario.second?2:1);assert.equal(activeWrites,0);assert.equal(f.operation.jobId,undefined);assert.equal(f.original.idpromCanonicalInput,f.canonical);assert.equal(f.original.idpromDownloadWorkId,'owned-existing-work');assert.equal(await f.original.text(),'immutable upload bytes');
 }
});

console.log(JSON.stringify({passed,scope:'Actual App bare-base completion and multipart handlers, versioned restore metadata and bounded canonical-input recovery protocol. No providers, network, account or financial writes.'}));
