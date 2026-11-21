import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {governmentReferenceLandmarkFit,easyGovernmentNativeReferenceFit} from '../src/government-insignia-fit.js';
const suit={visible:true,templatePath:'/assets/government-uniforms/female-operational.png',sourceFrame:{x:0,y:694,w:1344,h:1136},x:0,y:0,scale:1};
const point=(fit,x,y)=>({x:fit.frame.x+fit.frame.w*x,y:fit.frame.y+fit.frame.h*y});
const near=(a,b,t=3)=>assert(Math.abs(a-b)<=t,`${a} differs from reference ${b}`);
test('Easy female native jacket matches supplied second portrait collar/chest/ribbon bounds without manual transforms',()=>{
 const fit=easyGovernmentNativeReferenceFit(suit,'female',1344,1830),p=fit.preset;
 assert.equal(fit.needsReview,false);
 for(const [actual,x,y] of [[point(fit,p.collar.left,p.collar.y),425,1018],[point(fit,p.collar.right,p.collar.y),913,1018],[point(fit,p.chest.x,p.chest.y),309,1290],[point(fit,p.ribbon.x,p.ribbon.top),1027,1252]]){near(actual.x,x);near(actual.y,y)}
 near(fit.frame.w*p.collar.width,72);near(fit.frame.w*p.chest.width,90);near(fit.frame.w*p.ribbon.width,274);
});
test('registered coordinates follow each native garment frame, translation and scale in Easy without measuring white backgrounds',()=>{
 for(const name of ['operational','senior','academic','government-employee'])for(const scale of [.7,1,1.2]){
  const layer={...suit,templatePath:`/assets/government-uniforms/female-${name}.png`,sourceFrame:{x:100,y:450,w:700,h:590},x:14,y:-9,scale};
  const fit=easyGovernmentNativeReferenceFit(layer),p=fit.preset;
  const got=point(fit,p.collar.left,p.collar.y);
  near(got.x,450+14+(100+700*.316-450)*scale,.001);
  near(got.y,600-9+(450+590*.285-600)*scale,.001);
  near(fit.frame.w*p.ribbon.width,700*scale*.204,.001);
 }
});
test('edited/rotated/preview/unknown garments retain painted-geometry fallback and Studio preset is unchanged',()=>{
 for(const patch of [{visible:false},{rotation:10},{warpSource:'brush edit'},{squeezeX:1.1},{neckWidth:20},{suitPreviewOnly:true},{templatePath:'/assets/other.png'}])assert.equal(easyGovernmentNativeReferenceFit({...suit,...patch}),null);
 assert.equal(easyGovernmentNativeReferenceFit(suit,'male'),null);
});

test('full-body Easy result independently matches the supplied second reference with no visible PNG suit layer',async()=>{
 const garment=await sharp(new URL('../public/assets/government-uniforms/female-operational.png',import.meta.url).pathname).resize(1344,1136,{fit:'fill'}).png().toBuffer();
 const {data}=await sharp({create:{width:1344,height:1830,channels:4,background:'#3989e8'}}).composite([{input:garment,left:0,top:694}]).raw().toBuffer({resolveWithObject:true});
 const fit=governmentReferenceLandmarkFit({data,width:1344,height:1830},'female','/assets/government-uniforms/female-operational.png'),p=fit.preset;
 for(const [actual,x,y] of [[point(fit,p.collar.left,p.collar.y),425,1018],[point(fit,p.collar.right,p.collar.y),913,1018],[point(fit,p.chest.x,p.chest.y),309,1290],[point(fit,p.ribbon.x,p.ribbon.top),1027,1252]]){near(actual.x,x);near(actual.y,y)}
 near(fit.frame.w*p.collar.width,72);near(fit.frame.w*p.chest.width,90);near(fit.frame.w*p.ribbon.width,274);
});
