import {retainedGovernmentInsignia} from '../src/government-insignia-retention.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {detectUniformDetails,matchUniformDetails,REAL_UNIFORM_DETAIL_TEMPLATES,realUniformDetailsVersionFor,hasAdjustedRealUniformDetails} from '../src/real-uniform-details.js';
import {replaceHairstyleLayer} from '../src/replace-hairstyle-layer.js';
const root=new URL('..',import.meta.url);
async function pixels(file){return sharp(await readFile(new URL('public/assets/government-uniforms/'+file,root))).resize({width:640}).ensureAlpha().raw().toBuffer({resolveWithObject:true}).then(({data,info})=>({data,width:info.width,height:info.height}))}
test('real female and male references and actual finished portraits locate their own two shoulders and buttons',async()=>{
 for(const [source,portrait,count]of [['female-operational.png','female-operational-example.jpg',1],['male-government-employee.png','male-operational-example.png',3]]){
  const a=detectUniformDetails(await pixels(source)),b=detectUniformDetails(await pixels(portrait));
  assert(a&&b);assert.equal(a.boards.length,2);assert.equal(b.boards.length,2);assert.equal(b.buttons.length,count);
  const matches=matchUniformDetails(a,b);assert.equal(matches.length,count+2);
  assert(b.boards[0].cx<b.boards[1].cx);assert(b.boards.every(g=>g.w/g.h>2));
  assert.notEqual(a.boards[0].cy,b.boards[0].cy,'AI composition is measured independently of native garment coordinates');
 }
});
test('moving the actual portrait moves measured details; a missing shoulder refuses automatic replacement',async()=>{
 const image=await pixels('female-operational-example.jpg'),original=detectUniformDetails(image);
 const shifted=await sharp(image.data,{raw:{width:image.width,height:image.height,channels:4}}).extend({top:40,bottom:0,left:0,right:0,background:'#3683ff'}).raw().toBuffer({resolveWithObject:true});
 const measured=detectUniformDetails({data:shifted.data,width:shifted.info.width,height:shifted.info.height});
 assert(measured);for(let i=0;i<2;i++)assert(Math.abs(measured.boards[i].cy-original.boards[i].cy-40)<1);
 const missing=new Uint8ClampedArray(image.data);
 for(let y=350;y<560;y++)for(let x=0;x<280;x++)missing.set([30,130,255,255],(y*image.width+x)*4);
 assert.equal(detectUniformDetails({...image,data:missing}),null);
 assert.equal(detectUniformDetails({data:new Uint8Array(640*800*4).fill(255),width:640,height:800}),null);
 assert.deepEqual(matchUniformDetails(null,original),[]);
});
test('switching a generated portrait removes only its linked real details; unrelated accessories survive',()=>{
 const layers=[{id:'head',source:'old'},{id:'board',kind:'uniform-detail',realUniformDetail:true,hairHeadId:'head',source:'native-board'},{id:'pin',kind:'chest',source:'real-pin'}];
 const next=replaceHairstyleLayer(layers,'head',{source:'new'});
 assert.deepEqual(next.map(l=>l.id),['head','pin']);assert.equal(next[1].source,'real-pin');
});

test('saved work retains the original reversible image and validates its resource budget',async()=>{
 const {validateSavedProject,assertSavedProjectResources}=await import('../src/saved-project.js');
 const png='data:image/png;base64,'+(await sharp({create:{width:32,height:32,channels:4,background:'#fff'}}).png().toBuffer()).toString('base64');
 const project={format:'idprom-studio',version:1,width:900,height:1200,layers:[{id:'head',kind:'head',name:'หัว · คอ · ผม',source:png,realUniformOriginalSource:png,realUniformDetailsVersion:'real-uniform-details-v4-covered-cleanup',x:0,y:0,scale:1,rotation:0,opacity:1}]};
 assert.equal(validateSavedProject(project),project);assertSavedProjectResources(project);
 assert.throws(()=>validateSavedProject({...project,layers:[{...project.layers[0],realUniformOriginalSource:'https://example.invalid/image.png'}]}));
});


test('every supported real garment supplies both native boards and its actual button row',async()=>{
 for(const path of REAL_UNIFORM_DETAIL_TEMPLATES){const measured=detectUniformDetails(await pixels(path.split('/').at(-1)));assert(measured,path);assert.equal(measured.boards.length,2);assert(measured.buttons.length>0,path)}
});


test('automatic details never modify a locked, hidden or manually masked portrait',async()=>{
 const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 const start=editor.indexOf(' const applyRealUniformDetails=async'),end=editor.indexOf(' useEffect(()=>{',start);
 for(const patch of [{locked:true},{visible:false},{mask:'manual-mask'}]){
  const head={id:'head',source:'original pixels',...patch};
  const env={state:{current:[head]},governmentImageHead:head,realDetailEligible:true,ready:true,processActive:false,assetBusy:false,realDetailBusy:{current:false}};
  const apply=Function('env','with(env){'+editor.slice(start,end)+';return applyRealUniformDetails}')(env);
  await apply({automatic:true});assert.equal(head.source,'original pixels');assert.equal(env.realDetailBusy.current,false);
 }
 for(const archived of ['editingPurchasedImage','savedWorkUnlocked']){
  const head={id:'head',jobId:'initial-job',source:'paid original pixels'};
  const env={accountScope:'same-account',governmentTemplate:'/assets/government-uniforms/female-operational.png',realDetailInitialJobs:{current:new Set(['initial-job'])},realDetailMemory:{current:new Map()},state:{current:[head]},governmentImageHead:head,realDetailEligible:true,ready:true,processActive:false,assetBusy:false,realDetailBusy:{current:false},editingPurchasedImage:false,savedWorkUnlocked:false,[archived]:true};
  const apply=Function('env','with(env){'+editor.slice(start,end)+';return applyRealUniformDetails}')(env);
  await apply({automatic:true});assert.equal(head.source,'paid original pixels');
 }
});

