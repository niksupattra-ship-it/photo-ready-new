import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanFemaleWhiteEdge} from '../female-white-edge-clean.js';
test('white fringe is unmatted at external edges while opaque pixels and alpha remain identical',()=>{
 const w=15,h=15,src=Buffer.alloc(w*h*4);
 for(let y=2;y<13;y++)for(let x=4;x<13;x++){
  const i=(y*w+x)*4;src.set(x===4?[143,148,153,128]:[30,40,50,255],i);
 }
 const out=cleanFemaleWhiteEdge(src,w,h),edge=(7*w+4)*4;
 assert(out[edge]<45);assert(out[edge+1]<55);assert(out[edge+2]<65);
 for(let i=0;i<src.length;i+=4){assert.equal(out[i+3],src[i+3]);if(src[i+3]===255)assert.deepEqual(out.subarray(i,i+4),src.subarray(i,i+4))}
});
test('white suit edges and interior transparency are protected',()=>{
 const w=15,h=15,src=Buffer.alloc(w*h*4,255);
 const center=(7*w+7)*4;src.set([230,230,230,128],center);
 assert.deepEqual(cleanFemaleWhiteEdge(src,w,h),src);
 for(let y=0;y<h;y++)src.fill(0,(y*w)*4,(y*w+3)*4);
 for(let y=0;y<h;y++)src.set([255,255,255,128],(y*w+3)*4);
 assert.deepEqual(cleanFemaleWhiteEdge(src,w,h),src);
});
