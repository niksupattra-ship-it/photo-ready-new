import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {PRODUCTION_HAIR_CATALOG,selectedHairDesign} from '../hairstyle-catalog.js';
import {HAIR_REFERENCE_VERSION,catalogueHairDetail,PICKER_HAIR_PRIORITY} from '../catalogue-hair-policy.js';
import {loadCatalogueHairGuide} from '../catalogue-hair-guide.js';
import {processProductionPortrait,portraitIdentityCrop,validateProductionPortrait} from '../production-portrait-pipeline.js';
import {boundedPortraitPrompt} from '../portrait-anatomy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {NATURAL_STUDIO_SKIN_VERSION} from '../natural-studio-skin.js';
const root=new URL('..',import.meta.url).pathname,hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile(root+'public/assets/catalogue-hair-guides/v1/manifest.json','utf8'));
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
await test('all 35 guides use exact selected picker RGB and native dimensions, with no eyes, mouth, chin or hidden donor RGB',async()=>{
 assert.equal(manifest.version,HAIR_REFERENCE_VERSION);assert.equal(Object.keys(manifest.entries).length,PRODUCTION_HAIR_CATALOG.length);
 for(const item of PRODUCTION_HAIR_CATALOG){const entry=manifest.entries[item.id],preview=await readFile(root+'public'+item.src),guide=await loadCatalogueHairGuide(item.id,root),a=await sharp(preview).ensureAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(guide).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(entry.preview,item.src);assert.equal(hash(preview),entry.previewSha256);assert.equal(hash(guide),entry.guideSha256);assert.equal(a.info.width,b.info.width);assert.equal(a.info.height,b.info.height);let kept=0;
  for(let i=0;i<a.info.width*a.info.height;i++){const j=i*4;if(b.data[j+3]){kept++;assert.deepEqual(b.data.subarray(j,j+3),a.data.subarray(j,j+3),item.id+' RGB changed')}else assert.deepEqual([...b.data.subarray(j,j+3)],[255,255,255],item.id+' hidden RGB contains donor')}
  assert.equal(kept,entry.hairPixels);assert(kept>1000);assert(catalogueHairDetail(item.id));
  const sample=(x,y)=>b.data[(Math.round(y*b.info.height)*b.info.width+Math.round(x*b.info.width))*4+3];
  for(const [l,r] of [[33,133],[263,362],[61,291]]){const p=entry.face[l],q=entry.face[r];assert.equal(sample((p.x+q.x)/2,(p.y+q.y)/2),0,item.id+' donor feature remains')}
  for(const id of [1,152])assert.equal(sample(entry.face[id].x,entry.face[id].y),0,item.id+' donor face remains');
 }
});
await test('current requests send each exact guide and a crop of the original face, retaining existing AI stage counts',async()=>{
 const raw=await sharp({create:{width:160,height:200,channels:3,background:'#bb9977'}}).jpeg().toBuffer(),input={buffer:raw,mimetype:'image/jpeg'},prepared=await sharp({create:{width:160,height:200,channels:3,background:'#aa9988'}}).png().toBuffer(),pixels=new Uint8Array(40*60*4);for(let y=6;y<54;y++)for(let x=6;x<34;x++)pixels.set([185,150,130,255],(y*40+x)*4);const final=await sharp(pixels,{raw:{width:40,height:60,channels:4}}).png().toBuffer(),box=[.2,.15,.8,.85],identity=await portraitIdentityCrop(input,box);
 for(const selected of PRODUCTION_HAIR_CATALOG){let calls=0;const female=selected.gender==='female',fields={hairId:selected.id,portraitMode:selected.gender,femaleEyeStyle:'natural',hairReferenceVersion:HAIR_REFERENCE_VERSION,faceIdentityBox:JSON.stringify(box),...(female?{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,naturalFinishVersion:NATURAL_STUDIO_SKIN_VERSION}:{})};
  await processProductionPortrait({input,fields,root,requestPortrait:async request=>{calls++;if(female&&calls===1){assert.equal(request.portrait,raw);assert.equal(request.hair,undefined);return {png:prepared}}assert.equal(hash(request.hair),manifest.entries[selected.id].guideSha256,selected.id+' wrong guide');assert.deepEqual(request.identity,identity,selected.id+' identity not from original crop');assert.match(request.prompt,new RegExp('SELECTED PICKER HAIR '+selected.id));assert(request.prompt.includes(PICKER_HAIR_PRIORITY));assert.equal(request.portrait,female?prepared:raw);return {png:final}},removeBackground:async bytes=>bytes});assert.equal(calls,female?2:1,selected.id+' extra generation');
 }
});
await test('reference-specific fringes, waves, lob endpoints and cheek wisps override generic grooming rules',()=>{
 const fields={hairReferenceVersion:HAIR_REFERENCE_VERSION};for(const id of ['seedream-02','seedream-04','seedream-06','seedream-07','seedream-10','seedream-19','seedream-20','seedream-24']){const selected=PRODUCTION_HAIR_CATALOG.find(h=>h.id===id),prompt=boundedPortraitPrompt(selected,'natural',fields);assert(prompt.includes(catalogueHairDetail(id)));assert.doesNotMatch(prompt,/even if present in Image 1 or the reference/);assert.match(prompt,/Expose ears only where the reference exposes them/);if(id==='seedream-20'){assert(selectedHairDesign(selected).faceFraming);assert.match(prompt,/intentional short cheek wisps/);assert.doesNotMatch(prompt,/Remove every straight neck strand.*detached ear wisp/)} }
});
await test('unknown protocol and paths fail without falling back to a stale reference',async()=>{
 assert.throws(()=>validateProductionPortrait({buffer:Buffer.from('x'),mimetype:'image/jpeg'},{portraitMode:'female',hairId:'seedream-41',hairReferenceVersion:'bad'}));await assert.rejects(loadCatalogueHairGuide('../other',root),/Invalid/);await assert.rejects(loadCatalogueHairGuide('seedream-99',root),e=>e.code==='hairstyle_reference_unavailable');
});
await test('every new first-upload result is compared with its selected picker before acceptance',async()=>{
 const main=await readFile(root+'src/main.jsx','utf8'),a=main.indexOf('async function checkPortraitCompletion('),b=main.indexOf('\nconst femaleMakeupGuideCache',a);assert(a>=0&&b>a);
 for(const mismatch of [false,true]){let compared=0;const original=new Blob(['owned original']),result={idpromStudioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,idpromHairReferenceVersion:HAIR_REFERENCE_VERSION};
  const env={ORIGINAL_PORTRAIT_AI_VERSION,PRODUCTION_HAIR_CATALOG,selectedHairDesign,portraitCompletionEvidence:async(_result,_garments,options)=>{assert(options.includeHair);return {garments:{measurable:true,retained:false}}},selectedHairEvidence:async id=>{assert.equal(id,'seedream-42');return {}},inspectSelectedPortraitHair:()=>{compared++;return {mismatch}}};
  const run=Function('env','with(env){'+main.slice(a,b)+';return checkPortraitCompletion}')(env);
  if(mismatch)await assert.rejects(run(original,result,'seedream-42'),e=>e.code==='selected_hairstyle_mismatch');else await run(original,result,'seedream-42');assert.equal(compared,1);
 }
});
console.log(JSON.stringify({passed,guides:PRODUCTION_HAIR_CATALOG.length,scope:'Actual picker/guide pixels and checksums, every style actual provider payload with inert transport, original-upload face crop, unchanged generation counts and specific reference priorities. No external generation or customer data.'}));
