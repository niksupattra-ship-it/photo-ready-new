import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {portraitProtectedFeatures,comparePortraitProtectedFeatures} from '../src/portrait-feature-check.js';
import {faceProportions,compareFaceProportions} from '../src/face-proportion-check.js';
import {PRODUCTION_HAIR_CATALOG} from '../hairstyle-catalog.js';
const W=800,H=1000;
function fixture(){
 const f=Array.from({length:478},()=>({x:.5,y:.5})),put=(id,x,y)=>f[id]={x,y};
 for(const [id,x,y]of [[33,.32,.40],[133,.44,.40],[362,.56,.40],[263,.68,.40],[98,.47,.52],[327,.53,.52],[61,.43,.66],[291,.57,.66],[13,.50,.66],[14,.50,.661],[234,.22,.50],[454,.78,.50],[172,.35,.74],[397,.65,.74],[152,.50,.84],[1,.50,.54]])put(id,x,y);
 for(const [corners,pairs,iris,rim]of [[[33,133],[[159,145],[160,144],[158,153]],468,[469,470,471,472]],[[362,263],[[386,374],[385,380],[387,373]],473,[474,475,476,477]]]){
  const left=f[corners[0]].x,right=f[corners[1]].x,cx=(left+right)/2;
  pairs.forEach(([top,bottom],i)=>{const x=left+(right-left)*(i+1)/4;put(top,x,.389);put(bottom,x,.411)});
  put(iris,cx,.401);rim.forEach((id,i)=>put(id,cx+.018*Math.cos(i*Math.PI/2),.401+.0144*Math.sin(i*Math.PI/2)));
 }
 return f;
}
const measure=f=>portraitProtectedFeatures(f,W,H),copy=f=>f.map(p=>({...p}));
const original=fixture(),source=measure(original);assert(source);
let passed=0;async function test(name,run){await run();passed++;console.log('PASS '+name)}
await test('the same face survives translation, scaling and coherent head roll',()=>{
 for(const angle of [-.3,0,.24]){
  const moved=original.map(p=>{const x=p.x*W,y=p.y*H;return {x:(x*Math.cos(angle)-y*Math.sin(angle))*.75+140,y:(x*Math.sin(angle)+y*Math.cos(angle))*.75+80}}).map(p=>({x:p.x/1100,y:p.y/1300}));
  assert(comparePortraitProtectedFeatures(source,portraitProtectedFeatures(moved,1100,1300)).ok);
 }
});
await test('minor landmark noise remains within measurement tolerance',()=>{
 const f=original.map((p,i)=>({x:p.x+Math.sin(i)*.0005,y:p.y+Math.cos(i)*.0005}));assert(comparePortraitProtectedFeatures(source,measure(f)).ok);
});
for(const side of ['left','right']){
 const pairs=side==='left'?[[159,145],[160,144],[158,153]]:[[386,374],[385,380],[387,373]],iris=side==='left'?468:473,rim=side==='left'?[469,470,471,472]:[474,475,476,477];
 await test(`${side}: enlarged eye opening is rejected independently`,()=>{
  const f=copy(original);for(const [top,bottom]of pairs){f[top].y-=.006;f[bottom].y+=.006}const result=comparePortraitProtectedFeatures(source,measure(f));assert(!result.ok);assert(result.changes.some(c=>c.region===side&&c.key==='opening'));
 });
 await test(`${side}: redirected gaze is rejected`,()=>{
  for(const [dx,dy]of [[.012,0],[0,.008]]){const f=copy(original);for(const id of [iris,...rim]){f[id].x+=dx;f[id].y+=dy}assert(!comparePortraitProtectedFeatures(source,measure(f)).ok)}
 });
 await test(`${side}: enlarged iris is rejected`,()=>{
  const f=copy(original);for(const id of rim){f[id].x=f[iris].x+(f[id].x-f[iris].x)*1.3;f[id].y=f[iris].y+(f[id].y-f[iris].y)*1.3}assert(!comparePortraitProtectedFeatures(source,measure(f)).ok);
 });
}
await test('a narrowed nose, widened mouth or changed expression fails the feature check',()=>{
 for(const change of [f=>{f[98].x+=.012;f[327].x-=.012},f=>{f[61].x-=.015;f[291].x+=.015},f=>{f[14].y+=.012}]){const f=copy(original);change(f);assert(!comparePortraitProtectedFeatures(source,measure(f)).ok)}
});
await test('missing or invalid iris/eye evidence cannot approve a portrait',()=>{
 const f=copy(original);delete f[468];assert.equal(measure(f),null);assert.equal(portraitProtectedFeatures(original,NaN,H),null);assert.equal(comparePortraitProtectedFeatures(null,source).ok,false);
 const f2=copy(original);f2[470].x=NaN;assert.equal(measure(f2),null);
});

