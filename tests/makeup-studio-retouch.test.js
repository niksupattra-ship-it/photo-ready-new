import {HAIR_REFERENCE_VERSION} from '../catalogue-hair-policy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {MAKEUP_STUDIO_RETOUCH_VERSION,MAKEUP_STUDIO_RETOUCH_POLICY} from '../makeup-studio-retouch-policy.js';
import {seedreamReviewPayload} from '../seedream-review-transport.js';
import {loadMakeupStudioReference,makeupStudioReferenceInstruction} from '../makeup-studio-reference.js';
import {onePassSkinQualityPriority,SINGLE_PASS_SKIN_QUALITY_VERSION} from '../single-pass-skin-quality.js';
import {AI_MAKEUP_PROMPT,createAiMakeupVariant} from '../ai-portrait-makeup.js';
import {generateMakeupFromCompletedNatural} from '../natural-master-makeup.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';
import {SINGLE_PASS_PORTRAIT_VERSION} from '../single-pass-portrait-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {ENGLISH_STUDIO_FINISH_VERSION} from '../english-studio-finish-policy.js';
import {ENGLISH_HEAD_PORTRAIT_VERSION,ENGLISH_HEAD_FINISH_VERSION} from '../english-head-portrait.js';
import {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION} from '../english-template-body-policy.js';
import {englishHeadPortraitPrompt} from '../english-head-prompt.js';
import {englishTemplateBodyPrompt} from '../english-template-body-prompt.js';

// Real prompt preparation, image codecs and established edge handling, with an
// inert provider. No customer, account, payment or live image AI is contacted.
const root=new URL('..',import.meta.url).pathname;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const naturalHashes={
 false:'82c7515a3724264c011d678fded9ac5b77930144998debb992d658ab68a4cb50',
 true:'1db8affb8c994f095c866fba7a706c55f3ce6d4e8128e69da3b31b21a7eb6174'
};
// Full real pipeline request prompts, captured from released e222ccd before
// separating Makeup from Natural's appearance instructions.
const naturalPipelineHashes={th:'d2fb5d1835af219d3d13758e8c4f23feb6d9373ebc19f6ad659fb347a5287ff1',en:'d81ad7924d44abffc2419286b00bf37dd2d625bd3fbc9955fffdf8e4d53c48b8'};
const natural=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([
 {input:await sharp({create:{width:72,height:104,channels:4,background:'#aa806a'}}).png().toBuffer(),left:12,top:12}
]).png().toBuffer();
const aiResult=await sharp({create:{width:96,height:128,channels:4,background:'#cdb19c'}}).png().toBuffer();
const aiMatte=await sharp(await sharp(aiResult).removeAlpha().png().toBuffer()).joinChannel(await sharp(natural).extractChannel(3).toBuffer()).png().toBuffer();
const pixel=async png=>[...await sharp(png).extract({left:48,top:64,width:1,height:1}).removeAlpha().raw().toBuffer()];
const alpha=png=>sharp(png).ensureAlpha().extractChannel(3).raw().toBuffer();
const modes=[
 ['Thai',{}],
 ['English reference',{preserveOutfit:true,englishReferenceFinish:true}],
 ['English head',{englishHeadFinish:true}],
 ['English template',{preserveOutfit:true,englishTemplateFinish:true}]
];
const englishFields={
 'English reference':{interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_STUDIO_FINISH_VERSION},
 'English head':{interfaceLanguage:'en',portraitComposition:ENGLISH_HEAD_PORTRAIT_VERSION,englishStudioFinishVersion:ENGLISH_HEAD_FINISH_VERSION},
 'English template':{interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION}
};

