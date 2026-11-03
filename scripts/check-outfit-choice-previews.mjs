import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {outfitChoicePreview} from '../src/outfit-choice-preview.js';
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const block=main.match(/const JOB_UNIFORMS=\[[\s\S]*?\n\];/)?.[0];assert(block);
const outfits=Function(block+';return JOB_UNIFORMS')();
for(const option of outfits){
 const original=option.preview||option.img;
 assert.equal(outfitChoicePreview(option,original,{search:''}),original);
 const english=outfitChoicePreview(option,original,{search:'?lang=en'});
 assert(english.startsWith('/assets/uniform-quick-previews/job-uniforms--'));
 assert(!english.includes('example'));await access(new URL('../public'+english,import.meta.url));
 assert(option.template.startsWith('/assets/job-uniforms/'));
}
const noCache={template:'/assets/job-uniforms/test-pattern.png'};
assert.equal(outfitChoicePreview(noCache,'portrait.jpg',{search:'?lang=en'}),noCache.template);
assert.equal(outfitChoicePreview(null,'original.jpg',{search:'?lang=en'}),'original.jpg');
console.log(`PASS all ${outfits.length} English outfit choices use garment-only previews; Thai choices and template paths remain unchanged; missing previews fall back to the garment template. No AI or network requests.`);
