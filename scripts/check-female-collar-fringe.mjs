import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {planStudioSuitGeometry} from '../src/studio-suit-fit.js';
import {prepareCatalogueHairOnly} from '../portrait-anatomy.js';
import {productionHair,selectedHairInstruction} from '../hairstyle-catalog.js';
const guide=await prepareCatalogueHairOnly(await readFile('public/assets/seedream-hairstyles/references/7.png'),'seedream-07',process.cwd()),p=await sharp(guide).ensureAlpha().raw().toBuffer({resolveWithObject:true}),source=await sharp(await readFile('public/assets/seedream-hairstyles/previews/7.webp')).ensureAlpha().raw().toBuffer();
assert.equal(p.info.width,512);assert.equal(p.info.height,512);let wisps=0;
for(let y=0;y<512;y++)for(let x=0;x<512;x++){const i=(y*512+x)*4;if(p.data[i+3])assert.deepEqual(p.data.subarray(i,i+3),source.subarray(i,i+3));if(x>300&&x<340&&y>125&&y<180&&p.data[i+3])wisps++;if(x>200&&x<300&&y>180&&y<300)assert.equal(p.data[i+3],0);if(y>430)assert.equal(p.data[i+3],0);}
assert(wisps>5);assert.match(selectedHairInstruction(productionHair('seedream-07')),/fine separated curtain wisps/);
console.log('PASS style 7 guide uses actual picker hair pixels, retains forehead wisps, excludes donor face/body');
const head={portraitMode:'female',sourceFrame:{x:0,y:0,w:900,h:1200}},suit={sourceFrame:{x:0,y:350,w:900,h:900}},face={width:900,height:1200,cx:450,chin:{x:450,y:615},leftEye:{x:365,y:365},rightEye:{x:535,y:365},left:{x:294,y:390},right:{x:606,y:390},faceWidth:312,faceHeight:460,opaqueTop:80};
for(const top of [0,80,160]){
 const uniform={width:1000,height:1000,bounds:{l:0,t:0,b:999,w:1000,h:1000},centerX:500,shoulderWidth:820,torsoWidth:700,socketY:200,collarTopY:top};
 const plan=planStudioSuitGeometry({uniform,face,head,suit}),collarY=350+top*.9,gap=collarY-plan.chinTarget.y;
 assert(Math.abs(gap-face.faceHeight*plan.headPose.scale*.16)<1e-8);assert(plan.headPose.scale*face.faceWidth<=plan.shoulderSpan*.32+1e-6);assert.equal(plan.headPose.squeezeX,1);assert.equal(plan.headPose.squeezeY,1);assert.equal(plan.garmentFrame,suit.sourceFrame);
}
console.log('PASS female head follows actual collar and shoulder width across high/low collars without stretching head or changing garment');
const main=await readFile('src/main.jsx','utf8'),a=main.indexOf('const fitChangedHairMaster=async'),b=main.indexOf('const changeHairForStudio=',a);assert(a>0&&b>a);
const {ORIGINAL_PORTRAIT_AI_VERSION}=await import('../original-portrait-ai.js');let composed=0;
const env={sharedStudioSkinSource:()=>null,ORIGINAL_PORTRAIT_AI_VERSION,activeUniformTemplate:'fallback',composePortrait:async(master,adjust,template,options)=>{composed++;assert.equal(template,'same-template');assert(options.placementOnly);return {lock:{femaleHeadFitVersion:'female-collar-v1',templatePath:template}}}};
const repair=Function('env','with(env){'+main.slice(a,b)+';return fitChangedHairMaster}')(env),master={idpromStudioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION},previous={master:{},lock:{templatePath:'same-template'}};
assert.equal((await repair(master,previous)).femaleHeadFitVersion,'female-collar-v1');assert.equal(composed,1);
env.sharedStudioSkinSource=()=> 'same-base';assert.equal(await repair(master,previous),previous.lock);assert.equal(composed,1);
console.log('PASS replacing an old female hair result repairs its old head/collar placement, while local makeup retains placement');
