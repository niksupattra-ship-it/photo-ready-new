import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {processProductionPortrait,validateProductionPortrait,shieldThaiNativeUniformFront} from '../production-portrait-pipeline.js';
import {THAI_OUTFIT_AI_VERSION,THAI_OUTFIT_APPEARANCE_VERSION,THAI_OUTFIT_APPEARANCE_PREVIOUS,THAI_OUTFIT_APPEARANCE_LEGACY_SHIELD_VERSION,requiresThaiNativeFrontShield,usesThaiShoulderAwareShield,isThaiOutfitPath,thaiOutfitAppearanceInstruction} from '../thai-outfit-ai-policy.js';
import {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,ENGLISH_TEMPLATE_BODY_FINISH_VERSION} from '../english-template-body-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {SINGLE_PASS_PORTRAIT_VERSION} from '../single-pass-portrait-policy.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';
import {isPrivateOwner} from '../private-trial.js';
import {checkoutPackage,packageFor,remaining} from '../package-rules.js';
const root=new URL('..',import.meta.url).pathname;
const input={buffer:await sharp({create:{width:120,height:160,channels:4,background:'#b38a72'}}).png().toBuffer(),mimetype:'image/png'};
const result=await sharp({create:{width:120,height:160,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:120,channels:4,background:'#b38a72'}}).png().toBuffer(),left:20,top:20}]).png().toBuffer();

