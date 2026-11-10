import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {loadCurrentHairReference,validateCurrentHairRequest} from '../english-current-hair.js';
import {englishBodyPortraitPrompt,ENGLISH_BODY_PORTRAIT_VERSION} from '../english-body-portrait.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
const fields={interfaceLanguage:'en',portraitComposition:ENGLISH_BODY_PORTRAIT_VERSION,hairId:'original',keepCurrentHair:'1',preserveHairJobId:'previous',portraitMode:'female',femaleEyeStyle:'natural',studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,neckOutfitReferencePath:'/assets/job-uniforms/female-formal-suit.png'};
test('existing hairstyle comes only from a completed job belonging to the current wallet',async()=>{
 const png=Buffer.from('owned portrait');
 assert.equal(await loadCurrentHairReference(fields,'wallet-a',async(id,wallet)=>{assert.equal(id,'previous');assert.equal(wallet,'wallet-a');return {status:'completed',result:png}}),png);
 for(const job of [null,{status:'processing',result:png},{status:'failed',result:png},{status:'completed',result:null}])await assert.rejects(loadCurrentHairReference(fields,'other-wallet',async()=>job));
 assert.throws(()=>validateCurrentHairRequest({...fields,interfaceLanguage:'th'}));
 assert.throws(()=>validateCurrentHairRequest({...fields,hairId:'seedream-40'}));
 let called=false;assert.equal(await loadCurrentHairReference({},'wallet',async()=>{called=true}),null);assert.equal(called,false);
});
test('keeping existing hair overrides default restyling and never copies its clothing or face',()=>{
 const prompt=englishBodyPortraitPrompt({gender:'female',keepCurrentHair:true,hairIndex:2,outfitIndex:3});
 assert.match(prompt,/exact existing hairstyle in Image 2/);assert.match(prompt,/never for clothing or facial identity/);
 assert.doesNotMatch(prompt,/HAIR: Gather all long hair/);
 assert.match(englishBodyPortraitPrompt({gender:'male',keepCurrentHair:true,outfitIndex:2}),/existing hairstyle in Image 1/);
});
test('English generation receives the previous portrait as hair reference alongside the new outfit',async()=>{
 const original=await sharp({create:{width:128,height:160,channels:4,background:'#d0b0a0'}}).png().toBuffer();
 const prior=await sharp({create:{width:128,height:160,channels:4,background:'#705040'}}).png().toBuffer();
 const matte=await sharp({create:{width:128,height:160,channels:4,background:{r:140,g:120,b:110,alpha:0.5}}}).png().toBuffer();
 let sent;
 await processProductionPortrait({input:{buffer:original,mimetype:'image/png'},fields,currentHair:prior,root:new URL('..',import.meta.url).pathname,key:'fixture',requestPortrait:async p=>{sent=p;return {png:original}},removeBackground:async()=>matte});
 assert(sent.hair?.length);assert(sent.outfit?.length);assert.match(sent.prompt,/existing hairstyle in Image 2/);assert.match(sent.prompt,new RegExp('outfit in Image '+(3+Number(Boolean(sent.identity)))));
 const actual=await sharp(sent.hair).raw().toBuffer(),expected=await sharp(prior).removeAlpha().raw().toBuffer();assert.deepEqual(actual,expected);
});
