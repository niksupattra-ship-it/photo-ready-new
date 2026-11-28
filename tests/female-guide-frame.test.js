import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {prepareFemaleLabForeground} from '../female-lab-output.js';
test('guide-based result keeps the full AI canvas and garment hem without filling side margins',async()=>{
 const subject=await sharp({create:{width:120,height:350,channels:4,background:'#765432'}}).png().toBuffer();
 const matte=await sharp({create:{width:300,height:400,channels:4,background:'#00000000'}}).composite([{input:subject,left:90,top:40}]).png().toBuffer();
 const original=await sharp({create:{width:300,height:400,channels:4,background:'#ffffff'}}).composite([{input:subject,left:90,top:40}]).png().toBuffer();
 const output=await prepareFemaleLabForeground(original,async()=>matte);
 const {data,info}=await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,300);assert.equal(info.height,400);const alpha=(x,y)=>data[(y*info.width+x)*4+3];
 assert.equal(alpha(7,233),0);assert.equal(alpha(293,233),0);assert(alpha(150,380)>250);assert.equal(alpha(150,397),0);assert.equal(alpha(150,30),0);assert(alpha(150,50)>250);
});
