import {layerToScene} from '../src/studio-transform.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {planThaiBodyFrame,fitThaiBodyScene} from '../src/thai-body-framing.js';
import {eyeIdentityMetrics,compareThaiEyeIdentity} from '../src/thai-eye-identity.js';
import {inspectThaiGatheredBun} from '../src/thai-gathered-bun-check.js';
import {THAI_REAL_FACE_VERSION,THAI_REAL_FACE_PREVIOUS_VERSION,thaiFinalOriginalIdentity} from '../thai-real-face-policy.js';
import {THAI_OUTFIT_AI_VERSION} from '../thai-outfit-ai-policy.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
function portrait(w=300,h=400,bottom=390){const pixels=new Uint8ClampedArray(w*h*4);for(let y=60;y<bottom;y++)for(let x=60;x<w-60;x++)pixels[(y*w+x)*4+3]=255;return pixels}
test('native portrait placement removes the reported lower transparent strip with one uniform scale, without modifying pixels',()=>{
 const w=300,h=400,pixels=portrait(w,h),before=hash(pixels),plan=planThaiBodyFrame(pixels,w,h);
 assert(plan.applied);assert.equal(plan.reason,'bottom_anchored');assert(plan.y+(plan.bottom+1)*plan.scale>=1202-1e-8);assert(plan.y+plan.crown*plan.scale>=-1e-8);
 assert(Math.abs(plan.scale*300/(plan.scale*400)-.75)<1e-12);assert.equal(hash(pixels),before);
 for(let x=0;x<20;x++)pixels[((h-1)*w+x)*4+3]=100;
 assert.equal(planThaiBodyFrame(pixels,w,h).bottom,389,'Ignore sparse/soft matte noise below the coat');
 for(let y=390;y<h;y++)for(const x of [...Array.from({length:40},(_,i)=>i+10),...Array.from({length:40},(_,i)=>i+250)])pixels[(y*w+x)*4+3]=255;
 assert.equal(planThaiBodyFrame(pixels,w,h).bottom,389,'Side hair does not conceal a floating central coat hem');
 const full=planThaiBodyFrame(portrait(w,h,h),w,h);assert(full.scale>3);assert(full.crown*full.scale+full.y>=-1e-8);
});
test('different native aspect ratios and excessive padding retain the crown and never squeeze/stretch a face',()=>{
 for(const [w,h,bottom] of [[300,440,430],[340,400,390],[300,400,300]]){
  const plan=planThaiBodyFrame(portrait(w,h,bottom),w,h);
  assert(plan.crown*plan.scale+plan.y>=-1e-8);
  assert((plan.bottom+1)*plan.scale+plan.y>=1202-1e-8);assert(plan.crown*plan.scale+plan.y>=-1e-8);
 }
 assert.equal(planThaiBodyFrame(new Uint8Array(40),300,400).reason,'unmeasurable');
});
function eyes(){const f=[];for(const [a,b,u,l,c,r] of [[33,133,159,145,468,[469,470,471,472]],[362,263,386,374,473,[474,475,476,477]]]){const x=a===33?.25:.58;f[a]={x,y:.4};f[b]={x:x+.16,y:.4};f[u]={x:x+.08,y:.378};f[l]={x:x+.08,y:.422};f[c]={x:x+.08,y:.4};r.forEach((id,i)=>f[id]={x:x+.08+Math.cos(i*Math.PI/2)*.025,y:.4+Math.sin(i*Math.PI/2)*.025})}return f}
test('eye evidence is invariant under whole-image scale and translation, but rejects changed gaze, larger irises and lifted/widened eyes',()=>{
 const face=eyes(),original=eyeIdentityMetrics(face,1000,1000);assert(original);
 const moved=face.map(p=>p?{x:p.x*.75+.08,y:p.y*.75+.06}:p);
 assert.equal(compareThaiEyeIdentity(original,eyeIdentityMetrics(moved,1800,1800)).action,'accept');
 const gaze=eyes();gaze[468].x+=.035;for(const id of [469,470,471,472])gaze[id].x+=.035;
 assert.equal(compareThaiEyeIdentity(original,eyeIdentityMetrics(gaze,1000,1000)).action,'reject');
 const iris=eyes();for(const id of [469,470,471,472]){iris[id].x=iris[468].x+(iris[id].x-iris[468].x)*1.4;iris[id].y=iris[468].y+(iris[id].y-iris[468].y)*1.4}
 assert.equal(compareThaiEyeIdentity(original,eyeIdentityMetrics(iris,1000,1000)).action,'reject');
 const wide=eyes();wide[159].y-=.02;assert.equal(compareThaiEyeIdentity(original,eyeIdentityMetrics(wide,1000,1000)).action,'reject');
 assert.equal(compareThaiEyeIdentity(original,null).action,'review');assert.equal(eyeIdentityMetrics([],1000,1000),null);
});
function bunEvidence(){const pixels=new Uint8ClampedArray(256*320*4),hair=new Uint8ClampedArray(pixels.length);const box=(x,y,w,h,isHair=true)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const i=(yy*256+xx)*4+3;pixels[i]=255;hair[i]=isHair?255:0}};box(90,100,70,40);return {pixels,hair,chinY:230,box}}
test('gathered neck guard rejects a substantial visible hair lump, while dark ties/shoulder boards and isolated wisps pass',()=>{
 const safe=bunEvidence();safe.box(115,239,24,60,false);safe.box(42,255,45,20,false);assert.equal(inspectThaiGatheredBun(safe).retained,false);
 const bun=bunEvidence();bun.box(66,211,14,19);assert.equal(inspectThaiGatheredBun(bun).retained,true);
 const wisp=bunEvidence();wisp.box(75,211,2,15);assert.equal(inspectThaiGatheredBun(wisp).retained,false);
 assert.equal(inspectThaiGatheredBun({}).measurable,false);
});
test('new Thai-only final contract prevents visible buns, floating coats and beauty eye/face substitution; archived/English requests remain unchanged',async()=>{
 const marker={thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiRealFaceVersion:THAI_REAL_FACE_VERSION};
 const prompt=thaiFinalOriginalIdentity(marker);for(const text of ['NO VISIBLE BUN ANYWHERE','existing catchlight pattern','No beauty-model face','No floating torso','never squeeze a face'])assert(prompt.includes(text),text);
 assert.equal(thaiFinalOriginalIdentity({...marker,thaiRealFaceVersion:THAI_REAL_FACE_PREVIOUS_VERSION}),'');assert.equal(thaiFinalOriginalIdentity({interfaceLanguage:'en'}),'');
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert(main.includes('blob.idpromThaiRealFaceVersion=j.thaiRealFaceVersion'));
 assert(main.includes('headBlob.idpromThaiRealFaceVersion===THAI_REAL_FACE_VERSION'));
 assert(main.includes('inspectThaiGatheredBun(await portraitCompletionEvidence(result,false))'));
 assert(main.includes("if((!faceLock.ok&&faceLock.reason==='face_geometry_changed')||eyeLock.action==='reject')"));
});

