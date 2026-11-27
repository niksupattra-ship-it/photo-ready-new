import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isFreeFemaleHair} from '../src/free-female-hair.js';
const editor=readFileSync(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
const start=editor.indexOf(' const confirmThaiHair='),end=editor.indexOf(' const cancelThaiHair=',start);
function run(hairId,direct){
 const calls=[],head={kind:'head',id:'head',hairId:'seedream-05',femaleEyeStyle:'makeup'};
 const env={englishFlow:false,processRequestRef:{current:false},processActive:false,assetBusy:false,ready:true,sourcePhoto:{},state:{current:[head]},layerKind:l=>l.kind,thaiPendingHair:direct?null:{hairId,portraitMode:'female',first:false},thaiChoiceFlow:direct?null:{step:'ready'},hairGender:'female',currentSuit:'same-outfit',portraitFinishChoice:(...a)=>a.find(Boolean),isFreeFemaleHair,sourceLayerRef:{current:null},ENGLISH_BODY_PORTRAIT_VERSION:'en-outfit-body-v1',applyHair:(...args)=>calls.push(['ai',...args]),applyFreeHair:id=>calls.push(['png',id])};
 const confirm=Function('env','with(env){'+editor.slice(start,end)+';return confirmThaiHair}')(env);
 confirm(direct?{hairId,portraitMode:'female',first:false}:undefined);return calls;
}
test('Studio immediate hair and Easy confirmation share AI finish/mode options',()=>{
 assert.deepEqual(run('seedream-06',true),run('seedream-06',false));
 assert.equal(run('seedream-06',true)[0][0],'ai');
});
test('local PNG hair never takes the paid AI replacement branch in either mode',()=>{
 assert.deepEqual(run('hair-21',true),[['png','hair-21']]);assert.deepEqual(run('hair-21',false),[['png','hair-21']]);
});
