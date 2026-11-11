import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {ENGLISH_TEMPLATE_BODY_FINISH_VERSION,ENGLISH_TEMPLATE_BODY_FRAMING_VERSION,isEnglishTemplateBodyFinish,isEnglishTemplateBody} from '../english-template-body-policy.js';
import {ENGLISH_BODY_PORTRAIT_VERSION,ENGLISH_BODY_FRAMING_VERSION} from '../english-body-portrait.js';
import {ENGLISH_HEAD_PORTRAIT_VERSION,ENGLISH_HEAD_FINISH_VERSION,ENGLISH_HEAD_PLACEMENT_VERSION} from '../english-head-portrait.js';
import {ENGLISH_STUDIO_FINISH_VERSION} from '../english-studio-finish-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION,isOriginalPortraitAiRequest} from '../original-portrait-ai.js';
import {NATURAL_STUDIO_SKIN_VERSION} from '../natural-studio-skin.js';
import {AI_MAKEUP_PAIR_VERSION} from '../ai-makeup-pair-policy.js';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
import {finishSharedStudioSkin,sharedStudioSkinSource} from '../src/shared-studio-skin.js';
const raw=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const natural=await sharp({create:{width:96,height:128,channels:4,background:{r:138,g:101,b:87,alpha:.8}}}).png().toBuffer();
const makeup=await sharp(natural).tint('#d6a3aa').png().toBuffer();
const dataUrl=async blob=>'data:image/png;base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');
const forbidden=()=>{throw Error('A complete English AI portrait must not be resized, warped, repainted or regenerated');};

test('the actual English completion path retains both native PNGs without automatic head/neck correction',async()=>{
 const start=raw.indexOf('async function aiFinishPortrait('),end=raw.indexOf('\nlet acceptedPaidTrial=',start);
 for(const gender of ['female','male'])for(const finish of gender==='female'?['natural','makeup']:['natural']){
  let submitted=0,completed=0;const operation={},source=new File([natural],'source.png',{type:'image/png'});
  const returned=Object.assign(new Blob([natural],{type:'image/png'}),{idpromPortraitComposition:ENGLISH_BODY_PORTRAIT_VERSION,idpromEnglishStudioFinishVersion:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,idpromJobId:'owned-job',...(gender==='female'?{idpromStudioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,idpromAiMakeupBlob:new Blob([makeup],{type:'image/png'})}:{})});
  const face={152:{x:.5,y:.65},234:{x:.28,y:.4},454:{x:.72,y:.4}};
  const env={ENGLISH_TEMPLATE_BODY_FINISH_VERSION,ENGLISH_TEMPLATE_BODY_FRAMING_VERSION,isEnglishTemplateBodyFinish,ENGLISH_BODY_PORTRAIT_VERSION,ENGLISH_BODY_FRAMING_VERSION,ENGLISH_HEAD_PORTRAIT_VERSION,ENGLISH_HEAD_FINISH_VERSION,ENGLISH_HEAD_PLACEMENT_VERSION,ENGLISH_STUDIO_FINISH_VERSION,ORIGINAL_PORTRAIT_AI_VERSION,NATURAL_STUDIO_SKIN_VERSION,AI_MAKEUP_PAIR_VERSION,STUDIO_SKIN_WORKFLOW_VERSION:'unused-legacy',THAI_NECK_BACKING_VERSION:'unused-thai',HAIR_DESIGN_VERSION:'fixture',PRODUCTION_HAIR_CATALOG:[],activeProcessOperation:operation,assertProcessActive(){},englishPreviewEnabled:()=>true,portraitFinishChoice,currentResultCacheScope:()=> 'owner',resultSourceDigest:async()=> 'source',uploadGenerationScope:()=> 'upload',portraitResultCache:{get:async(_key,run)=>({value:await run(),reused:false}),delete(){}},aiFinishPortraitUncached:async()=>{submitted++;return returned;},balanceEnglishPortrait:forbidden,cleanEnglishHeadPair:forbidden,cleanPortraitClothing:forbidden,checkPortraitProportions:forbidden,canvasFor:forbidden,canvasPng:forbidden,prepareStudioMakeup:forbidden,prepareSharedPortraitMakeup:forbidden,finishFemaleMakeupSoftFocusBlob:forbidden,blobDataURL:dataUrl,decodedPortraitImage:async()=>({naturalWidth:96,naturalHeight:128}),portraitFaceLandmarks:async()=>face,isOriginalPortraitAiRequest,finishSharedStudioSkin,sharedStudioSkinSource,portraitGeometryBases:new WeakMap(),checkPortraitCompletion:async()=>{completed++;},window:{dispatchEvent(){}},CustomEvent:class{}};
  const finishPortrait=Function('env',`with(env){${raw.slice(start,end)};return aiFinishPortrait}`)(env);
  const output=await finishPortrait(source,'',{portraitMode:gender,femaleEyeStyle:finish,templatePath:'/assets/job-uniforms/fixture.png'});
  assert.equal(submitted,1);assert.equal(completed,1);assert.equal(output.idpromEnglishFramingVersion,ENGLISH_TEMPLATE_BODY_FRAMING_VERSION);
  assert.equal(output.idpromEnglishHeadBalanceVersion,undefined);
  assert.deepEqual(Buffer.from(await output.arrayBuffer()),gender==='female'&&finish==='makeup'?makeup:natural);
  if(gender==='female'){
   assert.equal(output.idpromStudioSkinBaseSource,await dataUrl(new Blob([natural])));
   assert.equal(output.idpromAiMakeupSource,await dataUrl(new Blob([makeup])));
  }
 }
});

