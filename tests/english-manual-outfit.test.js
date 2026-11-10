import test from 'node:test';
import assert from 'node:assert/strict';
import {planEnglishManualOutfit} from '../src/english-manual-outfit.js';
const uniform=(width,height)=>({width,height});
test('garment presentation is fixed at workspace width, bottom aligned and native aspect',()=>{
 for(const [w,h] of [[1504,1285],[1200,800],[600,1100]]){
  const frame=planEnglishManualOutfit({uniform:uniform(w,h)});
  assert.equal(frame.w,900);assert.equal(frame.x,0);assert.equal(frame.y+frame.h,1200);
  assert(Math.abs(frame.w/frame.h-w/h)<1e-12);
 }
});
test('head size, position and facial anatomy cannot enlarge or shrink the garment',()=>{
 const native=uniform(1504,1285),expected=planEnglishManualOutfit({uniform:native});
 for(const scale of [.5,1,1.8])assert.deepEqual(planEnglishManualOutfit({uniform:native,head:{x:230,y:-100,scale},face:{152:{x:.5,y:.8},234:{x:.1,y:.4},454:{x:.9,y:.4}}}),expected);
});
