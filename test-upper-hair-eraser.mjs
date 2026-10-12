import assert from 'node:assert/strict';
import test from 'node:test';
import {eraseUpperHairExcess,eraseDetachedUpperHair,eraseHeadExteriorExcess} from './src/upper-hair-eraser.js';

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

function cutoutFixture(){
 const f=fixture();f.portrait.fill(0);f.labels.data.fill(0);
 for(let y=25;y<90;y++)for(let x=20;x<=76;x++){
  f.portrait.set([x,y,77,255],index(x,y));f.labels.data[y*W+x]=y<40?1:3;
 }
 return f;
}

test('floating upper fragments are erased even when the semantic model calls them background',()=>{
 const f=cutoutFixture();
 for(let y=7;y<=9;y++)for(let x=43;x<=50;x++)f.portrait.set([30,20,10,220],index(x,y));
 f.portrait.set([30,20,10,4],index(48,5));
 const original=new Uint8ClampedArray(f.portrait),out=erase(f);
 for(let y=7;y<=9;y++)for(let x=43;x<=50;x++)assert.equal(out[index(x,y)+3],0);
 assert.equal(out[index(48,5)+3],0,'low-alpha dust must disappear too');
 assert.deepEqual(pixel(out,48,60),pixel(original,48,60));assert.deepEqual(f.portrait,original);
});

test('detached skin, ear-height fragments and lower portrait pixels remain protected',()=>{
 const f=cutoutFixture();f.portrait.set([210,170,140,255],index(38,8));f.labels.data[8*W+38]=3;
 f.portrait.set([20,15,10,255],index(83,55));
 const out=erase(f);
 for(const [x,y] of [[38,8],[83,55],[48,42],[48,65],[48,85]])assert.deepEqual(pixel(out,x,y),pixel(f.portrait,x,y));
});

test('a floating PNG fragment cannot raise the measured upper contour and shield old hair',()=>{
 const f=fixture();f.overlay.set([20,15,10,255],index(48,5));
 const out=erase(f);assert.equal(out[index(48,10)+3],0,'the contour must come from the main PNG hair mass');
});

test('PNG cleanup removes detached upper arcs while preserving connected strands and lower hair',()=>{
 const f=fixture(),png=new Uint8ClampedArray(f.overlay);
 for(let x=40;x<47;x++)png.set([20,15,10,255],index(x,5));
 png.set([20,15,10,4],index(45,3));
 for(let y=15;y<20;y++)png.set([20,30,40,255],index(65,y));
 png.set([20,30,40,255],index(75,82));
 const original=new Uint8ClampedArray(png),out=eraseDetachedUpperHair(png,W,H,f.face);
 for(let x=40;x<47;x++)assert.equal(out[index(x,5)+3],0);
 assert.equal(out[index(45,3)+3],0);
 for(let y=15;y<20;y++)assert.deepEqual(pixel(out,65,y),pixel(original,65,y),'connected strands keep their exact shape');
 assert.deepEqual(pixel(out,75,82),pixel(original,75,82));
 for(let y=20;y<39;y++)for(let x=18;x<=78;x++)assert.deepEqual(pixel(out,x,y),pixel(original,x,y));
 assert.deepEqual(png,original);
 for(let i=0;i<out.length;i+=4)assert.deepEqual(out.slice(i,i+3),original.slice(i,i+3));
});

test('floating upper debris near the crown side is removed without erasing the lower sides',()=>{
 const f=cutoutFixture();f.portrait.set([20,15,10,255],index(15,7));f.portrait.set([20,15,10,255],index(15,55));
 const out=erase(f);assert.equal(out[index(15,7)+3],0);assert.deepEqual(pixel(out,15,55),pixel(f.portrait,15,55));
});

for(const alpha of [0,120,239])test(`40% extra erasure cannot open a hole under crown alpha ${alpha}`,()=>{
 const f=fixture();f.overlay[index(48,23)+3]=alpha;
 const out=erase(f);assert.deepEqual(pixel(out,48,23),pixel(f.portrait,48,23));
 assert.equal(out[index(50,23)+3],0,'opaque coverage still permits the requested extra erasure');
});

