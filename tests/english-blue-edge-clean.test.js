import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decontaminateEnglishBlueEdgeRgba as fix} from '../english-blue-edge-clean.js';
import {englishTemplateBodyPrompt} from '../english-template-body-prompt.js';
import {englishHeadPortraitPrompt} from '../english-head-prompt.js';
import {englishNaturalStudioSkin} from '../english-studio-finish.js';
import {ENGLISH_MAKEUP_NATURAL_LIGHT_LOCK} from '../english-makeup-light-policy.js';
test('Remove only English edge blue spill; keep every alpha and portrait interior',()=>{
 const w=24,h=24,p=Buffer.alloc(w*h*4);
 const set=(x,y,r,g,b,a)=>{const j=(y*w+x)*4;p[j]=r;p[j+1]=g;p[j+2]=b;p[j+3]=a};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)set(x,y,...(x>=5&&x<=18&&y>=4&&y<=19?[195,145,125,255]:[45,75,170,0]));
 for(let y=5;y<=18;y++)set(5,y,76,101,142,190);
 const out=fix(p,w,h),idx=(x,y)=>(y*w+x)*4;
 assert.equal(out[idx(5,12)+3],190);
 assert(out[idx(5,12)+2]<142);
 for(let i=3;i<p.length;i+=4)assert.equal(out[i],p[i]);
 for(const [x,y] of [[12,12],[1,12]])for(let k=0;k<4;k++)assert.equal(out[idx(x,y)+k],p[idx(x,y)+k]);
});
test('No changes to dark hair and solid blue clothing',()=>{
 const w=32,h=32,p=Buffer.alloc(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,body=x>3&&x<28&&y>3&&y<28,colour=y>15?[30,85,175]:[27,24,27];
  p[i]=colour[0];p[i+1]=colour[1];p[i+2]=colour[2];p[i+3]=body?255:0;
 }
 assert.deepEqual(fix(p,w,h),p);
});
test('English prompts override ear wisps, earrings, rough grain and dark edge outlines',()=>{
 for(const s of [englishNaturalStudioSkin(),englishTemplateBodyPrompt({identityIndex:1,outfitIndex:2}),englishHeadPortraitPrompt(),ENGLISH_MAKEUP_NATURAL_LIGHT_LOCK]){
  assert.match(s,/earrings/i);assert.match(s,/wisps/i);assert.match(s,/grain|pores/i);assert.match(s,/dark|black/i);
 }
});