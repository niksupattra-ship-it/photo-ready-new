import assert from 'node:assert/strict';
import {roseEyeModel,roseEyeCoordinates,sampleRoseEyeshadow} from '../src/rose-eyeshadow.js';
const lids=[[33,246,161,160,159,158,157,173,133],[263,466,388,387,386,385,384,398,362]],brows=[[70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285]];
function face(){
 const out=Array.from({length:478},()=>({x:.5,y:.5}));
 for(const side of [0,1]){const cx=side?.65:.35,direction=side?-1:1;lids[side].forEach((id,i)=>{const t=i/(lids[side].length-1);out[id]={x:cx+direction*(t-.5)*.18,y:.42-.025*Math.sin(Math.PI*t)}});brows[side].forEach((id,i)=>{out[id]={x:cx+(i/(brows[side].length-1)-.5)*.21,y:.31+.008*Math.sin(i)}})}
 return out;
}
function at(model,u,v){const x=model.x+model.ux*model.span*u,y=model.y+model.uy*model.span*u,position=roseEyeCoordinates(model,x,y);return {x:x+model.nx*(v-position.v)*position.height,y:y+model.ny*(v-position.v)*position.height}}
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS '+name)};
test('both lid centres reflect light with less rose pigment than their inner and outer lid',()=>{
 for(const side of [0,1]){const model=roseEyeModel(face(),900,1200,side),samples=[.22,.5,.78].map(u=>{const p=at(model,u,.3);return sampleRoseEyeshadow(model,p.x,p.y)});assert(samples[1].pigment<Math.min(samples[0].pigment,samples[2].pigment)*.4);assert(samples[1].pearl>.9);assert(samples[0].pearl<samples[1].pearl*.15);assert(samples[2].pearl<samples[1].pearl*.15)}
});
test('rose fades from the lid toward the socket and never extends below the lid or above the brow',()=>{
 for(const width of [192,384,900])for(const side of [0,1]){const model=roseEyeModel(face(),width,width*4/3,side),sample=v=>{const p=at(model,.24,v);return sampleRoseEyeshadow(model,p.x,p.y)};assert(sample(.25).pigment>sample(.8).pigment);assert(sample(.8).pigment>sample(1.05).pigment);assert.equal(sample(1.15).pigment,0);assert.equal(sample(-.05).pigment,0);let last=sample(.5).pigment;for(let v=.51;v<1.12;v+=.01){const next=sample(v).pigment;assert(Math.abs(next-last)<.035,'visible step in upward fade');last=next}}
});
test('tilt, reflection and native resolution retain the same colour and light placement',()=>{
 const original=face(),W=900,H=1200;
 for(const angle of [-.24,.24])for(const mirror of [false,true])for(const side of [0,1]){
  const rotate=p=>{const x=(p.x-.5)*W*(mirror?-1:1),y=(p.y-.5)*H;return {x:(x*Math.cos(angle)-y*Math.sin(angle))/W+.5,y:(x*Math.sin(angle)+y*Math.cos(angle))/H+.5}};
  const transformed=original.map(rotate),a=roseEyeModel(original,W,H,side),b=roseEyeModel(transformed,W,H,side);
  for(const u of [.2,.5,.8])for(const v of [.15,.3,.75]){const p=at(a,u,v),q=rotate({x:p.x/W,y:p.y/H}),one=sampleRoseEyeshadow(a,p.x,p.y),two=sampleRoseEyeshadow(b,q.x*W,q.y*H);assert(Math.abs(one.pigment-two.pigment)<1e-10);assert(Math.abs(one.pearl-two.pearl)<1e-10)}
 }
});
console.log(JSON.stringify({passed,scope:'Anatomical rose gradient, central pearl highlight, smooth upward fade and consistent tilted/mirrored geometry. No provider or pixel renderer.'}));