test('undersized male coat fills both sides and bottom with one scale; saved native details follow and cached switching stays idempotent',()=>{
 const w=300,h=400,pixels=new Uint8ClampedArray(w*h*4);
 for(let y=72;y<190;y++)for(let x=115;x<185;x++)pixels[(y*w+x)*4+3]=255;
 for(let y=190;y<390;y++)for(let x=22;x<278;x++)pixels[(y*w+x)*4+3]=255;
 const before=hash(pixels),plan=planThaiBodyFrame(pixels,w,h);
 assert(plan.x+22*plan.scale<=-2+1e-8);assert(plan.x+278*plan.scale>=902-1e-8);
 assert(plan.y+390*plan.scale>=1202-1e-8);assert(plan.y+72*plan.scale>=-1e-8);assert(plan.y+72*plan.scale>0);assert.equal(hash(pixels),before);
 const head={id:'h',kind:'head',source:'native',sourceFrame:{x:0,y:0,w:900,h:1200}},pin={id:'p',kind:'uniform-detail',realUniformDetail:true,hairHeadId:'h',source:'native-button',sourceFrame:{x:400,y:700,w:40,h:40}},bg={kind:'background'};
 const layers=[bg,head,pin],fitted=fitThaiBodyScene(layers,head,plan,w,h),q=plan.scale/3;
 assert.equal(fitted[0],bg);assert.equal(fitted[1].source,'native');assert.equal(fitted[2].source,'native-button');
 assert(Math.abs(fitted[2].sourceFrame.x-(plan.x+400*q))<1e-8);
 assert.equal(fitThaiBodyScene(fitted,fitted[1],plan,w,h),fitted,'Reopening/switching never zooms twice');
 const edited=[{...head,x:20},pin];assert.equal(fitThaiBodyScene(edited,edited[0],plan,w,h),edited,'Preserve manual head positioning');
 const accessory={...pin,x:20,y:-8,scale:1.2,rotation:12,squeezeX:.9,squeezeY:1.1,mask:'manual accessory mask'};
 const transformed=fitThaiBodyScene([head,accessory],head,plan,w,h)[1],point={x:415,y:720},old=layerToScene(accessory,point),moved={x:q*point.x+plan.x,y:q*point.y+plan.y},actual=layerToScene(transformed,moved);
 assert(Math.abs(actual.x-(q*old.x+plan.x))<1e-8);assert(Math.abs(actual.y-(q*old.y+plan.y))<1e-8);assert.equal(transformed.mask,accessory.mask);
});

