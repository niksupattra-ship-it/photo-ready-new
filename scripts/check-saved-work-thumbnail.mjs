import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {compactSavedWorkPreview} from '../saved-work-thumbnail.js';

const cases=[];
const check=async(name,test)=>{await test();cases.push(name);console.log('PASS '+name)};
const asData=(buffer,type='png')=>'data:image/'+type+';base64,'+buffer.toString('base64');
const bytes=source=>Buffer.from(source.slice(source.indexOf(',')+1),'base64');
const image=async(color,width=640,height=480)=>asData(await sharp({create:{width,height,channels:4,background:color}}).png().toBuffer());
const rgba=Buffer.from([255,0,0,0,0,255,0,64,0,0,255,128,255,255,255,255]);
const tiny=asData(await sharp(rgba,{raw:{width:2,height:2,channels:4}}).png().toBuffer());
const solid=await image({r:30,g:80,b:150,alpha:1});
const layer=(extra={})=>({id:'head',kind:'head',name:'หัว · คอ · ผม',jobId:'private-job',source:solid,x:0,y:0,scale:1,rotation:0,opacity:1,...extra});
const project=(layers=[layer()],extra={})=>({format:'idprom-studio',version:1,width:900,height:1200,layers,...extra});
const deepFreeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const v of Object.values(value))deepFreeze(v)}return value};
const allImages=preview=>preview.layers.flatMap(l=>[l.source,l.mask,l.warpSource,l.collarParts?.left,l.collarParts?.right].filter(Boolean));
const alphas=async(source)=>(await sharp(bytes(source)).ensureAlpha().raw().toBuffer({resolveWithObject:true})).data.filter((_,i)=>i%4===3);
const unavailable=error=>error?.name==='AbortError'||['SAVED_WORK_PREVIEW_UNAVAILABLE','PROJECT_RESOURCE_LIMIT'].includes(error?.code);

