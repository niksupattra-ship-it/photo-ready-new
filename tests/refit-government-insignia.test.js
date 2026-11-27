import test from 'node:test';
import assert from 'node:assert/strict';
import {refitGovernmentInsignia} from '../src/refit-government-insignia.js';
const template='/assets/government-uniforms/female-operational.png';
const before={id:'head',kind:'head',source:'old-photo',jobId:'old',generatedOutfitTemplate:template};
const after={...before,source:'new-photo',jobId:'new'};
const badges=['collar','chest','ribbon'].map(kind=>({id:kind,kind,assetId:kind+'-selected',source:'old-'+kind,sourceFrame:{x:10,y:20,w:30,h:40},x:80,y:90,scale:1.4,rotation:5,easyInsigniaManualPlacement:true,visible:true,locked:true,opacity:.9}));
const fit={frame:{x:40,y:500,w:800,h:700},preset:{measured:true}};
const options=Object.fromEntries(badges.map(b=>[b.kind,[{id:b.assetId}]]));
test('new same-uniform hair photo repositions all selected native badges, preserving every other layer',async()=>{
 const bg={id:'bg',kind:'background',source:'blue'},suit={id:'suit',kind:'suit',visible:false},layers=[bg,after,suit,...badges];let calls=[];
 const result=await refitGovernmentInsignia(layers,before,after,{fit,options,nativeAsset:async(kind,option,frame,preset)=>{calls.push([kind,option.id,frame,preset]);return {source:'new-'+kind,sourceFrame:frame,collarParts:kind==='collar'?{left:'left',right:'right'}:null}}});
 assert.equal(calls.length,3);assert.equal(result[0],bg);assert.equal(result[1],after);assert.equal(result[2],suit);
 for(const badge of result.slice(3)){
  assert.equal(badge.assetId,badge.kind+'-selected');assert.equal(badge.source,'new-'+badge.kind);assert.deepEqual(badge.sourceFrame,fit.frame);assert.equal(badge.x,0);assert.equal(badge.y,0);assert.equal(badge.scale,1);assert.equal(badge.easyInsigniaManualPlacement,false);assert.equal(badge.visible,true);assert.equal(badge.locked,true);assert.equal(badge.opacity,.9);
 }
 assert.equal(badges[0].source,'old-collar');assert.equal(badges[0].x,80);
});
test('same photo, English flow, different outfit and no selected badges do not reposition anything',async()=>{
 const layers=[after,...badges],nativeAsset=()=>{throw Error('must not rebuild')};
 for(const [old,next,extra] of [[after,after,{}],[before,after,{englishFlow:true}],[before,{...after,generatedOutfitTemplate:'/assets/government-uniforms/female-senior.png'},{}],[null,after,{}]])assert.equal(await refitGovernmentInsignia(layers,old,next,{fit,options,nativeAsset,...extra}),layers);
 assert.equal(await refitGovernmentInsignia(layers,before,after,{fit:null,options,nativeAsset}),layers);
});
test('a failed native badge rebuild leaves old selections and transforms untouched',async()=>{
 const layers=[after,...badges],snapshot=JSON.stringify(layers);let calls=0;
 await assert.rejects(refitGovernmentInsignia(layers,before,after,{fit,options,nativeAsset:async()=>{if(++calls===2)throw Error('asset unavailable');return {source:'new',sourceFrame:fit.frame}}}),/asset unavailable/);
 assert.equal(JSON.stringify(layers),snapshot);
});
