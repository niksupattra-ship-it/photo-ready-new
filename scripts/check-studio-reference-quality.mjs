import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {STUDIO_SKIN_WORKFLOW_VERSION} from '../studio-skin-treatment.js';
import {assertStudioReferenceInputQuality,STUDIO_REFERENCE_QUALITY_MESSAGE} from '../studio-reference-quality.js';

const oval=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const eyes=[[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],[263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249]];
const lips=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
function fixture({width=512,height=640,colour=[184,143,124],background=[255,255,255],paint=null}={}){
 const face=Array.from({length:468},()=>[.5,.46]);
 oval.forEach((id,i)=>{const angle=i/oval.length*Math.PI*2;face[id]=[.5+.28*Math.sin(angle),.44-.34*Math.cos(angle)]});
 const ellipse=(ids,cx,cy,rx,ry)=>ids.forEach((id,i)=>{const angle=i/ids.length*Math.PI*2;face[id]=[cx+rx*Math.cos(angle),cy+ry*Math.sin(angle)]});
 ellipse(eyes[0],.37,.35,.065,.025);ellipse(eyes[1],.63,.35,.065,.025);ellipse(lips,.5,.64,.075,.03);face[1]=[.5,.48];
 const pixels=new Uint8ClampedArray(width*height*4),labels=new Uint8Array(128*160);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const px=(x+.5)/width,py=(y+.5)/height,isFace=((px-.5)/.28)**2+((py-.44)/.34)**2<1;
  const rgb=paint?paint(px,py,isFace,colour):isFace?colour:background,k=(y*width+x)*4;
  pixels.set([...rgb,255],k);
 }
 return {pixels,width,height,evidence:{version:STUDIO_SKIN_WORKFLOW_VERSION,width,height,face,maskWidth:128,maskHeight:160,labels}};
}
const expectedQuality=(f,reason)=>assert.throws(()=>assertStudioReferenceInputQuality(f),error=>error.status===422&&error.code==='portrait_source_quality'&&error.message===STUDIO_REFERENCE_QUALITY_MESSAGE&&error.qualityReason===reason);
let passed=0;
function test(name,run){run();passed++;console.log('PASS '+name)}

test('usable warm, dark, pale and colour-cast complexions are not mistaken for lost image detail',()=>{
 for(const colour of [[184,143,124],[205,155,103],[55,34,22],[23,15,10],[8,6,4],[248,242,236],[125,147,186]]){
  const report=assertStudioReferenceInputQuality(fixture({colour}));assert.equal(report.status,'accepted');assert.equal(report.blackFraction,0);assert.equal(report.whiteFraction,0);
 }
});
test('strong side light, ordinary underexposure and one clipped hotspot remain eligible for adaptive relighting',()=>{
 const side=fixture({paint:(x,y,skin,c)=>skin?c.map(v=>v*(x<.5?.25:1.08)):[255,255,255]});assert.equal(assertStudioReferenceInputQuality(side).status,'accepted');
 const low=fixture({paint:(x,y,skin,c)=>skin?c.map(v=>v*.16):[3,3,3]});assert.equal(assertStudioReferenceInputQuality(low).status,'accepted');
 const spot=fixture({paint:(x,y,skin,c)=>skin?((x-.5)**2+(y-.47)**2<.03**2?[255,255,255]:c):[255,255,255]});
 const r=assertStudioReferenceInputQuality(spot);assert.equal(r.status,'accepted');assert(r.whiteFraction>0&&r.whiteFraction<.1);
 const half=fixture({paint:(x,y,skin,c)=>skin?(x<.5?[0,0,0]:c):[255,255,255]});const h=assertStudioReferenceInputQuality(half);assert(h.blackFraction>.4&&h.blackFraction<.55);assert.equal(h.status,'accepted');
});
test('background clipping never substitutes for clipped face evidence',()=>{
 for(const background of [[0,0,0],[255,255,255]]){
  const r=assertStudioReferenceInputQuality(fixture({background}));assert.equal(r.blackFraction,0);assert.equal(r.whiteFraction,0);assert.equal(r.status,'accepted');
 }
});
test('catastrophically black, white and posterized face details fail before reference generation',()=>{
 expectedQuality(fixture({colour:[0,0,0]}),'face-black-clipped');
 expectedQuality(fixture({colour:[4,3,2]}),'face-black-clipped');
 expectedQuality(fixture({colour:[255,255,255]}),'face-white-clipped');
 expectedQuality(fixture({colour:[252,251,250]}),'face-white-clipped');
 const mixed=fixture({paint:(x,y,skin)=>skin?(x<.5?[0,0,0]:[255,255,255]):[150,150,150]});expectedQuality(mixed,'face-details-clipped');
});
test('both facial clipping and loss in critical feature regions are required for the conservative rejection',()=>{
 const f=fixture({paint:(x,y,skin,c)=>{
  if(!skin)return [255,255,255];
  const eyes=x>.28&&x<.72&&y>.29&&y<.41,noseMouth=x>.41&&x<.59&&y>.43&&y<.70;
  return eyes||noseMouth?c:[255,255,255];
 }}),r=assertStudioReferenceInputQuality(f);
 assert(r.whiteFraction>.65);assert(r.criticalWhiteFraction<.65);assert.equal(r.status,'accepted');
});
test('native face resolution is checked independently of file or canvas dimensions',()=>{
 expectedQuality(fixture({width:128,height:160}),'face-too-small');
 const f=fixture();f.evidence.face=f.evidence.face.map(p=>[.5+(p[0]-.5)*.25,p[1]]);expectedQuality(f,'face-too-small');
 assert.equal(assertStudioReferenceInputQuality(fixture({width:256,height:320})).status,'accepted');
});
test('missing face pixels fail but useful transparent inputs do not alter source alpha',()=>{
 const missing=fixture();for(let i=3;i<missing.pixels.length;i+=4)missing.pixels[i]=0;expectedQuality(missing,'face-pixels-missing');
 const partial=fixture();for(let i=3;i<partial.pixels.length;i+=4)partial.pixels[i]=128;assert.equal(assertStudioReferenceInputQuality(partial).status,'accepted');assert(partial.pixels.every((v,i)=>i%4!==3||v===128));
});
test('quality inspection leaves pixels and evidence untouched and keeps analysis bounded on large native sources',()=>{
 const f=fixture(),before=new Uint8ClampedArray(f.pixels),e=structuredClone(f.evidence),first=assertStudioReferenceInputQuality(f),again=assertStudioReferenceInputQuality(f);
 assert.deepEqual(first,again);assert.deepEqual(f.pixels,before);assert.deepEqual(f.evidence,e);
 const large=fixture({width:2048,height:2560}),start=performance.now(),r=assertStudioReferenceInputQuality(large);
 assert(Math.max(r.analysisWidth,r.analysisHeight)<=256);assert(r.faceSamples<=65536);assert(performance.now()-start<2000);assert.equal(r.status,'accepted');
 assert.throws(()=>assertStudioReferenceInputQuality({...f,width:f.width+1}),{code:'studio_skin_evidence_invalid'});
});
console.log(JSON.stringify({passed,failed:0,scope:'Conservative native face resolution and catastrophic clipping gate for reference relighting. Usable dark/warm/side-lit portraits stay eligible; source pixels/evidence remain immutable. No provider, network, account or payment requests.'}));
