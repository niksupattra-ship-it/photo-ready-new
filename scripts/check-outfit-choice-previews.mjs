import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {outfitChoicePreview} from '../src/outfit-choice-preview.js';
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
let total=0;
for(const name of ['JOB_UNIFORMS','STUDENT_UNIFORMS','GOWN_UNIFORMS','INTERIOR_UNIFORMS','FEMALE_GOVERNMENT_UNIFORMS']){
 const block=main.match(new RegExp('const '+name+'=\\[[\\s\\S]*?\\n\\];'))?.[0];assert(block,name);
 const outfits=Function(block+';return '+name)();
 for(const option of outfits){
  const original=option.preview||option.img,template=option.template||option.img;
  const thai=outfitChoicePreview(option,original,{search:''}),english=outfitChoicePreview(option,original,{search:'?lang=en'});
  assert.equal(thai,english);assert(thai.startsWith('/assets/uniform-quick-previews/')||thai===template);
  assert(!thai.includes('example'));await access(new URL('../public'+thai,import.meta.url));await access(new URL('../public'+template,import.meta.url));total++;
 }
}
const noCache={template:'/assets/gown-uniforms/test-pattern.png'};
assert.equal(outfitChoicePreview(noCache,'portrait.jpg'),noCache.template);
assert.equal(outfitChoicePreview(null,'original.jpg'),'original.jpg');
assert.equal(outfitChoicePreview({img:'/assets/job-uniforms/example-example.png'},'portrait.jpg'),'portrait.jpg');
console.log(`PASS all ${total} Thai and English outfit choices use garment-only images across job, government, student and graduation catalogs. Original template paths are retained. No AI or network requests.`);