test('historical Thai outfit-AI jobs remain renderable after the pricing rollback',async()=>{
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

test('new Thai Studio jobs use the existing full-outfit AI renderer without English locale or credits',async()=>{
 const main=await readFile(root+'src/main.jsx','utf8');
 const studio=await readFile(root+'src/studio-editor.jsx','utf8');
 const server=await readFile(root+'server.js','utf8');
 for(const expected of [
  "const thaiWholeOutfit=!englishPreviewEnabled()&&isThaiOutfitPath(template)",
  "const bodyPortrait=englishPreviewEnabled()||thaiWholeOutfit",
  "if(englishPreviewEnabled()||thaiWholeOutfit){",
  "fd.append('thaiOutfitAiVersion',THAI_OUTFIT_AI_VERSION)",
  "fd.append('thaiOutfitAppearanceVersion',THAI_OUTFIT_APPEARANCE_VERSION)",
  "if(englishPreviewEnabled())fd.append('interfaceLanguage','en')",
  "fd.append('englishOutfitFidelityVersion',ENGLISH_OUTFIT_FIDELITY_VERSION)",
  "fd.append('englishStudioFinishVersion',englishTemplateBodyFinishForGender(portraitMode))",
  "fd.append('neckOutfitReferencePath',neckOutfit)",
  "editCache.current.master?.idpromPortraitComposition===ENGLISH_BODY_PORTRAIT_VERSION"
 ])assert(main.includes(expected),'Missing Thai-only AI path: '+expected);
 assert(studio.includes('if(head.portraitComposition===ENGLISH_BODY_PORTRAIT_VERSION)next='),'A full-outfit output hides the placeholder suit');
 assert(server.includes("const englishRequest=req.body?.interfaceLanguage==='en'"),'English credit policy remains language-specific');
 assert(!main.includes("else fd.append('interfaceLanguage','en')"),'Thai must not enter English credit rules');
 for(const path of ['/assets/job-uniforms/female-job-white.png','/assets/student-uniforms/female-01.png','/assets/government-uniforms/female-operational.png','/assets/gown-uniforms/female-01.png'])assert(isThaiOutfitPath(path),path);
});

test('new Thai light-colour garment and rear-hair priorities apply only to Thai full-outfit images',async()=>{
 const template='/assets/job-uniforms/female-job-light-pink-tweed-pearl-trim.png';
 const core={portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,englishOutfitFidelityVersion:(await import('../english-outfit-fidelity-version.js')).ENGLISH_OUTFIT_FIDELITY_VERSION,portraitMode:'female',hairId:'original',femaleEyeStyle:'makeup',neckOutfitReferencePath:template,faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,singlePassPortraitVersion:SINGLE_PASS_PORTRAIT_VERSION,femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION};
 const thai={...core,interfaceLanguage:'th',thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION};
 const english={...core,interfaceLanguage:'en'};
 assert.doesNotThrow(()=>validateProductionPortrait(input,thai));
 assert.throws(()=>validateProductionPortrait(input,{...thai,thaiOutfitAppearanceVersion:'unknown'}));
 assert.throws(()=>validateProductionPortrait(input,{...english,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION}));
 assert.match(thaiOutfitAppearanceInstruction({outfitIndex:3,detailIndex:5}),/BEHIND the corresponding ears, neck and SHOULDERS/);
 const prompts=[];
 for(const fields of [thai,english]){
  const calls=[];
  const out=await processProductionPortrait({input,fields,root,key:'test',removeBackground:async()=>result,requestPortrait:async request=>{calls.push(request);return {png:result}}});
  assert.equal(calls.length,1,'No second AI call for colour or hair positioning');
  assert(out.length);
  prompts.push(calls[0].prompt);
 }
 assert.match(prompts[0],/THAI FULL-OUTFIT FINAL REFERENCE PRIORITY/);
 assert.match(prompts[0],/MUST NOT be painted in front of any outfit fabric/);
 assert.match(prompts[0],/Do NOT turn a light pastel-pink tweed into dusty rose/);
 assert.match(prompts[0],/FINAL SELECTED OUTFIT COLOUR AND DETAIL AUTHORITY/);
 assert.doesNotMatch(prompts[1],/THAI FULL-OUTFIT FINAL REFERENCE PRIORITY/,'English prompt is unchanged');
 assert.equal(thai.interfaceLanguage,'th','Internal rendering must not mutate the Thai credit locale');
 const main=await readFile(root+'src/main.jsx','utf8');
 assert(main.includes('...(thaiWholeOutfit?[THAI_OUTFIT_APPEARANCE_VERSION]:[])'),'Thai-only new cache and recovery version');
 assert(main.includes("fd.append('thaiOutfitAppearanceVersion',THAI_OUTFIT_APPEARANCE_VERSION)"),'Frontend sends the Thai-only version');
});

test('Thai native uniform reliably occludes hair over both jacket fronts and clips hanging outer hair without touching face',async()=>{
 const W=240,H=320;
 // The artificial AI result has black hair on BOTH white jacket panels,
 // black hair outside the garment and a red-brown face above the shoulders.
 const original=await sharp({create:{width:W,height:H,channels:4,background:'#c78672'}}).png().toBuffer();
 const stripe=await sharp({create:{width:16,height:190,channels:4,background:'#050608'}}).png().toBuffer();
 const tainted=await sharp(original).composite([
  {input:stripe,left:62,top:125},{input:stripe,left:160,top:125},{input:stripe,left:14,top:125}
 ]).png().toBuffer();
 // Native transparent outfit with an open neckline at the top.
 const front=await sharp({create:{width:W,height:H,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([
  {input:await sharp({create:{width:176,height:205,channels:4,background:'#f7f6f2'}}).png().toBuffer(),left:32,top:115}
 ]).png().toBuffer();
 const geometry={nativeForeground:front,shoulderTopY:115,collarTopY:150,centerX:120,shoulderSpan:176};
 const returned=await shieldThaiNativeUniformFront(tainted,geometry);
 const {data,info}=await sharp(returned).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const pixel=(x,y)=>[...data.subarray((y*W+x)*4,(y*W+x)*4+4)];
 assert.deepEqual(pixel(60,70),[199,134,114,255],'Face and skin above shoulder level remain unchanged');
 assert.deepEqual(pixel(70,220),[247,246,242,255],'Left hair is fully covered by the real outfit pixels');
 assert.deepEqual(pixel(166,220),[247,246,242,255],'Right hair is fully covered by the real outfit pixels');
 assert.equal(pixel(18,220)[3],0,'Hair protruding outside the uniform silhouette is removed');
 assert.deepEqual(pixel(120,220),[247,246,242,255],'Original shirt and central garment remain visible');
 assert.deepEqual(pixel(70,110),[199,134,114,255],'Nothing above shoulder line is edited');
 assert.equal(info.width,W);
});

test('Thai v4 protects the actual sloping shoulder edge and neck opening without cyan seams or flat-cut hair',async()=>{
 const W=240,H=320;
 const skin=[199,134,114,255],black=[5,6,8,255],white=[247,246,242,255];
 const stripe=async(width,height,colour)=>sharp({create:{width,height,channels:4,background:colour}}).png().toBuffer();
 const source=await sharp({create:{width:W,height:H,channels:4,background:'#c78672'}}).png().toBuffer();
 const original=await sharp(source).composite([
  {input:await stripe(14,160,'#050608'),left:93,top:100},
  {input:await stripe(12,160,'#050608'),left:150,top:100},
  {input:await stripe(10,160,'#050608'),left:10,top:100}
 ]).png().toBuffer();
 const native=await sharp({create:{width:W,height:H,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
  .composite([
   {input:await stripe(50,200,'#f7f6f2'),left:30,top:120},
   {input:await stripe(50,200,'#f7f6f2'),left:160,top:120},
   {input:await stripe(80,148,'#f7f6f2'),left:80,top:172},
   {input:await stripe(40,8,'#32cfff'),left:100,top:156}
  ]).png().toBuffer();
 const layout={nativeForeground:native,shoulderTopY:120,collarTopY:167,centerX:120,shoulderSpan:176};
 const fixed=await shieldThaiNativeUniformFront(original,layout);
 const legacy=await shieldThaiNativeUniformFront(original,layout,{legacy:true});
 const inspect=async img=>{
  const {data}=await sharp(img).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  return (x,y)=>[...data.subarray((y*W+x)*4,(y*W+x)*4+4)];
 };
 const now=await inspect(fixed),old=await inspect(legacy);
 assert.deepEqual(now(100,110),black,'Hair above the shoulders remains original');
 assert.deepEqual(now(100,145),black,'Hair is not horizontally cut before the LOCAL centre collar begins');
 assert.equal(old(94,145)[3],0,'v3 had incorrectly erased hair outside its too-narrow neck exemption with global shoulder clipping');
 assert.deepEqual(now(100,220),white,'Below the local collar, the actual uniform covers forward hair');
 assert.deepEqual(now(165,220),white,'Both shoulders are opaque and hair-free');
 assert.deepEqual(now(120,160),skin,'Cyan template seam is never pasted over the neck skin');
 assert.deepEqual(now(120,80),skin,'Face stays pixel-identical');
 assert.equal(now(15,230)[3],0,'Outer stray hair beneath shoulder gradually disappears');
 assert.equal(now(15,140)[3]>0,true,'Outer hair is not cut at one global shoulder level');
});

test('Thai shoulder-aware v4 fixes newly generated images; historical v3/v2 and English remain compatible',async()=>{
 const core={thaiOutfitAiVersion:THAI_OUTFIT_AI_VERSION,neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png'};
 const updated={...core,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION};
 const legacy={...core,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_PREVIOUS};
 assert.equal(requiresThaiNativeFrontShield(updated),true);
 assert.equal(requiresThaiNativeFrontShield(legacy),false);
 assert.equal(requiresThaiNativeFrontShield({...core,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_LEGACY_SHIELD_VERSION}),true,'Queued v3 uses its original legacy clipping');
 assert.equal(usesThaiShoulderAwareShield(updated),true);
 assert.equal(usesThaiShoulderAwareShield({...core,thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_LEGACY_SHIELD_VERSION}),false);
 assert.equal(requiresThaiNativeFrontShield({thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,interfaceLanguage:'en'}),false);
 const source=await readFile(root+'production-portrait-pipeline.js','utf8');
 assert(source.includes('const frontShield=requiresThaiNativeFrontShield(fields)&&templateBody&&!headOnly'));
 assert(source.includes('const delivered=frontShield?await shieldThaiNativeUniformFront(transparent,nativeFrontGeometry,{legacy:!usesThaiShoulderAwareShield(fields)}):transparent'));
 const layout=await readFile(root+'english-body-layout.js','utf8');
 assert(layout.includes('if(!returnNativeForeground)return composition'),'All English output remains original one-pass composition');
 const main=await readFile(root+'src/main.jsx','utf8');
 assert(main.includes('...(thaiWholeOutfit?[THAI_OUTFIT_APPEARANCE_VERSION]:[])'),'Thai cache version invalidates buggy old previews');
});

test('Thai Studio outfit thumbnail places PNG and one magic-wand icon explicitly starts AI without altering English',async()=>{
 const studio=await readFile(root+'src/studio-editor.jsx','utf8');
 const css=await readFile(root+'src/studio-redesign.css','utf8');
 assert(studio.includes('className="thai-outfit-card"'),'Thai suit cards remain visible');
 assert(studio.includes('className="thai-outfit-ai"'),'Thai AI icon action exists');
 assert(!studio.includes('className="thai-outfit-png"'),'Redundant PNG button must be absent');
 assert(!studio.includes('>วาง PNG</button>'),'There must be no visible PNG text button');
 assert(!studio.includes('>สร้างด้วย AI</button>'),'AI button is icon-only, not a text button');
 assert(studio.includes('title="สร้างด้วย AI"'),'Magic wand button has a discoverable title');
 assert(studio.includes("aria-label={'สร้างชุดด้วย AI '+"),'Magic wand remains accessible to screen readers');
 assert(studio.includes('<svg viewBox="0 0 24 24" width="19" height="19"'),'AI icon renders as an inline SVG');
 assert(studio.includes("void selectAsset(visiblePicker,o,{manualOverride:visiblePicker==='suit'&&!englishFlow})"),'Clicking the thumbnail still places native PNG without AI');
 assert(studio.includes("onClick={()=>void createThaiOutfitAi(o)}"),'AI generation remains an independent explicit click');
 assert(studio.includes("const manualSuit=englishFlow&&kind==='suit'&&!aiSetup||(!englishFlow&&kind==='suit'&&!aiSetup&&manualOverride)"),'English PNG handling stays intact');
 assert(studio.includes("else if(!aiSetup&&!manualSuit)setBodyOutfitRequest"),'Native PNG cannot auto-submit an AI request');
 assert(studio.includes("await selectAsset('suit',option,{aiSetup:true})"),'Explicit AI uses the chosen outfit');
 assert(studio.includes("await processPhoto({hairId:hair||firstGenerationHairFor(mode),portraitMode:mode,continueWithoutSave:true,explicitCreate:true,outfitAiCreate:true})"),'AI call is dispatched only from explicit creation');
 assert(studio.includes('className="english-outfit-card">{card}<button type="button" className="english-outfit-ai"'),'English outfit card and behavior unchanged');
 assert(css.includes('.thai-outfit-actions .thai-outfit-ai svg'),'Icon has its own size without touching other UI');
 assert(!css.includes('.english-outfit-card'),'Thai styles must not modify English cards');
});

test('new checkout restores original prices and sold AI10 receipt terms remain frozen',()=>{
 const basic=checkoutPackage('89'),fresh=checkoutPackage('159');
 assert.equal(basic.id,'download_89_v1');assert.equal(basic.price,89);
 assert.equal(fresh.id,'download_159_hair_v1');assert.equal(fresh.price,159);assert.equal(fresh.g+fresh.h,0);assert.equal(fresh.requiresImage,true);assert.equal(fresh.fullEdit,true);
 assert.equal(packageFor('download_159_ai10_v2').g,10);
 assert.equal(packageFor('download_159_hair_v1').g,0);
 assert.throws(()=>checkoutPackage('download_159_ai10_v2'));
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
test('historical Thai reservations retain their shared pool and two-slot accounting for safe settlement/refunds',async()=>{
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


test('Studio suit permission subscription is stable during parent progress renders',async()=>{
 const ed=await readFile(root+'src/studio-editor.jsx','utf8');
 const start=ed.indexOf(' const selectSuitPolicyRef=useRef(onSelectSuit)'),end=ed.indexOf(' const canUseAllSuits=',start);
 assert(start>=0&&end>start);
 const effect=ed.slice(start,end);
 assert.match(effect,/if\(processActive\)return/);
 assert.match(effect,/selectSuitPolicyRef\.current\(head\.jobId/);
 assert.match(effect,/\[accountScope,outputKey,currentSuit,restrictedTrial,hasSuitPolicyCallback,suitPolicyUnlockId,processActive\]/);
 assert.doesNotMatch(effect,/\[outputKey,restrictedTrial,onSelectSuit/);
 assert.match(effect,/!cancelled&&outputScopeRef\.current===accountScope/);
});
test('Thai frontend and regular usage restore the pre-AI-bundle behavior',async()=>{
 const [ed,main,easy,offers,server]=await Promise.all(['src/studio-editor.jsx','src/main.jsx','src/easy-mode.jsx','src/package-offers.jsx','server.js'].map(p=>readFile(root+p,'utf8')));
 assert.match(offers,/price:'159',name:'รับรูปนี้ \+ ทรงผม',features:'เลือกชุด 5 ชุด · ปลดล็อกทรงผม'/);
 assert.match(offers,/price:'89',name:'รับรูปนี้',features:'เลือกชุด 3 ชุด · ทรงผมพื้นฐาน'/);
 assert.doesNotMatch(offers,/AI 10 ครั้ง/);
 assert.doesNotMatch(ed,/onSuitAi|studio-ai-trial-note|thaiOutfitAi:!englishFlow/);
 assert.doesNotMatch(easy,/initialOutfitAi|onSuitAi/);
 assert.doesNotMatch(main,/onCheckEnglishOutfitAi=\{async\(\)=>\{[^\n]*thai-ai-edit/);
 assert.doesNotMatch(server,/reserveThaiAiEdit|thai_ai_daily_limit|\/api\/thai-ai-edit\/access/);
});
test('ordinary Thai generation is not subject to the removed two-per-day quota or the AI10 pool',async()=>{
 const server=await readFile(root+'server.js','utf8'),a=server.indexOf('async function requireCredit(req,res,kind){'),b=server.indexOf('\nconst upload=multer(',a);
 const deps={crypto,walletId:()=> 'wallet',isPrivateOwner:()=>false,downloadHairAllowed:()=>true,PRODUCTION_HAIR_CATALOG:[{id:'seedream-14',gender:'female'}],THAI_FREE_FEMALE_HAIR_IDS:['seedream-14'],getWallet:async()=>({usdPremiumPurchased:false}),accountPolicy:()=>{throw Error('Basic Thai hair must not require Premium')},reserveThaiAiEdit:()=>{throw Error('Removed daily quota must not be used')}};
 const run=Function('deps','with(deps){'+server.slice(a,b)+';return requireCredit}')(deps);
 const req={body:{hairId:'seedream-14',interfaceLanguage:'th'},get:()=>''},res={status(){throw Error('Thai basic request rejected')}};
 for(let i=0;i<8;i++){const out=await run(req,res,i%2?'hairstyle':'ai-finish');assert(out.usageId.startsWith('free_'));assert.equal(out.trialPreview,true);assert.equal(out.generationRemaining,0)}
});
