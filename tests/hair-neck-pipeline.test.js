import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {productionHair,selectedHairDesign} from '../hairstyle-catalog.js';
import {HAIR_REFERENCE_VERSION} from '../catalogue-hair-policy.js';
import {loadCatalogueHairGuide} from '../catalogue-hair-guide.js';
import {selectedHairBoundaryInstruction} from '../hair-neck-boundary.js';
import {compactHairIdentityCanvas,COMPACT_IDENTITY_CANVAS_INSTRUCTION} from '../compact-hair-identity-canvas.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';
import {SINGLE_PASS_PORTRAIT_VERSION} from '../single-pass-portrait-policy.js';
import {ENGLISH_TEMPLATE_BODY_FINISH_VERSION,ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION} from '../english-template-body-policy.js';

// Actual production preparation/matting/prompt paths; provider and background
// removal are inert local fixtures. No payment, account or live AI is called.
const root=new URL('..',import.meta.url).pathname;
const outfit='/assets/job-uniforms/female-job-ivory-bow-blouse.png';
const matte=await sharp({create:{width:128,height:176,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:105,height:157,channels:4,background:'#b88a75'}}).png().toBuffer(),top:12,left:12}]).png().toBuffer();
const input={buffer:matte,mimetype:'image/png'},hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function run({id,language='th',finish='natural',gender=productionHair(id)?.gender||'female',keepCurrentHair=false}={}){
 const fields={portraitMode:gender,femaleEyeStyle:finish,
  ...(id?{hairId:id,hairReferenceVersion:HAIR_REFERENCE_VERSION}:{}),
  ...(gender==='female'?{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION,singlePassPortraitVersion:SINGLE_PASS_PORTRAIT_VERSION}:{}),
  ...(language==='en'?{interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:gender==='female'?ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,neckOutfitReferencePath:outfit}:{}),
  ...(keepCurrentHair?{hairId:'original',keepCurrentHair:'1',preserveHairJobId:'owned-previous'}:{})};
 const fieldsBefore=structuredClone(fields),sourceBefore=hash(input.buffer),calls=[],stages=[];
 const result=await processProductionPortrait({input,fields,root,key:'isolated-hair-neck-fixture',currentHair:keepCurrentHair?matte:null,
  removeBackground:async()=>matte,onStage:async stage=>stages.push(stage),
  requestPortrait:async request=>{calls.push(request);return {png:matte}}});
 assert.equal(calls.length,1,'A boundary correction must stay within the selected generation');
 assert.deepEqual(fields,fieldsBefore,'Original selected finish/outfit/source options must not be rewritten');
 assert.equal(hash(input.buffer),sourceBefore,'Uploaded identity bytes must not be modified');
 assert(!stages.includes('makeup')&&!stages.includes('skin-prepare'),'No extra AI pass may be introduced');
 const selected=id?productionHair(id):null;
 const compactBoard=language==='th'&&selected&&['short','gathered'].includes(selectedHairDesign(selected)?.kind);
 const final=selectedHairBoundaryInstruction(selected,{portraitMode:gender,english:language==='en',keepCurrentHair,referenceBoard:language==='en'?selected?.interfaceLanguage==='en'&&!keepCurrentHair:Boolean(compactBoard)});
 assert(calls[0].prompt.endsWith(final),'Kind-specific exclusion must be the final provider authority');
 assert.equal(calls[0].prompt.split('FINAL SELECTED HAIR BOUNDARY AUTHORITY').length-1,1);
 assert(calls[0].prompt.indexOf('FINAL HAIR-ONLY NAPE / SIDE-NECK CLEANUP')<calls[0].prompt.lastIndexOf(final));
 const actual=await sharp(result).extract({left:60,top:70,width:1,height:1}).removeAlpha().raw().toBuffer();
 assert.deepEqual([...actual],[184,138,117],'Boundary policy must not mask/repaint fixture output skin pixels');
 return {request:calls[0],result,fields,final};
}

