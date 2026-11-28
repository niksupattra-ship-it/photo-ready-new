import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {planGuideEditLabFrame,frameGuideEditLabForeground} from '../female-guide-edit-lab-frame.js';
import {createFemaleGarmentLayout,femaleLabChinPlacement,measureFemaleNeckSeat} from '../female-portrait-layout.js';

function portrait(width,height,bodyWidth,crown=60,bottom=height){
 const data=Buffer.alloc(width*height*4),rect=(x,y,w,h,color)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)data.set(color,(yy*width+xx)*4);};
 rect(width/2-25,crown,50,90,[190,90,70,255]);rect(width/2-10,crown+90,20,60,[190,90,70,255]);
 rect((width-bodyWidth)/2,crown+140,bodyWidth,bottom-crown-140,[230,230,240,255]);return data;
}
function assertFrame(data,width,height){
 let top=-1;for(let y=0;y<height&&top<0;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>=160){top=y;break;}
 assert(Math.abs(top-height*.07)<=2,`crown ${top}, expected ${height*.07}`);
 for(let y=height-3;y<height;y++)for(const x of [0,1,width-2,width-1])assert(data[(y*width+x)*4+3]>=240,`garment gap at ${x},${y}`);
}

test('different body widths and original top/bottom margins fill both lower corners with 7% headroom using one scale',async()=>{
 for(const [bodyWidth,crown,bottom] of [[180,60,400],[250,30,380],[280,80,400]]){
  const data=portrait(300,400,bodyWidth,crown,bottom),original=Buffer.from(data),plan=planGuideEditLabFrame(data,300,400);
  assert(plan.fullWidth);assert(Math.abs(plan.y+crown*plan.scale-28)<1e-8);assert(plan.cutY<=bottom);
  assert(Math.abs((50*plan.scale)/(bodyWidth*plan.scale)-50/bodyWidth)<1e-12);assert.deepEqual(data,original);
  const png=await sharp(data,{raw:{width:300,height:400,channels:4}}).png().toBuffer();
  const result=await sharp(await frameGuideEditLabForeground(png)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(result.info.width,300);assert.equal(result.info.height,400);assertFrame(result.data,300,400);
 }
});

test('actual government, business and gown garment silhouettes cover the bottom corners without head-only resizing',async()=>{
 for(const path of ['government-uniforms/female-operational.png','job-uniforms/female-job-navy-notch-white-shirt.png','gown-uniforms/kmitl-female.png']){
  const outfit=await readFile(new URL('../public/assets/'+path,import.meta.url)),layout=await createFemaleGarmentLayout(outfit),chin=femaleLabChinPlacement(layout),span=layout.shoulderSpan;
  const svg=Buffer.from(`<svg width="768" height="1024"><rect x="${layout.centerX-span*.175}" y="${chin-span*.465}" width="${span*.35}" height="${span*.465}" fill="#b99080"/><rect x="${layout.centerX-span*.09}" y="${chin-2}" width="${span*.18}" height="${layout.collarTopY-chin+span*.2}" fill="#b99080"/></svg>`);
  const png=await sharp({create:{width:768,height:1024,channels:4,background:'#00000000'}}).composite([{input:svg},{input:layout.nativeForeground}]).png().toBuffer();
  const result=await sharp(await frameGuideEditLabForeground(png)).ensureAlpha().raw().toBuffer({resolveWithObject:true});assertFrame(result.data,768,1024);
 }
});

test('already framed native 2K image retains exact one-pixel texture without a geometry-proxy RGB round-trip',async()=>{
 const width=1500,height=2000,data=Buffer.alloc(width*height*4);
 for(let y=140;y<height;y++)for(let x=y<800?600:0;x<(y<800?900:width);x++){const i=(y*width+x)*4;data[i]=x%2?230:20;data[i+1]=y%2?210:30;data[i+2]=(x+y)%2?190:40;data[i+3]=255;}
 const plan=planGuideEditLabFrame(data,width,height);assert.equal(plan.scale,1);assert.equal(plan.x,0);assert.equal(plan.y,0);
 const png=await sharp(data,{raw:{width,height,channels:4}}).png().toBuffer(),result=await sharp(await frameGuideEditLabForeground(png)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(result.info.width,width);assert.equal(result.info.height,height);assert.deepEqual(result.data,data);
});

test('isolated alpha noise is ignored and impossible narrow masks retain a bounded head-and-bottom fit',()=>{
 const data=portrait(300,400,180);data[(2*300+20)*4+3]=255;assert.equal(planGuideEditLabFrame(data,300,400).crown,60);
 assert.equal(planGuideEditLabFrame(Buffer.alloc(300*400*4),300,400),null);
 const narrow=portrait(300,400,80),plan=planGuideEditLabFrame(narrow,300,400);assert(plan);assert.equal(plan.fullWidth,false);assert(Number.isFinite(plan.scale));assert(Math.abs(plan.y+60*plan.scale-28)<1e-8);
});

test('garment-specific neck seating uses both shoulder roots and never moves into opaque collar',()=>{
 const w=300,h=400,s=200,cx=150,t=100,layout={centerX:cx,shoulderSpan:s,collarTopY:t,measuredCollar:{chinY:99,upperCollarY:100,shoulderWidth:s}};
 const make=(shoulderY,closed)=>{const data=Buffer.alloc(w*h*4);for(let y=t;y<h;y++)for(let x=0;x<w;x++){if((y>=shoulderY&&Math.abs(x-cx)>=35&&Math.abs(x-cx)<=100)||(closed&&y>=t&&Math.abs(x-cx)<=15))data[(y*w+x)*4+3]=255;}return data;};
 const high=measureFemaleNeckSeat(make(110,false),w,h,layout),low=measureFemaleNeckSeat(make(145,false),w,h,layout),closed=measureFemaleNeckSeat(make(145,true),w,h,layout);
 assert(low>high);assert(low<=t+s*.075);assert(closed<=t);
 assert(femaleLabChinPlacement({...layout,neckSeatY:low})>femaleLabChinPlacement({...layout,neckSeatY:high}));
 assert.equal(femaleLabChinPlacement({...layout,neckSeatY:closed}),t);
});

test('shared fill corrects uneven exposure without changing alpha, geometry, lit skin or lower garment',async()=>{
 const {balancePortraitFillPixels,balancePortraitFill}=await import('../female-portrait-fill-light.js');
 const w=300,h=400,source=Buffer.alloc(w*h*4);
 const paint=(x,y,rgb,a=255)=>source.set([...rgb,a],(y*w+x)*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(y>=76&&y<184&&x>=100&&x<200)paint(x,y,x<150?[115,83,67]:[170,130,108]);
  else if(y>=220)paint(x,y,[120,90,65]);
  else if(x>=85&&x<215)paint(x,y,[18,16,15]);
 }
 const original=Buffer.from(source),out=balancePortraitFillPixels(source,w,h);
 const pixel=(b,x,y)=>[...b.subarray((y*w+x)*4,(y*w+x)*4+4)];
 assert(out[(120*w+125)*4]>source[(120*w+125)*4]);
 assert(out[(120*w+125)*4]<=Math.ceil(115*1.12));
 for(const [x,y] of [[175,120],[90,100],[150,240],[2,2]])assert.deepEqual(pixel(out,x,y),pixel(source,x,y));
 for(let i=3;i<out.length;i+=4)assert.equal(out[i],source[i]);
 assert.deepEqual(source,original);
 const png=await sharp(source,{raw:{width:w,height:h,channels:4}}).png().toBuffer();
 const got=await sharp(await balancePortraitFill(png)).ensureAlpha().raw().toBuffer();assert.deepEqual(got,out);
 const uniform=Buffer.alloc(w*h*4);
 for(let i=0;i<uniform.length;i+=4)uniform.set([85,60,45,255],i);
 assert.deepEqual(balancePortraitFillPixels(uniform,w,h),uniform,'Do not brighten evenly lit complexion');
});

test('inner collar registration uses paired fabric edges, refuses blocked openings and preserves original face coverage',async()=>{
 const {measureFemaleInnerCollarSeat,guardCollarRegistration}=await import('../female-portrait-layout.js');
 const w=300,h=400,s=200,cx=150,t=100,layout={centerX:cx,shoulderSpan:s,collarTopY:t,neckSeatY:107,measuredCollar:{chinY:99,upperCollarY:100,shoulderWidth:s}};
 const data=Buffer.alloc(w*h*4);
 for(let y=116;y<150;y++)for(let x=0;x<w;x++)if(Math.abs(x-cx)>=18&&Math.abs(x-cx)<=34)data[(y*w+x)*4+3]=255;
 const seat=measureFemaleInnerCollarSeat(data,w,h,layout);
 assert.equal(seat,121);
 assert.equal(femaleLabChinPlacement({...layout,innerCollarSeatY:seat}),121);
 const empty=Buffer.alloc(data.length);
 assert.equal(measureFemaleInnerCollarSeat(empty,w,h,layout),null);
 for(let y=100;y<150;y++)data[(y*w+cx)*4+3]=255;
 assert.equal(measureFemaleInnerCollarSeat(data,w,h,layout),null);
 const garmentAlpha=Buffer.alloc(w*h),faceWidth=20,faceHeight=40,faceAlpha=Buffer.alloc(faceWidth*faceHeight,255);
 for(let y=115;y<h;y++)for(let x=140;x<160;x++)garmentAlpha[y*w+x]=255;
 assert.equal(guardCollarRegistration({garmentAlpha,faceAlpha,faceWidth,faceHeight,w,h,cx,from:107,to:121}),115);
});
test('government garment guides retain native garment pixels and use bounded measured registration',async()=>{
 const {createFemaleGarmentLayout,femaleLabChinPlacement}=await import('../female-portrait-layout.js');
 for(const name of ['female-senior.png','female-operational.png','female-academic.png']){
  const outfit=await readFile(new URL('../public/assets/government-uniforms/'+name,import.meta.url));
  const layout=await createFemaleGarmentLayout(outfit),old=femaleLabChinPlacement({...layout,innerCollarSeatY:null}),next=femaleLabChinPlacement(layout);
  assert(next>=old);assert(next-old<=layout.shoulderSpan*.12+1);
  console.log('Government collar registration',name,JSON.stringify({old,next,inner:layout.innerCollarSeatY}));
 }
});
