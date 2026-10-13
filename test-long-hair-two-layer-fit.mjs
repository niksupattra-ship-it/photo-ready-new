import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {eraseLongHairInner,pushLongHairRear,longHairWarpTarget} from './src/long-hair-two-layer-fit.js';
import {createTwoLayerHairPreview} from './src/hair-preview-fit.js';

function fixture(angle=0,{missingEar=false,asymmetric=false,step=false,extraDeep=false}={}){
 const w=160,h=extraDeep?270:190,cx=80,cy=60,c=Math.cos(angle),s=Math.sin(angle),face=[],hair=new Uint8ClampedArray(w*h*4),skin=new Uint8ClampedArray(w*h*4),person=new Uint8ClampedArray(w*h*4),guide=new Uint8ClampedArray(w*h*4);
 const world=(u,v)=>({x:cx+u*c-v*s,y:cy+u*s+v*c}),local=(x,y)=>({u:(x-cx)*c+(y-cy)*s,v:-(x-cx)*s+(y-cy)*c});
 for(const [id,u,v] of [[33,-23,0],[263,23,0],[127,-31,-3],[356,31,2],[234,-30,0],[454,30,0],[10,0,-32],[152,0,65]]){const p=world(u,v);face[id]={x:p.x/w,y:p.y/h}}
 const edge=(v,side)=>{let r=v<10?29+2*Math.sin(v/8):v<50?29-(v-10)*.12:v<70?24.2-(v-50)*.4:16.2+(v-70)*.13;if(asymmetric&&side<0)r-=4;return step?Math.round(r/3)*3:r};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const q=local(x,y),u=q.u,v=q.v,j=(y*w+x)*4;
  if(v>=-32&&v<=(extraDeep?180:112)&&Math.abs(u)<=edge(v,Math.sign(u))){skin.set([255,255,255,255],j);person.set([180+x%25,135+y%20,115,255],j)}
  const inner=38+Math.sin(v/15)*1.5,outer=59-v*.025,earNotch=missingEar&&u<0&&v>=0&&v<=7;
  if(Math.abs(u)<=43&&v>=-50&&v<=-15||Math.abs(u)>=inner&&Math.abs(u)<=outer&&v>-15&&v<=(extraDeep?200:120)&&!earNotch){hair.set([20+x%30,10+y%25,15,255],j);guide.set([255,255,255,255],j)}
 }
 const at=(u,v)=>{const p=world(u,v);return (Math.round(p.y)*w+Math.round(p.x))*4};
 return {w,h,face,hair,skin,person,guide,local,world,at};
}
for(const angle of [-.3,0,.3])test(`front inner eraser follows ears/face/neck/shoulders at ${angle}, preserving all RGB and upper hair`,()=>{
 const f=fixture(angle,{step:true}),original=new Uint8ClampedArray(f.hair);
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){const q=f.local(x,y);if(q.v>-10&&q.v<115&&Math.abs(q.u)<43)f.hair.set([32,22,18,255],(y*f.w+x)*4)}
 const before=new Uint8ClampedArray(f.hair),out=eraseLongHairInner(f.hair,f.skin,f.person,f.w,f.h,f.face);let erased=0,graded=0;
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){const j=(y*f.w+x)*4,q=f.local(x,y);assert.deepEqual(out.slice(j,j+3),before.slice(j,j+3));if(q.v<-12||Math.abs(q.u)>43)assert.deepEqual(out.slice(j,j+4),before.slice(j,j+4));if(out[j+3]<before[j+3])erased++;if(out[j+3]>0&&out[j+3]<255)graded++}
 for(const [u,v] of [[0,30],[0,40],[0,80],[0,105]])assert.equal(out[f.at(u,v)+3],0,'all lower inner portrait regions are exposed');assert.ok(erased>100&&graded>100);assert.deepEqual(f.hair,before);assert.equal(original.length,out.length);
});
for(const angle of [-.3,0,.3])test(`rear liquify closes visible gaps at ${angle} while the outer silhouette/crown and face stay exact`,()=>{
 const f=fixture(angle),before=new Uint8ClampedArray(f.hair),front=eraseLongHairInner(f.hair,f.skin,f.person,f.w,f.h,f.face),result=pushLongHairRear(f.hair,front,f.person,f.skin,f.guide,f.w,f.h,f.face);
 assert.ok(result.report.detected>0);assert.equal(result.report.remaining,0,JSON.stringify(result.report));assert.ok(result.report.adjusted);let moved=0;
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){const j=(y*f.w+x)*4,q=f.local(x,y);if(q.v<-8||Math.abs(q.u)>58)assert.deepEqual(result.pixels.slice(j,j+4),before.slice(j,j+4),'pinned crown and far outer edge');if(before[j+3]===255&&result.pixels[j+3]===255&&result.pixels[j]!==before[j])moved++}
 assert.ok(moved>0,'existing dense hair is actually deformed, not just a copied strip added to empty pixels');assert.deepEqual(f.hair,before);assert.deepEqual(f.person,fixture(angle).person);
});
test('a complete rear opening at one ear is closed with thick lower hair, independently of the other side',()=>{
 const f=fixture(0,{missingEar:true}),front=eraseLongHairInner(f.hair,f.skin,f.person,f.w,f.h,f.face),result=pushLongHairRear(f.hair,front,f.person,f.skin,f.guide,f.w,f.h,f.face);assert.ok(result.report.detected>0);assert.equal(result.report.remaining,0,JSON.stringify(result.report));for(const [u,v] of [[-33,2],[-34,5]])assert.ok(result.pixels[f.at(u,v)+3]>=248);
});
test('different left and right ear/neck widths get different local deformations',()=>{
 const f=fixture(0,{asymmetric:true}),front=eraseLongHairInner(f.hair,f.skin,f.person,f.w,f.h,f.face),result=pushLongHairRear(f.hair,front,f.person,f.skin,f.guide,f.w,f.h,f.face);assert.equal(result.report.remaining,0);assert.notEqual(result.profiles[0][20].target,result.profiles[1][20].target);
});

