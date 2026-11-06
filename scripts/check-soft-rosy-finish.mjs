import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {femaleFinishFor} from '../review-portrait-finish.js';
import {productionPortraitPrompt} from '../production-portrait-pipeline.js';
import {PRODUCTION_HAIR_CATALOG} from '../hairstyle-catalog.js';
import {SOFT_ROSY_PORTRAIT_MAKEUP,SOFT_ROSY_TEXTURE_PRIORITY} from '../soft-rosy-portrait-finish.js';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const finishes=['natural','makeup','korean-rosy-v1'];
// Baselines captured from the previously published finish implementation.
assert.equal(hash(finishes.map(s=>femaleFinishFor(s))),'f54441cd1ac838449916ebffc3656bf9386b040531f72e98079906bc98399128');
assert.equal(hash(PRODUCTION_HAIR_CATALOG.flatMap(h=>finishes.map(f=>productionPortraitPrompt(h,f)))),'799848e9f079ae7778d816556eea2c2fdfde2f2fd414d1bf46bd07505609bcf3');
assert.equal(femaleFinishFor('soft-rosy-v1'),SOFT_ROSY_PORTRAIT_MAKEUP);
for(const old of finishes){assert.notEqual(femaleFinishFor(old),SOFT_ROSY_PORTRAIT_MAKEUP);assert.equal(portraitFinishChoice(old),old)}
assert.equal(portraitFinishChoice('soft-rosy-v1'),'soft-rosy-v1');
console.log('PASS all legacy portrait prompt bytes unchanged; new soft rosy prompt and finish ID independent.');

for(const h of PRODUCTION_HAIR_CATALOG){const prompt=productionPortraitPrompt(h,'soft-rosy-v1');if(h.gender==='female'){assert(prompt.endsWith(SOFT_ROSY_TEXTURE_PRIORITY));assert(prompt.includes('SOFT VELVETY SKIN REVISION 5'));assert(prompt.includes('SKIN REFINEMENT REQUIRED'))}else assert(!prompt.includes('FINAL SOFT ROSY SKIN PRIORITY'))}
console.log('PASS softness priority is last for the new female finish only; male and original finish prompts unchanged.');

assert(SOFT_ROSY_TEXTURE_PRIORITY.includes('not lighting alone'));
assert(SOFT_ROSY_TEXTURE_PRIORITY.includes('Reduce coarse pore contrast'));
assert(SOFT_ROSY_TEXTURE_PRIORITY.includes('dimensional cheek/nose/jaw/chin shading'));
assert(!SOFT_ROSY_PORTRAIT_MAKEUP.includes('The soft appearance must come from diffused LIGHT'));
console.log('PASS new finish requires selective skin refinement as well as soft light, without a pale overlay.');
