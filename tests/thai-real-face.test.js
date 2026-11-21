import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {applyThaiRealFacePolicy,THAI_REAL_FACE_VERSION} from '../thai-real-face-policy.js';
import {THAI_OUTFIT_AI_VERSION} from '../thai-outfit-ai-policy.js';
import {MAKEUP_STUDIO_RETOUCH_POLICY} from '../makeup-studio-retouch-policy.js';
const fields={thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiRealFaceVersion:THAI_REAL_FACE_VERSION};
test('English and archived Thai prompt bytes remain unchanged without explicit new Thai version',()=>{
 for(const request of [{},{interfaceLanguage:'en',thaiRealFaceVersion:THAI_REAL_FACE_VERSION},{thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION},{...fields,thaiRealFaceVersion:'unknown'}])assert.equal(applyThaiRealFacePolicy(MAKEUP_STUDIO_RETOUCH_POLICY,request),MAKEUP_STUDIO_RETOUCH_POLICY);
});
test('new Thai makeup drops eye/lash/brow beautification conflicts and gives original eyes and anatomy final priority',()=>{
 const prompt=applyThaiRealFacePolicy(MAKEUP_STUDIO_RETOUCH_POLICY,fields);
 for(const forbidden of ['elegantly lifted individual lashes','fuller-looking individual lashes','Groom and softly fill both eyebrows','Check that both cosmetic brow shapes read','clean, curled individual lashes'])assert(!prompt.includes(forbidden),forbidden);
 for(const required of ['iris/pupil shapes, sizes and colours','original catchlight pattern','Never slim, squeeze, narrow','Never stretch its axes separately','realistic photographic pores','natural asymmetry','Selected Makeup may softly correct temporary blemishes','pink-nude'])assert(prompt.includes(required),required);
 assert(prompt.endsWith('inside this same original generation.'));
});
test('new Thai Natural preserves original prompt text and adds protection without adding makeup',()=>{
 const natural='Natural portrait with original face, real pores and unchanged lip colour.';
 const prompt=applyThaiRealFacePolicy(natural,fields);assert(prompt.startsWith(natural));assert(prompt.includes('Selected Makeup may'),'Cosmetics remain conditional, never forced on Natural');
});
test('request and both cache identities carry the new revision without changing original-upload generation',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert(main.includes("fd.append('thaiRealFaceVersion',THAI_REAL_FACE_VERSION)"));
 assert.equal((main.match(/thaiWholeOutfit\?\[THAI_OUTFIT_APPEARANCE_VERSION,THAI_SINGLE_COLLAR_VERSION,THAI_REAL_FACE_VERSION\]/g)||[]).length,2);
 const pipeline=await readFile(new URL('../production-portrait-pipeline.js',import.meta.url),'utf8');
 assert(pipeline.indexOf('prompt=applyThaiRealFacePolicy(prompt,fields)')<pipeline.indexOf('const result=await requestPortrait({key,prompt,size:templateBody?'));
});
