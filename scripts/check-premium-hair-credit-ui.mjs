import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const studio=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
const rows=[];
async function test(name,run){await run();rows.push({name,passed:true});console.log('PASS '+name)}
function expression(source,name){const match=source.match(new RegExp(' const '+name+'=([^\\n]+);'));assert(match,name);return env=>new Function('env',`with(env){return (${match[1]})}`)(env)}
function action(name,env){const a=studio.indexOf(' const '+name+'='),b=studio.indexOf('\n };',a);assert(a>=0&&b>a,name);return new Function('env',`with(env){${studio.slice(a,b+4)};return ${name}}`)(env)}
const creditAvailable=expression(main,'premiumHairCreditAvailable');
const hairAllowed=expression(studio,'premiumHairAllowed');
const normalize=new Function(main.slice(main.indexOf('function normalizedRights('),main.indexOf('\nconst GOVERNMENT_FINANCE_TEMPLATE'))+';return normalizedRights')();
const heads=ls=>ls.filter(l=>l.kind==='head');
const context=(balance,overrides={})=>({authToken:()=> 'verified-session',knownWalletData:{walletId:'wallet',processRemaining:0,premiumDownloadRemaining:balance},rights:normalize({processRemaining:0,premiumDownloadRemaining:balance}),...overrides});
const hairContext=(premiumHairCreditAvailable=false,verifiedJobs={},layers=[{kind:'head',jobId:'current'}])=>({premiumHairCreditAvailable,outputHeads:heads,layers,verifiedJobs});
function fixture(allowed,{raw=false}={}){
 const calls=[],layers=raw?[]:[{kind:'head',jobId:'current'}];
 const env={processRequestRef:{current:null},processActive:false,assetBusy:false,appearanceFailure:(...args)=>calls.push(['error',...args]),ready:true,isPremiumHair:id=>id==='diamond',premiumHairAllowed:allowed,onRequestUnlock:()=>calls.push(['unlock']),state:{current:layers},layerKind:l=>l.kind,hairGender:'female',trackHairSelection:(...args)=>calls.push(['track',...args]),applyFreeHair:()=>calls.push(['free']),canRestoreHair:()=>true,paidHairAccess:true,trialHairRemaining:0,isTrialHairAllowed:()=>false,processHairPending:false,sourceLayerRef:{current:'source'},sourcePhoto:{name:'original'},portraitMode:'female',pendingHairProcessRef:{current:null},processPhoto:options=>calls.push(['process',options]),applyHair:id=>calls.push(['hair',id]),setPortraitChoiceOpen:()=>calls.push(['photo-type']),easyPhotoTypeSelected:true,templates:[],currentSuit:'',setStatus:message=>calls.push(['status',message])};
 return {calls,env,choose:action('chooseHair',env)};
}
await test('current authenticated wallet makes diamond hair available at two and one remaining credits',()=>{
 for(const remaining of [2,1])assert.equal(creditAvailable(context(remaining)),true);
 assert(main.includes('premiumHairCreditAvailable={premiumHairCreditAvailable}'));
 assert(studio.includes('premiumHairCreditAvailable=false,'));
});
await test('zero, malformed, guest or account-transition wallet never unlocks diamond hair',()=>{
 for(const remaining of [0,-1,null,undefined,'bad'])assert.equal(creditAvailable(context(remaining)),false,String(remaining));
 assert.equal(creditAvailable(context(2,{authToken:()=>''})),false);
 assert.equal(creditAvailable(context(2,{knownWalletData:null})),false);
 assert.equal(hairAllowed(hairContext('true')),false,'narrow prop requires true');
});
await test('remaining 2→1→0 affects unredeemed hair only and preserves premium work rights after zero',()=>{
 const jobs={current:{checked:true,unlocked:true,premiumHair:true}};
 for(const remaining of [2,1,0]){
  const flag=creditAvailable(context(remaining));
  assert.equal(hairAllowed(hairContext(flag)),remaining>0);
  assert.equal(hairAllowed(hairContext(flag,jobs)),true);
 }
 assert.equal(hairAllowed(hairContext(false,{old:{premiumHair:true}})),false,'another paid work does not unlock current work');
 assert.equal(hairAllowed(hairContext(false,jobs,[{kind:'head',jobId:'replacement'}])),false,'new work after exhaustion remains locked');
});
await test('Studio selection before redemption calls existing AI path without unlock or charge',()=>{
 for(const remaining of [2,1]){
  const f=fixture(hairAllowed(hairContext(creditAvailable(context(remaining)))));f.choose('diamond');
  assert.deepEqual(f.calls.filter(c=>c[0]!=='track'),[['hair','diamond']]);
 }
});
await test('Studio first portrait processing accepts premium hair with remaining credits',()=>{
 const f=fixture(hairAllowed(hairContext(creditAvailable(context(2)))),{raw:true});f.choose('diamond');
 assert.deepEqual(f.calls.filter(c=>c[0]!=='track'),[['process',{hairId:'diamond',portraitMode:'female',continueWithoutSave:true}]]);
});
await test('Easy first portrait processing uses same credit gate and original generation flow',()=>{
 const start=studio.indexOf(' const processEasyPhoto='),end=studio.indexOf('\n const easyUi=',start);assert(start>=0&&end>start);
 for(const available of [true,false]){
  const f=fixture(available,{raw:true});
  const run=new Function('env',`with(env){${studio.slice(start,end)};return processEasyPhoto}`)(f.env);run('diamond');
  assert.deepEqual(f.calls,available?[['process',{hairId:'diamond',portraitMode:'female',continueWithoutSave:true}]]:[['unlock']]);
 }
 assert(studio.includes('locked:isPremiumHair(h.id)&&!premiumHairAllowed'));
});
await test('exhaustion blocks new premium selection while redeemed work keeps original handler',()=>{
 let f=fixture(hairAllowed(hairContext(false)));f.choose('diamond');assert.deepEqual(f.calls,[['unlock']]);
 f=fixture(hairAllowed(hairContext(false,{current:{premiumHair:true}})));f.choose('diamond');assert.deepEqual(f.calls.filter(c=>c[0]!=='track'),[['hair','diamond']]);
 f=fixture(false);f.choose('basic');assert.deepEqual(f.calls.filter(c=>c[0]!=='track'),[['hair','basic']]);
});
await test('hair availability never marks an output paid or consumes a download credit',()=>{
 const r=normalize({processRemaining:0,premiumDownloadRemaining:2});assert.equal(r.generationRemaining,0);assert.equal(r.hairRemaining,0);assert.equal(r.canSave,false);assert.equal(r.allFeatures,false);assert.equal(r.unlimitedDownloads,false);assert.equal(r.premiumDownloadRemaining,2);
 const restricted=expression(studio,'restrictedTrial');assert.equal(restricted({outputHeads:heads,layers:[{kind:'head',jobId:'current'}],verifiedJobs:{current:{unlocked:false,premiumHair:false}},hasCredits:true,trialUnlocked:false}),true);
 const f=fixture(true);for(let i=0;i<5;i++)f.choose('diamond');assert.equal(f.calls.filter(c=>c[0]==='hair').length,5);assert.equal(f.calls.filter(c=>c[0]==='unlock').length,0);assert.equal(r.premiumDownloadRemaining,2);
});
if(process.env.IDPROM_PREMIUM_HAIR_UI_OUTPUT){await mkdir(process.env.IDPROM_PREMIUM_HAIR_UI_OUTPUT,{recursive:true});await writeFile(process.env.IDPROM_PREMIUM_HAIR_UI_OUTPUT+'/client-results.json',JSON.stringify({passed:rows.length,failed:0,scope:'Actual App wallet flag, Studio handlers/availability and Easy first-process function extracted from current source; no real customer/provider writes.',results:rows},null,2))}
console.log(`${rows.length} premium-hair-credit UI scenarios passed.`);
