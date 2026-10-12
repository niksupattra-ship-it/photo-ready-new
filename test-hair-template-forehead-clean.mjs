import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanTemplateForehead} from './src/hair-template-forehead-clean.js';

function fixture(scale=1){
 const rw=160,rh=180,w=rw*scale,h=rh*scale,face=[],pixels=new Uint8ClampedArray(w*h*4),nativeSkin=new Uint8ClampedArray(w*h*4),nativeHair=new Uint8ClampedArray(w*h*4),reference=new Uint8ClampedArray(rw*rh*4),skin=new Uint8ClampedArray(rw*rh*4);
 for(const [i,x,y] of [[33,54,80],[263,106,80],[10,80,45],[234,38,80],[454,122,80]])face[i]={x:x/rw,y:y/rh};
 for(let y=48;y<75;y++)for(let x=45;x<=115;x++){const j=(y*rw+x)*4;reference.set([224,181,157,255],j);skin.set([255,255,255,255],j)}
 const at=(u,v)=>(Math.round((80+v)*scale)*w+Math.round((80+u)*scale))*4;
 const run=()=>cleanTemplateForehead(pixels,w,h,face,rw,rh,[1/scale,0,0,1/scale,0,0],reference,skin,nativeSkin,nativeHair);
 return {rw,rh,w,h,face,pixels,nativeSkin,nativeHair,reference,skin,at,run};
}
for(const alpha of [1,32,128,239,255])test(`template forehead skin with alpha ${alpha} is removed instead of being stacked over another face`,()=>{
 const f=fixture(),j=f.at(15,-30);f.pixels.set([236,195,169,alpha],j);f.nativeSkin[j+3]=255;
 const before=new Uint8ClampedArray(f.pixels),result=f.run();assert.equal(result.removed,1);assert.equal(result.pixels[j+3],0);assert.deepEqual(result.pixels.slice(j,j+3),before.slice(j,j+3));assert.deepEqual(f.pixels,before);
});
test('foreign skin is removed in native PNG coordinates through its calibration',()=>{
 const f=fixture(2),j=f.at(-18,-31);f.pixels.set([236,195,169,220],j);f.nativeSkin[j+3]=255;
 const result=f.run();assert.equal(result.pixels[j+3],0);assert.equal(result.removed,1);
});
test('opaque blonde/brown hair remains intact even when its colour resembles face skin',()=>{
 const f=fixture();for(const [u,rgb] of [[-15,[225,186,152]],[15,[66,45,31]]]){const j=f.at(u,-30);f.pixels.set([...rgb,255],j);f.nativeHair[j+3]=255}
 const result=f.run();assert.equal(result.removed,0);assert.deepEqual(result.pixels,f.pixels);
});
test('a wrongly skin-labelled dark strand is retained rather than cutting a notch in the hairstyle',()=>{
 const f=fixture(),j=f.at(15,-30);f.pixels.set([40,25,20,100],j);f.nativeSkin[j+3]=255;
 assert.deepEqual(f.run().pixels,f.pixels);
});
test('low-alpha white forehead matte is removed while photographed hair RGB stays unchanged',()=>{
 const f=fixture(),j=f.at(-20,-32);f.pixels.set([245,245,245,64],j);
 const result=f.run();assert.equal(result.pixels[j+3],0);assert.deepEqual([...result.pixels.slice(j,j+3)],[245,245,245]);
});
test('the natural central scalp part above the forehead is preserved',()=>{
 const f=fixture(),j=f.at(0,-43);f.pixels.set([230,190,164,255],j);f.nativeSkin[j+3]=255;
 assert.deepEqual(f.run().pixels,f.pixels);
});
test('template cleanup cannot alter the outer crown, eyes, ears or neck regions',()=>{
 const f=fixture();for(const [u,v] of [[0,-65],[0,0],[-43,5],[43,5],[0,60]]){const j=f.at(u,v);f.pixels.set([230,190,164,220],j);f.nativeSkin[j+3]=255}
 assert.deepEqual(f.run().pixels,f.pixels);
});
test('forehead cleanup only decreases template alpha and never paints or changes RGB',()=>{
 const f=fixture();for(let v=-33;v<=-25;v++)for(let u=-30;u<=30;u++){const j=f.at(u,v);f.pixels.set([236,195,169,220],j);f.nativeSkin[j+3]=255}
 const result=f.run();assert.ok(result.removed>100);
 for(let j=0;j<f.pixels.length;j+=4){assert.deepEqual(result.pixels.slice(j,j+3),f.pixels.slice(j,j+3));assert.ok(result.pixels[j+3]<=f.pixels[j+3])}
});
test('invalid calibration or material guides fail before modifying the PNG',()=>{
 const f=fixture(),before=new Uint8ClampedArray(f.pixels);
 assert.throws(()=>cleanTemplateForehead(f.pixels,f.w,f.h,f.face,f.rw,f.rh,[0,0,0,0,0,0],f.reference,f.skin,f.nativeSkin,f.nativeHair));assert.deepEqual(f.pixels,before);
});
