import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PRODUCTION_HAIR_CATALOG,downloadHairAllowed,isTrialHairAllowed} from '../hairstyle-catalog.js';
import {isFreeFemaleHair} from '../src/free-female-hair.js';
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8'),server=await readFile(new URL('../server.js',import.meta.url),'utf8');
let passed=0;const check=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
const start=main.indexOf('const BASIC_MALE_HAIR_IDS='),end=main.indexOf('\nconst HAIR_OPTIONS=',start);assert(start>=0&&end>start);
const options=Function('PRODUCTION_HAIR_CATALOG',main.slice(start,end)+';return {basic:BASIC_MALE_HAIR_IDS,shown:MALE_HAIR_OPTIONS}')(PRODUCTION_HAIR_CATALOG);
const classifier=editor.match(/ const isPremiumHair=id=>[^\n]+;/);assert(classifier);
const isPremium=Function('femaleHair','maleHair','isFreeFemaleHair',classifier[0]+';return isPremiumHair')(PRODUCTION_HAIR_CATALOG.filter(h=>h.gender==='female'),options.shown,isFreeFemaleHair);
await check('reference style 36 and all basic male choices are first, with stable premium order and no duplicates',()=>{
 assert.deepEqual(options.basic,['seedream-36','seedream-28','seedream-33','seedream-34']);assert.deepEqual(options.shown.slice(0,4).map(h=>h.id),options.basic);
 assert.deepEqual(options.shown.slice(4).map(h=>h.id),['seedream-29','seedream-30','seedream-31','seedream-32','seedream-37']);assert.equal(new Set(options.shown.map(h=>h.id)).size,options.shown.length);
 assert(!options.shown.some(h=>h.id==='seedream-35'));assert(main.includes('maleHair={MALE_HAIR_OPTIONS}'));assert(editor.includes("hairGender==='male'?maleHair:femaleHair"));
});
await check('style 36 loses its diamond while remaining premium choices and female classifications remain unchanged',()=>{
 for(const id of options.basic){assert.equal(isPremium(id),false);assert(isTrialHairAllowed(id));assert(downloadHairAllowed(id));assert(!isFreeFemaleHair(id))}
 for(const h of options.shown.slice(4))assert(isPremium(h.id));
 for(const id of ['seedream-40','seedream-41','seedream-42','seedream-43','seedream-16','seedream-38','seedream-39','hair-21','hair-25','hair-26'])assert.equal(isPremium(id),false,id);
 for(const id of ['seedream-07','seedream-23'])assert.equal(isPremium(id),true,id);
});
const a=server.indexOf('async function requireCredit('),b=server.indexOf('\nconst upload=',a);assert(a>=0&&b>a);let premiumChecks=0,allowPremium=false;
const gate=Function('env','with(env){'+server.slice(a,b)+';return requireCredit}')({crypto,PRODUCTION_HAIR_CATALOG,downloadHairAllowed,walletId:()=> 'fixture-wallet',isPrivateOwner:()=>false,hasPrivateTrial:()=>false,getWallet:()=>{throw Error('Unexpected private wallet read')},accountPolicy:()=>({canGeneratePremiumHair:async()=>{premiumChecks++;return allowPremium}})});
async function request(hairId,kind){let status=200,data=null;const result=await gate({body:{hairId,premiumHair:true,premiumDownloadRemaining:99},get:()=>undefined},{status(n){status=n;return this},json(v){data=v;return this}},kind);return {status,data,result}}
await check('both initial generation and hair-change gate accept style 36 without a premium lookup/debit',async()=>{
 for(const id of options.basic)for(const kind of ['ai-finish','hairstyle']){const before=premiumChecks,r=await request(id,kind);assert.equal(r.status,200);assert.match(r.result.usageId,/^free_/);assert(r.result.trialPreview);assert.equal(premiumChecks,before)}
});
await check('other premium styles still require verified rights, and invalid IDs fail closed',async()=>{
 for(const id of ['seedream-29','seedream-37','seedream-07']){const r=await request(id,'hairstyle');assert.equal(r.status,403);assert.equal(r.data.error,'premium_hair_required')}
 assert.equal((await request('seedream-999','hairstyle')).status,400);allowPremium=true;assert.equal((await request('seedream-37','hairstyle')).status,200);
});
console.log(JSON.stringify({passed,scope:'Actual male list ordering, actual diamond classifier and actual server credit gate; no AI/payment/account requests or credit writes.'}));
