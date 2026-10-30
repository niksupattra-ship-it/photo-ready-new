import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
import {PRODUCTION_HAIR_CATALOG,productionHair,isTrialHairAllowed,downloadHairAllowed,selectedHairDesign,selectedHairInstruction,HAIR_DESIGN_VERSION} from '../hairstyle-catalog.js';
import {validateProductionPortrait,processProductionPortrait,productionPortraitPrompt,portraitIdentityCrop} from '../production-portrait-pipeline.js';
import {femaleFinishFor} from '../review-portrait-finish.js';
import {isFreeFemaleHair} from '../src/free-female-hair.js';
import {REVIEW_SEEDREAM_MODEL,REVIEW_SEEDREAM_ENDPOINT} from '../seedream-review-transport.js';

// The four uploaded reference PNGs are preserved exactly. Picker previews came
// from the separately supplied, numerically paired preview archive. Nothing in
// this check contacts an AI provider, customer account or payment/database API.
const project=new URL('../',import.meta.url),root=decodeURIComponent(project.pathname);
const additions=[
 {id:'seedream-40',kind:'gathered',reference:'ba0f160de80e63541b54d508cae470222be1a8ebba9aed04ee2e83fe9448243d',preview:'5caae264bf546db10680ee4aa308d883b87c50a260322fb81b7de587d21eebcc'},
 {id:'seedream-41',kind:'gathered',reference:'b22307c66c41f4780fc94c1f9ac2012d25fd4cb8c04582c917c1d77495603219',preview:'d9d33d8595dfd14ac233f6511f01197ae7d5b4edaaeacb6c5dfc0021e18d69cc'},
 {id:'seedream-42',kind:'long',reference:'8691bfc5c31cd35fc30b5068fbe06d2eeb108da2e6db8b62e43d3fcef5b83a87',preview:'95d3c87a0963b44ca7ad99f5583909ddb796b020f73d52481bf9de6769fcaec0'},
 {id:'seedream-43',kind:'long',reference:'5ad5c6a2417adaca7f19c9e7c2aa7bcd4d5147b6f1d51f017b3866d3cf15bd7d',preview:'c58d4adb9737cc2d97bd8df1a1bcecdbab42c0575ee01b142ef9660bffdac0e8'}
];
const ids=additions.map(a=>a.id),references=new Map(),previews=new Map(),cases=[];
const bytes=path=>readFile(new URL(path,project));
const text=async path=>(await bytes(path)).toString();
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const imageBytes=uri=>Buffer.from(uri.split(',')[1],'base64');
async function test(name,run){await run();cases.push(name);console.log('PASS '+name)}

await test('four new female IDs retain numeric 1–4 order and the intended gathered/long silhouettes',()=>{
 assert.equal(new Set(PRODUCTION_HAIR_CATALOG.map(h=>h.id)).size,PRODUCTION_HAIR_CATALOG.length);
 assert.deepEqual(PRODUCTION_HAIR_CATALOG.slice(0,4).map(h=>h.id),ids);
 for(const [i,added] of additions.entries()){
  const h=productionHair(added.id);assert(h);assert.equal(h.gender,'female');
  assert.equal(h.name,'ทรงผมหญิง '+(i+1));assert.equal(h.file,(40+i)+'.png');
  assert.equal(h.src,'/assets/seedream-hairstyles/previews/'+(40+i)+'.webp');
  assert.equal(selectedHairDesign(h).kind,added.kind);
  assert.notEqual(selectedHairDesign(h).description,'the exact parting, fringe, texture, silhouette and cut length in Image 2');
  assert.equal(isTrialHairAllowed(h.id),true);assert.equal(downloadHairAllowed(h.id),true);
  assert.equal(isFreeFemaleHair(h.id),false,'AI-reference additions must not enter the unrelated local-PNG placement path');
 }
});