test('Studio receives the native complete AI PNG as its source with one uniform scene placement',async()=>{
 const start=raw.indexOf('async function renderAdjustedFinal('),end=raw.indexOf('\n // V80 MASTER',start);
 const body=raw.slice(start,end)+'\n}';
 const env={ENGLISH_BODY_PORTRAIT_VERSION,ENGLISH_HEAD_PORTRAIT_VERSION,decodedPortraitImage:async()=>({naturalWidth:96,naturalHeight:128}),canvasFor:forbidden,blobDataURL:dataUrl,naturalStudioSkinMetadata:()=>({}),studioSkinWorkflowMetadata:()=>({})};
 const render=Function('env',`with(env){${body};return renderAdjustedFinal}`)(env);
 for(const bytes of [natural,makeup]){
  const blob=Object.assign(new Blob([bytes],{type:'image/png'}),{idpromPortraitComposition:ENGLISH_BODY_PORTRAIT_VERSION,idpromEnglishStudioFinishVersion:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,idpromEnglishFramingVersion:ENGLISH_TEMPLATE_BODY_FRAMING_VERSION}),layers=[];
  await render(blob,{hX:0,hY:0,scale:900/96,templatePath:'/selected.png'},{scale:1},...Array(12).fill(undefined),layers);
  assert.equal(layers.length,1);assert.equal(layers[0].source,await dataUrl(blob));
  assert.deepEqual(layers[0].sourceFrame,{x:0,y:0,w:900,h:1200});
  assert.equal(layers[0].generatedOutfitTemplate,'/selected.png');
 }
});

test('new English completion is versioned separately; queued v3 and Thai keep their protocol boundaries',()=>{
 assert.equal(ENGLISH_TEMPLATE_BODY_FINISH_VERSION,'en-complete-ai-pair-v4');
 assert(isEnglishTemplateBody({interfaceLanguage:'en',portraitComposition:ENGLISH_BODY_PORTRAIT_VERSION,englishStudioFinishVersion:'en-template-locked-body-v3'}));
 assert(!isEnglishTemplateBody({interfaceLanguage:'th',portraitComposition:ENGLISH_BODY_PORTRAIT_VERSION,englishStudioFinishVersion:ENGLISH_TEMPLATE_BODY_FINISH_VERSION}));
});
