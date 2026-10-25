import assert from 'node:assert/strict';
import sharp from 'sharp';
import {makeSavedProject,prepareSavedProject,validateSavedProject,assertSavedProjectResources} from '../src/saved-project.js';
import {isFemaleFinishProfile} from '../src/female-finish-profile.js';
import {isFemaleFinishReference,FEMALE_FINISH_REFERENCE_MAX_CHARS} from '../src/female-finish-reference.js';
import {packSavedProjectTransfer,unpackSavedProjectTransfer,getSavedWorkRequestSize,TRANSFER_VERSION} from '../src/saved-work-transfer.js';
import {compactSavedWorkPreview} from '../saved-work-thumbnail.js';
import {validateProject,MAX_SAVED_WORKS,SAVED_WORK_RETENTION_DAYS} from '../saved-work-store.js';

const data=(bytes,type)=>'data:image/'+type+';base64,'+bytes.toString('base64');
const pixels=source=>Buffer.from(source.slice(source.indexOf(',')+1),'base64');
const image=async(color,width=128,height=192,type='png')=>data(await sharp({create:{width,height,channels:3,background:color}})[type]().toBuffer(),type);
const firstReference=await image('#e0ac93',160,240,'jpeg');
const currentSource=await image('#bc8576'),nextSource=await image('#bd8275');
const profile={version:1,kind:'female-finish',coordinate:'face-v1',scale:{faceWidth:200,roughnessRadius:3},regions:['leftCheek','rightCheek'].map(id=>({id,lightness:[50,60,70],chroma:[9,12],roughness:1,samples:100,coverage:.6}))};
const head=extra=>({id:'head',kind:'head',name:'หัว · คอ · ผม',jobId:'paid-fixture',portraitMode:'female',femaleEyeStyle:'makeup',source:currentSource,x:5,y:-2,scale:1,rotation:0,opacity:1,...extra});
const project=layer=>({format:'idprom-studio',version:1,width:900,height:1200,layers:[layer],unknown:{keep:'future metadata'}});
const withFinish=extra=>head({femaleFinishProfile:profile,femaleFinishReference:firstReference,...extra});
const decode=async source=>{const {info}=await sharp(pixels(source)).raw().toBuffer({resolveWithObject:true});return {width:info.width,height:info.height}};
const deps={decode};
const clone=value=>JSON.parse(JSON.stringify(value));
const cases=[];
async function check(name,test){await test();cases.push(name);console.log('PASS '+name)}

