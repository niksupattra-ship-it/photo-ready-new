import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {basicThaiHairRequestAllowed,THAI_BASIC_AI_MESSAGE} from '../thai-basic-ai-policy.js';
import {PRODUCTION_HAIR_CATALOG,THAI_FREE_FEMALE_HAIR_IDS} from '../hairstyle-catalog.js';

const template='/assets/government-uniforms/female-operational.png';
test('89 allows exactly the six current free hairstyles, only with the paid garment',()=>{
 for(const hair of PRODUCTION_HAIR_CATALOG){
  const expected=THAI_FREE_FEMALE_HAIR_IDS.includes(hair.id)||['seedream-28','seedream-35','seedream-36'].includes(hair.id);
  const body={hairId:hair.id,neckOutfitReferencePath:template};
  assert.equal(basicThaiHairRequestAllowed(body,'hairstyle',[template]),expected,hair.id);
  assert.equal(basicThaiHairRequestAllowed(body,'ai-finish',[template]),false);
  assert.equal(basicThaiHairRequestAllowed({...body,neckOutfitReferencePath:'another.png'},'hairstyle',[template]),false);
 }
 assert.equal(basicThaiHairRequestAllowed({hairId:'original',neckOutfitReferencePath:template},'hairstyle',[template]),false);
 assert.equal(basicThaiHairRequestAllowed({hairId:'seedream-14',neckOutfitReferencePath:template,outfitReferencePath:'other.png'},'hairstyle',[template]),false);
});

const server=await readFile(new URL('../server.js',import.meta.url),'utf8');
function authorization({basic=true,bundle={owned:false}}={}){
 const events=[];
 const deps={crypto,downloadHairAllowed:()=>true,PRODUCTION_HAIR_CATALOG,THAI_FREE_FEMALE_HAIR_IDS,basicThaiHairRequestAllowed,THAI_BASIC_AI_MESSAGE,
  walletId:()=> 'wallet',isPrivateOwner:()=>false,reserveThaiWorkAi:async()=>bundle,
  downloadPolicy:{paidWorkForSource:async()=> 'photo',basicThaiAiWork:async(wallet,work)=>{events.push(['work',wallet,work]);return basic?{templates:[template]}:null}},
  accountPolicy:()=>({canGeneratePremiumHair:async()=>false}),isThaiPremiumJobSuit:()=>false,
  reserveThaiDailyOutfitAi:async()=>{events.push(['trial']);return {trialPreview:true}},getWallet:async()=>({})};
 const a=server.indexOf('async function requireCredit(req,res,kind){'),b=server.indexOf('\nconst upload=multer(',a);
 const run=Function('deps','with(deps){'+server.slice(a,b)+';return requireCredit}')(deps);
 const res={statusCode:200,status(n){this.statusCode=n;return this},json(data){this.body=data;return this}};
 const request=async(body={},kind='hairstyle',upload={})=>run({...upload,accountUser:{wallet_id:'wallet'},get:()=>'',body:{downloadWorkId:'photo',hairId:'seedream-14',neckOutfitReferencePath:template,thaiOutfitAiVersion:'th-full-outfit-ai-v1',...body}},res,kind);
 return {request,res,events};
}
test('actual server blocks new garments, diamond hair and full reprocessing before free AI reservation, including language spoofing',async()=>{
 for(const [body,kind] of [[{},'ai-finish'],[{neckOutfitReferencePath:'new.png'},'hairstyle'],[{hairId:'seedream-40'},'hairstyle'],[{neckOutfitReferencePath:'new.png',interfaceLanguage:'en'},'hairstyle']]){
  const {request,res,events}=authorization();assert.equal(await request(body,kind),null);assert.equal(res.statusCode,403);assert.equal(res.body.error,'thai_basic_free_hair_only');assert(!events.some(e=>e[0]==='trial'));
 }
 for(const hairId of [...THAI_FREE_FEMALE_HAIR_IDS,'seedream-28','seedream-35','seedream-36']){
  const {request,res}=authorization();const credit=await request({hairId});assert(credit.usageId.startsWith('free_'));assert.equal(res.statusCode,200);
 }
});
test('159 remains charged first, exhausted or expired cannot fall back to free hair; unpaid previews remain free',async()=>{
 const paid=authorization({bundle:{owned:true,credit:{usageId:'ai10_fixture'}}});assert.equal((await paid.request({},'ai-finish')).usageId,'ai10_fixture');assert.equal(paid.events.length,0);
 for(const error of ['thai_work_ai_exhausted','thai_work_ai_expired']){const a=authorization({bundle:{owned:true,error}});assert.equal(await a.request(),null);assert.equal(a.res.statusCode,402);assert.equal(a.events.length,0)}
 const unpaid=authorization({basic:false});assert((await unpaid.request({},'ai-finish')).trialPreview);assert(unpaid.events.some(e=>e[0]==='trial'));
});
test('legacy synchronous upload cannot omit work ID to bypass the paid-photo restriction',async()=>{
 for(const upload of [{file:{buffer:Buffer.from('original')}},{files:{image:[{buffer:Buffer.from('original')}]}}]){
  const a=authorization();assert.equal(await a.request({downloadWorkId:'',neckOutfitReferencePath:'new.png'},'ai-finish',upload),null);assert.equal(a.res.body.error,'thai_basic_free_hair_only');assert.deepEqual(a.events,[['work','wallet','photo']]);
 }
});
test('separate job-outfit AI cannot bypass 89 through another wallet package',async()=>{
 const start=server.indexOf('    let paidUse=null;',server.indexOf("app.post('/api/job-outfit/generate'"));
 const end=server.indexOf('    try{\n     const result=await generateJobOutfit',start);
 assert(start>0&&end>start);
 for(const usdPremiumPurchased of [true,false]){
  const deps={wid:'wallet',jobId:'job',plan:{usdPremiumPurchased},THAI_BASIC_AI_MESSAGE,
   downloadPolicy:{scopeForJob:async()=> 'photo',basicThaiAiWork:async()=>({templates:[template]})},
   reserveThaiWorkAi:()=>{throw Error('must reject before charging AI')},reserveUsdPremiumCredit:()=>{throw Error('must reject before charging English AI')}};
  const run=Function('deps','with(deps){return async()=>{'+server.slice(start,end)+'}}')(deps);
  await assert.rejects(run(),e=>e.status===403&&e.message==='thai_basic_free_hair_only');
 }
});
test('both Studio create actions reject a verified 89 work, manual PNG selection remains separate',async()=>{
 const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 for(const name of ['createThaiOutfitAi','confirmThaiOutfitAi','processPhoto']){
  const start=editor.indexOf(' const '+name+'=');const body=editor.slice(editor.indexOf('{',editor.indexOf('=>',start))+1);const guard=body.slice(0,body.indexOf('\n',1));
  let message;Function('basicFreeHairOnly','setStatus','THAI_BASIC_AI_MESSAGE',guard)(true,m=>message=m,THAI_BASIC_AI_MESSAGE);assert.equal(message,THAI_BASIC_AI_MESSAGE);
 }
 assert(!editor.slice(editor.indexOf(' const selectAsset='),editor.indexOf('  const target=',editor.indexOf(' const selectAsset='))).includes('basicFreeHairOnly'));
});
