import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {processProductionPortrait,validateProductionPortrait} from '../production-portrait-pipeline.js';
import {ENGLISH_BODY_PORTRAIT_VERSION,isEnglishBodyPortrait} from '../english-body-portrait.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
const root=new URL('..',import.meta.url).pathname;
const template='/assets/job-uniforms/female-formal-suit.png';
const fields={interfaceLanguage:'en',portraitComposition:ENGLISH_BODY_PORTRAIT_VERSION,neckOutfitReferencePath:template,femaleEyeStyle:'natural'};
test('English opt-in requires language, mode and a selected job outfit; Thai remains opt-out',()=>{
 assert(isEnglishBodyPortrait(fields));assert(!isEnglishBodyPortrait({}));assert(!isEnglishBodyPortrait({...fields,interfaceLanguage:'th'}));
 const input={buffer:Buffer.from('fixture'),mimetype:'image/png'};
 for(const overrides of [{interfaceLanguage:'th'},{neckOutfitReferencePath:''},{neckOutfitReferencePath:'/assets/gown-uniforms/kmitl-female.png'}])assert.throws(()=>validateProductionPortrait(input,{...fields,portraitMode:'female',...overrides}),/English outfit/);
});
test('English male and female generations create complete clothed portraits with strict reference fidelity',async()=>{
 const input=await sharp({create:{width:64,height:96,channels:3,background:'tan'}}).png().toBuffer();
 const matte=await sharp({create:{width:64,height:96,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:52,height:85,channels:4,background:'#3c8cff'}}).png().toBuffer(),left:6,top:11}]).png().toBuffer();
 const outfit=await sharp(await readFile(root+'public'+template)).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 for(const portraitMode of ['female','male']){
  const calls=[];let matted=0;
  const result=await processProductionPortrait({input:{buffer:input,mimetype:'image/png'},fields:{...fields,portraitMode,...(portraitMode==='female'?{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION}:{})},root,key:'fixture-not-sent',requestPortrait:async p=>{calls.push(p);return {png:input}},removeBackground:async png=>{assert.deepEqual(png,input);matted++;return matte}});
  const generated=calls.at(-1);assert.equal(calls.length,portraitMode==='female'?2:1);assert.equal(matted,1);
  assert.deepEqual(generated.outfit,outfit);assert(!generated.neckReference);assert(!generated.neckShapeReference);
  assert.match(generated.prompt,/head, new upright neck, level shoulders and clothed upper torso together/);
  assert.match(generated.prompt,/Generate this garment ON the person/);
  assert.match(generated.prompt,/STRICT GARMENT FIDELITY/);
  assert.match(generated.prompt,/FINAL HEAD\/BODY BALANCE — ENGLISH PORTRAIT/);
  assert.match(generated.prompt,/30–36% of shoulder-joint-to-shoulder-joint width/);
  assert.match(generated.prompt,/reduce the entire head coherently/);
  assert(generated.prompt.endsWith('without separate pasted head or body panels.'));
  assert.match(generated.prompt,/button count, spacing and material/);
  assert.match(generated.prompt,/do not substitute generic emblems/);
  assert.match(generated.prompt,/Adapt ONLY the face, ears and visible neck to the garment/);
  assert.match(generated.prompt,/Do not recolour, brighten, darken, relight, smooth, blur, sharpen/);
  assert.doesNotMatch(generated.prompt,/Do not generate this garment|NECKLINE-CONTOUR CUTOUT|REBUILD THE VISIBLE NECK NOW|application will place the ORIGINAL/);
  const {data,info}=await sharp(result).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(data[((info.height-2)*info.width+32)*4+3],255,'clothed lower torso survives');assert.equal(data[3],0,'background remains transparent');
 }
});
test('English makeup brightens only skin while preserving garment exposure and natural cutout alpha',async()=>{
 const {AI_MAKEUP_PAIR_VERSION}=await import('../ai-makeup-pair-policy.js');
 const natural=await sharp({create:{width:64,height:96,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:52,height:85,channels:4,background:'#3c8cff'}}).png().toBuffer(),left:6,top:11}]).png().toBuffer();
 const calls=[];let makeup;
 await processProductionPortrait({input:{buffer:natural,mimetype:'image/png'},fields:{...fields,portraitMode:'female',studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,femaleFinishPair:AI_MAKEUP_PAIR_VERSION},root,key:'fixture-not-sent',requestPortrait:async p=>{calls.push(p);return {png:natural}},removeBackground:async()=>natural,onMakeupVariant:async png=>{makeup=png}});
 assert.equal(calls.length,3);assert.match(calls.at(-1).prompt,/\+0.4 to \+0.6 EV/);assert.match(calls.at(-1).prompt,/FACE AND NECK MAKEUP LIGHTING/);assert.doesNotMatch(calls.at(-1).prompt,/OUTFIT LIGHTING IS THE FIXED AUTHORITY/);assert.match(calls.at(-1).prompt,/Preserve the existing selected outfit, complete clothed torso/);
 const a=await sharp(natural).extractChannel(3).raw().toBuffer(),b=await sharp(makeup).extractChannel(3).raw().toBuffer();assert.deepEqual(a,b);
});
test('English removes government/student categories and rejects their generation paths',async()=>{
 const {outfitsForLanguage,defaultPortraitBackground}=await import('../src/english-preview.js');
 const catalog=[{id:'job',items:[]},{id:'government-female',items:[{id:'female-operational'}]},{id:'student',items:[{id:'student-female-rajabhat'}]}];
 assert.deepEqual(outfitsForLanguage(catalog,{search:'?lang=en'}).map(g=>g.id),['job']);
 assert.equal(outfitsForLanguage(catalog,{search:''}),catalog);
 for(const neckOutfitReferencePath of ['/assets/government-uniforms/female-operational.png','/assets/student-uniforms/female-rajabhat.png'])assert.throws(()=>validateProductionPortrait({buffer:Buffer.from('fixture'),mimetype:'image/png'},{...fields,portraitMode:'female',neckOutfitReferencePath}),/English outfit/);
 assert.deepEqual(defaultPortraitBackground({search:'?lang=en'}),{id:'white',src:'/assets/background-options/white.jpg'});
 assert.deepEqual(defaultPortraitBackground({search:''}),{id:'default',src:'/assets/background.jpg'});
 const {data}=await sharp(root+'public'+defaultPortraitBackground({search:'?lang=en'}).src).resize(1,1).removeAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual([...data],[255,255,255]);
});
test('every selectable English job outfit passes request validation, including actual WebP templates',async()=>{
 const main=await readFile(root+'src/main.jsx','utf8');
 const catalog=Function(main.match(/const JOB_UNIFORMS=\[[\s\S]*?\n\];/)[0]+';return JOB_UNIFORMS')();
 const input={buffer:Buffer.from('fixture'),mimetype:'image/png'};
 const webp=catalog.filter(item=>item.template.endsWith('.webp'));
 assert(webp.length>=5,'cover real selectable WebP outfits');
 for(const item of catalog)assert.doesNotThrow(()=>validateProductionPortrait(input,{...fields,portraitMode:item.gender,neckOutfitReferencePath:item.template}),item.id);
 const selected=webp[0],png=await sharp({create:{width:32,height:48,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:24,height:40,channels:4,background:'#736050'}}).png().toBuffer(),left:4,top:8}]).png().toBuffer();let sent;
 await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields:{...fields,portraitMode:selected.gender,neckOutfitReferencePath:selected.template},root,key:'fixture-not-sent',requestPortrait:async p=>{sent=p;return {png}},removeBackground:async()=>png});
 const expected=await sharp(root+'public'+selected.template).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();assert.deepEqual(sent.outfit,expected);
 for(const path of ['/assets/job-uniforms/../server.webp','https://example.com/outfit.webp','/assets/student-uniforms/female-01.png'])assert.throws(()=>validateProductionPortrait(input,{...fields,portraitMode:'female',neckOutfitReferencePath:path}),/English outfit/);
});
