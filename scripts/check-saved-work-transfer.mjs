import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {packSavedProjectTransfer,unpackSavedProjectTransfer,getSavedWorkRequestSize,TRANSFER_HEADER,TRANSFER_VERSION,SAVED_WORK_TRANSFER_MAX_BYTES} from '../src/saved-work-transfer.js';

const fields=['source','processedOriginalSource','hairOriginalSource','makeupBaseSource','makeupFullSource','mask','warpSource','warpBaseMask','eraseRestoreSource','warpRestoreBase'];
const image='data:image/png;base64,'+'Ab9/'.repeat(1024);
const other='data:image/webp;base64,'+'B2c/'.repeat(768);
const head=extra=>({id:'head',kind:'head',name:'หัว · คอ · ผม',jobId:'paid-fixture',source:image,x:10,y:-20,scale:1.1,rotation:5,opacity:.9,visible:true,sourceFrame:{x:-30,y:20,w:800,h:1100},...extra});
const project=(layers=[head()],extra={})=>({format:'idprom-studio',version:1,width:900,height:1200,layers,...extra});
const fixture=()=>project([head(Object.fromEntries(fields.map(key=>[key,image]))),head({id:'collar',kind:'collar',source:other,collarParts:{left:image,right:other},collarLeftX:-12,collarRightY:8,squeezeX:.85})],{compareSource:image,placement:{W:2256,H:3072,uX:0,uY:900,uW:2256,uH:2172},purchaseKey:'purchase-fixture',unknown:{note:'ข้อมูลเดิม 👩🏻‍💼',reference:{$image:999},future:[1,true,null]}});
const clone=value=>JSON.parse(JSON.stringify(value));
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child)}return value};
const isWire=value=>value?.format==='idprom-project-transfer';
const wire=()=>packSavedProjectTransfer(fixture());
const invalid=error=>error?.code==='invalid_saved_work_transfer';
const tooLarge=error=>error?.code==='saved_work_too_large';
const cases=[];
async function check(name,run){await run();cases.push(name);console.log('PASS '+name)}

