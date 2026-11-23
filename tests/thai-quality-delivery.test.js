import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compareThaiFaceShape,triageThaiFaceShape} from '../src/face-proportion-check.js';
import {compareThaiEyeIdentity} from '../src/thai-eye-identity.js';
import {describePortraitFailure} from '../src/portrait-process-failure.js';
const source=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const start=source.indexOf(' // New Thai full-outfit images must preserve the original cheek');
const end=source.indexOf(" if(gender==='female'&&options.femaleEyeStyle==='natural')cached.value",start);
assert(start>=0&&end>start);
const run=Function('env','with(env){return (async()=>{'+source.slice(start,end)+'})()}');
const eyes=[{gazeX:.5,gazeY:0,opening:.25,radius:.15},{gazeX:.5,gazeY:0,opening:.25,radius:.15}];
const original={faceWidth:1.5,jawWidth:1.2,eyeToChin:1.4,eyeToNose:.6,eyeToMouth:1,eyeIdentity:eyes};
function environment(generated,{english=false,reused=false}={}){
 const result={idpromPortraitComposition:'body',idpromThaiRealFaceVersion:'current'},operation={serverCompleted:true};let removed=0,delivered=0;
 return {hairId:'selected',originalFile:original,thaiWholeOutfit:!english,cached:{value:result,reused},THAI_REAL_FACE_VERSION:'current',portraitFaceMetrics:async blob=>blob===original?original:generated,compareThaiFaceShape,triageThaiFaceShape,compareThaiEyeIdentity,ENGLISH_BODY_PORTRAIT_VERSION:'body',gender:'female',options:{},checkNewThaiBodyGeometry:async()=>{},measureThaiBodyGeometry:async()=>null,checkPortraitCompletion:async()=>{delivered++},assertCurrentOperation:()=>{},operation,portraitResultCache:{delete:()=>{removed++}},key:'same-job',counts:()=>({removed,delivered})};
}
for(const reused of [false,true])test(`actual delivery accepts mild 8% landmark drift without cancelling or requesting another generation (reused=${reused})`,async()=>{
 const generated={...original,faceWidth:original.faceWidth*.92};assert.equal(compareThaiFaceShape(original,generated).ok,false);assert.equal(triageThaiFaceShape(original,generated).action,'review');
 const env=environment(generated,{reused});await run(env);assert.equal(env.cached.value.idpromQualityReviewNeeded,true);assert.equal(env.operation.qualityRejected,undefined);assert.deepEqual(env.counts(),{removed:0,delivered:1});
});
test('actual delivery keeps minor eyelid/iris landmark differences advisory without editing pixels',async()=>{
 const generated={...original,eyeIdentity:eyes.map(e=>({...e,opening:e.opening*1.4,radius:e.radius*1.3}))};const before=structuredClone(generated);assert.equal(compareThaiEyeIdentity(eyes,generated.eyeIdentity).action,'reject');
 const env=environment(generated);await run(env);assert(env.cached.value.idpromQualityReviewNeeded);assert.equal(env.operation.qualityRejected,undefined);assert.deepEqual(env.counts(),{removed:0,delivered:1});assert.deepEqual(generated,before);
});
test('large measured face deformation still blocks delivery and cannot enter automatic retry',async()=>{
 const env=environment({...original,faceWidth:original.faceWidth*.70,jawWidth:original.jawWidth*.70});await assert.rejects(run(env),e=>e.code==='face_proportion_changed'&&e.idpromProcessStage==='quality_check');assert.equal(env.operation.qualityRejected,true);assert.deepEqual(env.counts(),{removed:1,delivered:0});
});
test('missing local evidence marks review and does not discard completed result',async()=>{const env=environment(null);await run(env);assert(env.cached.value.idpromQualityReviewNeeded);assert.deepEqual(env.counts(),{removed:0,delivered:1})});
test('English bypasses Thai identity triage',async()=>{const env=environment(null,{english:true});env.portraitFaceMetrics=()=>{throw Error('Thai check must not run')};await run(env);assert.deepEqual(env.counts(),{removed:0,delivered:1});assert.equal(env.cached.value.idpromQualityReviewNeeded,undefined)});
test('failure message distinguishes actual shape rejection from local completion failure without leaking raw errors',()=>{
 const rejected=describePortraitFailure({code:'face_proportion_changed',stage:'quality_check',message:'private response'},false);assert.match(rejected.title,/โครงหน้า/);assert(!rejected.message.includes('private'));
 const local=describePortraitFailure({stage:'quality_check',idpromRecoverableJob:true,message:'private decoder'},false);assert.equal(local.code,'recover_result');assert.match(local.message,/ไม่สร้างซ้ำ/);

});
