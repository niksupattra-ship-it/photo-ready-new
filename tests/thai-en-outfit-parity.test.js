import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {THAI_OUTFIT_AI_VERSION,THAI_OUTFIT_PARITY_VERSION} from '../thai-outfit-ai-policy.js';
import {englishTemplateBodyFinishForGender,ENGLISH_TEMPLATE_BODY_FRAMING_VERSION} from '../english-template-body-policy.js';
import {ENGLISH_OUTFIT_FIDELITY_VERSION} from '../english-outfit-fidelity-version.js';
import {ENGLISH_CIVIL_SERVICE_TEMPLATE,ENGLISH_CIVIL_SERVICE_FABRIC_VERSION} from '../english-civil-service-outfit.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {NATURAL_STUDIO_SKIN_VERSION} from '../natural-studio-skin.js';
import {SINGLE_PASS_PORTRAIT_VERSION} from '../single-pass-portrait-policy.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
import {HAIR_REFERENCE_VERSION} from '../catalogue-hair-policy.js';
const root=new URL('..',import.meta.url).pathname;
const input={buffer:await sharp({create:{width:96,height:128,channels:4,background:'#b99278'}}).png().toBuffer(),mimetype:'image/png'};
const output=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:64,height:96,channels:4,background:'#b99278'}}).png().toBuffer(),left:16,top:16}]).png().toBuffer();
const template='/assets/job-uniforms/female-job-ivory-bow-blouse.png';
const common=(gender,finish)=>({portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:englishTemplateBodyFinishForGender(gender),portraitMode:gender,hairId:'original',femaleEyeStyle:finish,neckOutfitReferencePath:template,faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,...(gender==='female'?{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION,singlePassPortraitVersion:SINGLE_PASS_PORTRAIT_VERSION}:{})});
async function capture(fields,currentHair=null){
 const calls=[];await processProductionPortrait({input,fields,currentHair,root,key:'inert',removeBackground:async()=>output,requestPortrait:async p=>{calls.push(p);return {png:output}}});assert.equal(calls.length,1);return calls[0];
}
test('new Thai requests match English head/body guides, prompts and reference bytes for actual hair/finish combinations',async()=>{
 for(const [gender,finish] of [['female','natural'],['female','makeup'],['male','natural']])for(const kind of ['auto','selected','keep-upload','keep-completed']){
  const context=common(gender,finish);
  if(kind==='selected')Object.assign(context,{hairId:gender==='female'?'seedream-14':'seedream-36',hairReferenceVersion:HAIR_REFERENCE_VERSION});
  if(kind.startsWith('keep'))context.keepCurrentHair='1';
  const current=kind==='keep-completed'?output:null;
  const en=await capture({...context,interfaceLanguage:'en'},current);
  const th=await capture({...context,interfaceLanguage:'th',thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiOutfitParityVersion:THAI_OUTFIT_PARITY_VERSION},current);
  for(const key of ['prompt','size','portraitMime','portrait','identity','hair','outfit','compositionReference','hairPlacementReference','makeupStudioReference','outfitDetailReference'])assert.deepEqual(th[key],en[key],`${gender}/${finish}/${kind}: ${key}`);
 }
});
test('unversioned queued Thai keep-upload jobs retain their prior extra hair reference',async()=>{
 const fields={...common('female','natural'),interfaceLanguage:'th',thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,keepCurrentHair:'1'};
 const old=await capture(fields),fresh=await capture({...fields,thaiOutfitParityVersion:THAI_OUTFIT_PARITY_VERSION});
 assert(old.hair?.length);assert.equal(fresh.hair,null);
});