await check('legacy projects generate bounded sources without requiring stored thumbnails',async()=>{
 const result=await compactSavedWorkPreview(project());assert.equal(result.width,900);assert.equal(result.height,1200);assert.equal(result.layers.length,1);assert(result.layers[0].source);
 for(const src of allImages(result)){const m=await sharp(bytes(src)).metadata();assert(m.width<=320&&m.height<=320);assert(['png','webp'].includes(m.format))}
});
await check('source proportions remain intact while the encoded preview is downscaled',async()=>{
 const src=await image('red',1600,1200),result=await compactSavedWorkPreview(project([layer({source:src})]));
 const m=await sharp(bytes(result.layers[0].source)).metadata();assert.equal(m.width,320);assert.equal(m.height,240);assert(result.layers[0].source.length<src.length);
});
await check('small transparent sources retain exact alpha values',async()=>{
 const result=await compactSavedWorkPreview(project([layer({source:tiny})]));assert.deepEqual(await alphas(result.layers[0].source),await alphas(tiny));
});
await check('masks retain exact small alpha and remain lossless PNG',async()=>{
 const result=await compactSavedWorkPreview(project([layer({source:tiny,mask:tiny})]));assert(result.layers[0].mask.startsWith('data:image/png;base64,'));assert.deepEqual(await alphas(result.layers[0].mask),await alphas(tiny));
});
await check('JPEG and WebP inputs both produce viewable compact sources',async()=>{
 for(const format of ['jpeg','webp']){const data=asData(await sharp({create:{width:800,height:1200,channels:3,background:'green'}})[format]().toBuffer(),format);const result=await compactSavedWorkPreview(project([layer({source:data})]));const m=await sharp(bytes(result.layers[0].source)).metadata();assert(m.width>0&&m.height<=320)}
});
await check('warped pixels, masks, source frames and display transforms are preserved separately',async()=>{
 const frame={x:25,y:-40,w:500,h:700},original=layer({source:tiny,warpSource:solid,mask:tiny,x:27,y:-13,scale:1.2,rotation:17,squeezeX:.85,squeezeY:1.1,sourceFrame:frame});
 const result=await compactSavedWorkPreview(project([original]));const out=result.layers[0];for(const key of ['x','y','scale','rotation','squeezeX','squeezeY','sourceFrame'])assert.deepEqual(out[key],original[key]);assert(out.warpSource&&out.mask&&out.warpSource!==out.source);
});
await check('independent collar parts retain their offsets, frames and alpha',async()=>{
 const frame={x:-128,y:-128,w:1156,h:1456},original=layer({id:'collar',kind:'collar',source:tiny,sourceFrame:frame,collarParts:{left:tiny,right:tiny},collarLeftX:120,collarRightX:-70,collarLeftY:15,collarRightY:-25});
 const result=await compactSavedWorkPreview(project([original]));const out=result.layers[0];assert.deepEqual(out.sourceFrame,frame);for(const key of ['collarLeftX','collarRightX','collarLeftY','collarRightY'])assert.equal(out[key],original[key]);assert.deepEqual(await alphas(out.collarParts.left),await alphas(tiny));assert.deepEqual(await alphas(out.collarParts.right),await alphas(tiny));
});
await check('linked hair visibility cannot reveal a hidden head',async()=>{
 const result=await compactSavedWorkPreview(project([layer({id:'head',visible:false}),layer({id:'hair',kind:'hair-preview',hairHeadId:'head',source:tiny,visible:true})]));
 const head=result.layers.find(l=>l.id==='head'),hair=result.layers.find(l=>l.id==='hair');assert(!hair||!hair.visible||hair.hairHeadId==='head'&&(!head||head.visible===false));
});
await check('no original, restore, payment or job fields are exposed and saved data is immutable',async()=>{
 const original=deepFreeze(project([layer({source:tiny,mask:tiny,processedOriginalSource:tiny,makeupBaseSource:tiny,makeupFullSource:tiny,hairOriginalSource:tiny,eraseRestoreSource:tiny,warpRestoreBase:tiny,warpBaseMask:tiny})],{compareSource:tiny,purchaseKey:'private-payment'}));const snapshot=JSON.stringify(original);
 const result=await compactSavedWorkPreview(original);assert.equal(JSON.stringify(original),snapshot);const serialized=JSON.stringify(result);for(const field of ['jobId','purchaseKey','compareSource','processedOriginalSource','makeupBaseSource','makeupFullSource','hairOriginalSource','eraseRestoreSource','warpRestoreBase','warpBaseMask'])assert(!serialized.includes('"'+field+'"'));assert(!serialized.includes('private-job'));assert(!serialized.includes('private-payment'));
});
await check('dense repeated-image scenes adapt to a one-MiB response bound',async()=>{
 const raw=crypto.randomBytes(512*512*3);const noisy=asData(await sharp(raw,{raw:{width:512,height:512,channels:3}}).png().toBuffer());
 const result=await compactSavedWorkPreview(project(Array.from({length:20},(_,i)=>layer({id:'layer-'+i,source:noisy,mask:noisy}))));assert.equal(result.layers.length,20);assert(Buffer.byteLength(JSON.stringify(result))<=1024*1024);for(const src of allImages(result)){const m=await sharp(bytes(src)).metadata();assert(m.width<=320&&m.height<=320)}
});
await check('many distinct low-entropy images also fit the decoded-pixel budget',async()=>{
 const layers=[];let n=0;const next=()=>image({r:++n,g:50,b:120,alpha:1},320,320);
 for(let i=0;i<20;i++)layers.push(layer({id:'parts-'+i,kind:'collar',source:await next(),mask:await next(),warpSource:await next(),collarParts:{left:await next(),right:await next()}}));
 const result=await compactSavedWorkPreview(project(layers));let pixels=0;for(const src of new Set(allImages(result))){const m=await sharp(bytes(src)).metadata();pixels+=m.width*m.height}assert(pixels<=2500000);assert(Buffer.byteLength(JSON.stringify(result))<=1024*1024);assert.equal(result.layers.length,20);
});
await check('external URLs and corrupt encoded images are rejected',async()=>{
 await assert.rejects(compactSavedWorkPreview(project([layer({source:'https://example.invalid/private.png'})])));await assert.rejects(compactSavedWorkPreview(project([layer({source:'data:image/png;base64,AAAA'})])));
});
await check('over-eight-million-pixel input is refused before generating a preview',async()=>{
 const oversized=await image('white',4000,2100);await assert.rejects(compactSavedWorkPreview(project([layer({source:oversized})])),unavailable);
});
await check('aggregate unique-image pixel budget is bounded across a multi-layer scene',async()=>{
 const layers=[];for(let i=0;i<6;i++)layers.push(layer({id:'large-'+i,source:await image({r:10+i,g:30,b:50,alpha:1},4000,2000)}));await assert.rejects(compactSavedWorkPreview(project(layers)),unavailable);
});
await check('invalid project dimensions and excessive layer counts remain rejected',async()=>{
 await assert.rejects(compactSavedWorkPreview({...project(),width:1000}));await assert.rejects(compactSavedWorkPreview(project(Array.from({length:21},(_,i)=>layer({id:'n'+i})))));
});
await check('malformed collar-warp geometry cannot allocate an unbounded preview surface',async()=>{
 const original=project([layer({kind:'suit',neckWidth:10,sourceFrame:{x:0,y:0,w:.001,h:1200},collarFrame:{x:0,y:0,w:900,h:1200}})]);await assert.rejects(compactSavedWorkPreview(original),unavailable);
});
await check('non-finite collar offsets and malformed collar frames are refused',async()=>{
 for(const extra of [{collarLeftX:Infinity},{collarFrame:{x:0,y:0,w:'huge',h:1200},neckWidth:10,kind:'suit'}])await assert.rejects(compactSavedWorkPreview(project([layer(extra)])),unavailable);
});
await check('already-aborted preview work stops without touching the project',async()=>{
 const controller=new AbortController();controller.abort();const p=deepFreeze(project());const before=JSON.stringify(p);await assert.rejects(compactSavedWorkPreview(p,{signal:controller.signal}),error=>error.name==='AbortError');assert.equal(JSON.stringify(p),before);
});
const report={passed:cases.length,cases,scope:'Actual Sharp compact saved-work preview generation, no DB/account/payment/AI calls'};
if(process.env.SAVED_WORK_THUMBNAIL_REPORT)await writeFile(process.env.SAVED_WORK_THUMBNAIL_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
