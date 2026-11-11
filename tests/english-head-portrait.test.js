import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile,readdir} from 'node:fs/promises';
import {processProductionPortrait,validateProductionPortrait} from '../production-portrait-pipeline.js';
import {ENGLISH_HEAD_PORTRAIT_VERSION,ENGLISH_HEAD_FINISH_VERSION,fitEnglishHeadTemplate} from '../english-head-portrait.js';
import {englishHeadMakeupPrompt} from '../english-head-prompt.js';
import {measureUniformAnchors} from '../src/portrait-uniform-fit.js';
import {englishHeadCutoutAlpha,englishNeckClipAlpha} from '../src/english-head-cutout.js';
import {AI_MAKEUP_PAIR_VERSION} from '../ai-makeup-pair-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
const root=new URL('..',import.meta.url).pathname;
const face={10:{x:.5,y:.20},152:{x:.5,y:.67},234:{x:.23,y:.43},454:{x:.77,y:.43}};
const fields={interfaceLanguage:'en',portraitComposition:ENGLISH_HEAD_PORTRAIT_VERSION,englishStudioFinishVersion:ENGLISH_HEAD_FINISH_VERSION,portraitMode:'female',hairId:'original',femaleEyeStyle:'natural',studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,femaleFinishPair:AI_MAKEUP_PAIR_VERSION,neckOutfitReferencePath:'/assets/job-uniforms/female-job-ivory-bow-blouse.png'};
const image=await sharp({create:{width:96,height:128,channels:4,background:'#bb9988'}}).png().toBuffer(),matte=await sharp(image).extend({top:2,left:2,right:2,bottom:2,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
test('new English close-up pair has exactly two AI calls, no outfit/body reference or preparation assets, and original identity input',async()=>{
 for(const mode of ['original','selected','keep']){
  const f={...fields,...(mode==='selected'?{hairId:'seedream-41',hairReferenceVersion:'picker-hair-v1'}:{}),...(mode==='keep'?{keepCurrentHair:'1',preserveHairJobId:'owned'}:{})},calls=[];let pair;
  const natural=await processProductionPortrait({input:{buffer:image,mimetype:'image/png'},fields:f,root,key:'inert',currentHair:mode==='keep'?image:null,requestPortrait:async p=>{calls.push(p);return{png:matte}},removeBackground:async()=>matte,onMakeupVariant:async p=>pair=p});
  assert.equal(calls.length,2);assert.deepEqual(calls[0].portrait,image);assert(!calls[0].outfit&&!calls[0].compositionReference&&!calls[0].skinReference&&!calls[0].neckReference);assert.match(calls[0].prompt,/large sharply resolved face/);assert.match(calls[0].prompt,/Do not generate a final suit/);assert.doesNotMatch(calls[0].prompt,/OUTFIT LIGHTING IS THE FIXED AUTHORITY|90%|27–31%/);
  assert.match(calls[1].prompt,/#FF747F/);assert.match(calls[1].prompt,/real details/);assert.doesNotMatch(calls[1].prompt,/EYESHADOW COLOUR OVERRIDE|40% pigment opacity/);
  assert.deepEqual(await sharp(natural).extractChannel(3).raw().toBuffer(),await sharp(pair).extractChannel(3).raw().toBuffer());
  if(mode==='keep')assert.match(calls[0].prompt,/EXISTING HAIR — IMAGE 2/);
 }
});
test('male needs one call and failed makeup remains atomic without automatic provider retries',async()=>{
 let calls=0,stored=0;
 const args={input:{buffer:image,mimetype:'image/png'},fields,root,key:'inert',removeBackground:async()=>matte,onMakeupVariant:async()=>stored++};
 await processProductionPortrait({...args,fields:{...fields,portraitMode:'male',femaleFinishPair:undefined,studioSkinVersion:undefined},requestPortrait:async()=>{calls++;return{png:matte}}});assert.equal(calls,1);
 calls=0;await assert.rejects(processProductionPortrait({...args,requestPortrait:async()=>{if(++calls===2)throw Error('makeup unavailable');return{png:matte}}}),/makeup unavailable/);assert.equal(calls,2);assert.equal(stored,0);
 for(const patch of [{interfaceLanguage:'th'},{englishStudioFinishVersion:'unknown'}])assert.throws(()=>validateProductionPortrait({buffer:image,mimetype:'image/png'},{...fields,...patch}));
 calls=0;await assert.rejects(processProductionPortrait({...args,fields:{...fields,neckOutfitReferencePath:'/assets/job-uniforms/unavailable-fixture.png'},requestPortrait:async()=>{calls++;return{png:matte}}}),/ENOENT/);assert.equal(calls,0,'Validate the garment before spending a provider request');
});
test('actual job garment PNGs fit once with native aspect and a common isotropic head scale instead of warped neck pixels',async()=>{
 const dir=root+'public/assets/job-uniforms/',files=(await readdir(dir)).filter(f=>/^(female|male)-job-.*\.png$/.test(f));assert(files.length>=20);
 for(const file of files){
  const {data,info}=await sharp(await readFile(dir+file)).ensureAlpha().raw().toBuffer({resolveWithObject:true}),uniform=measureUniformAnchors(data,info.width,info.height),fit=fitEnglishHeadTemplate({uniform,face,width:1728,height:2304,crownY:50});
  assert(fit.faceRatio<=.300001&&fit.faceRatio>=.18,{file,ratio:fit.faceRatio});assert(Math.abs(fit.garment.w/fit.garment.h-info.width/info.height)<1e-10,file);assert(Math.abs(fit.head.w/fit.head.h-1728/2304)<1e-10,file);
  assert(Math.abs(fit.garment.y+(uniform.bounds.b+1)*fit.garment.h/info.height-1200)<1e-8,file);assert(fit.chinY<fit.collarY,file);
 }
});
test('head cleanup preserves every facial RGB/alpha pixel, leaves rounded continuous neck skin, and removes old clothing',()=>{
 const width=200,height=260,pixels=new Uint8ClampedArray(width*height*4),labels={width,height,data:new Uint8Array(width*height)};
 for(let i=0;i<pixels.length;i+=4){pixels.set([i%251,(i*3)%251,(i*7)%251,255],i);labels.data[i/4]=(i/4/width)>200?4:3}
 const alpha=englishHeadCutoutAlpha(pixels,width,height,face,labels),chin=Math.floor(face[152].y*height);
 for(let y=0;y<chin;y++)for(let x=0;x<width;x++)assert.equal(alpha[y*width+x],255);
 for(let y=chin;y<200;y++)assert.equal(alpha[y*width+100],255,'continuous supporting neck');
 for(let y=201;y<height;y++)assert.equal(alpha[y*width+100],0,'no old shirt below neck');
 assert(englishHeadMakeupPrompt().includes('iris colour/texture'));
});
test('collar clipping follows native garment rows, never cuts a rectangular neck at the chin, and retains selected long hair',()=>{
 const width=200,height=260,uniform={width:200,height:100,collarTopY:0,centerX:100,shoulderWidth:180},uniformPixels=new Uint8ClampedArray(200*100*4),labels={width,height,data:new Uint8Array(width*height).fill(2)};
 for(let y=0;y<100;y++)for(let x=Math.max(0,80-y);x<Math.min(200,121+y);x++)uniformPixels[(y*200+x)*4+3]=255;
 labels.data[170*200+20]=1;
 const mask=englishNeckClipAlpha({width,height,labels,chinY:140,uniform,uniformPixels,headFrame:{x:0,y:0,w:200,h:260},garmentFrame:{x:0,y:160,w:200,h:100}});
 for(let y=0;y<160;y++)for(let x=0;x<200;x++)assert.equal(mask[y*200+x],255,'no notch at or below the chin before the collar begins');
 assert.equal(mask[170*200+20],255,'long hair stays outside the collar');assert.equal(mask[170*200+30],0,'bare shoulder outside garment is removed');assert.equal(mask[170*200+100],255,'supporting neck stays continuous');
});
test('automatic neck alpha survives saved transfer and compact previews, with invalid images rejected',async()=>{
 const {packSavedProjectTransfer,unpackSavedProjectTransfer}=await import('../src/saved-work-transfer.js'),{compactSavedWorkPreview}=await import('../saved-work-thumbnail.js'),{validateSavedProject}=await import('../src/saved-project.js');
 const noise=Buffer.alloc(96*128*4);for(let i=0;i<noise.length;i++)noise[i]=i%4===3?255:((i*73856093)^(i>>>3))&255;const photo=await sharp(noise,{raw:{width:96,height:128,channels:4}}).png().toBuffer();
 const png=b=>'data:image/png;base64,'+b.toString('base64'),mask=png(await sharp(Buffer.from('<svg width="96" height="128"><rect width="48" height="128" fill="white"/></svg>')).png().toBuffer()),project={format:'idprom-studio',version:1,width:900,height:1200,layers:[{name:'head',kind:'head',source:png(photo),studioSkinBaseSource:png(photo),englishNeckClipMask:mask,x:0,y:0,scale:1,rotation:0,opacity:1,visible:true}]};
 const packed=packSavedProjectTransfer(project);assert.equal(packed.format,'idprom-project-transfer');const restored=unpackSavedProjectTransfer(packed);assert.equal(restored.layers[0].englishNeckClipMask,mask);
 const preview=await compactSavedWorkPreview(project);assert(preview.layers[0].englishNeckClipMask?.startsWith('data:image/png;base64,'));assert.throws(()=>validateSavedProject({...project,layers:[{...project.layers[0],englishNeckClipMask:'https://invalid.example/mask.png'}]}));
});

test('English native export retains the 3:4 scene aspect; Thai keeps its established export size',async()=>{
 const code=await readFile(root+'src/studio-editor.jsx','utf8'),line=code.split('\n').find(line=>line.startsWith('const nativeCanvas='));
 for(const english of [true,false]){const make=Function('document','englishPreviewEnabled',line+';return nativeCanvas')({createElement:()=>({})},()=>english),canvas=make();assert.equal(canvas.height,3072);assert.equal(canvas.width,english?2304:2256);if(english)assert.equal(canvas.width/canvas.height,900/1200);}
});
