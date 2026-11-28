import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {planFemaleBodyGuide,fitFemaleBodyToGuide} from '../female-body-guide-fit.js';
function rect(w,h,x,y,rw,rh){const data=Buffer.alloc(w*h*4);for(let yy=y;yy<y+rh;yy++)for(let xx=x;xx<x+rw;xx++)data.set([80,90,100,255],(yy*w+xx)*4);return data}
test('enlarged and shifted garment is aligned to PNG width, center and canvas bottom with one uniform transform',()=>{
 const w=300,h=400,target=rect(w,h,90,160,120,220),src=rect(w,h,60,124,144,264);
 const p=planFemaleBodyGuide(src,target,w,h);assert.equal(p.scale,120/144);assert(Math.abs(p.from.center*p.scale+p.x-p.to.center)<1e-8);assert(Math.abs(p.from.bottom*p.scale+p.y-(h+2))<1e-8);
 assert(Math.abs(144*p.scale-120)<1e-8);assert(Math.abs(264*p.scale-220)<1e-8);
});
test('existing PNG scale and horizontal placement stay unchanged while hem moves to bottom',()=>{
 const rgba=rect(300,400,90,160,120,220),p=planFemaleBodyGuide(rgba,rgba,300,400);assert.equal(p.scale,1);assert.equal(p.x,0);assert.equal(p.y,22);
});
test('actual raster placement preserves side margins and places the garment against the bottom',async()=>{
 const src=rect(300,400,60,124,144,264),target=rect(300,400,90,160,120,220);
 const png=await sharp(src,{raw:{width:300,height:400,channels:4}}).png().toBuffer();const guide=await sharp(target,{raw:{width:300,height:400,channels:4}}).png().toBuffer();
 const {data,info}=await sharp(await fitFemaleBodyToGuide(png,guide)).raw().toBuffer({resolveWithObject:true});assert.equal(info.width,900);assert.equal(info.height,1200);
 const a=(x,y)=>data[(y*900+x)*4+3];assert(a(450,600)>250);assert.equal(a(100,600),0);assert.equal(a(800,600),0);assert(a(450,1199)>250);
});
