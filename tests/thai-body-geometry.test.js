import {generateMakeupFromCompletedNatural} from '../natural-master-makeup.js';
import {readFile} from 'node:fs/promises';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {SINGLE_PASS_PORTRAIT_VERSION} from '../single-pass-portrait-policy.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';
import {createMakeupRequestAudit} from '../makeup-generation-audit.js';
import {ENGLISH_OUTFIT_FIDELITY_VERSION} from '../english-outfit-fidelity-version.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {thaiBodyGeometry,inspectThaiBodyGeometry,checkNewThaiBodyGeometry} from '../src/thai-body-geometry.js';
import {THAI_BODY_GEOMETRY_VERSION,parseThaiBodyReference,thaiBodyGeometryInstruction} from '../thai-body-geometry-policy.js';
import {requestReviewSeedream} from '../seedream-review-transport.js';
import {processProductionPortrait,validateProductionPortrait} from '../production-portrait-pipeline.js';
import {THAI_OUTFIT_AI_VERSION,THAI_OUTFIT_APPEARANCE_VERSION} from '../thai-outfit-ai-policy.js';
import {ENGLISH_TEMPLATE_BODY_FINISH_VERSION} from '../english-template-body-policy.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
function portrait({long=false,faceWidth=90,crown=40}={}){
 const width=300,height=400,pixels=new Uint8ClampedArray(width*height*4),hair=new Uint8ClampedArray(pixels.length),clothing=new Uint8ClampedArray(pixels.length),face=[];
 const box=(x0,y0,x1,y1,color,mask)=>{for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){pixels.set([...color,255],(y*width+x)*4);if(mask)mask.set([255,255,255,255],(y*width+x)*4)}};
 box(0,0,width,height,[40,120,240]);box(20,225,280,400,[235,234,245],clothing);
 box(110,crown,190,110,[20,20,25],hair);
 if(long){box(60,110,85,225,[20,20,25],hair);box(215,110,240,225,[20,20,25],hair)}
 for(const [i,x,y]of [[10,150,110],[33,130,135],[263,170,135],[152,150,220],[234,150-faceWidth/2,160],[454,150+faceWidth/2,160]])face[i]={x:x/width,y:y/height};
 return {pixels,hair,clothing,width,height,face};
}
test('measure face versus actual garment shoulders, excluding long hair silhouette; never modify image or mask pixels',()=>{
 const short=portrait(),long=portrait({long:true}),before=[hash(long.pixels),hash(long.hair),hash(long.clothing)];
 const a=thaiBodyGeometry(short),b=thaiBodyGeometry(long);assert(a&&b);assert.equal(a.faceToShoulder,b.faceToShoulder);assert.equal(a.crownRatio,b.crownRatio);
 const dark=portrait();for(let i=0;i<dark.pixels.length;i+=4)if(dark.clothing[i+3])dark.pixels.set([25,25,35,255],i);
 assert.equal(thaiBodyGeometry(dark).faceToShoulder,a.faceToShoulder,'Actual clothing labels also support dark suits without treating hair as shoulder width');
 assert.equal(inspectThaiBodyGeometry(a).action,'accept');
 const enlarged={...short,width:short.width*2,height:short.height*2};
 for(const field of ['pixels','hair','clothing']){
  const data=new Uint8ClampedArray(enlarged.width*enlarged.height*4);
  for(let y=0;y<enlarged.height;y++)for(let x=0;x<enlarged.width;x++){
   const at=(Math.floor(y/2)*short.width+Math.floor(x/2))*4;
   data.set(short[field].subarray(at,at+4),(y*enlarged.width+x)*4);
  }
  enlarged[field]=data;
 }
 const scaled=thaiBodyGeometry(enlarged);assert(scaled);
 assert(Math.abs(scaled.faceToShoulder-a.faceToShoulder)<.01);assert(Math.abs(scaled.crownRatio-a.crownRatio)<.01);

 assert.deepEqual([hash(long.pixels),hash(long.hair),hash(long.clothing)],before);
 assert.equal(inspectThaiBodyGeometry(thaiBodyGeometry(portrait({faceWidth:130}))).reason,'head_body_size_changed');
 const crown={...a,crownRatio:1.6};assert.equal(inspectThaiBodyGeometry(crown).reason,'excessive_crown_height');
 const raisedSide=portrait();for(let y=10;y<40;y++)for(let x=96;x<114;x++){const i=(y*raisedSide.width+x)*4;raisedSide.pixels.set([20,20,25,255],i);raisedSide.hair.set([255,255,255,255],i)}
 assert.equal(inspectThaiBodyGeometry(thaiBodyGeometry(raisedSide)).reason,'excessive_crown_height','Check elevated side crowns as well as center-parted hair');
});
test('accepted same-photo proportions constrain new hairstyles; unknown measurements are review-only, not a retry',()=>{
 const reference={faceToShoulder:.34,crownRatio:1.05,neckGap:.04};
 assert.equal(inspectThaiBodyGeometry({...reference,faceToShoulder:.375},{reference}).action,'reject');
 assert.equal(inspectThaiBodyGeometry({...reference,crownRatio:1.24},{reference}).reason,'excessive_crown_height');
 assert.equal(inspectThaiBodyGeometry({...reference,neckGap:.12},{reference}).reason,'head_body_join_changed');
 assert.equal(inspectThaiBodyGeometry(null).action,'review');
 assert.equal(inspectThaiBodyGeometry({...reference,crownRatio:null}).action,'review');
 assert.equal(parseThaiBodyReference({...reference,faceToShoulder:.6}),null,'Do not anchor a new request to an already oversized head');
});
test('fresh definite failure keeps the accepted image, cached switches do not remeasure or call AI, and ambiguous evidence preserves the result for review',async()=>{
 const accepted={source:'accepted previous portrait'},before=structuredClone(accepted);let measured=0;
 for(const result of [{idpromReused:true},{}]){
  const reused=!result.idpromReused;const report=await checkNewThaiBodyGeometry({result,reused,measure:()=>{throw Error('must not run')}});assert.equal(report.action,'cached');
 }
 await assert.rejects(checkNewThaiBodyGeometry({result:{},measure:async()=>{measured++;return {faceToShoulder:.50}}}),e=>e.code==='face_proportion_changed'&&e.geometryReason==='head_body_size_changed');
 assert.equal(measured,1);assert.deepEqual(accepted,before);
 await assert.rejects(checkNewThaiBodyGeometry({result:{idpromReused:true,idpromBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION},measure:async()=>({faceToShoulder:.5})}),e=>e.code==='face_proportion_changed','Recovering an unvalidated new job must still run the quality gate');
 const uncertain={};assert.equal((await checkNewThaiBodyGeometry({result:uncertain,measure:async()=>{throw Error('local model unavailable')}})).action,'review');assert(uncertain.idpromQualityReviewNeeded);
});
test('new-policy provider transport makes exactly one HTTP attempt for network, status, malformed, empty and invalid PNG failures',async()=>{
 const cases=[async()=>{throw Error('network')},async()=>({ok:false,status:503,json:async()=>({message:'busy'})}),async()=>({ok:true,status:200,json:async()=>{throw Error('json')}}),async()=>({ok:true,status:200,json:async()=>({data:[]})}),async()=>({ok:true,status:200,json:async()=>({data:[{b64_json:Buffer.from('bad image').toString('base64')}]})})];
 for(const respond of cases){let attempts=0;await assert.rejects(requestReviewSeedream({key:'inert',portrait:Buffer.from('original'),prompt:'test',singleAttempt:true},{fetchImpl:async()=>{attempts++;return respond()}}));assert.equal(attempts,1)}
});
test('actual Thai hairstyle pipeline sends original identity, proportion targets and selected hair through ONE provider HTTP call',async()=>{
 const png=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:115,channels:4,background:'#bd9887'}}).png().toBuffer(),left:8,top:13}]).png().toBuffer();
 const base={englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53}),thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION,portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitMode:'female',femaleEyeStyle:'natural',hairReferenceVersion:'picker-hair-v1',hairId:'seedream-14',neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png',thaiBodyReference:JSON.stringify({faceToShoulder:.34,crownRatio:1.05,neckGap:.04})};
 for(const choice of [{portraitMode:'female',hairId:'seedream-14',femaleEyeStyle:'natural'},{portraitMode:'female',hairId:'seedream-79',femaleEyeStyle:'makeup'},{portraitMode:'male',hairId:'thai-male-auto',femaleEyeStyle:'natural',neckOutfitReferencePath:'/assets/government-uniforms/male-government-employee.png'}]){
 let attempts=0,payload;
 const before=hash(png);
 const fields={...base,...choice,...(choice.portraitMode==='female'?{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,singlePassPortraitVersion:SINGLE_PASS_PORTRAIT_VERSION,femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION}:{})};
 const audit=createMakeupRequestAudit(async options=>{assert.equal(options.singleAttempt,true);assert(options.portrait.equals(png));assert.equal(options.compositionReference,undefined,'No composited head/body starter is sent');return requestReviewSeedream(options,{fetchImpl:async(_url,init)=>{attempts++;payload=JSON.parse(init.body);return {ok:true,status:200,headers:{get:()=>null},json:async()=>({data:[{b64_json:png.toString('base64')}]})}}})},{requirePolicy:choice.femaleEyeStyle==='makeup'});
 await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields,root:new URL('..',import.meta.url).pathname,key:'inert',removeBackground:async()=>png,requestPortrait:audit.requestPortrait});
 assert.equal(attempts,1);assert.equal(hash(png),before);
 assert.match(payload.prompt,/ONE-CALL HEAD \/ BODY GEOMETRY LOCK/);assert.match(payload.prompt,/0.3400/);assert.match(payload.prompt,/A different hairstyle changes HAIR ONLY/);if(choice.portraitMode==='female')assert.match(payload.prompt,/No visible bun/);
 assert.equal(audit.snapshot().providerCalls,1);
 }
 assert.equal(thaiBodyGeometryInstruction({interfaceLanguage:'en',thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION}),'');
 assert.equal(thaiBodyGeometryInstruction({...base,thaiBodyGeometryVersion:'archived'}),'');
 assert.throws(()=>validateProductionPortrait({buffer:png,mimetype:'image/png'},{...base,englishStudioFinishVersion:undefined}),'A one-call body contract cannot fall through to a legacy multi-stage route');
});

