import {createFaceMeasurementCache} from '../src/studio-face-measurement-cache.js';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {planStudioSuitGeometry,STUDIO_SUIT_FIT_VERSION} from '../src/studio-suit-fit.js';
const source=await readFile('src/studio-suit-fit.js','utf8'),start=source.indexOf('export async function fitStudioSuit(');
const run=Function('env',`with(env){${source.slice(start).replace('export async function','async function')};return fitStudioSuit}`);
const frame={x:0,y:350,w:900,h:900},head={id:'head',kind:'head',jobId:'same-job',source:'original-head-pixels',mask:'original-mask',x:15,y:10,scale:1.2,rotation:0,sourceFrame:{x:0,y:0,w:900,h:1200}},suit={id:'suit',kind:'suit',source:'original-pattern-pixels',templatePath:'/assets/gown-uniforms/example.png',sourceFrame:frame,collarFrame:frame,x:0,y:0,scale:1,rotation:0,neckWidth:27,neckHeight:8,autoCollarFitApplied:true};
const face={width:900,height:1200,cx:450,chin:{x:450,y:615},leftEye:{x:365,y:365},rightEye:{x:535,y:365},left:{x:294,y:390},right:{x:606,y:390},faceWidth:312,faceHeight:460,opaqueTop:80};
const uniform={width:1000,height:1000,bounds:{l:0,r:999,t:0,b:999,w:1000,h:1000},centerX:500,shoulderWidth:820,torsoWidth:700,socketY:120};
const env={cachedFaceMeasurement:createFaceMeasurementCache(),kind:l=>l.kind,garmentMeasurement:async source=>{assert.equal(source,suit.source);return {uniform}},sampleSurface:async(source,mask)=>{assert.equal(source,head.source);assert.equal(mask,head.mask);return {canvas:{},width:900,height:1200,pixels:new Uint8ClampedArray(0)}},faceMeasurement:()=>face,planStudioSuitGeometry,STUDIO_SUIT_FIT_VERSION};
const fit=run(env),decoration={id:'pin',kind:'chest',x:7,y:12,source:'pin-pixels'},legacyNeck={id:'old-neck',kind:'neck-fit',hairHeadId:head.id};
const layers=[head,suit,decoration,legacyNeck],before=JSON.stringify(layers);
for(const preservePlacement of [false,true]){
 const result=await fit({layers,previousSuit:suit,nextSuit:suit,headSource:head.source,headMask:head.mask,measureFace:async()=>[],preservePlacement});
 const garment=result.find(l=>l.id===suit.id),fitted=result.find(l=>l.id===head.id);
 for(const key of ['source','templatePath','sourceFrame','collarFrame','x','y','scale','rotation'])assert.equal(garment[key],suit[key],key);
 assert.equal(garment.neckWidth,0);assert.equal(garment.neckHeight,0);assert.equal(garment.autoCollarFitApplied,false);
 assert.equal(garment.autoSuitFitVersion,STUDIO_SUIT_FIT_VERSION);assert.equal(garment.autoSuitFitWarning,'');
 assert.equal(fitted.source,head.source);assert.equal(fitted.mask,head.mask);assert.equal(fitted.jobId,head.jobId);assert.equal(result.find(l=>l.id==='pin'),decoration);assert(!result.some(l=>l.kind==='neck-fit'));
 if(preservePlacement)assert.equal(fitted,head);else assert.notEqual(fitted.scale,head.scale);
}
assert.equal(JSON.stringify(layers),before);
assert(!source.slice(start).includes('warpStudioCollar'));assert(!source.slice(start).includes('solveAutoCollarWidth'));assert(!source.slice(start).includes('measureSkinNeckProfile'));
console.log('PASS actual automatic fitting changes only head pose, retains original garment pixels/frame/pose, clears old automatic collar width/height, leaves pins and original head pixels/job intact, and does not require neck coverage. No AI/service calls.');
// A new collar relocates the chin; larger shoulders enlarge the same head.
{
 const baseUniform={...uniform,collarTopY:110,necklineY:130};
 const female={...head,portraitMode:'female'};
 const plan=u=>planStudioSuitGeometry({uniform:u,face,head:female,suit});
 const small=plan({...baseUniform,shoulderWidth:650,torsoWidth:650});
 const broad=plan({...baseUniform,shoulderWidth:850,torsoWidth:850});
 assert(broad.headPose.scale>small.headPose.scale,'broader measured shoulders must support a larger head');
 const low=plan({...baseUniform,necklineY:230});
 const base=plan(baseUniform);
 const collarOffset=p=>p.chinTarget.y+face.faceHeight*p.headPose.scale*.16;
 assert(Math.abs(collarOffset(low)-collarOffset(base)-90)<1e-8,'chin plus proportional exposed neck follows actual collar height');
 assert.deepEqual(base,planStudioSuitGeometry({uniform:baseUniform,face,head:{...female,portraitMode:'male'},suit}),'both portrait modes use the same anatomical fitting');
 const tall=planStudioSuitGeometry({uniform:baseUniform,face:{...face,faceHeight:800},head:female,suit});
 assert(tall.headPose.scale<base.headPose.scale,'longer faces respect a shoulder-relative height limit');
}
console.log('PASS new suit fitting follows shoulder breadth, actual collar height, face height and both portrait modes.');
