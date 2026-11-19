import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {processProductionPortrait,validateProductionPortrait} from '../production-portrait-pipeline.js';
import {THAI_OUTFIT_AI_VERSION,isThaiOutfitPath} from '../thai-outfit-ai-policy.js';
import {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,ENGLISH_TEMPLATE_BODY_FINISH_VERSION} from '../english-template-body-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {SINGLE_PASS_PORTRAIT_VERSION} from '../single-pass-portrait-policy.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';
import {isPrivateOwner} from '../private-trial.js';
import {checkoutPackage,packageFor,remaining} from '../package-rules.js';
const root=new URL('..',import.meta.url).pathname;
const input={buffer:await sharp({create:{width:120,height:160,channels:4,background:'#b38a72'}}).png().toBuffer(),mimetype:'image/png'};
const result=await sharp({create:{width:120,height:160,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:120,channels:4,background:'#b38a72'}}).png().toBuffer(),left:20,top:20}]).png().toBuffer();

test('Thai AI creates a native complete portrait for every outfit category in one request',async()=>{
 const options=[['female','/assets/government-uniforms/female-operational.png','makeup'],['female','/assets/student-uniforms/female-01.png','natural'],['male','/assets/job-uniforms/male-job-blue-navy-tie.png','natural']];
 const main=await readFile(root+'src/main.jsx','utf8');
 const gown=main.match(/template:'(\/assets\/gown-uniforms\/[^']+)'/);assert(gown);
 options.push(['female',gown[1],'natural']);
 for(const [gender,template,finish] of options){
  const calls=[];
  const fields={interfaceLanguage:'th',thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:gender==='female'?ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitMode:gender,hairId:'original',femaleEyeStyle:finish,neckOutfitReferencePath:template,faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),...(gender==='female'?{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,singlePassPortraitVersion:SINGLE_PASS_PORTRAIT_VERSION,femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION}:{})};
  const out=await processProductionPortrait({input,fields,root,key:'test',removeBackground:async()=>result,requestPortrait:async p=>{calls.push(p);return {png:result}}});
  assert.equal(calls.length,1,template);assert(out.length);assert(calls[0].outfit?.length);
  assert.equal(fields.interfaceLanguage,'th','Internal rendering must not mutate the credit-authority request');
  assert.match(calls[0].prompt,/garment/);
  assert.throws(()=>validateProductionPortrait(input,{...fields,neckOutfitReferencePath:'/assets/background.png'}));
  assert.throws(()=>validateProductionPortrait(input,{...fields,thaiOutfitAiVersion:'unknown'}));
 }
 assert(!isThaiOutfitPath('/assets/gown-uniforms/../../secret.png'));
});

test('159 offer keeps downloads, grants a single shared ten-use pool, and old receipt terms stay frozen',()=>{
 const fresh=checkoutPackage('159');assert.equal(fresh.id,'download_159_ai10_v2');assert.equal(fresh.price,159);assert.equal(fresh.g+fresh.h,10);assert.equal(fresh.requiresImage,true);assert.equal(fresh.fullEdit,true);
 assert.equal(packageFor('download_159_hair_v1').g,0);
 assert.equal(checkoutPackage('download_159_hair_v1').id,'download_159_hair_v1');
});

test('unlimited owner uses only the authenticated identity bound to the request wallet',()=>{
 assert(isPrivateOwner({accountUser:{email:'treeradech009@gmail.com',wallet_id:'wal-owner'}},'wal-owner'));
 assert(!isPrivateOwner({accountUser:{email:'treeradech009@gmail.com',wallet_id:'wal-owner'}},'wal-other'));
 assert(!isPrivateOwner({body:{email:'treeradech009@gmail.com'}},'wal-owner'));
});

