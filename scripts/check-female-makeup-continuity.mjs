import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {parseFemaleMakeupReference,checkedFemaleMakeupReference,validateProductionPortrait,processProductionPortrait,productionPortraitPrompt,portraitIdentityCrop} from '../production-portrait-pipeline.js';
import {productionHair} from '../hairstyle-catalog.js';
import {REVIEW_SEEDREAM_MODEL} from '../seedream-review-transport.js';

let count=0;async function test(name,run){await run();count++;console.log('PASS: '+name)}
const root=await mkdtemp(join(tmpdir(),'idprom-makeup-continuity-'));
const image=async colour=>sharp({create:{width:160,height:200,channels:3,background:colour}}).png().toBuffer();
const sourceA=await image('#a2745d'),sourceB=await image('#c39878'),portrait={buffer:sourceB,mimetype:'image/png'};
const jpeg=async(colour,width=160,height=160)=>sharp({create:{width,height,channels:3,background:colour}}).jpeg({quality:88}).toBuffer();
const acceptedA=await jpeg('#ad637c'),acceptedB=await jpeg('#d6889b');
const url=buffer=>'data:image/jpeg;base64,'+buffer.toString('base64');
const fields={hairId:'seedream-19',portraitMode:'female',femaleEyeStyle:'makeup',creditKind:'hairstyle',femaleMakeupReference:url(acceptedB)};
const reference=Buffer.from('selected-style-19-reference');
await mkdir(join(root,'public/assets/seedream-hairstyles/references'),{recursive:true});await writeFile(join(root,'public/assets/seedream-hairstyles/references/19.png'),reference);await writeFile(join(root,'public/assets/seedream-hairstyles/references/35.png'),reference);
const rgba=Buffer.alloc(64*96*4);for(let y=12;y<84;y++)for(let x=16;x<48;x++){const i=(y*64+x)*4;rgba[i]=180;rgba[i+1]=140;rgba[i+2]=110;rgba[i+3]=255}
const generated=await sharp(rgba,{raw:{width:64,height:96,channels:4}}).png().toBuffer();
const requests=[],originalFetch=globalThis.fetch;globalThis.fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({data:[{b64_json:generated.toString('base64')}]}),headers:{get:()=>null}}};
const data=uri=>Buffer.from(uri.split(',')[1],'base64');
const process=(input,body)=>processProductionPortrait({input,fields:body,root,key:'test-only-placeholder',removeBackground:async buffer=>buffer});
try{
 await test('the optional field decodes only a canonical bounded JPEG data URL',async()=>{
  assert.equal(parseFemaleMakeupReference({},null),null);assert.deepEqual(parseFemaleMakeupReference(fields,productionHair(fields.hairId)),acceptedB);assert.deepEqual(await checkedFemaleMakeupReference(acceptedB),acceptedB);
  for(const value of [null,'',1,{},'data:image/png;base64,'+acceptedB.toString('base64'),'data:image/jpeg;base64,@@@=','data:image/jpeg;base64,AAAA','data:image/jpeg;base64,'+'A'.repeat(512*1024)]){
   assert.throws(()=>validateProductionPortrait(portrait,{...fields,femaleMakeupReference:value}));
  }
  assert.equal(requests.length,0);
 });
 await test('male, natural and first-generation requests cannot supply the makeup reference',()=>{
  for(const change of [{hairId:'seedream-35',portraitMode:'male'},{portraitMode:'male'},{femaleEyeStyle:'natural'},{femaleEyeStyle:undefined},{creditKind:undefined},{creditKind:'ai-finish'}])assert.throws(()=>validateProductionPortrait(portrait,{...fields,...change}));
  assert.equal(requests.length,0);
 });
 await test('the legacy reference decoder rejects tiny, oversized and damaged JPEGs independently',async()=>{
  const bad=[await jpeg('#d6889b',8,8),await jpeg('#d6889b',513,512),Buffer.from([255,216,255,224,0,16,0,0])];
  for(const bytes of bad)await assert.rejects(checkedFemaleMakeupReference(bytes));
  assert.equal(requests.length,0);
 });
 // The current production policy deliberately ignores legacy generated makeup
 // crops. Every hairstyle is grounded in this request's upload and written finish.
 await test('female makeup hair change uses the uploaded source and selected hairstyle without a legacy generated-face reference',async()=>{
  const before=requests.length,out=await process(portrait,fields),body=requests.at(-1);
  assert.equal(requests.length,before+1);assert.equal(body.model,REVIEW_SEEDREAM_MODEL);assert.equal(body.size,'2K');assert.equal(body.image.length,2);
  assert.deepEqual(data(body.image[0]),sourceB);assert.deepEqual(data(body.image[1]),reference);assert(!body.image.includes(url(acceptedB)));
  assert.equal(body.prompt,productionPortraitPrompt(productionHair(fields.hairId),fields.femaleEyeStyle));
  assert(!body.prompt.includes('ACCEPTED FEMALE MAKEUP CONTINUITY'));assert(body.prompt.includes('previously generated makeup or skin finish'));
  assert(body.prompt.includes('FINAL FEMALE MAKEUP TEXTURE PRIORITY'));assert(body.prompt.includes('restrained translucent rosy glow'));
  assert(body.prompt.includes('neutral lower-eye skin'));assert(body.prompt.includes('Keep stable moles, freckles'));
  assert(body.prompt.includes('Image 1 supplies the person'));assert(body.prompt.includes('Image 2 supplies the selected hairstyle only'));
  assert.deepEqual((await sharp(out).raw().toBuffer()).subarray((40*64+32)*4,(40*64+32)*4+4),Buffer.from([180,140,110,255]),'no original or reference face pixels are pasted over the generated output');
 });
 await test('the optional third image is an identity crop derived only from this uploaded person',async()=>{
  const box=[.25,.2,.75,.8],before=requests.length;
  await process(portrait,{...fields,faceIdentityBox:JSON.stringify(box)});const body=requests.at(-1);
  assert.equal(requests.length,before+1);assert.equal(body.image.length,3);assert.deepEqual(data(body.image[0]),sourceB);assert.deepEqual(data(body.image[1]),reference);assert.deepEqual(data(body.image[2]),await portraitIdentityCrop(portrait,box));
  assert(!body.image.includes(url(acceptedB)));assert(body.prompt.includes('UPLOADED-PERSON IDENTITY DETAIL — IMAGE 3'));assert(!body.prompt.includes('ACCEPTED FEMALE MAKEUP CONTINUITY'));assert(body.prompt.includes('This last image is a close-up cropped directly from Image 1'));
 });
 await test('requests A then B keep their own source and never transfer either legacy generated makeup crop',async()=>{
  for(const [source,accepted] of [[sourceA,acceptedA],[sourceB,acceptedB]]){
   await process({buffer:source,mimetype:'image/png'},{...fields,femaleMakeupReference:url(accepted)});const body=requests.at(-1);
   assert.equal(body.image.length,2);assert.deepEqual(data(body.image[0]),source);assert.deepEqual(data(body.image[1]),reference);assert(!body.image.includes(url(acceptedA)));assert(!body.image.includes(url(acceptedB)));
  }
  assert.notDeepEqual(data(requests.at(-2).image[0]),data(requests.at(-1).image[0]));
 });
 await test('the female default uses only the uploaded person and the current compact gathered hair instruction',async()=>{
  await process(portrait,{...fields,hairId:'original'});const body=requests.at(-1);
  assert.equal(typeof body.image,'string');assert.deepEqual(data(body.image),sourceB);assert(body.prompt.includes('FEMALE DEFAULT HAIRSTYLE — FULLY GATHERED'));assert(body.prompt.includes('No hairstyle-reference image is supplied'));
  assert(body.prompt.includes('FINAL FEMALE DEFAULT — COMPACT FULLY GATHERED HAIR AND ROUND NECK BASE'));assert(!body.prompt.includes('ACCEPTED FEMALE MAKEUP CONTINUITY'));assert(body.prompt.includes('FINAL FEMALE MAKEUP TEXTURE PRIORITY'));
 });
 await test('natural, male and existing makeup requests with no new field retain their previous prompt and payload',async()=>{
  for(const oldFields of [{hairId:'seedream-19',portraitMode:'female',femaleEyeStyle:'natural'},{hairId:'seedream-19',portraitMode:'female',femaleEyeStyle:'makeup'},{hairId:'seedream-35',portraitMode:'male',femaleEyeStyle:'natural'}]){
   await process(portrait,oldFields);const body=requests.at(-1);
   assert.equal(body.image.length,2);assert.equal(body.prompt,productionPortraitPrompt(productionHair(oldFields.hairId),oldFields.femaleEyeStyle));if(oldFields.portraitMode==='female'&&oldFields.femaleEyeStyle==='natural')assert(body.prompt.includes('no separate makeup-reference image is supplied'));if(oldFields.femaleEyeStyle==='makeup')assert(body.prompt.includes('previously generated makeup or skin finish'));
  }
 });
 console.log(`PASS: ${count} female makeup continuity scenarios; real Sharp reference pixels, provider mocked, no customer or paid AI calls.`);
}finally{globalThis.fetch=originalFetch;await rm(root,{recursive:true,force:true})}
