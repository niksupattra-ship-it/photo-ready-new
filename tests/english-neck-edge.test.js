import {test} from 'node:test';
import assert from 'node:assert/strict';
import {softenEnglishNeckEdges} from '../src/english-original-outfit.js';
test('neck antialias softens a hard edge without retouching RGB, face or adding skin',()=>{
 const width=100,height=120,pixels=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;pixels.set([160,120,100,x>=30&&x<=70?255:0],i)}
 const before=pixels.slice();softenEnglishNeckEdges(pixels,width,height,{chinY:40,faceCX:50,eyeWidth:30});
 assert(pixels[(60*width+30)*4+3]>0&&pixels[(60*width+30)*4+3]<255);
 for(let i=0;i<pixels.length;i+=4){assert.deepEqual(pixels.subarray(i,i+3),before.subarray(i,i+3));if(!before[i+3])assert.equal(pixels[i+3],0)}
 assert.deepEqual(pixels.subarray(0,40*width*4),before.subarray(0,40*width*4));
 assert.equal(pixels[(60*width+50)*4+3],255,'interior neck remains opaque');
});
