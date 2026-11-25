import test from 'node:test';
import assert from 'node:assert/strict';
import {assessUploadPortrait} from '../src/photo-upload-assessment.js';
const face=[{x:.39,y:.16},{x:.61,y:.16},{x:.5,y:.48}];
function evidence(){const pose=[];pose[11]={x:.22,y:.60,visibility:.99};pose[12]={x:.78,y:.60,visibility:.99};return {faces:[face],pose}}
test('complete upper body passes without elbows, wrists or hips (also high collars)',()=>{assert.equal(assessUploadPortrait(evidence()).status,'pass')});
test('face truncation and multiple people still require replacement',()=>{
 const cropped=evidence();cropped.faces=[[{x:.39,y:-.02},{x:.61,y:.16},{x:.5,y:.48}]];assert.equal(assessUploadPortrait(cropped).status,'reject');
 assert.equal(assessUploadPortrait({faces:[face,face]}).status,'reject');
 assert.equal(assessUploadPortrait({faces:[]}).status,'reject');
});
test('clear shoulder/upper chest truncation rejects but uncertain pose is advisory',()=>{
 const cropped=evidence();cropped.pose[11].x=-.15;assert.equal(assessUploadPortrait(cropped).status,'reject');
 const chest=evidence();chest.pose[11].y=chest.pose[12].y=.94;assert.match(assessUploadPortrait(chest).issues.join(),/อกส่วนบน/);
 const unknown=evidence();unknown.pose[11].visibility=.1;assert.equal(assessUploadPortrait(unknown).status,'uncertain');assert.deepEqual(assessUploadPortrait(unknown).issues,[]);
});
test('missing or invalid measurements are uncertain rather than false failures',()=>{
 assert.equal(assessUploadPortrait({faces:[[ {x:NaN,y:0} ]]}).status,'uncertain');
 assert.equal(assessUploadPortrait({faces:[face]}).status,'uncertain');
});

test('upper chest and shoulders at image sides pass without arm margins or full crown',()=>{
 const input=evidence();input.pose[11]={x:-.035,y:.89,visibility:.55};input.pose[12]={x:.985,y:.89,visibility:.55};
 assert.equal(assessUploadPortrait({...input,crownTouchesEdge:true}).status,'pass');
});
