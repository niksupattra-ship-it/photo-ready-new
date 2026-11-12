import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {restoreEnglishMakeupSilhouette} from '../english-makeup-edge-repair.js';
import {createAiMakeupVariant} from '../ai-portrait-makeup.js';

const W=128,H=160;
const pngFromRaw=raw=>sharp(raw,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
const rgba=async buf=>sharp(buf).ensureAlpha().raw().toBuffer();
const color=(pixels,x,y)=>Array.from(pixels.subarray((y*W+x)*4,(y*W+x)*4+4));
function buildPortrait({opaque=false}={}){
 const natural=Buffer.alloc(W*H*4),makeup=Buffer.alloc(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=(y*W+x)*4,body=x>=18&&x<110&&y>=12&&y<148;
  const antialias=body&&(x===18||x===109||y===12||y===147);
  natural[i]=185;natural[i+1]=150;natural[i+2]=128;
  natural[i+3]=opaque?255:(body?(antialias?170:255):0);
  makeup[i]=body&&(x<24||x>103||y<18||y>141)?40:210;
  makeup[i+1]=90;makeup[i+2]=95;makeup[i+3]=255;
 }
 return {natural,makeup};
}
test('English makeup restores Natural outer RGB, feathers softly, retains interior and exact alpha',async()=>{
 const {natural,makeup}=buildPortrait();
 const result=await restoreEnglishMakeupSilhouette(await pngFromRaw(natural),await pngFromRaw(makeup),W,H);
 const pixels=await rgba(result);
 assert.deepEqual(color(pixels,18,72),color(natural,18,72));
 assert.equal(color(pixels,19,72)[0],185);
 assert(color(pixels,20,72)[0]>40&&color(pixels,20,72)[0]<185);
 assert.deepEqual(color(pixels,80,80),color(makeup,80,80));
 assert.equal(color(pixels,2,2)[3],0);
 for(let i=3;i<pixels.length;i+=4)assert.equal(pixels[i],natural[i]);
});
test('Opaque Natural without a silhouette preserves Makeup RGB; never guess a facial boundary',async()=>{
 const {natural,makeup}=buildPortrait({opaque:true});
 const result=await restoreEnglishMakeupSilhouette(await pngFromRaw(natural),await pngFromRaw(makeup),W,H);
 const pixels=await rgba(result);
 for(let i=0;i<pixels.length;i+=4){
  assert.equal(pixels[i],makeup[i]);assert.equal(pixels[i+1],makeup[i+1]);assert.equal(pixels[i+2],makeup[i+2]);assert.equal(pixels[i+3],255);
 }
});
test('Mismatch dimensions fail rather than corrupt the image',async()=>{
 const {natural,makeup}=buildPortrait();
 await assert.rejects(restoreEnglishMakeupSilhouette(await pngFromRaw(natural),await pngFromRaw(makeup),W+1,H),/ขนาดภาพแต่งหน้า/);
});
test('English provider path repairs the edge; unchanged Thai provider path keeps original AI RGB',async()=>{
 const {natural,makeup}=buildPortrait(),source=await pngFromRaw(natural),generated=await pngFromRaw(makeup);
 const requestPortrait=async()=>({png:generated});
 const english=await createAiMakeupVariant(source,{englishTemplateFinish:true,requestPortrait});
 const thai=await createAiMakeupVariant(source,{requestPortrait});
 const e=await rgba(english),t=await rgba(thai);
 assert.deepEqual(color(e,18,72),color(natural,18,72));
 assert.equal(color(t,18,72)[0],40);
 assert.deepEqual(color(e,80,80),color(t,80,80));
 for(let i=3;i<e.length;i+=4){assert.equal(e[i],natural[i]);assert.equal(t[i],natural[i]);}
});
