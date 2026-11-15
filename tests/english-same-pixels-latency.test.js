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
 assert.match(pipeline,/await createAiMakeupVariant\(transparent,\{key,requestPortrait,preserveOutfit:!headOnly,englishReferenceFinish:!headOnly&&!templateBody,englishHeadFinish:headOnly,englishTemplateFinish:templateBody\}\)/);
 assert.match(pipeline,/const \[outfit,hair,autoFemaleHairSource,identity\]=await Promise\.all\(\[outfitTask,hairTask,autoHairTask,identityTask\]\)/);
 assert.match(app,/if\(!english\)void Promise\.allSettled/);
});
