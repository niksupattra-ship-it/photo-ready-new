import assert from 'node:assert/strict';
import {planStudioNeckBridge} from '../src/studio-neck-bridge.js';

const colour=(r,g,b)=>({y:.299*r+.587*g+.114*b,cb:-.168736*r-.331264*g+.5*b,cr:.5*r-.418688*g-.081312*b});
function fixture({flare=true,closure=120,offset=-100,chin=100}={}){
 const width=128,height=180,pixels=new Uint8ClampedArray(width*height*4),skin=[200,150,120,255];
 const paint=(x,y,c)=>pixels.set(c,(y*width+x)*4);
 for(let y=20;y<=Math.min(chin,179);y++)for(let x=24;x<=104;x++)paint(x,y,skin);
 for(let y=chin+1;y<height;y++)for(let x=44;x<=84;x++)paint(x,y,skin);
 if(flare)for(let y=Math.max(chin+20,130);y<height;y++)for(let x=29;x<=99;x++)paint(x,y,skin);
 for(let y=chin+5;y<height;y++)for(let x=15;x<=22;x++)paint(x,y,[20,17,18,255]);
 const garmentPixels=new Uint8ClampedArray(width*height*4),opening=[];
 for(let y=60;y<height;y++)for(let x=0;x<width;x++)if(y>=closure||x<=42||x>=86)garmentPixels.set([240,241,242,255],(y*width+x)*4);
 for(let y=70;y<closure;y+=2)opening.push({y,left:42,right:86,centerX:64});
 const rows=[];for(let y=chin+5;y<=Math.min(chin+20,height-1);y+=2)rows.push({y,left:44,right:84});
 const input={portrait:{pixels,width,height},neckProfile:{rows,chin:{x:64,y:chin},faceWidth:80,faceHeight:70,reference:colour(...skin),confidence:1},garment:{pixels:garmentPixels,width,height,opening},headToUniform:[1,0,0,1,0,offset]};
 return{input,pixels,garmentPixels,run:()=>planStudioNeckBridge(input)};
}
let passed=0;
function check(name,run){run();passed++;console.log('PASS '+name)}
check('garment closure is mapped back through the affine transform without moving the protected chin',()=>{
 const f=fixture(),p=f.run();assert(p);assert(p.targetBottom>220&&p.targetBottom<224);assert.equal(p.guard,103.85);assert(p.start>100);assert(p.needsLength);assert(p.flared);
});
check('neck and chest width is capped by the upper neck rather than copied from flared shoulders',()=>{
 const p=fixture().run();assert(p);for(const row of p.profile.rows)assert(row.right-row.left<=p.upperWidth*1.100001);assert(p.connected.some(row=>row.right-row.left>p.upperWidth*1.5));
});
check('neck texture donors stay below the detected chin and within existing source pixels',()=>{
 const p=fixture().run();assert(p.donorTop>p.guard);assert(p.donorBottom<180);assert(p.donorBottom>p.donorTop+4);assert(p.profile.complete);assert(p.profile.rows.length>3);
});
check('existing non-skin hair is excluded from the connected central-neck component',()=>{
 const p=fixture().run();assert(p);assert(p.connected.every(row=>row.left>22));assert(p.isSkin(new Uint8ClampedArray([200,150,120,255]),0));assert(!p.isSkin(new Uint8ClampedArray([20,17,18,255]),0));
});
check('planning never rewrites portrait, hair or original garment pixels',()=>{
 const f=fixture(),portrait=f.pixels.slice(),garment=f.garmentPixels.slice();f.run();assert.deepEqual(f.pixels,portrait);assert.deepEqual(f.garmentPixels,garment);
});
check('a normal complete neck without flare does not add another layer',()=>{
 const f=fixture({flare:false,offset:0});assert.equal(f.run(),null);
});
check('a true chin below the old 82% estimate remains fully protected',()=>{
 const f=fixture({chin:154,offset:-120}),p=f.run();assert(p);assert(p.guard>180*.82);assert(p.donorTop>154);assert(p.start>154);
});
check('missing measurements and reflected or singular transforms do not fabricate a bridge',()=>{
 for(const kind of ['profile','reference','opening','reflection','singular']){const f=fixture();if(kind==='profile')f.input.neckProfile.rows=[];if(kind==='reference')f.input.neckProfile.reference=null;if(kind==='opening')f.input.garment.opening=[];if(kind==='reflection')f.input.headToUniform=[-1,0,0,1,128,-100];if(kind==='singular')f.input.headToUniform=[0,0,0,0,0,0];assert.equal(f.run(),null,kind)}
});
check('an implausibly distant collar does not stretch a neck without bounds',()=>{
 const f=fixture({offset:-500});assert.equal(f.run(),null);
});
console.log(JSON.stringify({passed,scope:'Bounded neck planner, connected-skin protection, true-chin guard, garment affine closure and immutable pixel inputs. Native rendering is checked separately in the actual browser.'}));
