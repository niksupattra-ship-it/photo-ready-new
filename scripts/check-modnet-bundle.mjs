import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {loadBundledModnet,createBundledModnetSession,MODNET_MODEL_SHA256,MODNET_MODEL_BYTES} from '../modnet-model.js';
const root=new URL('..',import.meta.url).pathname,source=await readFile(root+'server.js','utf8');let passed=0;
async function check(name,run){await run();passed++;console.log('PASS '+name)}
let session;
const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Network forbidden in bundled model test')};
try{
 await check('exact pinned five-part model loads and initializes real ONNX WASM with no network',async()=>{const bytes=await loadBundledModnet(root);assert.equal(bytes.length,MODNET_MODEL_BYTES);session=await createBundledModnetSession(root);assert(session.inputNames.length&&session.outputNames.length)});
 await check('actual production matting runs on native pixels and changes only alpha',async()=>{
  const a=source.indexOf('async function modnetRemoveBackground('),b=source.indexOf('\napp.post(',a);assert(a>=0&&b>a);
  const run=Function('getModnetSession','refineBackgroundAlpha',source.slice(a,b)+'\nreturn modnetRemoveBackground')(async()=>session,()=>{throw Error('No refinement in production portrait pipeline')});
  const input=await sharp(await readFile(root+'public/assets/face-finish/natural.webp')).resize({width:420,withoutEnlargement:true}).removeAlpha().png().toBuffer(),original=await sharp(input).toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true});
  const out=await sharp(await run(input,{refine:false})).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(out.info.width,original.info.width);assert.equal(out.info.height,original.info.height);let min=255,max=0;
  for(let i=0;i<original.info.width*original.info.height;i++){assert.deepEqual(out.data.subarray(i*4,i*4+3),original.data.subarray(i*3,i*3+3));min=Math.min(min,out.data[i*4+3]);max=Math.max(max,out.data[i*4+3])}assert(min<10&&max>245,{min,max});
 });
 await check('missing/corrupt local model fails closed without runtime download fallback',async()=>{
  const temp=await mkdtemp(path.join(tmpdir(),'idprom-modnet-check-')),dir=path.join(temp,'models/modnet-photographic-v1');await mkdir(dir,{recursive:true});
  try{const base=root+'models/modnet-photographic-v1/';await writeFile(path.join(dir,'manifest.json'),await readFile(base+'manifest.json'));await assert.rejects(loadBundledModnet(temp),e=>e.code==='ENOENT');const manifest=JSON.parse(await readFile(base+'manifest.json','utf8'));
   for(const [i,p]of manifest.parts.entries()){if(i===0){const bytes=await readFile(base+p.file);bytes[100]^=1;await writeFile(path.join(dir,p.file),bytes)}else await symlink(base+p.file,path.join(dir,p.file))}await assert.rejects(loadBundledModnet(temp),/checksum mismatch/);
  }finally{await rm(temp,{recursive:true,force:true})}
 });
}finally{globalThis.fetch=oldFetch;await session?.release?.()}
await check('actual portrait handler never invokes AI when matting is unavailable and refunds reservation',async()=>{
 const a=source.indexOf('const aiFinishHandler=async('),b=source.indexOf('\napp.post(',a);assert(a>=0&&b>a);
 for(const ready of [false,true]){const events=[];const env={validateProductionPortrait(){events.push('validate')},process:{env:{ARK_API_KEY:'fixture-not-sent'}},getModnetSession:async()=>{events.push('model');if(!ready)throw Error('model unavailable')},requireCredit:async()=>{events.push('reserve');return {usageId:'fixture',credits:1}},processProductionPortrait:async()=>{events.push('AI');return Buffer.from('inert PNG')},modnetRemoveBackground:async b=>b,commitCredit:async()=>events.push('commit'),refundCredit:async()=>events.push('refund'),dir:'/unused',console:{error(){}}};
  const handler=Function('env','with(env){'+source.slice(a,b)+';return aiFinishHandler}')(env),response={statusCode:200,headers:{},status(v){this.statusCode=v;return this},send(body){this.body=body;return this},set(k,v){this.headers[k]=v;return this},type(){return this}};
  await handler({files:{image:[{buffer:Buffer.from('image'),mimetype:'image/png'}]},body:{},deferCreditCommit:false},response);
  if(ready){assert.equal(response.statusCode,200);assert(events.indexOf('model')<events.indexOf('AI'));assert(events.includes('commit'));assert(!events.includes('refund'))}else{assert.equal(response.statusCode,500);assert(!events.includes('AI'));assert(!events.includes('commit'));assert(events.includes('refund'))}
 }
});
await check('health reports real matting readiness and the pinned model hash',()=>{
 const line=source.split('\n').find(l=>l.startsWith('app.get("/api/health"'));assert(line);
 for(const ready of [false,true]){let handler;Function('app','modnetReady','MODNET_MODEL_SHA256',line)({get(_path,fn){handler=fn}},ready,MODNET_MODEL_SHA256);let status,body;handler({}, {status(v){status=v;return this},json(v){body=v}});assert.equal(status,ready?200:503);assert.equal(body.ok,ready);assert.equal(body.mattingReady,ready);assert.equal(body.mattingModelSha256,MODNET_MODEL_SHA256)}
});
console.log(JSON.stringify({passed,modelSha256:MODNET_MODEL_SHA256,scope:'Real bundled model initialization and production matting with native RGB equality, fail-closed integrity and no-network tests, actual portrait-handler ordering/refund and health. No provider, wallet or payment calls.'}));
