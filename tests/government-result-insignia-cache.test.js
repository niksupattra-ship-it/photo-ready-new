import test from 'node:test';
import assert from 'node:assert/strict';
import {governmentResultInsigniaSignature as signature,sameGovernmentResultInsigniaSignature as same} from '../src/government-result-insignia-cache.js';

function fixture(){
 const head={id:'accepted-head',jobId:'accepted-job',hairId:'selected-hair',portraitMode:'female',generatedOutfitTemplate:'/assets/government-uniforms/female-operational.png',kind:'head',visible:true,x:0,y:0,scale:1,rotation:0,squeezeX:1,squeezeY:1,opacity:1,sourceFrame:{x:0,y:0,w:900,h:1200},source:'data:image/png;base64,AAAA'};
 const suit={id:'native-suit',kind:'suit',visible:false,templatePath:head.generatedOutfitTemplate,x:0,y:0,scale:1,rotation:0,sourceFrame:{x:80,y:400,w:740,h:800},source:'native-suit-pixels'};
 const asset={original:{width:900,height:1200},mask:{width:900,height:1200},historyPixels:{}};
 return {head,suit,garment:head,gender:'female',template:head.generatedOutfitTemplate,asset};
}

test('completed-body placement invalidates when the actual photo moves, scales, rotates or changes its frame',()=>{
 const source=fixture(),before=signature(source);
 for(const patch of [{x:30},{y:25},{scale:.8},{rotation:8},{squeezeX:.9},{squeezeY:1.1},{opacity:.7},{sourceFrame:{x:90,y:120,w:720,h:960}}]){
  assert.equal(same(before,signature({...source,garment:{...source.head,...patch}})),false,JSON.stringify(patch));
 }
});

test('painted native garment geometry and visibility determine the result cache, without applying a second transform',()=>{
 const source=fixture(),garment={...source.suit,visible:true},input={...source,suit:garment,garment};
 const before=signature(input);
 for(const patch of [{rotation:12},{squeezeX:.8},{squeezeY:1.2},{neckWidth:35},{neckHeight:-20},{collarFrame:{x:95,y:350,w:680,h:810}}]){
  assert.equal(same(before,signature({...input,garment:{...garment,...patch}})),false);
 }
 assert.equal(same(before,signature({...input,suit:{...garment,visible:false},garment:source.head})),false,'A hidden suit switches measurement to the completed photo');
 assert.equal(same(before,signature({...input,garment:{...garment,id:'replacement-suit'}})),false);
 assert.equal(same(before,signature({...input,head:{...source.head,x:100,scale:.8}})),true,'Moving a separate head does not alter the painted native garment');
});

test('equal-length source replacements, changed masks, warps and brush snapshots cannot reuse older pixel placement',()=>{
 const source=fixture(),before=signature(source);
 const replacement='data:image/png;base64,BBBB';
 assert.equal(replacement.length,source.head.source.length);
 assert.equal(same(before,signature({...source,garment:{...source.head,source:replacement}})),false);
 for(const property of ['original','mask','warped','historyPixels']){
  assert.equal(same(before,signature({...source,asset:{...source.asset,[property]:{width:900,height:1200}}})),false,property);
 }
 assert.equal(same(before,signature({...source,garment:{...source.head,mask:'a-new-mask'}})),false);
 const resized=fixture(),old=signature(resized);
 resized.asset.original.width=600;
 assert.equal(same(old,signature(resized)),false,'Resizing the same canvas invalidates its former placement');
});

test('unchanged photo and native pixels remain cached across badge changes without serializing large image sources',()=>{
 const source=fixture();source.head.source='data:image/png;base64,'+'A'.repeat(2*1024*1024);
 const before=signature(source);
 assert(before.key.length<1500,'The small geometry key contains no copied source image');
 assert.equal(same(before,signature({...source,head:{...source.head},garment:{...source.head},badges:[{kind:'ribbon',x:100,scale:1.2}]})),true);
 assert.equal(same(before,signature({...source,badges:[{kind:'collar',assetId:'different-department'}]})),true);
});

test('missing accepted photo or painted pixel source never claims a reusable result signature',()=>{
 const source=fixture();
 assert.equal(signature({...source,head:null}),null);
 assert.equal(signature({...source,garment:null}),null);
 assert.equal(signature({...source,asset:null}),null);
 assert.equal(same(null,null),false);
});
