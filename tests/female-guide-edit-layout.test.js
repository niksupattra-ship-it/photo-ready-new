import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {createGuideEditLabBase,guideEditFacePlacement} from '../female-guide-edit-layout.js';
import {createFemaleGarmentLayout,createFemaleLabBase,femaleLabChinPlacement} from '../female-portrait-layout.js';

test('experimental placement changes scale once and reduces only the existing positive chin/collar gap',()=>{
 for(const [chinY,upperCollarY] of [[90,110],[108,110],[112,110]]){
  const layout={shoulderSpan:400,collarTopY:500,measuredCollar:{chinY,upperCollarY,shoulderWidth:200}},original=femaleLabChinPlacement(layout),placement=guideEditFacePlacement(layout);
  assert.equal(placement.width,133);assert.equal(placement.height,177);
  assert(Math.abs(placement.chin-(original+Math.max(0,500-original)*.2))<1e-8);
  if(original<500)assert(Math.abs((500-placement.chin)/(500-original)-.8)<1e-8);else assert.equal(placement.chin,original);
 }
});

function faceBounds(data,width,height){
 let left=width,right=0,top=height,bottom=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;if(data[i]===20&&data[i+1]===130&&data[i+2]===210){left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}}
 return {left,top,right,bottom,width:right-left,height:bottom-top};
}
test('actual guide uniformly places the original face lower while every opaque garment pixel stays fixed',async()=>{
 const face=await sharp({create:{width:150,height:220,channels:4,background:'#1482d2'}}).png().toBuffer();
 for(const path of ['government-uniforms/female-operational.png','job-uniforms/female-job-navy-notch-white-shirt.png','gown-uniforms/kmitl-female.png']){
  const outfit=await readFile(new URL('../public/assets/'+path,import.meta.url)),layout=await createFemaleGarmentLayout(outfit),placement=guideEditFacePlacement(layout);
  const baseline=await sharp(await createFemaleLabBase(outfit,face)).ensureAlpha().raw().toBuffer(),actual=await sharp(await createGuideEditLabBase(outfit,face)).ensureAlpha().raw().toBuffer();
  const oldBox=faceBounds(baseline,768,1024),box=faceBounds(actual,768,1024);
  assert(Math.abs(box.width/oldBox.width-.95)<.01);assert(Math.abs(box.height/oldBox.height-.95)<.01);
  assert(Math.abs(box.width/oldBox.width-box.height/oldBox.height)<.01,'One proportional scale, never a facial aspect-ratio warp');
  assert(Math.abs(box.bottom-placement.chin)<=1);assert(box.bottom>=oldBox.bottom);
  const garment=await sharp(layout.nativeForeground).ensureAlpha().raw().toBuffer();let changed=0;
  for(let i=0;i<garment.length;i+=4)if(garment[i+3]===255&&(actual[i]!==garment[i]||actual[i+1]!==garment[i+1]||actual[i+2]!==garment[i+2]))changed++;
  assert.equal(changed,0,'Collar, shoulders, garment and insignia remain at their exact original coordinates');
 }
});
