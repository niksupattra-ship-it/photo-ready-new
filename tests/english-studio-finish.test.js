import {ENGLISH_HEAD_PORTRAIT_VERSION,ENGLISH_HEAD_FINISH_VERSION} from '../english-head-portrait.js';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {processProductionPortrait,validateProductionPortrait} from '../production-portrait-pipeline.js';
import {ENGLISH_STUDIO_FINISH_VERSION} from '../english-studio-finish-policy.js';
import {ENGLISH_REFERENCE_SKIN,englishNaturalStudioSkin,englishReferenceMakeupPrompt} from '../english-studio-finish.js';
import {AI_MAKEUP_PAIR_VERSION} from '../ai-makeup-pair-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {HAIR_REFERENCE_VERSION} from '../catalogue-hair-policy.js';
import {seedreamReviewPayload} from '../seedream-review-transport.js';
import {englishHairFitEvidence} from '../src/english-hair-fit.js';
import {parseEnglishHairFit,createEnglishHairFitGuide} from '../english-hair-fit-guide.js';
const repo=new URL('..',import.meta.url).pathname,root=await mkdtemp(path.join(tmpdir(),'en-soft-studio-'));
const input=await sharp({create:{width:120,height:180,channels:4,background:'#c8a88c'}}).png().toBuffer();
const matte=await sharp({create:{width:120,height:180,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:90,height:160,channels:4,background:'#c8a88c'}}).png().toBuffer(),top:10,left:15}]).png().toBuffer();
const makeup=await sharp(matte).tint('#d19c99').png().toBuffer();
const outfit='/assets/job-uniforms/fixture.png';await mkdir(root+'/public/assets/job-uniforms',{recursive:true});await writeFile(root+'/public'+outfit,matte);
await mkdir(root+'/public/assets/catalogue-hair-guides/v1',{recursive:true});const manifest=JSON.parse(await readFile(repo+'public/assets/catalogue-hair-guides/v1/manifest.json','utf8'));
await writeFile(root+'/public/assets/catalogue-hair-guides/v1/manifest.json',JSON.stringify({entries:{'seedream-41':manifest.entries['seedream-41']}}));await writeFile(root+'/public/assets/catalogue-hair-guides/v1/seedream-41.png',await readFile(repo+'public/assets/catalogue-hair-guides/v1/seedream-41.png'));
const fields={interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_STUDIO_FINISH_VERSION,portraitMode:'female',femaleEyeStyle:'natural',studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,femaleFinishPair:AI_MAKEUP_PAIR_VERSION,neckOutfitReferencePath:outfit};
function faceFixture(){const f=[];for(const[id,x,y]of[[33,.34,.4],[263,.66,.4],[10,.5,.27],[127,.22,.36],[356,.78,.36],[234,.25,.5],[454,.75,.5],[152,.5,.73]])f[id]={x,y};return f}
function bareLabels(hairy=false,cropped=false){const width=120,height=180,data=new Uint8Array(width*height);for(let y=cropped?0:15;y<100;y++)for(let x=22;x<98;x++)data[y*width+x]=hairy&&y<50?1:3;return{data,width,height}}
const fit=englishHairFitEvidence(faceFixture(),120,180,bareLabels());
test('accepted reference skin and cosmetics are separated, retain eyes, and omit the old fair/flash objective',()=>{
 assert.match(ENGLISH_REFERENCE_SKIN,/rather than aiming for visibly fairer skin/);assert.match(ENGLISH_REFERENCE_SKIN,/softly luminous soft-matte finish/);assert.match(englishNaturalStudioSkin(),/Add no lipstick, lip gloss/);assert.doesNotMatch(englishNaturalStudioSkin(),/BROWS — REPLACE OLD|TWO-COLOUR ROSY GRADIENT|#DD9C8C/);
 const m=englishReferenceMakeupPrompt();assert.match(m,/complete cosmetic eyebrow reconstruction/);assert.match(m,/#DD9C8C/);assert.match(m,/40% pigment opacity/);assert.match(m,/no coloured eyeshadow/i);assert.match(m,/iris colour and texture/);assert.match(m,/do not regenerate skin, make the face fairer/);assert.doesNotMatch(m,/\+0\.4|\+0\.6|HEALTHY SKIN AND FACE FLASH|EVEN FAIR ROSY COMPLEXION|EXPOSURE AND BARE-FACE HANDLING/);
});
test('bald scalp evidence needs no hairline; old voluminous hair and clipped crowns cannot become skull evidence',()=>{
 assert(fit.bareScalp&&fit.scalpOutline.length>=5);assert(fit.scalpOutline.every(p=>p.y<.4));assert(!englishHairFitEvidence(faceFixture(),120,180,bareLabels(true)).bareScalp);assert(!englishHairFitEvidence(faceFixture(),120,180,bareLabels(false,true)).bareScalp);
 assert(englishHairFitEvidence(faceFixture(),120,180));assert.equal(englishHairFitEvidence([],120,180),null);assert.throws(()=>parseEnglishHairFit({...fit,points:{}}));assert.throws(()=>parseEnglishHairFit({...fit,scalpOutline:[{x:NaN,y:0}]}));
});
test('personal hair guide uses actual reference-eye geometry and still works when optional guide assets are unavailable',async()=>{
 const hair=await readFile(root+'/public/assets/catalogue-hair-guides/v1/seedream-41.png'),guide=await createEnglishHairFitGuide({fit,hair,selected:{id:'seedream-41'},root});assert(guide?.length);const meta=await sharp(guide).metadata();assert.equal(meta.width,120);assert.equal(meta.height,180);
 const missing=await createEnglishHairFitGuide({fit,hair,selected:{id:'seedream-41'},root:root+'/missing'});assert.equal(missing,null);assert.equal(await createEnglishHairFitGuide({fit:null,hair,selected:{id:'seedream-41'},root}),null);
});
test('current English pairs need exactly two provider calls and no Thai assets; original, selected and kept hair retain their roles',async()=>{
 for(const hairMode of ['original','selected','kept']){
  const calls=[],stages=[];let paired;
  const f={...fields,...(hairMode==='selected'?{hairId:'seedream-41',hairReferenceVersion:HAIR_REFERENCE_VERSION,faceIdentityBox:'[.2,.1,.8,.7]',englishHairFit:JSON.stringify(fit)}:{}),...(hairMode==='kept'?{hairId:'original',keepCurrentHair:'1',preserveHairJobId:'previous'}:{})};if(f.faceIdentityBox)f.faceIdentityBox=JSON.stringify([.2,.1,.8,.7]);
  const out=await processProductionPortrait({input:{buffer:input,mimetype:'image/png'},fields:f,root,key:'inert-not-sent',...(hairMode==='kept'?{currentHair:input}:{}),requestPortrait:async p=>{calls.push(p);return{png:calls.length===1?matte:makeup}},removeBackground:async()=>matte,onStage:async s=>stages.push(s),onMakeupVariant:async p=>{paired=p}});
  assert.equal(calls.length,2);assert.deepEqual(stages,['generation','matting','edges','makeup']);assert(out.length&&paired.length);assert.deepEqual(calls[0].portrait,input);assert(!calls[0].skinReference&&!calls[0].neckReference&&!calls[0].neckShapeReference);assert.match(calls[0].prompt,/softly luminous soft-matte finish/);assert.doesNotMatch(calls[0].prompt,/PREPARED|SKIN\/LIGHT BOARD|COMPLETE THAI HEAD|TWO-COLOUR ROSY GRADIENT|#DD9C8C/);
  assert.match(calls[0].prompt,/27–31%/);assert.match(calls[0].prompt,/NECK LENGTH AND COLLAR ANCHOR/);assert.match(calls[1].prompt,/FINAL ACCEPTED NATURAL SKIN/);assert.match(calls[1].prompt,/Keep the completed hairstyle/);assert.doesNotMatch(calls[1].prompt,/\+0\.4 to \+0\.6/);assert(!calls[1].hair&&!calls[1].identity&&!calls[1].compositionReference);
  const payload=seedreamReviewPayload(calls[0]),images=Array.isArray(payload.image)?payload.image:[payload.image];assert(calls[0].prompt.includes('PROPORTION LAYOUT — IMAGE '+images.length+':'));
  if(hairMode==='selected'){assert(calls[0].hairPlacementReference);assert(calls[0].prompt.includes('PERSONAL HAIR ATTACHMENT GUIDE — IMAGE '+(images.length-1)+':'));assert.match(calls[0].prompt,/bald, thinning or receding scalp is editable/)}
  if(hairMode==='kept'){assert.match(calls[0].prompt,/exact existing hairstyle in Image 2/);assert(!calls[0].hairPlacementReference);assert.doesNotMatch(calls[0].prompt,/BARE OR RECEDING|PERSONAL SCALP ATTACHMENT/)}
  const a=await sharp(out).ensureAlpha().extractChannel(3).raw().toBuffer(),b=await sharp(paired).ensureAlpha().extractChannel(3).raw().toBuffer();assert.deepEqual(a,b);
 }
});
test('male Natural has one generation; failed Makeup cannot publish a partial pair or trigger retries',async()=>{
 let count=0;const result=await processProductionPortrait({input:{buffer:input,mimetype:'image/png'},fields:{...fields,portraitMode:'male',studioSkinVersion:undefined,femaleFinishPair:undefined},root,key:'inert',removeBackground:async()=>matte,requestPortrait:async()=>{count++;return{png:matte}}});assert(result.length);assert.equal(count,1);
 count=0;let stored=0;await assert.rejects(processProductionPortrait({input:{buffer:input,mimetype:'image/png'},fields,root,key:'inert',removeBackground:async()=>matte,onMakeupVariant:async()=>{stored++},requestPortrait:async()=>{if(++count===2)throw Error('provider failure');return{png:matte}}}),/provider failure/);assert.equal(count,2);assert.equal(stored,0);
});
test('English opt-in cannot change Thai or an older English request',()=>{
 for(const patch of [{interfaceLanguage:'th'},{portraitComposition:undefined},{englishStudioFinishVersion:'unknown'}])assert.throws(()=>validateProductionPortrait({buffer:input,mimetype:'image/png'},{...fields,...patch}),/English studio/);
 assert.doesNotThrow(()=>validateProductionPortrait({buffer:input,mimetype:'image/png'},{...fields,englishStudioFinishVersion:undefined}));
});
after(async()=>rm(root,{recursive:true,force:true}));
test('actual English browser request fits real upload limits, preserves two originals, and leaves Thai fields unchanged',async()=>{
 const {default:express}=await import('express'),{default:multer}=await import('multer'),{once}=await import('node:events');
 const {PRODUCTION_HAIR_CATALOG}=await import('../hairstyle-catalog.js'),{NATURAL_STUDIO_SKIN_VERSION}=await import('../natural-studio-skin.js'),{markOriginalPortraitAiFinish,hasOriginalPortraitAiFinish}=await import('../original-portrait-ai.js'),{portraitFinishChoice}=await import('../src/portrait-finish-choice.js');
 const code=await readFile(repo+'src/main.jsx','utf8'),a=code.indexOf('async function aiFinishPortraitUncached('),b=code.indexOf('\n// V206:',a),server=await readFile(repo+'server.js','utf8'),u=server.indexOf('const upload=multer('),v=server.indexOf('\nregisterYoucamHairApi',u),upload=Function('multer',server.slice(u,v)+';return upload')(multer),app=express();
 app.post('/submit',upload.fields([{name:'image',maxCount:1},{name:'originalSource',maxCount:1}]),(req,res)=>{validateProductionPortrait(req.files.image[0],req.body);res.json({fields:Object.keys(req.body).length,files:Object.keys(req.files).length,english:req.body.englishStudioFinishVersion||null})});app.use((err,_req,res,_next)=>res.status(400).json({error:err.message}));const http=app.listen(0,'127.0.0.1');await once(http,'listening');
 try{for(const english of [false,true]){
  const source=Object.assign(new File([input],'original.png',{type:'image/png'}),{idpromDownloadWorkId:'owned-work'}),operation={},calls=[];let submitted,warmed;
  const env={ENGLISH_HEAD_PORTRAIT_VERSION,ENGLISH_HEAD_FINISH_VERSION,ENGLISH_STUDIO_FINISH_VERSION,AI_MAKEUP_PAIR_VERSION,ENGLISH_BODY_PORTRAIT_VERSION:'en-outfit-body-v1',ORIGINAL_PORTRAIT_AI_VERSION,NATURAL_STUDIO_SKIN_VERSION,THAI_NECK_BACKING_VERSION:'complete-thai-u-base-v1',PRODUCTION_HAIR_CATALOG,HAIR_REFERENCE_VERSION,FormData,activeProcessOperation:operation,activeSavedDownloadWork:null,acceptedPaidTrial:false,englishPreviewEnabled:()=>english,assertProcessActive(){},portraitFinishChoice,hasOriginalPortraitAiFinish,warmPortraitResources:async(_source,_template,options)=>{warmed=options},submitPortraitJob:async(_op,run)=>run(),measureEnglishHairPlacement:async()=>fit,replacementFaceIdentityBox:async()=>[.2,.1,.8,.7],saveAiJobFile:async()=>{},walletHeaders:()=>({}),analyticsTagError:e=>e,portraitJobError:e=>e,writeActiveAiJob(){},portraitFetch:async(_url,options)=>{submitted=options.body;calls.push(_url);return{ok:true,json:async()=>({jobId:'same-owned-job'})}},waitForAiJob:async()=>Object.assign(markOriginalPortraitAiFinish(new Blob([matte],{type:'image/png'}),'natural'),{idpromNaturalStudioSkinVersion:NATURAL_STUDIO_SKIN_VERSION})};
  const fn=Function('env',`with(env){${code.slice(a,b)};return aiFinishPortraitUncached}`)(env),result=await fn(source,'seedream-41',{portraitMode:'female',femaleEyeStyle:'natural',templatePath:english?outfit:'/assets/job-uniforms/female-formal-suit.png',sourceJobId:'previous',creditKind:'hairstyle'});
  assert.equal(calls.length,1);assert.equal(warmed.english,english);assert.deepEqual(Buffer.from(await submitted.get('image').arrayBuffer()),input);assert.deepEqual(Buffer.from(await submitted.get('originalSource').arrayBuffer()),input);
  if(english){assert.equal(submitted.get('englishStudioFinishVersion'),ENGLISH_HEAD_FINISH_VERSION);assert(submitted.get('englishHairFit'));assert.equal(result.idpromEnglishStudioFinishVersion,ENGLISH_HEAD_FINISH_VERSION);const r=await fetch('http://127.0.0.1:'+http.address().port+'/submit',{method:'POST',body:submitted});const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));assert(d.fields>12,'cover the old Multer failure boundary');assert.equal(d.files,2)}
  else{assert.equal(submitted.get('englishStudioFinishVersion'),null);assert.equal(submitted.get('englishHairFit'),null);assert.equal(result.idpromEnglishStudioFinishVersion,undefined)}
 }}finally{await new Promise(resolve=>http.close(resolve))}
});
test('actual English warmup does not load unused Thai background/outfit or an unused segmentation model',async()=>{
 const code=await readFile(repo+'src/main.jsx','utf8'),a=code.indexOf('function warmPortraitResources('),b=code.indexOf('\nfunction interp(',a),calls=[],env={loadImage:path=>{calls.push(path);return Promise.resolve()},getLandmarker:async()=>calls.push('landmarks'),getPersonSegmenter:async()=>calls.push('segmentation')};
 const warm=Function('env',`with(env){${code.slice(a,b)};return warmPortraitResources}`)(env);await warm(null,'/outfit',{english:true,requiresSegmentation:false});assert.deepEqual(calls,['landmarks']);calls.length=0;await warm(null,'/outfit',{english:false,requiresSegmentation:true});assert.deepEqual(calls,['/assets/background.jpg','/outfit','landmarks','segmentation']);
});
