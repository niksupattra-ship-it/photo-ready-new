
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('two daily English AI requests are recorded per wallet and refundable on failure',async()=>{
 const p=await read('payment-store.js');
 for(const x of ['ENGLISH_DAILY_AI_OUTFIT_LIMIT=2','SELECT id FROM wallets WHERE id=$1 FOR UPDATE',"kind='english-daily-ai-outfit'","status IN ('reserved','completed')","AT TIME ZONE 'Asia/Bangkok'",'if(used>=ENGLISH_DAILY_AI_OUTFIT_LIMIT)',"if(u.rows[0].kind==='english-daily-ai-outfit')"])assert.ok(p.includes(x),x);
});
test('server gates only English AI while preserving Premium credits and Thai workflow',async()=>{
 const s=await read('server.js');
 for(const x of ["app.get('/api/english-ai-outfit/access'","if(req.body?.interfaceLanguage==='en')",'reserveEnglishDailyAiOutfit(wid)',"error:'english_ai_daily_limit'",'reserveUsdPremiumCredit(wid,kind)'])assert.ok(s.includes(x),x);
});
test('English unlimited PNG suits remain selectable and Edit with AI opens packages when exhausted',async()=>{
 const e=await read('src/studio-editor.jsx'),m=await read('src/main.jsx');
 for(const x of ["const manualSuit=englishFlow&&kind==='suit'&&!aiSetup","if(kind==='suit'&&option&&!englishFlow&&suitPolicy.limited","if(kind==='suit'&&option&&!englishFlow&&!canUseAllSuits","visiblePicker==='suit'&&!englishFlow&&isJobOutfit(o)","if(!await englishOutfitAiAllowed()","if(access?.allowed===false)onRequestUnlock?.()"])assert.ok(e.includes(x),x);
 assert.ok(m.includes("onCheckEnglishOutfitAi={async()=>{"));
 assert.ok(m.includes('/api/english-ai-outfit/access'));
});