test('Thai compact female crown/short and male short cuts end with the hard exclusion and full negative-space board',async()=>{
 for(const [id,finishes] of [['seedream-41',['natural','makeup']],['seedream-01',['natural','makeup']],['seedream-36',['natural']]])for(const finish of finishes){
  const got=await run({id,finish});assert.match(got.final,/ZERO visible hair/);
  assert.match(got.final,/BELOW the lower edge of EITHER ear/);
  assert.match(got.final,/Sideburns and tapered scalp roots must stop ABOVE/);
  const metadata=await sharp(got.request.hair).metadata();assert.equal(metadata.width,1024);assert.equal(metadata.height,768);
  assert.match(got.final,/RIGHT is its actual picker photograph/);
  if(finish==='makeup')assert.match(got.request.prompt,/SELECTED MAKEUP — SAME-GENERATION INPUT CONTEXT/);
  else if(productionHair(id).gender==='female')assert.match(got.request.prompt,/NO ADDED MAKEUP/);
 }
});

test('English compact female gathered and male short cuts share the same final exclusion without extra provider calls',async()=>{
 for(const [id,finishes] of [['seedream-53',['natural','makeup']],['seedream-77',['natural']]])for(const finish of finishes){
  const got=await run({id,language:'en',finish});assert.match(got.final,/ZERO visible hair/);
  assert.equal(got.fields.neckOutfitReferencePath,outfit);assert(got.request.outfit?.length);
  const metadata=await sharp(got.request.hair).metadata();assert.equal(metadata.width,1024);assert.equal(metadata.height,768);
  assert.match(got.final,/two-panel reference board/);
  if(finish==='makeup')assert.match(got.request.prompt,/SELECTED MAKEUP — SAME-GENERATION INPUT CONTEXT/);
 }
});

test('long and bob selections retain genuine lengths and Thai long guide bytes stay exact',async()=>{
 for(const [id,language] of [['seedream-42','th'],['seedream-44','en'],['seedream-47','en']]){
  const got=await run({id,language});assert.doesNotMatch(got.final,/COMPACT UNDER-EAR \/ NECK EXCLUSION — HARD SPATIAL LIMIT/);
  assert.match(got.final,/continuous|connected/);
  if(language==='th')assert.deepEqual(got.request.hair,await loadCatalogueHairGuide(id,root));
  else assert.equal((await sharp(got.request.hair).metadata()).width,1024);
 }
});

test('English current hair and female AI Picks classify their actual source instead of silently converting long hair to short',async()=>{
 for(const options of [{language:'en',keepCurrentHair:true,gender:'female'},{language:'en',keepCurrentHair:true,gender:'male'},{language:'en',gender:'female'}]){
  const got=await run(options);assert.match(got.final,/REFERENCE-CONDITIONED CURRENT \/ AI-PICKS HAIR/);
  assert.match(got.final,/CONDITIONAL RULE, ONLY FOR AN ACTUALLY SHORT OR GATHERED REFERENCE/);
  assert.match(got.final,/END CONDITIONAL COMPACT RULE. For an actually long or bob reference, preserve/);
  assert.doesNotMatch(got.final,/SHORT SELECTED DESIGN:|GATHERED SELECTED DESIGN:/);
  assert(got.request.hair?.length,'Actual source/current hair evidence remains in the same reference slot');
 }
});

