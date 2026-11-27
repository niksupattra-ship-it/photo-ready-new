import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import express from 'express';
import sharp from 'sharp';
import {registerFemaleProductionLab,productionLabPayload,productionLabPrompt} from '../female-production-lab.js';
import {FEMALE_FACE_OUTLINE,captureFemaleFaceEvidence} from '../female-preplaced-face-contract.js';
import {prepareFemaleFace} from '../female-preplaced-face.js';
import {productionFemaleV9Payload} from '../production-female-v9-payload.js';
import {createFemaleLabBase} from '../production-female-v9-layout.js';
import {productionFemalePromptFor} from '../production-female-skin-prompt.js';
import {FEMALE_REAR_HAIR_VERSION} from '../female-exact-prompt-policy.js';
const landmarks=[];
for(const [i,id]of FEMALE_FACE_OUTLINE.entries()){const a=2*Math.PI*i/FEMALE_FACE_OUTLINE.length;landmarks[id]={x:.5+.22*Math.sin(a),y:.475-.275*Math.cos(a)};}
for(const [id,x,y]of [[33,.35,.4],[263,.65,.4],[1,.5,.55],[152,.5,.75],[234,.28,.5],[454,.72,.5]])landmarks[id]={x,y};
const evidence=captureFemaleFaceEvidence(landmarks,480,640);
const person=await sharp({create:{width:480,height:640,channels:4,background:'#b08f7f'}}).png().toBuffer();
const asset=path=>readFile(new URL('../public/assets/'+path,import.meta.url));
const hair=await asset('seedream-hairstyles/references/5.png');
const fields={femalePreplacedFace:JSON.stringify(evidence)};

test('lab uses byte-identical current production face preparation and payload for every outfit category',async()=>{
 assert.equal(productionLabPrompt(),productionFemalePromptFor(FEMALE_REAR_HAIR_VERSION));
 const face=await prepareFemaleFace(person,evidence);
 for(const path of ['government-uniforms/female-operational.png','job-uniforms/female-job-navy-notch-white-shirt.png','gown-uniforms/kmitl-female.png','student-uniforms/female-01.png']){
  const files={person:[{buffer:person}],outfit:[{buffer:await asset(path)}],hair:[{buffer:hair}]};
  const expected=await productionFemaleV9Payload({prompt:productionLabPrompt(),order:'person-outfit-hair',identityFaceOnly:true,files:{...files,face:[{buffer:face}]}});
  assert.deepEqual(await productionLabPayload({prompt:productionLabPrompt(),order:'person-outfit-hair',files,fields}),expected);
 }
});
test('lab guide, immutable prompt, async submission, matting and framed PNG use no production wallet',async t=>{
 const outfit=await asset('government-uniforms/female-operational.png');
 let calls=0,mattes=0;
 const mask=await sharp({create:{width:480,height:640,channels:4,background:'#00000000'}}).composite([{input:await sharp({create:{width:360,height:600,channels:4,background:'#ffffff'}}).png().toBuffer(),left:60,top:40}]).png().toBuffer();
 const app=express();registerFemaleProductionLab(app,{removeBackground:async()=>{mattes++;return mask;},fetchImpl:async(_url,options)=>{calls++;const p=JSON.parse(options.body);assert.equal(p.model,'dola-seedream-5-0-flash-260915');assert.equal(p.image.length,4);return {ok:true,json:async()=>({data:[{b64_json:person.toString('base64')}]})};}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});const base='http://127.0.0.1:'+server.address().port+'/api/female-production-lab';
 assert.equal(await(await fetch(base+'/prompt')).text(),productionLabPrompt());
 assert((await(await fetch(base+'/face-contract.js')).text()).includes('captureFemaleFaceEvidence'));
 const form=()=>{const f=new FormData();for(const [name,data]of [['person',person],['outfit',outfit],['hair',hair]])f.set(name,new Blob([data],{type:'image/png'}),name+'.png');f.set('femalePreplacedFace',JSON.stringify(evidence));return f;};
 const guide=form();guide.delete('hair');let r=await fetch(base+'/guide',{method:'POST',body:guide});assert.equal(r.status,200);
 assert.deepEqual(Buffer.from(await r.arrayBuffer()),await createFemaleLabBase(outfit,await prepareFemaleFace(person,evidence)));assert.equal(calls,0);
 const invalid=form();invalid.set('key','inert-key');invalid.set('requestId',randomUUID());invalid.set('order','person-outfit-hair');invalid.set('prompt','changed prompt');assert.equal((await fetch(base,{method:'POST',body:invalid})).status,400);assert.equal(calls,0);
 const f=form(),id=randomUUID();f.set('key','inert-key');f.set('requestId',id);f.set('order','person-outfit-hair');f.set('prompt',productionLabPrompt());
 assert.equal((await fetch(base,{method:'POST',body:f})).status,202);
 let result;for(let n=0;n<100;n++){r=await fetch(base+'/'+id);if(r.status!==202){result=r;break;}await new Promise(r=>setTimeout(r,20));}
 assert.equal(result?.status,200);const meta=await sharp(Buffer.from(await result.arrayBuffer())).metadata();assert.equal(meta.width,900);assert.equal(meta.height,1200);assert.equal(calls,1);assert.equal(mattes,1);
 assert.equal((await fetch(base,{method:'POST',body:f})).status,202);assert.equal(calls,1);
});
