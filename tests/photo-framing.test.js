import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkPhotoFraming,assertPhotoFraming,configurePhotoFramingInspector} from '../src/photo-framing.js';
function photo({top=.1,faceHeight=.4,left=.32,right=.68,width=900,height=1200}={}){const face=[];face[10]={x:.5,y:top};face[152]={x:.5,y:top+faceHeight};face[234]={x:left,y:top+.2};face[454]={x:right,y:top+.2};return {width,height,face}}
test('accepts balanced chest-up framing at different pixel resolutions',()=>{
 for(const [width,height] of [[450,600],[900,1200],[1800,2400]])assert.equal(checkPhotoFraming(photo({width,height})).ok,true);
});
test('blocks close-up, distant, cropped head, missing chest room and absent face',()=>{
 assert.equal(checkPhotoFraming(photo({faceHeight:.6})).code,'PHOTO_TOO_CLOSE');
 assert.equal(checkPhotoFraming(photo({left:.15,right:.85})).code,'PHOTO_TOO_CLOSE');
 assert.equal(checkPhotoFraming(photo({faceHeight:.2})).code,'PHOTO_TOO_FAR');
 assert.equal(checkPhotoFraming(photo({top:.01})).code,'PHOTO_FRAME_CROPPED');
 assert.equal(checkPhotoFraming(photo({top:.45})).code,'PHOTO_FRAME_CROPPED');
 assert.equal(checkPhotoFraming({width:900,height:1200,face:null}).code,'PHOTO_FACE_MISSING');
 assert.equal(checkPhotoFraming(photo({faceHeight:-.4})).code,'PHOTO_FACE_MISSING');
});
test('pending checks are shared; rejection and detector failures never approve a photo and can be retried',async()=>{
 const file=new Blob(['test']);let calls=0,resolve;
 configurePhotoFramingInspector(()=>{calls++;return new Promise(r=>resolve=r)});
 const first=assertPhotoFraming(file),second=assertPhotoFraming(file);await Promise.resolve();assert.equal(calls,1);resolve(photo());await Promise.all([first,second]);await assertPhotoFraming(file);assert.equal(calls,1);
 const other=new Blob(['bad']);configurePhotoFramingInspector(async()=>{calls++;return photo({faceHeight:.7})});await assert.rejects(assertPhotoFraming(other),{code:'PHOTO_TOO_CLOSE'});
 configurePhotoFramingInspector(async()=>{throw Error('detector unavailable')});await assert.rejects(assertPhotoFraming(other),/detector unavailable/);
 configurePhotoFramingInspector(async()=>photo());assert.equal((await assertPhotoFraming(other)).ok,true);
});
