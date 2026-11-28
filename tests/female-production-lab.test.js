import {createFixedFemaleLabBase,fixedLabFacePlacement,fixedFemaleLabPayload} from '../female-lab-fixed-guide.js';
import {createFemaleGarmentLayout} from '../female-portrait-layout.js';
import {LAB_FLASH_MODEL,LAB_FLASH_PROMPT,finishFemaleLabWithFlash} from '../female-lab-flash-finish.js';
import {FEMALE_55_LAB_PROMPT} from '../female-55-lab-prompt.js';
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

test('active Pro lab shares production prompt and three-reference guide-only payload for every outfit category',async()=>{
 assert.equal(productionLabPrompt(),FEMALE_PORTRAIT_PROMPT);
 const face=await prepareFemaleFace(person,evidence);
 for(const path of ['government-uniforms/female-operational.png','job-uniforms/female-job-navy-notch-white-shirt.png','gown-uniforms/kmitl-female.png','student-uniforms/female-01.png']){
  const files={person:[{buffer:person}],outfit:[{buffer:await asset(path)}],hair:[{buffer:hair}]};
  const expected=await currentFemalePortraitPayload({prompt:productionLabPrompt(),order:'person-outfit-hair',identityFaceOnly:true,fields,files:{...files,face:[{buffer:face}]},appendGuideInstruction:false});
  assert.deepEqual(await productionLabPayload({prompt:productionLabPrompt(),order:'person-outfit-hair',files,fields}),{...expected,model:PRO_LAB_MODEL});
  assert.equal(expected.model,PRO_LAB_MODEL);
 }
});
test('lab guide, immutable prompt, async submission, matting and framed PNG use no production wallet',async t=>{
 const outfit=await asset('government-uniforms/female-operational.png');
 let calls=0,mattes=0,flashInput,failFlash=false;
 const mask=await sharp({create:{width:480,height:640,channels:4,background:'#00000000'}}).composite([{input:await sharp({create:{width:360,height:600,channels:4,background:'#ffffff'}}).png().toBuffer(),left:60,top:40}]).png().toBuffer();
 const app=express();registerFemaleProductionLab(app,{removeBackground:async()=>{mattes++;return mask;},fetchImpl:async(_url,options)=>{calls++;const p=JSON.parse(options.body);if(p.model===LAB_FLASH_MODEL){assert.equal(p.prompt,LAB_FLASH_PROMPT);assert.equal(typeof p.image,'string');flashInput=Buffer.from(p.image.split(',')[1],'base64');if(failFlash)return {ok:false,status:502,json:async()=>({error:{message:'test failure'}})};return {ok:true,json:async()=>({data:[{b64_json:flashInput.toString('base64')}]})};}assert.equal(p.model,'dola-seedream-5-5-261028');assert.notEqual(p.model,PRO_LAB_MODEL);assert.equal(p.image.length,3);assert.equal(p.prompt,FEMALE_55_LAB_PROMPT);assert.notEqual(p.prompt,FEMALE_PORTRAIT_PROMPT);return {ok:true,json:async()=>({data:[{b64_json:person.toString('base64')}]})};}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});const base='http://127.0.0.1:'+server.address().port+'/api/female-production-lab';
 assert.equal(await(await fetch(base+'/prompt')).text(),FEMALE_55_LAB_PROMPT);
 assert((await(await fetch(base+'/face-contract.js')).text()).includes('captureFemaleFaceEvidence'));
 const form=()=>{const f=new FormData();for(const [name,data]of [['person',person],['outfit',outfit],['hair',hair]])f.set(name,new Blob([data],{type:'image/png'}),name+'.png');f.set('femalePreplacedFace',JSON.stringify(evidence));return f;};
 const guide=form();guide.delete('hair');let r=await fetch(base+'/guide',{method:'POST',body:guide});assert.equal(r.status,200);
 assert.deepEqual(Buffer.from(await r.arrayBuffer()),await createFemaleLabBase(outfit,await prepareFemaleFace(person,evidence)));assert.equal(calls,0);
 const invalid=form();invalid.set('key','inert-key');invalid.set('requestId',randomUUID());invalid.set('order','person-outfit-hair');invalid.set('prompt','changed prompt');assert.equal((await fetch(base,{method:'POST',body:invalid})).status,400);assert.equal(calls,0);
 const f=form(),id=randomUUID();f.set('key','inert-key');f.set('requestId',id);f.set('order','person-outfit-hair');f.set('prompt',FEMALE_55_LAB_PROMPT);
 assert.equal((await fetch(base,{method:'POST',body:f})).status,202);
 let result;for(let n=0;n<100;n++){r=await fetch(base+'/'+id);if(r.status!==202){result=r;break;}await new Promise(r=>setTimeout(r,20));}
 assert.equal(result?.status,200);assert.equal(result.headers.get('x-lab-flash-status'),'success');const output=Buffer.from(await result.arrayBuffer());const baseImage=Buffer.from(await(await fetch(base+'/'+id+'/base')).arrayBuffer());assert.deepEqual(flashInput,baseImage);assert.deepEqual(output,baseImage);const meta=await sharp(output).metadata();const originalMeta=await sharp(person).metadata();assert.equal(meta.width,originalMeta.width);assert.equal(meta.height,originalMeta.height);assert.equal(calls,2);assert.equal(mattes,1);
 assert.equal((await fetch(base,{method:'POST',body:f})).status,202);assert.equal(calls,2);
 failFlash=true;const fallbackId=randomUUID();f.set('requestId',fallbackId);assert.equal((await fetch(base,{method:'POST',body:f})).status,202);
 let fallback;for(let n=0;n<150;n++){fallback=await fetch(base+'/'+fallbackId);if(fallback.status!==202)break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(fallback.status,200);assert.equal(fallback.headers.get('x-lab-flash-status'),'fallback');assert.deepEqual(Buffer.from(await fallback.arrayBuffer()),Buffer.from(await(await fetch(base+'/'+fallbackId+'/base')).arrayBuffer()));assert.equal(calls,4);assert.equal(mattes,2);
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

test('5.5 lab instructs exact hair silhouette and neutral professional photographic lighting',()=>{
 assert.match(FEMALE_55_LAB_PROMPT,/STRICT VISUAL COPY/);
 assert.match(FEMALE_55_LAB_PROMPT,/do not sweep it backwards, lift the roots/);
 assert.match(FEMALE_55_LAB_PROMPT,/neutral-white diffused frontal studio strobe/);
 assert.match(FEMALE_55_LAB_PROMPT,/not added pink, red, peach or coral pigment/);
 assert.notEqual(FEMALE_55_LAB_PROMPT,FEMALE_PORTRAIT_PROMPT);
});

test('5.5 V5 restores V3 prompt except local photographic skin-light correction',()=>{
 assert.match(FEMALE_55_LAB_PROMPT,/local photographic exposure and white-balance correction to the existing skin only/);
 assert.match(FEMALE_55_LAB_PROMPT,/Do not change the framing, camera viewpoint, hair or garment as part of this skin-light correction/);
 assert.doesNotMatch(FEMALE_55_LAB_PROMPT,/PHOTOGRAPHIC FINISH — PROFESSIONAL ID STUDIO/);
});

test('5.5 V6 restricts spot correction to photographic artifacts and preserves identifying marks',()=>{
 assert.match(FEMALE_55_LAB_PROMPT,/spot-level tonal correction rather than global smoothing/);
 assert.match(FEMALE_55_LAB_PROMPT,/permanent identifying marks/);
 assert.match(FEMALE_55_LAB_PROMPT,/Do not alter any facial features, hair, garment, proportions or framing/);
});

test('Flash rejects a changed canvas rather than resizing or cropping the finished V6 image',async()=>{
 const other=await sharp({create:{width:481,height:640,channels:3,background:'#abc'}}).png().toBuffer();let calls=0;
 await assert.rejects(finishFemaleLabWithFlash(person,{key:'inert',fetchImpl:async()=>{calls++;return Response.json({data:[{b64_json:other.toString('base64')}]});}}),/Flash canvas changed/);assert.equal(calls,1);
});

test('experimental guide keeps the approved government guide and fixed original face pixels across four garment categories',async()=>{
 const canonical=await asset('government-uniforms/female-operational.png');
 const face=await prepareFemaleFace(person,evidence);
 const target=await fixedLabFacePlacement(face,await createFemaleGarmentLayout(canonical));
 const before=await createFemaleLabBase(canonical,face);
 assert.deepEqual(await createFixedFemaleLabBase(canonical,face),before);
 const original=await sharp(target.placed).ensureAlpha().raw().toBuffer();
 for(const path of ['job-uniforms/female-job-navy-notch-white-shirt.png','gown-uniforms/kmitl-female.png','student-uniforms/female-01.png']){
  const outfit=await asset(path),guide=await createFixedFemaleLabBase(outfit,face);
  const {data,info}=await sharp(guide).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,768);assert.equal(info.height,1024);let checked=0;
  for(let y=0;y<target.height;y++)for(let x=0;x<target.width;x++){
   const src=(y*target.width+x)*4;if(original[src+3]!==255)continue;
   const dest=((target.top+y)*768+target.left+x)*4;
   for(let k=0;k<3;k++)assert.equal(data[dest+k],original[src+k],path);
   checked++;
  }
  assert(checked>1000);
  const payload=await fixedFemaleLabPayload({prompt:productionLabPrompt(),order:'person-outfit-hair',fields,files:{person:[{buffer:person}],outfit:[{buffer:outfit}],hair:[{buffer:hair}]}});
  assert.deepEqual(payload.image.map(s=>Buffer.from(s.split(',')[1],'base64')),[guide,hair,outfit]);
 }
});
