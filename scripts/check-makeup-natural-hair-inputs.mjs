import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {processProductionPortrait,validateProductionPortrait,productionPortraitPrompt} from '../production-portrait-pipeline.js';
import {PRODUCTION_HAIR_CATALOG,selectedHairInstruction,selectedHairPlacement} from '../hairstyle-catalog.js';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
import {submitPortraitJob} from '../src/portrait-operation.js';
import {SOFT_ROSY_COMPLETION_CHECK,ORIGINAL_PORTRAIT_COSMETICS} from '../soft-rosy-portrait-finish.js';
const main=await readFile('src/main.jsx','utf8'),server=await readFile('server.js','utf8');
const take=(text,a,b)=>{const i=text.indexOf(a),j=text.indexOf(b,i);assert(i>=0&&j>i);return text.slice(i,j)};
const fn=(text,a,b,name,env)=>Function('env',`with(env){${take(text,a,b)};return ${name}}`)(env);
const root=await mkdtemp(path.join(tmpdir(),'finish-route-'));
const source=await sharp({create:{width:160,height:200,channels:4,background:'#bc9883'}}).png().toBuffer();
const result=await sharp({create:{width:80,height:100,channels:4,background:'#bc9883'}}).extend({top:2,bottom:2,left:2,right:2,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
await mkdir(path.join(root,'public/assets/seedream-hairstyles/references'),{recursive:true});await writeFile(path.join(root,'public/assets/seedream-hairstyles/references/19.png'),await sharp({create:{width:160,height:200,channels:4,background:'#112233'}}).png().toBuffer());
await mkdir(path.join(root,'public/assets/job-uniforms'),{recursive:true});await writeFile(path.join(root,'public/assets/job-uniforms/fixture.png'),source);
const originalFetch=globalThis.fetch;const calls=[];const visible=new Map();
globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({data:[{b64_json:result.toString('base64')}]}),headers:{get:()=>null}}};
try{
for(const replacement of [false,true])for(const style of ['natural','korean-rosy-v1']){
 let handler,job,completed,serial=0;const noop=()=>{};
 const env={validateProductionPortrait,processProductionPortrait,dir:root,process:{env:{ARK_API_KEY:'offline-mock-only'}},getModnetSession:async()=>{},modnetRemoveBackground:async x=>x,requireCredit:async()=>({usageId:'local-credit'}),commitCredit:async()=>{},refundCredit:async()=>{},walletId:()=> 'local-wallet',recoverPortraitWork:async()=> 'local-work',
  downloadPolicy:{beginWork:async()=> 'local-work',inputForWork:async()=>({buffer:source,mimetype:'image/png'}),attach:async()=>{}},
  app:{post:(...args)=>{handler=args.at(-1)}},upload:{fields:()=>null},setImmediate:noop,runAiJob:noop,activeAiJobs:new Set(),console:{info:noop,warn:noop,error:noop},touchAiJob:async()=>{},failAiJob:async(_id,error)=>{throw Error(error)},
  createAiJob:async args=>{job={id:'offline-job',wallet_id:args.walletId,usage_id:args.usageId,fields:JSON.parse(JSON.stringify(args.fields)),image:args.image.buffer,image_type:args.image.mimetype,image_name:args.image.originalname};return job.id},claimAiJob:async()=>job,completeAiJob:async(_id,png)=>{completed=png}
 };
 env.captureResponse=fn(server,'function captureResponse(){','\nasync function runAiJob(','captureResponse',env);
 env.aiFinishHandler=fn(server,'const aiFinishHandler=async(','\napp.post("/api/ai-finish"','aiFinishHandler',env);
 const worker=fn(server,'async function runAiJob(','\napp.post(\'/api/ai-jobs\',','runAiJob',env);
 Function('env',`with(env){${take(server,"app.post('/api/ai-jobs',","\napp.post('/api/ai-jobs/:id/:action'")}}`)(env);
 const browser={PRODUCTION_HAIR_CATALOG,portraitFinishChoice,submitPortraitJob,activeProcessOperation:{},acceptedPaidTrial:false,activeSavedDownloadWork:null,assertProcessActive:noop,canonicalPortraitInput:async file=>file,levelPortraitCutout:noop,replacementFaceIdentityBox:async()=>[.2,.2,.8,.8],saveAiJobFile:async()=>{},walletHeaders:()=>({}),warmPortraitResources:noop,writeActiveAiJob:noop,analyticsTagError:e=>e,window:{dispatchEvent:noop},Event:class{},
  portraitFetch:async(url,init)=>{assert.equal(url,'/api/ai-jobs');const body={},files={};for(const[k,v]of init.body){if(typeof v==='string')body[k]=v;else files[k]=[{buffer:Buffer.from(await v.arrayBuffer()),mimetype:v.type,originalname:v.name}]}
   const cap=env.captureResponse();await handler({body,files,get:()=>''},cap.res);await cap.done;const out=cap.get();assert.equal(out.statusCode,202,out.payload.toString());return {ok:true,json:async()=>JSON.parse(out.payload.toString())}},
  waitForAiJob:async()=>{await worker(job.id);assert(completed);return new Blob([completed],{type:'image/png'})}
 };
 const run=fn(main,'async function aiFinishPortraitUncached(','\n// V206:','aiFinishPortraitUncached',browser);
 const original=new File([source],'original.png',{type:'image/png'});original.idpromStudioSourceReplacement=replacement;
 const before=calls.length;await run(original,'seedream-19',{creditKind:'hairstyle',sourceJobId:'previous-job',portraitMode:'female',femaleEyeStyle:style,templatePath:'/assets/job-uniforms/fixture.png'});
 assert.equal(job.fields.femaleEyeStyle,style);assert.equal(calls.length,before+1);
 assert.equal(calls.at(-1).prompt.endsWith(SOFT_ROSY_COMPLETION_CHECK),style==='soft-rosy-v1');
 if(style==='soft-rosy-v1'){assert(calls.at(-1).prompt.includes(ORIGINAL_PORTRAIT_COSMETICS));assert(calls.at(-1).prompt.includes('CONCEALER — LOCAL AND SEAMLESS'))}
 assert(!job.fields.outfitReferencePath);visible.set(replacement+'|'+style,calls.at(-1));
 console.log('PASS actual browser → API → queue → provider:',style,'replacement:',replacement);
}
for(const replacement of [false,true]){
 const a=visible.get(replacement+'|natural'),b=visible.get(replacement+'|korean-rosy-v1');assert.deepEqual(a.image,b.image);assert.equal(a.image.length,replacement?3:2);assert(!b.prompt.includes('OUTFIT LIGHTING REFERENCE'));
}
await processProductionPortrait({input:{buffer:source,mimetype:'image/png'},fields:{hairId:'seedream-19',portraitMode:'female',femaleEyeStyle:'korean-rosy-v1',creditKind:'hairstyle',outfitReferencePath:'/assets/job-uniforms/fixture.png'},root,key:'offline-mock-only',removeBackground:async()=>result});
assert.equal(calls.at(-1).image.length,2);assert(!calls.at(-1).prompt.includes('OUTFIT LIGHTING REFERENCE'));
let policies=0;for(const h of PRODUCTION_HAIR_CATALOG.filter(h=>h.gender==='female'))for(const style of ['natural','korean-rosy-v1']){const p=productionPortraitPrompt(h,style);assert(p.includes(selectedHairInstruction(h)));assert(p.includes(selectedHairPlacement(h)));policies++}
console.log('PASS identical ordered source/hair references, equal identity detail, same hair policy in',policies,'cases; old-client outfit ignored only for makeup hair changes.');
console.log('No live provider, database, payment, customer account or network request used. This proves transport, not visual success.');
}finally{globalThis.fetch=originalFetch;await rm(root,{recursive:true,force:true})}
