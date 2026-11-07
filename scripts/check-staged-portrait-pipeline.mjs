import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {STUDIO_SKIN_WORKFLOW_VERSION,STUDIO_SKIN_PREVIOUS_VERSION,parseStudioSkinEvidence} from '../studio-skin-treatment.js';
import {parseStudioSkinRequest,prepareStudioSkinInput} from '../studio-skin-input.js';
import {validateProductionPortrait,productionPortraitPrompt,processProductionPortrait,portraitIdentityCrop} from '../production-portrait-pipeline.js';
import {PRODUCTION_HAIR_CATALOG,FREE_PNG_HAIR_CATALOG} from '../hairstyle-catalog.js';
const oval=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const eyes=[[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],[263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249]],brows=[[70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285]],lips=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const light=(r,g,b)=>.2126*r+.7152*g+.0722*b;
const pixel=(f,x,y)=>4*(Math.floor(y*f.height)*f.width+Math.floor(x*f.width));
function fixture({width=256,height=320,colour=[184,143,124],shadow=false,red=false,pores=false,neutral=false}={}){
 const face=Array.from({length:468},()=>[.5,.44]);
 oval.forEach((id,i)=>{const a=i/oval.length*Math.PI*2;face[id]=[.5+.25*Math.sin(a),.44-.32*Math.cos(a)]});
 const ellipse=(ids,cx,cy,rx,ry)=>ids.forEach((id,i)=>{const a=i/ids.length*Math.PI*2;face[id]=[cx+rx*Math.cos(a),cy+ry*Math.sin(a)]});
 ellipse(eyes[0],.39,.36,.056,.024);ellipse(eyes[1],.61,.36,.056,.024);ellipse(brows[0],.39,.30,.061,.014);ellipse(brows[1],.61,.30,.061,.014);ellipse(lips,.5,.625,.064,.025);face[98]=[.475,.51];face[327]=[.525,.51];
 const mw=128,mh=160,labels=Array(mw*mh).fill(0),pixels=new Uint8ClampedArray(width*height*4);
 const skin=(x,y)=>((x-.5)/.25)**2+((y-.44)/.32)**2<1||y>=.69&&y<.96&&Math.abs(x-.5)<.15;
 for(let y=0;y<mh;y++)for(let x=0;x<mw;x++)labels[y*mw+x]=skin((x+.5)/mw,(y+.5)/mh)?((y+.5)/mh>.73?2:3):neutral&&y>mh*.7?4:0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const sx=(x+.5)/width,sy=(y+.5)/height,i=(y*width+x)*4,label=labels[Math.min(mh-1,Math.floor(sy*mh))*mw+Math.min(mw-1,Math.floor(sx*mw))];
  let rgb=label===2||label===3?[...colour]:neutral?[198,190,174]:[70,130,220];
  if(label===2||label===3){
   const shade=shadow?37*Math.exp(-(((sx-.36)/.095)**2+((sy-.51)/.13)**2)*2):0,pore=pores?((x%2?1:-1)*(y%3?2:-2)):0;
   rgb=rgb.map(v=>v-shade+pore);
   if(red){const a=Math.exp(-(((sx-.63)/.065)**2+((sy-.51)/.08)**2)*2);rgb=rgb.map((v,c)=>v+a*[20,-5,-7][c])}
  }
  pixels.set([...rgb,255],i);
 }
 return {width,height,pixels,evidence:{version:STUDIO_SKIN_WORKFLOW_VERSION,width,height,face,maskWidth:mw,maskHeight:mh,labels}};
}
let passed=0;
const test=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
const fieldsFor=f=>({portraitMode:'female',femaleEyeStyle:'natural',studioSkinVersion:STUDIO_SKIN_WORKFLOW_VERSION,studioSkinEvidence:JSON.stringify(f.evidence)});
const pngFor=f=>sharp(f.pixels,{raw:{width:f.width,height:f.height,channels:4}}).png().toBuffer();
const raw=async image=>(await sharp(image).ensureAlpha().raw().toBuffer({resolveWithObject:true}));
const inputFor=async f=>({buffer:await pngFor(f),mimetype:'image/png',originalname:'untouched-upload.png'});
await test('all historical female and male prompt variants retain their entire baseline bytes',()=>{
 const baseline={natural:'80bba8c966159942996781c04a83ed03e4277011d692247ea7d3ef27ca6b9970',makeup:'5d40dfb01c1b4b3034fa2811ee2bf0ae01cfdf2efc8d0edae864bb67e64bf34a','korean-rosy-v1':'a0cc46779f5dd170623a69025871b0193dc2064e10846661a9a75eac42164c0c','soft-rosy-v1':'7c24a88e3d2025aab48fdbb0ec13c79fd7fc586d6ecc102df83cbb39133d6785'};
 const selected=[{gender:'female'},{gender:'male'},...PRODUCTION_HAIR_CATALOG,...FREE_PNG_HAIR_CATALOG];
 for(const [style,hash]of Object.entries(baseline))assert.equal(createHash('sha256').update(JSON.stringify(selected.map(s=>productionPortraitPrompt(s,style)))).digest('hex'),hash,style);
 for(const s of selected.filter(s=>s.gender==='male'))assert.equal(productionPortraitPrompt(s,'natural',{studioSkinVersion:STUDIO_SKIN_WORKFLOW_VERSION}),productionPortraitPrompt(s,'natural'));
});
await test('pending v1 and old-tab prompt variants retain their complete released bytes',()=>{
 const selected=[{gender:'female'},{gender:'male'},...PRODUCTION_HAIR_CATALOG,...FREE_PNG_HAIR_CATALOG];
 const baseline='e71a8383e3b23a44961fbb72ce7ebe42207fd56480a56f4c154a2f36ac86cd21';
 for(const style of ['natural','makeup','korean-rosy-v1','soft-rosy-v1'])assert.equal(createHash('sha256').update(JSON.stringify(selected.map(s=>productionPortraitPrompt(s,style,{studioSkinVersion:STUDIO_SKIN_PREVIOUS_VERSION})))).digest('hex'),baseline,style);
});
await test('staged female prompts preserve prepared skin and remove generation-time cosmetics and relighting',()=>{
 const prompts=['natural','makeup','korean-rosy-v1','soft-rosy-v1'].map(style=>productionPortraitPrompt({gender:'female'},style,{studioSkinVersion:STUDIO_SKIN_WORKFLOW_VERSION}));
 for(const p of prompts){
  assert(p.includes('PREPARED PHOTO-STUDIO SKIN BASE'));
  assert(p.includes('PREPARED FACE / NECK LIGHT'));
  assert(p.includes('applied locally AFTER'));
  assert(p.includes('fine original pores'));
  assert(p.includes('AUTOMATIC SOFT FOCUS'));assert(p.includes('Fine wrinkle and shallow crease contrast has already been reduced'));assert(p.includes('Do not restore old wrinkle darkness'));assert(!p.includes('stable identifying marks, age lines'));
  for(const conflict of ['FRESH KOREAN ROSE-PINK','LIPS — NATURAL KOREAN','COHERENT NATURAL FACE / NECK LIGHT','COHERENT FACE / NECK FILL LIGHT','without visible pores','SKIN AND LIGHT —','KOREAN ROSY V1 —','SOFT ROSY V1 —','change complexion, fine skin texture, temporary acne and broad lighting'])assert(!p.includes(conflict),conflict);
  assert(p.includes('DEEP WIDE ROUND U'));assert(p.includes('LOWER FACE AND EAR ANATOMY PRIORITY'));assert(p.includes('FINAL FEMALE POSE PRIORITY'));
 }
 assert(prompts.every(p=>p===prompts[0]),'Cosmetic choice must not change the bare-skin AI request');
});
await test('declared evidence fails validation before the provider and legacy input remains the same object',async()=>{
 const f=fixture({shadow:true}),input=await inputFor(f),fields=fieldsFor(f);
 assert.equal(parseStudioSkinRequest({},'female'),null);
 assert.equal((await prepareStudioSkinInput(input,{},'male')).input,input);
 for(const patch of [{studioSkinVersion:'old'},{studioSkinEvidence:''},{portraitMode:'male'},{femaleEyeStyle:'unknown'}])assert.throws(()=>validateProductionPortrait(input,{...fields,...patch}));
 await assert.rejects(prepareStudioSkinInput(input,{...fields,studioSkinEvidence:JSON.stringify({...f.evidence,width:f.width+1})},'female'),{code:'studio_skin_source_mismatch'});
 const empty={...f.evidence,labels:f.evidence.labels.map(()=>0)};
 await assert.rejects(prepareStudioSkinInput(input,{...fields,studioSkinEvidence:JSON.stringify(empty)},'female'),{code:'studio_skin_evidence_invalid'});
 let called=0;
 await assert.rejects(processProductionPortrait({input,fields:{...fields,studioSkinEvidence:'{'},root:new URL('..',import.meta.url).pathname,removeBackground:async v=>v,requestPortrait:async()=>{called++;throw Error('must not call')}}));
 assert.equal(called,0);
});
await test('wire versions remain explicit and evidence cannot cross between v1 and v2',()=>{
 const f=fixture(),fields=fieldsFor(f);
 for(const version of [STUDIO_SKIN_PREVIOUS_VERSION,STUDIO_SKIN_WORKFLOW_VERSION]){
  const evidence={...f.evidence,version};
  assert.equal(parseStudioSkinEvidence(evidence).version,version);
  assert.equal(parseStudioSkinRequest({...fields,studioSkinVersion:version,studioSkinEvidence:JSON.stringify(evidence)},'female').version,version);
  const mismatch=version===STUDIO_SKIN_PREVIOUS_VERSION?STUDIO_SKIN_WORKFLOW_VERSION:STUDIO_SKIN_PREVIOUS_VERSION;
  assert.throws(()=>parseStudioSkinRequest({...fields,studioSkinVersion:mismatch,studioSkinEvidence:JSON.stringify(evidence)},'female'),{code:'studio_skin_evidence_invalid'});
 }
 assert.throws(()=>parseStudioSkinEvidence({...f.evidence,version:'studio-skin-stages-v3'}));
});
await test('v1 retains its released PNG while v2 adds actual native soft-focus pixels before AI',async()=>{
 const f=fixture({shadow:true,red:true,pores:true}),input=await inputFor(f),before=Buffer.from(input.buffer);
 const oldEvidence={...f.evidence,version:STUDIO_SKIN_PREVIOUS_VERSION},oldFields={...fieldsFor(f),studioSkinVersion:STUDIO_SKIN_PREVIOUS_VERSION,studioSkinEvidence:JSON.stringify(oldEvidence)};
 const old=await prepareStudioSkinInput(input,oldFields,'female'),latest=await prepareStudioSkinInput(input,fieldsFor(f),'female');
 assert.equal(old.version,STUDIO_SKIN_PREVIOUS_VERSION);assert.equal(old.report.version,STUDIO_SKIN_PREVIOUS_VERSION);assert.equal(old.report.softFocus,undefined);
 assert.equal(createHash('sha256').update(old.input.buffer).digest('hex'),'71f0dda865c6bf643f0022450b35e0cc500a7292cbfbd0cc412e2818b4817b98');
 const oldRaw=await raw(old.input.buffer),latestRaw=await raw(latest.input.buffer);
 assert.equal(createHash('sha256').update(oldRaw.data).digest('hex'),'7a8dd8aef3d3c46fdd7309e3867afe3a1fa7dcfeb42b4233ed34d469ff97f5aa');
 assert(latest.report.softFocus,'The new automatic detail pass must run before encoding');assert.notDeepEqual(latestRaw.data,oldRaw.data);
 assert.deepEqual([latestRaw.info.width,latestRaw.info.height,latestRaw.info.channels],[f.width,f.height,4]);
 for(let i=3;i<latestRaw.data.length;i+=4)assert.equal(latestRaw.data[i],oldRaw.data[i]);
 assert.deepEqual(input.buffer,before);
});
await test('real base processing preserves native dimensions, original bytes and alpha before AI',async()=>{
 const f=fixture({shadow:true,red:true,pores:true}),input=await inputFor(f),before=Buffer.from(input.buffer);
 const p=await prepareStudioSkinInput(input,fieldsFor(f),'female'),decoded=await raw(p.input.buffer);
 assert(p.staged);assert.equal(p.version,STUDIO_SKIN_WORKFLOW_VERSION);assert.equal(p.input.mimetype,'image/png');
 assert.deepEqual([decoded.info.width,decoded.info.height,decoded.info.channels],[f.width,f.height,4]);
 assert.notDeepEqual(decoded.data,Buffer.from(f.pixels));assert.deepEqual(input.buffer,before);
 const k=pixel(f,.36,.51);assert(light(...decoded.data.subarray(k,k+3))>light(...f.pixels.slice(k,k+3))+5);
 for(let i=3;i<decoded.data.length;i+=4)assert.equal(decoded.data[i],f.pixels[i]);
});
await test('display orientation is baked into the derivative and evidence dimensions must match it',async()=>{
 const f=fixture({width:320,height:256}),normal=await pngFor(f);
 const rotated=await sharp(normal).withMetadata({orientation:6}).jpeg({quality:95}).toBuffer();
 const oriented=await sharp(rotated).rotate().ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const e=fixture({width:oriented.info.width,height:oriented.info.height});
 const p=await prepareStudioSkinInput({buffer:rotated,mimetype:'image/jpeg'},fieldsFor(e),'female'),decoded=await raw(p.input.buffer);
 assert.deepEqual([decoded.info.width,decoded.info.height],[256,320]);
 assert.equal((await sharp(p.input.buffer).metadata()).orientation,undefined);
});
await test('actual production handler sends the treated PNG and matching identity crop in one ordered request',async()=>{
 const f=fixture({shadow:true,red:true,pores:true}),input=await inputFor(f),fields={...fieldsFor(f),faceIdentityBox:JSON.stringify([.2,.12,.8,.82]),femaleEyeStyle:'korean-rosy-v1',outfitReferencePath:'/assets/job-uniforms/unused-makeup-reference.png'};
 const expected=await prepareStudioSkinInput(input,fields,'female'),expectedCrop=await portraitIdentityCrop(expected.input,[.2,.12,.8,.82]);
 let calls=0,captured;const trace=[];
 const output=await processProductionPortrait({input,fields,root:new URL('..',import.meta.url).pathname,key:'inert-local-test',onStage:async s=>trace.push(s),requestPortrait:async options=>{calls++;captured=options;trace.push('provider');return{png:options.portrait}},removeBackground:async image=>{
  trace.push('remove-background');const r=await raw(image);for(let y=0;y<r.info.height;y++)for(let x=0;x<r.info.width;x++)if(x<4||y<4||x>=r.info.width-4||y>=r.info.height-4)r.data[(y*r.info.width+x)*4+3]=0;
  return sharp(r.data,{raw:{width:r.info.width,height:r.info.height,channels:4}}).png().toBuffer();
 }});
 assert.equal(calls,1);assert.equal(captured.portraitMime,'image/png');assert.deepEqual(captured.portrait,expected.input.buffer);assert.notDeepEqual(captured.portrait,input.buffer);assert.deepEqual(captured.identity,expectedCrop);
 assert.equal(captured.outfit,undefined);assert(!captured.prompt.includes('OUTFIT LIGHTING REFERENCE'));assert(!captured.prompt.includes('Apply KOREAN ROSY V1 cosmetics'));assert(captured.prompt.includes('retaining the already prepared skin, lip colour and lighting unchanged'));
 assert.deepEqual(trace,['skin-base','generation','provider','matting','remove-background','edges']);
 const decoded=await raw(output);assert.deepEqual([decoded.info.width,decoded.info.height],[f.width,f.height]);assert.equal(decoded.data[3],0);assert.equal(decoded.data[pixel(f,.5,.5)+3],255);
});
console.log(JSON.stringify({passed,failed:0,scope:'Actual preprocessing, validation and production handler with inert provider/matting. One request receives corrected native PNG plus its own corrected identity crop; historical prompt fingerprints unchanged. No provider, account or payment requests.'}));
