import assert from 'node:assert/strict';
import {profileSelectedPortraitHair,inspectSelectedPortraitHair} from '../src/selected-hair-check.js';

// Fixtures describe already eye-aligned segmentation evidence. They test the
// conservative shape policy, not model classification or face recognition.
const W=256,H=320,bounds=[{x:0,y:0},{x:256,y:0},{x:256,y:360},{x:0,y:360}];
function fixture({fringe=0,bottom=240,shift=0,volume=0,chinY=210,faceTopY=76,sourceBounds=bounds,color=80}={}){
 const pixels=new Uint8ClampedArray(W*H*4),hair=new Uint8ClampedArray(W*H*4);
 for(let i=0;i<pixels.length;i+=4){pixels[i]=color;pixels[i+1]=Math.min(255,color+20);pixels[i+2]=Math.min(255,color+30);pixels[i+3]=255}
 const rect=(x0,y0,x1,y1)=>{for(let y=Math.max(0,y0);y<Math.min(H,y1);y++)for(let x=Math.max(0,x0);x<Math.min(W,x1);x++)hair[(y*W+x)*4+3]=255};
 rect(60-volume+shift,16,196+volume+shift,82);
 rect(64-volume+shift,65,99+shift,bottom);rect(157+shift,65,192+volume+shift,bottom);
 if(fringe)rect(108,82,108+Math.round(40*fringe),132);
 return {pixels,hair,chinY,faceTopY,sourceBounds};
}
let checks=0;function test(name,run){run();checks++;console.log('PASS: '+name)}
test('an identical selected cut is accepted',()=>assert.equal(inspectSelectedPortraitHair(fixture(),fixture()).mismatch,false));
test('substantial bangs contradict an open selected forehead',()=>assert.equal(inspectSelectedPortraitHair(fixture(),fixture({fringe:.6})).reason,'unexpected_fringe'));
test('a completely open forehead contradicts dense selected bangs',()=>assert.equal(inspectSelectedPortraitHair(fixture({fringe:.8}),fixture()).reason,'missing_fringe'));
test('uncertain wispy coverage does not become a claimed mismatch',()=>{
 assert.equal(inspectSelectedPortraitHair(fixture(),fixture({fringe:.2})).mismatch,false);
 assert.equal(inspectSelectedPortraitHair(fixture({fringe:.3}),fixture({fringe:.65})).mismatch,false);
});
test('small normalized offsets and hair volume differences are tolerated',()=>{
 for(const shift of [-4,0,4])for(const volume of [-4,0,8])assert.equal(inspectSelectedPortraitHair(fixture(),fixture({shift,volume})).mismatch,false);
});
test('lighting and RGB color do not affect a matching mask',()=>assert.equal(inspectSelectedPortraitHair(fixture({color:20}),fixture({color:210})).mismatch,false));
test('the fringe band follows a naturally shorter forehead',()=>{
 const short=fixture({faceTopY:116});for(let y=82;y<121;y++)for(let x=108;x<148;x++)short.hair[(y*W+x)*4+3]=255;
 const profile=profileSelectedPortraitHair(short);assert(profile.fringeTop>121);assert.equal(profile.fringe,0);assert.equal(inspectSelectedPortraitHair(fixture(),short).mismatch,false);
});
test('small differences in facial-oval landmarks do not alter an open selected cut',()=>{
 for(const faceTopY of [68,76,84,100,108,115])assert.equal(inspectSelectedPortraitHair(fixture(),fixture({faceTopY})).mismatch,false);
});
test('a clear bilateral length contradiction is rejected when both endpoints are visible',()=>assert.equal(inspectSelectedPortraitHair(fixture({bottom:220}),fixture({bottom:300})).reason,'length'));
test('normal endpoint and face-chin variation is tolerated',()=>assert.equal(inspectSelectedPortraitHair(fixture({bottom:260,chinY:210}),fixture({bottom:276,chinY:223})).mismatch,false));
test('cropped or unavailable source bounds disable length-only judgment',()=>{
 const cropped=[{x:0,y:0},{x:256,y:0},{x:256,y:302},{x:0,y:302}];
 assert.equal(inspectSelectedPortraitHair(fixture({bottom:220}),fixture({bottom:300,sourceBounds:cropped})).mismatch,false);
 assert.equal(inspectSelectedPortraitHair(fixture({bottom:220,sourceBounds:null}),fixture({bottom:300})).mismatch,false);
});
test('canvas-bottom hair is not treated as a measured endpoint',()=>assert.equal(profileSelectedPortraitHair(fixture({bottom:320})).lengthMeasurable,false));
test('invalid dimensions, absent masks and weak hair evidence are unmeasurable',()=>{
 for(const evidence of [null,{...fixture(),width:128},{...fixture(),hair:new Uint8ClampedArray(4)},{...fixture(),hair:new Uint8ClampedArray(W*H*4)}])assert.equal(inspectSelectedPortraitHair(evidence,fixture()).measurable,false);
});
test('missing forehead pixels do not cause a guessed fringe classification',()=>{
 const evidence=fixture();for(let y=108;y<132;y++)for(let x=108;x<148;x++)evidence.pixels[(y*W+x)*4+3]=0;
 assert.equal(inspectSelectedPortraitHair(evidence,fixture({fringe:.8})).measurable,false);
});
test('inspection never changes source pixels, masks or bounds',()=>{
 const ref=fixture(),out=fixture({fringe:.8}),a=ref.pixels.slice(),b=ref.hair.slice(),c=out.pixels.slice(),d=out.hair.slice(),e=JSON.stringify(bounds);
 inspectSelectedPortraitHair(ref,out);assert.deepEqual(ref.pixels,a);assert.deepEqual(ref.hair,b);assert.deepEqual(out.pixels,c);assert.deepEqual(out.hair,d);assert.equal(JSON.stringify(bounds),e);
});
console.log(`PASS: ${checks} selected hair shape scenarios; no network, image mutation, identity claim or paid AI.`);
