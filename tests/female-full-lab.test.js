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
  for(let i=0;i<2;i++)assert.equal((await fetch(base+route,{method:'POST',body:form})).status,202);
  const result=await fetch(base+route+'/'+id);assert.equal(result.status,200);assert.deepEqual(Buffer.from(await result.arrayBuffer()),png);
 }
 assert.equal(requests.length,2);
 assert.equal(requests[0].model,'dola-seedream-5-0-flash-260915');assert.equal(requests[0].size,'2K');
 assert.equal(requests[1].model,'dola-seedream-5-0-pro-260628');assert.equal(requests[1].size,'1.5K');
 assert.equal(requests[0].prompt,requests[1].prompt);
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
 const files={};let index=0;
 for(const name of ['person','outfit','hair'])files[name]=[{buffer:await sharp({create:{width:32,height:48,channels:4,background:{r:++index*40,g:80,b:120,alpha:1}}}).png().toBuffer()}];
 const payload=await femaleFlashLabPayload({prompt,files,order:'person-outfit-hair'});
 assert.equal(payload.prompt,prompt);assert.equal(payload.model,'dola-seedream-5-0-flash-260915');assert.equal(payload.size,'2K');
 for(const [i,name]of ['person','outfit','hair'].entries())assert.deepEqual(Buffer.from(payload.image[i].split(',')[1],'base64'),files[name][0].buffer);
});

test('new page isolates recovery and uses original catalogue pickers without postprocessing',async()=>{
 const html=await readFile(new URL('../public/female-full-lab.html',import.meta.url),'utf8');
 assert(html.includes('data-storage-key="female-full-lab-flash-active-v2"'));
 assert(html.includes('data-skin-controls="off"'));
 assert(html.includes('data-prompt-url="/female-full-lab-prompt.txt"'));
 assert(html.includes('data-catalogue="outfit"'));assert(html.includes('data-catalogue="hair"'));
 assert(!html.includes('value="outfit-person-hair"'));assert(!html.includes('value="male"'));
});
