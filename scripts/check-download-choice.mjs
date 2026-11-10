import assert from 'node:assert/strict';
import {normalizeDownloadChoice,rememberDownloadChoice,downloadChoiceForJobs,drawDownloadWatermark} from '../src/download-choice.js';
const checks=[];const check=(name,fn)=>{fn();checks.push(name);console.log('PASS '+name)};
check('only bounded crop, format and layout settings are persisted',()=>{
 const choice=normalizeDownloadChoice({sizeId:'2-inch',x:.4,y:.6,zoom:1.25,format:'pdf',copies:4,blob:'private pixels',token:'private token'});
 assert.deepEqual(choice,{sizeId:'2-inch',x:.4,y:.6,zoom:1.25,freePosition:true,format:'pdf',copies:4});
 assert.equal(normalizeDownloadChoice(null).sizeId,'original');assert.equal(normalizeDownloadChoice({sizeId:'<script>',x:Infinity,y:-4,zoom:100,copies:999,format:'bad'}).zoom,3);
 assert.deepEqual(normalizeDownloadChoice({x:5,y:-4,zoom:0,copies:0}),{sizeId:'original',x:1.5,y:-.5,zoom:.5,freePosition:true,format:'png',copies:null});
});
check('a checkout choice belongs to its exact set of output jobs',()=>{
 const record=rememberDownloadChoice({sizeId:'35x45',format:'pdf',copies:4},['a','b','a'],{requested:true});
 assert.deepEqual(record.jobIds,['a','b']);assert.equal(record.requested,true);assert.equal(downloadChoiceForJobs(record,['b','a']).sizeId,'35x45');
 for(const jobs of [[],['a'],['a','c'],['a','b','c']])assert.equal(downloadChoiceForJobs(record,jobs),null);
 assert.equal(downloadChoiceForJobs({...record,version:0},['a','b']),null);assert.equal(rememberDownloadChoice({},[]),null);assert.equal(rememberDownloadChoice({},['']),null);
 assert.equal(rememberDownloadChoice({},['a']).requested,false);
});
check('preview watermark clips to each output tile, independently of the crop',()=>{
 const events=[],ctx=new Proxy({},{get:(_,key)=>(...args)=>events.push([key,...args]),set:(_,key,val)=>{events.push([key,val]);return true}});
 drawDownloadWatermark(ctx,{x:12,y:18,width:180,height:240});
 assert.deepEqual(events[0],['save']);assert.deepEqual(events.find(e=>e[0]==='rect'),['rect',12,18,180,240]);assert.deepEqual(events.find(e=>e[0]==='translate'),['translate',102,138]);
 assert(events.findIndex(e=>e[0]==='clip')<events.findIndex(e=>e[0]==='fillText'));assert(events.filter(e=>e[0]==='fillText').length>4);assert.equal(events.at(-1)[0],'restore');
});
console.log(JSON.stringify({passed:checks.length}));