const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const extract=(start,end,name,env)=>{const a=main.indexOf(start),b=main.indexOf(end,a);assert(a>=0&&b>a);return new Function('env',`with(env){${main.slice(a,b)};return ${name}}`)(env)};
await test('female makeup rejects eye drift before acceptance while existing natural checks remain unchanged',async()=>{
 const changed=copy(original);for(const id of [468,469,470,471,472])changed[id].x+=.015;
 const metrics=f=>({...faceProportions(f,W,H),protectedFeatures:measure(f)});
 const env={portraitFaceMetrics:async key=>metrics(key==='source'?original:changed),compareFaceProportions,comparePortraitProtectedFeatures};
 const check=extract('async function checkPortraitProportions(','\n// Check the returned AI cutout','checkPortraitProportions',env);
 await check('source','result');await assert.rejects(check('source','result',{protectFeatures:true}),e=>e.code==='portrait_features_changed');await check('source','source',{protectFeatures:true});
});
await test('female makeup additionally rejects a changed overall facial width',async()=>{
 const changed=copy(original);changed[234].x-=.03;changed[454].x+=.03;
 const env={portraitFaceMetrics:async key=>({...faceProportions(key==='source'?original:changed,W,H),protectedFeatures:source}),compareFaceProportions,comparePortraitProtectedFeatures};
 const check=extract('async function checkPortraitProportions(','\n// Check the returned AI cutout','checkPortraitProportions',env);
 await check('source','result');await assert.rejects(check('source','result',{protectFeatures:true}),e=>e.code==='portrait_features_changed');
});
await test('unreadable source eyes stop before generation while legacy crop behavior stays compatible',async()=>{
 const f=copy(original),env={decodedPortraitImage:async()=>({naturalWidth:W,naturalHeight:H}),getLandmarker:async()=>({detect:()=>({faceLandmarks:[f]})}),portraitProtectedFeatures};
 const crop=extract('async function replacementFaceIdentityBox(','\nasync function aiFinishPortraitUncached(','replacementFaceIdentityBox',env);
 assert.equal((await crop(new Blob(),{protectFeatures:true})).length,4);
 delete f[468];await assert.rejects(crop(new Blob(),{protectFeatures:true}),/รูปตา/);assert.equal((await crop(new Blob())).length,4);
});
await test('source close-ups are attached for both original-hair and selected-hair female makeup, preserving other request shapes',async()=>{
 for(const [mode,style,hairId,replacement,expected]of [['female','makeup','',false,true],['female','makeup','seedream-19',false,true],['female','natural','seedream-19',false,false],['male','natural','seedream-35',false,false],['male','natural','seedream-35',true,true]]){
  const photo=new File(['this upload only'],'portrait.png',{type:'image/png'});photo.idpromPortraitMode=mode;photo.idpromStudioSourceReplacement=replacement;
  let crops=0,body;const result=new Blob(['native result']);
  const env={activeProcessOperation:{},assertProcessActive(){},submitPortraitJob:async(_,run)=>run(),FormData,canonicalPortraitInput:async p=>p,levelPortraitCutout(){},activeSavedDownloadWork:null,PRODUCTION_HAIR_CATALOG,replacementFaceIdentityBox:async p=>{assert.equal(p,photo);crops++;return [.2,.1,.8,.9]},saveAiJobFile:async()=>{},acceptedPaidTrial:false,portraitFetch:async(_,options)=>{body=options.body;return {ok:true,json:async()=>({jobId:'fixture'})}},walletHeaders:()=>({}),warmPortraitResources(){},writeActiveAiJob(){},waitForAiJob:async()=>result};
  const run=extract('async function aiFinishPortraitUncached(','\n// V206:','aiFinishPortraitUncached',env);assert.equal(await run(photo,hairId,{portraitMode:mode,femaleEyeStyle:style}),result);
  assert.equal(crops,expected?1:0);assert.equal(body.has('faceIdentityBox'),expected);assert.equal(body.get('portraitMode'),mode);assert.equal(await body.get('originalSource').text(),await photo.text());
 }
});
console.log(JSON.stringify({passed,geometryOnly:true,noAIRequests:true}));