test('the real browser submit builder sends matching generation fields and upload bytes while Thai billing locale stays Thai',async()=>{
 const source=await readFile(root+'src/main.jsx','utf8');
 const start=source.indexOf('async function aiFinishPortraitUncached('),end=source.indexOf('\n// V206:',start);
 for(const gender of ['female','male'])for(const kind of ['selected','keep-upload']){
  const captures=[],providerRequests=[];
  for(const english of [true,false]){
   const file=new File([input.buffer],'original.png',{type:'image/png'}),hairId=kind==='selected'?(gender==='female'?'seedream-14':'seedream-36'):'',warm=[];
   const options={portraitMode:gender,femaleEyeStyle:'natural',templatePath:template,thaiOutfitAi:!english,keepCurrentHair:kind==='keep-upload',requiresSegmentation:false};
   const marker=Error('INERT_SUBMIT_BOUNDARY');let form;
   const env={THAI_OUTFIT_AI_VERSION,THAI_OUTFIT_PARITY_VERSION,ENGLISH_OUTFIT_FIDELITY_VERSION,ENGLISH_CIVIL_SERVICE_TEMPLATE,ENGLISH_CIVIL_SERVICE_FABRIC_VERSION,ENGLISH_TEMPLATE_BODY_FRAMING_VERSION,SINGLE_PASS_PORTRAIT_VERSION,SINGLE_PASS_SKIN_QUALITY_VERSION:'quality',FEMALE_SINGLE_FINISH_VERSION,ORIGINAL_PORTRAIT_AI_VERSION,NATURAL_STUDIO_SKIN_VERSION,HAIR_REFERENCE_VERSION,THAI_NECK_BACKING_VERSION:'legacy-neck',ENGLISH_BODY_PORTRAIT_VERSION:'en-outfit-body-v1',englishTemplateBodyFinishForGender,portraitFinishChoice,englishPreviewEnabled:()=>english,activeProcessOperation:{headers:{}},assertProcessActive(){},resultSourceDigest:async()=> 'source',walletScope:()=> 'owner',authToken:()=> 'inert',currentWalletId:()=> 'fixture',readActiveAiJob:()=>null,pendingPortraitSubmission:null,crypto:webcrypto,warmPortraitResources:async(_source,_template,flags)=>warm.push(flags),PRODUCTION_HAIR_CATALOG:hairId?[{id:hairId,gender}]:[],submitPortraitJob:async(_op,run)=>run(),activeSavedDownloadWork:false,canonicalPortraitInput:async f=>f,levelPortraitCutout(){throw Error('No Thai-only normalization')},FormData,File,replacementFaceIdentityBox:async()=>[.2,.1,.8,.7],measureEnglishHairPlacement:async()=>null,acceptedPaidTrial:false,walletHeaders:()=>({}),portraitFetch(){throw Error('No network')},submitPortraitTransfer:async(_fetch,fd)=>{form=fd;throw marker},submitPortraitWithRecovery:async transfer=>transfer()};
   const submit=Function('env','with(env){'+source.slice(start,end)+';return aiFinishPortraitUncached}')(env);
   await assert.rejects(submit(file,hairId,options),error=>error===marker);
   assert.equal(warm.length,1);assert.equal(warm[0].english,true);assert.equal(warm[0].requiresSegmentation,false);
   assert(form);const fields=Object.fromEntries([...form.entries()].filter(([,v])=>typeof v==='string'&&v!==''));
   providerRequests.push(await capture({...fields}));
   delete fields.submissionId;delete fields.interfaceLanguage;delete fields.thaiOutfitAiVersion;delete fields.thaiOutfitParityVersion;
   captures.push({fields,image:Buffer.from(await form.get('image').arrayBuffer())});
   assert.equal(form.get('interfaceLanguage'),english?'en':'th');
   assert.equal(form.get('thaiOutfitParityVersion'),english?null:THAI_OUTFIT_PARITY_VERSION);
  }
  assert.deepEqual(captures[0],captures[1],gender+'/'+kind);
  for(const key of ['portrait','prompt','size','hair','outfit'])assert.deepEqual(providerRequests[0][key],providerRequests[1][key],gender+'/'+kind+'/'+key);
 }
});

test('explicit Thai Create reuses only a result carrying the server-confirmed parity version',async()=>{
 const source=await readFile(root+'src/studio-editor.jsx','utf8');
 const start=source.indexOf(' const createEnglishPortrait=async('),end=source.indexOf('  const oldSuit=',start);
 assert(start>=0&&end>start);
 for(const [english,version,reused] of [[true,undefined,true],[false,undefined,false],[false,THAI_OUTFIT_PARITY_VERSION,true]]){
  let hydrations=0;
  const head={id:'head',kind:'head',portraitComposition:'en-outfit-body-v1',portraitMode:'male',hairId:'',femaleEyeStyle:'natural',generatedOutfitTemplate:template,portraitFramingVersion:ENGLISH_TEMPLATE_BODY_FRAMING_VERSION,englishStudioFinishVersion:englishTemplateBodyFinishForGender('male'),thaiOutfitParityVersion:version};
  const env={THAI_OUTFIT_PARITY_VERSION,ENGLISH_BODY_PORTRAIT_VERSION:'en-outfit-body-v1',ENGLISH_TEMPLATE_BODY_FRAMING_VERSION,englishTemplateBodyFinishForGender,portraitFinishChoice,englishFlow:english,englishInlineAi:{choiceStep:'ready'},processActive:false,assetBusy:false,ready:true,processRequestRef:{current:false},state:{current:[head]},layerKind:layer=>layer.kind,outputHeads:layers=>layers,sourceLayerRef:{current:'source'},hasPairedPortraitFinish:()=>false,hydrate:async()=>{hydrations++;return true},setEnglishStep(){},setEnglishRoute(){},setEnglishInlineAi(){},setStatus(){}};
  const create=Function('env','with(env){'+source.slice(start,end)+"return 'new-generation';};return createEnglishPortrait}")(env);
  const result=await create({outfit:{template},hair:'',finish:'natural',gender:'male'});
  assert.equal(hydrations,Number(reused));assert.equal(result,reused?undefined:'new-generation');
 }
});
