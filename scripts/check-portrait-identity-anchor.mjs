import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {parsePortraitIdentityBox,portraitIdentityCrop,validateProductionPortrait,processProductionPortrait,productionPortraitPrompt} from '../production-portrait-pipeline.js';
import {seedreamReviewPayload,REVIEW_SEEDREAM_MODEL} from '../seedream-review-transport.js';
import {productionHair} from '../hairstyle-catalog.js';

let count=0;
async function test(name,run){await run();count++;console.log('PASS: '+name)}
const box=[.25,.2,.75,.8],encoded=JSON.stringify(box),root=await mkdtemp(join(tmpdir(),'idprom-identity-anchor-'));
const decodeData=value=>Buffer.from(value.split(',')[1],'base64');
async function source(base){
 const width=160,height=200,pixels=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;pixels[i]=(base+x)%256;pixels[i+1]=(base*2+y)%256;pixels[i+2]=(x+y)%256;pixels[i+3]=255;
 }
 return sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer();
}
const a=await source(20),b=await source(90),inputA={buffer:a,mimetype:'image/png'},inputB={buffer:b,mimetype:'image/png'};
const outputPixels=Buffer.alloc(64*96*4);
for(let y=12;y<84;y++)for(let x=16;x<48;x++){const i=(y*64+x)*4;outputPixels[i]=180;outputPixels[i+1]=140;outputPixels[i+2]=110;outputPixels[i+3]=255}
const generated=await sharp(outputPixels,{raw:{width:64,height:96,channels:4}}).png().toBuffer();
const reference=Buffer.from('selected-reference-19-only');
await mkdir(join(root,'public/assets/seedream-hairstyles/references'),{recursive:true});
await writeFile(join(root,'public/assets/seedream-hairstyles/references/19.png'),reference);
const originalFetch=globalThis.fetch,requests=[];
globalThis.fetch=async(_url,options)=>{
 requests.push(JSON.parse(options.body));
 return {ok:true,json:async()=>({data:[{b64_json:generated.toString('base64')}]}),headers:{get:()=>null}};
};
try{
 await test('identity box is optional and valid normalized bounds are copied',()=>{
  for(const value of [undefined,null,''])assert.equal(parsePortraitIdentityBox(value),null);
  assert.deepEqual(parsePortraitIdentityBox(encoded),box);assert.deepEqual(parsePortraitIdentityBox(box),box);assert.notEqual(parsePortraitIdentityBox(box),box);
 });
 await test('malformed identity boxes fail validation before any generation',()=>{
  for(const value of ['not json','null','{}','[0,0,1]','[0,0,1,1,1]','[0,0,1.1,1]','[-0.1,0,1,1]','[0.5,0,0.2,1]','[0,1,1,0.2]','[0,0,"1",1]',[0,0,NaN,1],[0,0,Infinity,1]])assert.throws(()=>validateProductionPortrait(inputB,{hairId:'seedream-19',faceIdentityBox:value}));
  assert.equal(requests.length,0);
 });
 await test('existing payload shape and portrait/reference order remain unchanged without an anchor',()=>{
  const one=seedreamReviewPayload({portrait:b,prompt:'fixture'});assert.equal(typeof one.image,'string');assert.deepEqual(decodeData(one.image),b);
  const two=seedreamReviewPayload({portrait:b,hair:reference,prompt:'fixture'});assert.equal(two.image.length,2);assert.deepEqual(decodeData(two.image[0]),b);assert.deepEqual(decodeData(two.image[1]),reference);
 });
 await test('native close-up comes only from this uploaded source, with no previous-person cache',async()=>{
  const cropA=await portraitIdentityCrop(inputA,box),cropB=await portraitIdentityCrop(inputB,box);
  assert.notDeepEqual(cropA,cropB);
  const expected=await sharp(b).extract({left:40,top:40,width:80,height:120}).raw().toBuffer();
  assert.deepEqual(await sharp(cropB).raw().toBuffer(),expected);
  assert.deepEqual((await sharp(cropB).metadata()).width,80);assert.equal((await sharp(cropB).metadata()).height,120);
 });
 await test('all eight EXIF display orientations match browser-normalized crop coordinates',async()=>{
  for(let orientation=1;orientation<=8;orientation++){
   const jpeg=await sharp(b).jpeg({quality:95}).withMetadata({orientation}).toBuffer();
   const crop=await portraitIdentityCrop({buffer:jpeg,mimetype:'image/jpeg'},box);
   const normalized=await sharp(jpeg).rotate().png().toBuffer(),swapped=orientation>=5;
   const expected=await sharp(normalized).extract(swapped?{left:50,top:32,width:100,height:96}:{left:40,top:40,width:80,height:120}).raw().toBuffer();
   assert.deepEqual(await sharp(crop).raw().toBuffer(),expected,'orientation '+orientation);
  }
 });
 await test('large phone photos produce a bounded identity view with the original crop aspect ratio',async()=>{
  const large=await sharp({create:{width:2400,height:3200,channels:3,background:{r:170,g:130,b:110}}}).png().toBuffer();
  const crop=await portraitIdentityCrop({buffer:large,mimetype:'image/png'},[.25,.25,.75,.75]),metadata=await sharp(crop).metadata();
  assert.equal(metadata.width,768);assert.equal(metadata.height,1024);
  assert.equal(metadata.width/metadata.height,1200/1600);assert(Math.max(metadata.width,metadata.height)<=1024);
  assert.deepEqual(await sharp(crop).extract({left:0,top:0,width:1,height:1}).raw().toBuffer(),Buffer.from([170,130,110]));
  const original=await sharp(large).metadata();assert.equal(original.width,2400);assert.equal(original.height,3200);
 });
 await test('production A then B sends each current original, exact selected reference and its own identity crop in one 2K request',async()=>{
  for(const input of [inputA,inputB]){
   const before=requests.length,stages=[];
   const out=await processProductionPortrait({input,fields:{hairId:'seedream-19',portraitMode:'female',femaleEyeStyle:'makeup',faceIdentityBox:encoded},root,key:'test-only-placeholder',onStage:async stage=>stages.push(stage),removeBackground:async image=>image});
   assert(out.length>8);assert.equal(requests.length,before+1);
   const body=requests.at(-1);assert.equal(body.model,REVIEW_SEEDREAM_MODEL);assert.equal(body.size,'2K');assert.equal(body.image.length,3);
   assert.deepEqual(decodeData(body.image[0]),input.buffer);assert.deepEqual(decodeData(body.image[1]),reference);assert.deepEqual(decodeData(body.image[2]),await portraitIdentityCrop(input,box));
   assert(body.prompt.startsWith(productionPortraitPrompt(productionHair('seedream-19'),'makeup')));
   assert(body.prompt.includes('UPLOADED-PERSON IDENTITY DETAIL — IMAGE 3'));assert(body.prompt.includes('Image 2 supplies HAIR DESIGN ONLY'));
   assert.deepEqual(stages,['generation','matting','edges']);
  }
 });
 await test('clients without the new field retain the exact previous two-image prompt and pipeline',async()=>{
  const before=requests.length;
  await processProductionPortrait({input:inputB,fields:{hairId:'seedream-19',portraitMode:'female',femaleEyeStyle:'natural'},root,key:'test-only-placeholder',removeBackground:async image=>image});
  const body=requests.at(-1);assert.equal(requests.length,before+1);assert.equal(body.image.length,2);assert.equal(body.prompt,productionPortraitPrompt(productionHair('seedream-19'),'natural'));
 });
 await test('an optional crop without a hairstyle reference has the correct second-image role',async()=>{
  const before=requests.length;
  await processProductionPortrait({input:inputB,fields:{hairId:'original',portraitMode:'female',faceIdentityBox:encoded},root,key:'test-only-placeholder',removeBackground:async image=>image});
  const body=requests.at(-1);assert.equal(requests.length,before+1);assert.equal(body.image.length,2);assert(body.prompt.includes('UPLOADED-PERSON IDENTITY DETAIL — IMAGE 2'));assert(body.prompt.includes('There is no separate hairstyle-reference image'));assert(!body.prompt.includes('UPLOADED-PERSON IDENTITY DETAIL — IMAGE 3'));
 });
 await test('an unreadable or too-small present crop stops before the provider request instead of falling back to another image',async()=>{
  const before=requests.length;
  await assert.rejects(processProductionPortrait({input:inputB,fields:{hairId:'seedream-19',portraitMode:'female',faceIdentityBox:'[0,0,0.01,0.01]'},root,key:'test-only-placeholder',removeBackground:async image=>image}),/เล็กเกินไป/);
  await assert.rejects(portraitIdentityCrop({buffer:Buffer.from('invalid image')},box));
  assert.equal(requests.length,before);
 });
 console.log(`PASS: ${count} identity-anchor scenarios; real Sharp pixels and mocked provider, no customer account or paid AI call.`);
}finally{globalThis.fetch=originalFetch;await rm(root,{recursive:true,force:true})}
