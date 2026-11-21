import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {processProductionPortrait,validateProductionPortrait,shieldThaiNativeUniformFront} from '../production-portrait-pipeline.js';
import {THAI_OUTFIT_AI_VERSION,THAI_OUTFIT_APPEARANCE_VERSION,THAI_OUTFIT_APPEARANCE_PREVIOUS_V10,THAI_OUTFIT_APPEARANCE_PREVIOUS_V9,THAI_OUTFIT_APPEARANCE_PREVIOUS_V8,THAI_OUTFIT_APPEARANCE_PREVIOUS,THAI_OUTFIT_APPEARANCE_LEGACY_SHIELD_VERSION,THAI_OUTFIT_APPEARANCE_OLD_NECK_VERSION,THAI_OUTFIT_APPEARANCE_OLD_NECK_V5,requiresThaiNativeFrontShield,usesThaiShoulderAwareShield,usesThaiNecklineProtectedShield,isThaiOutfitPath,thaiOutfitAppearanceInstruction,usesThaiHistoricOutfitPrompt,usesThaiEnglishParityOutfit} from '../thai-outfit-ai-policy.js';
import {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,ENGLISH_TEMPLATE_BODY_FINISH_VERSION} from '../english-template-body-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {SINGLE_PASS_PORTRAIT_VERSION} from '../single-pass-portrait-policy.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';
import {isPrivateOwner} from '../private-trial.js';
import {checkoutPackage,packageFor,remaining} from '../package-rules.js';
const root=new URL('..',import.meta.url).pathname;
const input={buffer:await sharp({create:{width:120,height:160,channels:4,background:'#b38a72'}}).png().toBuffer(),mimetype:'image/png'};
const result=await sharp({create:{width:120,height:160,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:120,channels:4,background:'#b38a72'}}).png().toBuffer(),left:20,top:20}]).png().toBuffer();

test('historical Thai outfit-AI jobs remain renderable after the pricing rollback',async()=>{
 const options=[['female','/assets/government-uniforms/female-operational.png','makeup'],['female','/assets/student-uniforms/female-01.png','natural'],['male','/assets/job-uniforms/male-job-blue-navy-tie.png','natural']];
 const main=await readFile(root+'src/main.jsx','utf8');
 const gown=main.match(/template:'(\/assets\/gown-uniforms\/[^']+)'/);assert(gown);
 options.push(['female',gown[1],'natural']);
 for(const [gender,template,finish] of options){
  const calls=[];
  const fields={interfaceLanguage:'th',thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:gender==='female'?ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitMode:gender,hairId:'original',femaleEyeStyle:finish,neckOutfitReferencePath:template,faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),...(gender==='female'?{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,singlePassPortraitVersion:SINGLE_PASS_PORTRAIT_VERSION,femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION}:{})};
  const out=await processProductionPortrait({input,fields,root,key:'test',removeBackground:async()=>result,requestPortrait:async p=>{calls.push(p);return {png:result}}});
  assert.equal(calls.length,1,template);assert(out.length);assert(calls[0].outfit?.length);
  assert.equal(fields.interfaceLanguage,'th','Internal rendering must not mutate the credit-authority request');
  assert.match(calls[0].prompt,/garment/);
  assert.throws(()=>validateProductionPortrait(input,{...fields,neckOutfitReferencePath:'/assets/background.png'}));
  assert.throws(()=>validateProductionPortrait(input,{...fields,thaiOutfitAiVersion:'unknown'}));
 }
 assert(!isThaiOutfitPath('/assets/gown-uniforms/../../secret.png'));
});

test('new Thai Studio jobs use the existing full-outfit AI renderer without English locale or credits',async()=>{
 const main=await readFile(root+'src/main.jsx','utf8');
 const studio=await readFile(root+'src/studio-editor.jsx','utf8');
 const server=await readFile(root+'server.js','utf8');
 for(const expected of [
  "const thaiWholeOutfit=!englishPreviewEnabled()&&isThaiOutfitPath(template)",
  "const bodyPortrait=englishPreviewEnabled()||thaiWholeOutfit",
  "if(englishPreviewEnabled()||thaiWholeOutfit){",
  "fd.append('thaiOutfitAiVersion',THAI_OUTFIT_AI_VERSION)",
  "fd.append('thaiOutfitAppearanceVersion',THAI_OUTFIT_APPEARANCE_VERSION)",
  "fd.append('thaiAdaptiveFaceGeometry',JSON.stringify(measured.geometry))",
  "if(englishPreviewEnabled())fd.append('interfaceLanguage','en')",
  "fd.append('englishOutfitFidelityVersion',ENGLISH_OUTFIT_FIDELITY_VERSION)",
  "fd.append('englishStudioFinishVersion',englishTemplateBodyFinishForGender(portraitMode))",
  "fd.append('neckOutfitReferencePath',neckOutfit)",
  "editCache.current.master?.idpromPortraitComposition===ENGLISH_BODY_PORTRAIT_VERSION"
 ])assert(main.includes(expected),'Missing Thai-only AI path: '+expected);
 assert(studio.includes('if(head.portraitComposition===ENGLISH_BODY_PORTRAIT_VERSION)next='),'A full-outfit output hides the placeholder suit');
 assert(server.includes("const englishRequest=req.body?.interfaceLanguage==='en'"),'English credit policy remains language-specific');
 assert(!main.includes("else fd.append('interfaceLanguage','en')"),'Thai must not enter English credit rules');
 for(const path of ['/assets/job-uniforms/female-job-white.png','/assets/student-uniforms/female-01.png','/assets/government-uniforms/female-operational.png','/assets/gown-uniforms/female-01.png'])assert(isThaiOutfitPath(path),path);
});

