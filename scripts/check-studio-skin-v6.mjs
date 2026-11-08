import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {STUDIO_SKIN_WORKFLOW_VERSION} from '../studio-skin-treatment.js';
import {prepareStudioSkinInput} from '../studio-skin-input.js';
import {normalizeStudioReferenceFill} from '../studio-reference-fill.js';
import {productionPortraitPrompt,processProductionPortrait} from '../production-portrait-pipeline.js';
const prefix=(await readFile(new URL('./check-staged-portrait-pipeline.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').split('let passed=0;')[0];
const fixture=Function('STUDIO_SKIN_WORKFLOW_VERSION',prefix+';return fixture')(STUDIO_SKIN_WORKFLOW_VERSION);
let passed=0;const reports=[];async function test(name,run){const r=await run();passed++;reports.push({name,...r});console.log('PASS '+name)}
await test('v6 sends a complete photometric source without any regional skin retouch or old feature stencil',async()=>{
 const f=fixture({shadow:true,red:true,pores:true,retouch:true}),original=f.pixels.slice(),buffer=await sharp(f.pixels,{raw:{width:f.width,height:f.height,channels:4}}).png().toBuffer(),fields={portraitMode:'female',femaleEyeStyle:'natural',studioSkinVersion:STUDIO_SKIN_WORKFLOW_VERSION,studioSkinEvidence:JSON.stringify(f.evidence)},prepared=await prepareStudioSkinInput({buffer,mimetype:'image/png'},fields),expected=normalizeStudioReferenceFill(f),actual=await sharp(prepared.input.buffer).ensureAlpha().raw().toBuffer();
 assert.deepEqual(actual,Buffer.from(expected.pixels));assert.deepEqual(f.pixels,original);assert.equal(prepared.report.regionalRetouch,false);for(const key of ['softFocus','retouch','skinContinuity'])assert.equal(prepared.report[key],undefined);return {regionalRetouch:false,nativePixels:f.width*f.height};
});
await test('actual warm/dim and directional public inputs are normalized continuously without changing alpha or original pixels',async()=>{
 const dir='/workspace/output/skin-continuity-20261108/live-tests',rows=[];
 for(const name of ['balanced-defects','warm-dim','directional-shadow']){const e=JSON.parse(await readFile(dir+'/evidence-'+name+'.json','utf8'));e.version=STUDIO_SKIN_WORKFLOW_VERSION;const {data,info}=await sharp(dir+'/input-'+name+'.png').ensureAlpha().raw().toBuffer({resolveWithObject:true}),before=Buffer.from(data),r=normalizeStudioReferenceFill({pixels:data,width:info.width,height:info.height,evidence:e});assert.deepEqual(data,before);for(let k=3;k<data.length;k+=4)assert.equal(r.pixels[k],data[k]);if(name==='directional-shadow'){assert(r.report.directionalFill);assert(r.report.shadowGain>1.5&&r.report.shadowGain<=1.8);}rows.push({name,changed:r.changed,directionalFill:r.report.directionalFill,shadowGain:r.report.shadowGain});}return {rows};
});
await test('all finish choices request the same global even-skin and matte AI policy',()=>{
 const variants=['natural','makeup','korean-rosy-v1','soft-rosy-v1'].map(style=>productionPortraitPrompt({gender:'female'},style,{studioSkinVersion:STUDIO_SKIN_WORKFLOW_VERSION}));for(const p of variants){assert.equal(p,variants[0]);assert(p.includes('GLOBAL SKIN AND MATTE COMPLETION'));assert(p.includes('across ALL skin'));assert(p.includes('Strongly reduce forehead, nose and cheek specular shine'));assert(!p.includes('native defect repair completed'));}return {choices:4};
});
await test('production v6 still performs one generation with its normalized identity crop and final guide',async()=>{
 const f=fixture(),buffer=await sharp(f.pixels,{raw:{width:f.width,height:f.height,channels:4}}).png().toBuffer(),alpha=Buffer.alloc(64*80*4,180);for(let i=3;i<alpha.length;i+=4)alpha[i]=i<64*20?0:255;const matte=await sharp(alpha,{raw:{width:64,height:80,channels:4}}).png().toBuffer();let calls=0;
 const fields={hairId:'original',portraitMode:'female',femaleEyeStyle:'korean-rosy-v1',studioSkinVersion:STUDIO_SKIN_WORKFLOW_VERSION,studioSkinEvidence:JSON.stringify(f.evidence)};
 await processProductionPortrait({input:{buffer,mimetype:'image/png'},fields,root:process.cwd(),key:'inert-test-only',removeBackground:async()=>matte,requestPortrait:async p=>{calls++;assert(p.identity?.length>100);assert(p.skinReference?.length>100);assert(p.prompt.includes('GLOBAL SKIN AND MATTE COMPLETION'));return {png:buffer}}});assert.equal(calls,1);return {providerCalls:1,inertProvider:true};
});
console.log(JSON.stringify({passed,reports,scope:'v6 normalized whole-image source, global matte policy, same bare prompt, one inert provider, plus actual existing public lighting inputs. No live provider, payment or account writes.'}));
