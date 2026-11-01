// Exercise actual receipt encoding/upload handlers with local, inert boundaries.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {walletScope} from '../src/wallet-refresh.js';
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
let passed=0;
const check=async(name,test)=>{await test();passed++;console.log('PASS '+name)};
function compile(name,e){const a=main.indexOf(' const '+name+'='),b=main.indexOf('\n };',a);assert(a>=0&&b>a);return new Function('env',`with(env){${main.slice(a,b+4)};return ${name}}`)(e)}
function fixture(type='image/png'){
 const original=new Blob(['frozen-original'],{type}),originalCrop={sizeId:'original',x:.5,y:.5,zoom:1},uploads=[],renders=[],states=[];
 const account={token:'token-a',wallet:'wallet-a'};
 const entry={id:1,receiptKey:1,scope:walletScope(account.token,account.wallet),blob:original,sourceBlob:original,sourceName:type==='image/jpeg'?'original.jpg':'original.png',name:'original.png',jobIds:['job-a'],crop:originalCrop,pixelScale:2,archive:{id:'old',receiveUrl:'/receive/'+ '0'.repeat(64)}};
 const e={walletScope,authToken:()=>account.token,currentWalletId:()=>account.wallet,walletHeaders:()=>({Authorization:'Bearer '+account.token}),receiveSequence:{current:1},receivePhotoRef:{current:entry},archiveBusyRef:{current:null},setReceivePhoto:value=>states.push(value),withDeadline:operation=>operation(),
  cropPhotoForDownload:async(blob,crop,options)=>{renders.push({blob,crop,options});return crop.sizeId==='original'?blob:new Blob([JSON.stringify(crop)],{type:options.type})},
  portraitFetch:async(url,options)=>{const upload={url,body:options.body};uploads.push(upload);return {ok:true,json:async()=>({id:'archive-'+uploads.length,receiveUrl:'/receive/'+String(uploads.length).padStart(64,'0')})}}
 };
 e.archiveReceivedPhoto=compile('archiveReceivedPhoto',e);const prepare=compile('prepareReceivedPhoto',e);
 return {e,prepare,original,originalCrop,account,uploads,renders,states};
}
await check('all size changes encode the frozen original, preserve the receipt and never redeem/pay',async()=>{
 const f=fixture();for(const sizeId of ['2-inch','1.5-inch']){await f.prepare({sizeId,x:.5,y:.5,zoom:1.3});await tick();const entry=f.e.receivePhotoRef.current;assert.equal(entry.receiptKey,1);assert.equal(entry.crop.sizeId,sizeId);assert.equal(entry.preparing,false);assert(entry.archive);assert.equal(f.uploads.at(-1).url,'/api/purchased-photos');assert.equal(await f.uploads.at(-1).body.get('image').text(),await entry.blob.text())}
 assert(f.renders.every(render=>render.blob===f.original));assert(f.renders.every(render=>render.options.pixelScale===2));
 await f.prepare(f.originalCrop);await tick();assert.equal(f.e.receivePhotoRef.current.blob,f.original);assert.equal(f.e.receivePhotoRef.current.name,'original.png');
});
await check('the old link disappears before resizing; late encoding cannot replace the latest selected crop',async()=>{
 const f=fixture(),slow=deferred(),fast=new Blob(['current-crop'],{type:'image/png'});
 f.e.cropPhotoForDownload=(blob,crop)=>crop.sizeId==='2-inch'?slow.promise:Promise.resolve(fast);
 const old=f.prepare({sizeId:'2-inch',zoom:1});assert.equal(f.e.receivePhotoRef.current.archive,null);assert.equal(f.e.receivePhotoRef.current.preparing,true);
 await f.prepare({sizeId:'1.5-inch',zoom:1});await tick();slow.resolve(new Blob(['stale-crop']));await old;await tick();
 assert.equal(f.e.receivePhotoRef.current.blob,fast);assert.equal(f.e.receivePhotoRef.current.crop.sizeId,'1.5-inch');assert.equal(f.uploads.length,1);
});
await check('a slow archive response cannot revive a link to the previous size',async()=>{
 const f=fixture(),late=deferred();let requests=0;
 f.e.portraitFetch=async()=>++requests===1?late.promise:{ok:true,json:async()=>({id:'latest',receiveUrl:'/receive/'+ 'b'.repeat(64)})};
 await f.prepare({sizeId:'2-inch',zoom:1});await f.prepare({sizeId:'1.5-inch',zoom:1});await tick();
 late.resolve({ok:true,json:async()=>({id:'stale',receiveUrl:'/receive/'+ 'a'.repeat(64)})});await tick();await tick();
 assert.equal(f.e.receivePhotoRef.current.archive.id,'latest');assert.equal(f.e.receivePhotoRef.current.crop.sizeId,'1.5-inch');
});
await check('closing the receipt or changing accounts discards pending encoding and upload callbacks',async()=>{
 for(const change of ['close','account']){const f=fixture(),slow=deferred();f.e.cropPhotoForDownload=()=>slow.promise;const task=f.prepare({sizeId:'2-inch'});const count=f.states.length;
  if(change==='close')f.e.receiveSequence.current++;else f.account.token='token-b';slow.resolve(new Blob(['late']));await task;assert.equal(f.states.length,count);assert.equal(f.uploads.length,0)}
 const f=fixture();f.account.wallet='wallet-b';await f.prepare({sizeId:'2-inch'});assert.equal(f.renders.length,0);
});
await check('failed cropping keeps its previous prepared crop distinguishable and can be retried',async()=>{
 const f=fixture();f.e.cropPhotoForDownload=async()=>{throw Error('local encode failure')};await f.prepare({sizeId:'2-inch'});
 const failed=f.e.receivePhotoRef.current;assert.equal(failed.crop.sizeId,'original');assert.equal(failed.targetCrop.sizeId,'2-inch');assert.equal(failed.blob,f.original);assert.match(failed.prepareError,/encode/);assert.equal(failed.archive,null);assert.equal(f.uploads.length,0);
 f.e.cropPhotoForDownload=async()=>new Blob(['recovered'],{type:'image/png'});await f.prepare({sizeId:'2-inch'});await tick();assert.equal(f.e.receivePhotoRef.current.crop.sizeId,'2-inch');assert.equal(f.e.receivePhotoRef.current.prepareError,'');assert(f.e.receivePhotoRef.current.archive);
});
await check('storage failure leaves the selected local image usable, and JPEG stays JPEG',async()=>{
 const f=fixture('image/jpeg');f.e.portraitFetch=async()=>({ok:false,json:async()=>({message:'storage unavailable'})});await f.prepare({sizeId:'2-inch'});await tick();
 const current=f.e.receivePhotoRef.current;assert.equal(current.blob.type,'image/jpeg');assert.match(current.name,/\.jpg$/);assert.equal(current.crop.sizeId,'2-inch');assert.equal(current.preparing,false);assert.equal(current.archiving,false);assert.equal(current.archive,null);assert.match(current.error,/storage/);
});
console.log(`${passed} receipt-sizing scenarios passed; no real account, payment or storage used.`);