await check('shared format and negotiation constants are stable',()=>{
 assert.equal(TRANSFER_HEADER,'X-IDPROM-Project-Transfer');assert.equal(TRANSFER_VERSION,'images-v1');
});
await check('all native image fields and collar parts round-trip without changing bytes or metadata',()=>{
 const original=freeze(fixture()),packed=packSavedProjectTransfer(original);
 assert(isWire(packed));assert.equal(packed.version,1);assert.equal(packed.images.length,2);
 assert.deepEqual(unpackSavedProjectTransfer(packed),original);
 assert.equal(original.layers[0].source,image);assert.equal(original.layers[1].collarParts.right,other);
 assert.equal(packed.project.unknown.reference.$image,999,'unknown metadata must not be interpreted as an image reference');
});
await check('unique or tiny images use unchanged legacy projects instead of a larger envelope',()=>{
 const unique=project([head(),head({id:'suit',source:other})]);assert.equal(packSavedProjectTransfer(unique),unique);
 const tiny='data:image/png;base64,AAAA',small=project([head({source:tiny,mask:tiny})]);assert.equal(packSavedProjectTransfer(small),small);
});
await check('legacy projects remain readable without interpreting reserved-looking metadata',()=>{
 const original=fixture();assert.equal(unpackSavedProjectTransfer(original),original);
 const bad=project([head({source:{$image:0}})],{compareSource:image});assert.equal(packSavedProjectTransfer(bad),bad);assert.equal(unpackSavedProjectTransfer(bad),bad);
});
await check('expanded POST bytes equal actual UTF-8 JSON for packed and legacy projects',()=>{
 for(const id of ['', 'work_123','งาน 😀',undefined])for(const original of [fixture(),project()]){
  const packed=packSavedProjectTransfer(original),actual=Buffer.byteLength(JSON.stringify({id,project:original}));
  assert.equal(getSavedWorkRequestSize(id,packed),actual);assert.equal(getSavedWorkRequestSize(id,original),actual);
 }
});
await check('Unicode, escaped control characters and lone surrogates keep exact byte counts',()=>{
 const odd='data:image/png;base64,'+'A'.repeat(2200)+'\n\t\\"ไทย😀\ud800';
 const original=project([head({source:odd,mask:odd,warpSource:odd})],{note:'\b\f\n\r\t\\"ไทย😀\udc00'}),packed=packSavedProjectTransfer(original);
 assert(isWire(packed));assert.deepEqual(unpackSavedProjectTransfer(packed),original);
 assert.equal(getSavedWorkRequestSize('รหัส😀',packed),Buffer.byteLength(JSON.stringify({id:'รหัส😀',project:original})));
});
await check('unknown fields and own __proto__ data survive without prototype pollution',()=>{
 const original=fixture();original.unknown=JSON.parse('{"__proto__":{"polluted":true},"constructor":{"keep":1},"prototype":"keep"}');
 const result=unpackSavedProjectTransfer(packSavedProjectTransfer(original));assert.deepEqual(result,original);assert.equal({}.polluted,undefined);
 assert(Object.prototype.hasOwnProperty.call(result.unknown,'__proto__'));
});
await check('invalid transfer versions, shape and image resource tables are rejected',()=>{
 for(const change of [p=>{p.version=2},p=>{p.images=null},p=>{p.images=[]},p=>{p.images[0]='https://example.invalid/private.png'},p=>{p.images[0]={image:1}},p=>{p.project.layers=[]},p=>{p.project.width=1800}]){
  const p=clone(wire());change(p);assert.throws(()=>unpackSavedProjectTransfer(p),invalid);assert.throws(()=>getSavedWorkRequestSize('',p),invalid);
 }
});
await check('negative, fractional, out-of-range and extra-key image references are rejected',()=>{
 for(const ref of [{$image:-1},{$image:.5},{$image:999},{$image:'0'},{$image:0,extra:true},['$image',0],{}]){
  const p=clone(wire());p.project.layers[0].source=ref;assert.throws(()=>unpackSavedProjectTransfer(p),invalid);
 }
});
await check('inherited and prototype-changing image references are rejected',()=>{
 for(const ref of [Object.create({$image:0}),JSON.parse('{"$image":0,"__proto__":{"polluted":true}}')]){
  const p=clone(wire());p.project.layers[0].source=ref;assert.throws(()=>unpackSavedProjectTransfer(p),invalid);
 }
 assert.equal({}.polluted,undefined);
});
await check('unused resources and resource tables larger than legitimate project slots are rejected',()=>{
 const unused=clone(wire());unused.images.push(image+'C');assert.throws(()=>unpackSavedProjectTransfer(unused),invalid);
 const many=clone(wire());many.images=Array.from({length:242},(_,i)=>image+i);assert.throws(()=>unpackSavedProjectTransfer(many),invalid);
});
await check('maximum twenty-layer image slots including compareSource remain supported',()=>{
 const images=[];let index=0;
 const ref=()=>{images.push('data:image/png;base64,A'+index);return{$image:index++}};
 const layers=Array.from({length:20},(_,n)=>{const layer=head({id:'layer_'+n});for(const key of fields)layer[key]=ref();layer.collarParts={left:ref(),right:ref()};return layer});
 const compareSource=ref(),p={format:'idprom-project-transfer',version:1,images,project:project(layers,{compareSource})};
 assert.equal(images.length,241);const restored=unpackSavedProjectTransfer(p);assert.equal(restored.layers.length,20);assert.equal(restored.compareSource,images[240]);
 assert.equal(getSavedWorkRequestSize('max-slots',p),Buffer.byteLength(JSON.stringify({id:'max-slots',project:restored})));
});
await check('cycles are controlled errors and cannot mutate the original object',()=>{
 const original=fixture();original.unknown.self=original;assert.throws(()=>packSavedProjectTransfer(original),invalid);assert.throws(()=>getSavedWorkRequestSize('',original),invalid);
 assert.equal(original.unknown.self,original);
});
await check('expanded 64-MiB boundary is exact and a longer GET response id does not invalidate a project',()=>{
 const marker={$image:0},skeleton=project([head({source:marker,processedOriginalSource:marker})],{padding:''});
 const small='data:image/png;base64,A',expanded=project([head({source:small,processedOriginalSource:small})],{padding:''});
 const zeroImageBytes=Buffer.byteLength(JSON.stringify({id:'',project:expanded}))-2*(small.length+2);
 const targetImageBytes=Math.floor((SAVED_WORK_TRANSFER_MAX_BYTES-zeroImageBytes)/2),padding=(SAVED_WORK_TRANSFER_MAX_BYTES-zeroImageBytes)%2;
 skeleton.padding='X'.repeat(padding);
 const big='data:image/png;base64,'+'A'.repeat(targetImageBytes-2-'data:image/png;base64,'.length);
 const p={format:'idprom-project-transfer',version:1,images:[big],project:skeleton};
 assert.equal(getSavedWorkRequestSize('',p),SAVED_WORK_TRANSFER_MAX_BYTES);
 const restored=unpackSavedProjectTransfer(p);assert.equal(restored.layers[0].source,big);
 assert.throws(()=>getSavedWorkRequestSize('work_longer_than_the_original_empty_id',p),tooLarge);
 const over={...p,project:{...p.project,padding:p.project.padding+'X'}};assert.throws(()=>getSavedWorkRequestSize('',over),tooLarge);
 const oversizedProject={...p,project:{...p.project,padding:p.project.padding+'X'.repeat(100)}};assert.throws(()=>unpackSavedProjectTransfer(oversizedProject),tooLarge);
});
await check('UTF-8 byte accounting also works when TextEncoder is unavailable',async()=>{
 const previous=globalThis.TextEncoder;let fallback;
 try{globalThis.TextEncoder=undefined;fallback=await import('../src/saved-work-transfer.js?without-text-encoder')}finally{globalThis.TextEncoder=previous}
 const original=fixture(),packed=fallback.packSavedProjectTransfer(original);assert.deepEqual(fallback.unpackSavedProjectTransfer(packed),original);
 assert.equal(fallback.getSavedWorkRequestSize('ไทย😀',packed),Buffer.byteLength(JSON.stringify({id:'ไทย😀',project:original})));
});

const report={passed:cases.length,cases,scope:'Actual lossless wire codec; no database, account, payment or AI calls'};
if(process.env.TRANSFER_TEST_REPORT)await writeFile(process.env.TRANSFER_TEST_REPORT,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