test('archived Thai v8/v9/v10 remain valid while V11 uses per-face adaptive guide and identity lock',async()=>{
 const template='/assets/job-uniforms/female-job-light-pink-tweed-pearl-trim.png';
 const core={portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,englishOutfitFidelityVersion:(await import('../english-outfit-fidelity-version.js')).ENGLISH_OUTFIT_FIDELITY_VERSION,portraitMode:'female',hairId:'original',femaleEyeStyle:'makeup',neckOutfitReferencePath:template,faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,singlePassPortraitVersion:SINGLE_PASS_PORTRAIT_VERSION,femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION};
 const thai={...core,interfaceLanguage:'th',thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53})};
 const english={...core,interfaceLanguage:'en'};
 const {thaiAdaptiveFaceGeometry,...previousFields}=thai;
 const archivedThai={...previousFields,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_PREVIOUS_V8};
 const archivedV9={...previousFields,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_PREVIOUS_V9};
 const archivedV10={...previousFields,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_PREVIOUS_V10};
 assert.doesNotThrow(()=>validateProductionPortrait(input,thai));
 assert.doesNotThrow(()=>validateProductionPortrait(input,archivedThai));
 assert.doesNotThrow(()=>validateProductionPortrait(input,archivedV9));
 assert.doesNotThrow(()=>validateProductionPortrait(input,archivedV10));
 assert.throws(()=>validateProductionPortrait(input,{...thai,thaiAdaptiveFaceGeometry:'{}'}));
 assert.throws(()=>validateProductionPortrait(input,{...thai,thaiAdaptiveFaceGeometry:undefined}));
 assert.throws(()=>validateProductionPortrait(input,{...archivedV10,thaiAdaptiveFaceGeometry}));
 assert.throws(()=>validateProductionPortrait(input,{...thai,thaiOutfitAppearanceVersion:'unknown'}));
 assert.throws(()=>validateProductionPortrait(input,{...english,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION}));
 const calls=[];
 for(const fields of [archivedThai,english]){
  const requests=[];
  const out=await processProductionPortrait({input,fields,root,key:'same',removeBackground:async()=>result,requestPortrait:async request=>{requests.push(request);return {png:result}}});
  assert.equal(requests.length,1,'Only one whole-garment generation');
  assert(out.length);calls.push(requests[0]);
 }
 assert.equal(calls[0].prompt,calls[1].prompt,'Exactly the same prompt');
 assert.equal(calls[0].size,calls[1].size,'Exactly the same output dimensions');
 assert.equal(calls[0].portraitMime,calls[1].portraitMime);
 assert.deepEqual(calls[0].portrait,calls[1].portrait,'Same composition reference pixels');
 assert.deepEqual(calls[0].outfit,calls[1].outfit,'Same native outfit pixels');
 assert.equal(usesThaiHistoricOutfitPrompt(thai),false);
 const calibratedCalls=[];
 const newOutput=await processProductionPortrait({
  input,fields:thai,root,key:'thai-adaptive-v11',
  removeBackground:async()=>result,
  requestPortrait:async p=>{calibratedCalls.push(p);return {png:result}}
 });
 assert(newOutput.length);
 assert.equal(calibratedCalls.length,1,'Thai V11 uses the same one AI generation');
 assert.equal(calibratedCalls[0].size,calls[0].size);
 assert.deepEqual(calibratedCalls[0].outfit,calls[0].outfit,'Original suit pixels must never change');
 assert.notDeepEqual(calibratedCalls[0].portrait,calls[0].portrait,'New Thai guide must actually be calibrated');
 assert.match(calibratedCalls[0].prompt,/THAI V11 ADAPTIVE REAL-FACE/);
 assert.match(calibratedCalls[0].prompt,/individual head-to-shoulder reference target/);
 assert.doesNotMatch(calibratedCalls[0].prompt,/THAI COMPACT PROPORTION V10/);
 assert.match(calibratedCalls[0].prompt,/THAI IDENTITY LOCK/);
 assert.match(calibratedCalls[0].prompt,/NEVER enlarge eyes, narrow nose/);
 assert.doesNotMatch(calibratedCalls[0].prompt,/ENGLISH FEMALE V2 — BALANCED HEAD\/BODY/,'Thai V11 must not include a conflicting English head-size target');
 assert(!calibratedCalls[0].prompt.includes('older small-head'), 'No conflicting legacy target');
 assert.equal(usesThaiHistoricOutfitPrompt(archivedThai),false,'v8 job replay must not gain old historical prompt');
 assert.equal(usesThaiHistoricOutfitPrompt(archivedV9),false,'v9 job replay must not gain old historical prompt');
 assert.equal(usesThaiHistoricOutfitPrompt(archivedV10),false,'v10 job replay must not gain old historical prompt');
 const archivedV9Calls=[];
 await processProductionPortrait({input,fields:archivedV9,root,key:'archived-v9',
  removeBackground:async()=>result,requestPortrait:async p=>{archivedV9Calls.push(p);return {png:result}}});
 assert.equal(archivedV9Calls.length,1);
 assert.match(archivedV9Calls[0].prompt,/THAI FIXED-CAMERA PORTRAIT V9/);
 assert.doesNotMatch(archivedV9Calls[0].prompt,/THAI IDENTITY LOCK|THAI COMPACT PROPORTION V10/);
 assert.notDeepEqual(archivedV9Calls[0].portrait,calibratedCalls[0].portrait);
 const archivedV10Calls=[];
 await processProductionPortrait({input,fields:archivedV10,root,key:'archived-v10',
  removeBackground:async()=>result,requestPortrait:async p=>{archivedV10Calls.push(p);return {png:result}}});
 assert.equal(archivedV10Calls.length,1);
 assert.match(archivedV10Calls[0].prompt,/THAI COMPACT PROPORTION V10/);
 assert.doesNotMatch(archivedV10Calls[0].prompt,/THAI V11 ADAPTIVE REAL-FACE/);


 assert.equal(usesThaiEnglishParityOutfit(thai),false,'No Thai-only prompt addition');
 assert.equal(requiresThaiNativeFrontShield(thai),false,'No post-render clothing overlay');
 const previousV5={...thai,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_OLD_NECK_V5};
 assert.equal(requiresThaiNativeFrontShield(previousV5),true,'Historical jobs unchanged');
 assert.equal(usesThaiHistoricOutfitPrompt(previousV5),true);
 assert.equal(thai.interfaceLanguage,'th','Thai rights stay Thai');
 const main=await readFile(root+'src/main.jsx','utf8');
 assert(main.includes('...(thaiWholeOutfit?[THAI_OUTFIT_APPEARANCE_VERSION]:[])'));
 assert(main.includes("fd.append('thaiOutfitAppearanceVersion',THAI_OUTFIT_APPEARANCE_VERSION)"));
});


test('Thai V11 adaptive head guide preserves native suit across different crop dimensions',async()=>{
 const {createEnglishBodyLayout}=await import('../english-body-layout.js');
 const {thaiAdaptiveHeadProfile}=await import('../thai-adaptive-proportion.js');
 const outfit=await readFile(root+'public/assets/government-uniforms/female-operational.png');
 const shape={version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53};
 const compositions=[];
 const sizes=[[100,110],[95,170],[120,155],[100,185]];
 for(const [width,height] of sizes){
  const identity=await sharp({create:{width,height,channels:3,background:'#c58554'}}).png().toBuffer();
  const profile=thaiAdaptiveHeadProfile('female',shape,height/width);
  const composition=await createEnglishBodyLayout(outfit,{
   profile,headScale:profile.identityHeadScale,identity,canvasWidth:1824,
   fixedIdentityEnvelope:true,stableGarmentFrame:true
  });
  const {data,info}=await sharp(composition).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,1824);assert.equal(info.height,2432);
  let left=info.width,right=-1,top=info.height,bottom=-1;
  // The source identity colour is absent from the neutral guide and actual suit.
  for(let y=0;y<info.height*.55;y+=2)for(let x=0;x<info.width;x+=2){
   const at=(y*info.width+x)*4;
   if(Math.abs(data[at]-197)>4||Math.abs(data[at+1]-133)>4||Math.abs(data[at+2]-84)>4||data[at+3]<245)continue;
   left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  assert(right>left&&bottom>top,'Guide must retain the real face pixels at each input aspect');
  const faceAspect=(bottom-top+2)/(right-left+2),sourceAspect=height/width;
  assert(Math.abs(faceAspect/sourceAspect-1)<.09,'Never distort intrinsic source face proportions');
  compositions.push({data,info,faceWidth:right-left+2});
 }
 const a=compositions[0],start=Math.floor(a.info.height*.68)*a.info.width*4;
 for(const other of compositions.slice(1)){
  assert.deepEqual(a.data.subarray(start),other.data.subarray(start),'Native suit pixels and framing stay identical for every face aspect');
  assert(Math.abs(other.faceWidth/a.faceWidth-1)<.065,'Tall face crop must not silently shrink the head width');
 }
 const profile=thaiAdaptiveHeadProfile('female',shape,1.50);
 const male=thaiAdaptiveHeadProfile('male',shape,1.50);
 assert.equal(profile.identityHeadScale,.94);
 assert(profile.identityHeadScale*profile.headWidthToShoulder>.32);
 assert(profile.identityHeadScale*profile.headWidthToShoulder<.37);
 assert(male.identityHeadScale*male.headWidthToShoulder>.31);
 assert(male.identityHeadScale*male.headWidthToShoulder<.37);
 assert(profile.headHeightToShoulder>profile.headWidthToShoulder*1.48,'Natural crop aspect sets head-guide height');
});

