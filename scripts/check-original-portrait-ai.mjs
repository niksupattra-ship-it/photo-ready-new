import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {ORIGINAL_PORTRAIT_AI_VERSION as V,ORIGINAL_PORTRAIT_AI_PREPARED_VERSION as V4,ORIGINAL_PORTRAIT_AI_POST_POLISH_VERSION as V3,ORIGINAL_PORTRAIT_AI_GUIDED_VERSION as V2,ORIGINAL_PORTRAIT_AI_PREVIOUS_VERSION as V1,needsOriginalAiSkinPolish,needsOriginalAiSkinPreparation,originalAiClothedSkinPreparationPrompt,originalAiMakeupSkinPolishPrompt,ORIGINAL_AI_PREPARED_SKIN_PRIORITY,isOriginalPortraitAiVersion,isOriginalPortraitAiRequest,originalAiSkinFinish,hasOriginalPortraitAiFinish,markOriginalPortraitAiFinish,originalPortraitAiMetadata,ORIGINAL_AI_TARGET_PRIORITY} from '../original-portrait-ai.js';
import {prepareStudioSkinInput,parseStudioSkinRequest} from '../studio-skin-input.js';
import {processProductionPortrait,productionPortraitPrompt,validateProductionPortrait} from '../production-portrait-pipeline.js';
import {studioSkinWorkflowMetadata} from '../studio-skin-metadata.js';
import {preserveLocalSkinLook} from '../src/preserve-local-skin-look.js';
import {loadStudioSkinLightReference} from '../studio-skin-light-reference.js';
import {PRODUCTION_HAIR_CATALOG} from '../hairstyle-catalog.js';
import {seedreamReviewPayload} from '../seedream-review-transport.js';
const root=new URL('..',import.meta.url).pathname,styles=['natural','makeup','korean-rosy-v1','soft-rosy-v1'];
let passed=0;const reports=[];
async function check(name,run){await run();passed++;reports.push(name);console.log('PASS '+name)}
const raw=await sharp({create:{width:160,height:200,channels:3,background:'#b69583'}}).jpeg({quality:92}).withMetadata({orientation:6}).toBuffer();
const input={buffer:raw,mimetype:'image/jpeg',originalname:'unmodified-camera.jpg'},fields=style=>({portraitMode:'female',hairId:'original',femaleEyeStyle:style,studioSkinVersion:V});
const v4fields=style=>({...fields(style),studioSkinVersion:V4});
const hash=value=>createHash('sha256').update(value).digest('hex');
await check('original JPEG including EXIF remains byte-exact through the production preparation boundary',async()=>{
 for(const version of [V1,V2,V3,V])for(const style of styles){const f={...fields(style),studioSkinVersion:version};assert.equal(parseStudioSkinRequest(f,'female'),null);const prepared=await prepareStudioSkinInput(input,f,'female');assert.equal(prepared.input,input);assert.equal(prepared.input.buffer,raw);assert.equal(prepared.staged,false);assert.equal((await sharp(raw).metadata()).orientation,6)}
 for(const patch of [{portraitMode:'male'},{femaleEyeStyle:'unknown'},{studioSkinEvidence:'{}'}])assert.throws(()=>validateProductionPortrait(input,{...fields('natural'),...patch}));
});
await check('frozen v1/v2/v3 requests and v4 clothed-original preparation keep correct input provenance and image ordering',async()=>{
 const native=new Uint8Array(32*40*4);for(let y=4;y<36;y++)for(let x=4;x<28;x++)native.set([189,154,134,255],(y*32+x)*4);
 const cutout=await sharp(native,{raw:{width:32,height:40,channels:4}}).png().toBuffer(),guide=await loadStudioSkinLightReference(root);
 const polishedPixels=new Uint8Array(native);for(let y=4;y<36;y++)for(let x=4;x<28;x++)polishedPixels[(y*32+x)*4]=199;
 const finished=await sharp(polishedPixels,{raw:{width:32,height:40,channels:4}}).png().toBuffer(),preparedFull=await sharp({create:{width:200,height:160,channels:4,background:'#cbab99'}}).png().toBuffer();
 const expectedIdentity=await sharp(raw,{limitInputPixels:33554432}).rotate().resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 const v1Hashes={
  natural:['eeb47c0049e1ee377b191848e1f815d7b513c99bd2c643d5e32f3c42a9519892','5d2b7daebd200f358c7f363c42efdda2291576f1c6c7221e6a9d2e33705fc124','e362b9cca3ce181b774d7968208f319a90d51761908da28b713b414873ccb716'],
  makeup:['55140450700ca64f7355069c5c3530e4a0ff91a1eb15818d394e17b8616b9553','2c6f4fd9bb4c3b4c3b04ea497f171ff7bcece5fb048eaebb0b780adda446c7cb','73a25253e8b7a2d5e0d5fbdd8bdc4c9810982f57287150e9985382ead05980d9'],
  'korean-rosy-v1':['55140450700ca64f7355069c5c3530e4a0ff91a1eb15818d394e17b8616b9553','2c6f4fd9bb4c3b4c3b04ea497f171ff7bcece5fb048eaebb0b780adda446c7cb','73a25253e8b7a2d5e0d5fbdd8bdc4c9810982f57287150e9985382ead05980d9'],
  'soft-rosy-v1':['1f1a16a242a4864ba6e223d4537c5acc0b79f5eda6ac06500b7f8506a192b964','5ee7e2be6d57e40d4d0c6020263a21a436ebee4c9f8591e213e2a89912409281','a9b6d742f548897e3aec6926bd44a2dfefec7e15e3280eef48a67d52addc6729']
 };

 const v2Hashes={
  natural:['f34b8396dc23bc4cd550c493167f25720c7d2a764d9e179e6229daa1b5cd7c90','2b0da8ca1dc0063476370135634f31ad82da0601891c3df474b5e9a157d201f2','98a9c623b78c7b1447ecda1e233207fc34af157d23f5a030f448dddc443743ca'],
  makeup:['3d5247e603206a633b69ac282122f31248882dffd21a70ebd7de2a24a2665378','d49f6c9f5a76b5eed0a70df986b20f3c76ce6e3e8200ad013d08edc73833caa7','a539d4f2b2056b3590cff3ca98f977ab8789cc07b22f6aa6cb226f0b2244fd94'],
  'korean-rosy-v1':['3d5247e603206a633b69ac282122f31248882dffd21a70ebd7de2a24a2665378','d49f6c9f5a76b5eed0a70df986b20f3c76ce6e3e8200ad013d08edc73833caa7','a539d4f2b2056b3590cff3ca98f977ab8789cc07b22f6aa6cb226f0b2244fd94'],
  'soft-rosy-v1':['952dcedc022ea1d613c06860bfd91a896a60fd9648cb7d1183437b079f72ca7c','aefbbd72a5901723bb06640180eb127f6758e18407d2160bdcb6a0fd1cce7274','c9234283622c0052ae6afe2bbe2df2155a63aadd2a2bb65efd56f16711eb91fd']
 };

 const v3Second={makeup:'294d48c140dea5217fafa7bd7d10749788c2886de97aa915a7b47f9b9b2da14c','korean-rosy-v1':'294d48c140dea5217fafa7bd7d10749788c2886de97aa915a7b47f9b9b2da14c','soft-rosy-v1':'a44a21a49665b0b6063a5c3897671239098502acf269b52bb99bfa89568d97d3'};
 const digest=request=>hash(JSON.stringify({prompt:request.prompt,size:request.size,portrait:hash(request.portrait),portraitMime:request.portraitMime,hair:request.hair?hash(request.hair):null,identity:request.identity?hash(request.identity):null,skinReference:request.skinReference?hash(request.skinReference):null,outfit:request.outfit?hash(request.outfit):null}));
 const hairOptions=['original','seedream-19','hair-21'];
 for(const version of [V1,V2,V3,V4])for(const style of styles)for(const hair of hairOptions){
  const requestFields={...v4fields(style),studioSkinVersion:version,hairId:hair},twoCall=needsOriginalAiSkinPolish(requestFields),preparation=needsOriginalAiSkinPreparation(requestFields),calls=[],events=[];let matting=0;
  await processProductionPortrait({input,fields:requestFields,root,onStage:async stage=>events.push('stage:'+stage),requestPortrait:async options=>{calls.push(options);events.push('AI:'+calls.length);return {png:calls.length===1?(preparation?preparedFull:cutout):finished}},removeBackground:async image=>{matting++;events.push('matting');assert.deepEqual(image,twoCall?finished:cutout);return image}});
  const first=calls[0],portraitCall=preparation?calls[1]:first;
  assert.equal(calls.length,twoCall?2:1);assert.equal(matting,1);assert.equal(first.portrait,raw);assert.equal(first.portraitMime,'image/jpeg');assert.equal(first.outfit,undefined);assert(!events.includes('stage:skin-base'));
  if(preparation){
   assert.equal(first.identity,undefined);assert.equal(first.hair,undefined);assert.equal(first.prompt,originalAiClothedSkinPreparationPrompt());assert.deepEqual(first.skinReference,guide);assert.match(first.prompt,/Keep all clothing fully intact and expose no new skin/);assert.match(first.prompt,/do not add lipstick, eyeshadow/);assert.match(first.prompt,/same full clothed photograph/);
   const firstPayload=seedreamReviewPayload(first);assert.deepEqual(firstPayload.image,['data:image/jpeg;base64,'+raw.toString('base64'),'data:image/jpeg;base64,'+guide.toString('base64')]);
   assert.equal(portraitCall.portrait,preparedFull);assert.equal(portraitCall.portraitMime,'image/png');assert.deepEqual(portraitCall.identity,expectedIdentity);assert.deepEqual(portraitCall.skinReference,guide);assert.equal(Boolean(portraitCall.hair),hair!=='original');assert.equal(portraitCall.outfit,undefined);assert.equal(portraitCall.makeup,undefined);assert.match(portraitCall.prompt,/Image 1 is the full clothed source photo after a dedicated AI skin repair and lighting edit/);assert.doesNotMatch(portraitCall.prompt,/Image 1 is the untouched original photograph/);assert.match(portraitCall.prompt,new RegExp('ORIGINAL-UPLOAD IDENTITY ONLY — IMAGE '+(hair==='original'?2:3)));assert.match(portraitCall.prompt,new RegExp('LIGHT GUIDE — IMAGE '+(hair==='original'?3:4)+', THE LAST IMAGE'));
   assert(portraitCall.prompt.endsWith(ORIGINAL_AI_PREPARED_SKIN_PRIORITY));assert.match(portraitCall.prompt,/Never reintroduce the original identity image’s wrinkles/);assert.match(portraitCall.prompt,/MAKEUP OPTION — COMPLETE HERE/);assert.match(portraitCall.prompt,/Retain Image 1’s completed fresh diffuse lighting/);
   const payload=seedreamReviewPayload(portraitCall);assert.equal(payload.image.length,hair==='original'?3:4);assert.equal(payload.image[0],'data:image/png;base64,'+preparedFull.toString('base64'));assert.equal(payload.image[hair==='original'?1:2],'data:image/png;base64,'+expectedIdentity.toString('base64'));assert.equal(payload.image.at(-1),'data:image/jpeg;base64,'+guide.toString('base64'));
   assert(events.indexOf('stage:skin-prepare')<events.indexOf('AI:1'));assert(events.indexOf('AI:1')<events.indexOf('stage:generation'));assert(events.indexOf('stage:generation')<events.indexOf('AI:2'));assert(!events.includes('stage:skin-finish'));
  }else{
   assert.equal(first.identity,null);assert.equal(Boolean(first.hair),hair!=='original');assert.match(first.prompt,/Image 1 is the untouched original photograph/);assert.doesNotMatch(first.prompt,/PREPARED PHOTO-STUDIO SKIN BASE|Selected cosmetics are separate local|local cosmetics happen only after/);
   if(style==='natural')assert.match(first.prompt,/NATURAL OPTION/);else assert.match(first.prompt,/MAKEUP OPTION — COMPLETE HERE/);
   assert.equal(digest(first),(version===V1?v1Hashes:v2Hashes)[style][hairOptions.indexOf(hair)],version+' '+style+' '+hair+' released first-generation payload changed');
   if(version===V1)assert.equal(first.skinReference,undefined);else{assert.deepEqual(first.skinReference,guide);assert(first.prompt.endsWith(ORIGINAL_AI_TARGET_PRIORITY));const payload=seedreamReviewPayload(first);assert.equal(payload.image.length,hair==='original'?2:3);assert.equal(payload.image.at(-1),'data:image/jpeg;base64,'+guide.toString('base64'))}
   assert(!events.includes('stage:skin-prepare'));
  }
  if(version===V3&&twoCall){
   const second=calls[1];assert.equal(second.portrait,cutout);assert.equal(second.portraitMime,'image/png');assert.deepEqual(second.identity,expectedIdentity);assert.deepEqual(second.skinReference,guide);assert.equal(second.hair,undefined);assert.equal(second.outfit,undefined);assert.equal(second.prompt,originalAiMakeupSkinPolishPrompt(style));assert.equal(digest(second),v3Second[style]);assert(events.indexOf('AI:1')<events.indexOf('stage:skin-finish'));assert(events.indexOf('stage:skin-finish')<events.indexOf('AI:2'));
  }
  if(twoCall){assert(events.indexOf('AI:2')<events.indexOf('stage:matting'));assert(events.indexOf('stage:matting')<events.indexOf('matting'))}else assert(!events.includes('stage:skin-finish'));
 }
});
await check('v2/v3 base prompts and v4 Natural source-eye policy remain exactly frozen',async()=>{
 const selected=[{gender:'female'},...PRODUCTION_HAIR_CATALOG.filter(s=>s.gender==='female')],expected={natural:'3bf2ce7a363670f2875def48db6edd1c15ddd9a0c1b702868750f0b9f8d7f66c',makeup:'c5e61c1c3e110c438d55d35faf1a8c6ce342ebacfcb6d6db078f2c069bcbdd55','korean-rosy-v1':'c5e61c1c3e110c438d55d35faf1a8c6ce342ebacfcb6d6db078f2c069bcbdd55','soft-rosy-v1':'2a9c16fc50edfa02a5c112b68a0ee9ad1ad6ca53da03662d3e44be49537ece37'};
 for(const version of [V2,V3])for(const style of styles)assert.equal(hash(JSON.stringify(selected.map(s=>productionPortraitPrompt(s,style,{studioSkinVersion:version})))),expected[style]);
 assert.equal(hash(JSON.stringify(selected.map(s=>productionPortraitPrompt(s,'natural',{studioSkinVersion:V4})))),expected.natural);
 for(const style of styles.filter(s=>s!=='natural'))assert.match(productionPortraitPrompt({gender:'female'},style,v4fields(style)),/Image 1 is the full clothed source photo after a dedicated AI skin repair and lighting edit/);
});
await check('v4 final portrait identity comes only from bounded original pixels, not the prepared AI image',async()=>{
 const large=await sharp({create:{width:2400,height:1600,channels:3,background:'#a17b68'}}).jpeg().withMetadata({orientation:6}).toBuffer(),expected=await sharp(large).rotate().resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).png().toBuffer(),prepared=await sharp({create:{width:200,height:160,channels:4,background:'#cbab99'}}).png().toBuffer();let calls=0;
 await assert.rejects(processProductionPortrait({input:{buffer:large,mimetype:'image/jpeg'},fields:v4fields('makeup'),root,requestPortrait:async request=>{calls++;if(calls===1){assert.equal(request.portrait,large);assert.equal(request.identity,undefined);return {png:prepared}}assert.equal(request.portrait,prepared);assert.deepEqual(request.identity,expected);const metadata=await sharp(request.identity).metadata();assert.equal(metadata.format,'png');assert.equal(metadata.width,683);assert.equal(metadata.height,1024);throw Error('original identity inspected')},removeBackground:async()=>{throw Error('must not matte a failed final generation')}}),/original identity inspected/);assert.equal(calls,2);
});
await check('v4 preparation/final-generation failures remain atomic without retries, matting or intermediate delivery',async()=>{
 const prepared=await sharp({create:{width:200,height:160,channels:4,background:'#cbab99'}}).png().toBuffer();
 for(const phase of [1,2])for(const fail of ['throw','missing','empty']){
  let calls=0,matting=0;const error=Error('provider refused or failed phase '+phase);
  await assert.rejects(processProductionPortrait({input,fields:v4fields('makeup'),root,requestPortrait:async()=>{calls++;if(calls!==phase)return {png:prepared};if(fail==='throw')throw error;return fail==='missing'?{}:{png:Buffer.alloc(0)}},removeBackground:async()=>{matting++;return prepared}}),fail==='throw'?e=>e===error:e=>e.code===(phase===1?'original_makeup_prepare_invalid':'original_makeup_finish_invalid'));
  assert.equal(calls,phase);assert.equal(matting,0);
 }
 for(const version of [V1,V2])for(const style of styles)assert.equal(needsOriginalAiSkinPolish({...v4fields(style),studioSkinVersion:version}),false);
 for(const version of [V3,V4]){assert.equal(needsOriginalAiSkinPolish({...v4fields('makeup'),studioSkinVersion:version}),true);assert.equal(needsOriginalAiSkinPolish({...v4fields('natural'),studioSkinVersion:version}),false)}
 assert.equal(needsOriginalAiSkinPolish({...v4fields('makeup'),portraitMode:'male'}),false);assert.equal(needsOriginalAiSkinPreparation({...v4fields('makeup'),studioSkinVersion:V3}),false);
});
await check('every released v1 female base prompt keeps its exact fingerprint',async()=>{
 const selected=[{gender:'female'},...PRODUCTION_HAIR_CATALOG.filter(s=>s.gender==='female')],expected={natural:'826944d7c700f655c0de7e05140a7da9919ee7719f006d592939c1153efbc3a2',makeup:'040a5a2d1f0ce429681f89e9195d2cd380a1ddb909056f3c5fb54cefc87b718c','korean-rosy-v1':'040a5a2d1f0ce429681f89e9195d2cd380a1ddb909056f3c5fb54cefc87b718c','soft-rosy-v1':'f876460621cc16f147f73a165f650cda195d651447a7ad808879a798e381177f'};
 for(const style of styles)assert.equal(hash(JSON.stringify(selected.map(s=>productionPortraitPrompt(s,style,{studioSkinVersion:V1})))),expected[style]);
});
await check('Natural and Makeup have explicit different AI cosmetic instructions without a shared local bare-base marker',async()=>{
 assert.notEqual(productionPortraitPrompt({gender:'female'},'natural',fields('natural')),productionPortraitPrompt({gender:'female'},'makeup',fields('makeup')));
 for(const style of styles){const original=new Blob(['upload']),blob=markOriginalPortraitAiFinish(new Blob(['AI output']),style);assert(hasOriginalPortraitAiFinish(blob,style));assert.deepEqual(studioSkinWorkflowMetadata(blob),originalPortraitAiMetadata(blob));assert.equal(blob.idpromStudioSkinBaseSource,undefined);assert.deepEqual(studioSkinWorkflowMetadata(original),{});if(style!=='natural')assert(!hasOriginalPortraitAiFinish(blob,'natural'))}
 assert(!hasOriginalPortraitAiFinish({studioSkinVersion:'studio-skin-stages-v5'},'natural'));
});
await check('v1/v2/v3 metadata preserves actual versions without becoming current v4 cache entries',async()=>{
 for(const version of [V1,V2,V3,V4])for(const style of styles){
  const blob=markOriginalPortraitAiFinish(new Blob(['released older output']),style,version);assert.equal(blob.idpromStudioSkinVersion,version);assert(!hasOriginalPortraitAiFinish(blob,style));
  const expected={studioSkinVersion:version,...(style==='natural'?{}:{studioCosmeticsVersion:version+':'+style})};assert.deepEqual(originalPortraitAiMetadata(blob),expected);assert.deepEqual(studioSkinWorkflowMetadata(blob),expected);assert.equal(blob.idpromStudioSkinBaseSource,undefined);
 }
 assert.throws(()=>markOriginalPortraitAiFinish(new Blob(['x']),'natural','unreleased-version'));
 assert(isOriginalPortraitAiRequest({studioSkinVersion:V1}));assert(isOriginalPortraitAiRequest({studioSkinVersion:V}));assert(!isOriginalPortraitAiVersion('studio-skin-stages-v5'));
});
await check('new AI results bypass automatic restoration of earlier local skin/makeup recipes',async()=>{
 const replacement={portraitMode:'female',femaleEyeStyle:'makeup',studioSkinVersion:V,source:'untouched-new-AI-image'},previous={portraitMode:'female',femaleEyeStyle:'makeup',makeupStyles:{look:'local-korean-pink-eye-v1'},makeupIntensity:100};
 const fail=()=>{throw Error('local cosmetic path must not run')};assert.equal(await preserveLocalSkinLook(previous,replacement,{render:fail,mix:fail,toSource:fail}),replacement);
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');assert(main.includes('onLocalPortraitFinish={changeStudioPortraitFinish}'));
});
await check('legacy original-AI completion keeps released pixels without local skin or cosmetic filters',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),a=main.indexOf('async function aiFinishPortrait('),b=main.indexOf('\nasync function aiFinishPortraitUncached(',a);assert(a>=0&&b>a);
 for(const version of [V1,V2,V3])for(const style of ['natural','makeup','korean-rosy-v1']){
  const upload=new Blob(['original']),completed=markOriginalPortraitAiFinish(new Blob(['already finished AI pixels']),style,version),operation={cancelled:false};let unfiltered=0,cleanup=0;
  const forbidden=()=>{throw Error('No local skin or cosmetics may execute on this route')};
  const env={sharedStudioSkinSource:()=>null,needsOriginalAiSkinPolish,needsOriginalAiSkinPreparation,isOriginalPortraitAiVersion,isOriginalPortraitAiRequest,hasOriginalPortraitAiFinish,markOriginalPortraitAiFinish,window:{dispatchEvent(){}},CustomEvent:class{},activeProcessOperation:operation,assertProcessActive:()=>{},cancelledProcessError:()=>Error('cancelled'),PRODUCTION_HAIR_CATALOG:[],portraitFinishChoice:(v,f)=>v||f||'natural',currentResultCacheScope:()=> 'fixture',resultSourceDigest:async()=> 'raw-source-sha',uploadGenerationScope:()=> 'upload',HAIR_DESIGN_VERSION:'hair',NATURAL_STUDIO_SKIN_VERSION:'natural',STUDIO_SKIN_WORKFLOW_VERSION:'studio-skin-stages-v5',ORIGINAL_PORTRAIT_AI_VERSION:V,
   portraitResultCache:{async get(key,create){assert(key.includes(V));return {value:await create(),reused:false}},delete(){}},aiFinishPortraitUncached:async original=>{assert.equal(original,upload);unfiltered++;return completed},cleanPortraitClothing:async blob=>{assert.equal(blob,completed);cleanup++;return blob},finishSharedStudioSkin:forbidden,finishFemaleMakeupSoftFocusBlob:forbidden,prepareStudioMakeup:forbidden,checkPortraitProportions:async()=>{},checkPortraitCompletion:async()=>{}};
  const fn=Function('env','with(env){'+main.slice(a,b)+';return aiFinishPortrait}')(env),result=await fn(upload,'original',{portraitMode:'female',femaleEyeStyle:style});assert.equal(result,completed);assert.equal(unfiltered,1);assert.equal(cleanup,1);assert.equal(await result.text(),'already finished AI pixels');assert.equal(upload.idpromStudioSkinVersion,undefined);
 }
});
console.log(JSON.stringify({passed,reports,scope:'Exact original bytes, actual production request and App completion, inert versioned AI calls, v4 clothed-original atomic skin preparation then portrait, unchanged Natural single call, correct original-identity/guide order, frozen v1/v2/v3 prompts/payloads, all-version completion, AI makeup distinction, cache metadata and no automatic local skin/cosmetic restoration. No external requests, accounts or payments.'}));
