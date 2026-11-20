import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {processProductionPortrait,portraitIdentityCrop} from '../production-portrait-pipeline.js';
import {createEnglishBodyLayout,ENGLISH_MALE_TEMPLATE_PROPORTION_PROFILE,ENGLISH_FEMALE_MATCHED_PROPORTION_PROFILE} from '../english-body-layout.js';
import {ENGLISH_TEMPLATE_BODY_FINISH_VERSION,ENGLISH_FEMALE_MATCHED_PROPORTION_VERSION,ENGLISH_TEMPLATE_BODY_SIZE} from '../english-template-body-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';

const root=new URL('..',import.meta.url).pathname,template='/assets/job-uniforms/female-job-ivory-bow-blouse.png';
const inputBytes=await sharp({create:{width:120,height:160,channels:4,background:'#ad7a65'}}).png().toBuffer();
const input={buffer:inputBytes,mimetype:'image/png'};
const natural=await sharp({create:{width:120,height:160,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:96,height:136,channels:4,background:'#ad7a65'}}).png().toBuffer(),left:12,top:14}]).png().toBuffer();
const fields=(gender,englishStudioFinishVersion)=>({
 interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',portraitMode:gender,
 englishStudioFinishVersion,neckOutfitReferencePath:template,
 faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),femaleEyeStyle:'natural',
 ...(gender==='female'?{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION}:{})
});

test('parallel English preparation retains identical male and female guide bytes, face crop and outfit',async()=>{
 const outfit=await sharp(await readFile(root+'public'+template)).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 const identity=await portraitIdentityCrop(input,[.2,.1,.8,.7]);
 const expected=await createEnglishBodyLayout(outfit,{headScale:ENGLISH_MALE_TEMPLATE_PROPORTION_PROFILE.identityHeadScale,profile:ENGLISH_MALE_TEMPLATE_PROPORTION_PROFILE,identity,canvasWidth:1824});
 assert.deepEqual(ENGLISH_MALE_TEMPLATE_PROPORTION_PROFILE,ENGLISH_FEMALE_MATCHED_PROPORTION_PROFILE);
 for(const [gender,version] of [['male',ENGLISH_TEMPLATE_BODY_FINISH_VERSION],['female',ENGLISH_FEMALE_MATCHED_PROPORTION_VERSION]]){
  const calls=[];
  await processProductionPortrait({input,fields:fields(gender,version),root,key:'test',removeBackground:async()=>natural,requestPortrait:async params=>{calls.push(params);return {png:natural}}});
  assert.equal(calls.length,1,'Without a finish pair request, never add an AI generation');
  assert.deepEqual(calls[0].portrait,expected,'Layout remains byte-identical');
  assert.deepEqual(calls[0].outfit,outfit,'Original outfit reference remains byte-identical');
  assert.equal(calls[0].outfitDetailReference,undefined,'Unversioned queued requests retain their old references');
  assert.equal(calls[0].identity,null,'Original face must stay inside the combined guide');
  assert.equal(calls[0].size,ENGLISH_TEMPLATE_BODY_SIZE);
 }
});

