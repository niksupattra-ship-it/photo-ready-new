import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
import {PRODUCTION_HAIR_CATALOG,productionHair,isTrialHairAllowed,selectedHairDesign,selectedHairInstruction,HAIR_DESIGN_VERSION} from '../hairstyle-catalog.js';
import {validateProductionPortrait,processProductionPortrait,productionPortraitPrompt,portraitIdentityCrop} from '../production-portrait-pipeline.js';
import {MALE_SHAVE_POLICY} from '../male-shave-policy.js';
import {FREE_FEMALE_HAIR_OPTIONS,isFreeFemaleHair} from '../src/free-female-hair.js';
import {REVIEW_SEEDREAM_MODEL,REVIEW_SEEDREAM_ENDPOINT} from '../seedream-review-transport.js';

// Test the real production request path. Network transport is intercepted below;
// no provider, payment, customer account or application data is used.
const project=new URL('../',import.meta.url),root=decodeURIComponent(project.pathname);
const additions=[
 {id:'seedream-36',file:'36.png',zipFile:'35.png',sha256:'66a6bcba5a435fc07dda8e9a9c96326b182eac0243c71649b2dbec0f34dba623'},
 {id:'seedream-37',file:'37.png',zipFile:'36.png',sha256:'e2ce29f80ceb70f595cb704e3ec2fefb0a20e01510c7bad31c8de13221b28742'}
];
const bytes=url=>readFile(new URL(url,project));
const digest=value=>createHash('sha256').update(value).digest('hex');
const imageBytes=uri=>Buffer.from(uri.split(',')[1],'base64');
let passed=0;async function test(name,run){await run();passed++;console.log('PASS: '+name)}

await test('both additions are male catalogue choices on the existing AI/trial path, separate from free PNG styles',()=>{
 assert.equal(new Set(PRODUCTION_HAIR_CATALOG.map(h=>h.id)).size,PRODUCTION_HAIR_CATALOG.length);
 for(const added of additions){
  const h=productionHair(added.id);assert(h,added.id);assert.equal(h.gender,'male');assert.equal(h.file,added.file);
  assert.equal(h.src,'/assets/seedream-hairstyles/previews/'+added.file.replace('.png','.webp'));
  assert.equal(selectedHairDesign(h).kind,'short');assert.equal(isTrialHairAllowed(h.id),true);assert.equal(isFreeFemaleHair(h.id),false);assert.notEqual(h.free,true);
 }
 assert.deepEqual(FREE_FEMALE_HAIR_OPTIONS.map(h=>h.id),['hair-21','hair-25','hair-26']);
});

const references=new Map(),previews=new Map();
await test('new references retain the exact uploaded hair pixels and have distinct valid WebP picker previews',async()=>{
 for(const added of additions){
  const h=productionHair(added.id),reference=await bytes('public/assets/seedream-hairstyles/references/'+h.file),preview=await bytes('public'+h.src);
  assert.equal(digest(reference),added.sha256,`${added.id} must use the uploaded ${added.zipFile}, never overwrite legacy reference35`);
  const r=await sharp(reference).metadata(),p=await sharp(preview).metadata();
  assert.equal(r.format,'png');assert(r.width>0&&r.height>0);assert.equal(p.format,'webp');assert(p.width>=96&&p.height>=96);
  assert.notDeepEqual(reference,preview);references.set(h.id,reference);previews.set(h.id,preview);
 }
 assert.notEqual(digest(previews.get('seedream-36')),digest(previews.get('seedream-37')),'different hairstyles need different preview files');
});

await test('the existing male picker and persistent-job submission discover new catalogue IDs without new routing',async()=>{
 const main=await bytes('src/main.jsx'),server=await bytes('server.js');
 assert(main.toString().includes("const MALE_HAIR_OPTIONS=PRODUCTION_HAIR_CATALOG.filter(h=>h.gender==='male'&&h.id!=='seedream-35')"));
 const shown=PRODUCTION_HAIR_CATALOG.filter(h=>h.gender==='male'&&h.id!=='seedream-35');
 for(const added of additions)assert(shown.some(h=>h.id===added.id));
 assert(!shown.some(h=>h.id==='seedream-35'),'old first male choice remains hidden');
 assert(main.toString().includes("fd.append('portraitMode',selected?.gender||options.portraitMode"));
 assert(main.toString().includes("portraitFetch('/api/ai-jobs'"));
 assert(server.toString().includes('validateProductionPortrait'));
});

