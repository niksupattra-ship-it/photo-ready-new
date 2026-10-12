import assert from 'node:assert/strict';
import test from 'node:test';
import {eraseUpperHairExcess} from './src/upper-hair-eraser.js';

const W=96,H=100;
const index=(x,y)=>(y*W+x)*4;
function fixture(){
 const portrait=new Uint8ClampedArray(W*H*4),overlay=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)portrait.set([x,y,77,255],index(x,y));
 for(let y=20;y<39;y++)for(let x=18;x<=78;x++)overlay.set([20,30,40,255],index(x,y));
 const face=[];for(const [i,x,y] of [[33,28,60],[263,68,60],[10,48,42],[127,20,54],[356,76,54]])face[i]={x:x/W,y:y/H};
 return {portrait,overlay,face,labels:{data:new Uint8Array(W*H).fill(1),width:W,height:H}};
}
const erase=f=>eraseUpperHairExcess(f.portrait,f.overlay,W,H,f.face,f.labels);
const pixel=(pixels,x,y)=>pixels.slice(index(x,y),index(x,y)+4);

test('the eraser clears upper excess, softly fades at the top edge, and preserves both inputs',()=>{
 const f=fixture(),original=new Uint8ClampedArray(f.portrait),overlay=new Uint8ClampedArray(f.overlay),out=erase(f);
 assert.equal(out[index(48,23)+3],0);
 const fade=[24,25,26,27,28].map(y=>out[index(48,y)+3]);
 assert.ok(fade[0]>0&&fade[0]<fade[1]&&fade[1]<fade[2]&&fade[2]<fade[3]);
 assert.equal(fade[3],255);assert.equal(fade[4],255);
 assert.deepEqual(f.portrait,original);assert.deepEqual(f.overlay,overlay);
 for(let j=0;j<out.length;j+=4)assert.deepEqual(out.slice(j,j+3),original.slice(j,j+3));
});

test('sides, transparent interior holes, and everything beneath the forehead boundary stay exact',()=>{
 const f=fixture();f.overlay.fill(0,index(48,32),index(48,32)+4);
 const out=erase(f);
 for(const [x,y] of [[10,8],[10,30],[48,32],[48,40],[48,42],[20,54],[76,54],[48,85]])assert.deepEqual(pixel(out,x,y),pixel(f.portrait,x,y));
 for(let y=40;y<H;y++)for(let x=0;x<W;x++)assert.deepEqual(pixel(out,x,y),pixel(f.portrait,x,y));
});

test('the upper contour follows each column instead of clipping to one horizontal bound',()=>{
 const f=fixture();for(let y=20;y<30;y++)for(let x=49;x<=78;x++)f.overlay.fill(0,index(x,y),index(x,y)+4);
 const out=erase(f);
 assert.equal(out[index(30,30)+3],255);
 assert.equal(out[index(65,25)+3],0);
 assert.equal(out[index(65,30)+3],0);
});

for(const category of [2,3,4])test(`category ${category} and its guard remain intact even above the crown`,()=>{
 const f=fixture();f.labels={width:24,height:25,data:new Uint8Array(24*25).fill(1)};
 f.labels.data[2*24+10]=category;
 const out=erase(f);
 for(let y=0;y<20;y++)for(let x=32;x<52;x++)assert.deepEqual(pixel(out,x,y),pixel(f.portrait,x,y));
 assert.equal(out[index(64,8)+3],0,'unprotected crown hair still gets erased');
});

test('background, clothing, and already transparent pixels are never erased',()=>{
 const f=fixture();for(const [x,category] of [[36,0],[40,5]])f.labels.data[8*W+x]=category;
 f.portrait[index(44,8)+3]=0;
 const out=erase(f);
 for(const x of [36,40,44])assert.deepEqual(pixel(out,x,8),pixel(f.portrait,x,8));
});

test('a semitransparent strand receives proportional soft erasure without recoloring',()=>{
 const f=fixture();f.portrait[index(48,25)+3]=100;
 const out=erase(f);assert.deepEqual(pixel(out,48,25),new Uint8ClampedArray([48,25,77,50]));
});

for(const degrees of [-25,25])test(`upper-only protection follows a head tilted ${degrees} degrees`,()=>{
 const f=fixture(),angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 const rotate=(x,y)=>({x:48+(x-48)*c-(y-60)*s,y:60+(x-48)*s+(y-60)*c});
 f.face=f.face.map(p=>{const q=rotate(p.x*W,p.y*H);return {x:q.x/W,y:q.y/H}});
 f.overlay.fill(0);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const u=(x-48)*c+(y-60)*s,v=-(x-48)*s+(y-60)*c;
  if(Math.abs(u)<=25&&v>=-40&&v<=-25)f.overlay.set([20,30,40,255],index(x,y));
 }
 const out=erase(f),top=rotate(48,12),forehead=rotate(48,43),ear=rotate(20,54);
 assert.equal(out[index(Math.round(top.x),Math.round(top.y))+3],0);
 for(const q of [forehead,ear])assert.deepEqual(pixel(out,Math.round(q.x),Math.round(q.y)),pixel(f.portrait,Math.round(q.x),Math.round(q.y)));
 let changed=0;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(out[index(x,y)+3]!==f.portrait[index(x,y)+3]){
  changed++;assert.ok(-(x-48)*s+(y-60)*c<-20,'no erasure can cross the rotated forehead boundary');
 }
 assert.ok(changed>0);
});

test('switching contours from the original pixels restores hair required by a taller style',()=>{
 const f=fixture(),first=erase(f),taller={...f,overlay:new Uint8ClampedArray(f.overlay)};
 for(let y=10;y<20;y++)for(let x=18;x<=78;x++)taller.overlay.set([20,30,40,255],index(x,y));
 const next=erase(taller);assert.equal(first[index(48,15)+3],0);assert.equal(next[index(48,15)+3],255);
});

test('missing detection or crown data fails before touching the original pixels',()=>{
 const f=fixture(),original=new Uint8ClampedArray(f.portrait);
 assert.throws(()=>erase({...f,labels:null}));
 assert.throws(()=>erase({...f,face:[]}));
 assert.throws(()=>erase({...f,overlay:new Uint8ClampedArray(W*H*4)}));
 assert.deepEqual(f.portrait,original);
});

test('40% extra removal is measured from the actual excess in each column',()=>{
 const f=fixture();
 // Both new contours start at y=20. Original excess is 20 pixels on the left
 // and 10 on the right, so the new soft boundaries are y=28 and y=24.
 for(let y=0;y<10;y++)f.portrait[index(65,y)+3]=0;
 const out=erase(f);
 assert.equal(out[index(30,25)+3],128,'20px excess adds exactly 8px of clearance');
 assert.equal(out[index(65,21)+3],128,'10px excess adds exactly 4px of clearance');
 assert.equal(out[index(65,25)+3],255,'a smaller excess cannot authorize the larger clearance');
});

test('a column with no original upper excess receives no extra removal',()=>{
 const f=fixture();for(let y=0;y<22;y++)f.portrait[index(48,y)+3]=0;
 const out=erase(f);
 for(let y=0;y<H;y++)assert.deepEqual(pixel(out,48,y),pixel(f.portrait,48,y));
});

test('the 40% clearance stops at skin even inside the newly extended band',()=>{
 const f=fixture();f.labels.data[25*W+48]=3;
 const out=erase(f);
 for(let y=23;y<=27;y++)assert.deepEqual(pixel(out,48,y),pixel(f.portrait,48,y));
 assert.equal(out[index(65,23)+3],0);
});
