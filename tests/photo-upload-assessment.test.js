import test from 'node:test';
import assert from 'node:assert/strict';
import {assessUploadPortrait,assessCloseSelfiePerspective} from '../src/photo-upload-assessment.js';
const face=[{x:.39,y:.16},{x:.61,y:.16},{x:.5,y:.48}];
function evidence(){const pose=[];pose[11]={x:.22,y:.60,visibility:.99};pose[12]={x:.78,y:.60,visibility:.99};return {faces:[face],pose}}
function fullFace({noseZ=-.05,sideToEye=1.95}={}){
 const f=Array.from({length:478},()=>({x:.5,y:.48,z:0}));
 f[33]={x:.39,y:.38,z:0};f[263]={x:.61,y:.38,z:0};
 const eyeSpan=.22;
 f[234]={x:.5-eyeSpan*sideToEye/2,y:.49,z:0};
 f[454]={x:.5+eyeSpan*sideToEye/2,y:.49,z:0};
 f[4]={x:.5,y:.46,z:noseZ};f[1]={x:.5,y:.45,z:noseZ*.9};
 f[152]={x:.5,y:.75,z:0};f[10]={x:.5,y:.12,z:0};
 return f;
}
test('complete visible face is accepted without lower chest or full shoulder pose',()=>{
 assert.equal(assessUploadPortrait(evidence()).status,'pass');
 assert.equal(assessUploadPortrait({faces:[face]}).status,'pass');
 const crop=evidence();crop.pose[11].y=crop.pose[12].y=.97;
 assert.equal(assessUploadPortrait(crop).status,'pass');
});
test('crop or zoom with shoulders cut by photo border is accepted',()=>{
 const crop=evidence();crop.pose[11]={x:-.035,y:.89,visibility:.55};crop.pose[12]={x:.985,y:.89,visibility:.55};
 assert.equal(assessUploadPortrait(crop).status,'pass');
 const noPose=evidence();noPose.pose[11].visibility=.1;
 assert.equal(assessUploadPortrait(noPose).status,'pass');
});
test('face truncation and multiple people still reject',()=>{
 const crop=evidence();crop.faces=[[{x:.39,y:-.02},{x:.61,y:.16},{x:.5,y:.48}]];
 assert.equal(assessUploadPortrait(crop).status,'reject');
 assert.equal(assessUploadPortrait({faces:[face,face]}).status,'reject');
 assert.equal(assessUploadPortrait({faces:[]}).status,'reject');
});
test('synthetic exaggerated close selfie geometry triggers advisory only, not certain-distance claim',()=>{
 const normal=fullFace();
 assert.equal(assessCloseSelfiePerspective(normal).status,'normal');
 assert.equal(assessUploadPortrait({faces:[normal]}).status,'pass');
 const suspect=fullFace({noseZ:-.21,sideToEye:1.55});
 assert.equal(assessCloseSelfiePerspective(suspect).status,'suspected');
 const advice=assessUploadPortrait({faces:[suspect]});
 assert.equal(advice.status,'uncertain');assert.match(advice.uncertain.join(),/มุมกล้อง/);
 const extreme=fullFace({noseZ:-.29,sideToEye:1.42});
 assert.equal(assessCloseSelfiePerspective(extreme).status,'extreme');
 assert.equal(assessUploadPortrait({faces:[extreme]}).status,'uncertain');
});
test('landmark depth missing cannot classify a selfie as distorted',()=>{
 const f=fullFace();delete f[4].z;
 assert.equal(assessCloseSelfiePerspective(f).status,'unknown');
 assert.equal(assessUploadPortrait({faces:[f]}).status,'pass');
 assert.equal(assessUploadPortrait({faces:[[{x:NaN,y:0}]]}).status,'uncertain');
});
test('upload dialog has a review-and-continue option without weakening rejected or unavailable outcomes',async()=>{
 const {readFile}=await import('node:fs/promises');
 const src=await readFile(new URL('../src/photo-upload-scan.js',import.meta.url),'utf8');
 assert(src.includes("if(report.status==='uncertain')button('ใช้รูปนี้ต่อ',()=>finish(true))"));
 assert(src.includes("if(report.status==='pass')"));
 assert(!src.includes('กรุณาใช้รูปที่เห็นคอ ไหล่ และอกส่วนล่าง'));
});