function exteriorFixture(){
 const f=fixture();for(const [id,x,y] of [[152,48,84],[234,24,60],[454,72,60]])f.face[id]={x:x/W,y:y/H};
 for(let y=39;y<92;y++)for(let x=18;x<=78;x++)if(x<=28||x>=68)f.overlay.set([20,30,40,255],index(x,y));
 return f;
}
const exterior=f=>eraseHeadExteriorExcess(f.portrait,f.overlay,W,H,f.face,f.labels);
test('the exterior eraser cleans both sides and below the chin, not only the crown',()=>{
 const f=exteriorFixture(),out=exterior(f);
 for(const [x,y] of [[5,28],[5,60],[90,60],[5,88],[48,98]])assert.equal(out[index(x,y)+3],0);
 for(const [x,y] of [[48,25],[22,58],[73,75]])assert.deepEqual(pixel(out,x,y),pixel(f.portrait,x,y),'selected hair stays protected');
});
test('exterior erasure has a soft inward-to-outward falloff without recoloring either input',()=>{
 const f=exteriorFixture(),portrait=new Uint8ClampedArray(f.portrait),overlay=new Uint8ClampedArray(f.overlay),out=exterior(f);
 const fade=[17,16,15,14].map(x=>out[index(x,28)+3]);assert.ok(fade[0]>fade[1]&&fade[1]>fade[2]&&fade[2]>fade[3]);assert.equal(fade[3],0);
 assert.deepEqual(f.portrait,portrait);assert.deepEqual(f.overlay,overlay);for(let j=0;j<out.length;j+=4)assert.deepEqual(out.slice(j,j+3),portrait.slice(j,j+3));
});
for(const category of [2,3,4,5])test(`exterior erasure protects category ${category} around the head`,()=>{
 const f=exteriorFixture();f.labels.data[60*W+5]=category;const out=exterior(f);assert.deepEqual(pixel(out,5,60),pixel(f.portrait,5,60));
});
test('anatomical guards protect the face and both ears even if detected as hair',()=>{
 const f=exteriorFixture();f.overlay.fill(0,index(20,68),index(20,68)+4);f.overlay.fill(0,index(76,68),index(76,68)+4);
 const out=exterior(f);for(const [x,y] of [[48,60],[48,77],[20,68],[76,68]])assert.deepEqual(pixel(out,x,y),pixel(f.portrait,x,y));
});
test('detached background-labeled head debris is removed, while low detached objects stay untouched',()=>{
 const f=exteriorFixture();f.portrait.fill(0);
 for(let y=20;y<92;y++)for(let x=18;x<=78;x++)f.portrait.set([x,y,77,255],index(x,y));
 for(const [x,y] of [[5,48],[5,98]]){f.portrait.set([10,20,30,255],index(x,y));f.labels.data[y*W+x]=0}
 const out=exterior(f);assert.equal(out[index(5,48)+3],0);assert.deepEqual(pixel(out,5,98),pixel(f.portrait,5,98));
});
for(const angle of [-.3,.3])test(`exterior erasure protects a tilted face and ear frame ${angle}`,()=>{
 const f=exteriorFixture(),c=Math.cos(angle),s=Math.sin(angle);
 const rotate=(x,y)=>({x:48+(x-48)*c-(y-60)*s,y:60+(x-48)*s+(y-60)*c});
 f.face=f.face.map(p=>{const q=rotate(p.x*W,p.y*H);return {x:q.x/W,y:q.y/H}});
 const out=exterior(f),q=rotate(20,68);assert.deepEqual(pixel(out,Math.round(q.x),Math.round(q.y)),pixel(f.portrait,Math.round(q.x),Math.round(q.y)));
});
test('exterior cleanup rejects missing face protection or overlay data before writing pixels',()=>{
 const f=exteriorFixture();delete f.face[152];assert.throws(()=>exterior(f));
 const blank=exteriorFixture();blank.overlay.fill(0);assert.throws(()=>exterior(blank));
});

test('background remnants connected to the portrait are still erased outside the head',()=>{
 const f=exteriorFixture();f.labels.data[48*W+5]=0;
 const out=exterior(f);assert.equal(out[index(5,48)+3],0);
});