await test('each reference is the exact uploaded transparent PNG and each preview is its approved separate WebP',async()=>{
 for(const added of additions){
  const h=productionHair(added.id),reference=await bytes('public/assets/seedream-hairstyles/references/'+h.file),preview=await bytes('public'+h.src);
  assert.equal(digest(reference),added.reference);assert.equal(digest(preview),added.preview);
  const r=await sharp(reference).metadata(),p=await sharp(preview).metadata();
  assert.equal(r.format,'png');assert.equal(r.hasAlpha,true);assert.deepEqual([r.width,r.height],[464,548]);
  const alpha=(await sharp(reference).ensureAlpha().stats()).channels[3];assert(alpha.min<10&&alpha.max>250);
  assert.equal(p.format,'webp');assert.deepEqual([p.width,p.height],[512,512]);
  assert.notDeepEqual(reference,preview);references.set(h.id,reference);previews.set(h.id,preview);
 }
 assert.equal(new Set([...references.values()].map(digest)).size,4);
 assert.equal(new Set([...previews.values()].map(digest)).size,4);
});

const main=await text('src/main.jsx'),editor=await text('src/studio-editor.jsx'),serverSource=await text('server.js');
await test('actual picker order and diamond classifier put all four additions first and keep old premium styles locked',()=>{
 const match=main.match(/const BASIC_FEMALE_HAIR_IDS=(\[[^\n]+\]);/);assert(match);
 const basic=new Function('return '+match[1])();assert.deepEqual(basic.slice(0,4),ids);
 assert.deepEqual(basic.slice(4),['seedream-16','seedream-38','seedream-39']);
 const classify=editor.match(/ const isPremiumHair=id=>[^\n]+;/);assert(classify);
 const femaleHair=PRODUCTION_HAIR_CATALOG.filter(h=>h.gender==='female'),maleHair=PRODUCTION_HAIR_CATALOG.filter(h=>h.gender==='male');
 const isPremium=new Function('femaleHair','maleHair','isFreeFemaleHair',classify[0]+';return isPremiumHair;')(femaleHair,maleHair,isFreeFemaleHair);
 for(const id of [...ids,'seedream-16','seedream-38','seedream-39','seedream-28'])assert.equal(isPremium(id),false,id);
 for(const id of ['seedream-07','seedream-29'])assert.equal(isPremium(id),true,id);
});

// Exercise the actual production credit gate, without running a server or any
// generation engine. Basic styles must short-circuit before premium entitlement
// lookup; no debit, paid-image grant or account activation is available here.
const gateStart=serverSource.indexOf('async function requireCredit('),gateEnd=serverSource.indexOf('\nconst upload=',gateStart);
assert(gateStart>=0&&gateEnd>gateStart);
let premiumChecks=0;
const gateEnv={crypto,PRODUCTION_HAIR_CATALOG,downloadHairAllowed,walletId:()=> 'local-fixture-wallet',isPrivateOwner:()=>false,
 hasPrivateTrial:()=>false,getWallet:()=>{throw Error('Unexpected private-wallet read')},
 accountPolicy:()=>({canGeneratePremiumHair:async()=>{premiumChecks++;return false}})};
