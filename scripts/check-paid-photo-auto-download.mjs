import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {walletScope} from '../src/wallet-refresh.js';
import {createPaidPhotoAutoDownload,paidPhotoDownloadKey,requestFullResolutionDownload} from '../src/paid-photo-auto-download.js';
const image=new Blob(['full-resolution-image'],{type:'image/png'});
const key=paidPhotoDownloadKey({id:'pi_fixture',jobId:'job-a'},{automatic:true,walletId:'wallet-a',jobIds:['job-a']});
let passed=0;const check=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
await check('only a matching verified-payment signal is eligible; history, credits and manual downloads are excluded',()=>{
 for(const id of ['pi_fixture','cs_test_fixture'])assert(paidPhotoDownloadKey({id,jobId:'job-a'},{automatic:true,walletId:'a',jobIds:['job-a']}));
 for(const id of ['credit:job-a','existing:job-a','owner:job-a','job-a','pi_bad?'])assert.equal(paidPhotoDownloadKey({id,jobId:'job-a'},{automatic:true,walletId:'a',jobIds:['job-a']}),null);
 for(const options of [{automatic:false,walletId:'a',jobIds:['job-a']},{automatic:true,walletId:'',jobIds:['job-a']},{automatic:true,walletId:'a',jobIds:['other']}])assert.equal(paidPhotoDownloadKey({id:'pi_fixture',jobId:'job-a'},options),null);
});
await check('duplicate settlement, rerenders and receipt remounts request exactly one original file',()=>{
 let stored=null;const requests=[],options={read:()=>stored,write:value=>stored=value,request:(...args)=>{requests.push(args);return 'requested'}};
 const once=createPaidPhotoAutoDownload(options),entry={key,blob:image,name:'full.png'};
 assert.equal(once(entry),'requested');for(let i=0;i<5;i++)assert.equal(once(entry),'skipped');assert.equal(createPaidPhotoAutoDownload(options)(entry),'skipped');
 assert.equal(requests.length,1);assert.equal(requests[0][0],image);assert.equal(requests[0][1],'full.png');assert(!stored.includes('full-resolution-image'));
});
await check('a separate wallet, payment or job receives its own attempt',()=>{
 let count=0;const once=createPaidPhotoAutoDownload({read:()=>null,write:()=>{},request:()=>{count++;return 'requested'}});
 for(const walletId of ['a','b'])for(const id of ['pi_one','pi_two'])for(const jobId of ['job-a','job-b'])assert.equal(once({key:paidPhotoDownloadKey({id,jobId},{automatic:true,walletId,jobIds:[jobId]}),blob:image}),'requested');assert.equal(count,8);
});
await check('denied, malformed and full browser storage never block a local download or cause duplicate clicks',()=>{
 for(const read of [()=>{throw Error('denied')},()=>'{bad',()=>JSON.stringify({bad:true}),()=>JSON.stringify([true]),()=> 'a'.repeat(40001)]){
  let count=0;const once=createPaidPhotoAutoDownload({read,write:()=>{throw Error('quota')},request:()=>{count++;return 'requested'}});
  assert.equal(once({key,blob:image}),'requested');assert.equal(once({key,blob:image}),'skipped');assert.equal(count,1);
 }
});
await check('closed receipts and changed accounts never dispatch an old file',()=>{
 let count=0,current=false;const once=createPaidPhotoAutoDownload({read:()=>null,write:()=>{},request:()=>{count++;return 'requested'}});
 assert.equal(once({key,blob:image,isCurrent:()=>current}),'skipped');assert.equal(count,0);current=true;assert.equal(once({key,blob:image,isCurrent:()=>current}),'requested');assert.equal(count,1);
 const changed=createPaidPhotoAutoDownload({read:()=>{current=false;return null},write:()=>{},request:()=>{throw Error('must not dispatch')}});current=true;assert.equal(changed({key,blob:image,isCurrent:()=>current}),'skipped');
});
await check('a failed automatic attempt stays failed once and leaves manual retry to the receipt',()=>{
 let count=0;const events=[],once=createPaidPhotoAutoDownload({read:()=>null,write:()=>{},request:()=>{count++;throw Error('blocked')}}),entry={key,blob:image,onEvent:(...args)=>events.push(args)};
 assert.equal(once(entry),'failed');assert.equal(once(entry),'skipped');assert.equal(count,1);assert.equal(events[0][0],'download_failed');assert.equal(events[0][1].errorStage,'delivery');
});
await check('remembered IDs are bounded and contain no photo pixels or authentication token',()=>{
 let stored=null;const once=createPaidPhotoAutoDownload({read:()=>stored,write:value=>stored=value,request:()=> 'requested'});
 for(let i=0;i<70;i++)once({key:'payment-'+i,blob:image});assert.equal(JSON.parse(stored).length,50);assert(!stored.includes('full-resolution-image'));
});
await check('native download uses the exact image blob inside the active dialog and cannot be interrupted by telemetry',()=>{
 const previous={document:globalThis.document,setTimeout:globalThis.setTimeout,create:URL.createObjectURL,revoke:URL.revokeObjectURL},events=[];let received,anchor;
 try{
  URL.createObjectURL=blob=>{received=blob;return 'blob:full-resolution'};URL.revokeObjectURL=url=>events.push('revoke:'+url);globalThis.setTimeout=fn=>{events.push('schedule-revoke');fn()};
  globalThis.document={createElement:()=>anchor={click(){events.push('click')},remove(){events.push('remove')}}};
  const container={appendChild:link=>{assert.equal(link,anchor);events.push('append-to-receipt')}};
  assert.equal(requestFullResolutionDownload(image,'original.png',{container,onEvent:()=>{throw Error('telemetry failure')}}),'requested');
  assert.equal(received,image);assert.equal(anchor.download,'original.png');assert.equal(anchor.href,'blob:full-resolution');assert.equal(anchor.target,'_blank');assert(events.indexOf('click')>events.indexOf('append-to-receipt'));assert(events.includes('remove'));assert(events.includes('revoke:blob:full-resolution'));
 }finally{globalThis.document=previous.document;globalThis.setTimeout=previous.setTimeout;URL.createObjectURL=previous.create;URL.revokeObjectURL=previous.revoke}
});
await check('the actual receipt handler reserves the full source for automatic delivery even when its visible file is cropped',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),a=main.indexOf(' const receivePurchasedImage=async'),b=main.indexOf('\n };',a);
 const e={walletScope,paidPhotoDownloadKey,authToken:()=> 'token-a',currentWalletId:()=> 'wallet-a',currentOutputJobRef:{current:'job-a'},receiveSequence:{current:0},receivePhotoRef:{current:null},setReceivePhoto:()=>{},archiveReceivedPhoto:()=>{},DEFAULT_PHOTO_CROP:{sizeId:'original',x:.5,y:.5,zoom:1},downloadUnlockSignal:{id:'pi_fixture',jobId:'job-a'}};
 const receive=new Function('env',`with(env){${main.slice(a,b+4)};return receivePurchasedImage}`)(e),cropped=new Blob(['cropped-image'],{type:'image/png'});
 await receive(cropped,{automatic:true,sourceBlob:image,jobIds:['job-a']});assert.equal(e.receivePhotoRef.current.autoDownloadBlob,image);assert.equal(e.receivePhotoRef.current.blob,cropped);assert(e.receivePhotoRef.current.autoDownloadKey);
 await receive(cropped,{automatic:false,sourceBlob:image,jobIds:['job-a']});assert.equal(e.receivePhotoRef.current.autoDownloadKey,null);
 e.downloadUnlockSignal={id:'pi_fixture',jobId:'other-job'};await receive(cropped,{automatic:true,jobIds:['job-a']});assert.equal(e.receivePhotoRef.current.autoDownloadKey,null);
});
await check('selected PDF delivery is opt-in and shares the original-file settlement lock',()=>{
 const pdf=new Blob(['%PDF-selected-print-sheet'],{type:'application/pdf'});let stored=null;const requests=[];
 const options={read:()=>stored,write:value=>stored=value,request:blob=>{requests.push(blob);return 'panel'}};
 assert.equal(createPaidPhotoAutoDownload(options)({key,blob:pdf}),'skipped');
 assert.equal(createPaidPhotoAutoDownload({...options,allowPdf:true})({key,blob:pdf}),'panel');
 assert.equal(createPaidPhotoAutoDownload(options)({key,blob:image}),'skipped');assert.deepEqual(requests,[pdf]);
});
await check('the actual prepared-file handler delivers the chosen file quietly, without a second adjustment dialog',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),a=main.indexOf(' const receivePurchasedImage=async'),b=main.indexOf('\n };',a),delivered=[],archives=[],receipts=[];
 let stored=null;const e={walletScope,paidPhotoDownloadKey,authToken:()=> 'token-a',currentWalletId:()=> 'wallet-a',currentOutputJobRef:{current:'job-a'},receiveSequence:{current:0},receivePhotoRef:{current:null},setReceivePhoto:value=>receipts.push(value),archiveReceivedPhoto:entry=>archives.push(entry),DEFAULT_PHOTO_CROP:{sizeId:'original',x:.5,y:.5,zoom:1},downloadUnlockSignal:{id:'pi_fixture',jobId:'job-a'},deliverImage:blob=>{delivered.push(blob);return 'panel'}};
 e.preparedPhotoDownloadRef={current:createPaidPhotoAutoDownload({allowPdf:true,read:()=>stored,write:value=>stored=value,request:e.deliverImage})};
 const receive=new Function('env',`with(env){${main.slice(a,b+4)};return receivePurchasedImage}`)(e),pdf=new Blob(['%PDF-selected'],{type:'application/pdf'}),options={automatic:true,preparedDownload:true,sourceBlob:image,jobIds:['job-a'],crop:{sizeId:'35x45',format:'pdf',copies:4}};
 assert.equal((await receive(pdf,options)).delivery,'panel');await receive(pdf,options);assert.deepEqual(delivered,[pdf]);assert.equal(receipts.length,0);assert(archives.every(entry=>entry.silent));
 await receive(image,{...options,automatic:false});assert.deepEqual(delivered,[pdf,image]);assert.equal(receipts.length,0);
});
await check('PDF photo archives use a clean cropped PNG and never reopen the preview on success or failure',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),a=main.indexOf(' const archiveReceivedPhoto=async'),b=main.indexOf('\n };',a),requests=[],updates=[];
 const scope=walletScope('token-a','wallet-a'),e={walletScope,authToken:()=> 'token-a',currentWalletId:()=> 'wallet-a',walletHeaders:()=>({}),archiveBusyRef:{current:null},receiveSequence:{current:1},receivePhotoRef:{current:null},setReceivePhoto:value=>updates.push(value),cropPhotoForDownload:async(source,crop)=>{assert.equal(source,image);assert.equal(crop.sizeId,'35x45');return image},portraitFetch:async(url,options)=>{requests.push(options);return {ok:true,json:async()=>({id:'archive-fixture',receiveUrl:'/receive/'+'a'.repeat(64)})}}};
 const archive=new Function('env',`with(env){${main.slice(a,b+4)};return archiveReceivedPhoto}`)(e),entry={id:1,receiptKey:1,scope,silent:true,blob:new Blob(['%PDF'],{type:'application/pdf'}),sourceBlob:image,crop:{sizeId:'35x45'},jobIds:['job-a']};
 await archive(entry);assert.equal(requests[0].body.get('image').type,'image/png');assert.equal(updates.length,0);assert(e.receivePhotoRef.current.archive);
 e.portraitFetch=async()=>{throw Error('offline')};await archive(entry);assert.equal(updates.length,0);assert.equal(e.receivePhotoRef.current.error,'offline');
 e.cropPhotoForDownload=async()=>{e.receiveSequence.current++;return image};await archive(entry);assert.equal(requests.length,1);
});
console.log(`${passed} automatic photo-download checks passed; no account or payment provider contacted.`);