test('Thai V11 landmarks ignore source canvas crop and choose a bounded per-person head guide',async()=>{
 const {measureThaiAdaptiveFace,parseThaiAdaptiveFace,thaiAdaptiveHeadProfile}=await import('../thai-adaptive-proportion.js');
 const coordinates={33:[-24,-18],263:[24,-18],234:[-45,0],454:[45,0],172:[-35,25],397:[35,25],10:[0,-67],152:[0,68]};
 const scaled=(width,height,zoom)=>{
  const landmarks=Array.from({length:468},()=>({x:.5,y:.5}));
  for(const [id,[x,y]] of Object.entries(coordinates)){
   landmarks[Number(id)]={x:(width/2+x*zoom)/width,y:(height/2+y*zoom)/height};
  }
  return measureThaiAdaptiveFace(landmarks,width,height);
 };
 const reference=scaled(500,600,1);
 assert.deepEqual(scaled(900,950,2),reference,'Camera zoom must not become physical head size');
 assert.deepEqual(scaled(350,600,.8),reference,'Changing blank margins must not become head size');
 assert.equal(reference.version,1);
 assert.throws(()=>parseThaiAdaptiveFace('{"version":1,"faceAspect":99,"jawRatio":.7,"eyeRatio":.5}',{required:true}));
 const broad=thaiAdaptiveHeadProfile('female',{version:1,faceAspect:1.20,jawRatio:.91,eyeRatio:.58},1.25);
 const narrow=thaiAdaptiveHeadProfile('female',{version:1,faceAspect:1.83,jawRatio:.61,eyeRatio:.48},1.87);
 assert.notEqual(broad.headWidthToShoulder,narrow.headWidthToShoulder,'Measurements must change the head guide, unlike V9/V10');
 assert(broad.headWidthToShoulder*broad.identityHeadScale>.32);
 assert(narrow.headWidthToShoulder*narrow.identityHeadScale<.37);
 assert(narrow.headHeightToShoulder>broad.headHeightToShoulder,'A long face gets a taller envelope, not a shrunken face');
 const client=await readFile(root+'src/main.jsx','utf8');
 assert(client.includes('measureThaiAdaptiveFace(face,W,H)'), 'One source landmark analysis also measures V11');
 assert(client.includes("fd.append('thaiAdaptiveFaceGeometry',JSON.stringify(measured.geometry))"));
 assert(client.includes('Thai V11: a non-generative check of original vs completed face geometry'));
});

