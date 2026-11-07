import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {femaleFinishFor,REVIEW_FEMALE_FINISH,NATURAL_FEMALE_FINISH} from '../review-portrait-finish.js';
import {productionPortraitPrompt} from '../production-portrait-pipeline.js';
import {NATURAL_STUDIO_SKIN_VERSION,NATURAL_STUDIO_SKIN_POLICY,NATURAL_STUDIO_LIGHT_POLICY,withNaturalStudioSkin,naturalStudioSkinMetadata} from '../natural-studio-skin.js';

// Baseline fingerprints cover complete generated prompt payloads, including
// accepted cosmetics, anatomy, hair and cutout instructions. No provider calls.

const BASE={
  "baseline": "dce88c6b066e03dea304bf3ca8d746f1e6d69d6a",
  "reviewBase": "961b3de11d06e47ec40cfa82fbede812c57020719ce18867d7a24a0b3d94f880",
  "naturalFinish": "b2bbae9114ea9eff2b1be650d8dc5b462d3bde36a9e1c2a29935bbd49fdf55ee",
  "naturalFemale": "6da82ffddeca57a7a3e3c7a2e089065c067941e8d95f73cb48ff163fc6d30a47",
  "finish": {
    "makeup": "9d8020508a6c8c49cf33ff16efb53df6400351e6f2921a3a007a094050f4e954",
    "korean-rosy-v1": "e87539033def737b0f9799f06bda76dcebdd337bf796ad0963531c2c3effd157",
    "soft-rosy-v1": "61a70ad85088903d81c8c1332a525c3ba2a3bac71d4b180fb8928a3fae15c13c"
  },
  "femalePrompts": {
    "makeup": "13916a388136342dac809522342a7d1511ee0a83f2fd59b5d6f29620d7965546",
    "korean-rosy-v1": "a922c5c8567b3dd01537423f8869a3993bbf582c981ccad51569af55b7097d7c",
    "soft-rosy-v1": "0b947c7dbfaf86204e72161bd72a6d27205c7f365a9f9cd997e1583eae55eb90"
  },
  "malePrompts": {
    "makeup": "f7d048243f47110a953eb88f24bdf76a456a93fba8998fac2bb21e38214d2044",
    "korean-rosy-v1": "f7d048243f47110a953eb88f24bdf76a456a93fba8998fac2bb21e38214d2044",
    "soft-rosy-v1": "f7d048243f47110a953eb88f24bdf76a456a93fba8998fac2bb21e38214d2044",
    "natural": "f7d048243f47110a953eb88f24bdf76a456a93fba8998fac2bb21e38214d2044"
  },
  "selected": [
    {
      "gender": "female"
    },
    {
      "gender": "male"
    },
    {
      "id": "seedream-40",
      "gender": "female"
    },
    {
      "id": "seedream-41",
      "gender": "female"
    },
    {
      "id": "seedream-42",
      "gender": "female"
    },
    {
      "id": "seedream-43",
      "gender": "female"
    },
    {
      "id": "seedream-07",
      "gender": "female"
    },
    {
      "id": "seedream-14",
      "gender": "female"
    },
    {
      "id": "seedream-25",
      "gender": "female"
    },
    {
      "id": "seedream-03",
      "gender": "female"
    },
    {
      "id": "seedream-05",
      "gender": "female"
    },
    {
      "id": "seedream-15",
      "gender": "female"
    },
    {
      "id": "seedream-16",
      "gender": "female"
    },
    {
      "id": "seedream-18",
      "gender": "female"
    },
    {
      "id": "seedream-20",
      "gender": "female"
    },
    {
      "id": "seedream-26",
      "gender": "female"
    },
    {
      "id": "seedream-27",
      "gender": "female"
    },
    {
      "id": "seedream-10",
      "gender": "female"
    },
    {
      "id": "seedream-19",
      "gender": "female"
    },
    {
      "id": "seedream-01",
      "gender": "female"
    },
    {
      "id": "seedream-02",
      "gender": "female"
    },
    {
      "id": "seedream-04",
      "gender": "female"
    },
    {
      "id": "seedream-06",
      "gender": "female"
    },
    {
      "id": "seedream-23",
      "gender": "female"
    },
    {
      "id": "seedream-24",
      "gender": "female"
    },
    {
      "id": "seedream-35",
      "gender": "male"
    },
    {
      "id": "seedream-28",
      "gender": "male"
    },
    {
      "id": "seedream-29",
      "gender": "male"
    },
    {
      "id": "seedream-30",
      "gender": "male"
    },
    {
      "id": "seedream-31",
      "gender": "male"
    },
    {
      "id": "seedream-32",
      "gender": "male"
    },
    {
      "id": "seedream-33",
      "gender": "male"
    },
    {
      "id": "seedream-34",
      "gender": "male"
    },
    {
      "id": "seedream-36",
      "gender": "male"
    },
    {
      "id": "seedream-37",
      "gender": "male"
    },
    {
      "id": "seedream-38",
      "gender": "female"
    },
    {
      "id": "seedream-39",
      "gender": "female"
    },
    {
      "id": "hair-21",
      "gender": "female"
    },
    {
      "id": "hair-25",
      "gender": "female"
    },
    {
      "id": "hair-26",
      "gender": "female"
    }
  ]
};

