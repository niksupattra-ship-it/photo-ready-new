import assert from 'node:assert/strict';
import {measureCollarOpeningProfile,measureSkinNeckProfile,solveAutoCollarWidth} from '../src/studio-auto-collar-fit.js';
const width=400,height=500;
function uniform(gap){const pixels=new Uint8ClampedArray(width*height*4);for(let y=15;y<height;y++)for(let x=0;x<width;x++)if(x<200-gap/2||x>200+gap/2||y>170){const j=(y*width+x)*4;pixels[j]=pixels[j+1]=pixels[j+2]=220;pixels[j+3]=255}return pixels}
const neckProfile={confidence:1,rows:[50,55,60,65,70,75,80,85,90].map(y=>({y,left:166,right:234}))};
for(const gap of [60,100]){
 const pixels=uniform(gap),original=pixels.slice(),result=solveAutoCollarWidth({pixels,width,height,neckProfile,headToUniform:[1,0,0,1,0,0]});
 assert(result.confidence>0);assert.equal(Math.sign(result.neckWidth),gap===60?1:-1);assert(result.neckWidth>=-150&&result.neckWidth<=150);assert.deepEqual(pixels,original);
 const before=result.rows.reduce((sum,r)=>sum+(r.left-r.targetLeft)**2+(r.right-r.targetRight)**2,0),after=result.rows.reduce((sum,r)=>sum+(r.left+r.kl*result.neckWidth/100-r.targetLeft)**2+(r.right+r.kr*result.neckWidth/100-r.targetRight)**2,0);assert(after<before*.55);
 assert(measureCollarOpeningProfile({pixels,width,height}).length>10);
 assert.deepEqual(result,solveAutoCollarWidth({pixels,width,height,neckProfile,headToUniform:[1,0,0,1,0,0]}));
}
assert.equal(solveAutoCollarWidth({pixels:uniform(100),width,height,neckProfile:{rows:[]},headToUniform:[1,0,0,1,0,0]}).confidence,0);
assert.equal(solveAutoCollarWidth({pixels:new Uint8ClampedArray(width*height*4).fill(255),width,height,neckProfile,headToUniform:[1,0,0,1,0,0]}).confidence,0);
for(const skin of [[220,170,145],[105,72,54]]){
 const pixels=new Uint8ClampedArray(width*height*4),face=Array.from({length:455},()=>({x:.5,y:.3}));
 face[10]={x:.5,y:.12};face[152]={x:.5,y:.6};face[234]={x:.25,y:.35};face[454]={x:.75,y:.35};
 for(let y=40;y<440;y++)for(let x=80;x<320;x++){
  const inFace=y<300&&((x-200)/110)**2+((y-175)/145)**2<1,inNeck=y>=300&&x>=155&&x<=245,inHair=y>=300&&x>=80&&x<=120;
  if(inFace||inNeck||inHair){const j=(y*width+x)*4;pixels.set(inHair?[25,22,22,255]:[...skin,255],j)}
 }
 const original=pixels.slice(),result=measureSkinNeckProfile({pixels,width,height,face});assert(result.confidence>0);assert(result.rows.length>5);assert(result.rows.every(r=>r.left>=154&&r.right<=246));assert(result.bottomY>430&&result.bottomY<440);assert.equal(result.complete,true);assert.deepEqual(pixels,original);
}
console.log('PASS: conservative collar close/expand, deterministic convergence, closed/ambiguous fallback, light/dark skin neck profile and hair exclusion; input pixels unchanged.');