const requireCredit=new Function('env','with(env){'+serverSource.slice(gateStart,gateEnd)+';return requireCredit;}')(gateEnv);
const gate=async(hairId,kind='hairstyle')=>{
 let status=200,data=null;const res={status(n){status=n;return this},json(value){data=value;return this}};
 const result=await requireCredit({body:{hairId,premiumHair:true,premiumDownloadRemaining:99},get:()=>undefined},res,kind);
 return {status,data,result};
};
await test('new basic female styles pass both generation credit gates without a premium lookup or credit debit',async()=>{
 for(const id of ids)for(const kind of ['ai-finish','hairstyle']){
  const before=premiumChecks,out=await gate(id,kind);assert.equal(out.status,200);assert.equal(premiumChecks,before);
  assert.match(out.result.usageId,/^free_[a-f0-9]+$/);assert.equal(out.result.trialPreview,true);
  assert.equal(out.result.generationRemaining,0);assert.equal(out.result.hairRemaining,0);
 }
});
await test('existing premium female/male styles still require rights and unknown style IDs still fail closed',async()=>{
 for(const id of ['seedream-07','seedream-29']){
  const before=premiumChecks,out=await gate(id);assert.equal(out.status,403);assert.equal(out.data.error,'premium_hair_required');assert.equal(out.result,null);assert.equal(premiumChecks,before+1);
 }
 const before=premiumChecks,unknown=await gate('seedream-999');assert.equal(unknown.status,400);assert.equal(unknown.data.error,'invalid_hairstyle');assert.equal(unknown.result,null);assert.equal(premiumChecks,before);
 for(const id of ['seedream-16','seedream-38','seedream-39','seedream-28'])assert.equal((await gate(id)).status,200,id);
});

const portrait={buffer:await sharp({create:{width:160,height:200,channels:3,background:'#bd967c'}}).png().toBuffer(),mimetype:'image/png'};
const pixels=Buffer.alloc(64*96*4);
for(let y=12;y<84;y++)for(let x=16;x<48;x++){const p=(y*64+x)*4;pixels[p]=180;pixels[p+1]=140;pixels[p+2]=110;pixels[p+3]=255}
const generated=await sharp(pixels,{raw:{width:64,height:96,channels:4}}).png().toBuffer();
const originalFetch=globalThis.fetch,requests=[];
globalThis.fetch=async(url,options)=>{
 assert.equal(url,REVIEW_SEEDREAM_ENDPOINT);assert.equal(options.method,'POST');
 requests.push(JSON.parse(options.body));
 return {ok:true,json:async()=>({data:[{b64_json:generated.toString('base64')}]}),headers:{get:()=>null}};
};
try{
 for(const added of additions)for(const finish of ['natural','makeup'])for(const identity of [false,true]){
  await test(`${added.id} ${finish}, identity ${identity}: one production request uses the uploaded person and exact reference PNG`,async()=>{
   const fields={hairId:added.id,portraitMode:'female',femaleEyeStyle:finish,creditKind:'hairstyle',...(identity?{faceIdentityBox:'[0.25,0.2,0.75,0.8]'}:{})};
   const selected=validateProductionPortrait(portrait,fields);assert.equal(selected.id,added.id);
   const stages=[],before=requests.length;
   const output=await processProductionPortrait({input:portrait,fields,root,key:'fixture-only-no-provider',removeBackground:async value=>value,onStage:async s=>stages.push(s)});
   assert.equal(requests.length,before+1);assert.deepEqual(stages,['generation','matting','edges']);
   const body=requests.at(-1);assert.equal(body.model,REVIEW_SEEDREAM_MODEL);assert.equal(body.size,'2K');
   assert.equal(body.output_format,'png');assert.equal(body.response_format,'b64_json');
   assert.equal(body.image.length,identity?3:2);assert.deepEqual(imageBytes(body.image[0]),portrait.buffer);
   assert.deepEqual(imageBytes(body.image[1]),references.get(added.id));assert.notDeepEqual(imageBytes(body.image[1]),previews.get(added.id));
   assert(body.prompt.includes(selectedHairInstruction(selected)));assert(body.prompt.includes(femaleFinishFor(finish)));
   assert(body.prompt.includes('LOWER FACE AND EAR ANATOMY PRIORITY'));assert(body.prompt.includes('WIDE ROUND NECKLINE'));
   assert(!body.prompt.includes('MALE PORTRAIT:'));assert(!body.prompt.includes('FINAL FEMALE DEFAULT'));
   if(identity){assert.deepEqual(imageBytes(body.image[2]),await portraitIdentityCrop(portrait,[.25,.2,.75,.8]));assert(body.prompt.includes('UPLOADED-PERSON IDENTITY DETAIL — IMAGE 3'))}
   const decoded=await sharp(output).ensureAlpha().raw().toBuffer();assert.deepEqual(decoded.subarray((40*64+32)*4,(40*64+32)*4+4),Buffer.from([180,140,110,255]));
  });
 }
 await test('an invalid new-style identity crop is rejected before any provider submission',async()=>{
  const before=requests.length;
  await assert.rejects(processProductionPortrait({input:portrait,fields:{hairId:'seedream-40',portraitMode:'female',femaleEyeStyle:'natural',faceIdentityBox:'[1,0,0,1]'},root,key:'fixture-only-no-provider',removeBackground:async value=>value}),/กรอบใบหน้า/);
  assert.equal(requests.length,before);
 });
}finally{globalThis.fetch=originalFetch}

