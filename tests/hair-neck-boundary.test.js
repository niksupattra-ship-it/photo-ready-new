import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PRODUCTION_HAIR_CATALOG,productionHair,selectedHairDesign,HAIR_DESIGN_VERSION} from '../hairstyle-catalog.js';
import {FREE_FEMALE_HAIR_OPTIONS} from '../src/free-female-hair.js';
import {selectedHairBoundaryInstruction} from '../hair-neck-boundary.js';

test('every available selected cut uses its own extent contract in both locales',()=>{
 const seen=new Set();
 for(const selected of [...PRODUCTION_HAIR_CATALOG,...FREE_FEMALE_HAIR_OPTIONS]){
  const {kind}=selectedHairDesign(selected),prompt=selectedHairBoundaryInstruction(selected);
  seen.add(kind);assert.match(prompt,new RegExp('FINAL SELECTED HAIR BOUNDARY AUTHORITY — '+selected.id));
  assert(prompt.includes(kind.toUpperCase()+' SELECTED DESIGN'),selected.id+' has no '+kind+' contract');
  if(['short','gathered'].includes(kind)){
   assert.match(prompt,/BELOW the lower edge of EITHER ear/);assert.match(prompt,/ZERO visible hair/);
   assert.match(prompt,/Sideburns and tapered scalp roots must stop ABOVE/);
   assert.match(prompt,/overrides earlier side-lock, reference-wisp, sideburn and nape-preservation exceptions/);
   assert.doesNotMatch(prompt,/Preserve the natural short nape and reference sideburns without shaving them away/);
  }else{
   assert.doesNotMatch(prompt,/COMPACT UNDER-EAR \/ NECK EXCLUSION — HARD SPATIAL LIMIT/);
   assert.match(prompt,/continuous|connected/);assert.match(prompt,/NO (?:extra|second)/);
  }
 }
 assert.deepEqual([...seen].sort(),['bob','gathered','long','short']);
});

test('the reported braided crown stays compact while actual bob and long lengths stay protected',()=>{
 const braided=selectedHairBoundaryInstruction(productionHair('seedream-41'),{referenceBoard:true});
 assert.match(braided,/GATHERED SELECTED DESIGN/);assert.match(braided,/flat braid structure/);
 assert.match(braided,/RIGHT is its actual picker photograph/);assert.match(braided,/evidence of ABSENT hair/);
 assert.match(braided,/existing background OUTSIDE/);assert.match(braided,/do not widen the neck/);
 for(const id of ['seedream-42','seedream-44']){
  const long=selectedHairBoundaryInstruction(productionHair(id));
  assert.match(long,/Do not shorten it to a bob/);assert.match(long,/compact under-ear exclusion is not applied/);
 }
 const bob=selectedHairBoundaryInstruction(productionHair('seedream-47'));
 assert.match(bob,/Do not replace this bob with a pixie or updo or cut away its genuine continuous edge/);
});

test('current hair and female English AI Picks classify the real reference instead of forcing a stale selected kind',()=>{
 for(const options of [{portraitMode:'female',english:true},{portraitMode:'female',english:true,keepCurrentHair:true},{portraitMode:'male',english:true,keepCurrentHair:true}]){
  const selected=options.keepCurrentHair?productionHair('seedream-77'):null;
  const prompt=selectedHairBoundaryInstruction(selected,options);
  assert.match(prompt,/REFERENCE-CONDITIONED CURRENT \/ AI-PICKS HAIR/);
  assert.match(prompt,/never from a cropped face or stale hairstyle ID/);
  const start=prompt.indexOf('CONDITIONAL RULE, ONLY FOR AN ACTUALLY SHORT OR GATHERED REFERENCE:');
  const compact=prompt.indexOf('COMPACT UNDER-EAR / NECK EXCLUSION');
  const end=prompt.indexOf('END CONDITIONAL COMPACT RULE.');
  assert(start>=0&&start<compact&&compact<end);
  assert.match(prompt.slice(end),/For an actually long or bob reference, preserve its genuine continuous ends and lengths/);
  assert.doesNotMatch(prompt,/SHORT SELECTED DESIGN:|GATHERED SELECTED DESIGN:/);
 }
 assert.match(selectedHairBoundaryInstruction(null,{portraitMode:'male',english:true}),/SHORT SELECTED DESIGN/);
 assert.match(selectedHairBoundaryInstruction(null,{portraitMode:'female',english:false}),/GATHERED SELECTED DESIGN/);
});

