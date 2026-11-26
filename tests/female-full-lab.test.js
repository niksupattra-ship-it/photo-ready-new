import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {femaleFullLabPrompt} from '../female-full-lab-prompt.js';
import {femaleFlashLabPayload} from '../female-full-lab.js';
import {registerFemaleFullLab} from '../female-full-lab.js';
import {registerSeedreamProLab} from '../seedream-pro-lab.js';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {createFemaleLabBase,FEMALE_GUIDE_INSTRUCTION,femaleLabChinPlacement} from '../female-lab-guide.js';
import {createEnglishBodyLayout} from '../english-body-layout.js';

test('lab seats chin at each upper collar without changing outfit scale or foreground',async()=>{
 const catalogue=JSON.parse(await readFile(new URL('../public/seedream-pro-lab-catalogue.json',import.meta.url),'utf8'));
 const outfits=[catalogue.outfits.find(o=>o.id==='female-operational'),catalogue.outfits.find(o=>o.reference.includes('peter-pan')),catalogue.outfits.find(o=>o.reference.includes('female-job-navy-notch'))];
 for(const item of outfits){
  assert(item);const outfit=await readFile(new URL('../public'+item.reference,import.meta.url));
  const options={headScale:1,canvasWidth:768,fixedIdentityEnvelope:true,stableGarmentFrame:true,returnNativeForeground:true,profile:{headWidthToShoulder:.415,headHeightToShoulder:.56,chinToCollar:.045,neckToShoulder:.22,chestToShoulder:.40}};
  const old=await createEnglishBodyLayout(outfit,options),next=await createEnglishBodyLayout(outfit,{...options,collarContext:{template:''}});
  assert.deepEqual(next.nativeForeground,old.nativeForeground);
  assert.equal(next.shoulderSpan,old.shoulderSpan);assert.equal(next.centerX,old.centerX);
  const chin=femaleLabChinPlacement(next),previous=old.collarTopY-old.shoulderSpan*.045;
  assert(chin>previous,item.id);
  const c=next.measuredCollar,k=next.shoulderSpan/c.shoulderWidth,contact=next.collarTopY+(c.contactY-c.upperCollarY)*k;
  assert(contact>chin);assert(contact-chin<=next.shoulderSpan*.020001);
 }
 assert.throws(()=>femaleLabChinPlacement({}));
});

test('outfit guide is independent of source pose and its preview never calls AI',async t=>{
 const outfit=await readFile(new URL('../public/assets/government-uniforms/female-operational.png',import.meta.url));
 const face=await sharp({create:{width:64,height:88,channels:4,background:'#bb9988'}}).png().toBuffer();
 const guide=await createFemaleLabBase(outfit,face),meta=await sharp(guide).metadata();
 assert.equal(meta.width,768);assert.equal(meta.height,1024);
 const files={outfit:[{buffer:outfit}],hair:[{buffer:outfit}],face:[{buffer:face}]};
 const payloads=[];
 for(const [w,h]of [[32,64],[96,32]]){
  const portrait=await sharp({create:{width:w,height:h,channels:4,background:'#bb9988'}}).png().toBuffer();
  payloads.push(await femaleFlashLabPayload({prompt:femaleFullLabPrompt(),order:'person-outfit-hair',files:{...files,person:[{buffer:portrait}]}}));
 }
 assert.equal(payloads[0].image[0],payloads[1].image[0]);
 assert.deepEqual(Buffer.from(payloads[0].image[0].split(',')[1],'base64'),guide);
 assert.equal(payloads[0].prompt.split(FEMALE_GUIDE_INSTRUCTION).length,2);
 let calls=0;const app=express();registerFemaleFullLab(app,{fetchImpl:async()=>{calls++;throw Error('unexpected generation');}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});
 const form=new FormData();form.set('face',new Blob([face],{type:'image/png'}),'face.png');form.set('outfit',new Blob([outfit],{type:'image/png'}),'outfit.png');
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/female-full-lab/guide',{method:'POST',body:form});
 assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),guide);assert.equal(calls,0);
});

