import assert from 'node:assert/strict';
import {faceProportions,compareFaceProportions} from '../src/face-proportion-check.js';
const W=1000,H=1200,face=[];
for(const [id,x,y]of [[33,.35,.35],[263,.65,.35],[152,.5,.78],[234,.22,.46],[454,.78,.46],[172,.28,.68],[397,.72,.68],[1,.5,.5],[13,.5,.64]])face[id]={x,y};
const base=faceProportions(face,W,H);assert(base);
let cases=0;
for(const scale of [.8,1,1.1])for(const degrees of [-20,0,20]){
 const r=degrees*Math.PI/180,changed=face.map(p=>{const x=(p.x-.5)*W*scale,y=(p.y-.5)*H*scale;return {x:.5+(x*Math.cos(r)-y*Math.sin(r))/W,y:.5+(x*Math.sin(r)+y*Math.cos(r))/H}});
 assert(compareFaceProportions(base,faceProportions(changed,W,H)).ok);cases++;
}
for(const [sx,sy]of [[1,1.2],[.8,1],[1.25,1],[1,.8]]){
 const changed=face.map(p=>({x:.5+(p.x-.5)*sx,y:.5+(p.y-.5)*sy}));
 assert(!compareFaceProportions(base,faceProportions(changed,W,H)).ok,'axial stretching should be rejected');cases++;
}
assert(compareFaceProportions(base,faceProportions(face,W*2,H*2)).ok);
console.log(`PASS ${cases+1} face-ratio checks: uniform scale, rotation and native resolution preserve ratios; substantial axial elongation/compression is rejected. Synthetic landmarks, not proof of any individual AI image.`);