await check('finish fixture is versioned plain JSON with a bounded canonical JPEG',()=>{
 assert(isFemaleFinishProfile(profile));assert(isFemaleFinishReference(firstReference));
 assert(firstReference.length<=FEMALE_FINISH_REFERENCE_MAX_CHARS);
});
await check('older projects without finish metadata remain compatible and retain unknown metadata',async()=>{
 const original=project(head()),prepared=await prepareSavedProject(clone(original),deps);
 assert.equal(prepared.femaleFinish,undefined);assert.deepEqual(prepared.project,original);
 assert.equal(prepared.head.femaleFinishReference,undefined);assert.equal(prepared.head.femaleFinishProfile,undefined);
});
await check('save, transfer and reopen preserve the first finish independently of the current head pixels',async()=>{
 const original=project(withFinish({mask:currentSource,processedOriginalSource:currentSource}));
 const saved=await makeSavedProject(original);saved.unknown=original.unknown;
 const packed=packSavedProjectTransfer(saved),roundtrip=unpackSavedProjectTransfer(clone(packed));
 assert.equal(TRANSFER_VERSION,'images-v1');assert.deepEqual(roundtrip,saved);
 assert.equal(getSavedWorkRequestSize('work-fixture',packed),Buffer.byteLength(JSON.stringify({id:'work-fixture',project:saved})));
 const opened=await prepareSavedProject(roundtrip,deps);
 assert.deepEqual(opened.femaleFinish,{profile,reference:firstReference});assert.notEqual(opened.head.source,firstReference);
 const changed={...opened.head,source:nextSource,makeupFullSource:nextSource};
 const reopened=await prepareSavedProject(clone(await makeSavedProject({...opened.project,layers:[changed]})),deps);
 assert.equal(reopened.head.source,nextSource);assert.equal(reopened.femaleFinish.reference,firstReference);assert.deepEqual(reopened.femaleFinish.profile,profile);
 assert.equal(reopened.head.femaleFinishReference,firstReference);
});
await check('reference pixels and encoded text count toward existing resource budgets without an editable surface',()=>{
 const baseline=assertSavedProjectResources(project(head())).summary(),finished=assertSavedProjectResources(project(withFinish())).summary();
 assert.equal(finished.uniqueImages,baseline.uniqueImages+1);assert.equal(finished.uniquePixels-baseline.uniquePixels,160*240);
 assert.equal(finished.residentBytes-baseline.residentBytes,160*240*4+firstReference.length*2);
});
await check('profile-only and reference-only optional metadata reopen without manufacturing a new finish',async()=>{
 for(const extra of [{femaleFinishProfile:profile},{femaleFinishReference:firstReference}]){
  const opened=await prepareSavedProject(project(head(extra)),deps);
  assert.equal(opened.femaleFinish.profile,extra.femaleFinishProfile);assert.equal(opened.femaleFinish.reference,extra.femaleFinishReference);
 }
});
await check('malformed profiles fail before decoding and preserve the active project',async()=>{
 const current={marker:'current work'},active={value:current};let decodes=0;
 for(const invalid of [null,{},[],{...profile,version:2},{...profile,scale:{...profile.scale,faceWidth:Infinity}},{...profile,regions:[{...profile.regions[0],lightness:[50,NaN,70]},profile.regions[1]]},{...profile,regions:[{...profile.regions[0],coverage:2},profile.regions[1]]}]){
  const incoming=project(withFinish({femaleFinishProfile:invalid}));
  await assert.rejects(async()=>{const ready=await prepareSavedProject(incoming,{decode:async source=>{decodes++;return decode(source)}});active.value=ready});
  assert.equal(active.value,current);
 }
 assert.equal(decodes,0);
});
await check('corrupt, noncanonical, oversized and unsupported references fail before decoding',async()=>{
 const tooWide=await image('tan',513,16,'jpeg'),tooTall=await image('tan',16,513,'jpeg');let decodes=0;
 const invalids=[null,'','https://example.invalid/reference.jpg',currentSource,firstReference+'A',firstReference.replace('base64,','base64,\n'),firstReference.replace('image/jpeg','image/png'),tooWide,tooTall,'data:image/jpeg;base64,'+'A'.repeat(FEMALE_FINISH_REFERENCE_MAX_CHARS)];
 for(const reference of invalids){
  assert(!isFemaleFinishReference(reference));
  await assert.rejects(prepareSavedProject(project(withFinish({femaleFinishReference:reference})),{decode:async source=>{decodes++;return decode(source)}}));
 }
 assert.equal(decodes,0);
});
await check('valid-looking JPEG headers still require a successful bounded decode before replacing active work',async()=>{
 const corrupt=data(Buffer.from([255,216,255,192,0,11,8,0,16,0,16,1,1,17,0,255,217]),'jpeg');
 assert(isFemaleFinishReference(corrupt));
 const current={marker:'current work'},active={value:current};
 await assert.rejects(async()=>{const ready=await prepareSavedProject(project(withFinish({femaleFinishReference:corrupt})),deps);active.value=ready});
 assert.equal(active.value,current);
 await assert.rejects(prepareSavedProject(project(withFinish()),{decode:async source=>source===firstReference?{width:1024,height:1024}:decode(source)}));
 assert.equal(active.value,current);
});
await check('compact previews omit private finish metadata and leave saved references untouched',async()=>{
 const original=project(withFinish()),snapshot=JSON.stringify(original),preview=await compactSavedWorkPreview(original),plainPreview=await compactSavedWorkPreview(project(head()));
 assert.deepEqual(preview,plainPreview);assert.equal(JSON.stringify(original),snapshot);
 assert(!JSON.stringify(preview).includes('femaleFinish'));assert(!JSON.stringify(preview).includes(firstReference));
});
await check('server validation receives the same version-one project shape and payment requirements',()=>{
 const original=project(withFinish()),roundtrip=unpackSavedProjectTransfer(packSavedProjectTransfer(original));
 assert.deepEqual(validateProject(roundtrip),['paid-fixture']);assert.equal(MAX_SAVED_WORKS,3);assert.equal(SAVED_WORK_RETENTION_DAYS,45);
 assert.throws(()=>validateProject(project(withFinish({jobId:undefined}))));
 assert.throws(()=>validateSavedProject(project(withFinish({femaleFinishReference:null}))));
});
console.log(JSON.stringify({passed:cases.length,cases,scope:'Local save/prepare, transfer, image decode, thumbnail and pure server validation only; no API, credentials or database calls'}));
