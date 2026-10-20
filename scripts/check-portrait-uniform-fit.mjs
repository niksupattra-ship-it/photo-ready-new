import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../src/portrait-uniform-fit.js',import.meta.url),'utf8');
const {planPortraitUniformFit}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const uniform={width:900,height:1200,bounds:{l:0,r:899,t:200,b:1199,w:900,h:1000},shoulderWidth:800,centerX:450,collarTopY:220,socketY:300};
const face={width:1000,height:1200,cx:510,chinY:850,faceWidth:400,faceHeight:500,eyeWidth:250};
for(const frame of [{x:12,y:50,w:800,h:1066},{x:-40,y:320,w:980,h:1306}]){
 const reference=planPortraitUniformFit({W:900,H:1200,uniform,face,opaqueTop:100,frame});
 for(const multiplier of [.5,1,2]){
  const f=Object.fromEntries(Object.entries(face).map(([k,v])=>[k,v*multiplier]));
  const p=planPortraitUniformFit({W:900,H:1200,uniform,face:f,opaqueTop:100*multiplier,frame});
  assert.deepEqual(p.uniformFrame,frame);
  assert(Math.abs(p.hX+f.cx*p.scale-p.collarCX)<1e-7);
  assert(Math.abs(p.hY+f.chinY*p.scale-p.chinTargetY)<1e-7);
  assert(p.chinTargetY<p.collarTopY);
  assert(Math.abs(p.placedFaceW-reference.placedFaceW)<1e-7);
 }
}
console.log('PASS: garment stays fixed; head centers on collar with proportional scale across input resolutions.');
