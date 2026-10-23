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
 await test('actual image decoding rejects tiny, oversized and damaged references before any provider call',async()=>{
  const bad=[await jpeg('#d6889b',8,8),await jpeg('#d6889b',513,512),Buffer.from([255,216,255,224,0,16,0,0])];
  for(const bytes of bad)await assert.rejects(process(portrait,{...fields,femaleMakeupReference:url(bytes)}));
  assert.equal(requests.length,0);
 });
 await test('female makeup hair change carries current source, exact hairstyle and accepted finish in one existing 2K request',async()=>{
  const before=requests.length,out=await process(portrait,fields),body=requests.at(-1);
  assert.equal(requests.length,before+1);assert.equal(body.model,REVIEW_SEEDREAM_MODEL);assert.equal(body.size,'2K');assert.equal(body.image.length,3);
  assert.deepEqual(data(body.image[0]),sourceB);assert.deepEqual(data(body.image[1]),reference);assert.deepEqual(data(body.image[2]),acceptedB);
  assert(body.image[2].startsWith('data:image/jpeg;base64,'));assert(body.prompt.includes('ACCEPTED FEMALE MAKEUP CONTINUITY — IMAGE 3'));
  assert(!body.prompt.includes('no separate makeup-reference image is supplied'));
  assert(body.prompt.includes('intentional accepted finish to PRESERVE'));assert(body.prompt.includes('Do not tone down the accepted makeup'));
  assert(body.prompt.includes('Image 1 remains the sole authority'));assert(body.prompt.includes('Image 2 remains the EXCLUSIVE hairstyle authority'));assert(body.prompt.includes('Iris colour/texture, pupil dimensions, original gaze and corneal catchlights remain from Image 1'));
  assert.deepEqual((await sharp(out).raw().toBuffer()).subarray((40*64+32)*4,(40*64+32)*4+4),Buffer.from([180,140,110,255]),'no original or reference face pixels are pasted over the generated output');
 });
 await test('identity and cosmetics remain separate references with the correct dynamic fourth-image role',async()=>{
  const box=[.25,.2,.75,.8],before=requests.length;
  await process(portrait,{...fields,faceIdentityBox:JSON.stringify(box)});const body=requests.at(-1);
  assert.equal(requests.length,before+1);assert.equal(body.image.length,4);assert.deepEqual(data(body.image[2]),await portraitIdentityCrop(portrait,box));assert.deepEqual(data(body.image[3]),acceptedB);
  assert(body.prompt.includes('UPLOADED-PERSON IDENTITY DETAIL — IMAGE 3'));assert(body.prompt.includes('ACCEPTED FEMALE MAKEUP CONTINUITY — IMAGE 4'));assert(!body.prompt.includes('This last image is a close-up cropped directly from Image 1'));
 });
 await test('requests A then B do not cache or transfer another photo cosmetic crop',async()=>{
  for(const [source,accepted] of [[sourceA,acceptedA],[sourceB,acceptedB]]){
   await process({buffer:source,mimetype:'image/png'},{...fields,femaleMakeupReference:url(accepted)});const body=requests.at(-1);
   assert.deepEqual(data(body.image[0]),source);assert.deepEqual(data(body.image.at(-1)),accepted);
  }
  assert.notDeepEqual(data(requests.at(-2).image.at(-1)),data(requests.at(-1).image.at(-1)));
 });
 await test('returning to original hair preserves makeup without treating the makeup crop as hairstyle Image 2',async()=>{
  await process(portrait,{...fields,hairId:'original'});const body=requests.at(-1);
  assert.equal(body.image.length,2);assert.deepEqual(data(body.image[1]),acceptedB);assert(body.prompt.includes('ACCEPTED FEMALE MAKEUP CONTINUITY — IMAGE 2'));assert(body.prompt.includes('There is no hairstyle-reference image in this request'));
  assert(!body.prompt.includes('Image 2 remains the EXCLUSIVE hairstyle authority'));
 });
 await test('natural, male and existing makeup requests with no new field retain their previous prompt and payload',async()=>{
  for(const oldFields of [{hairId:'seedream-19',portraitMode:'female',femaleEyeStyle:'natural'},{hairId:'seedream-19',portraitMode:'female',femaleEyeStyle:'makeup'},{hairId:'seedream-35',portraitMode:'male',femaleEyeStyle:'natural'}]){
   await process(portrait,oldFields);const body=requests.at(-1);
   assert.equal(body.image.length,2);assert.equal(body.prompt,productionPortraitPrompt(productionHair(oldFields.hairId),oldFields.femaleEyeStyle));if(oldFields.portraitMode==='female')assert(body.prompt.includes('no separate makeup-reference image is supplied'));
  }
 });
 console.log(`PASS: ${count} female makeup continuity scenarios; real Sharp reference pixels, provider mocked, no customer or paid AI calls.`);
}finally{globalThis.fetch=originalFetch;await rm(root,{recursive:true,force:true})}
