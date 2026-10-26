import assert from 'node:assert/strict';
import sharp from 'sharp';
import {normalizeSavedProjectMasks,makeSavedProject,prepareSavedProject,assertSavedProjectResources} from '../src/saved-project.js';
import {packSavedProjectTransfer,unpackSavedProjectTransfer,getSavedWorkRequestSize} from '../src/saved-work-transfer.js';

const data=(bytes,type='png')=>'data:image/'+type+';base64,'+bytes.toString('base64');
const bytes=source=>Buffer.from(source.slice(source.indexOf(',')+1),'base64');
const image=async(color,width=64,height=80)=>data(await sharp({create:{width,height,channels:4,background:color}}).png().toBuffer());
const opaque=await image({r:120,g:32,b:17,alpha:1}),source=await image('#315d7b'),alternate=await image('#c1a08c');
const editedPixels=await sharp(bytes(opaque)).raw().toBuffer();editedPixels[3]=254;editedPixels[7]=0;
const edited=data(await sharp(editedPixels,{raw:{width:64,height:80,channels:4}}).png().toBuffer());
const head=extra=>({id:'head',kind:'head',name:'หัว · คอ · ผม',jobId:'paid-fixture',source,x:11,y:-7,scale:1.2,rotation:9,opacity:.73,sourceFrame:{x:-13,y:24,w:600,h:950},visible:true,...extra});
const project=layers=>({format:'idprom-studio',version:1,width:900,height:1200,layers,placement:{W:2256,H:3072,uX:10,uY:20,uW:1000,uH:900},futureMetadata:{keep:true}});
const inspectMask=async src=>{const pixels=await sharp(bytes(src)).ensureAlpha().raw().toBuffer();for(let i=3;i<pixels.length;i+=4)if(pixels[i]!==255)return false;return true};
const decode=async src=>{const {width,height}=await sharp(bytes(src)).metadata();return {width,height}};
const fetchImage=async src=>({blob:async()=>new Blob([bytes(src)],{type:src.slice(5,src.indexOf(';'))})});
const deps={inspectMask,decode,fetchImage,makeFile:blob=>new File([blob],'source.png',{type:blob.type})};
const composite=async layer=>{const input=sharp(bytes(layer.source));return(layer.mask?input.composite([{input:bytes(layer.mask),blend:'dest-in'}]):input).ensureAlpha().raw().toBuffer()};
const cases=[];async function check(name,fn){await fn();cases.push(name);console.log('PASS '+name)}

await check('only fully opaque alpha is omitted; edited mask bytes and all native metadata stay exact',async()=>{
 const layers=[head({mask:opaque,processedOriginalSource:alternate,eraseRestoreSource:alternate,warpSource:source,warpBaseMask:opaque,warpRestoreBase:alternate,collarParts:{left:source,right:alternate},collarLeftX:31,collarRightY:-19}),head({id:'edited',mask:edited})];
 const original=project(layers),snapshot=JSON.stringify(original),normalized=await normalizeSavedProjectMasks(original,{inspectMask});
 assert.equal(JSON.stringify(original),snapshot);assert.deepEqual(normalized,{...original,layers:[{...layers[0],mask:null},layers[1]]});
 for(let i=0;i<layers.length;i++)assert.deepEqual(await composite(layers[i]),await composite(normalized.layers[i]));
 assert.equal(normalized.layers[1].mask,edited);assert.equal(normalized.layers[0].warpBaseMask,opaque);
 const prepared=await prepareSavedProject(normalized,deps);assert.deepEqual(prepared.project,normalized);assert.deepEqual(prepared.project.placement,original.placement);
});
await check('repeated masks are inspected once and partially transparent masks retain object identity',async()=>{
 let reads=0;const original=project([head({mask:edited}),head({id:'second',mask:edited})]);
 const result=await normalizeSavedProjectMasks(original,{inspectMask:async src=>{reads++;return inspectMask(src)}});
 assert.equal(result,original);assert.equal(reads,1);
});
await check('save preflight rejects projects over existing native limits',async()=>{
 const large=await image('#123456',4000,2100);let reads=0;
 await assert.rejects(makeSavedProject({layers:[head({source:large,mask:large})]},{inspectMask:async()=>{reads++;return true}}),{code:'PROJECT_RESOURCE_LIMIT'});
 assert.equal(reads,0,'oversized masks must not be decoded for normalization');
 const sources=await Promise.all(Array.from({length:6},(_,i)=>image({r:i*20,g:70,b:100,alpha:1},3000,2500)));
 await assert.rejects(makeSavedProject({layers:sources.map((s,i)=>head({id:String(i),source:s}))},{inspectMask}),{code:'PROJECT_RESOURCE_LIMIT'});
});
await check('canonical input survives save, wire transfer and reopen without entering the decoded image set',async()=>{
 globalThis.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(value=>{this.result='data:'+blob.type+';base64,'+Buffer.from(value).toString('base64');this.onload()})}};
 const file=new File([bytes(source)],'source.png',{type:'image/png'});file.idpromDownloadWorkId='dwork_'+'a'.repeat(36);file.idpromCanonicalInput=new Blob([bytes(alternate)],{type:'image/png'});
 const saved=await makeSavedProject({layers:[head({mask:opaque})],sourcePhoto:file},{inspectMask});
 assert.equal(saved.canonicalInput,alternate);assert.equal(saved.downloadSource,source);assert.equal(saved.downloadWorkId,file.idpromDownloadWorkId);assert.equal(saved.layers[0].mask,null);
 const wire=packSavedProjectTransfer(saved),roundtrip=unpackSavedProjectTransfer(wire);assert.deepEqual(roundtrip,saved);assert.equal(getSavedWorkRequestSize('fixture',wire),Buffer.byteLength(JSON.stringify({id:'fixture',project:saved})));
 const decoded=[];const reopened=await prepareSavedProject(roundtrip,{...deps,decode:async src=>{decoded.push(src);return decode(src)}});
 assert(!decoded.includes(alternate));assert.deepEqual(Buffer.from(await reopened.source.idpromCanonicalInput.arrayBuffer()),bytes(alternate));
 const plain={...saved};delete plain.canonicalInput;const before=assertSavedProjectResources(plain).summary(),after=assertSavedProjectResources(saved).summary();assert.equal(after.uniquePixels,before.uniquePixels);assert.equal(after.residentBytes-before.residentBytes,alternate.length*2);
 await assert.rejects(makeSavedProject({...saved,canonicalInput:'data:image/png;base64,AAAA'}),/รูปต้นทาง/);
});
await check('aborted normalization never changes the active project',async()=>{
 const controller=new AbortController(),original=project([head({mask:opaque})]);controller.abort();
 await assert.rejects(prepareSavedProject(original,{...deps,signal:controller.signal}),{name:'AbortError'});assert.equal(original.layers[0].mask,opaque);
});
console.log(JSON.stringify({passed:cases.length,cases,scope:'Pixel-exact mask equivalence, edited/native metadata, save resource rejection and canonical-input codec; no API or database calls'}));
