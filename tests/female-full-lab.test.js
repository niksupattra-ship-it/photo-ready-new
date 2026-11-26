import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {femaleFullLabPrompt} from '../female-full-lab-prompt.js';
import {proLabPayload} from '../seedream-pro-lab.js';

test('female full portrait sends the accessible makeup finish once with three original references',async()=>{
 const prompt=femaleFullLabPrompt();
 assert.equal(prompt,await readFile(new URL('../public/female-full-lab-prompt.txt',import.meta.url),'utf8'));
 assert.equal(prompt.split('FEMALE MAKEUP — ADAPTIVE SOFT CLEAR KOREAN STUDIO STYLE:').length,2);
 assert(!prompt.includes('FEMALE NATURAL STUDIO PORTRAIT'));
 assert(!prompt.includes('Keep the original head scale and framing.'));
 assert(!prompt.includes('DEEP WIDE ROUND U'));
 const files={};let index=0;
 for(const name of ['person','outfit','hair'])files[name]=[{buffer:await sharp({create:{width:32,height:48,channels:4,background:{r:++index*40,g:80,b:120,alpha:1}}}).png().toBuffer()}];
 const payload=await proLabPayload({prompt,files,order:'person-outfit-hair'});
 assert.equal(payload.prompt,prompt);assert.equal(payload.model,'dola-seedream-5-0-pro-260628');
 for(const [i,name]of ['person','outfit','hair'].entries())assert.deepEqual(Buffer.from(payload.image[i].split(',')[1],'base64'),files[name][0].buffer);
});

test('new page isolates recovery and uses original catalogue pickers without postprocessing',async()=>{
 const html=await readFile(new URL('../public/female-full-lab.html',import.meta.url),'utf8');
 assert(html.includes('data-storage-key="female-full-lab-active-v1"'));
 assert(html.includes('data-skin-controls="off"'));
 assert(html.includes('data-prompt-url="/female-full-lab-prompt.txt"'));
 assert(html.includes('data-catalogue="outfit"'));assert(html.includes('data-catalogue="hair"'));
 assert(!html.includes('value="outfit-person-hair"'));assert(!html.includes('value="male"'));
});