const store=await readFile(root+'payment-store.js','utf8');
const reserveSource=store.slice(store.indexOf('export async function reserveThaiAiEdit('),store.indexOf('// Compatibility entry point:')).replace('export async','async');
function fakeCredits(paid=0){
 const wallet={generation_remaining:paid,hair_remaining:0,full_edit_remaining:paid},usage=[];
 let tail=Promise.resolve(),locked=0;
 const pool={connect:async()=>{let unlock=null;return {release(){},async query(sql,p=[]){
  if(sql.includes('FROM wallets')&&sql.includes('FOR UPDATE')){const previous=tail;tail=new Promise(r=>unlock=r);await previous;locked++;return {rows:[{...wallet}],rowCount:1}}
  if(sql==='COMMIT'||sql==='ROLLBACK'){unlock?.();return {rows:[]}}
  if(sql.includes('COUNT(*)'))return {rows:[{used:usage.filter(u=>u.kind==='thai-daily-ai-edit'&&u.status!=='refunded').length}]};
  if(sql.startsWith('UPDATE wallets')){const column=sql.match(/SET ([a-z_]+)=/)[1];wallet[column]--;return {rows:[]}}
  if(sql.startsWith('INSERT INTO credit_usage')){usage.push({id:p[0],kind:p[2],column:p[3],full:p[4],status:'reserved'});return {rows:[],rowCount:1}}
  if(sql==='BEGIN')return {rows:[]};
  throw Error('Unexpected query: '+sql);
 }}}};
 const reserve=Function('pool','ready','crypto','remaining','THAI_DAILY_AI_LIMIT',reserveSource+';return reserveThaiAiEdit')(pool,async()=>{},crypto,remaining,2);
 return {reserve,wallet,usage,get locked(){return locked}};
}
test('concurrent Thai outfit/hair requests share exactly two free slots then the same ten paid credits',async()=>{
 const state=fakeCredits(10);
 const runs=await Promise.all(Array.from({length:14},(_,i)=>state.reserve('wallet',i%2?'hairstyle':'ai-finish')));
 assert.equal(runs.filter(Boolean).length,12);
 assert.equal(runs.filter(r=>r?.trialPreview).length,2);
 assert.equal(state.wallet.generation_remaining,0);assert.equal(state.wallet.full_edit_remaining,0);
 assert.equal(state.usage.filter(u=>u.column==='generation_remaining').length,10);
 assert.equal(state.locked,14);
});
test('failed Thai daily requests use the refund branch without adding paid credits',()=>{
 const refund=store.slice(store.indexOf('export async function refundCredit('),store.indexOf('export async function walletHistory'));
 const branch=refund.slice(refund.indexOf("if(['english-daily-ai-outfit','thai-daily-ai-edit']"),refund.indexOf('const isUsd='));
 assert.match(branch,/status='refunded'/);assert.doesNotMatch(branch,/UPDATE wallets/);
});

test('authenticated unlimited owner bypasses both free and paid reservation paths',async()=>{
 const server=await readFile(root+'server.js','utf8');
 const start=server.indexOf('async function requireCredit(req,res,kind){'),end=server.indexOf('\nconst upload=multer(',start);
 let reservations=0;
 const deps={walletId:()=> 'wal-owner',isPrivateOwner,hasPrivateTrial:(req,w)=>isPrivateOwner(req,w),getWallet:async()=>({generationRemaining:0,hairRemaining:0}),crypto,reserveThaiAiEdit:()=>{reservations++;throw Error('Owner must not reserve')},reserveEnglishDailyAiOutfit:()=>{reservations++;throw Error('Owner must not reserve')}};
 const credit=Function('deps','with(deps){'+server.slice(start,end)+';return requireCredit}')(deps);
 const req={accountUser:{email:'treeradech009@gmail.com',wallet_id:'wal-owner'},get:()=>'',body:{interfaceLanguage:'th'}};
 for(let i=0;i<30;i++){const result=await credit(req,{status(){throw Error('Owner rejected')}},i%2?'hairstyle':'ai-finish');assert(result.usageId.startsWith('private_full_'));assert.equal(result.trialPreview,false)}
 assert.equal(reservations,0);
});
