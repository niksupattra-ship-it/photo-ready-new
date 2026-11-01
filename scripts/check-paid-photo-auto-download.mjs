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
console.log(`${passed} automatic photo-download checks passed; no account or payment provider contacted.`);