const portrait={buffer:await sharp({create:{width:160,height:200,channels:3,background:'#bd967c'}}).png().toBuffer(),mimetype:'image/png'};
const pixels=Buffer.alloc(64*96*4);
for(let y=12;y<84;y++)for(let x=16;x<48;x++){const j=(y*64+x)*4;pixels[j]=180;pixels[j+1]=140;pixels[j+2]=110;pixels[j+3]=255}
const generated=await sharp(pixels,{raw:{width:64,height:96,channels:4}}).png().toBuffer();
const originalFetch=globalThis.fetch,requests=[];
globalThis.fetch=async(url,options)=>{
 assert.equal(url,REVIEW_SEEDREAM_ENDPOINT);assert.equal(options.method,'POST');
 requests.push(JSON.parse(options.body));
 return {ok:true,json:async()=>({data:[{b64_json:generated.toString('base64')}]}),headers:{get:()=>null}};
};
try{
 for(const added of additions)for(const eyeStyle of ['natural','makeup'])for(const withIdentity of [false,true]){
  await test(`${added.id} ${eyeStyle}, identity ${withIdentity}: one existing 2K male generation uses original person then exact uploaded hair`,async()=>{
   const fields={hairId:added.id,portraitMode:'male',femaleEyeStyle:eyeStyle,creditKind:'hairstyle',...(withIdentity?{faceIdentityBox:'[0.25,0.2,0.75,0.8]'}:{})};
   const selected=validateProductionPortrait(portrait,fields);assert.equal(selected.gender,'male');
   const stages=[],before=requests.length;
   const output=await processProductionPortrait({input:portrait,fields,root,key:'fixture-only-no-provider',removeBackground:async value=>value,onStage:async stage=>stages.push(stage)});
   assert.equal(requests.length,before+1,'one generation, no added model pass');assert.deepEqual(stages,['generation','matting','edges']);
   const body=requests.at(-1);assert.equal(body.model,REVIEW_SEEDREAM_MODEL);assert.equal(body.size,'2K');assert.equal(body.output_format,'png');assert.equal(body.response_format,'b64_json');
   assert.equal(body.image.length,withIdentity?3:2);assert.deepEqual(imageBytes(body.image[0]),portrait.buffer);assert.deepEqual(imageBytes(body.image[1]),references.get(added.id));assert.notDeepEqual(imageBytes(body.image[1]),previews.get(added.id));
   assert(body.prompt.includes('MALE PORTRAIT:'));assert(body.prompt.includes(MALE_SHAVE_POLICY));assert(body.prompt.includes('MALE NATURAL STUDIO FINISH'));assert(body.prompt.includes(selectedHairInstruction(selected)));
   assert(body.prompt.includes('LOWER FACE AND EAR ANATOMY PRIORITY'));assert(body.prompt.includes('WIDE ROUND NECKLINE'));assert(!body.prompt.includes('FEMALE INITIAL PORTRAIT'));assert(!body.prompt.includes('FINAL FEMALE DEFAULT'));assert(!body.prompt.includes('MALE DEFAULT HAIRSTYLE'));assert(!body.prompt.includes('ACCEPTED FEMALE MAKEUP CONTINUITY'));
   if(withIdentity){assert.deepEqual(imageBytes(body.image[2]),await portraitIdentityCrop(portrait,[.25,.2,.75,.8]));assert(body.prompt.includes('UPLOADED-PERSON IDENTITY DETAIL — IMAGE 3'))}
   const decoded=await sharp(output).ensureAlpha().raw().toBuffer();assert.deepEqual(decoded.subarray((40*64+32)*4,(40*64+32)*4+4),Buffer.from([180,140,110,255]));
  });
 }
 await test('male additions reject a female makeup reference before any provider submission',async()=>{
  const makeup=await sharp({create:{width:160,height:160,channels:3,background:'#d48d9f'}}).jpeg().toBuffer(),before=requests.length;
  for(const added of additions)await assert.rejects(processProductionPortrait({input:portrait,fields:{hairId:added.id,portraitMode:'male',femaleEyeStyle:'makeup',creditKind:'hairstyle',femaleMakeupReference:'data:image/jpeg;base64,'+makeup.toString('base64')},root,key:'fixture-only-no-provider',removeBackground:async value=>value}),/เฉพาะการเปลี่ยนทรงผมหญิง/);
  assert.equal(requests.length,before);
 });
}finally{globalThis.fetch=originalFetch}

// Optional review proof against an existing pristine checkout. The default
// command remains portable and needs only this repository's files.
if(process.argv[2]){
 const baselineRoot=resolve(process.argv[2]),baseline=await import(pathToFileURL(baselineRoot+'/hairstyle-catalog.js'));
 const baselinePipeline=await import(pathToFileURL(baselineRoot+'/production-portrait-pipeline.js'));
 await test('baseline catalogue entries and every existing male/female prompt remain exactly unchanged',()=>{
  assert.deepEqual(PRODUCTION_HAIR_CATALOG.filter(h=>!additions.some(a=>a.id===h.id)),baseline.PRODUCTION_HAIR_CATALOG);assert.equal(HAIR_DESIGN_VERSION,baseline.HAIR_DESIGN_VERSION);
  assert.deepEqual(productionHair('seedream-35'),baseline.productionHair('seedream-35'));
  for(const h of baseline.PRODUCTION_HAIR_CATALOG)for(const style of ['natural','makeup'])assert.equal(productionPortraitPrompt(productionHair(h.id),style),baselinePipeline.productionPortraitPrompt(h,style),h.id+' '+style);
 });
 await test('all processing, credits, rights, cache and ear/neck implementation files are byte-identical to baseline',async()=>{
  for(const file of ['src/main.jsx','src/studio-editor.jsx','src/studio-hair-style-memory.js','src/free-female-hair.js','src/female-hair-exterior.js','src/male-temple-cleanup.js','production-portrait-pipeline.js','seedream-review-transport.js','server.js','src/saved-project.js','src/studio-editor.css'])assert.deepEqual(await bytes(file),await readFile(baselineRoot+'/'+file),file);
 });
}

console.log(`PASS: ${passed} new male hairstyle contracts; ${requests.length} mocked provider requests, no live AI or financial calls. Preview identity/style appearance needs visual review.`);