test('native detail auto-placement follows cached hairstyle changes even when the job id is reused, and respects undo within the same style',async()=>{
 const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 const start=editor.indexOf(' useEffect(()=>{\n  if(realDetailScope.current'),end=editor.indexOf(' const easyGovernmentInsigniaFitRef',start);
 let calls=0;
 const env={realUniformDetailsVersionFor,useEffect:cb=>cb(),realDetailScope:{current:'account'},accountScope:'account',realDetailEligible:true,ready:true,assetBusy:false,processActive:false,governmentTemplate:'/assets/government-uniforms/male-government-employee.png',governmentImageHead:{jobId:'cached-job',hairId:'thai-male-auto'},realDetailSeen:{current:null},applyRealUniformDetails:()=>{calls++}};
 const effect=Function('env','with(env){'+editor.slice(start,end)+'}');
 effect(env);assert.equal(calls,1);
 effect(env);assert.equal(calls,1,'Undo native details does not immediately reapply');
 env.governmentImageHead={jobId:'cached-job',hairId:'seedream-36'};effect(env);assert.equal(calls,2,'Same-job cached hair needs its own boards/buttons');
 env.governmentImageHead={jobId:'cached-job',hairId:'thai-male-auto',realUniformDetailsVersion:realUniformDetailsVersionFor(env.governmentTemplate)};effect(env);assert.equal(calls,2,'Restored native layers are not pasted twice');
});

test('restored male placement preserves native insignia aspect and approved button size',async()=>{
 const reference=detectUniformDetails(await pixels('male-government-employee.png')),portrait=detectUniformDetails(await pixels('male-operational-example.png'));
 const before=structuredClone(portrait),parts=matchUniformDetails(reference,portrait,{maleReference:true});
 const xs=portrait.boards.flatMap(b=>b.hull.map(p=>p.x)),span=Math.max(...xs)-Math.min(...xs);
 assert.equal(parts.length,5);
 for(const p of parts){
  if(p.source.kind==='button'){assert.equal(p.target.w,span*.053);assert.equal(p.target.h,span*.053)}
  else assert(Math.abs(p.target.w/p.target.h-p.source.w/p.source.h)<1e-10);
 }
 assert.deepEqual(portrait,before,'Read-only placement geometry never rewrites the native or AI photo');
 assert.equal(realUniformDetailsVersionFor('/assets/government-uniforms/female-operational.png'),'real-uniform-details-v4-covered-cleanup');
 assert.equal(realUniformDetailsVersionFor('/assets/government-uniforms/interior-01.png'),'real-uniform-details-v2-male-reference');
 const measured=matchUniformDetails(reference,portrait);for(const part of measured){const original=part.source.kind==='button'?portrait.buttons[measured.filter(p=>p.source.kind==='button').indexOf(part)]:portrait.boards[part.name.endsWith('ขวา')?1:0];assert.equal(part.target.w,original.w);assert.equal(part.target.h,original.h);assert.equal(part.target.angle,original.angle)}
 const browser=await readFile(new URL('../src/real-uniform-details-browser.js',import.meta.url),'utf8');assert(browser.includes('maleReference:realUniformDetailsVersionFor(templatePath)!==REAL_UNIFORM_DETAILS_VERSION'),'Male native aspect is restored while the female path is unchanged');
});

test('detail revision upgrades preserve manual moves and unrelated chest/collar accessories',()=>{
 const head={id:'head',x:3,y:4,scale:.95,rotation:2},part={id:'board',realUniformDetail:true,hairHeadId:'head',hairHeadPose:{x:3,y:4,scale:.95,rotation:2},x:3,y:4,scale:.95,rotation:2};
 assert.equal(hasAdjustedRealUniformDetails([part,{kind:'chest',x:90}],head),false);
 for(const patch of [{x:11},{y:8},{scale:1.1},{locked:true},{visible:false},{opacity:.5}])assert.equal(hasAdjustedRealUniformDetails([{...part,...patch}],head),true);
});


test('same government outfit keeps selected native insignia and exact manual edits across a new full portrait',()=>{
 const head={generatedOutfitTemplate:'/assets/government-uniforms/female-operational.png'};
 const insignia=[{kind:'collar',id:'c',assetId:'garuda',collarLeftX:12,collarRightY:3,visible:true},{kind:'chest',id:'b',assetId:'pao',x:4,scale:1.12},{kind:'ribbon',id:'r',assetId:'2515',visible:false,locked:true}];
 assert.deepEqual(retainedGovernmentInsignia([{kind:'uniform-detail'},...insignia],head,{...head,jobId:'new'}),insignia);
 assert.equal(retainedGovernmentInsignia(insignia,head,head)[0],insignia[0],'Keep original native source and manual controls');
 for(const [old,next,options] of [[head,head,{englishFlow:true}],[null,head,{}],[head,{generatedOutfitTemplate:'/assets/government-uniforms/female-senior.png'},{}]])assert.deepEqual(retainedGovernmentInsignia(insignia,old,next,options),[]);
});
