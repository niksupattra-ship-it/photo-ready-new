import test from 'node:test';
import assert from 'node:assert/strict';
import {liftSkinPixels} from '../public/seedream-pro-skin-tone.js';
const input=new Uint8ClampedArray([150,120,100,255,85,65,45,255,245,245,245,255,0,0,0,0]);
test('zero adjustment and protected features retain exact original bytes',()=>{
 assert.deepEqual(liftSkinPixels(input,new Float32Array([1,1,1,1]),0),input);
 assert.deepEqual(liftSkinPixels(input,new Float32Array(4),100),input);
 assert.deepEqual(liftSkinPixels(input,new Float32Array([0,0,0,1]),100),input);
});
test('skin lift is bounded, monotonic and noncumulative, preserving colour differences, dimensions and alpha',()=>{
 const mask=new Float32Array([1,0,0,1]),half=liftSkinPixels(input,mask,50),full=liftSkinPixels(input,mask,100);
 assert.equal(full.length,input.length);assert(full[0]>half[0]&&half[0]>input[0]);assert(full[0]-input[0]<=16);
 assert.equal(full[0]-full[1],input[0]-input[1]);assert.equal(full[1]-full[2],input[1]-input[2]);
 for(let i=3;i<full.length;i+=4)assert.equal(full[i],input[i]);assert.deepEqual(full.slice(4),input.slice(4));
 assert.deepEqual(full,liftSkinPixels(input,mask,100));assert.deepEqual(input,new Uint8ClampedArray([150,120,100,255,85,65,45,255,245,245,245,255,0,0,0,0]));
});
test('dark features and white highlights stay fixed without clipping, blurring or recolouring',()=>{
 const pixels=new Uint8ClampedArray([10,10,10,255,255,255,255,255,220,210,200,128]);
 const result=liftSkinPixels(pixels,new Float32Array([1,1,1]),100);assert.deepEqual(result.slice(0,8),pixels.slice(0,8));assert.equal(result[11],128);assert(result[8]>=220&&result[8]<=236);
 assert.throws(()=>liftSkinPixels(input,new Float32Array(2),50));
});