test('Thai native uniform reliably occludes hair over both jacket fronts and clips hanging outer hair without touching face',async()=>{
 const W=240,H=320;
 // The artificial AI result has black hair on BOTH white jacket panels,
 // black hair outside the garment and a red-brown face above the shoulders.
 const original=await sharp({create:{width:W,height:H,channels:4,background:'#c78672'}}).png().toBuffer();
 const stripe=await sharp({create:{width:16,height:190,channels:4,background:'#050608'}}).png().toBuffer();
 const tainted=await sharp(original).composite([
  {input:stripe,left:62,top:125},{input:stripe,left:160,top:125},{input:stripe,left:14,top:125}
 ]).png().toBuffer();
 // Native transparent outfit with an open neckline at the top.
 const front=await sharp({create:{width:W,height:H,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([
  {input:await sharp({create:{width:176,height:205,channels:4,background:'#f7f6f2'}}).png().toBuffer(),left:32,top:115}
 ]).png().toBuffer();
 const geometry={nativeForeground:front,shoulderTopY:115,collarTopY:150,centerX:120,shoulderSpan:176};
 const returned=await shieldThaiNativeUniformFront(tainted,geometry);
 const {data,info}=await sharp(returned).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const pixel=(x,y)=>[...data.subarray((y*W+x)*4,(y*W+x)*4+4)];
 assert.deepEqual(pixel(60,70),[199,134,114,255],'Face and skin above shoulder level remain unchanged');
 assert.deepEqual(pixel(70,220),[247,246,242,255],'Left hair is fully covered by the real outfit pixels');
 assert.deepEqual(pixel(166,220),[247,246,242,255],'Right hair is fully covered by the real outfit pixels');
 assert.equal(pixel(18,220)[3],0,'Hair protruding outside the uniform silhouette is removed');
 assert.deepEqual(pixel(120,220),[247,246,242,255],'Original shirt and central garment remain visible');
 assert.deepEqual(pixel(70,110),[199,134,114,255],'Nothing above shoulder line is edited');
 assert.equal(info.width,W);
});

test('Thai v4 protects the actual sloping shoulder edge and neck opening without cyan seams or flat-cut hair',async()=>{
 const W=240,H=320;
 const skin=[199,134,114,255],black=[5,6,8,255],white=[247,246,242,255];
 const stripe=async(width,height,colour)=>sharp({create:{width,height,channels:4,background:colour}}).png().toBuffer();
 const source=await sharp({create:{width:W,height:H,channels:4,background:'#c78672'}}).png().toBuffer();
 const original=await sharp(source).composite([
  {input:await stripe(14,160,'#050608'),left:93,top:100},
  {input:await stripe(12,160,'#050608'),left:150,top:100},
  {input:await stripe(10,160,'#050608'),left:10,top:100}
 ]).png().toBuffer();
 const native=await sharp({create:{width:W,height:H,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
  .composite([
   {input:await stripe(50,200,'#f7f6f2'),left:30,top:120},
   {input:await stripe(50,200,'#f7f6f2'),left:160,top:120},
   {input:await stripe(80,148,'#f7f6f2'),left:80,top:172},
   {input:await stripe(40,8,'#32cfff'),left:100,top:156}
  ]).png().toBuffer();
 const layout={nativeForeground:native,shoulderTopY:120,collarTopY:167,centerX:120,shoulderSpan:176};
 const fixed=await shieldThaiNativeUniformFront(original,layout);
 const legacy=await shieldThaiNativeUniformFront(original,layout,{legacy:true});
 const inspect=async img=>{
  const {data}=await sharp(img).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  return (x,y)=>[...data.subarray((y*W+x)*4,(y*W+x)*4+4)];
 };
 const now=await inspect(fixed),old=await inspect(legacy);
 assert.deepEqual(now(100,110),black,'Hair above the shoulders remains original');
 assert.deepEqual(now(100,145),black,'Hair is not horizontally cut before the LOCAL centre collar begins');
 assert.equal(old(94,145)[3],0,'v3 had incorrectly erased hair outside its too-narrow neck exemption with global shoulder clipping');
 assert.deepEqual(now(100,220),white,'Below the local collar, the actual uniform covers forward hair');
 assert.deepEqual(now(165,220),white,'Both shoulders are opaque and hair-free');
 assert.deepEqual(now(120,160),skin,'Cyan template seam is never pasted over the neck skin');
 assert.deepEqual(now(120,80),skin,'Face stays pixel-identical');
 assert.equal(now(15,230)[3],0,'Outer stray hair beneath shoulder gradually disappears');
 assert.equal(now(15,140)[3]>0,true,'Outer hair is not cut at one global shoulder level');
});

test('Thai v5 leaves neck skin, native-collar seam and tie pixels unmodified while clearing only side-front hair',async()=>{
 const W=240,H=320,skin=[199,134,114,255],jacket=[247,246,242,255];
 const solid=async(w,h,color)=>sharp({create:{width:w,height:h,channels:4,background:color}}).png().toBuffer();
 const source=await sharp({create:{width:W,height:H,channels:4,background:'#c78672'}}).png().toBuffer();
 const hair=await solid(15,170,'#07090a');
 const original=await sharp(source).composite([
  {input:hair,left:53,top:100},{input:hair,left:172,top:100},
  {input:await solid(20,56,'#1a1c1d'),left:110,top:163},
  {input:await solid(44,7,'#d2c8ed'),left:98,top:170}
 ]).png().toBuffer();
 const native=await sharp({create:{width:W,height:H,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([
  {input:await solid(75,200,'#f7f6f2'),left:17,top:120},
  {input:await solid(75,200,'#f7f6f2'),left:148,top:120},
  {input:await solid(56,178,'#f7f6f2'),left:92,top:142},
  {input:await solid(66,10,'#15dfff'),left:87,top:157},
  {input:await solid(22,55,'#110c0c'),left:109,top:180}
 ]).png().toBuffer();
 const layout={nativeForeground:native,shoulderTopY:120,collarTopY:167,centerX:120,shoulderSpan:176};
 const result=await shieldThaiNativeUniformFront(original,layout,{necklineProtected:true});
 const raw=async image=>(await sharp(image).ensureAlpha().raw().toBuffer({resolveWithObject:true})).data;
 const a=await raw(original),b=await raw(result),idx=(x,y)=>(y*W+x)*4;
 const sample=(data,x,y)=>[...data.subarray(idx(x,y),idx(x,y)+4)];
 for(const [x,y] of [[120,160],[120,180],[120,195],[109,168],[126,180],[110,210],[132,210]]){
  assert.deepEqual(sample(b,x,y),sample(a,x,y),'Never change native neck/collar/tie pixels at '+x+','+y);
 }
 assert.deepEqual(sample(b,59,220),jacket,'Left forward hair must be occluded by the genuine jacket');
 assert.deepEqual(sample(b,179,220),jacket,'Right forward hair must be occluded by the genuine jacket');
 assert.deepEqual(sample(b,59,100),[7,9,10,255],'Hair over the shoulder line is still natural, not horizontally cropped');
 assert.deepEqual(sample(b,120,75),skin,'Face stays exactly the same');
});

test('Thai v6 bypasses all native post-mask layers while v3-v5 archived jobs remain readable',async()=>{
 const core={thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png'};
 const updated={...core,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION};
 const legacy={...core,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_PREVIOUS};
 assert.equal(requiresThaiNativeFrontShield(updated),false,'New Thai v6 does not paste any suit or cut hair');
 assert.equal(requiresThaiNativeFrontShield(legacy),false);
 assert.equal(requiresThaiNativeFrontShield({...core,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_LEGACY_SHIELD_VERSION}),true,'Queued v3 uses its original legacy clipping');
 assert.equal(usesThaiShoulderAwareShield(updated),false);
 assert.equal(usesThaiNecklineProtectedShield(updated),false);
 assert.equal(usesThaiNecklineProtectedShield({...core,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_OLD_NECK_VERSION}),false);
 assert.equal(usesThaiNecklineProtectedShield({...core,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_OLD_NECK_V5}),true);
 assert.equal(usesThaiShoulderAwareShield({...core,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_LEGACY_SHIELD_VERSION}),false);
 assert.equal(requiresThaiNativeFrontShield({thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,interfaceLanguage:'en'}),false);
 const source=await readFile(root+'production-portrait-pipeline.js','utf8');
 assert(source.includes('const frontShield=requiresThaiNativeFrontShield(fields)&&templateBody&&!headOnly'));
 assert(source.includes('const delivered=frontShield?await shieldThaiNativeUniformFront(transparent,nativeFrontGeometry,{legacy:!usesThaiShoulderAwareShield(fields),necklineProtected:usesThaiNecklineProtectedShield(fields)}):transparent'));
 const layout=await readFile(root+'english-body-layout.js','utf8');
 assert(layout.includes('if(!returnNativeForeground)return composition'),'All English output remains original one-pass composition');
 const main=await readFile(root+'src/main.jsx','utf8');
 assert(main.includes('...(thaiWholeOutfit?[THAI_OUTFIT_APPEARANCE_VERSION]:[])'),'Thai cache version invalidates buggy old previews');
});

test('Thai outfit uses the exact English mobile card and explicit AI creation flow',async()=>{
 const studio=await readFile(root+'src/studio-editor.jsx','utf8');
 const englishCss=await readFile(root+'src/english-portrait-flow.css','utf8');
 assert(studio.includes('return visiblePicker===\'suit\'?<div key={o.id||i} className="english-outfit-card">'),'Same outfit card for both locales');
 assert(studio.includes('className="english-outfit-ai"'),'Same AI button style and position for both locales');
 assert(studio.includes("englishFlow?'Edit with AI':'ใส่ชุดด้วย AI'"),'Only button language changes');
 assert(studio.includes('onClick={()=>englishFlow?startOutfitAi(o):createThaiOutfitAi(o)}'),'Separate authorization, shared card');
 assert(!studio.includes('thai-mobile-ai-guide'),'No oversized Thai instructions above outfits');
 assert(!studio.includes('thai-mobile-ai-main-action'),'No duplicate AI call-to-action');
 assert(!studio.includes('thai-mobile-ai-next'),'No extra instructional block');
 assert(englishCss.includes('.english-outfit-card .english-outfit-ai'),'The mobile AI control uses existing English styling');
 assert(studio.includes("void selectAsset(visiblePicker,o,{manualOverride:visiblePicker==='suit'&&!englishFlow})"),'Tapping garment only selects the PNG');
 assert(studio.includes('const createThaiOutfitAi=option=>'),'Thai AI choice opens the hair step, not provider immediately');
 assert(studio.includes('const confirmThaiOutfitAi=async()=>'),'Explicit confirmation is still required');
 assert(studio.includes("await selectAsset('suit',outfit,{aiSetup:true})"),'Chosen suit preserved');
 assert(studio.includes("await processPhoto({hairId:hair||firstGenerationHairFor(draft.portraitMode),portraitMode:draft.portraitMode,continueWithoutSave:true,explicitCreate:true,outfitAiCreate:true})"),'Confirm starts AI once');
});

test('Thai PNG suit reinsert restores identical frame and user transform instead of stretching from portrait placement',async()=>{
 const studio=await readFile(root+'src/studio-editor.jsx','utf8');
 assert(studio.includes('const removedThaiSuitRef=useRef(null)'), 'Keep the prior outfit frame for the same photo');
 assert(studio.includes("if(englishFlow||layerKind(layer)!=='suit'||!layer.templatePath)return"),'Only Thai suit layers are cached');
 assert(studio.includes('if(removed)saveRemovedThaiSuit(removed)'), 'Deleting a suit saves its exact pose');
 assert(studio.includes('if(target)saveRemovedThaiSuit(target)'), 'Removing a suit through the picker also saves pose');
 assert(studio.includes("option?.template===removedThaiSuitRef.current?.templatePath"), 'Restore only when the exact removed outfit is selected again');
 assert(studio.includes('sourceFrame:{...frame},collarFrame:{...(layer.collarFrame||frame)}'), 'Save frame rather than recalculating from AI portrait placement');
 assert(studio.includes('x:layer.x??0,y:layer.y??0,scale:layer.scale??1,rotation:layer.rotation??0'), 'Save exact existing transform');
 assert(studio.includes('restoredSuit?.sourceFrame||restoredSuit?.collarFrame||defaultFrame'), 'Native reinsert uses prior geometry first');
 assert(studio.includes('createSuitDisplayPreview(target||restoredSuit,option,image,placementRef.current)'), 'Instant preview cannot flash stretched garment');
 assert(studio.includes("await quickSuitSelection({option,target,fitHead,manualSuit,restoredSuit})"), 'Thumbnail path also preserves outfit frame');
 assert(studio.includes("...(kind==='suit'&&restoredSuit?restoredSuit:{})"), 'Native path restores previous scale and position');
 assert(studio.includes('useEffect(()=>{removedThaiSuitRef.current=null},[sourcePhoto])'), 'Never leak suit placement to another uploaded photo');
 assert(studio.includes("const manualSuit=englishFlow&&kind==='suit'&&!aiSetup||(!englishFlow&&kind==='suit'&&!aiSetup&&manualOverride)"), 'Existing English and Thai manual actions remain intact');
});

test('new checkout restores original prices and sold AI10 receipt terms remain frozen',()=>{
 const basic=checkoutPackage('89'),fresh=checkoutPackage('159');
 assert.equal(basic.id,'download_89_v1');assert.equal(basic.price,89);
 assert.equal(fresh.id,'download_159_hair_v1');assert.equal(fresh.price,159);assert.equal(fresh.g+fresh.h,0);assert.equal(fresh.requiresImage,true);assert.equal(fresh.fullEdit,true);
 assert.equal(packageFor('download_159_ai10_v2').g,10);
 assert.equal(packageFor('download_159_hair_v1').g,0);
 assert.throws(()=>checkoutPackage('download_159_ai10_v2'));
});

test('unlimited owner uses only the authenticated identity bound to the request wallet',()=>{
 assert(isPrivateOwner({accountUser:{email:'treeradech009@gmail.com',wallet_id:'wal-owner'}},'wal-owner'));
 assert(!isPrivateOwner({accountUser:{email:'treeradech009@gmail.com',wallet_id:'wal-owner'}},'wal-other'));
 assert(!isPrivateOwner({body:{email:'treeradech009@gmail.com'}},'wal-owner'));
});

const store=await readFile(root+'payment-store.js','utf8');
const reserveSource=store.slice(store.indexOf('export async function reserveThaiAiEdit('),store.indexOf('// Compatibility entry point:')).replace('export async','async');
function fakeCredits(paid=0){
 const wallet={generation_remaining:paid,hair_remaining:0,full_edit_remaining:paid},usage=[];
 let tail=Promise.resolve(),locked=0;
 const pool={connect:async()=>{let unlock=null;return {release(){},async query(sql,p=[]){
  if(sql.includes('FROM wallets')&&sql.includes('FOR UPDATE')){const previous=tail;tail=new Promise(r=>unlock=r);await previous;locked++;return {rows:[{...wallet}],rowCount:1}}
  if(sql==='COMMIT'||sql==='ROLLBACK'){unlock?.();return {rows:[]}}
  if(sql.includes('COUNT(*)'))return {rows:[{used:usage.filter(u=>u.kind==='thai-daily-ai-edit'&&u.status!=='refunded').length}]};
  if(sql.startsWith('UPDATE wallets')){const column=sql.match(/SET ([a-z_]+)=/)[1];wallet[column]--;return {rows:[]}}
  if(sql.startsWith('INSERT INTO credit_usage')){usage.push({id:p[0],kind:p[2],column:p[3],full:p[4],status:'reserved'});return {rows:[],rowCount:1}}
  if(sql==='BEGIN')return {rows:[]};
  throw Error('Unexpected query: '+sql);
 }}}};
 const reserve=Function('pool','ready','crypto','remaining','THAI_DAILY_AI_LIMIT',reserveSource+';return reserveThaiAiEdit')(pool,async()=>{},crypto,remaining,2);
 return {reserve,wallet,usage,get locked(){return locked}};
}
test('historical Thai reservations retain their shared pool and two-slot accounting for safe settlement/refunds',async()=>{
 const state=fakeCredits(10);
 const runs=await Promise.all(Array.from({length:14},(_,i)=>state.reserve('wallet',i%2?'hairstyle':'ai-finish')));
 assert.equal(runs.filter(Boolean).length,12);
 assert.equal(runs.filter(r=>r?.trialPreview).length,2);
 assert.equal(state.wallet.generation_remaining,0);assert.equal(state.wallet.full_edit_remaining,0);
 assert.equal(state.usage.filter(u=>u.column==='generation_remaining').length,10);
 assert.equal(state.locked,14);
});
test('failed Thai daily requests use the refund branch without adding paid credits',()=>{
 const refund=store.slice(store.indexOf('export async function refundCredit('),store.indexOf('export async function walletHistory'));
 const branch=refund.slice(refund.indexOf("if(['english-daily-ai-outfit','thai-daily-ai-edit']"),refund.indexOf('const isUsd='));
 assert.match(branch,/status='refunded'/);assert.doesNotMatch(branch,/UPDATE wallets/);
});

test('authenticated unlimited owner bypasses both free and paid reservation paths',async()=>{
 const server=await readFile(root+'server.js','utf8');
 const start=server.indexOf('async function requireCredit(req,res,kind){'),end=server.indexOf('\nconst upload=multer(',start);
 let reservations=0;
 const deps={walletId:()=> 'wal-owner',isPrivateOwner,hasPrivateTrial:(req,w)=>isPrivateOwner(req,w),getWallet:async()=>({generationRemaining:0,hairRemaining:0}),crypto,reserveThaiAiEdit:()=>{reservations++;throw Error('Owner must not reserve')},reserveEnglishDailyAiOutfit:()=>{reservations++;throw Error('Owner must not reserve')}};
 const credit=Function('deps','with(deps){'+server.slice(start,end)+';return requireCredit}')(deps);
 const req={accountUser:{email:'treeradech009@gmail.com',wallet_id:'wal-owner'},get:()=>'',body:{interfaceLanguage:'th'}};
 for(let i=0;i<30;i++){const result=await credit(req,{status(){throw Error('Owner rejected')}},i%2?'hairstyle':'ai-finish');assert(result.usageId.startsWith('private_full_'));assert.equal(result.trialPreview,false)}
 assert.equal(reservations,0);
});


test('Studio suit permission subscription is stable during parent progress renders',async()=>{
 const ed=await readFile(root+'src/studio-editor.jsx','utf8');
 const start=ed.indexOf(' const selectSuitPolicyRef=useRef(onSelectSuit)'),end=ed.indexOf(' const canUseAllSuits=',start);
 assert(start>=0&&end>start);
 const effect=ed.slice(start,end);
 assert.match(effect,/if\(processActive\)return/);
 assert.match(effect,/selectSuitPolicyRef\.current\(head\.jobId/);
 assert.match(effect,/\[accountScope,outputKey,currentSuit,restrictedTrial,hasSuitPolicyCallback,suitPolicyUnlockId,processActive\]/);
 assert.doesNotMatch(effect,/\[outputKey,restrictedTrial,onSelectSuit/);
 assert.match(effect,/!cancelled&&outputScopeRef\.current===accountScope/);
});
test('Thai frontend and regular usage restore the pre-AI-bundle behavior',async()=>{
 const [ed,main,easy,offers,server]=await Promise.all(['src/studio-editor.jsx','src/main.jsx','src/easy-mode.jsx','src/package-offers.jsx','server.js'].map(p=>readFile(root+p,'utf8')));
 assert.match(offers,/price:'159',name:'รับรูปนี้ \+ ทรงผม',features:'เลือกชุด 5 ชุด · ปลดล็อกทรงผม'/);
 assert.match(offers,/price:'89',name:'รับรูปนี้',features:'เลือกชุด 3 ชุด · ทรงผมพื้นฐาน'/);
 assert.doesNotMatch(offers,/AI 10 ครั้ง/);
 assert.doesNotMatch(ed,/onSuitAi|studio-ai-trial-note|thaiOutfitAi:!englishFlow/);
 assert.doesNotMatch(easy,/initialOutfitAi|onSuitAi/);
 assert.doesNotMatch(main,/onCheckEnglishOutfitAi=\{async\(\)=>\{[^\n]*thai-ai-edit/);
 assert.doesNotMatch(server,/reserveThaiAiEdit|thai_ai_daily_limit|\/api\/thai-ai-edit\/access/);
});
test('ordinary Thai generation is not subject to the removed two-per-day quota or the AI10 pool',async()=>{
 const server=await readFile(root+'server.js','utf8'),a=server.indexOf('async function requireCredit(req,res,kind){'),b=server.indexOf('\nconst upload=multer(',a);
 const deps={crypto,walletId:()=> 'wallet',isPrivateOwner:()=>false,downloadHairAllowed:()=>true,PRODUCTION_HAIR_CATALOG:[{id:'seedream-14',gender:'female'}],THAI_FREE_FEMALE_HAIR_IDS:['seedream-14'],getWallet:async()=>({usdPremiumPurchased:false}),accountPolicy:()=>{throw Error('Basic Thai hair must not require Premium')},reserveThaiAiEdit:()=>{throw Error('Removed daily quota must not be used')}};
 const run=Function('deps','with(deps){'+server.slice(a,b)+';return requireCredit}')(deps);
 const req={body:{hairId:'seedream-14',interfaceLanguage:'th'},get:()=>''},res={status(){throw Error('Thai basic request rejected')}};
 for(let i=0;i<8;i++){const out=await run(req,res,i%2?'hairstyle':'ai-finish');assert(out.usageId.startsWith('free_'));assert.equal(out.trialPreview,true);assert.equal(out.generationRemaining,0)}
});


test('Thai native suit placement never distorts the catalog garment, including replacing the same suit',async()=>{
 const preview=await readFile(root+'src/studio-suit-preview.js','utf8');
 const begin=preview.indexOf('export function nativeSuitAspectFrame(');
 const end=preview.indexOf('export function createSuitDisplayPreview(',begin);
 assert(begin>=0&&end>begin,'Native aspect helper exists');
 const compute=Function(preview.slice(begin,end).replace('export function','function')+';return nativeSuitAspectFrame')();
 for(const [w,h] of [[300,720],[1000,720],[720,1340],[900,1200]]){
  const from={x:-10,y:300,w:900,h:1200};
  const result=compute(from,{width:w,height:h});
  assert.equal(result.w,900,'Garment does not shrink or enlarge in width');
  assert.equal(result.h,result.w*h/w,'Garment height follows its own pixels, not the previous suit');
  assert.equal(result.x,from.x);assert.equal(result.y,from.y);
 }
 const studio=await readFile(root+'src/studio-editor.jsx','utf8');
 assert(studio.includes('nativeSuitAspectFrame(frame,quick.source)'),'Preview selection uses new PNG ratio');
 assert(studio.includes('nativeSuitAspectFrame(l.sourceFrame,high.source)'),'Native upgrade uses original PNG ratio');
 assert(studio.includes("kind==='suit'&&!englishFlow?nativeSuitAspectFrame("),'Fallback selection uses original ratio');
 assert(studio.includes("...(manualSuit&&!englishFlow)")===false,'No independent suit scale override');
 assert(studio.includes("!singleCollarSide&&(englishFlow||layerKind(current)!=='suit')"),'Thai suit has no side squeeze handles');
 assert(studio.includes("!englishFlow&&layerKind(base)==='suit'&&('squeezeX' in patch||'squeezeY' in patch)"),'Thai suit cannot be squeezed by sliders');
 assert(studio.includes("&&!(manualSuit&&!englishFlow)"),'Re-selecting the same Thai suit repairs its stale frame');
});


test('Thai government insignia menu uses the finished portrait and refuses uncertain placement',async()=>{
 const {detectWhiteGovernmentJacket,isGovernmentUniform,governmentInsigniaPreset}=await import('../src/government-insignia-fit.js');
 const w=600,h=800,data=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;
  data[i]=65;data[i+1]=162;data[i+2]=218;data[i+3]=255;
  const top=Math.floor(h*.43);
  const spread=(y-top)/Math.max(1,h-top);
  if(y>=top&&x>w*(.27-.13*spread)&&x<w*(.73+.13*spread)){
   data[i]=242;data[i+1]=242;data[i+2]=246;
  }
 }
 const found=detectWhiteGovernmentJacket({width:w,height:h,data});
 assert(found,'Actual garment pixels determine the automatic frame');
 assert(found.frame.w>260&&found.frame.w<570);
 assert(found.frame.y>h*.30&&found.frame.y<h*.60);
 const presets=governmentInsigniaPreset(found.frame,'female');
 assert(presets.collar.left<presets.collar.right);
 assert(presets.ribbon.x>.5&&presets.ribbon.x<1);
 assert(isGovernmentUniform('/assets/government-uniforms/female-academic.png'));
 assert(!isGovernmentUniform('/assets/job-uniforms/suit.png'));
 data.fill(255);
 assert.equal(detectWhiteGovernmentJacket({width:w,height:h,data}),null,'A white backdrop does not provide reliable anchors');
 const editor=await readFile(root+'src/studio-editor.jsx','utf8'),easy=await readFile(root+'src/easy-mode.jsx','utf8');
 assert(editor.includes('governmentAutoPlace:true'));
 assert(editor.includes('measureGovernmentInsigniaFrame'));
 assert(editor.includes('if(autoInsignia&&!measuredFrame&&!resultInsigniaDirect)'),'Studio auto placement still fails closed for uncertain jacket measurements');
 assert(editor.includes('resultInsigniaDirect:true'),'The result-only tool allows user-controlled manual placement when auto detection is uncertain');
 assert(editor.includes('governmentResult&&touch&&!easyMode'));
 assert(easy.includes('governmentResult&&hasResult&&<button type="button"'));
 assert(!editor.includes('onChoose={(kind,option)=>void processPhoto('),'Insignia choices never trigger AI');
});

// Easy Mode aligns each badge to detected real white fabric; the underlying
// Studio's public gender preset stays byte-for-byte stable.
test('Easy result insignia pins align to measured jacket, preserve native proportions and cache the first fit',async()=>{
 const {easyGovernmentInsigniaFit,easyGovernmentReferencePreset,governmentInsigniaPreset}=await import('../src/government-insignia-fit.js');
 const w=600,h=800,data=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;
  data[i]=40;data[i+1]=140;data[i+2]=204;data[i+3]=255;
  // A natural white jacket, wider at the bottom and shifted right.
  const top=h*.42,spread=Math.max(0,(y-top)/(h-top));
  if(y>=top&&x>w*(.30-.16*spread)&&x<w*(.72+.16*spread)){
   data[i]=243;data[i+1]=241;data[i+2]=239;
  }
 }
 const image={width:w,height:h,data};
 const fit=easyGovernmentInsigniaFit(image,'female');
 assert(fit,'A clear white government jacket must yield a measured fit');
 const native=easyGovernmentReferencePreset(fit.frame,'female');
 assert.equal(fit.preset.collar.width,native.collar.width,'No resizing the actual pin');
 assert.equal(fit.preset.chest.width,native.chest.width,'No resizing the chest badge');
 assert.equal(fit.preset.ribbon.width,native.ribbon.width,'No resizing the ribbon');
 assert(fit.preset.collar.left<.5&&fit.preset.collar.right>.5,'Paired collar badges must be on their own sides');
 assert(fit.preset.chest.x<.5&&fit.preset.ribbon.x>.5,'Chest pin and ribbon cannot be swapped');
 const inside=(ax,ay)=>{
  const x=Math.round(fit.frame.x+fit.frame.w*ax),y=Math.round(fit.frame.y+fit.frame.h*ay),i=(y*w+x)*4;
  return x>=0&&y>=0&&x<w&&y<h&&data[i]>170&&data[i+1]>170&&data[i+2]>170;
 };
 assert(inside(fit.preset.chest.x,fit.preset.chest.y),'Chest badge on the real garment');
 assert(inside(fit.preset.ribbon.x,fit.preset.ribbon.top+.025),'Ribbon on the real garment');
 // A dark patch covering the default location forces Easy Mode to search
 // for nearby visible fabric, not leave a badge outside the jacket.
 const initialChest={x:Math.round(fit.frame.x+fit.frame.w*fit.preset.chest.x),
  y:Math.round(fit.frame.y+fit.frame.h*fit.preset.chest.y)};
 for(let y=initialChest.y-12;y<=initialChest.y+12;y++)for(let x=initialChest.x-13;x<=initialChest.x+13;x++){
  const index=(y*w+x)*4;
  data[index]=20;data[index+1]=75;data[index+2]=110;
 }
 const corrected=easyGovernmentInsigniaFit(image,'female');
 assert(corrected,'The clear garment still must be detected');
 const correctedX=Math.round(corrected.frame.x+corrected.frame.w*corrected.preset.chest.x);
 const correctedY=Math.round(corrected.frame.y+corrected.frame.h*corrected.preset.chest.y);
 assert(correctedX!==initialChest.x||correctedY!==initialChest.y,'A badge must not remain on a non-fabric spot');
 assert(corrected.preset.chest.width===fit.preset.chest.width,'Reposition never changes official symbol proportions');
 const correctedOffset=Math.hypot(correctedX-initialChest.x,correctedY-initialChest.y);
 assert(correctedOffset<60,'Refine locally; do not let a misplaced hit jump across the garment');
 const editor=await readFile(root+'src/studio-editor.jsx','utf8');
 assert(editor.includes('const easyFit=autoInsignia&&resultInsigniaDirect?measureEasyGovernmentInsigniaFit():null'));
 assert(editor.includes('const preset=easyFit?.preset||('),'Only Easy result placement uses the new correction');
 assert(editor.includes('||easyGovernmentPhotoFallback(W,H,head.portraitMode||hairGender)'),'Photo-reference fallback stays exclusive to Easy Mode');
 assert(editor.includes('easyGovernmentInsigniaFitRef.current?.key===cacheKey'),'Changing insignia cannot drift its anchors by measuring old badge pixels');
 assert(editor.includes('if(autoInsignia&&!measuredFrame&&!resultInsigniaDirect)'),'Original Studio fail-closed path remains untouched');
 const blank=new Uint8ClampedArray(data.length);blank.fill(255);
 assert.equal(easyGovernmentInsigniaFit({width:w,height:h,data:blank},'female'),null,'Never claim to see a uniform in a solid white backdrop');
});

test('Easy government reference male standing-collar and female lapel placements match supplied photo coordinates',async()=>{
 const {easyGovernmentReferencePreset,easyGovernmentPhotoFallback,governmentInsigniaPreset}=await import('../src/government-insignia-fit.js');
 // The supplied portraits are 1504×2047, scaled to the same 900×1200 photo
 // coordinate system. The measured photo jacket occupies this reference frame.
 const frame={x:100.2,y:639.6,w:696.6,h:560.4},W=900,H=1200;
 const male=easyGovernmentReferencePreset(frame,'male');
 const female=easyGovernmentReferencePreset(frame,'female');
 const point=(x,y)=>({x:(frame.x+frame.w*x)/W,y:(frame.y+frame.h*y)/H});
 const check=(actual,expected,tolerance=.018)=>{
  assert(Math.abs(actual-expected)<tolerance,'Reference coordinate '+actual+' differs from expected '+expected);
 };
 const ml=point(male.collar.left,male.collar.y),mr=point(male.collar.right,male.collar.y);
 const fl=point(female.collar.left,female.collar.y),fr=point(female.collar.right,female.collar.y);
 check(ml.x,.448);check(mr.x,.551);check(ml.y,.554,.012);
 check(fl.x,.315);check(fr.x,.687);check(fl.y,.554,.012);
 assert((female.collar.right-female.collar.left)>(male.collar.right-male.collar.left)*3.5,
   'Female collar emblems must be far apart on lapels; male symbols near centre');
 const maleChest=point(male.chest.x,male.chest.y),femaleChest=point(female.chest.x,female.chest.y);
 check(maleChest.x,.286);check(maleChest.y,.695);
 check(femaleChest.x,.23);check(femaleChest.y,.701);
 const mribbon=point(male.ribbon.x,male.ribbon.top),fribbon=point(female.ribbon.x,female.ribbon.top);
 check(mribbon.x,.716);check(mribbon.y,.672);
 check(fribbon.x,.765);check(fribbon.y,.684);
 check(male.ribbon.width*frame.w/W,.21,.018);check(female.ribbon.width*frame.w/W,.205,.018);
 assert(male.collar.width*frame.w/W<.09&&female.collar.width*frame.w/W<.09,'No oversized collar pins');
 const oldMale=governmentInsigniaPreset(frame,'male');
 assert(oldMale.collar.y!==male.collar.y,'The unrelated Studio preset is not rewritten');
 const fallback=easyGovernmentPhotoFallback(W,H,'female');
 check(fallback.preset.collar.left,.315,.001);check(fallback.preset.chest.y,.701,.001);
 check(fallback.preset.ribbon.top,.684,.001);
});
test('Easy white-hem jacket reference can be measured without permitting a fully white background',async()=>{
 const {detectWhiteGovernmentJacket,easyGovernmentInsigniaFit}=await import('../src/government-insignia-fit.js');
 const w=600,h=800,data=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const k=(y*w+x)*4,spread=Math.max(0,(y-h*.42)/(h*.58));
  const white=y>=h*.42&&x>w*(.29-.30*spread)&&x<w*(.72+.30*spread);
  data[k]=white?242:32;data[k+1]=white?241:135;data[k+2]=white?239:225;data[k+3]=255;
 }
 // Simulate a wide white hem touching both lower side borders, just as
 // the supplied full-length white service jackets do in their photos.
 for(let y=Math.floor(h*.69);y<Math.floor(h*.90);y++){
  for(let x=0;x<Math.floor(w*.045);x++){
   for(const xx of [x,w-1-x]){
    const i=(y*w+xx)*4;data[i]=242;data[i+1]=241;data[i+2]=239;
   }
  }
 }
 const img={width:w,height:h,data};
 assert.equal(detectWhiteGovernmentJacket(img),null,'Studio must keep its strict edge-confidence gate');
 const fit=easyGovernmentInsigniaFit(img,'male');
 assert(fit,'Easy Mode must still anchor insignia when the white jacket reaches lower photo edges');
 assert(fit.preset.collar.left<fit.preset.collar.right);
 const allWhite=new Uint8ClampedArray(w*h*4).fill(255);
 assert.equal(easyGovernmentInsigniaFit({width:w,height:h,data:allWhite},'male'),null,'Entire white backgrounds remain indeterminate');
});

test('Thai V12 keeps round/full cheeks, jaw width and face length; rejects narrowing or stretching',async()=>{
 const {compareThaiFaceShape}=await import('../src/face-proportion-check.js');
 const src={faceWidth:.78,jawWidth:.57,eyeToChin:.94,eyeToNose:.43,eyeToMouth:.69};
 assert.equal(compareThaiFaceShape(src,{...src}).ok,true);
 assert.equal(compareThaiFaceShape(src,{...src,faceWidth:.72}).ok,false,'Face narrowing detected');
 assert.equal(compareThaiFaceShape(src,{...src,jawWidth:.51}).ok,false,'Jaw thinning detected');
 assert.equal(compareThaiFaceShape(src,{...src,eyeToChin:1.04}).ok,false,'Vertical face stretch detected');
 const stable={...src,faceWidth:.774,jawWidth:.565,eyeToChin:.939};
 assert.equal(compareThaiFaceShape(src,stable).ok,true,'Small measurement noise remains safe');
 assert.equal(compareThaiFaceShape(src,null).reason,'unmeasurable','No manufactured face geometry');
 const app=await readFile(root+'src/main.jsx','utf8');
 assert(app.includes('compareThaiFaceShape(original,generated)'),'Delivered Thai AI image must be checked');
 assert(app.includes("error.code='face_proportion_changed';throw error"),'Reject measurable face slimming before acceptance');
 assert(app.includes('cached.value.idpromQualityReviewNeeded=true'),'Unmeasurable photo must not be silently marked verified');
});

test('Thai V12 adds face-shape lock only for new jobs; archived V11 and English retain their prompts',async()=>{
 const {
  THAI_OUTFIT_APPEARANCE_VERSION,THAI_OUTFIT_APPEARANCE_PREVIOUS_V11,
  THAI_OUTFIT_AI_VERSION,usesThaiFaceShapeLock
 }=await import('../thai-outfit-ai-policy.js');
 const original={portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,
  englishOutfitFidelityVersion:(await import('../english-outfit-fidelity-version.js')).ENGLISH_OUTFIT_FIDELITY_VERSION,
  portraitMode:'female',hairId:'original',femaleEyeStyle:'makeup',
  neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png',
  faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,
  singlePassPortraitVersion:SINGLE_PASS_PORTRAIT_VERSION,
  femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION,
  thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53})};
 const v12={...original,interfaceLanguage:'th',thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION};
 const v11={...v12,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_PREVIOUS_V11};
 const {thaiAdaptiveFaceGeometry,...englishOriginal}=original;
 const english={...englishOriginal,interfaceLanguage:'en'};
 assert.equal(usesThaiFaceShapeLock(v12),true);
 assert.equal(usesThaiFaceShapeLock(v11),false);
 assert.equal(usesThaiFaceShapeLock(english),false);
 assert.doesNotThrow(()=>validateProductionPortrait(input,v12));
 assert.doesNotThrow(()=>validateProductionPortrait(input,v11));
 const requests=[];
 for(const fields of [v12,v11,english]){
  await processProductionPortrait({input,fields,root,key:'geometry-'+fields.interfaceLanguage+':'+(fields.thaiOutfitAppearanceVersion||'en'),
   removeBackground:async()=>result,
   requestPortrait:async args=>{requests.push(args);return {png:result}}});
 }
 assert.equal(requests.length,3,'Each variant uses exactly one existing AI provider call');
 assert.match(requests[0].prompt,/THAI FACE SHAPE LOCK V12/);
 assert.match(requests[0].prompt,/NEVER slim, narrow, sculpt/);
 assert.doesNotMatch(requests[1].prompt,/THAI FACE SHAPE LOCK V12/,'Old purchased/queued V11 results must not be rewritten');
 assert.doesNotMatch(requests[2].prompt,/THAI FACE SHAPE LOCK V12/,'English requests must remain untouched');
 const source=await readFile(root+'src/main.jsx','utf8');
 assert(source.includes("fd.append('thaiOutfitAppearanceVersion',THAI_OUTFIT_APPEARANCE_VERSION)"));
});