test('new boundary version invalidates generation caches without relabeling stored pixels',async()=>{
 assert.equal(HAIR_DESIGN_VERSION,'selected-silhouette-v29-face-only-compact-source');
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const cache=main.slice(main.indexOf(' const key=JSON.stringify([SINGLE_PASS_PORTRAIT_VERSION'),main.indexOf(' const cached=await portraitResultCache.get',main.indexOf(' const key=JSON.stringify([SINGLE_PASS_PORTRAIT_VERSION')));
 assert.match(cache,/HAIR_DESIGN_VERSION/);
 assert.match(main,/head\.hairPolicyVersion!==HAIR_DESIGN_VERSION\+'-female-reference-v1'/);
 assert.match(main,/head\.hairPolicyVersion!==HAIR_DESIGN_VERSION\)return/);
});

test('explicit selected hairstyles replace all source hairstyle evidence with the selected guide',()=>{
 for(const selected of [...PRODUCTION_HAIR_CATALOG,...FREE_FEMALE_HAIR_OPTIONS]){
  const prompt=selectedHairBoundaryInstruction(selected);
  if(selected.promptOnly){
   assert.match(prompt,/STANDARD TEXT-ONLY HAIRSTYLE/);
   assert.match(prompt,/built-in description exclusively/);
   assert.match(prompt,/No donor hairstyle guide is supplied/);
   continue;
  }
  assert.match(prompt,/EXPLICIT SELECTED HAIRSTYLE ONLY — FULL REPLACEMENT, NOT AN OVERLAY/);
  assert.match(prompt,/Remove the ENTIRE original hairstyle, even where it overlaps the chosen design/);
  assert.match(prompt,/sole hairstyle design authority/);
  assert.match(prompt,/adapt only its placement, scale and scalp attachment, not the person's face/);
  assert.match(prompt,/Empty regions in the selected guide must stay free of hair/);
  assert.match(prompt,/For short or gathered designs, leave these spaces completely hair-free/);
 }
 for(const options of [{portraitMode:'female',english:true},{portraitMode:'male'},{portraitMode:'female',english:true,keepCurrentHair:true}])assert.doesNotMatch(selectedHairBoundaryInstruction(null,options),/EXPLICIT SELECTED HAIRSTYLE ONLY/);
});

test('explicit compact cuts receive a final output gate with clear sides of the neck, not source hair',()=>{
 for(const id of ['seedream-41','seedream-36','seedream-53','seedream-77']){
  const prompt=selectedHairBoundaryInstruction(productionHair(id));
  assert.match(prompt,/OUTPUT GATE — CLEAN NECK FOR THIS EXACT COMPACT CUT/);
  assert.match(prompt,/Do not render any separate dark hair-shaped silhouette in either gap/);
  assert.doesNotMatch(prompt,/In current-hair\/AI-Picks mode use the referenced cut itself/);
 }
 assert.doesNotMatch(selectedHairBoundaryInstruction(productionHair('seedream-44')),/OUTPUT GATE — CLEAN NECK/);
});

test('three standard female presets have low crowns and original-face instruction',async()=>{
 const {selectedHairInstruction,THAI_FREE_FEMALE_HAIR_IDS}=await import('../hairstyle-catalog.js');
 assert.deepEqual(THAI_FREE_FEMALE_HAIR_IDS,['seedream-14','seedream-16','seedream-27']);
 const ids=['standard-female-half-up','standard-female-gathered','standard-female-straight'];
 for(const id of ids){
  const style=productionHair(id),prompt=selectedHairInstruction(style);
  assert.equal(style.promptOnly,true);
  assert.equal(style.gender,'female');
  assert.match(prompt,/LOW HEAD HEIGHT/);
  assert.match(prompt,/NO other model\/hairstyle reference photo/);
  assert.match(prompt,/preserve the person's own natural asymmetrical facial features/);
  assert.match(selectedHairBoundaryInstruction(style),/uploaded person remains the only authority for face/);
 }
 assert.equal(selectedHairDesign(productionHair(ids[1])).kind,'gathered');
 for(const id of [ids[0],ids[2]])assert.equal(selectedHairDesign(productionHair(id)).kind,'long');
});
