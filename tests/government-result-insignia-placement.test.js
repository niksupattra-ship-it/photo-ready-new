import test from 'node:test';
import assert from 'node:assert/strict';
import {governmentResultManualInsigniaPlacement} from '../src/government-result-insignia-placement.js';
import {createAssetDisplayPreview} from '../src/studio-asset-preview.js';

const target={id:'accepted-pin',easyInsigniaManualPlacement:true,x:32,y:-17,scale:1.25,rotation:8,
 collarLeftX:21,collarLeftY:-13,collarRightX:-9,collarRightY:14,
 collarLeftScale:.8,collarRightScale:1.4,collarLeftRotation:-5,collarRightRotation:7};
const canvas=()=>({width:40,height:60,getContext:()=>({fillRect(){}})});

test('result-only preview and committed placement retain independent manual collar corrections',()=>{
 const originalDocument=globalThis.document;
 globalThis.document={createElement:()=>canvas()};
 try{
  const native={source:canvas(),sourceFrame:{x:100,y:300,w:600,h:700},collarParts:{left:canvas(),right:canvas()}};
  const before=structuredClone(target),expected=governmentResultManualInsigniaPlacement(target);
  const preview=createAssetDisplayPreview('collar',target,{id:'new-department'},native,null,{preserveResultPlacement:true});
  for(const [field,value] of Object.entries(expected))assert.equal(preview.layer[field],value,field);
  assert.equal(preview.layer.assetId,'new-department');
  assert.strictEqual(preview.layer.sourceFrame,native.sourceFrame);
  assert.strictEqual(preview.asset.parts,native.collarParts);
  assert.deepEqual(target,before,'Preview must not mutate the accepted layer/history');
 }finally{globalThis.document=originalDocument}
});

test('Studio preview defaults remain its native suit transform even when a result layer was manually adjusted',()=>{
 const originalDocument=globalThis.document;
 globalThis.document={createElement:()=>canvas()};
 try{
  const suit={x:12,y:24,scale:.9,rotation:-3};
  for(const options of [undefined,{preserveResultPlacement:false}]){
   const preview=createAssetDisplayPreview('collar',target,{id:'studio-option'},
    {source:canvas(),sourceFrame:{x:80,y:300,w:500,h:650},collarParts:null},suit,options);
   for(const [field,value] of Object.entries(suit))assert.equal(preview.layer[field],value,field);
   for(const field of ['collarLeftX','collarRightX','collarLeftY','collarRightY','collarLeftRotation','collarRightRotation'])assert.equal(preview.layer[field],0,field);
   assert.equal(preview.layer.collarLeftScale,1);assert.equal(preview.layer.collarRightScale,1);
  }
  assert.equal(governmentResultManualInsigniaPlacement(null),null);
  assert.equal(governmentResultManualInsigniaPlacement({...target,easyInsigniaManualPlacement:false}),null);
 }finally{globalThis.document=originalDocument}
});
