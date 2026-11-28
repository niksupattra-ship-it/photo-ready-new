import test from 'node:test';
import assert from 'node:assert/strict';
import {labLayoutMetrics,compareLabLayout} from '../public/female-lab-layout-metrics.js';
import {measureLayoutPair} from '../public/female-guide-edit-review.js';

function fixture({scale=1,dx=0,dy=0,faceWidth=60,contact=132,cropped=false}={}){
 const width=300*scale,height=300*scale,face=[],x=value=>(value*scale+dx)/width,y=value=>(value*scale+dy)/height;
 for(const [id,px,py]of [[33,138,90],[263,162,90],[234,150-faceWidth/2,100],[454,150+faceWidth/2,100],[152,150,120]])face[id]={x:x(px),y:y(py)};
 const labels=new Uint8Array(width*height);
 for(let row=Math.ceil(contact*scale+dy);row<height;row++)for(let col=cropped?0:Math.ceil(60*scale+dx);col<(cropped?width:240*scale+dx);col++)if(col>=0&&col<width)labels[row*width+col]=4;
 return {face,width,height,labels,labelWidth:width,labelHeight:height};
}
test('layout comparison ignores uniform frame zoom/translation and flags changed face-to-garment or collar placement',()=>{
 const guide=labLayoutMetrics(fixture()),framed=labLayoutMetrics(fixture({scale:2,dx:12,dy:20}));
 assert(guide);assert(framed);assert.equal(compareLabLayout(guide,framed).status,'within_tolerance');
 assert.equal(compareLabLayout(guide,labLayoutMetrics(fixture({faceWidth:84}))).status,'review');
 assert.equal(compareLabLayout(guide,labLayoutMetrics(fixture({contact:160}))).status,'review');
});
test('cropped or missing evidence stays unmeasurable instead of falsely approving a generated portrait',()=>{
 assert.equal(labLayoutMetrics(fixture({cropped:true})),null);
 assert.equal(labLayoutMetrics({...fixture(),face:null}),null);
 assert.equal(compareLabLayout(null,null).status,'unmeasurable');
 assert.equal(compareLabLayout({faceToGarment:0,neckToGarment:0},{faceToGarment:0,neckToGarment:0}).status,'unmeasurable');
});
test('post-result review returns measurements without provider calls and always releases its worker',async()=>{
 let worker,terminated=0;const guide=new Blob(['guide']),result=new Blob(['result']);
 const pending=measureLayoutPair(guide,result,{createWorker:()=>worker={postMessage:data=>{assert.equal(data.guide,guide);assert.equal(data.result,result);},terminate:()=>terminated++}});
 worker.onmessage({data:{comparison:{status:'review'}}});assert.equal((await pending).status,'review');assert.equal(terminated,1);
 const cancelled=new AbortController(),waiting=measureLayoutPair(guide,result,{signal:cancelled.signal,createWorker:()=>({postMessage(){},terminate:()=>terminated++})});cancelled.abort();
 assert.equal((await waiting).status,'unmeasurable');assert.equal(terminated,2);
 assert.equal((await measureLayoutPair(guide,result,{createWorker:()=>{throw Error('not supported')}})).status,'unmeasurable');
});
