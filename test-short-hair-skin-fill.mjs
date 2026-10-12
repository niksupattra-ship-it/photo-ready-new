import test from 'node:test';
import assert from 'node:assert/strict';
import {shortHairInterior} from './src/short-hair-skin-fill.js';
import {eraseHeadExteriorExcess} from './src/upper-hair-eraser.js';
import {fitProcessedForehead} from './src/processed-forehead-fit.js';
function fixture(angle=0){
 const w=128,h=140,cx=64,cy=65,eye=48,c=Math.cos(angle),s=Math.sin(angle),portrait=new Uint8ClampedArray(w*h*4),overlay=new Uint8ClampedArray(w*h*4),face=[],labels={data:new Uint8Array(w*h),width:w,height:h};
 const world=(u,v)=>({x:cx+u*c-v*s,y:cy+u*s+v*c});
 for(const [id,u,v] of [[33,-24,0],[263,24,0],[10,0,-30],[152,0,43],[234,-36,0],[454,36,0],[127,-36,-5],[356,36,-5]]){const p=world(u,v);face[id]={x:p.x/w,y:p.y/h}}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=(x-cx)*c+(y-cy)*s,v=-(x-cx)*s+(y-cy)*c,n=y*w+x,j=n*4;
  if(Math.abs(u)<=40&&v>=-50&&v<=-24){portrait.set([22,17,14,255],j);labels.data[n]=1}
  if(Math.abs(u)<=26&&v>-24&&v<=43){portrait.set([Math.round(178+u*.25),Math.round(122+v*.15),103,255],j);labels.data[n]=3}
  if(Math.abs(u)<=44&&v>=-44&&v<=-30||Math.abs(u)>=28&&Math.abs(u)<=36&&v>-30&&v<=-5)overlay.set([30,22,18,255],j);
 }
 const at=(u,v)=>{const p=world(u,v);return (Math.round(p.y)*w+Math.round(p.x))*4};
 const interior=shortHairInterior(overlay,w,h,face);
 return {w,h,eye,face,portrait,overlay,labels,interior,at,world};
}

const finish=f=>{
 const lower=eraseHeadExteriorExcess(f.portrait,f.overlay,f.w,f.h,f.face,f.labels,{softEdges:true,interior:f.interior});
 return fitProcessedForehead(f.portrait,f.overlay,f.w,f.h,f.face,f.labels,lower);
};
for(const angle of [-.3,0,.3])test(`short styles warp the same forehead at ${angle} without a donor patch`,()=>{
 const f=fixture(angle),original=new Uint8ClampedArray(f.portrait),hair=new Uint8ClampedArray(f.overlay),result=finish(f),j=f.at(0,-27);
 assert.ok(result.warpedPixels>0);assert.equal(result.pixels[j+3],255);assert.ok(result.pixels[j]>140);assert.deepEqual(f.portrait,original);assert.deepEqual(f.overlay,hair);
 for(const [u,v] of [[-24,0],[24,0],[-24,-13],[24,-13],[0,20],[-36,5],[36,5]]){const k=f.at(u,v);assert.deepEqual(result.pixels.slice(k,k+4),original.slice(k,k+4))}
});
test('short interior geometry protects an enclosed opening without adding skin pixels',()=>{
 const f=fixture();for(let v=-39;v<=-35;v++)for(let u=-2;u<=2;u++){const j=f.at(u,v);f.overlay.fill(0,j,j+4)}
 f.interior=shortHairInterior(f.overlay,f.w,f.h,f.face);const erased=eraseHeadExteriorExcess(f.portrait,f.overlay,f.w,f.h,f.face,f.labels,{softEdges:true,interior:f.interior});
 for(const [u,v] of [[0,-37],[0,-27],[-12,-27],[12,-27]]){const j=f.at(u,v);assert.equal(f.interior[j/4],1);assert.deepEqual(erased.slice(j,j+4),f.portrait.slice(j,j+4))}
});
test('short styles without safe forehead skin do not paint a replacement patch',()=>{
 const f=fixture();f.labels.data.fill(1);const result=finish(f),j=f.at(0,-27);assert.equal(result.warpedPixels,0);assert.ok(result.unresolvedColumns>0);assert.deepEqual(result.pixels.slice(j,j+4),f.portrait.slice(j,j+4));
});
