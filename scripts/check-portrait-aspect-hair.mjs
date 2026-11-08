import assert from 'node:assert/strict';
import {portraitAspectRepair} from '../src/portrait-aspect-repair.js';
import {expandPortraitHairProtection} from '../src/portrait-hair-protection.js';
import {boundPortraitNeckAlpha} from '../src/portrait-neck-boundary.js';
import {removePortraitClothingAlpha} from '../src/replace-studio-source.js';
let passed=0;const test=(name,run)=>{run();passed++;console.log('PASS '+name)};
test('repair restores original face aspect along tilted eye axes without clipping any image corner',()=>{
 for(const angle of [0,.25,-.25]){
  const W=300,H=400,d=100,face=[];face[33]={x:.5-Math.cos(angle)*d/2/W,y:.3-Math.sin(angle)*d/2/H};face[263]={x:.5+Math.cos(angle)*d/2/W,y:.3+Math.sin(angle)*d/2/H};
  const t=portraitAspectRepair(.8,.88,face,W,H);assert(t);assert(Math.abs(.88*t.factor-.8)<1e-9);
  const [a,b,c,e,x,y]=t.matrix,point=(X,Y)=>({x:a*X+c*Y+x,y:b*X+e*Y+y});
  for(const [X,Y]of [[0,0],[W,0],[W,H],[0,H]]){const p=point(X,Y);assert(p.x>=-1e-8&&p.y>=-1e-8&&p.x<=t.width&&p.y<=t.height)}
  const p=point(face[33].x*W,face[33].y*H),q=point(face[263].x*W,face[263].y*H);assert(Math.abs(Math.hypot(p.x-q.x,p.y-q.y)-d)<1e-8);
 }
 assert.equal(portraitAspectRepair(.8,.805,[],300,400),null);assert.equal(portraitAspectRepair(null,.9,[],300,400),null);
});
test('outer shoulder hair edges mislabelled as clothing survive cleanup while dissimilar clothing and skin are not grown into',()=>{
 const W=30,H=40,N=W*H,p=new Uint8ClampedArray(N*4),hair=new Uint8ClampedArray(N*4),skin=new Uint8ClampedArray(N*4),clothing=new Uint8ClampedArray(N*4);
 for(let y=10;y<30;y++)for(let x=2;x<8;x++){const j=(y*W+x)*4;p.set([40,30,25,255],j);if(y<26)hair[j+3]=255;else clothing[j+3]=255;}
 for(let y=20;y<36;y++)for(let x=9;x<26;x++){const j=(y*W+x)*4;p.set([200,170,150,255],j);skin[j+3]=255;clothing[j+3]=255;}
 const grown=expandPortraitHairProtection(p,hair,skin,W,H,4),protectedHair=new Uint8ClampedArray(hair);
 for(let i=0;i<N;i++)if(grown[i])protectedHair[i*4+3]=255;
 const before=new Uint8ClampedArray(p);removePortraitClothingAlpha(p,clothing,skin,protectedHair,W,H,18);
 for(let y=26;y<30;y++)assert.equal(p[(y*W+3)*4+3],255);
 assert.equal(grown[30*W+12],0);assert.deepEqual(p,before);
});
test('skin-only neck boundary retains unlabelled long hair outside the backing and removes confirmed outer skin, without changing RGB',()=>{
 const W=180,H=240,N=W*H,p=new Uint8ClampedArray(N*4),hair=new Uint8ClampedArray(N*4),skin=new Uint8ClampedArray(N*4),face=[];
 for(let i=0;i<N;i++)p.set([170,130,110,255],i*4);
 face[33]={x:65/W,y:50/H};face[263]={x:115/W,y:50/H};face[152]={x:90/W,y:105/H};
 for(let y=0;y<H;y++)for(let x=50;x<130;x++)skin[(y*W+x)*4+3]=255;
 const before=new Uint8ClampedArray(p);assert(boundPortraitNeckAlpha(p,hair,W,H,face,{skin}));
 assert.equal(p[(220*W+10)*4+3],255);assert.equal(p[(220*W+90)*4+3],0);
 for(let i=0;i<N;i++)assert.deepEqual(p.subarray(i*4,i*4+3),before.subarray(i*4,i*4+3));
});
console.log(JSON.stringify({passed,noAIRequests:true}));