test('model warming moves to English photo selection, but all paid submits retain their awaited preflight',async()=>{
 const src=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const upload=src.indexOf('setHairId(null);setF(v);');
 const warm=src.indexOf('warmPortraitResources(v,null,{requiresSegmentation:false,english:true})',upload);
 const submit=src.indexOf('const info=alreadyOwned||await submitPortraitJob(');
 assert(upload>0&&warm>upload,'Model prewarm must be initiated only on a selected uploaded image');
 assert.match(src,/if\(!alreadyOwned\)await warmPortraitResources\(originalFile/,'The AI submission gate still checks vision model readiness before reserving credits');
 assert.match(src,/warmPortraitResources\(v,null,\{requiresSegmentation:false,english:true\}\)\.catch\(\(\)=>\{\}\)/,'Prewarm failures must be swallowed and safely retried at the existing paid preflight');
 assert(submit>0);
});

test('completed Natural and paired Makeup download concurrently with unchanged rights validation and one job ID',async()=>{
 const src=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const start=src.indexOf('async function waitForAiJob('),end=src.indexOf('\nlet landmarkerPromise',start);
 const code=src.slice(start,end);
 assert.match(code,/const \[original,verified,makeup\]=await Promise\.all\(\[/);
 assert.match(code,/readExistingAiJob\(jobId,'\/result','fetch_result','blob',operation\)/);
 assert.match(code,/retryExistingAiJobRead\(jobId,'verify_rights',\(\)=>verifyOutputRights\(jobId,operation\),operation\)/);
 assert.match(code,/j\.hasMakeupVariant\?readExistingAiJob\(jobId,'\/result\?finish=makeup','fetch_makeup','blob',operation\)/);
 assert.match(code,/if\(makeup\)natural\.idpromAiMakeupBlob=makeup\.blob/);
 assert.match(code,/if\(j\.status==='completed'/);
 assert.match(code,/if\(j\.status==='failed'/);
});

test('Thai processing, image dimensions and original Makeup generation instructions remain intact',async()=>{
 const app=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const pipeline=await readFile(new URL('../production-portrait-pipeline.js',import.meta.url),'utf8');
 assert.match(pipeline,/if\(usesEnglishStudioFinish\(fields\)\|\|isEnglishHeadPortrait\(fields\)\)return processEnglishStudioPortrait/);
 assert.match(pipeline,/const delivered=frontShield\?await shieldThaiNativeUniformFront\(transparent,nativeFrontGeometry,\{legacy:!usesThaiShoulderAwareShield\(fields\)\}\):transparent/);
  assert.match(pipeline,/await createAiMakeupVariant\(delivered,\{key,requestPortrait,preserveOutfit:!headOnly,englishReferenceFinish:!headOnly&&!templateBody,englishHeadFinish:headOnly,englishTemplateFinish:templateBody\}\)/,'English branch receives identical transparent pixels');
 assert.match(pipeline,/const \[outfit,hair,autoFemaleHairSource,identity\]=await Promise\.all\(\[outfitTask,hairTask,autoHairTask,identityTask\]\)/);
 assert.match(app,/if\(!english\)void Promise\.allSettled/);
});

test('new English outfit fidelity sends unchanged full outfit plus same-asset detail crops in one request',async()=>{
 const {ENGLISH_OUTFIT_FIDELITY_VERSION,createEnglishOutfitDetailReference}=await import('../english-outfit-fidelity.js');
 const {seedreamReviewPayload}=await import('../seedream-review-transport.js');
 const {SINGLE_PASS_PORTRAIT_VERSION}=await import('../single-pass-portrait-policy.js');
 const {FEMALE_SINGLE_FINISH_VERSION}=await import('../female-single-finish-policy.js');
 const original=await sharp(await readFile(root+'public'+template)).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 const expected=await createEnglishOutfitDetailReference(await readFile(root+'public'+template));
 for(const [gender,finish] of [['female','natural'],['male','natural'],['female','makeup']]){
  const calls=[];
  await processProductionPortrait({input,fields:{...fields(gender,ENGLISH_TEMPLATE_BODY_FINISH_VERSION),femaleEyeStyle:finish,...(finish==='makeup'?{singlePassPortraitVersion:SINGLE_PASS_PORTRAIT_VERSION,femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION}:{}),englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION},root,key:'test',removeBackground:async()=>natural,requestPortrait:async params=>{calls.push(params);return {png:natural}}});
  assert.equal(calls.length,1);
  const call=calls[0];
  assert.deepEqual(call.outfit,original,'Never replace or recolour the full selected outfit');
  assert.deepEqual(call.outfitDetailReference,expected,'Details come from that selected asset');
  const payload=seedreamReviewPayload(call);
  assert.equal(payload.image.at(-1),'data:image/png;base64,'+expected.toString('base64'));
  assert.match(call.prompt,new RegExp('Image '+payload.image.length+' contains two crops'));
  assert.match(call.prompt,/actual hue, saturation, lightness, fabric weave/);
  assert.match(call.prompt,/button count and spacing/);
  assert.match(call.prompt,/adapt face\/neck lighting to the outfit rather than relighting/);
  assert.match(call.prompt,/Hair, skin-light and Makeup references supply NO garment colours/);
  assert.equal(call.size,ENGLISH_TEMPLATE_BODY_SIZE);
 }
});

test('detail reference retains original material colour without enhancement and rejects empty assets',async()=>{
 const {createEnglishOutfitDetailReference}=await import('../english-outfit-fidelity.js');
 const asset=await sharp({create:{width:80,height:120,channels:4,background:{r:24,g:48,b:89,alpha:1}}}).png().toBuffer();
 const {data,info}=await sharp(await createEnglishOutfitDetailReference(asset)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,1536);assert.equal(info.height,768);
 let opaque=0;
 for(let i=0;i<data.length;i+=4)if(data[i+3]===255){assert.deepEqual([...data.subarray(i,i+3)],[24,48,89]);opaque++}
 assert(opaque>0);
 const empty=await sharp({create:{width:8,height:8,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
 await assert.rejects(createEnglishOutfitDetailReference(empty),/empty/);
});

test('English women can generate the single selected civil-service outfit from its actual template',async()=>{
 const {ENGLISH_CIVIL_SERVICE_OUTFIT:o}=await import('../english-civil-service-outfit.js');
 const {isEnglishBodyOutfitPath}=await import('../english-body-portrait.js');
 const {ENGLISH_OUTFIT_FIDELITY_VERSION}=await import('../english-outfit-fidelity-version.js');
 assert.equal(isEnglishBodyOutfitPath(o.template),true);
 assert.equal(isEnglishBodyOutfitPath('/assets/government-uniforms/female-academic.png'),false,'Only one government outfit is added');
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.match(main,/if\(englishPreviewEnabled\(\)\)JOB_UNIFORMS\.push\(ENGLISH_CIVIL_SERVICE_OUTFIT\)/,'Thai catalogue remains unchanged');
 const calls=[];
 await processProductionPortrait({input,fields:{...fields('female',ENGLISH_TEMPLATE_BODY_FINISH_VERSION),neckOutfitReferencePath:o.template,englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION},root,key:'test',removeBackground:async()=>natural,requestPortrait:async p=>{calls.push(p);return {png:natural}}});
 assert.equal(calls.length,1);
 const expected=await sharp(await readFile(root+'public'+o.template)).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 assert.deepEqual(calls[0].outfit,expected);
 assert(calls[0].outfitDetailReference?.length);
 assert.match(calls[0].prompt,/Preserve visible insignia, ribbons and badges/);
});

test('new English civil-service white-fabric correction is scoped and follows competing colour locks',async()=>{
 const {ENGLISH_CIVIL_SERVICE_TEMPLATE,ENGLISH_CIVIL_SERVICE_FABRIC_VERSION,ENGLISH_CIVIL_SERVICE_FABRIC_POLICY}=await import('../english-civil-service-outfit.js');
 const {ENGLISH_OUTFIT_FIDELITY_VERSION}=await import('../english-outfit-fidelity-version.js');
 const {SINGLE_PASS_PORTRAIT_VERSION}=await import('../single-pass-portrait-policy.js');
 const {FEMALE_SINGLE_FINISH_VERSION}=await import('../female-single-finish-policy.js');
 for(const [templatePath,version,finish,expected] of [
  [ENGLISH_CIVIL_SERVICE_TEMPLATE,ENGLISH_CIVIL_SERVICE_FABRIC_VERSION,'natural',true],
  [ENGLISH_CIVIL_SERVICE_TEMPLATE,ENGLISH_CIVIL_SERVICE_FABRIC_VERSION,'makeup',true],
  [ENGLISH_CIVIL_SERVICE_TEMPLATE,undefined,'natural',false],
  [template,ENGLISH_CIVIL_SERVICE_FABRIC_VERSION,'natural',false]
 ]){
  const calls=[];
  await processProductionPortrait({input,fields:{...fields('female',ENGLISH_TEMPLATE_BODY_FINISH_VERSION),neckOutfitReferencePath:templatePath,englishCivilServiceFabricVersion:version,englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,femaleEyeStyle:finish,...(finish==='makeup'?{singlePassPortraitVersion:SINGLE_PASS_PORTRAIT_VERSION,femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION}:{})},root,key:'test',removeBackground:async()=>natural,requestPortrait:async p=>{calls.push(p);return {png:natural}}});
  assert.equal(calls.length,1);
  assert.equal(calls[0].prompt.endsWith(ENGLISH_CIVIL_SERVICE_FABRIC_POLICY),expected);
  if(expected){
   assert.match(calls[0].prompt,/overrides earlier exact source-hue/);
   assert.match(calls[0].prompt,/clean neutral white fabric/);
   assert.match(calls[0].prompt,/realistic fine woven textile texture/);
   assert.match(calls[0].prompt,/Do not desaturate or whiten the insignia, buttons or tie/);
  }
 }
});
