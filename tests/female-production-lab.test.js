import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import express from 'express';
import sharp from 'sharp';
import {registerFemaleProductionLab,productionLabPayload,productionLabPrompt} from '../female-production-lab.js';
import {FEMALE_FACE_OUTLINE,captureFemaleFaceEvidence} from '../female-preplaced-face-contract.js';
import {prepareFemaleFace} from '../female-preplaced-face.js';
import {FEMALE_PORTRAIT_MODEL as PRO_LAB_MODEL} from '../seedream-pro-payload.js';
import {currentFemalePortraitPayload} from '../female-portrait-payload.js';
import {createFemaleLabBase} from '../female-portrait-layout.js';
import {FEMALE_PORTRAIT_PROMPT} from '../female-portrait-prompt.js';
import {FEMALE_LAB_PROCESS_VERSION} from '../female-portrait-prompt.js';
const landmarks=[];
for(const [i,id]of FEMALE_FACE_OUTLINE.entries()){const a=2*Math.PI*i/FEMALE_FACE_OUTLINE.length;landmarks[id]={x:.5+.22*Math.sin(a),y:.475-.275*Math.cos(a)};}
for(const [id,x,y]of [[33,.35,.4],[263,.65,.4],[1,.5,.55],[152,.5,.75],[234,.28,.5],[454,.72,.5]])landmarks[id]={x,y};
const evidence=captureFemaleFaceEvidence(landmarks,480,640);
const person=await sharp({create:{width:480,height:640,channels:4,background:'#b08f7f'}}).png().toBuffer();
const asset=path=>readFile(new URL('../public/assets/'+path,import.meta.url));
const hair=await asset('seedream-hairstyles/references/5.png');
const fields={femalePreplacedFace:JSON.stringify(evidence)};

test('active Pro lab shares production prompt and three-reference payload for every outfit category',async()=>{
 assert.equal(productionLabPrompt(),FEMALE_PORTRAIT_PROMPT);
 const face=await prepareFemaleFace(person,evidence);
 for(const path of ['government-uniforms/female-operational.png','job-uniforms/female-job-navy-notch-white-shirt.png','gown-uniforms/kmitl-female.png','student-uniforms/female-01.png']){
  const files={person:[{buffer:person}],outfit:[{buffer:await asset(path)}],hair:[{buffer:hair}]};
  const expected=await currentFemalePortraitPayload({prompt:productionLabPrompt(),order:'person-outfit-hair',identityFaceOnly:true,files:{...files,face:[{buffer:face}]},appendGuideInstruction:false});
  assert.deepEqual(await productionLabPayload({prompt:productionLabPrompt(),order:'person-outfit-hair',files,fields}),{...expected,model:PRO_LAB_MODEL});
  assert.equal(expected.model,PRO_LAB_MODEL);
 }
});
test('lab guide, immutable prompt, async submission, matting and framed PNG use no production wallet',async t=>{
 const outfit=await asset('government-uniforms/female-operational.png');
 let calls=0,mattes=0;
 const mask=await sharp({create:{width:480,height:640,channels:4,background:'#00000000'}}).composite([{input:await sharp({create:{width:360,height:600,channels:4,background:'#ffffff'}}).png().toBuffer(),left:60,top:40}]).png().toBuffer();
 const app=express();registerFemaleProductionLab(app,{removeBackground:async()=>{mattes++;return mask;},fetchImpl:async(_url,options)=>{calls++;const p=JSON.parse(options.body);assert.equal(p.model,PRO_LAB_MODEL);assert.equal(p.image.length,3);return {ok:true,json:async()=>({data:[{b64_json:person.toString('base64')}]})};}});
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
 assert.equal(result?.status,200);const meta=await sharp(Buffer.from(await result.arrayBuffer())).metadata();const originalMeta=await sharp(person).metadata();assert.equal(meta.width,originalMeta.width);assert.equal(meta.height,originalMeta.height);assert.equal(calls,1);assert.equal(mattes,1);
 assert.equal((await fetch(base,{method:'POST',body:f})).status,202);assert.equal(calls,1);
});

test('detailed 2K PNG larger than the SVG XML text limit is framed without embedding image bytes as XML',async()=>{
 const {randomBytes}=await import('node:crypto');
 const {productionLabResult}=await import('../female-production-lab.js');
 const width=1536,height=2048;
 const png=await sharp(randomBytes(width*height*3),{raw:{width,height,channels:3}}).png().toBuffer();
 assert(png.length>8_000_000);
 const mask=await sharp({create:{width:width-2,height:height-2,channels:4,background:'#fff'}}).extend({top:1,bottom:1,left:1,right:1,background:'#00000000'}).png().toBuffer();
 let calls=0;const result=await productionLabResult(png,async original=>{assert.equal(original,png);calls++;return mask;});
 const m=await sharp(result).metadata();assert.equal(m.width,width);assert.equal(m.height,height);assert.equal(calls,1);
 const {data}=await sharp(result).removeAlpha().raw().toBuffer({resolveWithObject:true});
 assert(data.some(v=>v!==data[0]),'The actual image must be composited, not replaced by a blank output');
});
