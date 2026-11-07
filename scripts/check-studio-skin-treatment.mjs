import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {STUDIO_SKIN_WORKFLOW_VERSION,parseStudioSkinEvidence,applyStudioSkinBase} from '../studio-skin-treatment.js';
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
function test(name,run){run();passed++;console.log('PASS '+name)}
test('evidence is bounded, defensive and rejects invalid versions, pixels, masks and landmark data',()=>{
 const f=fixture(),e=parseStudioSkinEvidence(JSON.stringify(f.evidence));assert(e.labels instanceof Uint8Array);assert.notEqual(e.face,f.evidence.face);
 for(const patch of [{version:'old'},{width:50000,height:50000},{maskWidth:257},{face:[[0,0]]},{face:Array(468)},{labels:[99]},{face:f.evidence.face.map((p,i)=>i===0?[NaN,0]:p)}])assert.throws(()=>parseStudioSkinEvidence({...f.evidence,...patch}),{code:'studio_skin_evidence_invalid'});
 assert.throws(()=>parseStudioSkinEvidence(' '.repeat(307201)));assert.throws(()=>parseStudioSkinEvidence('{'));
 assert.throws(()=>applyStudioSkinBase({...f,width:f.width+1}),{code:'studio_skin_evidence_invalid'});
});
test('already even warm and darker complexions receive no invented whitening or neutral tint',()=>{
 for(const colour of [[205,155,103],[90,64,48],[184,143,124]]){const f=fixture({colour,pores:true}),r=applyStudioSkinBase(f);assert.deepEqual(r.pixels,f.pixels);assert.equal(r.changed,false);assert.equal(r.report.neutralReference,false)}
});
test('broad deficient shadows lift while native alpha, outside pixels and facial features stay exact',()=>{
 const f=fixture({shadow:true,pores:true}),before=new Uint8ClampedArray(f.pixels);
 const highlight=pixel(f,.56,.23);f.pixels.set([253,236,225,255],highlight);const translucent=pixel(f,.36,.49);f.pixels[translucent+3]=128;
 const mole=pixel(f,.43,.54);f.pixels.set([52,36,28,255],mole);before.set(f.pixels);
 const r=applyStudioSkinBase(f);assert(r.changed);assert(r.report.changedPixels>100);assert(r.report.maxChannelDelta<=24);
 const cheek=pixel(f,.36,.51);assert(light(...r.pixels.slice(cheek,cheek+3))>light(...f.pixels.slice(cheek,cheek+3))+5);
 for(const id of [33,263,70,300,61,291,98,327]){const p=f.evidence.face[id],k=pixel(f,...p);assert.deepEqual(r.pixels.slice(k,k+4),f.pixels.slice(k,k+4),'Protected landmark '+id)}
 for(const k of [highlight,translucent,mole])assert.deepEqual(r.pixels.slice(k,k+4),f.pixels.slice(k,k+4));
 for(let i=0;i<f.width*f.height;i++){assert.equal(r.pixels[i*4+3],f.pixels[i*4+3]);const x=i%f.width,y=Math.floor(i/f.width),label=f.evidence.labels[Math.floor(y*f.evidence.maskHeight/f.height)*f.evidence.maskWidth+Math.floor(x*f.evidence.maskWidth/f.width)];if(label!==2&&label!==3)assert.deepEqual(r.pixels.slice(i*4,i*4+4),f.pixels.slice(i*4,i*4+4))}
 assert.deepEqual(f.pixels,before,'Uploaded pixels must remain immutable');
});
test('local unwanted redness moves toward surrounding healthy skin without erasing real pores',()=>{
 const f=fixture({red:true,shadow:true,pores:true}),r=applyStudioSkinBase(f),k=pixel(f,.63,.51);
 assert(r.pixels[k]-r.pixels[k+1]<f.pixels[k]-f.pixels[k+1],'Red patch contrast reduced');
 let residual=0,count=0;
 for(let y=Math.floor(f.height*.43);y<f.height*.57;y++)for(let x=Math.floor(f.width*.32);x<f.width*.43-1;x++){
  const i=(y*f.width+x)*4,j=i+4;if(r.pixels[i]===f.pixels[i]&&r.pixels[j]===f.pixels[j])continue;
  residual+=Math.abs((r.pixels[i]-r.pixels[j])-(f.pixels[i]-f.pixels[j]));count++;
 }
 assert(count>100);assert(residual/count<.7,'Native adjacent-pixel microcontrast retained');
});
test('global cast correction requires independent agreeing neutral clothing and background evidence',()=>{
 const f=fixture({neutral:true}),r=applyStudioSkinBase(f);assert(r.report.neutralReference);
 const k=pixel(f,.58,.49);assert(r.pixels[k+2]>=f.pixels[k+2]);
 const onlyClothes=fixture({neutral:true});onlyClothes.evidence.labels=onlyClothes.evidence.labels.map(v=>v===0?1:v);const q=applyStudioSkinBase(onlyClothes);assert.equal(q.report.neutralReference,false);
});
test('no valid skin evidence leaves the image intact; analysis remains capped at512 pixels',()=>{
 const f=fixture();f.evidence.labels.fill(0);const q=applyStudioSkinBase(f);assert.equal(q.changed,false);assert.equal(q.report.reason,'insufficient_skin_evidence');
 const large=fixture({width:768,height:960,shadow:true,pores:true}),start=performance.now(),r=applyStudioSkinBase(large);assert(r.changed);assert(Math.max(r.report.analysisWidth,r.report.analysisHeight)<=512);assert.equal(r.pixels.length,large.pixels.length);assert(performance.now()-start<15000);
});
console.log(JSON.stringify({passed,failed:0,scope:'Actual native-RGBA base correction and evidence validation; synthetic broad shadows, colour casts, dark/warm skin, pores, highlights and protected anatomy. No AI, network or customer writes.'}));
