import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import express from 'express';
import sharp from 'sharp';
import {FEMALE_GUIDE_EDIT_LAB_PROMPT,guideEditLabPayload,registerFemaleGuideEditLab} from '../female-guide-edit-lab.js';
import {productionLabPayload,productionLabPrompt,registerFemaleProductionLab} from '../female-production-lab.js';
import {PRO_LAB_MODEL} from '../seedream-pro-payload.js';
import {prepareGuideEditIdentity} from '../female-guide-edit-identity.js';
import {runInNewContext} from 'node:vm';
import {FEMALE_FACE_OUTLINE,captureFemaleFaceEvidence} from '../female-preplaced-face-contract.js';

const root=new URL('..',import.meta.url).pathname,landmarks=[];
for(const [i,id] of FEMALE_FACE_OUTLINE.entries()){const a=2*Math.PI*i/FEMALE_FACE_OUTLINE.length;landmarks[id]={x:.5+.22*Math.sin(a),y:.475-.275*Math.cos(a)};}
for(const [id,x,y] of [[33,.35,.4],[263,.65,.4],[1,.5,.55],[152,.5,.75],[234,.28,.5],[454,.72,.5]])landmarks[id]={x,y};
const evidence=captureFemaleFaceEvidence(landmarks,480,640),fields={femalePreplacedFace:JSON.stringify(evidence)};
const person=await sharp({create:{width:480,height:640,channels:4,background:'#b08f7f'}}).png().toBuffer();
const hair=await readFile(root+'public/assets/seedream-hairstyles/references/5.png');
const asset=path=>readFile(root+'public/assets/'+path);

test('both labs share the exact restored PR #279 prompt and guide, hair, garment and independent original-face references',async()=>{
 const originalPrompt=productionLabPrompt();assert.equal(FEMALE_GUIDE_EDIT_LAB_PROMPT,originalPrompt);
 for(const path of ['government-uniforms/female-operational.png','job-uniforms/female-job-navy-notch-white-shirt.png']){
  const files={person:[{buffer:person}],outfit:[{buffer:await asset(path)}],hair:[{buffer:hair}]};
  const options={files,fields,order:'person-outfit-hair'};
  const baseline=await productionLabPayload({...options,prompt:originalPrompt});
  const experiment=await guideEditLabPayload({...options,prompt:FEMALE_GUIDE_EDIT_LAB_PROMPT});
  const identity=await prepareGuideEditIdentity(person,fields.femalePreplacedFace);
  assert.deepEqual(experiment,baseline);assert.equal(experiment.image.length,4);assert.equal(experiment.image[3],'data:image/png;base64,'+identity.toString('base64'));
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
 assert.equal(data('storage-key'),'female-guide-edit-lab-pr279-soft-flash-v7');assert.equal(data('face-preparation'),'on');assert.equal(data('model-label'),'Dola-Seedream-5.0-pro-260628');
 assert.equal(data('identity-endpoint'),'/api/female-guide-edit-lab/identity');assert(html.includes('id="identity-image"'));
 assert(html.includes('/female-guide-edit-identity-client.js'));
 assert.equal(data('guide-module'),'./female-production-lab-guide.js');assert(html.includes('href="/female-production-lab.html"'));
 assert.equal(await(await fetch(base+data('prompt-url'))).text(),FEMALE_GUIDE_EDIT_LAB_PROMPT);
 assert.equal(await(await fetch(base+'/api/female-production-lab/prompt')).text(),productionLabPrompt());
 const form=()=>{const f=new FormData();for(const [name,buffer] of [['person',person],['outfit',outfit],['hair',hair]])f.set(name,new Blob([buffer],{type:'image/png'}),name+'.png');f.set('femalePreplacedFace',fields.femalePreplacedFace);return f;};
 const guideForm=form();guideForm.delete('hair');const guideResponse=await fetch(base+'/api/female-production-lab/guide',{method:'POST',body:guideForm});
 assert.equal(guideResponse.status,200);const guide=Buffer.from(await guideResponse.arrayBuffer());
 const identityForm=new FormData();identityForm.set('person',new Blob([person],{type:'image/png'}),'person.png');identityForm.set('femalePreplacedFace',fields.femalePreplacedFace);
 const identityResponse=await fetch(base+data('identity-endpoint'),{method:'POST',body:identityForm});assert.equal(identityResponse.status,200);
 const identity=Buffer.from(await identityResponse.arrayBuffer());assert.equal(calls,0);
 identityForm.set('femalePreplacedFace','{}');assert.equal((await fetch(base+data('identity-endpoint'),{method:'POST',body:identityForm})).status,400);assert.equal(calls,0);
 const request=form(),id=randomUUID();request.set('key','inert-test-key');request.set('requestId',id);request.set('order','person-outfit-hair');request.set('prompt',productionLabPrompt()+' changed');
 assert.equal((await fetch(base+endpoint,{method:'POST',body:request})).status,400);assert.equal(calls,0);
 request.set('prompt',FEMALE_GUIDE_EDIT_LAB_PROMPT);
 assert.equal((await fetch(base+endpoint,{method:'POST',body:request})).status,202);
 let response;for(let n=0;n<150;n++){response=await fetch(base+endpoint+'/'+id);if(response.status!==202)break;await new Promise(resolve=>setTimeout(resolve,20));}
 assert.equal(response.status,200);const result=Buffer.from(await response.arrayBuffer());assert.equal((await sharp(result).metadata()).format,'png');
 const delivered=await sharp(result).removeAlpha().raw().toBuffer({resolveWithObject:true});
 for(const x of [0,delivered.info.width-1]){const i=((delivered.info.height-1)*delivered.info.width+x)*3;assert.deepEqual([...delivered.data.subarray(i,i+3)],[176,143,127],'delivered lower corners contain the original person, not background margins');}
 assert.equal(calls,1);assert.equal(mattes,1);assert.equal(captured.prompt,FEMALE_GUIDE_EDIT_LAB_PROMPT);
 assert.equal(captured.size,'2K');assert.equal(captured.model,PRO_LAB_MODEL);
 assert.deepEqual(captured.image.map(value=>Buffer.from(value.split(',')[1],'base64')),[guide,hair,outfit,identity]);
 assert.equal((await fetch(base+endpoint,{method:'POST',body:request})).status,202);
 assert.equal(calls,1);assert.equal(mattes,1);
 assert.deepEqual(Buffer.from(await(await fetch(base+endpoint+'/'+id)).arrayBuffer()),result);
 assert.equal((await fetch(base+'/api/female-production-lab/'+id)).status,404);
 assert.equal(await(await fetch(base+'/api/female-production-lab/prompt')).text(),productionLabPrompt());
});

test('identity reference retains native source-face pixels even with tilted eyes; it is not the tiny guide or a generated face',async()=>{
 const width=960,height=1280,raw=Buffer.alloc(width*height*3);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*3;raw[i]=x%251;raw[i+1]=y%253;raw[i+2]=(x*7+y*3)%255;}
 const tilted=structuredClone(landmarks);tilted[33].y=.38;tilted[263].y=.42;
 const source=await sharp(raw,{raw:{width,height,channels:3}}).png().toBuffer();
 const reference=await prepareGuideEditIdentity(source,captureFemaleFaceEvidence(tilted,width,height));
 const actual=await sharp(reference).raw().toBuffer({resolveWithObject:true});
 assert.equal(actual.info.width,508);assert.equal(actual.info.height,818);assert.equal(actual.info.channels,3);
 const expected=await sharp(source).extract({left:226,top:199,width:508,height:818}).raw().toBuffer();
 assert.deepEqual(actual.data,expected,'The independent identity crop must not rotate, reshape, beautify or upscale the original face');
});

