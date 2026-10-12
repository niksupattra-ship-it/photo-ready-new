import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {layerAxes,layerToScene,sceneToLayer,squeezeTransform,squeezePointer} from './src/studio-transform.js';
import {headPose,syncHairAttachments,syncHairPairTransforms} from './src/hair-preview-fit.js';
import {brushSceneRegion} from './src/studio-pixel-eraser.js';
const close=(a,b)=>{assert.ok(Math.abs(a.x-b.x)<1e-7);assert.ok(Math.abs(a.y-b.y)<1e-7)};
const box={x:260,y:140,w:350,h:540};
for(const rotation of [-31,0,39]){
 const l={id:'head',x:17,y:-24,scale:1.2,rotation,squeezeX:.8,squeezeY:1.1};
 test(`picking coordinates round-trip through independent scales at ${rotation}`,()=>{
  for(const p of [{x:300,y:150},{x:600,y:650}])close(sceneToLayer(l,layerToScene(l,p)),p);
 });
 for(const [axis,side] of [['x','left'],['x','right'],['y','top']])test(`${side} squeeze preserves the opposite edge at ${rotation}`,()=>{
  const start={x:side==='right'?box.x+box.w:side==='left'?box.x:box.x+box.w/2,y:axis==='y'?box.y:box.y+box.h/2};
  const target={...start,[axis]:start[axis]+(side==='right'?-1:1)*(axis==='x'?box.w:box.h)*.25};
  const patch=squeezePointer(l,box,axis,side,layerToScene(l,start),layerToScene(l,target)),next={...l,...patch};
  close(layerToScene(next,start),layerToScene(l,target));
  const anchor={x:side==='left'?box.x+box.w:side==='right'?box.x:box.x+box.w/2,y:axis==='y'?box.y+box.h:box.y+box.h/2};
  close(layerToScene(l,anchor),layerToScene(next,anchor));
  assert.equal(next[axis==='x'?'squeezeY':'squeezeX'],l[axis==='x'?'squeezeY':'squeezeX']);
 });
 test(`scaled/rotated dirty regions enclose their native tile at ${rotation}`,()=>{
  const f={x:100,y:100,w:500,h:800},surface={width:1000,height:1600},display={width:1800,height:2400},rect={x:200,y:200,w:64,h:64};
  const region=brushSceneRegion(rect,{...l,sourceFrame:f},surface,display);
  for(const x of [rect.x,rect.x+rect.w])for(const y of [rect.y,rect.y+rect.h]){const p=layerToScene(l,{x:f.x+x/surface.width*f.w,y:f.y+y/surface.height*f.h});p.x*=2;p.y*=2;if(p.x<0||p.x>display.width||p.y<0||p.y>display.height)continue;assert.ok(p.x>=region.x&&p.x<=region.x+region.w);assert.ok(p.y>=region.y&&p.y<=region.y+region.h)}
 });
}
test('long front and rear squeeze together without moving the middle face',()=>{
 const head={id:'head',x:0,y:0,scale:1,rotation:15},front={id:'front',hairHeadId:'head',hairId:'hair-02',hairLinked:true,...headPose(head)},back={...front,id:'back'};
 const next=syncHairPairTransforms([back,head,front],new Map([['front',squeezeTransform(front,box,'x',.7)]]));
 assert.equal(next[1],head);assert.equal(next[0].squeezeX,.7);assert.equal(next[2].squeezeX,.7);close(next[0],next[2]);
});
test('head axis transforms keep attached hair in the same face coordinates',()=>{
 const head={id:'head',x:20,y:10,scale:1,rotation:21},hair={id:'hair',hairHeadId:'head',hairHeadPose:headPose(head),...headPose(head)};
 const changed={...head,...squeezeTransform(head,box,'y',.8)},next=syncHairAttachments([changed,hair]);
 close(next[1],changed);assert.equal(next[1].squeezeY,.8);assert.equal(next[1].scale,changed.scale);
});
test('a background layer and transparent object holes do not intercept picking',()=>{
 const editor=fs.readFileSync(new URL('./src/studio-editor.jsx',import.meta.url),'utf8');
 const start=editor.indexOf(' const hitPart='),end=editor.indexOf(' const selectCanvasPart=',start);
 const bg={id:'bg',kind:'background',visible:true,opacity:1,x:0,y:0,scale:1,rotation:0};
 const head={...bg,id:'head',kind:'head',sourceFrame:{x:250,y:200,w:400,h:500},squeezeX:.8,squeezeY:1.1};
 const buffer={width:400,height:500,getContext:()=>({getImageData:(x,y)=>({data:[0,0,0,x<100?255:0]})})};
 const ctx={state:{current:[bg,head]},assets:{current:new Map([['head',{buffer}],['bg',{buffer:{width:900,height:1200,getContext:()=>{throw Error('Background must be ignored')}}}]])},layerKind:l=>l.kind,sceneToLayer,W:900,H:1200};
 const hit=vm.runInNewContext(editor.slice(start,end)+'\nhitPart',ctx);
 assert.equal(hit(layerToScene(head,{x:280,y:300})).id,'head');assert.equal(hit(layerToScene(head,{x:500,y:300})),null);assert.equal(hit({x:15,y:15}),null);
});
