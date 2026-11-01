import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {finishFemaleMakeupSoftFocus} from '../src/female-makeup-soft-focus.js';
import {LOCAL_MAKEUP_CONTOURS as C} from '../src/local-makeup.js';
import {productionPortraitPrompt} from '../production-portrait-pipeline.js';
import {PRODUCTION_HAIR_CATALOG} from '../hairstyle-catalog.js';

function fixture({width=384,tone=[193,154,137],pores=8,rgba=false}={}){
 const height=Math.round(width*4/3),n=width*height,face=Array.from({length:478},()=>({x:.5,y:.5}));
 const oval=(ids,cx,cy,rx,ry,top=false)=>ids.forEach((id,j)=>{const a=j/ids.length*Math.PI*2;face[id]={x:cx+rx*(top?Math.sin(a):Math.cos(a)),y:cy+ry*(top?-Math.cos(a):Math.sin(a))}});
 oval(C.face,.5,.48,.33,.40,true);
 for(let i=0;i<2;i++){oval(C.eyes[i],i?.64:.36,.41,.066,.020);oval(C.brows[i],i?.64:.36,.34,.078,.015)}
 oval(C.lips,.5,.68,.095,.028);face[98]={x:.468,y:.565};face[327]={x:.532,y:.565};
 const pixels=new Uint8ClampedArray(n*4),baseline=new Float32Array(n*3),skin=new Float32Array(n),hair=new Float32Array(n),labels=new Uint8Array(n);
 const ellipse=(x,y,cx,cy,rx,ry)=>((x-cx)/rx)**2+((y-cy)/ry)**2<1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,k=i*4,px=(x+.5)/width,py=(y+.5)/height;
  const shading=11*(px-.5)+8*Math.sin(py*4),grain=pores*Math.sin(x*1.7)*Math.cos(y*1.4);
  let color=tone.map(v=>v+shading+grain),alpha=255;
  skin[i]=ellipse(px,py,.5,.48,.33,.40)?1:0;
  if(!skin[i]){color=[80,155,215];labels[i]=1}
  for(let side=0;side<2;side++){
   const cx=side?.64:.36;
   if(ellipse(px,py,cx,.41,.055,.015)){color=[33,29,26];labels[i]=2}
   if(ellipse(px,py,cx,.34,.065,.010)){color=[52,39,32];labels[i]=3}
  }
  if(ellipse(px,py,.5,.68,.08,.021)){color=[170,64,91];labels[i]=4}
  for(const cx of [.468,.532])if(ellipse(px,py,cx,.565,.004,.003)){color=[35,25,20];labels[i]=5}
  if(ellipse(px,py,.27,.27,.025,.030)){hair[i]=1;color=[28,22,20];labels[i]=6}
  if(ellipse(px,py,.24,.61,.012,.015)){alpha=219;labels[i]=7}
  if(ellipse(px,py,.40,.60,.004,.003)){color=[39,27,22];labels[i]=8}
  if(ellipse(px,py,.355,.53,.037,.025)&&labels[i]===0)labels[i]=9;
  for(let c=0;c<3;c++){pixels[k+c]=color[c];baseline[i*3+c]=tone[c]+shading}pixels[k+3]=alpha;
 }
 const convert=a=>{const out=new Uint8ClampedArray(n*4);for(let i=0;i<n;i++)out[i*4+3]=Math.round(a[i]*255);return out};
 return {pixels,width,height,face,skin:rgba?convert(skin):skin,hair:rgba?convert(hair):hair,labels,baseline};
}

