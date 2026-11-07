import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {femaleFinishFor} from '../review-portrait-finish.js';
import {productionPortraitPrompt} from '../production-portrait-pipeline.js';
import {PRODUCTION_HAIR_CATALOG} from '../hairstyle-catalog.js';
import {SOFT_ROSY_PORTRAIT_MAKEUP,SOFT_ROSY_TEXTURE_PRIORITY,ORIGINAL_PORTRAIT_COSMETICS} from '../soft-rosy-portrait-finish.js';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const finishes=['makeup','soft-rosy-v1'];
// Baselines captured from the previously published finish implementation.
assert.equal(hash(finishes.map(s=>femaleFinishFor(s))),'1c819aa054f0953f23101a9a802149d919cbe5a60df224242a57ab5dfab8b06d');
assert.equal(hash(PRODUCTION_HAIR_CATALOG.flatMap(h=>finishes.map(f=>productionPortraitPrompt(h,f)))),'5e7d4bd82a0901ab8ab9a008b81d3b265bced1bdd90dde9da0c52069de9d3c0c');
assert.equal(femaleFinishFor('soft-rosy-v1'),SOFT_ROSY_PORTRAIT_MAKEUP);
for(const old of ['natural','makeup','korean-rosy-v1']){assert.notEqual(femaleFinishFor(old),SOFT_ROSY_PORTRAIT_MAKEUP);assert.equal(portraitFinishChoice(old),old)}
assert.equal(portraitFinishChoice('soft-rosy-v1'),'soft-rosy-v1');
console.log('PASS legacy and soft makeup policies unchanged; natural and original makeup receive requested brighter, even light.');

for(const h of PRODUCTION_HAIR_CATALOG){
 const prompt=productionPortraitPrompt(h,'soft-rosy-v1');
 if(h.gender==='female'){assert(prompt.endsWith(SOFT_ROSY_TEXTURE_PRIORITY));assert(prompt.includes('FOUNDATION CONCEALER RADIANCE REVISION 8'));assert(prompt.includes('SKIN REFINEMENT REQUIRED'))}
 else assert(!prompt.includes('FINAL SOFT ROSY SKIN PRIORITY'));
}
assert(SOFT_ROSY_PORTRAIT_MAKEUP.includes(ORIGINAL_PORTRAIT_COSMETICS));
assert(ORIGINAL_PORTRAIT_COSMETICS.startsWith('Create restrained Korean makeup:'));
assert(femaleFinishFor('korean-rosy-v1').endsWith(ORIGINAL_PORTRAIT_COSMETICS));
for(const word of ['brows','eyelid','lashes','lip shape','lip colour'])assert(ORIGINAL_PORTRAIT_COSMETICS.includes(word),word);
assert(SOFT_ROSY_PORTRAIT_MAKEUP.includes('SKIN BASE — WELL-BLENDED FOUNDATION'));
assert(SOFT_ROSY_PORTRAIT_MAKEUP.includes('CONCEALER — LOCAL AND SEAMLESS'));
assert(SOFT_ROSY_PORTRAIT_MAKEUP.includes('SKIN LIGHT — STRONGER SOFT RADIANCE'));
assert(!SOFT_ROSY_PORTRAIT_MAKEUP.includes('KOREAN HAIR-STROKE MAKEUP BROWS'));
assert(SOFT_ROSY_TEXTURE_PRIORITY.includes('not lighting alone'));
console.log('PASS exact original brows/eyes/lashes/lips reused; only the independent foundation, concealer and soft skin-light policy is enhanced.');

assert.equal(hash(ORIGINAL_PORTRAIT_COSMETICS),'153fa2c5d65093abc459b0b7c148354f8e86325a5f1727c0e974ea0d7a2b484f');
console.log('PASS original eyebrow/eye/lash/lip instruction bytes are unchanged.');

assert.equal(hash(PRODUCTION_HAIR_CATALOG.filter(h=>h.gender==='male').map(h=>productionPortraitPrompt(h,'natural'))),'fd09f51f44dfb507978e468d581f5a9598277d867cc9f21b075cb866f56ffac0');
console.log('PASS male natural portrait prompt bytes unchanged.');