// Optional comparison against a pristine baseline. New unique IDs need no
// global cache-version bump, and no old hairstyle prompt should change.
if(process.argv[2]){
 const baselineRoot=resolve(process.argv[2]),baseline=await import(pathToFileURL(baselineRoot+'/hairstyle-catalog.js'));
 const baselinePipeline=await import(pathToFileURL(baselineRoot+'/production-portrait-pipeline.js'));
 await test('all original catalogue entries, cache version and existing male/female prompts are unchanged',()=>{
  assert.deepEqual(PRODUCTION_HAIR_CATALOG.filter(h=>!ids.includes(h.id)),baseline.PRODUCTION_HAIR_CATALOG);
  assert.equal(HAIR_DESIGN_VERSION,baseline.HAIR_DESIGN_VERSION);
  for(const h of baseline.PRODUCTION_HAIR_CATALOG)for(const finish of ['natural','makeup'])assert.equal(productionPortraitPrompt(productionHair(h.id),finish),baselinePipeline.productionPortraitPrompt(h,finish),h.id+' '+finish);
 });
 await test('business handlers differ from baseline only in the three intended basic-style allowlists',async()=>{
  const replacements=[
   ['src/main.jsx',"const BASIC_FEMALE_HAIR_IDS=['seedream-16','seedream-38','seedream-39'];","const BASIC_FEMALE_HAIR_IDS=['seedream-40','seedream-41','seedream-42','seedream-43','seedream-16','seedream-38','seedream-39'];"],
   ['src/studio-editor.jsx',"!['seedream-16','seedream-38','seedream-39'].includes(id)","!['seedream-40','seedream-41','seedream-42','seedream-43','seedream-16','seedream-38','seedream-39'].includes(id)"],
   ['server.js','![16,38,39].includes(Number(chosen.id.slice(9)))','![40,41,42,43,16,38,39].includes(Number(chosen.id.slice(9)))']
  ];
  for(const [file,from,to] of replacements){const old=await readFile(baselineRoot+'/'+file,'utf8');assert.equal(old.split(from).length,2,file);assert.equal(await text(file),old.replace(from,to),file)}
  for(const file of ['production-portrait-pipeline.js','seedream-review-transport.js','download-policy-store.js','account-feature-policy.js','premium-download-credits.js','src/studio-hair-style-memory.js','src/free-female-hair.js','src/image-download.js','src/download-audit.js','src/saved-project.js'])assert.deepEqual(await bytes(file),await readFile(baselineRoot+'/'+file),file);
 });
}
const result={passed:cases.length,failed:0,mockedProviderRequests:requests.length,cases,
 scope:'Actual catalogue, server requireCredit and production portrait pipeline with local fixtures and intercepted provider transport. Reference/preview mapping and prompt/input preservation are verified; generated hairstyle appearance is not a live AI visual test. No payment, customer, provider or production database calls.'};
if(process.env.BASIC_FEMALE_HAIR_RESULTS)await writeFile(process.env.BASIC_FEMALE_HAIR_RESULTS,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
