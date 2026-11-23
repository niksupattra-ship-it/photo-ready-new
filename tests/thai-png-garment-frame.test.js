import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {planThaiPngGarmentFrame,THAI_PNG_GARMENT_FRAME_VERSION,fitThaiBodyScene} from '../src/thai-body-framing.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
function fixture(w,h,{left=.08,right=.92,crown=.22,bottom=.99}={}){
 const p=new Uint8ClampedArray(w*h*4);
 for(let y=Math.floor(h*crown);y<Math.floor(h*.53);y++)for(let x=Math.floor(w*.31);x<Math.floor(w*.69);x++)p[(y*w+x)*4+3]=255;
 for(let y=Math.floor(h*.53);y<Math.floor(h*bottom);y++)for(let x=Math.floor(w*left);x<Math.floor(w*right);x++)p[(y*w+x)*4+3]=255;
 return p;
}
test('PNG silhouette fit fills both sides and bottom for narrow/wide bodies, retaining crown without a separate head warp',()=>{
 const template=fixture(300,400,{left:.04,right:.96,crown:.3});
 for(const [w,h,left,right,crown] of [[300,400,.1,.9,.22],[300,400,.18,.82,.03],[450,600,.05,.95,.28],[600,800,.12,.88,.1]]){
  const p=fixture(w,h,{left,right,crown}),before=hash(p),head={top:Math.floor(h*crown),width:w*.38,height:h*.4,centerX:w*.5};
  const plan=planThaiPngGarmentFrame(p,w,h,template,300,400,{head});
  assert.equal(plan.reason,'native_png_frame');
  assert(plan.x+plan.coat.left*plan.scale<=-2+1e-8);
  assert(plan.x+(plan.coat.right+1)*plan.scale>=902-1e-8);
  assert(plan.y+(plan.bottom+1)*plan.scale>=1202-1e-8);
  assert(plan.headroom>=72-1e-8);assert.equal(hash(p),before);
  const layer={id:'h',kind:'head',source:'native-pixels',sourceFrame:{x:0,y:0,w:900,h:1200}};
  const fitted=fitThaiBodyScene([layer],layer,plan,w,h);
  assert.equal(fitted[0].source,'native-pixels');
  assert.equal(fitThaiBodyScene(fitted,fitted[0],plan,w,h),fitted,'No cumulative zoom');
 }
});
test('actual female government and job PNGs provide measurable full-width garment targets',async()=>{
 const p=fixture(300,400);
 for(const file of ['government-uniforms/female-operational.png','job-uniforms/female-job-ivory-bow-blouse.png']){
  const {data,info}=await sharp(new URL('../public/assets/'+file,import.meta.url).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const plan=planThaiPngGarmentFrame(p,300,400,data,info.width,info.height);
  assert.equal(plan.reason,'native_png_frame',file);assert.equal(plan.template.bottom,1202);
 }
});
test('invalid native guides retain safe completed-image placement',()=>{
 const p=fixture(300,400),plan=planThaiPngGarmentFrame(p,300,400,new Uint8Array(4),1,1);
 assert.equal(plan.reason,'native_png_unmeasurable');assert(Number.isFinite(plan.scale));
});
test('only Thai female entry points opt in; stored PNG placement survives Studio hydration',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 assert(main.includes("nativeGarmentFrame:!englishPreviewEnabled()&&(portraitMode||originalFile?.idpromPortraitMode||gender)==='female'"));
 assert(main.includes("nativeGarmentFrame:!englishPreviewEnabled()&&portraitMode==='female'"));
 assert(main.includes('thaiPngGarmentFrameVersion:headMasterBlob.idpromThaiPngGarmentFrameVersion'));
 assert(editor.includes('head.thaiPngGarmentFrameVersion!==THAI_PNG_GARMENT_FRAME_VERSION'));
 assert.equal(THAI_PNG_GARMENT_FRAME_VERSION,'thai-female-native-png-frame-v1');
});
