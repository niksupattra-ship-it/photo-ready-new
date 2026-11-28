import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {planFemaleBodyGuide,fitFemaleBodyToGuide} from '../female-body-guide-fit.js';
function rect(w,h,x,y,rw,rh){const data=Buffer.alloc(w*h*4);for(let yy=y;yy<y+rh;yy++)for(let xx=x;xx<x+rw;xx++)data.set([80,90,100,255],(yy*w+xx)*4);return data}
test('one uniform transform fills both garment sides and anchors the hem at or beyond bottom',()=>{
 const w=300,h=400,target=rect(w,h,90,160,120,220),src=rect(w,h,60,124,144,264);
 const p=planFemaleBodyGuide(src,target,w,h);
 assert(Math.abs(p.from.width*p.scale-(w+12))<1e-8);
 assert(Math.abs(p.from.center*p.scale+p.x-w/2)<1e-8);
 assert(p.from.bottom*p.scale+p.y>=h);assert(p.headroom>=h*.09);
});
test('even a guide with side padding fills edges while retaining crown clearance',()=>{
 const rgba=rect(300,400,90,160,120,220),p=planFemaleBodyGuide(rgba,rgba,300,400);
 assert(p.scale>1);assert.equal(p.from.width*p.scale,312);assert(p.headroom>=36);
});
test('actual raster has no left, right or bottom gap and does not clip the crown',async()=>{
 const src=rect(300,400,60,124,144,264),target=rect(300,400,90,160,120,220);
 const png=await sharp(src,{raw:{width:300,height:400,channels:4}}).png().toBuffer();const guide=await sharp(target,{raw:{width:300,height:400,channels:4}}).png().toBuffer();
 const {data,info}=await sharp(await fitFemaleBodyToGuide(png,guide)).raw().toBuffer({resolveWithObject:true});assert.equal(info.width,900);assert.equal(info.height,1200);
 const a=(x,y)=>data[(y*900+x)*4+3];assert(a(0,1100)>250);assert(a(899,1100)>250);assert(a(450,1199)>250);assert.equal(a(450,20),0);assert(a(450,150)>250);
});
