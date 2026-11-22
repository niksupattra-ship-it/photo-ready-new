import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {
 governmentReferenceLandmarkFit,measureGovernmentShoulderGeometry,
 governmentInsigniaPreset
} from '../src/government-insignia-fit.js';

const asset=name=>new URL('../public/assets/government-uniforms/'+name,import.meta.url).pathname;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const pixels=async image=>{
 const {data,info}=await image.ensureAlpha().raw().toBuffer({resolveWithObject:true});
 return {width:info.width,height:info.height,data};
};
const at=(fit,x,y)=>({x:fit.frame.x+fit.frame.w*x,y:fit.frame.y+fit.frame.h*y});
const near=(actual,expected,tolerance,label)=>assert(Math.abs(actual-expected)<=tolerance,
 `${label}: ${actual.toFixed(1)} instead of ${expected.toFixed(1)}`);
const fixtures=[
 {file:'female-operational-example.jpg',gender:'female',template:'female-operational.png',
  left:{x:156,y:381},right:{x:343,y:379},ribbon:{x:384,y:466,width:100}},
 {file:'male-government-employee-example.jpg',gender:'male',template:'male-government-employee.png',
  left:{x:224,y:376},right:{x:277,y:377},ribbon:{x:355,y:458,width:100}}
];

test('real supplied government portraits use shoulder spans and match their photographed collar/ribbon landmarks',async()=>{
 for(const fixture of fixtures)for(const size of [{width:500,height:681},{width:900,height:1200}]){
  const image=await pixels(sharp(asset(fixture.file)).resize(size.width,size.height,{fit:'fill'}));
  const before=digest(image.data);
  const fit=governmentReferenceLandmarkFit(image,fixture.gender,'/assets/government-uniforms/'+fixture.template);
  assert(fit,fixture.file);
  assert(fit.frame.w>size.width*.82,'The white collar/neck region is not the shoulder span');
  const collar=fit.preset.collar;
  const left=at(fit,collar.left,collar.y),right=at(fit,collar.right,collar.y);
  const ribbon=at(fit,fit.preset.ribbon.x,fit.preset.ribbon.top);
  const sx=size.width/500,sy=size.height/681;
  for(const [name,actual,expected] of [['left',left,fixture.left],['right',right,fixture.right],['ribbon',ribbon,fixture.ribbon]]){
   near(actual.x,expected.x*sx,12*sx,fixture.file+' '+name+' x');
   near(actual.y,expected.y*sy,12*sy,fixture.file+' '+name+' y');
  }
  near(fit.frame.w*fit.preset.ribbon.width,fixture.ribbon.width*sx,14*sx,'Ribbon width');
  assert.equal(fit.collarType,fixture.gender==='male'?'stand':'lapel');
  assert.equal(fit.referenceGeometryVersion,'reference-shoulder-v1','Existing result path must not apply a second size adjustment');
  assert.equal(digest(image.data),before,'Measuring cannot modify the finished portrait pixels');
 }
});

test('one supplied portrait keeps its own placement after wider and narrower scene composition',async()=>{
 const fixture=fixtures[0],template='/assets/government-uniforms/'+fixture.template;
 for(const composition of [{width:700,height:953,left:100,top:100},{width:540,height:735,left:180,top:200}]){
  const portrait=await sharp(asset(fixture.file)).resize(composition.width,composition.height,{fit:'fill'}).png().toBuffer();
  const image=await pixels(sharp({create:{width:900,height:1200,channels:4,background:'#3985ef'}})
   .composite([{input:portrait,left:composition.left,top:composition.top}]));
  const fit=governmentReferenceLandmarkFit(image,'female',template);
  assert(fit,'A visible narrower finished portrait still has measurable shoulders');
  const left=at(fit,fit.preset.collar.left,fit.preset.collar.y);
  const ribbon=at(fit,fit.preset.ribbon.x,fit.preset.ribbon.top);
  const sx=composition.width/500,sy=composition.height/681;
  near(left.x,composition.left+fixture.left.x*sx,14*sx,'Composed collar x');
  near(left.y,composition.top+fixture.left.y*sy,14*sy,'Composed collar y');
  near(ribbon.x,composition.left+fixture.ribbon.x*sx,14*sx,'Composed ribbon x');
  near(ribbon.y,composition.top+fixture.ribbon.y*sy,14*sy,'Composed ribbon y');
 }
});

const jacket=()=>{
 const width=600,height=800,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const light=y>=336&&x>=125&&x<=475,k=(y*width+x)*4;
  data[k]=light?241:44;data[k+1]=light?239:130;data[k+2]=light?238:220;data[k+3]=255;
 }
 return {width,height,data};
};

test('known stable fabric can be ready but unknown or obstructed garment positions require review',()=>{
 const image=jacket(),template='/assets/government-uniforms/female-operational.png';
 const fit=governmentReferenceLandmarkFit(image,'female',template);
 assert(fit);assert.equal(fit.needsReview,false,'Every badge footprint is supported by clear known uniform fabric');
 const unknown=governmentReferenceLandmarkFit(image,'female','/assets/government-uniforms/unregistered.png');
 assert(unknown);assert.equal(unknown.needsReview,true);
 const chest=at(fit,fit.preset.chest.x,fit.preset.chest.y);
 for(let y=Math.round(chest.y-24);y<chest.y+24;y++)for(let x=Math.round(chest.x-24);x<chest.x+24;x++){
  const k=(y*image.width+x)*4;image.data[k]=60;image.data[k+1]=60;image.data[k+2]=65;
 }
 const obstructed=governmentReferenceLandmarkFit(image,'female',template);
 assert(obstructed);assert.equal(obstructed.needsReview,true,'Dark/occluded chest fabric is never declared ready');
});

test('flat white backgrounds and unmeasurable small garments do not invent a shoulder fit',async()=>{
 const white=await pixels(sharp({create:{width:600,height:800,channels:4,background:'#fff'}}));
 assert.equal(measureGovernmentShoulderGeometry(white),null);
 assert.equal(governmentReferenceLandmarkFit(white),null);
 const small=await sharp(asset(fixtures[0].file)).resize(260,354,{fit:'fill'}).png().toBuffer();
 const image=await pixels(sharp({create:{width:900,height:1200,channels:4,background:'#3985ef'}}).composite([{input:small,left:320,top:320}]));
 assert.equal(governmentReferenceLandmarkFit(image),null,'A tiny torso remains in the existing editable fallback');
 assert.deepEqual(governmentInsigniaPreset({w:600},'male'),{
  collar:{left:.418,right:.582,y:.285,width:.071},chest:{x:.27,y:.52,width:.083},ribbon:{x:.76,top:.51,width:.235}
 },'Studio preset is unchanged');
});
