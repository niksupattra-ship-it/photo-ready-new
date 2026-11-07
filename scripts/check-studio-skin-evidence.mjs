import assert from 'node:assert/strict';
import {captureStudioSkinEvidence,clearStudioSkinEvidence} from '../src/studio-skin-evidence.js';
import {parseStudioSkinEvidence,STUDIO_SKIN_WORKFLOW_VERSION} from '../studio-skin-treatment.js';
const photo=()=>new Blob(['immutable canonical input'],{type:'image/jpeg'});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const face=()=>Array.from({length:478},(_,i)=>({x:.25+(i%20)*.025,y:.15+Math.floor(i/20)*.025,z:0}));
function environment({width=900,height=1200,landmarks=face(),maskWidth=16,maskHeight=16,labels=new Uint8Array(maskWidth*maskHeight).fill(3),hold=null}={}){
 const counts={decode:0,detect:0,segment:0,closed:0};let seenImage;
 const image={naturalWidth:width,naturalHeight:height,width:height,height:width};
 const args={
  decode:async input=>{counts.decode++;assert(input instanceof Blob);return image},
  landmarker:async()=>({detect(input){counts.detect++;assert.equal(input,image);seenImage=input;return {faceLandmarks:[landmarks]}}}),
  segmenter:Promise.resolve({segment(input,callback){counts.segment++;assert.equal(input,seenImage);const result={categoryMask:{width:maskWidth,height:maskHeight,getAsUint8Array:()=>labels,close(){counts.closed++}}};if(hold)hold.resolve(()=>callback(result));else callback(result)}}),
 };
 return {args,counts,image};
}
let passed=0;
async function test(name,run){await run();passed++;console.log('PASS '+name)}
await test('evidence uses the decoded canonical orientation and a plain-array wire format',async()=>{
 const input=photo(),{args,counts}=environment();
 const evidence=await captureStudioSkinEvidence(input,args),wire=JSON.stringify(evidence),parsed=JSON.parse(wire);
 assert.equal(evidence.version,STUDIO_SKIN_WORKFLOW_VERSION);assert.equal(evidence.width,900);assert.equal(evidence.height,1200);
 assert(Array.isArray(parsed.face));assert(Array.isArray(parsed.labels));assert.equal(parsed.face.length,478);assert.equal(parsed.labels.length,256);assert(wire.length<300000);
 assert.doesNotThrow(()=>parseStudioSkinEvidence(wire));assert.equal(counts.closed,1);assert.equal(input.idpromStudioSkinVersion,undefined);
 assert.deepEqual(Array.from(new Uint8Array(await input.arrayBuffer())),Array.from(new TextEncoder().encode('immutable canonical input')));
});
await test('only the same successful Blob reuses evidence and cached arrays cannot be mutated',async()=>{
 const input=photo(),{args,counts}=environment(),a=await captureStudioSkinEvidence(input,args),b=await captureStudioSkinEvidence(input,{decode(){throw Error('cached source must not decode')}});
 assert.equal(a,b);assert.throws(()=>a.face[0][0]=.9,TypeError);assert.throws(()=>a.labels[0]=0,TypeError);
 await captureStudioSkinEvidence(photo(),args);assert.equal(counts.decode,2);assert.equal(counts.segment,2);
 assert.equal(clearStudioSkinEvidence(input),true);await captureStudioSkinEvidence(input,args);assert.equal(counts.decode,3);
});
await test('a cancelled call does not touch models or seed the success cache',async()=>{
 const input=photo(),controller=new AbortController(),{args,counts}=environment();controller.abort();
 await assert.rejects(captureStudioSkinEvidence(input,{...args,signal:controller.signal}),{name:'AbortError'});assert.equal(counts.decode,0);
 await captureStudioSkinEvidence(input,args);assert.equal(counts.decode,1);
});
await test('cancellation during delayed segmentation closes late masks and permits retry',async()=>{
 const input=photo(),hold=deferred(),controller=new AbortController(),first=environment({hold});
 const pending=captureStudioSkinEvidence(input,{...first.args,signal:controller.signal}),finish=await hold.promise;controller.abort();
 await assert.rejects(pending,{name:'AbortError'});finish();await Promise.resolve();assert.equal(first.counts.closed,1);
 const next=environment();await captureStudioSkinEvidence(input,next.args);assert.equal(next.counts.decode,1);assert.equal(next.counts.segment,1);
});
await test('getter-only App cancellation interrupts preparation without listener methods',async()=>{
 const input=photo(),gate=deferred(),env=environment();let stopped=false;
 const pending=captureStudioSkinEvidence(input,{...env.args,decode:()=>gate.promise,signal:{get aborted(){return stopped}}});
 stopped=true;await assert.rejects(pending,{name:'AbortError'});gate.resolve(env.image);await Promise.resolve();assert.equal(env.counts.detect,0);
 await captureStudioSkinEvidence(input,env.args);assert.equal(env.counts.segment,1);
});
await test('invalid landmarks fail before segmentation and failed evidence is retryable',async()=>{
 const input=photo(),bad=environment({landmarks:face().slice(0,20)});await assert.rejects(captureStudioSkinEvidence(input,bad.args),{code:'studio_skin_evidence_invalid'});assert.equal(bad.counts.segment,0);
 const valid=environment();await captureStudioSkinEvidence(input,valid.args);assert.equal(valid.counts.segment,1);
});
await test('oversized masks and invalid labels are rejected after releasing model memory',async()=>{
 for(const options of [{maskWidth:40000,maskHeight:1000,labels:new Uint8Array(1)},{labels:new Uint8Array(256).fill(9)},{labels:new Uint8Array(250)}]){
  const env=environment(options);await assert.rejects(captureStudioSkinEvidence(photo(),env.args),{code:'studio_skin_evidence_invalid'});assert.equal(env.counts.closed,1);
 }
});
await test('native560×637 MediaPipe labels are sampled to bounded wire coordinates and released',async()=>{
 const width=560,height=637,labels=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)labels[y*width+x]=(Math.floor(x/70)+Math.floor(y/80))%6;
 const env=environment({width,height,maskWidth:width,maskHeight:height,labels}),evidence=await captureStudioSkinEvidence(photo(),env.args);
 assert.equal(evidence.width,width);assert.equal(evidence.height,height);assert.equal(evidence.maskWidth,225);assert.equal(evidence.maskHeight,256);assert.equal(env.counts.closed,1);
 for(const [x,y]of [[0,0],[224,255],[110,128]]){
  const sx=Math.min(width-1,Math.floor((x+.5)*width/evidence.maskWidth)),sy=Math.min(height-1,Math.floor((y+.5)*height/evidence.maskHeight));
  assert.equal(evidence.labels[y*evidence.maskWidth+x],labels[sy*width+sx]);
 }
 assert(JSON.stringify(evidence).length<300000);assert.doesNotThrow(()=>parseStudioSkinEvidence(evidence));
});
await test('off-frame landmarks and oversized decoded surfaces cannot enter the pipeline',async()=>{
 const landmarks=face();landmarks[0].x=3;
 for(const options of [{landmarks},{width:9000,height:9000}]){
  const env=environment(options);await assert.rejects(captureStudioSkinEvidence(photo(),env.args),{code:'studio_skin_evidence_invalid'});
 }
});
await test('provider failures do not poison future preparation and generated masters are refused',async()=>{
 const input=photo(),env=environment();await assert.rejects(captureStudioSkinEvidence(input,{...env.args,landmarker:()=>Promise.reject(Error('model unavailable'))}),/model unavailable/);
 await captureStudioSkinEvidence(input,env.args);
 for(const property of ['idpromJobId','idpromStudioSkinVersion']){const result=photo();result[property]='prior-result';await assert.rejects(captureStudioSkinEvidence(result,env.args),{code:'studio_skin_evidence_invalid'})}
});
console.log(JSON.stringify({passed,scope:'Canonical source evidence, masks, cache identity, cancellation, orientation and model cleanup; no image generation, network or financial writes.'}));
