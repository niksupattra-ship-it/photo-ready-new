import test from 'node:test';
import assert from 'node:assert/strict';
import {createThaiWorkAiCredits,THAI_WORK_AI_PACKAGE} from '../thai-work-ai-credits.js';
import {checkoutPackage,packageFor} from '../package-rules.js';
function fixture(){
 const grants=new Map(),usage=new Map();let tail=Promise.resolve();
 const pool={connect:async()=>{let unlock;return {release(){},async query(sql,args=[]){
  if(sql.includes('pg_advisory_xact_lock(hashtext')){const old=tail;tail=new Promise(r=>unlock=r);await old;return {rows:[]}}
  if(sql==='COMMIT'||sql==='ROLLBACK'){unlock?.();unlock=null;return {rows:[]}}
  if(sql.startsWith('SELECT quantity')){const rows=grants.get(args[0]+'|'+args[1])||[];return {rows,rowCount:rows.length}}
  if(sql.startsWith('SELECT status')){const u=usage.get(args[0]);return {rows:u&&u.wallet===args[1]&&u.work===args[2]?[u]:[]}}
  if(sql.includes('COUNT(*)'))return {rows:[{used:[...usage.values()].filter(u=>u.wallet===args[0]&&u.work===args[1]&&u.status!=='refunded').length}]};
  if(sql.startsWith('INSERT INTO credit_usage')){usage.set(args[0],{wallet:args[1],work:args[2],status:'reserved'});return {rowCount:1,rows:[]}}
  return {rows:[],rowCount:0};
 }}}};return {policy:createThaiWorkAiCredits(pool),grants,usage};
}
test('ten atomic reservations per original work, parallel eleventh rejected, other photo/wallet cannot use them',async()=>{
 const {policy,grants,usage}=fixture();grants.set('wallet|photo',[{quantity:10,active:true}]);
 assert.equal((await policy.reserve('wallet','photo','',false)).error,'auth_required');assert.equal(usage.size,0);
 const results=await Promise.all(Array.from({length:15},()=>policy.reserve('wallet','photo')));
 assert.equal(results.filter(r=>r.credit).length,10);assert.equal(results.filter(r=>r.error==='thai_work_ai_exhausted').length,5);assert.equal(usage.size,10);
 assert.equal((await policy.reserve('wallet','other')).owned,false);assert.equal((await policy.reserve('other-wallet','photo')).owned,false);
 assert(results.filter(r=>r.credit).every(r=>r.credit.trialPreview===false&&r.credit.generationRemaining===0));
 const cancelled=[...usage.values()][0];cancelled.status='refunded';assert((await policy.reserve('wallet','photo')).credit);assert.equal((await policy.reserve('wallet','photo')).error,'thai_work_ai_exhausted');
});
test('same alternate-finish operation is idempotent and expired seven-day grants cannot process',async()=>{
 const {policy,grants,usage}=fixture();grants.set('w|p',[{quantity:10,active:true}]);
 const a=await policy.reserve('w','p','finish:job:makeup'),b=await policy.reserve('w','p','finish:job:makeup');assert.equal(a.credit.usageId,b.credit.usageId);assert.equal(usage.size,1);
 grants.set('w|p',[{quantity:10,active:false}]);assert.equal((await policy.reserve('w','p')).error,'thai_work_ai_expired');assert.equal(usage.size,1);
});
test('new purchase is per-photo AI10, keeps receipt definitions and completed-photo requirement',()=>{
 const offer=checkoutPackage('159');assert.equal(offer.id,THAI_WORK_AI_PACKAGE);assert.equal(offer.requiresImage,true);assert.equal(offer.name,'ใช้ AI 10 ครั้ง สำหรับรูปนี้');assert.equal(offer.g+offer.h,0);
 assert.equal(checkoutPackage('download_159_hair_v1').id,'download_159_hair_v1');assert.equal(packageFor('download_159_ai10_v2').g,10);
});
test('actual server charges all new AI processing on the paid work before the free path, never across originals',async()=>{
 const {readFile}=await import('node:fs/promises');const server=await readFile(new URL('../server.js',import.meta.url),'utf8');
 const {policy,grants}=fixture();grants.set('wallet|photo',[{quantity:10,active:true}]);
 const a=server.indexOf('async function requireCredit(req,res,kind){'),b=server.indexOf('\nconst upload=multer(',a);
 const deps={walletId:()=> 'wallet',isPrivateOwner:()=>false,downloadHairAllowed:()=>true,PRODUCTION_HAIR_CATALOG:[],getWallet:async()=>({}),reserveThaiWorkAi:policy.reserve,accountPolicy:()=>{throw Error('Paid bundle must not fall through to another credit path')}};
 const run=Function('deps','with(deps){'+server.slice(a,b)+';return requireCredit}')(deps);
 let status=200;const res={status(n){status=n;return this},json(){return this}};
 for(let i=0;i<10;i++){const credit=await run({accountUser:{wallet_id:'wallet'},body:{downloadWorkId:'photo',interfaceLanguage:'th'},get:()=>''},res,i%2?'hairstyle':'ai-finish');assert(credit.usageId.startsWith('ai10_'));assert.equal(credit.trialPreview,false)}
 assert.equal(await run({accountUser:{wallet_id:'wallet'},body:{downloadWorkId:'photo',interfaceLanguage:'th'},get:()=>''},res,'ai-finish'),null);assert.equal(status,402);
 assert(server.indexOf('if(existing)return res.status(202)',server.indexOf('const submissionId='))<server.indexOf('creditUse=await requireCredit',server.indexOf('const submissionId=')));
 const store=await readFile(new URL('../payment-store.js',import.meta.url),'utf8'),jobs=await readFile(new URL('../job-store.js',import.meta.url),'utf8');
 assert(store.includes("['thai-daily-outfit-ai','thai-work-ai10'].includes(u.rows[0].kind)"));assert(jobs.includes("'thai-work-ai10'].includes(u.kind)"));
});
test('bundle grant requires an owned completed original work and duplicate receipt does not grant again',async()=>{
 const {policy}=fixture();let saved=false,inserted=0;const queries=[];
 const db={query:async(sql,args)=>{queries.push(sql);if(sql.startsWith('INSERT INTO thai_work_ai_grants')){if(args[0]!=='wallet'||args[1]!=='completed')return {rowCount:0};if(saved)return {rowCount:0};saved=true;inserted++;return {rowCount:1}}
 if(sql.startsWith('SELECT work_id'))return {rowCount:saved&&args[1]==='wallet'?1:0};throw Error('Unexpected grant query')}};
 await policy.grant(db,'wallet','completed','receipt');await policy.grant(db,'wallet','completed','receipt');assert.equal(inserted,1);
 await assert.rejects(policy.grant(db,'other','unfinished','other-receipt'),/completed_photo_required/);
 assert(queries[0].includes("min(p.created_at)"));assert(queries[0].includes("+interval '7 days'"));assert(queries[0].includes("SELECT created_at FROM payments WHERE session_id=$3"));assert(queries[0].includes("j.status='completed'"));assert(queries[0].includes('ON CONFLICT(payment_id) DO NOTHING'));
});
