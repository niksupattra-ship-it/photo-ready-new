import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ORIGINAL_PORTRAIT_AI_VERSION,markOriginalPortraitAiFinish,hasOriginalPortraitAiFinish} from '../original-portrait-ai.js';
import {isCompletedServerMakeup,finishSharedStudioSkin,sharedStudioSkinSource} from '../src/shared-studio-skin.js';
import {SHARED_PORTRAIT_BASE_VERSION} from '../shared-portrait-policy.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';

const png=(finish='natural')=>{
 const b=new Blob([Buffer.from('exact-server-image-bytes')],{type:'image/png'});
 markOriginalPortraitAiFinish(b,finish,ORIGINAL_PORTRAIT_AI_VERSION);
 b.idpromFemaleFinishSingleVersion=FEMALE_SINGLE_FINISH_VERSION;
 b.idpromJobId='job_1234';
 return b;
};

test('server-selected Makeup has final AI cosmetics and no Natural base: deliver as-is',async()=>{
 const makeup=png('makeup');
 assert.equal(hasOriginalPortraitAiFinish(makeup,'makeup'),true);
 assert.equal(sharedStudioSkinSource(makeup),null);
 assert.equal(isCompletedServerMakeup(makeup,'makeup'),true);
 assert.equal(isCompletedServerMakeup(makeup,'natural'),false);
 assert.equal(isCompletedServerMakeup(makeup,'soft-rosy-v1'),false);
 assert.equal(Buffer.from(await makeup.arrayBuffer()).toString(),'exact-server-image-bytes');
 // Regression: the old unconditional local post-cosmetics would fail here,
 // even though the server had already made a complete Makeup PNG.
 await assert.rejects(finishSharedStudioSkin(makeup,{style:'makeup'}),/ภาพฐานแสงและผิวยังไม่พร้อม/);
});

test('single Natural and legacy paired base still use their normal local pipeline',()=>{
 const natural=png('natural');
 assert.equal(isCompletedServerMakeup(natural,'natural'),false);
 assert.equal(isCompletedServerMakeup(natural,'makeup'),false);
 const legacy=png('makeup');
 legacy.idpromSharedPortraitBaseVersion=SHARED_PORTRAIT_BASE_VERSION;
 legacy.idpromStudioSkinBaseSource='data:image/png;base64,aGVsbG8=';
 assert(sharedStudioSkinSource(legacy),'a legacy independently saved Natural base must remain accessible');
 assert.equal(isCompletedServerMakeup(legacy,'makeup'),false,'only base-less already-finished Makeup can bypass local pipeline');
});

test('new Studio path skips ONLY completed single Makeup and never requests a new paid AI job',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const source=await readFile(new URL('../src/shared-studio-skin.js',import.meta.url),'utf8');
 const start=main.indexOf('const cached=await portraitResultCache.get(key,async()=>{');
 const finish=main.indexOf('const finishRequested=async base=>',start);
 assert(start>=0&&finish>start,'the real result delivery path must be present');
 const pipeline=main.slice(start,finish);
 assert.match(pipeline,/!isCompletedServerMakeup\(finished,options\.femaleEyeStyle\)/,'already-completed Makeup bypasses local post-cosmetics');
 assert.match(pipeline,/finished=await finishSharedStudioSkin\(finished,/,'Natural and older pairs still have their normal local finish');
 assert.match(source,/hasOriginalPortraitAiFinish\(blob,'makeup'\)&&!sharedStudioSkinSource\(blob\)/);
 const receipt=main.slice(main.indexOf('async function waitForAiJob('),main.indexOf('\nlet landmarkerPromise'));
 assert.match(receipt,/if\(j\.femaleFinishSingleVersion\)blob\.idpromFemaleFinishSingleVersion=j\.femaleFinishSingleVersion/,'preserve server finished job protocol');
 assert.match(receipt,/markOriginalPortraitAiFinish\(blob,portraitFinishChoice\(j\.femaleEyeStyle\),j\.studioSkinVersion\)/,'server Makeup metadata is correctly recognized');
 const recovery=main.slice(main.indexOf('const generate=()=>aiFinishPortrait('),main.indexOf('const master=await finishFirstPortraitMaster(aiHead)'));
 assert.match(recovery,/AI output was already generated; automatically recovering the same job/,'recover existing job rather than asking AI to create another');
});
