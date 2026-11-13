import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {correctEnglishProportions} from '../english-proportion-correction.js';
const root=new URL('..',import.meta.url).pathname;
async function matte(kind){
 const width=32,height=48,data=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;data[i]=kind==='white'?255:x%2?255:0;data[i+1]=kind==='white'?255:120;data[i+2]=kind==='white'?255:90;
  data[i+3]=kind==='empty'?0:kind==='white'&&(x<4||x>=28||y<4||y>=44)?0:255;
 }
 return sharp(data,{raw:{width,height,channels:4}}).png().toBuffer();
}
async function correct(image){
 let calls=0;const out=await correctEnglishProportions({portrait:image,fields:{neckOutfitReferencePath:'/assets/job-uniforms/female-job-ivory-bow-blouse.png'},metrics:{faceRatio:.4,headRatio:.7,headScale:.8},root,key:'inert',removeBackground:async()=>image,requestPortrait:async()=>{calls++;return{png:image}}});assert.equal(calls,1);return out;
}
test('legacy correction accepts a valid transparent white portrait independently of its red pixels',async()=>{
 const image=await matte('white'),out=await correct(image);
 assert.deepEqual(await sharp(out.natural).extractChannel(3).raw().toBuffer(),await sharp(image).extractChannel(3).raw().toBuffer());
});
test('opaque and fully empty correction mattes are rejected even when RGB spans0–255',async()=>{
 for(const kind of ['opaque','empty'])await assert.rejects(correct(await matte(kind)),/background removal failed/);
});
