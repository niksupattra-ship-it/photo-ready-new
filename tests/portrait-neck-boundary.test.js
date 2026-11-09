import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundPortraitNeckAlpha} from '../src/portrait-neck-boundary.js';
test('cleanup cannot curve or tilt a wide straight neck in the visible region',()=>{
 const width=240,height=300,face=[];
 face[33]={x:90/width,y:70/height};face[263]={x:150/width,y:70/height};face[152]={x:120/width,y:130/height};face[234]={x:50/width,y:95/height};face[454]={x:190/width,y:95/height};
 const pixels=new Uint8ClampedArray(width*height*4),hair=new Uint8ClampedArray(pixels.length),skin=new Uint8ClampedArray(pixels.length);
 for(let i=0;i<pixels.length;i+=4){pixels.set([180,145,120,255],i);skin[i+3]=255}
 const original=pixels.slice();assert(boundPortraitNeckAlpha(pixels,hair,width,height,face,{skin}));
 let expected;
 for(let y=137;y<=176;y++){
  const xs=[];for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>128)xs.push(x);
  const edges=[xs[0],xs.at(-1)];if(!expected)expected=edges;else assert.deepEqual(edges,expected,'no inward curve or drift below the chin');
  assert(xs.length>=140,'the retained visible shaft must be wide');assert(Math.abs((edges[0]+edges[1])/2-120)<1);
 }
 for(let i=0;i<pixels.length;i+=4)assert.deepEqual(pixels.subarray(i,i+3),original.subarray(i,i+3));
});
test('hair outside the neck mask survives, and cleanup never invents missing skin',()=>{
 const width=120,height=180,face=[];face[33]={x:44/width,y:40/height};face[263]={x:76/width,y:40/height};face[152]={x:60/width,y:72/height};
 const pixels=new Uint8ClampedArray(width*height*4),hair=new Uint8ClampedArray(pixels.length),skin=new Uint8ClampedArray(pixels.length);
 for(let y=73;y<height;y++)for(let x=3;x<8;x++){const i=(y*width+x)*4;pixels.set([30,25,20,255],i);hair[i+3]=255}
 const before=pixels.slice();boundPortraitNeckAlpha(pixels,hair,width,height,face,{skin});assert.deepEqual(pixels,before);
});