const hash=value=>createHash('sha256').update(value).digest('hex');
const styles=['makeup','korean-rosy-v1','soft-rosy-v1'];
const female=BASE.selected.filter(s=>s.gender==='female');
const male=BASE.selected.filter(s=>s.gender==='male');
const rows=(selected,style)=>selected.map(s=>({selected:s,prompt:productionPortraitPrompt(s,style)}));
let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name)};

check('accepted natural base remains byte-identical',()=>assert.equal(hash(REVIEW_FEMALE_FINISH),BASE.reviewBase));
for(const style of styles){
 check('female finish unchanged: '+style,()=>assert.equal(hash(femaleFinishFor(style)),BASE.finish[style]));
 check('all female prompt variants unchanged: '+style,()=>assert.equal(hash(JSON.stringify(rows(female,style))),BASE.femalePrompts[style]));
}
for(const style of ['natural',...styles]){
 check('all male prompt variants unchanged: '+style,()=>assert.equal(hash(JSON.stringify(rows(male,style))),BASE.malePrompts[style]));
}
check('natural is the default selected finish',()=>assert.equal(femaleFinishFor(),femaleFinishFor('natural')));
check('natural finish uses the explicit revised policy',()=>{
 assert.equal(NATURAL_FEMALE_FINISH,withNaturalStudioSkin(REVIEW_FEMALE_FINISH));
 assert.ok(NATURAL_FEMALE_FINISH.includes(NATURAL_STUDIO_SKIN_POLICY));
 assert.notEqual(NATURAL_FEMALE_FINISH,REVIEW_FEMALE_FINISH);
});
check('natural changes only the agreed skin/exposure and lighting scope',()=>{
 const currentFinish=femaleFinishFor('natural');
 assert.ok(currentFinish.startsWith(NATURAL_FEMALE_FINISH));
 const prioritySuffix=currentFinish.slice(NATURAL_FEMALE_FINISH.length);
 const originalFinish=REVIEW_FEMALE_FINISH+prioritySuffix;
 assert.equal(hash(originalFinish),BASE.naturalFinish,'acne and eye priorities changed');
 const restored=female.map(selected=>{
  const unchangedCosmeticPrompt=productionPortraitPrompt(selected,'korean-rosy-v1');
  const marker='COHERENT FACE / NECK FILL LIGHT — SAME GENERATION:';
  const start=unchangedCosmeticPrompt.indexOf(marker);
  const end=unchangedCosmeticPrompt.indexOf('\nREFERENCE HAIR EXTENT LOCK:',start);
  assert.ok(start>=0&&end>start,'existing shared lighting boundary missing');
  const originalLight=unchangedCosmeticPrompt.slice(start,end);
  const actual=productionPortraitPrompt(selected,'natural');
  assert.equal(actual.split(currentFinish).length-1,1,'natural finish was not selected exactly once');
  assert.equal(actual.split(NATURAL_STUDIO_LIGHT_POLICY).length-1,1,'natural lighting was not selected exactly once');
  assert.ok(!actual.includes('approximately 8–10%'),'natural retained the old conflicting fixed fill target');
  return {selected,prompt:actual.replace(currentFinish,originalFinish).replace(NATURAL_STUDIO_LIGHT_POLICY,originalLight)};
 });
 assert.equal(hash(JSON.stringify(restored)),BASE.naturalFemale,'unrelated portrait instructions changed');
 assert.notEqual(hash(JSON.stringify(rows(female,'natural'))),BASE.naturalFemale,'natural request still uses the old policy');
});
check('natural policy preserves the accepted non-skin prefix and lip suffix',()=>{
 const start=REVIEW_FEMALE_FINISH.indexOf('\nSKIN AND LIGHT — ADAPTIVE FRONTAL STUDIO ILLUMINATION:');
 const end=REVIEW_FEMALE_FINISH.indexOf('\nLIPS — NATURAL KOREAN SOFT ROSE, SLIGHT HYDRATED GLOSS:',start);
 const prefix=REVIEW_FEMALE_FINISH.slice(0,start+1).replace('even healthy rosy skin','source-matched, evenly illuminated skin');
 assert.ok(start>=0&&end>start);
 assert.ok(NATURAL_FEMALE_FINISH.startsWith(prefix));
 assert.ok(NATURAL_FEMALE_FINISH.endsWith(REVIEW_FEMALE_FINISH.slice(end)));
});
check('missing skin boundary fails closed',()=>assert.throws(()=>withNaturalStudioSkin('unrelated portrait policy'),/natural_studio_skin_policy_boundary_missing/));
check('missing lip boundary fails closed',()=>assert.throws(()=>withNaturalStudioSkin('\nSKIN AND LIGHT — ADAPTIVE FRONTAL STUDIO ILLUMINATION: test'),/natural_studio_skin_policy_boundary_missing/));