test('new default male and Thai gathered requests still receive compact exclusions without another reference or generation',async()=>{
 for(const options of [{gender:'male'},{gender:'female'},{gender:'male',language:'en'}]){
  const got=await run(options);assert.match(got.final,/ZERO visible hair/);
  assert.doesNotMatch(got.final,/REFERENCE-CONDITIONED CURRENT/);
  assert.equal(got.request.hair,null);
 }
 const source=await readFile(new URL('../production-portrait-pipeline.js',import.meta.url),'utf8');
 assert.equal((source.match(/prompt\+='\\n'\+selectedHairBoundaryInstruction\(/g)||[]).length,2,'Both actual generation routes must append the same policy');
});

test('selected Thai and English hair requests reject all source hair evidence with one provider call',async()=>{
 for(const [id,language,finish] of [['seedream-41','th','makeup'],['seedream-36','th','natural'],['seedream-53','en','makeup'],['seedream-77','en','natural'],['seedream-44','en','natural']]){
  const got=await run({id,language,finish});
  assert.ok(got.request.hair?.length);
  assert.match(got.request.prompt,/Treat EVERY visible hairstyle pixel in the upload, identity crop, original or previously generated portrait as obsolete hair evidence/);
  assert.match(got.final,/Remove the ENTIRE original hairstyle, even where it overlaps the chosen design/);
  assert.match(got.final,/not the person's face, ears, jaw or head geometry/);
  assert.equal(got.fields.femaleEyeStyle,finish);
 }
});

test('selected compact Thai and English outputs get the final neck gate in the actual AI request',async()=>{
 for(const [id,language,finish] of [['seedream-41','th','makeup'],['seedream-36','th','natural'],['seedream-53','en','makeup'],['seedream-77','en','natural']]){
  const got=await run({id,language,finish});
  assert.match(got.request.prompt,/OUTPUT GATE — CLEAN NECK FOR THIS EXACT COMPACT CUT/);
  assert.ok(got.request.prompt.endsWith(got.final));
 }
});

test('compact source conditioning excludes old hair below chin and keeps exact measured face pixels and source geometry',async()=>{
 const source=await sharp({create:{width:128,height:176,channels:3,background:'#151515'}}).composite([{input:await sharp({create:{width:64,height:90,channels:3,background:'#b88a75'}}).png().toBuffer(),left:32,top:20}]).png().toBuffer();
 const original={buffer:source,mimetype:'image/png'},box=[.25,20/176,.75,110/176],before=hash(source);
 const rgb=async(buffer,left,top)=>[...await sharp(buffer).extract({left,top,width:1,height:1}).removeAlpha().raw().toBuffer()];
 for(const id of ['seedream-41','seedream-36','seedream-53','seedream-77']){
  const chosen=productionHair(id),clean=await compactHairIdentityCanvas(original,box,chosen);
  assert.notEqual(clean,original);
  const meta=await sharp(clean.buffer).metadata();assert.equal(meta.width,128);assert.equal(meta.height,176);
  assert.deepEqual(await rgb(clean.buffer,64,55),await rgb(source,64,55));
  for(const [x,y] of [[64,145],[14,133],[112,133],[3,5]])assert.deepEqual(await rgb(clean.buffer,x,y),[53,107,216]);
 }
 assert.equal(hash(source),before,'Immutable original');
 for(const id of ['seedream-42','seedream-44','seedream-47'])assert.equal(await compactHairIdentityCanvas(original,box,productionHair(id)),original);
 assert.equal(await compactHairIdentityCanvas(original,null,productionHair('seedream-41')),original);
 assert.equal(await compactHairIdentityCanvas(original,box,productionHair('seedream-41'),{keepCurrentHair:true}),original);
 const calls=[];
 await processProductionPortrait({input:original,fields:{portraitMode:'male',femaleEyeStyle:'natural',hairId:'seedream-36',hairReferenceVersion:HAIR_REFERENCE_VERSION,faceIdentityBox:JSON.stringify(box)},root,key:'compact-source-fixture',requestPortrait:async req=>{calls.push(req);return {png:matte}},removeBackground:async()=>matte});
 assert.equal(calls.length,1);
 assert.ok(calls[0].prompt.includes(COMPACT_IDENTITY_CANVAS_INSTRUCTION));
 assert.deepEqual(await rgb(calls[0].portrait,64,145),[53,107,216]);
 assert.deepEqual(await rgb(calls[0].portrait,64,55),await rgb(source,64,55));
});
