import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitEnglishPortraitFrame} from '../src/english-portrait-frame.js';
import {ENGLISH_HEAD_SIZE_FACTOR,ENGLISH_HEAD_TARGETS} from '../english-body-portrait.js';
test('visible person covers both background edges and bottom with uniform scale and crown room',()=>{
 for(const bounds of [{l:100,t:80,r:899,b:1299,w:800,h:1220},{l:50,t:400,r:949,b:1199,w:900,h:800},{l:250,t:20,r:749,b:1399,w:500,h:1380}]){
  const p=fitEnglishPortraitFrame({width:1000,height:1400,bounds});
  assert(p.hX+bounds.l*p.scale<=0);assert(p.hX+(bounds.r+1)*p.scale>=p.W);
  assert(p.hY+(bounds.b+1)*p.scale>=p.H);assert(Math.abs(p.hY+bounds.t*p.scale-p.H*.035)<1e-8);
  assert.equal(p.headW,1000);assert.equal(p.headH,1400);
  // The same scale applies to head and torso; framing cannot change their ratio.
  assert(Math.abs((120*p.scale)/(360*p.scale)-120/360)<1e-10);
 }
});
test('English anatomical targets are ten percent below the previous composition',()=>{
 assert.equal(ENGLISH_HEAD_SIZE_FACTOR,.90);
 assert.equal(ENGLISH_HEAD_TARGETS.targetFace,.34*.90);
 assert.equal(ENGLISH_HEAD_TARGETS.targetHeadHeight,.60*.90);
 assert.equal(ENGLISH_HEAD_TARGETS.faceMax,.37*.90);
});
