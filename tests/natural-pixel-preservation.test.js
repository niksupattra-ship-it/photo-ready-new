import test from 'node:test';
import assert from 'node:assert/strict';
import {finishSharedStudioSkin,sharedStudioSkinSource} from '../src/shared-studio-skin.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {SHARED_PORTRAIT_BASE_VERSION} from '../shared-portrait-policy.js';
import {NATURAL_STUDIO_SKIN_VERSION} from '../natural-studio-skin.js';

const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
const imageData=bytes=>'data:image/png;base64,'+Buffer.from(bytes).toString('base64');
const stored=Buffer.from('different saved base pixels');
const makeup=Buffer.from('prepared makeup pixels');

test('fresh Natural keeps exactly the original PNG bytes and records its base',async()=>{
 const original=Object.assign(new Blob([png],{type:'image/png'}),{idpromStudioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,idpromJobId:'test-owned-job'});
 let encodes=0;
 const natural=await finishSharedStudioSkin(original,{style:'natural',encodeBase:async blob=>{encodes++;return imageData(await blob.arrayBuffer())},prepare:()=>{throw Error('Natural should not create makeup')}});
 assert.equal(encodes,1);
 assert.deepEqual(Buffer.from(await natural.arrayBuffer()),png);
 assert.equal(sharedStudioSkinSource(natural),imageData(png));
 assert.equal(natural.idpromJobId,'test-owned-job');
 assert.equal(natural.idpromNaturalStudioSkinVersion,NATURAL_STUDIO_SKIN_VERSION);
 assert.equal(natural.idpromFemaleEyeStyle,'natural');
 assert.notEqual(natural,original,'do not mutate the original Blob');
});

test('saved Natural uses stored base instead of copying mismatched current pixels',async()=>{
 const original=Object.assign(new Blob([png],{type:'image/png'}),{
  idpromStudioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,
  idpromSharedPortraitBaseVersion:SHARED_PORTRAIT_BASE_VERSION,
  idpromStudioSkinBaseSource:imageData(stored)
 });
 const natural=await finishSharedStudioSkin(original,{style:'natural',prepare:()=>{throw Error('No cosmetics')}});
 assert.deepEqual(Buffer.from(await natural.arrayBuffer()),stored);
 assert.equal(sharedStudioSkinSource(natural),imageData(stored));
});

test('existing paired Makeup still uses saved Makeup bytes and never the Natural shortcut',async()=>{
 const original=Object.assign(new Blob([png],{type:'image/png'}),{
  idpromStudioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,
  idpromSharedPortraitBaseVersion:SHARED_PORTRAIT_BASE_VERSION,
  idpromStudioSkinBaseSource:imageData(stored),
  idpromAiMakeupSource:imageData(makeup)
 });
 const ready=await finishSharedStudioSkin(original,{style:'makeup',prepare:()=>{throw Error('Paired Makeup should be reused')}});
 assert.deepEqual(Buffer.from(await ready.arrayBuffer()),makeup);
 assert.equal(ready.idpromStudioCosmeticsVersion,ORIGINAL_PORTRAIT_AI_VERSION+':makeup');
});

test('client code skips re-render of already finished Natural but keeps the Makeup path',async()=>{
 const {readFile}=await import('node:fs/promises');
 const src=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.match(src,/if\(blob\.type==='image\/png'\)return blobDataURL\(blob\)/);
 assert.match(src,/requestedFinish==='natural'&&base\.idpromFemaleEyeStyle==='natural'&&base\.idpromNaturalStudioSkinVersion===NATURAL_STUDIO_SKIN_VERSION/);
 assert.match(src,/const finished=await finishSharedStudioSkin\(base,\{style:requestedFinish/);
 assert.match(src,/await checkPortraitCompletion\(originalFile,cached\.value,hairId\)/);
 assert.match(src,/await verifyOutputRights\(jobId\)/);
});