let passed=0;
async function test(name,run){await run();console.log('PASS '+name);passed++}
const reports=[];
for(const [name,tone]of [['light',[222,192,176]],['medium',[175,133,113]],['deep',[104,72,59]]])await test(`${name}: visible pore reduction with sharp features, alpha and native colour retained`,()=>{
 const input=fixture({tone}),before=input.pixels.slice(),start=performance.now(),out=finishFemaleMakeupSoftFocus(input);
 assert(out.changed);assert.deepEqual(input.pixels,before,'mutated the original image');
 let oldNoise=0,newNoise=0,count=0,oldMean=0,newMean=0;
 for(let i=0;i<input.labels.length;i++){
  const k=i*4,label=input.labels[i];assert.equal(out.pixels[k+3],before[k+3],'alpha changed');
  if(label>0&&label<9)assert.deepEqual(out.pixels.subarray(k,k+4),before.subarray(k,k+4),`protected region ${label} changed`);
  if(label===9){for(let c=0;c<3;c++){oldNoise+=(before[k+c]-input.baseline[i*3+c])**2;newNoise+=(out.pixels[k+c]-input.baseline[i*3+c])**2}oldMean+=before[k];newMean+=out.pixels[k];count++}
 }
 const remaining=Math.sqrt(newNoise/oldNoise);assert(remaining>.68&&remaining<.92,`skin needs gentle softening with fine texture retained: ${remaining}`);
 for(let i=0;i<before.length;i++)assert(Math.abs(out.pixels[i]-before[i])<=3,'local correction exceeded the natural-skin limit');
 assert(Math.abs(oldMean-newMean)/count<.75,'skin colour/exposure drifted');
 reports.push({name,poreContrastRemaining:+remaining.toFixed(3),changedPixels:out.report.changedPixels,elapsedMs:Math.round(performance.now()-start)});
});
await test('normalized and native RGBA masks agree exactly',()=>assert.deepEqual(finishFemaleMakeupSoftFocus(fixture()).pixels,finishFemaleMakeupSoftFocus(fixture({rgba:true})).pixels));
await test('already smooth skin receives no second colour or lighting grade',()=>{
 const input=fixture({pores:0}),out=finishFemaleMakeupSoftFocus(input);let largest=0;
 for(let i=0;i<input.labels.length;i++)if(input.labels[i]===9)for(let c=0;c<3;c++)largest=Math.max(largest,Math.abs(input.pixels[i*4+c]-out.pixels[i*4+c]));
 assert(largest<=1,'already-smooth skin was polished again');
});
await test('subtle natural skin grain survives without another smoothing pass',()=>{
 for(const pores of [1,2]){
  const input=fixture({pores}),out=finishFemaleMakeupSoftFocus(input);
  for(let i=0;i<input.labels.length;i++)if(input.labels[i]===9)assert.deepEqual(out.pixels.subarray(i*4,i*4+4),input.pixels.subarray(i*4,i*4+4),'fine native skin grain was erased');
 }
});
await test('missing or invalid evidence leaves the original image usable',()=>{
 const f=fixture();
 for(const change of [{face:null},{skin:null},{hair:null},{skin:new Float32Array(1)},{width:0},{height:1},{face:f.face.map(()=>({x:NaN,y:0}))},{skin:new Float32Array(f.skin.length).fill(.3)},{hair:new Float32Array(f.hair.length).fill(1)}]){
  const input={...f,...change},out=finishFemaleMakeupSoftFocus(input);assert.equal(out.changed,false);assert.equal(out.pixels,f.pixels);
 }
});
await test('native portrait-scale smoothing stays bounded and preserves protected features',()=>{
 const f=fixture({width:1200}),start=performance.now(),out=finishFemaleMakeupSoftFocus(f);assert(out.changed);assert.equal(out.pixels.length,f.pixels.length);
 for(let i=0;i<f.labels.length;i++)if(f.labels[i]>0&&f.labels[i]<9)assert.deepEqual(out.pixels.subarray(i*4,i*4+4),f.pixels.subarray(i*4,i*4+4));
 const elapsed=performance.now()-start;assert(elapsed<12000,`portrait processing took ${elapsed}ms`);reports.push({name:'1200x1600',elapsedMs:Math.round(elapsed)});
});