test('gap closing continues to the actual deep neck/shoulder skin instead of stopping at an assumed chin offset',()=>{
 const f=fixture(0,{extraDeep:true}),front=eraseLongHairInner(f.hair,f.skin,f.person,f.w,f.h,f.face),result=pushLongHairRear(f.hair,front,f.person,f.skin,f.guide,f.w,f.h,f.face);assert.equal(result.report.remaining,0,JSON.stringify(result.report));for(const u of [-34,34])assert.ok(result.pixels[f.at(u,170)+3]>=248);assert.deepEqual(f.person,fixture(0,{extraDeep:true}).person);
});
test('the final composite, not the erased front opening alone, determines whether a gap needs filling',()=>{
 const f=fixture(),front=new Uint8ClampedArray(f.hair.length);for(let j=0;j<f.person.length;j+=4)f.person[j+3]=255;
 const result=pushLongHairRear(f.hair,front,f.person,f.skin,f.guide,f.w,f.h,f.face);assert.equal(result.report.detected,0);assert.equal(result.report.adjusted,false);assert.equal(result.report.unavailable,false);assert.deepEqual(result.pixels,f.hair);
});

test('the inner ear cleanup preserves the selected crown and central designed fringe',()=>{
 const f=fixture();for(let v=-16;v<=8;v++)for(let u=-8;u<=8;u++)f.hair.set([24,16,12,255],f.at(u,v));const before=new Uint8ClampedArray(f.hair),out=eraseLongHairInner(f.hair,f.skin,f.person,f.w,f.h,f.face);for(let v=-16;v<=8;v++)for(let u=-8;u<=8;u++){const j=f.at(u,v);assert.deepEqual(out.slice(j,j+4),before.slice(j,j+4))}
});
test('skin-coloured or unclassified PNG pixels cannot supply rear hair',()=>{
 const f=fixture(),front=eraseLongHairInner(f.hair,f.skin,f.person,f.w,f.h,f.face);f.guide.fill(0);const original=new Uint8ClampedArray(f.hair),result=pushLongHairRear(f.hair,front,f.person,f.skin,f.guide,f.w,f.h,f.face);assert.equal(result.report.adjusted,false);assert.ok(result.report.remaining>0);assert.equal(result.report.unavailable,true);assert.deepEqual(result.pixels,original);
});
test('rear hair behind an opaque face cannot cover eyes, brows or change visible skin',()=>{
 const f=fixture(),front=eraseLongHairInner(f.hair,f.skin,f.person,f.w,f.h,f.face),result=pushLongHairRear(f.hair,front,f.person,f.skin,f.guide,f.w,f.h,f.face);
 for(const [u,v] of [[-15,0],[15,0],[-15,10],[15,10],[0,30],[0,85]]){const j=f.at(u,v);assert.equal(f.person[j+3],255);assert.equal(front[j+3],0);assert.equal(f.person[j],fixture().person[j]);assert.ok(result.pixels[j+3]>=0)}
});
class Surface{constructor(w,h,pixels){this.width=w;this.height=h;this.data=pixels?new Uint8ClampedArray(pixels):new Uint8ClampedArray(w*h*4)}toDataURL(){return new Surface(this.width,this.height,this.data)}getContext(){const c=this;return {drawImage:s=>{c.data.set(s.data)},getImageData:()=>({data:new Uint8ClampedArray(c.data)}),putImageData:p=>{c.data.set(p.data)}}}}
test('new long path begins with identical front/rear placement and only erases front; rear waits for the actual middle photograph',()=>{
 const f=fixture(),make=(w,h)=>new Surface(w,h),placed=new Surface(f.w,f.h,f.hair),skin=new Surface(f.w,f.h,f.skin),person=new Surface(f.w,f.h,f.person),layers=createTwoLayerHairPreview(placed,skin,f.face,f.w,f.h,make,{portrait:person,longContour:true,rearHairGuide:new Surface(f.w,f.h,f.guide)});assert.deepEqual(layers.back.data,f.hair);assert.deepEqual(layers.front.data,eraseLongHairInner(f.hair,f.skin,f.person,f.w,f.h,f.face));assert.equal(layers.gapReport,null);assert.deepEqual(person.data,f.person);
});
const pair=[{id:'back',kind:'hair-preview',hairRole:'back',hairHeadId:'head',hairId:'hair-01'},{id:'head',kind:'head'},{id:'front',kind:'hair-preview',hairRole:'front',hairHeadId:'head',hairId:'hair-01'}];
test('long front eraser selection switches to the matching rear for liquify, without changing short hair or other layers',()=>{
 assert.equal(longHairWarpTarget(pair,'front'),pair[0]);assert.equal(longHairWarpTarget(pair,'back'),pair[0]);assert.equal(longHairWarpTarget(pair,'head'),pair[1]);assert.equal(longHairWarpTarget(pair.filter(l=>l.id!=='back'),'front'),null);for(const id of ['hair-18','hair-21','manhair-01']){const short={...pair[2],hairId:id};assert.equal(longHairWarpTarget([short],short.id),short)}
});
test('invalid contour/portrait data fails without modifying the inputs',()=>{const f=fixture(),before=new Uint8ClampedArray(f.hair);assert.throws(()=>eraseLongHairInner(f.hair,f.skin,new Uint8Array(1),f.w,f.h,f.face));assert.throws(()=>pushLongHairRear(f.hair,f.hair,f.person,f.skin,f.guide,f.w,f.h,[]));assert.deepEqual(f.hair,before)});

