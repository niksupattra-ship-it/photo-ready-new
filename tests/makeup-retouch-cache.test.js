import {THAI_FEMALE_HEAD_SIZE_VERSION} from '../thai-female-head-size.js';
import {ENGLISH_CIVIL_SERVICE_TEMPLATE,ENGLISH_CIVIL_SERVICE_FABRIC_VERSION} from '../english-civil-service-outfit.js';
import {ENGLISH_OUTFIT_FIDELITY_VERSION} from '../english-outfit-fidelity-version.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
import {HAIR_DESIGN_VERSION} from '../hairstyle-catalog.js';
import {SINGLE_PASS_PORTRAIT_VERSION} from '../single-pass-portrait-policy.js';
import {SINGLE_PASS_SKIN_QUALITY_VERSION} from '../single-pass-skin-quality.js';
import {MAKEUP_STUDIO_RETOUCH_VERSION} from '../makeup-studio-retouch-policy.js';
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const start=main.indexOf(' const key=JSON.stringify([SINGLE_PASS_PORTRAIT_VERSION'),end=main.indexOf('\n',start);
assert(start>=0&&end>start);const expression=main.slice(start,end).trim().replace(/^const key=/,'').replace(/;$/,'');
const ha=main.indexOf(' const hairResultKey='),hb=main.indexOf(' const hairResultScope=',ha);assert(ha>=0&&hb>ha);
const hash=value=>createHash('sha256').update(value).digest('hex');
// Captured by evaluating the released keys before the Makeup-only change.
const portraitHashes={'th:female':'c466c603ea8df29e0a4fc42a9e91a1c6470ac91bf5ed6041ac7a9b2c92639270','th:male':'d30192462132e066ff016d5acb30e75be498caad7faea011f7b22c0d91a28e91','en:female':'e8dafd7319b8fc16c72c0dd39173bfd63947f760cd167771a0386bf857a8a9ea','en:male':'05d8b744c3529b80590a5c3270cdc0fb927f2bec407a4b3280aa52bd62f38f74'};
const hairHashes={female:'e1532bd1563267187d77f1bd2369afd5798730abde54f74f00739d7ccd6a1a43',male:'f48fbbec49af3fefdfe2f594f9ffcd437f43e809fb43053d795c628c28ecf71a'};
function fixture(english,gender,finish='natural',templatePath='/fixture.png'){
 const env={THAI_FEMALE_HEAD_SIZE_VERSION,thaiWholeOutfit:false,THAI_OUTFIT_AI_VERSION:'th-full-outfit-ai-v1',ENGLISH_CIVIL_SERVICE_TEMPLATE,ENGLISH_CIVIL_SERVICE_FABRIC_VERSION,ENGLISH_OUTFIT_FIDELITY_VERSION,JSON,gender,options:{femaleEyeStyle:finish,portraitMode:gender},SINGLE_PASS_PORTRAIT_VERSION,SINGLE_PASS_SKIN_QUALITY_VERSION,MAKEUP_STUDIO_RETOUCH_VERSION,englishPreviewEnabled:()=>english,ENGLISH_BODY_PORTRAIT_VERSION:'body',ENGLISH_TEMPLATE_BODY_FRAMING_VERSION:'frame',englishTemplateBodyFinishForGender:g=>'finish:'+g,ENGLISH_AUTO_HAIR_VERSION:'auto',THAI_NECK_BACKING_VERSION:'neck',HAIR_DESIGN_VERSION,uploadGenerationScope:()=> 'upload',originalFile:{},AI_MAKEUP_PAIR_VERSION:'pair',ENGLISH_MAKEUP_LIGHT_LOCK_VERSION:'lock',makeupGuideKey:'guide',scope:'scope',digest:'digest',hairId:'seedream-fixture',neckline:null,template:templatePath,NATURAL_STUDIO_SKIN_VERSION:'natural',ORIGINAL_PORTRAIT_AI_VERSION:'original',firstUploadedPhotoRef:{current:{}},hairResultMode:()=>gender,portraitFinishChoice,editCache:{current:{lock:{templatePath:'/fixture.png'}}},activeUniformTemplate:'/fixture.png'};
 const portrait=Function('env',`with(env){return ${expression}}`)(env);
 const hairKey=Function('env',`with(env){${main.slice(ha,hb)};return hairResultKey}`)(env);
 return {portrait,hair:hairKey('seedream-fixture',gender,finish,'/fixture.png')};
}
// The explicit hair replacement revision intentionally expires generation caches; the other key fields must remain identical.
const previousHairVersion='selected-silhouette-v26-no-under-ear-neck-hair-both-locales';
const beforeHairRevision=key=>JSON.stringify(JSON.parse(key).filter(v=>v!==THAI_FEMALE_HEAD_SIZE_VERSION)).replaceAll(HAIR_DESIGN_VERSION,previousHairVersion).replaceAll(ENGLISH_OUTFIT_FIDELITY_VERSION+':','');
test('Natural and male cache keys differ only by deliberate hair and English outfit policy revisions',()=>{
 for(const english of [false,true])for(const gender of ['female','male']){
  const actual=fixture(english,gender),id=(english?'en':'th')+':'+gender;
  assert.equal(fixture(english,gender,'natural',ENGLISH_CIVIL_SERVICE_TEMPLATE).portrait.includes(ENGLISH_CIVIL_SERVICE_FABRIC_VERSION),english&&gender==='female','White fabric cache change is restricted to the selected English female uniform');
  assert.equal(actual.portrait.includes(ENGLISH_OUTFIT_FIDELITY_VERSION),english,'Only English result caches expire for the new outfit reference');
  assert.ok(actual.portrait.includes(HAIR_DESIGN_VERSION));assert.ok(actual.hair.includes(HAIR_DESIGN_VERSION));
  assert.equal(hash(beforeHairRevision(actual.portrait)),portraitHashes[id]);assert.equal(hash(beforeHairRevision(actual.hair)),hairHashes[gender]);
  assert(!actual.portrait.includes(MAKEUP_STUDIO_RETOUCH_VERSION));assert(!actual.hair.includes(MAKEUP_STUDIO_RETOUCH_VERSION));
 }
});
test('an explicit new Makeup result/style uses the new retouch version, once, in each language',()=>{
 for(const english of [false,true]){
  const actual=fixture(english,'female','makeup');
  for(const key of [actual.portrait,actual.hair])assert.equal(JSON.parse(key).filter(v=>v===MAKEUP_STUDIO_RETOUCH_VERSION).length,1);
 }
});
test('Thai full-outfit submissions use a separate recovery identity without changing English requests',()=>{
 const submission=main.split('\n').find(line=>line.includes('const submissionKey=JSON.stringify(')).trim();
 assert.match(submission,/englishPreviewEnabled\(\)\?'en':thaiWholeOutfit\?THAI_OUTFIT_AI_VERSION:'th'/);
 assert.match(submission,/SINGLE_PASS_PORTRAIT_VERSION/);
 assert.match(submission,/options\.femaleEyeStyle/);
 assert.match(submission,/hairId\|\|'original'/);
});
