import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {
 easyGovernmentReferencePreset,easyGovernmentPhotoFallback,easyGovernmentInsigniaFit,
 governmentInsigniaPreset
} from '../src/government-insignia-fit.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function syntheticJacket(left=135,right=465,shift=0){
 const width=600,height=800,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const index=(y*width+x)*4,z=Math.max(0,(y-height*.42)/(height*.58));
  const light=y>=height*.42&&x>left+shift-30*z&&x<right+shift+30*z;
  data[index]=light?241:44;data[index+1]=light?239:130;
  data[index+2]=light?238:220;data[index+3]=255;
 }
 return {width,height,data};
}

test('Thai Easy women reference matches uploaded photo collar, chest, ribbon positions and size',()=>{
 // Actual supplied 1504x2047 image: detected white jacket bounds from pixels.
 const frame={x:168,y:1085,w:1164,h:962};
 const p=easyGovernmentReferencePreset(frame,'female','/assets/government-uniforms/female-operational.png');
 const at=(x,y)=>({x:frame.x+frame.w*x,y:frame.y+frame.h*y});
 const near=(actual,expected,tolerance=15)=>assert(Math.abs(actual-expected)<=tolerance,
  'position '+actual+' expected '+expected);
 near(at(p.collar.left,p.collar.y).x,476);
 near(at(p.collar.right,p.collar.y).x,1032);
 near(at(p.collar.left,p.collar.y).y,1136);
 near(at(p.chest.x,p.chest.y).x,341);
 near(at(p.chest.x,p.chest.y).y,1440);
 near(at(p.ribbon.x,p.ribbon.top).x,1152);
 near(at(p.ribbon.x,p.ribbon.top).y,1400);
 near(p.ribbon.width*frame.w,303,12);
 near(p.collar.width*frame.w,85,12);
 assert(p.ribbon.width>=.25&&p.ribbon.width<=.275);
 assert.equal(governmentInsigniaPreset(frame,'female').ribbon.width,.235,
  'Studio native reference remains unchanged');
 const fallback=easyGovernmentPhotoFallback(900,1200,'female');
 assert.equal(fallback.needsReview,true);
 assert(fallback.preset.ribbon.width>=.20,'Fallback ribbon stays legible');
});

test('Thai Easy pins stay off visible diagonal lapel folds',()=>{
 const image=syntheticJacket();
 const original=easyGovernmentInsigniaFit(image,'female','/assets/government-uniforms/female-operational.png');
 assert(original);
 const x0=Math.round(original.frame.x+original.frame.w*original.preset.collar.left);
 const y0=Math.round(original.frame.y+original.frame.h*original.preset.collar.y);
 // Draw a seam through the original pin position.
 for(let dy=-15;dy<=15;dy++)for(let dx=-2;dx<=2;dx++){
  const x=x0+Math.round(dy*.15)+dx,y=y0+dy,i=(y*image.width+x)*4;
  image.data[i]=152;image.data[i+1]=152;image.data[i+2]=153;
 }
 const corrected=easyGovernmentInsigniaFit(image,'female','/assets/government-uniforms/female-operational.png');
 assert(corrected);
 const x1=Math.round(corrected.frame.x+corrected.frame.w*corrected.preset.collar.left);
 const y1=Math.round(corrected.frame.y+corrected.frame.h*corrected.preset.collar.y);
 assert(Math.hypot(x1-x0,y1-y0)>=6,'Seam must move the pin off the crease');
 assert(Math.hypot(x1-x0,y1-y0)<36,'Adjustment cannot jump off the lapel');
 assert.equal(corrected.preset.ribbon.width,original.preset.ribbon.width,
  'Moving collar pins cannot shrink a chest ribbon');
});

test('Thai Easy accommodates different torso sizes while never scaling the official PNG non-uniformly',async()=>{
 const examples=[
  [syntheticJacket(125,475),'female','/assets/government-uniforms/female-operational.png'],
  [syntheticJacket(205,399),'female','/assets/government-uniforms/female-senior.png'],
  [syntheticJacket(135,450,24),'female','/assets/government-uniforms/female-government-employee.png'],
  [syntheticJacket(145,465),'male','/assets/government-uniforms/male-government-employee.png'],
  [syntheticJacket(155,445),'male','/assets/government-uniforms/male-formal-tie-suit.png']
 ];
 const fitted=examples.map(([image,gender,path])=>easyGovernmentInsigniaFit(image,gender,path));
 assert(fitted.every(Boolean));
 for(const x of fitted){
  assert(x.preset.collar.width<=.073001);
  assert(x.preset.chest.width<=.086001);
  assert(x.preset.ribbon.width>=.235&&x.preset.ribbon.width<=.276);
  assert(x.preset.ribbon.x+x.preset.ribbon.width/2<.99,'No outer-edge overrun');
  assert(x.preset.ribbon.x-x.preset.ribbon.width/2>.52,'No placket overlap');
 }
 assert(fitted[1].frame.w*fitted[1].preset.ribbon.width<
  fitted[0].frame.w*fitted[0].preset.ribbon.width*.80,
  'Narrow torso ribbon pixels must be smaller than a broad torso');
 const assetSource=await readFile(resolve(root,'src/studio-source.js'),'utf8');
 assert(assetSource.includes('h=w*c.height/c.width'),
  'Pin and ribbon assets must retain intrinsic pixel aspect ratio');
 const editor=await readFile(resolve(root,'src/studio-editor.jsx'),'utf8');
 assert(editor.includes('const easyFit=autoInsignia&&resultInsigniaDirect?measureEasyGovernmentInsigniaFit():null'),
  'Easy placement only; Studio reference unchanged');
});