test('changing the upload discards a late old identity preview and revokes its URLs when cleared',async()=>{
 const source=await readFile(new URL('../public/female-guide-edit-identity-client.js',import.meta.url),'utf8');
 let handler;const input={files:[],addEventListener(_event,callback){handler=callback;}},panel={hidden:true},image={hidden:true,removeAttribute(){delete this.src;}},status={textContent:''};
 const pending=[],created=[],revoked=[],elements={form:{elements:{person:input}},'identity-panel':panel,'identity-image':image,'identity-status':status};
 runInNewContext(source.replace(/^import .*;\n/,''),{document:{getElementById:id=>elements[id],documentElement:{dataset:{identityEndpoint:'/api/female-guide-edit-lab/identity'}}},prepareEvidence:async()=>({version:'inert'}),FormData,AbortSignal,AbortController,URL:{createObjectURL:blob=>{created.push(blob);return 'blob:current';},revokeObjectURL:url=>revoked.push(url)},fetch:(url,options)=>new Promise(resolve=>pending.push({url,options,resolve}))});
 input.files=[new Blob(['first'])];const first=handler();await new Promise(resolve=>setImmediate(resolve));assert.equal(pending.length,1);
 input.files=[new Blob(['second'])];const second=handler();await new Promise(resolve=>setImmediate(resolve));assert.equal(pending.length,2);assert(pending[0].options.signal.aborted);
 const oldBlob=new Blob(['old face']),newBlob=new Blob(['current face']);
 pending[0].resolve({ok:true,blob:async()=>oldBlob});await first;assert.equal(created.length,0);
 pending[1].resolve({ok:true,blob:async()=>newBlob});await second;assert.deepEqual(created,[newBlob]);assert.equal(image.src,'blob:current');assert.equal(image.hidden,false);
 input.files=[];await handler();assert.equal(panel.hidden,true);assert.equal(image.hidden,true);assert.deepEqual(revoked,['blob:current']);
});