test('ID framing measures the entire head including hair, anchors the hem and lets a smaller head sit lower without stretching',()=>{
 const w=900,h=1200,pixels=new Uint8ClampedArray(w*h*4);
 for(let y=20;y<1200;y++)for(let x=30;x<870;x++)pixels[(y*w+x)*4+3]=255;
 const head={left:260,right:640,top:20,bottom:450,width:380,height:430,centerX:450};
 const before=hash(pixels),plan=planThaiBodyFrame(pixels,w,h,{head});
 assert(plan.y+head.top*plan.scale>=0);
 assert(head.width*plan.scale<=900*.46+1e-8);assert(head.height*plan.scale<=1200*.44+1e-8);
 assert(plan.y+1200*plan.scale>=1202-1e-8,'PR143 allows lower cloth to overflow to preserve crown clearance');
 assert(plan.crownLimited);assert(Math.abs(plan.headroom-108)<1e-8,'PR143 reserves minimum 9% crown clearance');
 assert.equal(hash(pixels),before);
 const mask='all-white saved mask',layer={id:'head',kind:'head',source:'native',mask,sourceFrame:{x:0,y:0,w:900,h:1200}};
 const fixed=fitThaiBodyScene([layer],layer,plan,w,h,{opaqueMaskIds:new Set(['head'])});
 assert.equal(fixed[0].mask,mask);assert.notEqual(fixed[0].sourceFrame,layer.sourceFrame);
 assert.equal(fitThaiBodyScene(fixed,fixed[0],plan,w,h,{opaqueMaskIds:new Set(['head'])}),fixed);
});

test('short native coats cannot override the whole-head cap to fill the hem at any ID photo aspect or pixel size',()=>{
 const w=900,h=1200,pixels=new Uint8ClampedArray(w*h*4);
 for(let y=20;y<1200;y++)for(let x=30;x<870;x++)pixels[(y*w+x)*4+3]=255;
 const head={left:240,right:660,top:20,bottom:700,width:420,height:680,centerX:450},before=hash(pixels);
 for(const [W,H]of [[300,400],[900,1200],[1800,2400],[600,600],[330,480],[350,450],[480,630],[620,780]]){
  const plan=planThaiBodyFrame(pixels,w,h,{W,H,head});
  assert(head.height*plan.scale<=H*.42+1e-8);assert(head.width*plan.scale<=W*.44+1e-8);
  assert(plan.y+head.top*plan.scale>=-1e-8);assert(Math.abs(plan.y+1200*plan.scale-(H+2))<1e-8);
  assert.equal(plan.headFitLimited,true,'Respect the head size cap');
  assert(plan.headroom>H*.05,'Keep a fitting, capped head lower while the coat reaches the bottom');
 }
 assert.equal(hash(pixels),before);
});


test('female full-body framing fills coat sides and clears actual hair crown without deforming pixels',()=>{
 const w=300,h=400;
 for(const crown of [0,12,60]){
  const pixels=portrait(w,h,400);
  for(let y=crown;y<65;y++)for(let x=115;x<185;x++)pixels[(y*w+x)*4+3]=255;
  const before=hash(pixels),head={top:90,height:150,width:80,centerX:150};
  const plan=planThaiBodyFrame(pixels,w,h,{head,fullBodyFrame:true,crownFromAlpha:true});
  assert.equal(plan.crown,crown);assert(plan.headroom>=108-1e-8);
  assert(plan.x+plan.coat.left*plan.scale<=0);
  assert(plan.x+(plan.coat.right+1)*plan.scale>=900);
  assert.equal(hash(pixels),before);
  assert.equal(plan.scale,(900+4)/plan.coat.width);
 }
});