test('female endpoint sends Flash once and does not change the existing Pro endpoint',async t=>{
 const app=express(),requests=[];
 const png=await sharp({create:{width:32,height:48,channels:4,background:'#bb9988'}}).png().toBuffer();
 const fetchImpl=async(_url,options)=>{requests.push(JSON.parse(options.body));return Response.json({data:[{b64_json:png.toString('base64')}]});};
 registerSeedreamProLab(app,{fetchImpl});registerFemaleFullLab(app,{fetchImpl});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(()=>{server.closeAllConnections();server.close();});
 const base='http://127.0.0.1:'+server.address().port;
 for(const route of ['/api/female-full-lab','/api/seedream-pro-lab']){
  const id=randomUUID(),form=new FormData();
  form.set('key','inert-key');form.set('requestId',id);form.set('order','person-outfit-hair');form.set('prompt',femaleFullLabPrompt());
  for(const name of ['person','outfit','hair'])form.set(name,new Blob([png],{type:'image/png'}),name+'.png');
  if(route==='/api/female-full-lab')form.set('face',new Blob([png],{type:'image/png'}),'face.png');
  for(let i=0;i<2;i++)assert.equal((await fetch(base+route,{method:'POST',body:form})).status,202);
  const result=await fetch(base+route+'/'+id);assert.equal(result.status,200);assert.deepEqual(Buffer.from(await result.arrayBuffer()),png);
 }
 assert.equal(requests.length,2);
 assert.equal(requests[0].model,'dola-seedream-5-0-flash-260915');assert.equal(requests[0].size,'2K');
 assert.equal(requests[1].model,'dola-seedream-5-0-pro-260628');assert.equal(requests[1].size,'1.5K');
 assert.equal(requests[0].prompt,requests[1].prompt);
 assert.equal(requests[0].image.length,4);assert.equal(requests[1].image.length,3);
});

test('female full portrait sends the accessible makeup finish once with three original references',async()=>{
 const prompt=femaleFullLabPrompt();
 assert.equal(prompt,await readFile(new URL('../public/female-full-lab-prompt.txt',import.meta.url),'utf8'));
 assert.equal(prompt.split('FEMALE MAKEUP — CLEAR PHOTOGRAPHIC KOREAN STUDIO STYLE:').length,2);
 assert(!prompt.includes('FEMALE NATURAL STUDIO PORTRAIT'));
 assert(!prompt.includes('Keep the original head scale and framing.'));
 assert(!prompt.includes('DEEP WIDE ROUND U'));
 for(const term of ['SOFT-FOCUS','soft-diffused','Gently reduce harsh pores','remove harsh texture'])assert(!prompt.includes(term));
 assert(prompt.includes('individual eyebrow hairs separated'));
 assert(prompt.includes('Repair individual temporary blemishes locally'));
 assert(prompt.includes('40–43%'));
 assert(prompt.includes('Aim for 41.5%'));
 assert(prompt.includes('excluding shoulder-board overhangs'));
 assert(prompt.includes('Remove ALL visible temporary acne'));
 assert(!prompt.includes('existing head/body framing'));
 assert(!prompt.includes('balanced adult head-to-shoulder ratio'));
 assert(prompt.includes('Keep the original eye shape'));
 const files={face:[{buffer:await sharp({create:{width:64,height:88,channels:4,background:'#bb9988'}}).png().toBuffer()}]};let index=0;
 for(const name of ['person','outfit','hair'])files[name]=[{buffer:await sharp({create:{width:32,height:48,channels:4,background:{r:++index*40,g:80,b:120,alpha:1}}}).png().toBuffer()}];
 const payload=await femaleFlashLabPayload({prompt,files,order:'person-outfit-hair'});
 assert.equal(payload.prompt,prompt);assert.equal(payload.image.length,4);assert.equal(payload.model,'dola-seedream-5-0-flash-260915');assert.equal(payload.size,'2K');
 for(const [i,name]of ['person','hair','outfit'].entries())assert.deepEqual(Buffer.from(payload.image[i+1].split(',')[1],'base64'),files[name][0].buffer);
 assert.notEqual(payload.image[0],payload.image[1]);
 await assert.rejects(femaleFlashLabPayload({prompt,order:'person-outfit-hair',files:{...files,face:[]}}));
});

test('new page isolates recovery and uses original catalogue pickers without postprocessing',async()=>{
 const html=await readFile(new URL('../public/female-full-lab.html',import.meta.url),'utf8');
 assert(html.includes('data-storage-key="female-full-lab-face-active-v4"'));
 assert(html.includes('data-skin-controls="off"'));
 assert(html.includes('data-prompt-url="/female-full-lab-prompt.txt"'));
 assert(html.includes('data-catalogue="outfit"'));assert(html.includes('data-catalogue="hair"'));
 assert(html.includes('src="/female-full-lab-client.js"'));
 assert(!html.includes('src="/seedream-pro-lab.js"'));
 const proClient=await readFile(new URL('../public/seedream-pro-lab.js',import.meta.url),'utf8');
 assert(!proClient.includes('prepareLabSubmission'));assert(!proClient.includes('female-lab-guide.js'));
 assert(!html.includes('value="outfit-person-hair"'));assert(!html.includes('value="male"'));
});