check('unversioned images are not stamped as revised',()=>assert.deepEqual(naturalStudioSkinMetadata({}),{}));
check('unknown historical image revision is not accepted',()=>assert.deepEqual(naturalStudioSkinMetadata({idpromNaturalStudioSkinVersion:'older-revision'}),{}));
check('only explicit current image revision becomes head metadata',()=>assert.deepEqual(naturalStudioSkinMetadata({idpromNaturalStudioSkinVersion:NATURAL_STUDIO_SKIN_VERSION}),{naturalStudioSkinVersion:NATURAL_STUDIO_SKIN_VERSION}));
check('explicit current saved-head revision remains compatible',()=>assert.deepEqual(naturalStudioSkinMetadata(null,{naturalStudioSkinVersion:NATURAL_STUDIO_SKIN_VERSION}),{naturalStudioSkinVersion:NATURAL_STUDIO_SKIN_VERSION}));
check('unknown saved-head revision is not accepted',()=>assert.deepEqual(naturalStudioSkinMetadata(null,{naturalStudioSkinVersion:'older-revision'}),{}));
check('an unknown image cannot inherit a newer head revision',()=>assert.deepEqual(naturalStudioSkinMetadata({idpromNaturalStudioSkinVersion:'older-revision'},{naturalStudioSkinVersion:NATURAL_STUDIO_SKIN_VERSION}),{}));
check('natural metadata never invents a portrait or cosmetic mode',()=>{
 const head={portraitMode:'female',femaleEyeStyle:'natural',initialFemaleEyeStyle:'natural'};
 const copy=JSON.parse(JSON.stringify(head));
 const result=naturalStudioSkinMetadata({idpromNaturalStudioSkinVersion:NATURAL_STUDIO_SKIN_VERSION},head);
 assert.deepEqual(Object.keys(result),['naturalStudioSkinVersion']);
 assert.deepEqual(head,copy);
 assert.ok(!('femaleFinishProfile' in result)&&!('femaleFinishReference' in result)&&!('femaleEyeStyle' in result)&&!('portraitMode' in result));
});
console.log(JSON.stringify({passed,failed:0,baseline:BASE.baseline,femalePromptVariants:female.length,malePromptVariants:male.length,scope:'Actual prompt builders and natural metadata. No image generation, model/network requests, payment, storage or customer writes.'}));
