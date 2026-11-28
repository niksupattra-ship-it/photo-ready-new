import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import express from 'express';
import sharp from 'sharp';
import {proLabPayload,registerSeedreamProLab,PRO_LAB_MODEL} from '../seedream-pro-lab.js';
const png=await sharp({create:{width:48,height:64,channels:4,background:'#ba9689'}}).png().toBuffer();
const jpeg=await sharp(png).jpeg().toBuffer(),webp=await sharp(png).webp().toBuffer();
const files={outfit:[{buffer:png}],person:[{buffer:jpeg}],hair:[{buffer:webp}]};
test('Pro lab uses original bytes, the exact prompt and both explicit orders, one Pro 1.5K result',async()=>{
 for(const order of ['outfit-person-hair','person-outfit-hair']){
  const p=await proLabPayload({prompt:'EXACT\nPROMPT',files,order});
  assert.equal(p.model,PRO_LAB_MODEL);assert.equal(p.size,'1.5K');assert.equal(p.prompt,'EXACT\nPROMPT');
  assert.equal(p.watermark,false);assert.equal(p.output_format,'png');assert.equal(p.image.length,3);
  for(const [i,name]of order.split('-').entries())assert.deepEqual(Buffer.from(p.image[i].split(',')[1],'base64'),files[name][0].buffer);
  assert.deepEqual(p.image.map(v=>v.slice(5,v.indexOf(';'))),order.split('-').map(k=>({outfit:'image/png',person:'image/jpeg',hair:'image/webp'})[k]));
  assert.deepEqual(Object.keys(p).sort(),['model','prompt','image','size','output_format','response_format','watermark'].sort());
 }
 await assert.rejects(proLabPayload({prompt:'x',files,order:'hair-person-outfit'}));
 await assert.rejects(proLabPayload({prompt:'x',files:{}}));
});
async function fixture(t,fetchImpl){const app=express();registerSeedreamProLab(app,{fetchImpl});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});return 'http://127.0.0.1:'+server.address().port;}
function form(id,key='inert-test-key',prompt='EXACT PROMPT'){const f=new FormData();f.set('requestId',id);f.set('key',key);f.set('prompt',prompt);f.set('order','person-outfit-hair');for(const [name,arr]of Object.entries(files))f.set(name,new Blob([arr[0].buffer]),name+'.png');return f;}
test('isolated route returns native PNG, never generates twice for the same submission and rejects changed input',async t=>{
 let calls=0;const base=await fixture(t,async(url,options)=>{calls++;assert.equal(options.headers.Authorization,'Bearer inert-test-key');const p=JSON.parse(options.body);assert.equal(p.model,PRO_LAB_MODEL);assert.deepEqual(Buffer.from(p.image[0].split(',')[1],'base64'),jpeg);return Response.json({data:[{b64_json:png.toString('base64')}]});});
 const id=randomUUID();for(let n=0;n<2;n++){const r=await fetch(base+'/api/seedream-pro-lab',{method:'POST',body:form(id)});assert.equal(r.status,202);assert.equal((await r.json()).id,id);}
 const result=await fetch(base+'/api/seedream-pro-lab/'+id);assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await result.arrayBuffer()),png);assert.equal(calls,1);
 const changed=await fetch(base+'/api/seedream-pro-lab',{method:'POST',body:form(id,'inert-test-key','OTHER')});assert.equal(changed.status,409);assert.equal(calls,1);
 const missingKey=await fetch(base+'/api/seedream-pro-lab',{method:'POST',body:form(randomUUID(),'')});assert.equal(missingKey.status,400);assert.equal(calls,1);
});
test('provider failure is one call, sanitized, recoverable via status and never retried by polling',async t=>{
 let calls=0;const base=await fixture(t,async()=>{calls++;return Response.json({error:{message:'failed inert-test-key'}},{status:503});});
 const id=randomUUID();await fetch(base+'/api/seedream-pro-lab',{method:'POST',body:form(id)});
 for(let n=0;n<2;n++){const r=await fetch(base+'/api/seedream-pro-lab/'+id);assert.equal(r.status,502);assert(!(await r.text()).includes('inert-test-key'));}
 assert.equal(calls,1);
});
test('lab is registered separately and does not change production prompt, model, matting or wallet routes',async()=>{
 const server=await readFile(new URL('../server.js',import.meta.url),'utf8'),lab=await readFile(new URL('../seedream-pro-lab.js',import.meta.url),'utf8');
 assert(server.includes('registerSeedreamProLab(app);'));assert(!lab.includes('process.env'));assert(!lab.includes('removeBackground'));assert(!lab.includes('reserveCredit'));
 const prompt=await readFile(new URL('../public/seedream-pro-lab-prompt.txt',import.meta.url),'utf8');assert.equal(prompt.length,5589);assert(prompt.startsWith('Combine the three reference images'));assert(prompt.includes('Image 1: Fixed clothing'));
});

test('default order matches the confirmed Seedream edit screen, preserving the supplied prompt verbatim',async()=>{
 const {createHash}=await import('node:crypto');
 const prompt=await readFile(new URL('../public/seedream-pro-lab-prompt.txt',import.meta.url),'utf8');
 const p=await proLabPayload({prompt,files});
 assert.deepEqual(p.image.map(v=>Buffer.from(v.split(',')[1],'base64')),[jpeg,png,webp]);
 assert.equal(p.prompt,prompt);assert.equal(createHash('sha256').update(p.prompt).digest('hex'),'e8b1e2acbe9373e39693e2921cc2ebe00ca93d01e8a619a8dbf10ebb10112848');
 const html=await readFile(new URL('../public/seedream-pro-lab.html',import.meta.url),'utf8');
 assert(html.indexOf('data-kind="person"')<html.indexOf('data-kind="outfit"'));
 assert(html.includes('<select name="order" id="order"><option value="person-outfit-hair">'));
});

test('main-site catalogue stays synchronized and selects original image bytes rather than thumbnail files',async()=>{
 const {buildProLabCatalogue}=await import('../scripts/build-pro-lab-catalogue.mjs');
 const {createHash}=await import('node:crypto');
 const actual=JSON.parse(await readFile(new URL('../public/seedream-pro-lab-catalogue.json',import.meta.url),'utf8'));
 assert.deepEqual(actual,await buildProLabCatalogue());
 assert(actual.outfits.length>60);assert(actual.hairs.length>20);
 assert.deepEqual(actual.hairs.filter(h=>h.gender==='female').slice(0,3).map(h=>h.id),['seedream-14','seedream-42','seedream-79']);
 assert(!actual.hairs.some(h=>h.id==='seedream-41'||h.id==='thai-male-auto'));
 const hair=actual.hairs.find(h=>h.id==='seedream-14');assert.equal(hair.reference,'/assets/seedream-hairstyles/references/14.png');
 const outfit=actual.outfits.find(o=>o.id==='female-operational');assert.equal(outfit.reference,'/assets/government-uniforms/female-operational.png');
 for(const item of [...actual.outfits,...actual.hairs]){
  const bytes=await readFile(new URL('../public'+item.reference,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);assert(!item.reference.includes('/previews/'));
 }
});
