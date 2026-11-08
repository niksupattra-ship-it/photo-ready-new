import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {seedreamReviewPayload,REVIEW_SEEDREAM_MODEL} from '../seedream-review-transport.js';
import {loadStudioSkinLightReference,STUDIO_SKIN_LIGHT_REFERENCE_PATH} from '../studio-skin-light-reference.js';
import sharp from 'sharp';
import {STUDIO_SKIN_CONTINUOUS_VERSION as STUDIO_SKIN_WORKFLOW_VERSION,STUDIO_SKIN_REFERENCE_VERSION,STUDIO_SKIN_RETOUCH_VERSION,STUDIO_SKIN_SOFT_VERSION,STUDIO_SKIN_PREVIOUS_VERSION,parseStudioSkinEvidence} from '../studio-skin-treatment.js';
import {parseStudioSkinRequest,prepareStudioSkinInput} from '../studio-skin-input.js';
import {applyStudioSkinBase} from '../studio-skin-treatment.js';
import {applyStudioSkinSoftFocus} from '../studio-skin-soft-focus.js';
import {applyStudioSkinRetouch} from '../studio-skin-retouch.js';
import {normalizeStudioReferenceIllumination} from '../studio-reference-illumination.js';
import {repairStudioSkinContinuity} from '../studio-skin-continuity.js';
import {validateProductionPortrait,productionPortraitPrompt,processProductionPortrait,portraitIdentityCrop,studioReferenceIdentityBox} from '../production-portrait-pipeline.js';
import {PRODUCTION_HAIR_CATALOG,FREE_PNG_HAIR_CATALOG} from '../hairstyle-catalog.js';
const oval=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const eyes=[[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],[263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249]],brows=[[70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285]],lips=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const light=(r,g,b)=>.2126*r+.7152*g+.0722*b;
const pixel=(f,x,y)=>4*(Math.floor(y*f.height)*f.width+Math.floor(x*f.width));
function fixture({width=256,height=320,colour=[184,143,124],shadow=false,red=false,pores=false,neutral=false,retouch=false}={}){
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
   if(retouch){
    const acne=Math.exp(-(((sx-.62)/.018)**2+((sy-.50)/.018)**2)*2);
    rgb=rgb.map((v,c)=>v+acne*[36,-22,-18][c]);
    const forehead=sx>.34&&sx<.66?23*Math.exp(-(((sy-(.226+.012*Math.cos((sx-.5)*12)))/.0035)**2)):0;
    const underEye=sx>.32&&sx<.46?18*Math.exp(-(((sy-(.415+.009*Math.cos((sx-.39)*19)))/.0035)**2)):0;
    rgb=rgb.map(v=>v-forehead-underEye);
    const highlight=Math.exp(-(((sx-.52)/.043)**2+((sy-.18)/.035)**2)*2);
    rgb=rgb.map((v,c)=>v*(1-highlight)+[250,247,243][c]*highlight);
   }
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
await test('pending v2 prompts retain their complete released soft-focus bytes',()=>{
 const selected=[{gender:'female'},{gender:'male'},...PRODUCTION_HAIR_CATALOG,...FREE_PNG_HAIR_CATALOG];
 const baseline='3ea94586eae58e63a39f06a7a56e15f8ba4efacacb0707fd42358a2f8479f35a';
 for(const style of ['natural','makeup','korean-rosy-v1','soft-rosy-v1'])assert.equal(createHash('sha256').update(JSON.stringify(selected.map(s=>productionPortraitPrompt(s,style,{studioSkinVersion:STUDIO_SKIN_SOFT_VERSION})))).digest('hex'),baseline,style);
});
await test('pending v3 prompts retain their complete released repair and matte bytes',()=>{
 const selected=[{gender:'female'},{gender:'male'},...PRODUCTION_HAIR_CATALOG,...FREE_PNG_HAIR_CATALOG];
 for(const style of ['natural','makeup','korean-rosy-v1','soft-rosy-v1'])assert.equal(createHash('sha256').update(JSON.stringify(selected.map(s=>productionPortraitPrompt(s,style,{studioSkinVersion:STUDIO_SKIN_RETOUCH_VERSION})))).digest('hex'),'80f617d1544ad105632133ed5e6259925ca310dfb928f9b949a14871afff5122');
});
await test('v3 explicitly removes acne and wrinkles, refines pores and reduces highlights before optional cosmetics',()=>{
 const prompts=['natural','makeup','korean-rosy-v1','soft-rosy-v1'].map(style=>productionPortraitPrompt({gender:'female'},style,{studioSkinVersion:STUDIO_SKIN_RETOUCH_VERSION}));
 for(const p of prompts){
  assert(p.includes('PREPARED PHOTO-STUDIO SKIN BASE'));
  assert(p.includes('PREPARED FACE / NECK LIGHT'));
  assert(p.includes('applied locally AFTER'));
  assert(p.includes('AUTOMATIC ACNE / WRINKLE REMOVAL AND MATTE SKIN'));
  assert(p.includes('REMOVE visible active acne'));assert(p.includes('REMOVE remaining facial skin wrinkles'));
  assert(p.includes('Do not merely lighten the redness or halve the darkness'));
  assert(p.includes('fine, evenly distributed photographic pores'));assert(p.includes('REDUCE remaining oily/specular skin highlights'));
  assert(p.includes('This authorizes selective repair of already visible affected skin'));
  assert(p.includes('FINAL SKIN COMPLETION PRIORITY'));
  assert(!p.includes('reconstruct only genuinely missing skin to match the prepared base'));
  assert(!p.includes('stable identifying marks, age lines'));
  for(const conflict of ['FRESH KOREAN ROSE-PINK','LIPS — NATURAL KOREAN','COHERENT NATURAL FACE / NECK LIGHT','COHERENT FACE / NECK FILL LIGHT','without visible pores','SKIN AND LIGHT —','KOREAN ROSY V1 —','SOFT ROSY V1 —','change complexion, fine skin texture, temporary acne and broad lighting'])assert(!p.includes(conflict),conflict);
  assert(p.includes('DEEP WIDE ROUND U'));assert(p.includes('LOWER FACE AND EAR ANATOMY PRIORITY'));assert(p.includes('FINAL FEMALE POSE PRIORITY'));
 }
 assert(prompts.every(p=>p===prompts[0]),'Cosmetic choice must not change the bare-skin AI request');
});
await test('pending v4 reference-lit prompts retain their complete released bytes',()=>{
 const selected=[{gender:'female'},{gender:'male'},...PRODUCTION_HAIR_CATALOG,...FREE_PNG_HAIR_CATALOG];
 for(const style of ['natural','makeup','korean-rosy-v1','soft-rosy-v1'])assert.equal(createHash('sha256').update(JSON.stringify(selected.map(option=>productionPortraitPrompt(option,style,{studioSkinVersion:STUDIO_SKIN_REFERENCE_VERSION})))).digest('hex'),'247a933a4e59d9896dc4cd12ed5414e9a875fade6cb862383ee1266748395ff4');
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
await test('wire versions remain explicit and evidence cannot cross between v1 through v5',()=>{
 const f=fixture(),fields=fieldsFor(f);
 for(const version of [STUDIO_SKIN_PREVIOUS_VERSION,STUDIO_SKIN_SOFT_VERSION,STUDIO_SKIN_RETOUCH_VERSION,STUDIO_SKIN_REFERENCE_VERSION,STUDIO_SKIN_WORKFLOW_VERSION]){
  const evidence={...f.evidence,version};
  assert.equal(parseStudioSkinEvidence(evidence).version,version);
  assert.equal(parseStudioSkinRequest({...fields,studioSkinVersion:version,studioSkinEvidence:JSON.stringify(evidence)},'female').version,version);
  for(const mismatch of [STUDIO_SKIN_PREVIOUS_VERSION,STUDIO_SKIN_SOFT_VERSION,STUDIO_SKIN_RETOUCH_VERSION,STUDIO_SKIN_REFERENCE_VERSION,STUDIO_SKIN_WORKFLOW_VERSION].filter(v=>v!==version))assert.throws(()=>parseStudioSkinRequest({...fields,studioSkinVersion:mismatch,studioSkinEvidence:JSON.stringify(evidence)},'female'),{code:'studio_skin_evidence_invalid'});
 }
 assert.throws(()=>parseStudioSkinEvidence({...f.evidence,version:'studio-skin-stages-v999'}));
});
await test('v1 through v4 retain released PNG pixels while v5 adds ordered illumination and continuity',async()=>{
 const f=fixture({shadow:true,red:true,pores:true}),input=await inputFor(f),before=Buffer.from(input.buffer);
 const prepare=version=>prepareStudioSkinInput(input,{...fieldsFor(f),studioSkinVersion:version,studioSkinEvidence:JSON.stringify({...f.evidence,version})},'female');
 const old=await prepare(STUDIO_SKIN_PREVIOUS_VERSION),soft=await prepare(STUDIO_SKIN_SOFT_VERSION),repair=await prepare(STUDIO_SKIN_RETOUCH_VERSION),reference=await prepare(STUDIO_SKIN_REFERENCE_VERSION),latest=await prepare(STUDIO_SKIN_WORKFLOW_VERSION);
 assert.equal(old.version,STUDIO_SKIN_PREVIOUS_VERSION);assert.equal(old.report.version,STUDIO_SKIN_PREVIOUS_VERSION);assert.equal(old.report.softFocus,undefined);assert.equal(old.report.retouch,undefined);
 assert.equal(createHash('sha256').update(old.input.buffer).digest('hex'),'71f0dda865c6bf643f0022450b35e0cc500a7292cbfbd0cc412e2818b4817b98');
 const oldRaw=await raw(old.input.buffer),softRaw=await raw(soft.input.buffer),latestRaw=await raw(latest.input.buffer);
 assert.equal(createHash('sha256').update(oldRaw.data).digest('hex'),'7a8dd8aef3d3c46fdd7309e3867afe3a1fa7dcfeb42b4233ed34d469ff97f5aa');
 assert.equal(soft.version,STUDIO_SKIN_SOFT_VERSION);assert(soft.report.softFocus);assert.equal(soft.report.retouch,undefined);
 assert.equal(createHash('sha256').update(soft.input.buffer).digest('hex'),'b06d8bc1fb4a39f10ab529bb2fa91ca550bc8611cc3889f35d3878d414d3c0f7');
 assert.equal(createHash('sha256').update(softRaw.data).digest('hex'),'26f7f1e1b44ba69e2e7f43dc806967826832f5cbdde5f834dad8dbe8e8474799');
 assert.equal(createHash('sha256').update(repair.input.buffer).digest('hex'),'c6d68a95d0ef9bd2fb85158b9a0fbaf5cd4b4ddc984dfe807e60eb7161827915');
 assert.equal(createHash('sha256').update((await raw(repair.input.buffer)).data).digest('hex'),'184cc0048d6def716efb97a6c4dbabdbb883fa2bd664fbb09d2387681c0ec30e');
 assert.equal(repair.report.referenceQuality,undefined);assert(reference.report.referenceQuality);assert.equal(reference.report.illumination,undefined);assert.equal(reference.report.skinContinuity,undefined);assert.deepEqual(reference.input.buffer,repair.input.buffer);
 assert(latest.report.referenceQuality);assert(latest.report.illumination);assert(latest.report.skinContinuity);
 assert(latest.report.softFocus);assert(latest.report.retouch,'The acne/wrinkle/matte repair must run before encoding');assert.notDeepEqual(latestRaw.data,softRaw.data);
 assert.deepEqual([latestRaw.info.width,latestRaw.info.height,latestRaw.info.channels],[f.width,f.height,4]);
 for(let i=3;i<latestRaw.data.length;i+=4)assert.equal(latestRaw.data[i],oldRaw.data[i]);assert.deepEqual(input.buffer,before);
});
await test('the v3 encoded conditioning image repairs acne and crease contrast and lowers skin highlights',async()=>{
 const f=fixture({pores:true,retouch:true}),input=await inputFor(f),fields=fieldsFor(f);
 const prepare=version=>prepareStudioSkinInput(input,{...fields,studioSkinVersion:version,studioSkinEvidence:JSON.stringify({...f.evidence,version})},'female');
 const before=await raw((await prepare(STUDIO_SKIN_SOFT_VERSION)).input.buffer),after=await raw((await prepare(STUDIO_SKIN_RETOUCH_VERSION)).input.buffer);
 const k=pixel(f,.62,.50),healthy=pixel(f,.66,.54),hot=pixel(f,.52,.18),red=p=>p[k]-p[k+1],healthyRed=before.data[healthy]-before.data[healthy+1];
 assert(Math.abs(red(after.data)-healthyRed)<Math.abs(red(before.data)-healthyRed)*.25+2,'The acne lesion must approach healthy skin chroma, not merely receive a soft filter');
 assert(light(...after.data.subarray(hot,hot+3))<Math.min(235,light(...before.data.subarray(hot,hot+3))-8),'Skin hot spots must actually be reduced before AI');
 const crease=(data,underEye=false)=>{let sum=0,n=0;for(let x=Math.floor(f.width*(underEye?.33:.35));x<f.width*(underEye?.45:.65);x++){const sx=(x+.5)/f.width,y=Math.round(f.height*(underEye?.415+.009*Math.cos((sx-.39)*19):.226+.012*Math.cos((sx-.5)*12))-.5);const Y=yy=>{const i=(yy*f.width+x)*4;return light(data[i],data[i+1],data[i+2])};sum+=(Y(y-4)+Y(y+4))/2-Y(y);n++}return sum/n};
 const creaseMetrics=[false,true].map(underEye=>{const beforeContrast=crease(before.data,underEye),afterContrast=crease(after.data,underEye);return {region:underEye?'under-eye':'forehead',beforeContrast,afterContrast,retained:afterContrast/beforeContrast}});
 assert(creaseMetrics.every(m=>m.retained<.35),'Encoded wrinkles must be repaired rather than only softened again: '+JSON.stringify(creaseMetrics));
 assert.deepEqual([after.info.width,after.info.height],[f.width,f.height]);for(let i=3;i<after.data.length;i+=4)assert.equal(after.data[i],before.data[i]);
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
 const f=fixture({shadow:true,red:true,pores:true,retouch:true}),input=await inputFor(f),fields={...fieldsFor(f),faceIdentityBox:JSON.stringify([.2,.12,.8,.82]),femaleEyeStyle:'korean-rosy-v1',outfitReferencePath:'/assets/job-uniforms/unused-makeup-reference.png'};
 const expected=await prepareStudioSkinInput(input,fields,'female'),expectedCrop=await portraitIdentityCrop(expected.input,[.2,.12,.8,.82]);
 let calls=0,captured;const trace=[];
 const output=await processProductionPortrait({input,fields,root:new URL('..',import.meta.url).pathname,key:'inert-local-test',onStage:async s=>trace.push(s),requestPortrait:async options=>{calls++;captured=options;trace.push('provider');return{png:options.portrait}},removeBackground:async image=>{
  trace.push('remove-background');const r=await raw(image);for(let y=0;y<r.info.height;y++)for(let x=0;x<r.info.width;x++)if(x<4||y<4||x>=r.info.width-4||y>=r.info.height-4)r.data[(y*r.info.width+x)*4+3]=0;
  return sharp(r.data,{raw:{width:r.info.width,height:r.info.height,channels:4}}).png().toBuffer();
 }});
 assert.equal(calls,1);assert.equal(captured.portraitMime,'image/png');assert.deepEqual(captured.portrait,expected.input.buffer);assert.notDeepEqual(captured.portrait,input.buffer);assert.deepEqual(captured.identity,expectedCrop);
 assert.equal(captured.outfit,undefined);assert(!captured.prompt.includes('OUTFIT LIGHTING REFERENCE'));assert(!captured.prompt.includes('Apply KOREAN ROSY V1 cosmetics'));assert(captured.prompt.includes('normalizing residual colour casts, exposure and shadows continuously through all face/ear/neck skin'));assert.deepEqual(captured.skinReference,await loadStudioSkinLightReference(new URL('..',import.meta.url).pathname));assert(captured.prompt.includes('IMAGE 3, THE LAST IMAGE'));assert(!captured.prompt.includes('retaining the already prepared skin, lip colour and lighting unchanged'));assert(expected.report.retouch);assert(expected.report.softFocus);
 assert.deepEqual(trace,['skin-base','generation','provider','matting','remove-background','edges']);
 const decoded=await raw(output);assert.deepEqual([decoded.info.width,decoded.info.height],[f.width,f.height]);assert.equal(decoded.data[3],0);assert.equal(decoded.data[pixel(f,.5,.5)+3],255);
});
await test('v4 targets adaptive whole-face and neck relighting rather than retaining source light',()=>{
 const selected=[{gender:'female'},...PRODUCTION_HAIR_CATALOG.filter(s=>s.gender==='female'),...FREE_PNG_HAIR_CATALOG.filter(s=>s.gender==='female')];
 for(const style of ['natural','makeup','korean-rosy-v1','soft-rosy-v1'])for(const option of selected){
  const prompt=productionPortraitPrompt(option,style,{studioSkinVersion:STUDIO_SKIN_REFERENCE_VERSION});
  for(const required of ['ADAPTIVE RELIGHTING','Re-establish one broad softly diffused frontal key','The source and identity crop are NOT authorities for retaining unwanted lighting','authentic depth of complexion','REMOVE visible active acne','fine, evenly distributed photographic pores','selected cosmetics are applied locally AFTER','FINAL REFERENCE LIGHTING PRIORITY'])assert(prompt.includes(required),required);
  for(const conflict of ["Keep Image 1's prepared white balance",'Keep the fill-light and white balance already present','Preserve the already prepared exposure','retaining the already prepared skin, lip colour and lighting unchanged','additional whole-face exposure change','while keeping the prepared complexion and anatomical shading'])assert(!prompt.includes(conflict),conflict);
  assert(prompt.includes('DEEP WIDE ROUND U'));assert(prompt.includes('LOWER FACE AND EAR ANATOMY PRIORITY'));assert(prompt.includes('Do not transfer hairstyle-reference skin or head shape'));assert(!prompt.includes('Do not transfer reference skin or head shape'));
 }
});
await test('the fixed JPEG guide is bounded, cached safely and missing or corrupt assets fail closed',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'skin-reference-loader-'));
 try{
  const file=path.join(folder,STUDIO_SKIN_LIGHT_REFERENCE_PATH);await mkdir(path.dirname(file),{recursive:true});
  await assert.rejects(loadStudioSkinLightReference(folder),{code:'studio_skin_reference_unavailable'});
  const valid=await readFile(new URL('../public/assets/skin-light-reference/studio-soft-frontal-v1.jpg',import.meta.url));await writeFile(file,valid);
  const first=await loadStudioSkinLightReference(folder);assert.deepEqual(first,valid);first[0]=0;assert.deepEqual(await loadStudioSkinLightReference(folder),valid,'Caller mutation cannot alter the cached guide');
  for(const [name,bytes]of [['corrupt',Buffer.alloc(1500)],['oversized',Buffer.alloc(300*1024+1)],['png',await sharp(valid).png().toBuffer()],['wide',await sharp(valid).resize(1025,64).jpeg({quality:90}).toBuffer()]]){
   const dir=path.join(folder,name),destination=path.join(dir,STUDIO_SKIN_LIGHT_REFERENCE_PATH);await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,bytes);await assert.rejects(loadStudioSkinLightReference(dir),{code:'studio_skin_reference_unavailable'});
  }
 }finally{await rm(folder,{recursive:true,force:true})}
});
await test('guide delivery is last and correctly indexed for default and selected hair with optional identity crops',async()=>{
 const v4Prompts=[];
 const f=fixture({shadow:true,red:true,pores:true}),input=await inputFor(f),root=new URL('..',import.meta.url).pathname,guide=await loadStudioSkinLightReference(root),hair=PRODUCTION_HAIR_CATALOG.find(s=>s.gender==='female');
 for(const selectedHair of ['',hair.id])for(const identity of [false,true]){
  let captured,calls=0;await processProductionPortrait({input,root,fields:{...fieldsFor(f),studioSkinVersion:STUDIO_SKIN_REFERENCE_VERSION,studioSkinEvidence:JSON.stringify({...f.evidence,version:STUDIO_SKIN_REFERENCE_VERSION}),hairId:selectedHair||'original',skinReference:'/tmp/untrusted-client-reference.jpg',...(identity?{faceIdentityBox:'[0.2,0.12,0.8,0.82]'}:{})},requestPortrait:async options=>{captured=options;calls++;return{png:options.portrait}},removeBackground:async image=>{
   const result=await raw(image);result.data[3]=0;return sharp(result.data,{raw:{width:f.width,height:f.height,channels:4}}).png().toBuffer();
  }});
  v4Prompts.push(captured.prompt);assert.equal(calls,1);assert.equal(Boolean(captured.identity),identity);assert.deepEqual(captured.skinReference,guide);const expected=2+Number(Boolean(captured.hair))+Number(Boolean(captured.identity))+Number(Boolean(captured.outfit));assert(captured.prompt.includes('IMAGE '+expected+', THE LAST IMAGE'));
  assert(captured.prompt.includes('top row is MAGNIFIED'));assert(captured.prompt.includes('never a skin board, collage or grid'));
  const payload=seedreamReviewPayload(captured),images=Array.isArray(payload.image)?payload.image:[payload.image];assert.equal(images.length,expected);assert.equal(images.at(-1),'data:image/jpeg;base64,'+guide.toString('base64'));assert.equal(images[0],'data:image/png;base64,'+captured.portrait.toString('base64'));
 }
 assert.equal(createHash('sha256').update(JSON.stringify(v4Prompts)).digest('hex'),'67585d05e06369445419689595a765ace059d8b6bece90c93d5807877c1d8628');
});
await test('a missing v4 guide prevents provider generation, while legacy requests never need that asset',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'skin-reference-missing-')),f=fixture(),input=await inputFor(f);let calls=0;
 try{await assert.rejects(processProductionPortrait({input,root:folder,fields:fieldsFor(f),requestPortrait:async()=>{calls++;throw Error('No provider may run without its guide')},removeBackground:async image=>image}),{code:'studio_skin_reference_unavailable'});assert.equal(calls,0)}finally{await rm(folder,{recursive:true,force:true})}
});
await test('transport retains all historical image positions and appends a reference only when supplied',()=>{
 const [portrait,hair,identity,makeup,outfit,skinReference]=['p','h','i','m','o','s'].map(value=>Buffer.from(value));
 const base=seedreamReviewPayload({prompt:'test',portrait});assert.deepEqual(base,{model:REVIEW_SEEDREAM_MODEL,prompt:'test',image:'data:image/png;base64,cA==',size:'2K',output_format:'png',response_format:'b64_json',watermark:false});
 const options={prompt:'test',portrait,hair,identity,makeup,outfit},old=seedreamReviewPayload(options),next=seedreamReviewPayload({...options,skinReference});assert.deepEqual(old.image,['data:image/png;base64,cA==','data:image/png;base64,aA==','data:image/png;base64,aQ==','data:image/jpeg;base64,bQ==','data:image/png;base64,bw==']);assert.deepEqual(next.image,[...old.image,'data:image/jpeg;base64,cw==']);
});
await test('v5 preparation runs normalization, base, soft, retouch and continuity in the specified native order',async()=>{
 const f=fixture({shadow:true,red:true,pores:true,retouch:true}),input=await inputFor(f),before=Buffer.from(input.buffer),evidence=parseStudioSkinEvidence(f.evidence);
 const illumination=normalizeStudioReferenceIllumination({pixels:f.pixels,width:f.width,height:f.height,evidence});assert.equal(illumination.report.status,'applied','This fixture must distinguish normalized source from unnormalized pixels');
 const base=applyStudioSkinBase({pixels:illumination.pixels,width:f.width,height:f.height,evidence}),soft=applyStudioSkinSoftFocus({pixels:base.pixels,width:f.width,height:f.height,evidence}),retouch=applyStudioSkinRetouch({pixels:soft.pixels,width:f.width,height:f.height,evidence}),continuity=repairStudioSkinContinuity({originalPixels:illumination.pixels,pixels:retouch.pixels,width:f.width,height:f.height,evidence});
 const expected=await sharp(continuity.pixels,{raw:{width:f.width,height:f.height,channels:4}}).png().toBuffer(),actual=await prepareStudioSkinInput(input,fieldsFor(f),'female');
 assert.deepEqual(actual.input.buffer,expected,'Continuity must use normalized pre-base pixels, never raw-upload or already-retouched pixels');assert.deepEqual(actual.report.illumination,illumination.report);assert.deepEqual(actual.report.skinContinuity,continuity.report);assert.deepEqual(input.buffer,before);
});
await test('v5 always derives a same-person identity crop from the final treated surface when no explicit crop is sent',async()=>{
 const f=fixture({shadow:true,retouch:true}),input=await inputFor(f),prepared=await prepareStudioSkinInput(input,fieldsFor(f),'female'),box=studioReferenceIdentityBox(parseStudioSkinEvidence(f.evidence)),expectedCrop=await portraitIdentityCrop(prepared.input,box);let captured,calls=0;
 await processProductionPortrait({input,root:new URL('..',import.meta.url).pathname,fields:fieldsFor(f),requestPortrait:async options=>{captured=options;calls++;return{png:options.portrait}},removeBackground:async image=>{const result=await raw(image);result.data[3]=0;return sharp(result.data,{raw:{width:f.width,height:f.height,channels:4}}).png().toBuffer()}});
 assert.equal(calls,1);assert.deepEqual(captured.portrait,prepared.input.buffer);assert.deepEqual(captured.identity,expectedCrop);assert(captured.prompt.includes('UPLOADED-PERSON IDENTITY DETAIL — IMAGE 2'));assert(captured.prompt.includes('IMAGE 3, THE LAST IMAGE'));assert(captured.prompt.includes('This identity-detail image'));assert(!captured.prompt.includes('This last image is a close-up'));
 const images=seedreamReviewPayload(captured).image;assert.equal(images.length,3);assert.equal(images[1],'data:image/png;base64,'+expectedCrop.toString('base64'));assert.equal(images[2],'data:image/jpeg;base64,'+captured.skinReference.toString('base64'));
});
await test('v5 uses exactly the same bare-skin prompt and conditioning for all finish choices',async()=>{
 const f=fixture({shadow:true,retouch:true}),input=await inputFor(f),before=Buffer.from(input.buffer),root=new URL('..',import.meta.url).pathname;let common;
 for(const style of ['natural','makeup','korean-rosy-v1','soft-rosy-v1']){
  let captured;await processProductionPortrait({input,root,fields:{...fieldsFor(f),femaleEyeStyle:style},requestPortrait:async options=>{captured=options;return{png:options.portrait}},removeBackground:async image=>{const result=await raw(image);result.data[3]=0;return sharp(result.data,{raw:{width:f.width,height:f.height,channels:4}}).png().toBuffer()}});
  const payload=seedreamReviewPayload(captured);if(!common)common=payload;else assert.deepEqual(payload,common,'Selected local cosmetics must not send different bare AI conditioning');
  for(const phrase of ['SAME BARE-SKIN BASE','brow heads','between the eyebrows','mouth corners','pale, grey, yellow','No extra makeup or cosmetic palette','lip boundaries stay sharply resolved'])assert(captured.prompt.includes(phrase),phrase);
  assert(!captured.prompt.includes('Keep Image 1’s prepared white balance'));assert(captured.identity?.length>0);
 }
 assert.deepEqual(input.buffer,before);
});
console.log(JSON.stringify({passed,failed:0,scope:'Actual preprocessing, validation and production handler with inert provider/matting. One request receives corrected native PNG plus its own corrected identity crop; historical prompt fingerprints unchanged. No provider, account or payment requests.'}));