// Exercise the real generation/cache boundary with offline transport stubs.
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const section=(start,end)=>{const a=main.indexOf(start),b=main.indexOf(end,a);assert(a>=0&&b>a);return main.slice(a,b)};
const extract=(start,end,name,env)=>new Function('env',`with(env){${section(start,end)};return ${name}}`)(env);
await test('only female makeup gets the finish, once per new generation and never on reuse',async()=>{
 for(const mode of ['male','female'])for(const style of ['natural','makeup']){
  let generations=0,finishes=0,cached=null;const generated=new Blob(['native AI output']);generated.idpromJobId='job';
  const env={activeProcessOperation:{},assertProcessActive(){},cancelledProcessError:()=>Error('cancelled'),PRODUCTION_HAIR_CATALOG:[],currentResultCacheScope:()=>'',resultSourceDigest:async()=>'',uploadGenerationScope:()=>'',HAIR_DESIGN_VERSION:'fixture',portraitResultCache:{delete(){},async get(key,generate){if(cached)return {value:cached,reused:true};cached=await generate();return {value:cached,reused:false}}},aiFinishPortraitUncached:async()=>{generations++;return generated},cleanPortraitClothing:async b=>b,finishFemaleMakeupSoftFocusBlob:async b=>{assert.equal(b,generated);finishes++;return b},checkPortraitProportions:async()=>{},checkPortraitCompletion:async()=>{},verifyOutputRights:async()=>({unlocked:true}),femaleFinishMetadata:()=>({}),saveAiJobFile:async()=>{},writeActiveAiJob(){},window:{dispatchEvent(){}},CustomEvent:class{}};
  const run=extract('async function aiFinishPortrait(','\nlet acceptedPaidTrial=','aiFinishPortrait',env);
  const source={idpromPortraitMode:mode,idpromFemaleEyeStyle:style};
  const result=await run(source,'',{portraitMode:mode,femaleEyeStyle:style});assert.equal(result,generated);
  const repeat=await run(source,'',{portraitMode:mode,femaleEyeStyle:style});assert.equal(repeat.idpromReused,true);
  assert.equal(generations,1);assert.equal(finishes,mode==='female'&&style==='makeup'?1:0);
 }
});
await test('female makeup cache identity changes while male and natural cache keys stay stable',()=>{
 const block=section('async function aiFinishPortrait(','\nlet acceptedPaidTrial=');assert(block.includes('makeup-source-eye-lock-v39-clear-rosy-skin'));
 assert(block.includes('combined-seedream-server4-catalog34-male-shave-v19-measured-roll'));assert(block.includes('combined-seedream-server4-catalog34-eye-choice-v19-measured-roll'));
});
await test('all female makeup prompts protect fine texture and avoid a pore-erasing target',()=>{
 for(const hair of PRODUCTION_HAIR_CATALOG.filter(h=>h.gender==='female')){
  const prompt=productionPortraitPrompt(hair,'makeup');
  assert(prompt.includes('Retain fine original pores'));assert(prompt.includes('Already smooth skin receives no additional smoothing'));
  assert(!/pore-free|Remove visible facial pores|do not retain visible pores/.test(prompt));
 }
});
await test('studio relighting is limited to female makeup and preserves identity over polish',()=>{
 for(const hair of PRODUCTION_HAIR_CATALOG){
  for(const style of ['natural','makeup']){
   const prompt=productionPortraitPrompt(hair,style);
   const applies=hair.gender==='female'&&style==='makeup';
   assert.equal(prompt.includes('PHOTOGRAPHIC STUDIO RETOUCH, SURFACE AND LIGHT ONLY'),applies);
   if(!applies)continue;
   assert(prompt.includes('broad diffused frontal key and gentle balanced fill'));
   assert(prompt.includes('do not fill tear troughs, sculpt cheekbones'));
   assert(prompt.includes('preserve identity and texture'));
   assert(prompt.includes('lower-eye skin stays neutral'));
   assert(prompt.includes('BRIGHT SOFT STUDIO FILL — FEMALE MAKEUP SKIN ONLY'));
   assert(prompt.includes('modest extra diffuse midtone lift where highlight headroom remains'));
   assert(prompt.includes('do not brighten existing speculars'));
   assert(prompt.includes('Do not apply glow, haze, bloom, Gaussian blur or white halos'));
   assert(!prompt.includes('without visible pores'));
   assert(prompt.indexOf('FINAL FEMALE MAKEUP SOURCE-FACE LOCK')>prompt.indexOf('PHOTOGRAPHIC STUDIO RETOUCH'));
  }
 }
});
await test('Korean brow definition and matte skin apply only to female makeup without changing anatomy',()=>{
 for(const hair of PRODUCTION_HAIR_CATALOG)for(const style of ['natural','makeup']){
  const prompt=productionPortraitPrompt(hair,style),applies=hair.gender==='female'&&style==='makeup';
  assert.equal(prompt.includes('DEFINED KOREAN BROWS AND SOFT MATTE STUDIO SKIN'),applies);
  if(!applies)continue;
  assert(prompt.includes('Keep the original brow head/tail positions, spacing, width, arch'));
  assert(prompt.includes('Reduce excess oily/specular shine on forehead, nose and cheeks locally'));
  assert(prompt.includes('does not change the established lip tint/gloss or eye makeup'));
  assert(prompt.includes('the facial features remain sharp'));
  assert(prompt.indexOf('FINAL FEMALE MAKEUP SOURCE-FACE LOCK')>prompt.indexOf('DEFINED KOREAN BROWS'));
 }
});
await test('local studio retouch reduces a tonal patch without replacing facial features or alpha',()=>{
 const f=fixture({pores:2}),cx=Math.round(f.width*.355),cy=Math.round(f.height*.53);
 for(let y=cy-10;y<=cy+10;y++)for(let x=cx-10;x<=cx+10;x++){
  const k=(y*f.width+x)*4,delta=18*Math.exp(-((x-cx)**2+(y-cy)**2)/18);
  for(let c=0;c<3;c++)f.pixels[k+c]-=delta;
 }
 const before=f.pixels.slice(),out=finishFemaleMakeupSoftFocus({...f,studioRetouch:true}),center=(cy*f.width+cx)*4;
 assert(out.changed);assert.deepEqual(f.pixels,before);
 assert(out.pixels[center+1]>before[center+1]+3,'dark patch did not receive local concealing');
 for(let i=0;i<f.labels.length;i++){
  const k=i*4;assert.equal(out.pixels[k+3],before[k+3]);
  if(f.labels[i]>0&&f.labels[i]<9)assert.deepEqual(out.pixels.subarray(k,k+4),before.subarray(k,k+4));
  for(let c=0;c<3;c++)assert(Math.abs(out.pixels[k+c]-before[k+c])<=22,'correction exceeded bound');
 }
 assert(main.includes("kind:'makeup-soft-focus',studioRetouch:true"));
 reports.push({name:'local concealed patch',greenLift:out.pixels[center+1]-before[center+1]});
});
await test('local studio finish leaves missing evidence and clipped highlights intact',()=>{
 const f=fixture({tone:[250,250,250],pores:0}),out=finishFemaleMakeupSoftFocus({...f,studioRetouch:true});
 for(let i=0;i<f.labels.length;i++)if(f.labels[i]===9)assert.deepEqual(out.pixels.subarray(i*4,i*4+4),f.pixels.subarray(i*4,i*4+4));
 assert.equal(finishFemaleMakeupSoftFocus({...f,skin:null,studioRetouch:true}).changed,false);
});
await test('local matte finish reduces a small shine patch relative to surrounding skin',()=>{
 const f=fixture({pores:0}),cx=Math.round(f.width*.355),cy=Math.round(f.height*.53);
 for(let y=cy-12;y<=cy+12;y++)for(let x=cx-12;x<=cx+12;x++){
  const k=(y*f.width+x)*4,delta=18*Math.exp(-((x-cx)**2+(y-cy)**2)/18);
  for(let c=0;c<3;c++)f.pixels[k+c]+=delta;
 }
 const out=finishFemaleMakeupSoftFocus({...f,studioRetouch:true}),k=(cy*f.width+cx)*4,near=(cy*f.width+cx+16)*4;
 const before=f.pixels[k+1]-f.pixels[near+1],after=out.pixels[k+1]-out.pixels[near+1];
 assert(after<before-2,`shine contrast not reduced: ${before} -> ${after}`);
});
await test('studio finish visibly brightens rosy skin and refines pores across three complexions',()=>{
 for(const tone of [[222,192,176],[175,133,113],[104,72,59]]){
  const f=fixture({tone}),out=finishFemaleMakeupSoftFocus({...f,studioRetouch:true});
  let oldSum=0,newSum=0,oldSq=0,newSq=0,lift=0,pink=0,n=0;
  for(let i=0;i<f.labels.length;i++){
   const k=i*4;
   if(f.labels[i]>0&&f.labels[i]<9)assert.deepEqual(out.pixels.subarray(k,k+4),f.pixels.subarray(k,k+4));
   if(f.labels[i]!==9)continue;
   const a=f.pixels[k+1]-f.baseline[i*3+1],b=out.pixels[k+1]-f.baseline[i*3+1];
   oldSum+=a;newSum+=b;oldSq+=a*a;newSq+=b*b;
   lift+=out.pixels[k+1]-f.pixels[k+1];pink+=(out.pixels[k]-out.pixels[k+1])-(f.pixels[k]-f.pixels[k+1]);n++;
  }
  const texture=Math.sqrt((newSq/n-(newSum/n)**2)/(oldSq/n-(oldSum/n)**2));
  assert(lift/n>4,`skin light too weak: ${lift/n}`);
  assert(pink/n>1.5,`rosy colour too weak: ${pink/n}`);
  assert(texture>.3&&texture<.78,`pore contrast not sufficiently refined: ${texture}`);
  reports.push({name:'clear rosy '+tone.join(','),greenLift:+(lift/n).toFixed(2),redGreenShift:+(pink/n).toFixed(2),textureRemaining:+texture.toFixed(3)});
 }
});
await test('neck skin receives the same finish without touching its adjacent background',()=>{
 const f=fixture({pores:0});
 for(let y=Math.floor(f.height*.92);y<Math.floor(f.height*.99);y++)for(let x=Math.floor(f.width*.43);x<Math.floor(f.width*.57);x++){
  const i=y*f.width+x;f.skin[i]=1;f.pixels.set([175,133,113,255],i*4);
 }
 const out=finishFemaleMakeupSoftFocus({...f,studioRetouch:true});
 const k=(Math.floor(f.height*.95)*f.width+Math.floor(f.width*.5))*4;
 assert(out.pixels[k+1]>f.pixels[k+1]+5);
 const bg=(Math.floor(f.height*.95)*f.width+3)*4;
 assert.deepEqual(out.pixels.subarray(bg,bg+4),f.pixels.subarray(bg,bg+4));
});
console.log(JSON.stringify({passed,reports,noPaidAIRequests:true}));
