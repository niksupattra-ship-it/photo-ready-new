import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeupLook,MAKEUP_LOOKS} from '../makeup-presets.js';
import {portraitFinishChoice} from '../src/portrait-finish-choice.js';
const editor=await readFile('src/studio-editor.jsx','utf8');
const a=editor.indexOf(' const selectPortraitFinish=style=>'),b=editor.indexOf('\n const commitMakeupSource=',a);
const build=Function('env',`with(env){${editor.slice(a,b)};return selectPortraitFinish}`);
for(const finish of ['natural','korean-rosy-v1','soft-rosy-v1'])for(const look of ['soft-rosy-ai-v1','soft-rosy-makeup-v1','skin-smooth-v1',undefined]){
 const head={kind:'head',jobId:'original-job',portraitMode:'female',hairId:'same-hair',femaleEyeStyle:finish,makeupBaseSource:'before-additional-look',makeupStyles:{look}};
 const applied=[],restored=[];const handler=build({state:{current:[head]},layerKind:l=>l.kind,portraitMode:'female',sourcePhoto:{},processHairPending:false,sourceLayerRef:{current:null},portraitFinishChoice,makeupLook,restoreMakeup:()=>restored.push(true),applyHair:(...args)=>applied.push(args)});
 handler(finish);
 assert.equal(restored.length,['soft-rosy-ai-v1','soft-rosy-makeup-v1'].includes(look)?1:0);
 assert.equal(applied.length,['soft-rosy-ai-v1','soft-rosy-makeup-v1'].includes(look)?0:1,'Original choices must retain their handler unless restoring the extra AI look');
 const other=finish==='natural'?'korean-rosy-v1':'natural';handler(other);
 assert.equal(applied.at(-1)[1].femaleEyeStyle,other);assert.equal(applied.at(-1)[0],'same-hair');
}
assert.deepEqual(MAKEUP_LOOKS.filter(l=>!l.ai).map(l=>l.id),['skin-bright-v1','skin-glow-v1','skin-smooth-v1']);
assert.equal(MAKEUP_LOOKS.length,3);
assert.equal(portraitFinishChoice('soft-rosy-v1'),'soft-rosy-v1');
console.log('PASS original finish handlers and IDs retained; clicking the original finish after extra AI makeup restores its prior base without an AI request; changing the original finish uses the original handler.');
