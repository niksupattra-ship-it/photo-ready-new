import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import {THAI_FREE_FEMALE_SUIT_IDS,THAI_FREE_FEMALE_SUIT_PATHS,THAI_FREE_MALE_SUIT_PATHS,isThaiPremiumFemaleSuit,isThaiPremiumJobSuit,orderThaiFemaleSuits} from '../thai-female-suit-policy.js';
test('four photographed Thai female job outfits come first; all other female job outfits require Pro',()=>{
 const options=[{template:'/assets/job-uniforms/female-other.webp'},...THAI_FREE_FEMALE_SUIT_PATHS.map(template=>({template})).reverse(),{template:'/assets/government-uniforms/female-operational.png'},{template:'/assets/job-uniforms/male-suit.png'}];
 const sorted=orderThaiFemaleSuits(options);
 assert.deepEqual(sorted.slice(0,4).map(o=>o.template),THAI_FREE_FEMALE_SUIT_PATHS);assert.equal(options[0].template,'/assets/job-uniforms/female-other.webp');
 for(const path of THAI_FREE_FEMALE_SUIT_PATHS)assert(!isThaiPremiumFemaleSuit(path));
 assert(isThaiPremiumFemaleSuit('/assets/job-uniforms/female-job-taupe-cream-blouse.png'));assert(isThaiPremiumFemaleSuit('/assets/job-uniforms/female-formal-suit.png'));
 for(const path of [null,'','/assets/job-uniforms/male-suit.png','/assets/government-uniforms/female-operational.png'])assert(!isThaiPremiumFemaleSuit(path));
 assert.equal(THAI_FREE_FEMALE_SUIT_IDS.length,4);
});
test('actual server blocks unpaid premium suit generation before reserving credits; free four, Pro and English retain access',async()=>{
 const server=await readFile(new URL('../server.js',import.meta.url),'utf8');const a=server.indexOf('async function requireCredit(req,res,kind){'),b=server.indexOf('\nconst upload=multer(',a);
 let pro=false,reservations=0;
 const deps={crypto,isThaiPremiumJobSuit,walletId:()=> 'wallet',isPrivateOwner:()=>false,downloadHairAllowed:()=>true,PRODUCTION_HAIR_CATALOG:[{id:'seedream-35',gender:'male'}],THAI_FREE_FEMALE_HAIR_IDS:[],getWallet:async()=>({usdPremiumPurchased:false}),accountPolicy:()=>({canGeneratePremiumHair:async()=>pro}),reserveThaiDailyOutfitAi:async()=>{reservations++;return {usageId:'free_fixture',trialPreview:true}},reserveEnglishDailyAiOutfit:async()=>({usageId:'en_free',trialPreview:true})};
 const run=Function('deps','with(deps){'+server.slice(a,b)+';return requireCredit}')(deps);
 async function check(path,language='th',hairId='') {let status=200,error;const res={status(n){status=n;return this},json(v){error=v.error;return this}};const result=await run({body:{interfaceLanguage:language,thaiOutfitAiVersion:'th-full-outfit-ai-v1',neckOutfitReferencePath:path,hairId},get:()=>''},res,'ai-finish');return {result,status,error}}
 const premium='/assets/job-uniforms/female-job-taupe-cream-blouse.png';
 assert.equal((await check(premium)).error,'premium_suit_required');assert.equal(reservations,0);
 for(const path of THAI_FREE_FEMALE_SUIT_PATHS)assert.equal((await check(path)).result.trialPreview,true);
 assert.equal(reservations,4);assert.equal((await check(premium,'en')).status,200);
 pro=true;assert.equal((await check(premium)).status,200);assert.equal(reservations,5);pro=false;for(const path of THAI_FREE_MALE_SUIT_PATHS)assert.equal((await check(path)).result.trialPreview,true);assert.equal((await check('/assets/job-uniforms/male-job-charcoal-burgundy-tie.png')).error,'premium_suit_required');assert.equal((await check(THAI_FREE_MALE_SUIT_PATHS[0],'th','seedream-35')).status,200);
});
test('manual suit authorization also rejects Pro outfits without Pro, preserving English and existing work rights',async()=>{
 const source=await readFile(new URL('../server.js',import.meta.url),'utf8');const a=source.indexOf("app.post('/api/images/:id/suits'"),b=source.indexOf('\napp.',a+1);
 let handler,pro=false,work=false,selections=0;
 const deps={app:{post:(path,fn)=>handler=fn},walletId:()=> 'wallet',isThaiPremiumJobSuit,accountPolicy:()=>({canGeneratePremiumHair:async()=>pro,premiumHair:async()=>work,suits:async()=>{selections++;return {limited:true,choices:[]}}})};
 Function('deps','with(deps){'+source.slice(a,b)+'}')(deps);
 const premium='/assets/job-uniforms/female-job-taupe-cream-blouse.png';
 async function check(templates,interfaceLanguage='th'){let status=200;const res={set(){return this},status(n){status=n;return this},json(){return this}};await handler({body:{templates,interfaceLanguage},params:{id:'job'},get:()=>''},res);return status}
 assert.equal(await check([premium]),403);assert.equal(selections,0);
 for(const path of THAI_FREE_FEMALE_SUIT_PATHS)assert.equal(await check([path]),200);
 assert.equal(await check([premium],'en'),200);pro=true;assert.equal(await check([premium]),200);pro=false;work=true;assert.equal(await check([premium]),200);
});
test('male screenshot outfits are free in exact order and all other male job outfits use Pro',async()=>{
 const {THAI_FREE_MALE_SUIT_PATHS,isThaiPremiumMaleSuit}=await import('../thai-female-suit-policy.js');
 const options=[{template:'/assets/job-uniforms/male-other.png'},...THAI_FREE_MALE_SUIT_PATHS.map(template=>({template})).reverse()];
 assert.deepEqual(orderThaiFemaleSuits(options).slice(0,4).map(o=>o.template),THAI_FREE_MALE_SUIT_PATHS);
 for(const path of THAI_FREE_MALE_SUIT_PATHS)assert(!isThaiPremiumJobSuit(path));
 assert(isThaiPremiumMaleSuit('/assets/job-uniforms/male-job-charcoal-burgundy-tie.png'));
 assert(isThaiPremiumMaleSuit('/assets/job-uniforms/female-navy-suit-6.png'));
 const {firstGenerationHairFor,PRODUCTION_HAIR_CATALOG}=await import('../hairstyle-catalog.js');
 assert.equal(firstGenerationHairFor('male',true),'seedream-35');assert.equal(firstGenerationHairFor('male'),'');
 const old=PRODUCTION_HAIR_CATALOG.find(h=>h.id==='seedream-35');assert.equal(old.file,'35.png');assert(old.src.includes('35-restored.webp'));
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');const a=main.indexOf('const BASIC_MALE_HAIR_IDS='),b=main.indexOf('const HAIR_OPTIONS=',a);
 const shown=Function('PRODUCTION_HAIR_CATALOG',main.slice(a,b)+';return MALE_HAIR_OPTIONS')(PRODUCTION_HAIR_CATALOG);assert.deepEqual(shown.slice(0,3).map(h=>h.id),['seedream-35','seedream-36','seedream-28']);assert.equal(shown.filter(h=>h.id==='seedream-35').length,1);
});
