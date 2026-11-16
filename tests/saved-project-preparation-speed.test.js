import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSavedProject} from '../src/saved-project.js';

// Disposable image bytes and deferred local reads only: no customer files,
// storage, generation provider or payment endpoint is involved.
const tiny=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0X8AAAAASUVORK5CYII=','base64');
const image=(id,w=1,h=1)=>{const bytes=Buffer.concat([tiny,Buffer.from([id])]);bytes.writeUInt32BE(w,16);bytes.writeUInt32BE(h,20);return 'data:image/png;base64,'+bytes.toString('base64')};
const bytes=src=>Buffer.from(src.split(',')[1],'base64');
const head=image(1),original=image(2),canonical=image(3),work='dwork_'+'a'.repeat(36);
const layer=(source=head,extra={})=>({name:'หัว · คอ · ผม',kind:'head',jobId:'job-owned',source,sourceFrame:{x:100,y:20,w:700,h:940},x:8,y:-4,scale:1.1,rotation:3,opacity:.9,portraitMode:'female',femaleEyeStyle:'natural',femaleFinishSingleVersion:'female-single-finish-v1',...extra});
const project=(extra={})=>({format:'idprom-studio',version:1,width:900,height:1200,layers:[layer()],downloadWorkId:work,downloadSource:original,canonicalInput:original,compareSource:original,...extra});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
function fixture(){
 const requests=[],pending=new Map(),decoded=[],events=[];let files=0;
 const options={fastOpen:true,onValidated:()=>events.push('validated'),decode:async src=>{events.push('decode');decoded.push(src);return {width:1,height:1}},makeFile:blob=>{files++;return new File([blob],'source.png',{type:blob.type})},fetchImage:src=>{requests.push(src);const wait=deferred();pending.set(src,wait);return wait.promise}};
 const respond=src=>pending.get(src).resolve({blob:async()=>new Blob([bytes(src)],{type:'image/png'})});
 return {options,requests,pending,decoded,events,respond,get files(){return files}};
}

test('identical source/canonical input is converted once while the independent head read starts in parallel',async()=>{
 const f=fixture(),p=project(),snapshot=JSON.stringify(p);let complete=false;
 const opening=prepareSavedProject(p,f.options).then(result=>{complete=true;return result});await tick();
 assert.deepEqual(f.requests,[original,head]);assert.deepEqual(f.events.slice(0,2),['validated','decode']);
 f.respond(head);await tick();assert.equal(complete,false,'No partially prepared result may commit');assert.equal(f.files,0);
 f.respond(original);const restored=await opening;
 assert.equal(restored.project,p);assert.equal(JSON.stringify(p),snapshot);assert.equal(restored.source.idpromDownloadWorkId,work);
 assert.deepEqual(Buffer.from(await restored.source.arrayBuffer()),bytes(original));assert.deepEqual(Buffer.from(await restored.source.idpromCanonicalInput.arrayBuffer()),bytes(original));
 assert.deepEqual(Buffer.from(await restored.editCache.master.arrayBuffer()),bytes(head));assert.equal(restored.editCache.master.idpromFemaleFinishSingleVersion,'female-single-finish-v1');
 assert.deepEqual(restored.project.layers[0].sourceFrame,p.layers[0].sourceFrame);
});

test('three distinct source/canonical/head reads overlap without decoding or relabeling the canonical input',async()=>{
 const f=fixture(),opening=prepareSavedProject(project({canonicalInput:canonical}),f.options);await tick();
 assert.deepEqual(f.requests,[original,canonical,head]);assert.deepEqual(f.decoded,[head]);
 for(const src of f.requests)f.respond(src);const restored=await opening;
 assert.deepEqual(Buffer.from(await restored.source.idpromCanonicalInput.arrayBuffer()),bytes(canonical));assert.equal(f.files,1);
});

test('one shared image for source, canonical input and head converts only once',async()=>{
 const f=fixture(),opening=prepareSavedProject(project({downloadSource:head,canonicalInput:head,compareSource:head}),f.options);await tick();
 assert.deepEqual(f.requests,[head]);f.respond(head);const restored=await opening;assert.equal(f.files,1);assert.equal(restored.source.idpromCanonicalInput,restored.editCache.master);
});

test('abort during parallel reads rejects without creating an editable source, including late successful responses',async()=>{
 const f=fixture(),controller=new AbortController(),p=project(),snapshot=JSON.stringify(p),opening=prepareSavedProject(p,{...f.options,signal:controller.signal});await tick();
 controller.abort();await assert.rejects(opening,{name:'AbortError'});
 for(const src of f.requests)f.respond(src);await tick();assert.equal(f.files,0);assert.equal(JSON.stringify(p),snapshot);
});

test('a failed parallel read cannot produce a partial editable work after another read finishes late',async()=>{
 const f=fixture(),p=project(),snapshot=JSON.stringify(p),opening=prepareSavedProject(p,f.options);await tick();
 f.pending.get(head).reject(Error('inert head read failure'));await assert.rejects(opening,/inert head read failure/);
 f.respond(original);await tick();assert.equal(f.files,0);assert.equal(JSON.stringify(p),snapshot);
});

test('invalid projects and over-budget resources never invoke the warm callback or image readers',async()=>{
 for(const p of [project({width:899}),project({layers:[layer(image(9,4000,2100))]})]){
  const f=fixture();await assert.rejects(prepareSavedProject(p,f.options));assert.deepEqual(f.events,[]);assert.deepEqual(f.requests,[]);assert.equal(f.files,0);
 }
});

test('resource fallback still normalizes opaque masks and invokes warming only after the normalized project is safe',async()=>{
 const layers=[0,1,2].map(i=>layer(image(10+i,3000,2500),{mask:image(20+i,3000,2500)})),p=project({layers,downloadSource:undefined,canonicalInput:undefined,compareSource:undefined});
 let callbacks=0,inspections=0;
 const restored=await prepareSavedProject(p,{fastOpen:true,inspectMask:async()=>{inspections++;return true},decode:async()=>({width:3000,height:2500}),onValidated:validated=>{callbacks++;assert(validated.layers.every(l=>l.mask===null))}});
 assert.equal(callbacks,1);assert.equal(inspections,3);assert(restored.project.layers.every(l=>l.mask===null));assert(p.layers.every(l=>l.mask),'The original imported project is not mutated');
});