function assertRetouch(prompt){
 assert(prompt.endsWith(MAKEUP_STUDIO_RETOUCH_POLICY),'One canonical appearance specification follows the route context');
 assert.equal(prompt.split(MAKEUP_STUDIO_RETOUCH_POLICY).length-1,1,'Canonical appearance occurs exactly once');
 assert.equal(prompt.split('FINAL MAKEUP STUDIO-RETOUCH AUTHORITY').length-1,1);
 assert.match(prompt,/Reduce oily\/wet-looking skin shine to a soft satin finish/,'Skin sheen is reduced without changing lip gloss');
 assert.match(prompt,/small, broad, low-intensity diffuse highlights/);
 assert.match(prompt,/modest additional lift toward a slightly fairer/);
 assert.match(prompt,/below both eyes, at the temples, alongside the nose/);
 assert.match(prompt,/no fixed EV increment/);
 assert.match(prompt,/skin segmentation mask/);
 assert.doesNotMatch(prompt,/Render visible but controlled dewy|Do not suppress the requested sheen|No whitening,/);
 assert.match(prompt,/wrinkles/i);assert.match(prompt,/acne/i);
 assert.match(prompt,/microtexture/i,'Clean photographic texture remains');
 assert.match(prompt,/FINAL PORTRAIT CHECK — SELECTED MAKEUP ONLY/);
 assert.match(prompt,/individual temporary pimples, acne bumps or their red\/brown marks/);
 assert.match(prompt,/Check again for acne marks, melasma, freckles, uneven pigmentation and visible superficial wrinkles or fine lines/);
 assert.match(prompt,/Temporary acne detail in the source photograph is not a required identity feature/);
 assert.match(prompt,/without erasing identifying moles, anatomical folds or changing the apparent age/);
 assert.match(prompt,/protect the requested finished appearance, not the original unedited skin surface/);
 assert.match(prompt,/Retain identifying moles, natural undertone and recognisable complexion character/);
 assert.doesNotMatch(prompt,/Keep genuine identifying moles and distinctive freckles|Retain identifying moles, freckles|retaining each brow's natural anchors, arch and asymmetry/,'No older freckle or asymmetric-cosmetic preservation instruction competes with the requested look');
 assert.match(prompt,/remove visible active pimples.*melasma patches, freckles and uneven pigmentation/);
 assert.match(prompt,/Retouch away visible superficial skin wrinkles, fine lines/);
 assert.match(prompt,/Brighten dull or underexposed skin midtones visibly/);
 assert.match(prompt,/visually symmetrical, balanced pair/);
 assert.match(prompt,/clear strand definition with softly feathered edges and diffused inner fronts/);
 assert.match(prompt,/gentle upward lift, soft curl and refined length/);
 assert.match(prompt,/Preserve the original brow anchors and underlying eye and forehead anatomy/);
 assert.match(prompt,/BALANCED APPLICATION — PHOTOGRAPHIC LIGHT AND COSMETICS ONLY/);
 assert.match(prompt,/not symmetry of facial anatomy/);
 assert.match(prompt,/Do not mirror one side/);
 assert.match(prompt,/ears.*neck/i,'Skin and light remain continuous through ears and neck');
 assert.match(prompt,/undertone/i);assert.match(prompt,/identity/i);
 assert.match(prompt,/no fixed EV increment/,'Illumination adapts to each source instead of a forced exposure lift');
 assert.match(prompt,/soft translucent nude-rose pink blush broadly through the upper cheeks/);
 assert.match(prompt,/soft neutral-brown edge along the existing eyelash roots/);
 assert.match(prompt,/translucent pink-nude rose gloss tint/,'The same pink-nude rose lip gloss is used by every route');
 assert.match(prompt,/short or gathered cuts and genuine continuous lengths for bob or long cuts/);
 assert.match(prompt,/brows/i);assert.match(prompt,/lip/i);assert.match(prompt,/hair/i);assert.match(prompt,/outfit|garment/i);
 assert.doesNotMatch(prompt,/NATURAL CLEAR-SKIN BASE — BOTH NATURAL AND MAKEUP|Subtly clean up small active pimples|fine uneven pores/,'Natural-only skin limits are not sent in Makeup appearance');
 assert.doesNotMatch(prompt,/FIRST — FOUNDATION AND COMPLEXION COVERAGE|THEN — SUBTLE COSMETICS|FINAL ENGLISH REFINED SKIN FINISH|MAKEUP SKIN FINISH — PRESSED COMPACT POWDER/,'Former competing Makeup authorities are absent');
 assert.doesNotMatch(prompt,/#FF747F|#F0A2A8|#DD9C8C|EYESHADOW COLOUR OVERRIDE|GLOSS — TRANSLUCENT HYDRATED WET LIP SURFACE/,'No second route-specific cosmetic palette or wet-gloss directive');
 assert.doesNotMatch(prompt,/\+0\.20 to \+0\.30 EV|very small adaptive adjustment|avoid heavy smoothing/i,'No fixed lift or obsolete tiny-correction limit');
}

test('Natural prompt bytes and its shared cache version remain unchanged',()=>{
 assert.equal(SINGLE_PASS_SKIN_QUALITY_VERSION,'one-pass-studio-skin-finish-v8-ai-only-even-bright-complexion');
 for(const english of [false,true]){
  const prompt=onePassSkinQualityPriority('natural',english);
  assert.equal(digest(prompt),naturalHashes[english]);
  assert(!prompt.includes('FINAL MAKEUP STUDIO-RETOUCH AUTHORITY'));
 }
});

test('English head/template default and explicit Natural builders retain released bytes while Makeup omits bare-skin authorities',()=>{
 const fixtures=[
  [englishHeadPortraitPrompt,[{}, {gender:'male'}, {gender:'female',hairIndex:2,identityIndex:3,hairFitIndex:4,keepCurrentHair:true}, {gender:'female',hairIndex:2,hairGuidance:'fixture-specific hair'}],['e3b2991247026cc85c3e6084a5ae267afdd4b0d8550d1422e989e97e97b65e58','af17850f4d9fb9d38c461e77228a7f4b7d66bc5e66a21cb0c162b9c99023342c','b4261582b24321c6a7521a4082e219157d5796ba3914511971159ee8b8684926','24f67498196330fb6d3ce76bfdf9c0a45ad4afaab05898ecf17adb991abbe3ef']],
  [englishTemplateBodyPrompt,[{gender:'female',identityIndex:2,outfitIndex:3},{gender:'male',identityIndex:2,outfitIndex:3,proportionLock:true,naturalHeadNeck:true,maleBodyBalance:true,selectedHairKind:'short'},{gender:'female',identityIndex:1,outfitIndex:2,identityLayout:true,proportionLock:true,naturalHeadNeck:true,femaleBalancedHead:true,selectedHairKind:'gathered'},{gender:'female',hairIndex:2,identityIndex:3,outfitIndex:4,hairFitIndex:5,keepCurrentHair:true}],['1c9936c974bcf4703529e493adeb9e9f76b6076f94798f9daef3a1ed929502c8','29a8dcb549363c4b6573cc7c3070e16095a3fc812cf1aa4bc9671bdff45335cb','cf6f7eefb6bd663c4fd3ad7a2ef98519a74b29bef37791e1a9a14e69c6911d00','a1b451eb994a2c74007d54dd0aa596e9ba506ca644514c6eccf9050a8f74e947']]
 ];
 for(const [build,scenarios,hashes] of fixtures)for(const [index,args] of scenarios.entries()){
  assert.equal(digest(build(args)),hashes[index],'Default Natural builder retains its exact released prompt');
  assert.equal(digest(build({...args,makeupFinish:false})),hashes[index],'Explicit false retains the same Natural bytes');
  if(args.gender==='male')continue;
  const makeup=build({...args,makeupFinish:true});
  assert.notEqual(digest(makeup),hashes[index]);
  assert.doesNotMatch(makeup,/NATURAL SHARED BASE — FINISH HERE ONCE|NATURAL SKIN AND LIGHT — COMPLETE ONCE|ENGLISH NATURAL SKIN DETAIL|add no eyebrow reconstruction/,'Makeup base does not require a bare-skin finish');
  assert.match(makeup,/eye|iris/i);assert.match(makeup,/hair/i);assert.match(makeup,/geometry|proportions/i);
 }
});

test('both direct Makeup appearance variants use one reference finish without Natural constraints or old cosmetic palettes',()=>{
 assert.match(MAKEUP_STUDIO_RETOUCH_VERSION,/^makeup-studio-retouch-v11-under-eye-crease-clear-pink-nude$/);
 for(const english of [false,true]){
  const prompt=onePassSkinQualityPriority('makeup',english);assertRetouch(prompt);
  assert(!prompt.includes('Use exactly the same corrected, realistic skin as Natural.'));
  assert(!prompt.includes('Do NOT paint a uniform opaque cosmetic base, smooth the whole face,'));
  if(english)assert(prompt.indexOf('ENGLISH OUTFIT REFERENCE LOCK')<prompt.indexOf('FINAL MAKEUP STUDIO-RETOUCH AUTHORITY'));
 }
});

test('actual Thai and English single-pass Makeup use the reference finish once while full Natural request bytes remain unchanged',async()=>{
 for(const [name] of modes)for(const finish of ['natural','makeup']){
  const fields={portraitMode:'female',femaleEyeStyle:finish,studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION,singlePassPortraitVersion:SINGLE_PASS_PORTRAIT_VERSION,
   ...(englishFields[name]||{}),...(name.startsWith('English')?{neckOutfitReferencePath:'/assets/job-uniforms/female-job-ivory-bow-blouse.png'}:{})};
  const originalFields=structuredClone(fields),sourceHash=digest(natural),calls=[],stages=[];
  const result=await processProductionPortrait({input:{buffer:natural,mimetype:'image/png'},fields,root,key:'inert-makeup-fixture',
   requestPortrait:async request=>{calls.push(request);return {png:aiMatte}},removeBackground:async()=>aiMatte,onStage:async stage=>stages.push(stage)});
  assert.equal(calls.length,1,name+'/'+finish);const prompt=calls[0].prompt;
  if(finish==='makeup'){
   const position=prompt.indexOf(MAKEUP_STUDIO_RETOUCH_POLICY);assert(position>=0);
   assert.match(prompt,/MAKEUP LIGHT GUIDE — IMAGE \d+/);
   assert.ok(calls[0].skinReference?.length||calls[0].makeupStudioReference?.length,'Makeup includes a faceless light guide');
   // The pipeline adds hair-only instructions after complexion. The full
   // appearance segment must match the common specification exactly.
   assertRetouch(prompt.slice(0,position+MAKEUP_STUDIO_RETOUCH_POLICY.length));
   assert.doesNotMatch(prompt,/FINAL ORIGINAL-AI V2 SKIN \/ LIGHT AUTHORITY|ORIGINAL-PHOTO STUDIO LIGHTING:/,'The current Makeup route uses one appearance authority, not legacy satin lighting instructions');
   assert(position<prompt.indexOf('FINAL SELECTED HAIR BOUNDARY AUTHORITY'),'Existing final hair protection stays authoritative for hair only');
   assert.match(prompt,/Prior Natural\/no-cosmetics descriptions are inactive for this selected Makeup finish/);
   assert.doesNotMatch(prompt,/Earlier Natural\/no-cosmetics descriptions describe the base portrait only/);
  }else{
   if(name==='Thai'||name==='English template')assert.equal(digest(prompt),naturalPipelineHashes[name==='Thai'?'th':'en'],'Full released Natural request is unchanged');
   assert(!prompt.includes(MAKEUP_STUDIO_RETOUCH_POLICY));
   assert(!calls[0].makeupStudioReference,'Natural never adds the Makeup guide');
  }
  assert(!stages.includes('makeup')&&!stages.includes('skin-prepare'),'No additional image generation stage is added');
  assert.deepEqual(fields,originalFields);assert.equal(digest(natural),sourceHash);
  assert.deepEqual(await pixel(result),[205,177,156]);
  assert.deepEqual(await alpha(result),await alpha(aiMatte));
 }
});

test('all dedicated Makeup modes append the same final complexion authority without altering dimensions, alpha or interior AI pixels',async()=>{
 for(const [name,options] of modes){
  const sourceHash=digest(natural),calls=[];
  const result=await createAiMakeupVariant(natural,{...options,key:'inert-makeup-fixture',requestPortrait:async request=>{calls.push(request);return {png:aiResult}}});
  assert.equal(calls.length,1,name);assertRetouch(calls[0].prompt);
  assert.equal(calls[0].size,'96x128');assert.equal(calls[0].portraitMime,'image/png');
  assert.ok(calls[0].makeupStudioReference?.length);
  assert.match(calls[0].prompt,/MAKEUP LIGHT GUIDE — IMAGE 2/);
  const metadata=await sharp(result).metadata();assert.equal(metadata.width,96);assert.equal(metadata.height,128);
  assert.deepEqual(await alpha(result),await alpha(natural),name+' cutout alpha');
  assert.deepEqual(await pixel(result),[205,177,156],name+' interior must stay provider pixels');
  assert.equal(digest(natural),sourceHash);
  assert(calls[0].prompt.includes(AI_MAKEUP_PROMPT),name+' uses the same completed-Natural context');
 }
});

test('Natural-to-Makeup uses the actual completed Natural master once in Thai and every English mode',async()=>{
 for(const [name] of modes){
  const fields={portraitMode:'female',femaleEyeStyle:'natural',femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION,...(englishFields[name]||{})};
  const before=structuredClone(fields),calls=[],sourceHash=digest(natural);
  const result=await generateMakeupFromCompletedNatural({natural,fields,key:'inert-makeup-fixture',requestPortrait:async request=>{calls.push(request);return {png:aiResult}}});
  assert.equal(calls.length,1,name);assertRetouch(calls[0].prompt);
  assert.deepEqual(await pixel(calls[0].portrait),[170,128,106],name+' conditions on the completed Natural image');
  assert.deepEqual(await pixel(result),[205,177,156]);assert.deepEqual(await alpha(result),await alpha(natural));
  assert.deepEqual(fields,before);assert.equal(digest(natural),sourceHash);
 }
});

test('a malformed AI makeup image still rejects once without returning a partial portrait or mutating its Natural source',async()=>{
 const before=digest(natural),wrongShape=await sharp({create:{width:192,height:64,channels:4,background:'#ffffff'}}).png().toBuffer();let calls=0;
 await assert.rejects(createAiMakeupVariant(natural,{key:'inert-makeup-fixture',requestPortrait:async()=>{calls++;return {png:wrongShape}}}),/สัดส่วนไม่ตรง/);
 assert.equal(calls,1);assert.equal(digest(natural),before);
});

test('Makeup light guide is a fixed JPEG appended after existing references without altering previous image order',async()=>{
 const guide=await loadMakeupStudioReference(root);assert.ok(guide?.length);
 assert.equal((await sharp(guide).metadata()).format,'jpeg');
 const old=seedreamReviewPayload({prompt:'fixture',portrait:natural,hair:natural,identity:natural,outfit:natural,compositionReference:natural});
 const next=seedreamReviewPayload({prompt:'fixture',portrait:natural,hair:natural,identity:natural,outfit:natural,compositionReference:natural,makeupStudioReference:guide});
 assert.deepEqual(next.image.slice(0,-1),old.image);
 assert.equal(next.image.at(-1),'data:image/jpeg;base64,'+guide.toString('base64'));
 assert.match(makeupStudioReferenceInstruction(next.image.length),/only|ONLY/);
});

test('style guide delegates reduced skin sheen and brightening to the one Makeup authority',()=>{
 const guide=makeupStudioReferenceInstruction(2);
 assert.match(guide,/not a skin-tone target or the cosmetic palette/);
 assert.match(guide,/governed exclusively by the final Makeup specification/);
 assert.match(guide,/fine texture is not a requirement to reproduce temporary acne detail/);
 assert.match(MAKEUP_STUDIO_RETOUCH_POLICY,/translucent pink-nude rose gloss tint/);
 assert.match(MAKEUP_STUDIO_RETOUCH_POLICY,/soft translucent nude-rose pink blush/);
 assert.match(MAKEUP_STUDIO_RETOUCH_POLICY,/This lower-sheen instruction applies to SKIN only/);
 assert.match(guide,/soft satin skin, reduced shine, even brighter illumination/);
});


test('different replacement hairstyles keep the selected Makeup finish and the same pink-nude/neutral skin authority from the original upload',async()=>{
 const sourceHash=digest(natural),specifications=[];
 for(const id of ['seedream-14','seedream-26']){
  const fields={portraitMode:'female',femaleEyeStyle:'makeup',hairId:id,hairReferenceVersion:HAIR_REFERENCE_VERSION,studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION,singlePassPortraitVersion:SINGLE_PASS_PORTRAIT_VERSION,faceIdentityBox:JSON.stringify([.3,.18,.7,.65])};
  const requests=[];
  await processProductionPortrait({input:{buffer:natural,mimetype:'image/png'},fields,root,key:'inert-pink-nude',requestPortrait:async request=>{requests.push(request);return {png:aiMatte}},removeBackground:async()=>aiMatte});
  assert.equal(fields.femaleEyeStyle,'makeup');assert.equal(digest(natural),sourceHash);assert.equal(requests.length,1);
  const {prompt,mask}=requests[0];assert.equal(mask,undefined);
  assert.equal(prompt.split(MAKEUP_STUDIO_RETOUCH_POLICY).length-1,1);
  assert.match(prompt,/SAME SOURCE, SAME SKIN TARGET/);
  assert.match(prompt,/Never infer complexion or makeup from the hairstyle donor/);
  assert.match(prompt,/same modest brightness lift and low-sheen finish/);
  assert.match(prompt,/soft translucent nude-rose pink blush/);
  assert.match(prompt,/translucent pink-nude rose gloss tint/);
  assert.match(prompt,/No peach, coral, apricot, orange/);
  assert.doesNotMatch(prompt,/soft translucent peach-pink blush|translucent coral-pink gloss tint|sheer warm peach-beige makeup/);
  specifications.push(prompt.slice(prompt.indexOf(MAKEUP_STUDIO_RETOUCH_POLICY),prompt.indexOf(MAKEUP_STUDIO_RETOUCH_POLICY)+MAKEUP_STUDIO_RETOUCH_POLICY.length));
 }
 assert.equal(specifications[0],specifications[1]);
});
