import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import express from 'express';
import sharp from 'sharp';
import {FEMALE_GUIDE_EDIT_LAB_PROMPT,guideEditLabPayload,registerFemaleGuideEditLab} from '../female-guide-edit-lab.js';
import {productionLabPayload,productionLabPrompt,registerFemaleProductionLab} from '../female-production-lab.js';
import {PRO_LAB_MODEL} from '../seedream-pro-payload.js';
import {FEMALE_FACE_OUTLINE,captureFemaleFaceEvidence} from '../female-preplaced-face-contract.js';

const root=new URL('..',import.meta.url).pathname,landmarks=[];
for(const [i,id] of FEMALE_FACE_OUTLINE.entries()){const a=2*Math.PI*i/FEMALE_FACE_OUTLINE.length;landmarks[id]={x:.5+.22*Math.sin(a),y:.475-.275*Math.cos(a)};}
for(const [id,x,y] of [[33,.35,.4],[263,.65,.4],[1,.5,.55],[152,.5,.75],[234,.28,.5],[454,.72,.5]])landmarks[id]={x,y};
const evidence=captureFemaleFaceEvidence(landmarks,480,640),fields={femalePreplacedFace:JSON.stringify(evidence)};
const person=await sharp({create:{width:480,height:640,channels:4,background:'#b08f7f'}}).png().toBuffer();
const hair=await readFile(root+'public/assets/seedream-hairstyles/references/5.png');
const asset=path=>readFile(root+'public/assets/'+path);

test('both labs share the exact guide-only prompt and only guide, hair and garment references',async()=>{
 const originalPrompt=productionLabPrompt();assert.equal(FEMALE_GUIDE_EDIT_LAB_PROMPT,originalPrompt);
 for(const path of ['government-uniforms/female-operational.png','job-uniforms/female-job-navy-notch-white-shirt.png']){
  const files={person:[{buffer:person}],outfit:[{buffer:await asset(path)}],hair:[{buffer:hair}]};
  const options={files,fields,order:'person-outfit-hair'};
  const baseline=await productionLabPayload({...options,prompt:originalPrompt});
  const experiment=await guideEditLabPayload({...options,prompt:FEMALE_GUIDE_EDIT_LAB_PROMPT});
  assert.deepEqual(experiment,baseline);assert.equal(experiment.image.length,3);assert(!experiment.image.includes('data:image/png;base64,'+person.toString('base64')));
  assert.equal(experiment.model,baseline.model);
  assert.equal(productionLabPrompt(),originalPrompt);
  await assert.rejects(guideEditLabPayload({...options,prompt:originalPrompt+' changed'}),/guide-edit experiment/);
 }
});

test('trial page submits its exact guide and prompt once, recovers the same result and isolates baseline jobs',async t=>{
 const outfit=await asset('government-uniforms/female-operational.png');
 const mask=await sharp({create:{width:480,height:640,channels:4,background:'#00000000'}}).composite([{input:await sharp({create:{width:360,height:580,channels:4,background:'#fff'}}).png().toBuffer(),left:60,top:60}]).png().toBuffer();
 let calls=0,mattes=0,captured;
 const app=express();
 registerFemaleProductionLab(app,{fetchImpl:async()=>{throw Error('Baseline must not generate');}});
 registerFemaleGuideEditLab(app,{removeBackground:async()=>{mattes++;return mask;},fetchImpl:async(_url,options)=>{calls++;captured=JSON.parse(options.body);return Response.json({data:[{b64_json:person.toString('base64')}]});}});
 app.use(express.static(root+'public'));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const html=await(await fetch(base+'/female-guide-edit-lab.html')).text();
 const data=name=>html.match(new RegExp('data-'+name+'="([^"]+)"'))?.[1];
 const endpoint=data('endpoint');assert.equal(endpoint,'/api/female-guide-edit-lab');
 assert.equal(data('storage-key'),'female-guide-edit-lab-guide-only-55-v1');assert.equal(data('face-preparation'),'on');assert.equal(data('model-label'),'Dola-Seedream-5.5-261028');
 assert.equal(data('identity-endpoint'),undefined);assert(!html.includes('identity-image'));assert(!html.includes('female-guide-edit-identity-client.js'));
 assert.equal(data('guide-module'),'./female-production-lab-guide.js');assert(html.includes('href="/female-production-lab.html"'));
 assert.equal(await(await fetch(base+data('prompt-url'))).text(),FEMALE_GUIDE_EDIT_LAB_PROMPT);
 assert.equal(await(await fetch(base+'/api/female-production-lab/prompt')).text(),productionLabPrompt());
 const form=()=>{const f=new FormData();for(const [name,buffer] of [['person',person],['outfit',outfit],['hair',hair]])f.set(name,new Blob([buffer],{type:'image/png'}),name+'.png');f.set('femalePreplacedFace',fields.femalePreplacedFace);return f;};
 const guideForm=form();guideForm.delete('hair');const guideResponse=await fetch(base+'/api/female-production-lab/guide',{method:'POST',body:guideForm});
 assert.equal(guideResponse.status,200);const guide=Buffer.from(await guideResponse.arrayBuffer());
 assert.equal(calls,0);
 const request=form(),id=randomUUID();request.set('key','inert-test-key');request.set('requestId',id);request.set('order','person-outfit-hair');request.set('prompt',productionLabPrompt()+' changed');
 assert.equal((await fetch(base+endpoint,{method:'POST',body:request})).status,400);assert.equal(calls,0);
 request.set('prompt',FEMALE_GUIDE_EDIT_LAB_PROMPT);
 assert.equal((await fetch(base+endpoint,{method:'POST',body:request})).status,202);
 let response;for(let n=0;n<150;n++){response=await fetch(base+endpoint+'/'+id);if(response.status!==202)break;await new Promise(resolve=>setTimeout(resolve,20));}
 assert.equal(response.status,200);const result=Buffer.from(await response.arrayBuffer());assert.equal((await sharp(result).metadata()).format,'png');
 const delivered=await sharp(result).removeAlpha().raw().toBuffer({resolveWithObject:true});
 for(const x of [0,delivered.info.width-1]){const i=((delivered.info.height-1)*delivered.info.width+x)*3;assert.deepEqual([...delivered.data.subarray(i,i+3)],[176,143,127],'delivered lower corners contain the original person, not background margins');}
 assert.equal(calls,1);assert.equal(mattes,1);assert.equal(captured.prompt,FEMALE_GUIDE_EDIT_LAB_PROMPT);
 assert.equal(captured.size,'2K');assert.equal(captured.model,'dola-seedream-5-5-261028');assert.notEqual(captured.model,PRO_LAB_MODEL);
 assert.deepEqual(captured.image.map(value=>Buffer.from(value.split(',')[1],'base64')),[guide,hair,outfit]);
 assert.equal((await fetch(base+endpoint,{method:'POST',body:request})).status,202);
 assert.equal(calls,1);assert.equal(mattes,1);
 assert.deepEqual(Buffer.from(await(await fetch(base+endpoint+'/'+id)).arrayBuffer()),result);
 assert.equal((await fetch(base+'/api/female-production-lab/'+id)).status,404);
 assert.equal(await(await fetch(base+'/api/female-production-lab/prompt')).text(),productionLabPrompt());
});
