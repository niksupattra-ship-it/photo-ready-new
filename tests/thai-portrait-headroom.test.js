import test from 'node:test';
import assert from 'node:assert/strict';
import {planThaiBodyFrame,fitThaiBodyScene} from '../src/thai-body-framing.js';
const pixels=new Uint8ClampedArray(900*1200*4);for(let y=0;y<1200;y++)for(let x=0;x<900;x++)pixels[(y*900+x)*4+3]=255;
test('near-top hair shifts the whole portrait down without changing its scale',()=>{
 const head={top:10,height:400,width:300,centerX:450};const p=planThaiBodyFrame(pixels,900,1200,{head});assert.equal(p.scale,904/900);assert(Math.abs(p.headroom-108)<1e-8);assert(p.y+1200*p.scale>1202);assert(p.crownLimited);
});
test('ample crown clearance preserves the bottom anchor without pulling the picture up',()=>{
 const p=planThaiBodyFrame(pixels,900,1200,{head:{top:220,height:400,width:300,centerX:450}});assert(!p.crownLimited);assert(Math.abs(p.y+1200*p.scale-1202)<1e-8);assert(p.headroom>=108);
});
test('native insignia follow the exact same translation; pixels, scale and relative offsets remain intact',()=>{
 const h={id:'head',kind:'head',source:'unchanged',sourceFrame:{x:0,y:0,w:900,h:1200},x:0,y:0,scale:1};const pin={id:'pin',kind:'collar',source:'original-insignia',sourceFrame:{x:100,y:600,w:90,h:30},x:0,y:0,scale:1};
 const plan={scale:1,x:0,y:100,coat:{}};const result=fitThaiBodyScene([h,pin],h,plan,900,1200);assert.equal(result[0].source,h.source);assert.equal(result[1].source,pin.source);assert.equal(result[1].sourceFrame.y-pin.sourceFrame.y,100);assert.equal(result[0].sourceFrame.y-h.sourceFrame.y,100);assert.equal(result[1].sourceFrame.w,90);assert.equal(result[0].sourceFrame.w,900);
});