test('a transparent eye in the middle photograph is rejected instead of showing rear hair or painting new skin',()=>{
 const f=fixture(),j=f.at(-23,0);f.person[j+3]=0;const before=new Uint8ClampedArray(f.person),hair=new Uint8ClampedArray(f.hair);assert.throws(()=>pushLongHairRear(f.hair,f.hair,f.person,f.skin,f.guide,f.w,f.h,f.face),/ช่องโปร่ง/);assert.deepEqual(f.person,before);assert.deepEqual(f.hair,hair);
});

test('actual Studio warp guard redirects front selection before any front pixels are modified',()=>{
 const code=fs.readFileSync(new URL('./src/studio-editor.jsx',import.meta.url),'utf8'),start=code.indexOf(' const warp=(p,last)=>'),end=code.indexOf(' const resetWarp=',start);let selected=null,calls=0,status='';
 const context={state:{current:pair.map(l=>({...l,visible:true,locked:false}))},selectedRef:{current:'front'},gesture:{current:{layer:{id:'front'}}},isSingleLayerHair:id=>id==='hair-18',longHairWarpTarget,setSelected:id=>selected=id,setStatus:s=>status=s,assets:{current:{get:()=>{calls++;throw Error('front pixel access forbidden')}}}};
 const warp=vm.runInNewContext(code.slice(start,end)+'\nwarp',context);warp({x:0,y:0},{x:1,y:1});assert.equal(selected,'back');assert.equal(calls,0);assert.match(status,/ด้านหลัง/);
});