test('the real client quality-failure path marks a definite body error as rejected, preventing its automatic recovery/generation branch',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),start=main.indexOf(' // New Thai full-outfit images must preserve the original cheek'),end=main.indexOf(' // Thai V11:',start);
 let deleted=0;const operation={serverCompleted:true},accepted={source:'previous accepted pixels'},before=structuredClone(accepted);
 const env={thaiWholeOutfit:true,cached:{value:{idpromPortraitComposition:'en-outfit-body-v1'},reused:false},ENGLISH_BODY_PORTRAIT_VERSION:'en-outfit-body-v1',gender:'female',options:{},checkNewThaiBodyGeometry,measureThaiBodyGeometry:async()=>({faceToShoulder:.6}),operation,portraitResultCache:{delete:()=>deleted++},key:'rejected new result'};
 const run=Function('env','with(env){return (async()=>{'+main.slice(start,end)+'})()}');
 await assert.rejects(run(env),e=>e.code==='face_proportion_changed'&&e.idpromProcessStage==='quality_check');
 assert.equal(operation.qualityRejected,true);assert.equal(deleted,1);assert.deepEqual(accepted,before);
 assert.equal(Boolean(operation.serverCompleted&&!operation.qualityRejected&&!operation.cancelled),false,'Do not enter processStudioPhoto automatic recovery for a definite image-quality failure');
});

test('new-policy Natural-to-Makeup also forwards single-attempt mode and uses only its existing one provider request',async()=>{
 const png=await sharp({create:{width:96,height:128,channels:4,background:'#bd9887'}}).png().toBuffer();
 let attempts=0;
 const result=await generateMakeupFromCompletedNatural({natural:png,fields:{thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION,portraitMode:'female',femaleEyeStyle:'natural',femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION},key:'inert',requestPortrait:async options=>{
  assert.equal(options.singleAttempt,true);
  return requestReviewSeedream(options,{fetchImpl:async()=>{attempts++;return {ok:true,status:200,headers:{get:()=>null},json:async()=>({data:[{b64_json:png.toString('base64')}]})}}});
 }});
 assert.equal(attempts,1);assert(result.length>0);
});
