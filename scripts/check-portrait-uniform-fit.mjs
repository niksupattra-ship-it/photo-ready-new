import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const text=await readFile(new URL('../src/portrait-uniform-fit.js',import.meta.url),'utf8');
const api=await import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
function runMeasuredNeckChecks(api,assert){
 const {measurePortraitNeck,planPortraitUniformFit}=api;
 const makeNeck=bottom=>{const pixels=new Uint8Array(300*400*4);for(let y=101;y<=bottom;y++)for(let x=110;x<190;x++)pixels[(y*300+x)*4+3]=255;return pixels};
 const face={width:300,height:400,cx:150,chinY:100,faceWidth:160,faceHeight:200,eyeWidth:100};
 const short=measurePortraitNeck(makeNeck(180),300,400,face),long=measurePortraitNeck(makeNeck(220),300,400,face);
 assert.equal(short.baseY,180);assert.equal(short.width,80);assert.equal(long.baseY,220);
 const uniform={width:900,height:1600,bounds:{l:0,r:899,t:80,b:1599,w:900,h:1520},shoulderWidth:750,centerX:450,collarTopY:80,socketY:120,neckOpeningWidth:100};
 const input={W:900,H:1200,uniform,face,opaqueTop:20,neck:short,headFrame:{x:0,y:50,w:300,h:400}};
 const first=planPortraitUniformFit(input),second=planPortraitUniformFit({...input,neck:long});
 assert.equal(first.scale,1);assert.equal(first.hY,50);
 assert.equal(second.uniformFrame.y-first.uniformFrame.y,40);
 assert.equal(first.uniformFrame.w/900,first.uniformFrame.h/1600);
 assert.equal(first.collarSocketY,50+short.baseY-2);
 assert.equal(first.uniformFrame.w,720);
 assert.throws(()=>measurePortraitNeck(new Uint8Array(300*400*4),300,400,face));
 assert.throws(()=>planPortraitUniformFit({...input,neck:null}));
 assert.throws(()=>planPortraitUniformFit({...input,uniform:{...uniform,neckOpeningWidth:null}}));
 assert.throws(()=>planPortraitUniformFit({...input,uniform:{...uniform,socketY:500}}));
 assert.throws(()=>planPortraitUniformFit({...input,uniform:{...uniform,height:400,bounds:{...uniform.bounds,b:399}}}));
}
runMeasuredNeckChecks(api,assert);
console.log('PASS: measured neck base and width, unchanged head, measured displacement, no forced frame-width enlargement, overlap and invalid-fit rejection.');
