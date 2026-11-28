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
 assert.equal(info.width,900);assert.equal(info.height,1200);const alpha=(x,y)=>data[(y*info.width+x)*4+3];
 assert.equal(alpha(20,700),0);assert.equal(alpha(880,700),0);assert(alpha(450,1140)>250);assert.equal(alpha(450,1190),0);assert.equal(alpha(450,90),0);assert(alpha(450,150)>250);
});
