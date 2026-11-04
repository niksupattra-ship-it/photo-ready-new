import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {layerAxes} from '../src/studio-transform.js';

// Execute the production head construction, without calling processing or APIs.
const source=await readFile('src/studio-editor.jsx','utf8');
const start=source.indexOf('const head={...fresh(result.layer)',source.indexOf('let stagedResult;'));
const end=source.indexOf('let next=previous.filter',start);
assert(start>0&&end>start);
const construct=Function('env',`with(env){${source.slice(start,end)}return head}`);
const frame={x:80,y:90,w:320,h:460};
const result={layer:{source:'native-portrait-pixels',sourceFrame:frame,jobId:'same-job',squeezeX:.7,squeezeY:1.2}};
let cases=0;
for(const old of [false,true])for(const [squeezeX,squeezeY]of [[.8,1],[1,1.25],[1.3,.7],[1,1]]){
 const anchor={id:old?'old-head':'suit',x:14,y:23,scale:1.1,rotation:7,squeezeX,squeezeY,opacity:.8};
 const before=JSON.stringify(anchor);
 const head=construct({result,oldHead:old?anchor:null,suit:old?{squeezeX:.4,squeezeY:2}:anchor,fresh:l=>({x:0,y:0,scale:1,rotation:0,...l}),chosenHair:'hair',chosenPortraitMode:'female',sourcePhoto:{},portraitFinishChoice:()=> 'natural'});
 const axes=layerAxes(head);
 assert.equal(axes.x,axes.y,'Generated head must have equal horizontal/vertical scale');
 assert.equal(head.squeezeX,1);assert.equal(head.squeezeY,1);
 for(const key of ['x','y','scale','rotation'])assert.equal(head[key],anchor[key]);
 assert.equal(head.source,result.layer.source);assert.equal(head.sourceFrame,frame);assert.equal(head.jobId,'same-job');
 assert.equal(head.processedOriginalSource,result.layer.source);
 assert.equal(JSON.stringify(anchor),before,'Existing head/outfit must not be mutated');
 if(old)assert.equal(head.id,anchor.id);
 cases++;
}
const head=construct({result,oldHead:null,suit:null,fresh:l=>({x:0,y:0,scale:1,rotation:0,...l}),chosenHair:'',chosenPortraitMode:'male',sourcePhoto:{},portraitFinishChoice:()=> 'natural'});
assert.deepEqual(layerAxes(head),{x:1,y:1});
console.log(`PASS ${cases+1} actual generated-head constructions: no inherited width/height squeeze, native pixels/frame/job preserved, anchor position/scale/rotation retained, old layers unchanged. No AI or services.`);
