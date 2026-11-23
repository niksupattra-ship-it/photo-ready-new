import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {fitEnglishHeadTemplate} from '../english-head-portrait.js';
import {measureUniformAnchors} from '../src/portrait-uniform-fit.js';
import {seatMeasuredNeck,planThaiNeckMesh,createThaiNativeHeadFit,THAI_NATIVE_HEAD_FIT_VERSION} from '../src/thai-native-head-fit.js';
const root=new URL('..',import.meta.url).pathname;
for(const file of ['female-operational.png','male-government-employee.png'])test(`measured neck fits ${file} with narrow/broad faces and short/long source necks`,async()=>{
 const {data,info}=await sharp(root+'public/assets/government-uniforms/'+file).ensureAlpha().raw().toBuffer({resolveWithObject:true});const uniform=measureUniformAnchors(data,info.width,info.height);
 for(const faceWidth of [.30,.45,.60])for(const neckHeight of [12,30,65]){
  const face={10:{x:.5,y:.12},152:{x:.5,y:.45},234:{x:.5-faceWidth/2,y:.3},454:{x:.5+faceWidth/2,y:.3}},width=256,height=320;
  const labels={width,height,data:new Uint8Array(width*height)};for(let y=Math.ceil(face[152].y*height);y<Math.ceil(face[152].y*height)+neckHeight;y++)for(let x=107;x<149;x++)labels.data[y*width+x]=2;
  const fit=fitEnglishHeadTemplate({uniform,face,width,height,crownY:15});const seated=seatMeasuredNeck(fit,{face,width,height,labels,uniform});assert(seated);
  const mesh=planThaiNeckMesh(seated,{face,width,height,labels,uniform,uniformPixels:data});assert(mesh);assert(fit.faceRatio<=.30+1e-9);assert(Math.abs(fit.head.w/width-fit.head.h/height)<1e-12);assert.equal(seated.head.y,fit.head.y);
  assert(mesh.top>fit.chinY,'No neck row may alter the face/jaw');assert(mesh.bottom>=fit.collarBase||mesh.bottom>=fit.collarY);
  for(const row of mesh.rows){const y=Math.floor(row.sy);assert.equal(labels.data[y*width+Math.floor(row.sx)],2);assert.equal(labels.data[y*width+Math.floor(row.sx+row.sw-1)],2);assert(row.dw>0);assert(row.dy>=fit.chinY)}
 }
});
test('missing or shirt-labelled neck evidence is never filled with guessed skin',async()=>{
 const face={10:{x:.5,y:.1},152:{x:.5,y:.45},234:{x:.3,y:.3},454:{x:.7,y:.3}},labels={width:256,height:320,data:new Uint8Array(256*320).fill(4)},fit={head:{x:0,y:0,w:256,h:320},garment:{x:0,y:100,w:256,h:320},scale:1,chinY:144,collarY:200};
 assert.equal(seatMeasuredNeck(fit,{face,width:256,height:320,labels,uniform:{width:256,socketY:110}}),null);
 assert.equal(planThaiNeckMesh(fit,{face,width:256,height:320,labels,uniform:{width:256,height:320,centerX:128,collarTopY:100},uniformPixels:new Uint8Array(256*320*4)}),null);
});
test('model failure preserves completed PNG, rights metadata and retryability without any AI call',async()=>{
 let decodes=0;const blob=Object.assign(new Blob(['same accepted pixels'],{type:'image/png'}),{idpromJobId:'owned-job',idpromTrial:true});
 const prepare=createThaiNativeHeadFit({decode:async()=>{decodes++;throw Error('model unavailable')},canvasFor:()=>{throw Error('No canvas needed')}});
 assert.equal(await prepare(blob,'/outfit.png'),blob);assert.equal(await blob.text(),'same accepted pixels');assert.equal(blob.idpromJobId,'owned-job');assert(blob.idpromTrial);assert(blob.idpromQualityReviewNeeded);await prepare(blob,'/outfit.png');assert.equal(decodes,2,'Failure must not poison the local result cache');
 blob.idpromThaiNativeHeadFitVersion=THAI_NATIVE_HEAD_FIT_VERSION;assert.equal(await prepare(blob,'/outfit.png'),blob);assert.equal(decodes,2,'Already fitted masters are never resized twice');
});
test('actual app scopes fitting to Thai completed body outputs and invokes it for first-processing and hairstyle changes',async()=>{
 const app=await readFile(root+'src/main.jsx','utf8'),a=app.indexOf('async function finishFirstPortraitMaster('),b=app.indexOf('\n}',a)+2;
 const prepareCalls=[],original={},env={englishPreviewEnabled:()=>false,ENGLISH_BODY_PORTRAIT_VERSION:'body',THAI_REAL_FACE_VERSION:'thai',isThaiOutfitPath:p=>p==='/thai.png',sharedStudioSkinSource:()=>null,prepareThaiNativeHeadFit:async(...args)=>{prepareCalls.push(args);return original}};
 const run=Function('env','with(env){'+app.slice(a,b)+';return finishFirstPortraitMaster}')(env);
 const valid={idpromPortraitComposition:'body',idpromThaiRealFaceVersion:'thai'};assert.equal(await run(valid,null,{templatePath:'/thai.png'}),original);assert.equal(prepareCalls.length,1);
 for(const blob of [{},{...valid,idpromThaiRealFaceVersion:'old'}])assert.equal(await run(blob,null,{templatePath:'/thai.png'}),blob);
 env.englishPreviewEnabled=()=>true;assert.equal(await run(valid,null,{templatePath:'/thai.png'}),valid);assert.equal(prepareCalls.length,1);
 assert(app.includes('finishFirstPortraitMaster(aiHead,null,{templatePath:template})'));assert(app.includes('finishFirstPortraitMaster(aiHeadNeck,originalFile,{portraitMode,templatePath:uniformTemplate})'));assert(app.includes('finishFirstPortraitMaster(transparent,null,{templatePath:outfitReferencePath'));
});
