import test from 'node:test';
import assert from 'node:assert/strict';
import {manualOutfitAlphaMask,maskManualOutfitPortrait,restoreManualOutfitPortrait} from '../src/manual-outfit-mask.js';
import {pairedPortraitFinish} from '../src/paired-portrait-finish.js';
test('mask hides old clothing while retaining the original face and soft-edge alpha',()=>{
 const original=new Uint8ClampedArray([120,80,60,255,60,50,40,255,70,50,30,80]);
 const clean=original.slice();clean[7]=0;
 const mask=manualOutfitAlphaMask(original,clean);
 assert.deepEqual([mask[3],mask[7],mask[11]],[255,0,255]);
 assert.deepEqual([...original],[120,80,60,255,60,50,40,255,70,50,30,80]);
});
test('the complete AI portrait remains recoverable when removing a manual outfit',()=>{
 const head={id:'head',source:'complete-portrait',mask:'user-mask',x:9,y:7,scale:.8};
 const layers=[head,{id:'suit',source:'native-garment'}];
 const placed=maskManualOutfitPortrait(layers,'head','head-only-mask');
 assert.equal(placed[0].source,head.source);assert.equal(placed[0].x,9);assert.equal(placed[0].scale,.8);
 assert.deepEqual(restoreManualOutfitPortrait(placed),layers);
 assert.deepEqual(restoreManualOutfitPortrait(maskManualOutfitPortrait(placed,'head','head-only-mask')),layers);
});
test('switching either stored finish keeps the old outfit hidden',()=>{
 const head={studioSkinBaseSource:'data:image/png;base64,AAAA',aiMakeupSource:'data:image/png;base64,BBBB',manualOutfitMask:'keep-head-and-hair',mask:'keep-head-and-hair',source:'full-portrait'};
 for(const finish of ['natural','makeup'])assert.equal(pairedPortraitFinish(head,finish).mask,head.manualOutfitMask);
});
