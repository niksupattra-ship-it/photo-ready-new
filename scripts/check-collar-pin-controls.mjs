import assert from 'node:assert/strict';
import sharp from 'sharp';
import {collarControlValues,collarControlPatch,collarNudgePatch,collarSpacingValue,collarSpacingPatch,collarResetPatch,collarPinBounds} from '../src/collar-pin-controls.js';
import {validateSavedProject,makeSavedProject,prepareSavedProject} from '../src/saved-project.js';

let passed=0;
const check=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
const base={id:'collar',name:'เข็มปกคอ',kind:'collar',x:18,y:12,scale:1,rotation:0,opacity:1,visible:true,locked:false};
const near=(actual,expected)=>assert(Math.abs(actual-expected)<.001,`${actual} differs from ${expected}`);
await check('older pairs default to independent 100% scale and zero rotation',()=>{
 assert.deepEqual(collarControlValues(base,'left'),{x:0,y:0,scale:100,rotation:0});assert.deepEqual(collarControlValues(base,'right'),{x:0,y:0,scale:100,rotation:0});
});
await check('a one-pixel left-pin nudge changes no right-pin or pair transform',()=>{
 const patch=collarNudgePatch(base,'left',1,-1);assert.deepEqual(patch,{collarLeftX:1,collarLeftY:-1});
 assert.deepEqual(collarControlValues({...base,...patch},'right'),collarControlValues(base,'right'));assert.equal(base.x,18);
});
await check('pixel nudges follow screen axes even when the pair is rotated and squeezed',()=>{
 for(const rotation of [-110,0,37,90]){
  const layer={...base,rotation,scale:1.4,squeezeX:.7,squeezeY:1.3,collarLeftX:11,collarLeftY:-8};
  const before=collarControlValues(layer,'left'),after=collarControlValues({...layer,...collarNudgePatch(layer,'left',5,-1)},'left');near(after.x-before.x,5);near(after.y-before.y,-1);
 }
});
await check('typed X preserves Y through the inverse pair transform',()=>{
 const layer={...base,rotation:42,scale:1.2,collarRightX:5,collarRightY:7};
 const before=collarControlValues(layer,'right'),after=collarControlValues({...layer,...collarControlPatch(layer,'right','x',23)},'right');near(after.x,23);near(after.y,before.y);
});
await check('scale and angle fields affect only the explicitly selected pin',()=>{
 assert.deepEqual(collarControlPatch(base,'left','scale',125),{collarLeftScale:1.25});assert.deepEqual(collarControlPatch(base,'right','rotation',15),{collarRightRotation:15});
 assert.deepEqual(collarControlPatch(base,'both','scale',125),{scale:1.25});assert.deepEqual(collarControlPatch(base,'both','rotation',15),{rotation:15});
});
await check('spacing changes both pins symmetrically without vertical drift or pair movement',()=>{
 const layer={...base,rotation:35,scale:1.3,squeezeX:.8,squeezeY:1.2,collarLeftX:-3,collarRightX:8,collarLeftY:2,collarRightY:4};
 const left=collarControlValues(layer,'left'),right=collarControlValues(layer,'right');
 const next={...layer,...collarSpacingPatch(layer,collarSpacingValue(layer)+10)},a=collarControlValues(next,'left'),b=collarControlValues(next,'right');
 near(a.x-left.x,-5);near(b.x-right.x,5);near(a.y,left.y);near(b.y,right.y);near((a.x+b.x)/2,(left.x+right.x)/2);assert.equal(next.x,layer.x);
});
await check('resetting one side preserves every opposite-side and pair setting',()=>{
 const layer={...base,collarLeftX:4,collarLeftY:2,collarLeftScale:1.2,collarLeftRotation:15,collarRightX:8,collarRightY:9,collarRightScale:.8,collarRightRotation:-20};
 const next={...layer,...collarResetPatch('left')};assert.deepEqual(collarControlValues(next,'left'),{x:0,y:0,scale:100,rotation:0});assert.deepEqual(collarControlValues(next,'right'),collarControlValues(layer,'right'));assert.equal(next.rotation,layer.rotation);assert.equal(next.x,layer.x);
});
await check('part bounds scale and rotate around the pin center rather than the image center',()=>{
 const bounds={x:300,y:400,w:20,h:40},rotated=collarPinBounds(bounds,{...base,collarLeftX:5,collarLeftScale:1.5,collarLeftRotation:90},'left');near(rotated.w,60);near(rotated.h,30);near(rotated.x+rotated.w/2,315);near(rotated.y+rotated.h/2,420);
});
await check('invalid inputs cannot inject non-finite or out-of-range new transforms',()=>{
 assert.deepEqual(collarControlPatch(base,'left','scale',NaN),{});assert.deepEqual(collarSpacingPatch(base,Infinity),{});assert.deepEqual(collarControlPatch(base,'left','scale',999),{collarLeftScale:3});assert.deepEqual(collarControlPatch(base,'right','rotation',-999),{collarRightRotation:-180});
});
const bytes=await sharp({create:{width:12,height:16,channels:4,background:'#b09030'}}).png().toBuffer(),png='data:image/png;base64,'+bytes.toString('base64');
const layer={...base,source:png,collarParts:{left:png,right:png},collarLeftScale:1.25,collarRightScale:.8,collarLeftRotation:16,collarRightRotation:-23,collarLeftX:5,collarLeftY:6,collarRightX:8,collarRightY:9};
const project={format:'idprom-studio',version:1,width:900,height:1200,layers:[layer]};
await check('project save/open retains independent angles, sizes, positions and original part pixels',async()=>{
 const saved=await makeSavedProject(project),restored=await prepareSavedProject(JSON.parse(JSON.stringify(saved)),{decode:async()=>({width:12,height:16})});assert.deepEqual(restored.project.layers[0],layer);
});
await check('project validation rejects corrupt pin transforms while accepting older pairs',()=>{
 validateSavedProject({...project,layers:[{...base,source:png}]});
 for(const [key,value] of [['collarLeftScale',NaN],['collarRightScale',4],['collarLeftRotation',Infinity],['collarRightRotation',200],['collarLeftX',NaN]])assert.throws(()=>validateSavedProject({...project,layers:[{...layer,[key]:value}]}),/เข็มปกคอ/);
});
console.log(JSON.stringify({passed,scope:'Independent collar geometry and actual saved-project codec; no account, payment or AI operations.'}));