test('the Studio warp-selection effect changes long front to rear and keeps short/head selections unchanged',()=>{
 const code=fs.readFileSync(new URL('./src/studio-editor.jsx',import.meta.url),'utf8'),start=code.indexOf(" useEffect(()=>{if(tool!=='warp'||brushSession.current?.awaitingLayer)return;const target=longHairWarpTarget"),end=code.indexOf('\n const warp=',start),effect=code.slice(start,end);assert.ok(start>0);
 for(const [tool,selection,wanted] of [['erase','front',null],['warp','front','back'],['warp','head',null],['warp','back',null]]){let selected=null;vm.runInNewContext(effect,{brushSession:{current:null},tool,selected:selection,revision:0,state:{current:pair},longHairWarpTarget,useEffect:fn=>fn(),setSelected:id=>selected=id,setStatus:()=>{}});assert.equal(selected,wanted)}
});

for(const available of [true,false])test(`live finishing liquifies only the rear after receiving the cleaned middle portrait, guide=${available}`,async()=>{
 const f=fixture(),source=fs.readFileSync(new URL('./src/main.jsx',import.meta.url),'utf8'),start=source.indexOf('async function finishStudioHairPreview('),end=source.indexOf('async function prepareStudioHairOverlay(',start),make=(w,h)=>new Surface(w,h),person=new Surface(f.w,f.h,f.person),front=new Surface(f.w,f.h,eraseLongHairInner(f.hair,f.skin,f.person,f.w,f.h,f.face)),back=new Surface(f.w,f.h,f.hair),skin=new Surface(f.w,f.h,f.skin),guide=new Surface(f.w,f.h,available?f.guide:new Uint8ClampedArray(f.guide.length));let calls=0;
 const context={Uint8ClampedArray,studioHairLabels:async()=>({}),canvasFor:make,isSingleLayerHair:()=>false,eraseDetachedUpperHair:p=>p,featherLongCrown:(front,back)=>({front,back}),eraseHeadExteriorExcess:p=>p,fitProcessedForehead:(original,front,w,h,face,labels,current)=>({pixels:current,unresolvedColumns:0}),pushLongHairRear:(original,front,middle,...args)=>{calls++;assert.deepEqual(middle,f.person,'face/skin/neck are already finalized before rear gap detection');return pushLongHairRear(original,front,middle,...args)}};
 const finish=vm.runInNewContext(source.slice(start,end)+'\nfinishStudioHairPreview',context),before=new Uint8ClampedArray(front.data),result=await finish(person,front,back,f.face,'hair-01',{skin,guide});assert.equal(calls,1);assert.deepEqual(result.cleanedHeadSource.data,f.person);assert.deepEqual(result.source.data,before);assert.equal(Boolean(result.hairGapWarning),!available);
 if(available)assert.notDeepEqual(result.backSource.data,f.hair);else assert.deepEqual(result.backSource.data,f.hair);
});

test('radial liquify controls stay ordered and join the pinned outer texture with unit derivative',()=>{
 const f=fixture(0,{missingEar:true}),front=eraseLongHairInner(f.hair,f.skin,f.person,f.w,f.h,f.face),result=pushLongHairRear(f.hair,front,f.person,f.skin,f.guide,f.w,f.h,f.face);
 for(const rows of result.profiles){let prior=-Infinity;for(const row of rows)if(row.inner!==null){assert.ok(row.sourceV>prior);prior=row.sourceV;if(!row.needs)continue;const {target,inner,pin}=row,ratio=(pin-target)/(pin-inner);let last=-Infinity;for(let i=0;i<=100;i++){const t=i/100,source=inner+(pin-inner)*t**ratio;assert.ok(source>=last);last=source}assert.ok(Math.abs(ratio*(pin-inner)/(pin-target)-1)<1e-8)}}
});
