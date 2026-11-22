
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('two daily English AI requests are recorded per wallet and refundable on failure',async()=>{
 const p=await read('payment-store.js');
 for(const x of ['ENGLISH_DAILY_AI_OUTFIT_LIMIT=2','SELECT id FROM wallets WHERE id=$1 FOR UPDATE',"kind='english-daily-ai-outfit'","status IN ('reserved','completed')","AT TIME ZONE 'Asia/Bangkok'",'if(used>=ENGLISH_DAILY_AI_OUTFIT_LIMIT)',"if(['english-daily-ai-outfit','thai-daily-ai-edit'].includes(u.rows[0].kind))"])assert.ok(p.includes(x),x);
});
test('server gates only English AI while preserving Premium credits and Thai workflow',async()=>{
 const s=await read('server.js');
 for(const x of ["app.get('/api/english-ai-outfit/access'","if(req.body?.interfaceLanguage==='en')",'reserveEnglishDailyAiOutfit(wid)',"error:'english_ai_daily_limit'",'reserveUsdPremiumCredit(wid,kind)'])assert.ok(s.includes(x),x);
});
test('English unlimited PNG suits remain selectable and Edit with AI opens packages when exhausted',async()=>{
 const e=await read('src/studio-editor.jsx'),m=await read('src/main.jsx');
 for(const x of ["const manualSuit=englishFlow&&kind==='suit'&&!aiSetup","if(!await englishOutfitAiAllowed()","if(access?.allowed===false)onRequestUnlock?.()"])assert.ok(e.includes(x),x);
 assert.ok(m.includes("onCheckEnglishOutfitAi={async()=>{"));
 assert.ok(m.includes('/api/english-ai-outfit/access'));
});

test('English free hairstyle ids match server credit gate for both genders, Thai remains independent',async()=>{
 const server=await read('server.js');
 const policy=await read('src/english-studio-hair-policy.js');
 assert.match(server,/import \{isEnglishStudioFreeHair\} from '\.\/src\/english-studio-hair-policy\.js'/);
 assert.match(server,/englishRequest&&chosen&&!isEnglishStudioFreeHair\(chosen.id,chosen.gender\)/);
 assert.match(server,/!englishRequest&&chosen&&/);
 for(const id of ['seedream-49','seedream-53','seedream-67','seedream-76'])assert.ok(policy.includes(id),id);
 const {PRODUCTION_HAIR_CATALOG,downloadHairAllowed}=await import('../hairstyle-catalog.js');
 const {isEnglishStudioFreeHair}=await import('../src/english-studio-hair-policy.js');
 for(const [gender,ids] of Object.entries({female:['seedream-49','seedream-53'],male:['seedream-67','seedream-76']})){
  for(const id of ids){
   const item=PRODUCTION_HAIR_CATALOG.find(h=>h.id===id);
   assert.equal(item?.gender,gender,id+' must be in current provider catalogue');
   assert.equal(downloadHairAllowed(id),true);
   assert.equal(isEnglishStudioFreeHair(item.id,item.gender),true);
  }
 }
 assert.equal(isEnglishStudioFreeHair('seedream-42','female'),false,'English Diamond stays paid');
 assert.equal(isEnglishStudioFreeHair('seedream-37','male'),false,'English Diamond stays paid');
});
test('actual credit handler accepts continuing English free hairstyle with daily slots and reserves neither Thai nor Diamond credits',async()=>{
 const server=await read('server.js');
 const first=server.indexOf('async function requireCredit(req,res,kind){');
 const last=server.indexOf('\nconst upload=multer(',first);
 assert.ok(first>=0&&last>first);
 const source=server.slice(first,last);
 const {PRODUCTION_HAIR_CATALOG,downloadHairAllowed,THAI_FREE_FEMALE_HAIR_IDS,FIRST_GENERATION_FEMALE_HAIR}=await import('../hairstyle-catalog.js');
 const {isEnglishStudioFreeHair}=await import('../src/english-studio-hair-policy.js');
 const calls={free:0,paid:0,thai:0};
 let premium=false;
 const deps={walletId:req=>req.wallet,isPrivateOwner:()=>false,hasPrivateTrial:()=>false,
  PRODUCTION_HAIR_CATALOG,downloadHairAllowed,THAI_FREE_FEMALE_HAIR_IDS,FIRST_GENERATION_FEMALE_HAIR,isEnglishStudioFreeHair,
  getWallet:async()=>premium?{usdPremiumPurchased:true,usdPremiumActive:true,usdPremiumRemaining:12}:{usdPremiumPurchased:false},
  accountPolicy:()=>({canGeneratePremiumHair:async()=>{calls.thai++;return false}}),
  reserveEnglishDailyAiOutfit:async()=>{calls.free++;return calls.free<=2?{usageId:'free_fixture'+calls.free,trialPreview:true}:null},
  reserveUsdPremiumCredit:async()=>{calls.paid++;return {usageId:'paid_fixture',credits:11}},
  crypto:{randomBytes:()=>({toString:()=> 'fixture'})}
 };
 const requireCredit=new Function('deps','with(deps){'+source+';return requireCredit;}')(deps);
 const check=async(hairId,language='en')=>{
  let status=200,body=null;
  const res={status(v){status=v;return this},json(v){body=v;return this}};
  const req={wallet:'wallet-fixture',body:{hairId,interfaceLanguage:language},get:()=>'',accountUser:{wallet_id:'wallet-fixture'}};
  const credit=await requireCredit(req,res,'hairstyle');return {credit,status,body};
 };
 assert.equal((await check('seedream-49')).status,200);
 assert.equal((await check('seedream-67')).status,200);
 const exhausted=await check('seedream-53');
 assert.equal(exhausted.status,402,'Third free generation opens package flow, not 403');
 assert.equal(exhausted.body?.error,'english_ai_daily_limit');
 assert.equal(calls.thai,0,'English free hair never passes Thai policy');
 assert.equal((await check('seedream-42')).body?.error,'premium_hair_required','Diamond still needs a plan');
 assert.equal(calls.free,3,'Diamond denial never reserves a daily slot');
 assert.equal((await check('seedream-49','th')).status,403,'Other Thai premium cuts stay locked');
 const beforeThai=calls.thai;
 for(const id of THAI_FREE_FEMALE_HAIR_IDS)assert.equal((await check(id,'th')).status,200,id+' retains Thai basic access without premium');
 assert.equal(calls.thai,beforeThai,'Thai basic hair never requires Diamond entitlement');
 for(const id of ['seedream-42','seedream-40','seedream-27','female-default-reference','seedream-43'])assert.equal((await check(id,'th')).body?.error,'premium_hair_required',id+' is Thai Diamond');
 premium=true;
 assert.equal((await check('seedream-42')).status,200,'active USD Premium can use English Diamond');
 assert.equal(calls.paid,1);
});

test('English hairstyle cards no longer show a Free caption, without changing hair permissions or Thai label',async()=>{
 const editor=await read('src/studio-editor.jsx');
 assert.ok(editor.includes("{!englishFlow&&isFreeFemaleHair(h.id)&&<small>ฟรี</small>}"));
 assert.ok(!editor.includes("englishFlow?'Free':'ฟรี'"));
 assert.ok(editor.includes("isEnglishStudioDiamondHair(id,femaleHair.some(h=>h.id===id)?'female':'male')"));
 const policy=await read('src/english-studio-hair-policy.js');
 assert.ok(policy.includes("female:Object.freeze(['seedream-49','seedream-53'])"));
 assert.ok(policy.includes("male:Object.freeze(['seedream-67','seedream-76'])"));
});
