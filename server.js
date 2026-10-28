import {downloadPolicy} from './download-policy-store.js';
import {PRODUCTION_HAIR_CATALOG,isTrialHairAllowed,downloadHairAllowed} from './hairstyle-catalog.js';
import {processProductionPortrait,validateProductionPortrait} from './production-portrait-pipeline.js';
import {generateJobOutfit,isJobOutfitTemplate} from './job-outfit-ai.js';
import {registerYoucamHairApi} from './youcam-hair-api.js';
import {refineBackgroundAlpha} from './background-edge-refine.js';
import {hairRootTargetInstruction} from './hair-root-target.js';
import {registerPasswordResetApi} from './password-reset-api.js';
import {registerPromptpayApi,settlePromptpay} from './promptpay-api.js';
import {verifyStripeSignature,settleCheckout} from './stripe-payment-validation.js';
import {HAIRSTYLE_FIT_POLICY,HAIRSTYLE_PROPORTION_POLICY} from './hairstyle-fit-policy.js';
import {selectedHairstyleRule} from './hairstyle-rules.js';
import {validateProject} from './saved-work-store.js';
import {registerSavedWorkApi} from './saved-work-api.js';
import {startSavedWorkRetentionCleanup} from './saved-work-retention-worker.js';
import express from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import {editHairstyle,providerStatus} from "./hairstyle-engine/index.js";
import { fileURLToPath } from "url";
import {newWallet,getWallet,getWalletBalance,ensureWallet,creditPaid,recordDownloadRefund,pendingDownloadRefunds,redeemPromo199,redeemPromoPackage,reserveCredit,reserveTrialPreview,commitCredit,refundCredit,walletHistory,imageEntitlements,creditOutputFullEdit,trialOptionAccess} from "./payment-store.js";
import {createAiJob,claimAiJob,touchAiJob,completeAiJob,failAiJob,getAiJob,getAiJobResult,getAiJobsAccess,queuedAiJobs,claimTrialImage,settleAiJobDelivery} from "./job-store.js";
import {checkoutPackage} from './package-rules.js';
import {registerUser,loginUser,authUser,walletHasAccount,createPasswordReset,resetPassword} from "./auth-store.js";

import {hasPrivateTrial,isPrivateOwner,registerPrivateTrial} from "./private-trial.js";
import {requestDownloadPolicy} from './account-feature-policy.js';
import pg from 'pg';
import {createPremiumDownloadCredits} from './premium-download-credits.js';
import {PREMIUM_DOWNLOAD_BATCHES} from './premium-download-batches.js';
import {activateConfiguredPremiumAccounts} from './premium-download-support.js';
import {createPackageUnlockCodeStore} from './package-unlock-code-store.js';
import {registerPackageUnlockCodeApi} from './package-unlock-code-api.js';
import {PACKAGE_UNLOCK_CODES} from './package-unlock-codes.js';

const dir=path.dirname(fileURLToPath(import.meta.url));
const app=express();
let paymentApi;
app.set("trust proxy",1);

const STRIPE_PRICE_ID=process.env.STRIPE_PRICE_ID||"price_1UKKMzJdTdkPeQBPQwtPL7kE";
const STRIPE_PRICE_ID_199=process.env.STRIPE_PRICE_ID_199||"";
const APP_URL=(process.env.APP_URL||"").replace(/\/$/,"");
function walletId(req){return req.accountUser?.wallet_id||String(req.get("X-Wallet-Id")||"").trim()}
const premiumCreditPool=new pg.Pool({max:2,connectionTimeoutMillis:5000,connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'||/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL||'')?false:{rejectUnauthorized:false}});
const premiumDownloadCredits=createPremiumDownloadCredits(premiumCreditPool,{prepare:downloadPolicy.ready,batches:PREMIUM_DOWNLOAD_BATCHES,allowed:downloadPolicy.allowed,premiumHair:downloadPolicy.premiumHair});
const packageUnlockCodeStore=createPackageUnlockCodeStore(premiumCreditPool,{prepare:downloadPolicy.ready,codes:PACKAGE_UNLOCK_CODES,allowed:downloadPolicy.allowed,premiumHair:downloadPolicy.premiumHair});
const accountPolicy=req=>requestDownloadPolicy(req,downloadPolicy,{getJobsAccess:getAiJobsAccess,premiumCredits:premiumDownloadCredits});
async function activateSupportDownloadCredits(attempt=0){
 let retry=false;
 try{
  const report=await activateConfiguredPremiumAccounts(premiumCreditPool,premiumDownloadCredits,PREMIUM_DOWNLOAD_BATCHES);
  console.info('Premium download support activation:',{granted:report.granted,active:report.results.filter(row=>row.state==='active').length,missing:report.results.filter(row=>row.state==='missing').length,conflicts:report.results.filter(row=>row.state==='conflict').length});
  retry=report.retryable;
 }catch{console.warn('Premium download support activation unavailable; authenticated activation remains enabled');retry=true}
 if(retry&&attempt<3)setTimeout(()=>void activateSupportDownloadCredits(attempt+1),15000).unref();
}
setTimeout(()=>void activateSupportDownloadCredits(),1500).unref();
async function stripePost(endpoint,params,idempotencyKey){
  const key=process.env.STRIPE_SECRET_KEY;if(!key)throw new Error("ยังไม่ได้ตั้งค่า STRIPE_SECRET_KEY");
  const body=new URLSearchParams();for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null)body.append(k,String(v));
  const r=await fetch(`https://api.stripe.com/v1/${endpoint}`,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/x-www-form-urlencoded",...(idempotencyKey?{"Idempotency-Key":idempotencyKey}:{})},body,signal:AbortSignal.timeout(20000)});
  const data=await r.json();if(!r.ok)throw new Error(data?.error?.message||"Stripe request failed");return data
}
async function stripeGet(endpoint){
  const key=process.env.STRIPE_SECRET_KEY;if(!key)throw new Error("ยังไม่ได้ตั้งค่า STRIPE_SECRET_KEY");
  const r=await fetch(`https://api.stripe.com/v1/${endpoint}`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(20000)});
  const data=await r.json();if(!r.ok)throw new Error(data?.error?.message||"Stripe request failed");return data
}

// Stripe requires the exact raw request body for webhook signature verification.
app.post("/api/payments/stripe-webhook",express.raw({type:"application/json"}),async(req,res)=>{
  try{
    if(!verifyStripeSignature(req.body,req.get("stripe-signature"),process.env.STRIPE_WEBHOOK_SECRET))return res.status(400).send("Invalid Stripe signature");
    const event=JSON.parse(req.body.toString("utf8")),session=event.data?.object;
    if((event.type==="checkout.session.completed"||event.type==="checkout.session.async_payment_succeeded")&&session?.payment_status==="paid"){
      if(session.metadata?.wallet_id)await paymentApi.settleSession(session);
    }
    if(event.type==='payment_intent.succeeded'&&session?.metadata?.flow==='idprom_promptpay_v1')await paymentApi.settleIntent(session);
    res.json({received:true});
  }catch(e){console.error("Stripe webhook:",e);res.status(500).send("Webhook failed")}
});
app.use('/api/saved-work',express.json({limit:"64mb"}));
app.use(express.json({limit:"64kb"}));
registerPasswordResetApi(app,{createPasswordReset,resetPassword});
// Whitelisted diagnostics never include customer photos, tokens or raw browser errors.
const checkoutDiagnosticWindow=new Map();
app.post('/api/payments/checkout-diagnostic',(req,res)=>{
 const now=Date.now(),key=req.ip;for(const [ip,entry] of checkoutDiagnosticWindow)if(now-entry.start>60000)checkoutDiagnosticWindow.delete(ip);
 if(!checkoutDiagnosticWindow.has(key)&&checkoutDiagnosticWindow.size>=10000)return res.sendStatus(429);
 const entry=checkoutDiagnosticWindow.get(key)||{start:now,count:0};checkoutDiagnosticWindow.set(key,entry);if(++entry.count>20)return res.sendStatus(429);
 const clean=value=>String(value||'').replace(/[^a-zA-Z0-9_:.\-]/g,'').slice(0,80);
 const stage=clean(req.body?.stage);if(!['refresh_wallet','save_draft','create_session','read_response','redirect'].includes(stage))return res.sendStatus(400);
 console.warn('IDPROM checkout:',JSON.stringify({event:req.body?.code==='memory_backup'?'backup_warning':'client_failure',attemptId:clean(req.body?.attemptId),stage,code:clean(req.body?.code),primaryCode:clean(req.body?.primaryCode),backupCode:clean(req.body?.backupCode),httpStatus:Number(req.body?.httpStatus)||0,packageId:clean(req.body?.packageId)}));res.sendStatus(204);
});
app.use('/api/payments/checkout',(req,res,next)=>{
 const attemptId=String(req.get('X-Checkout-Attempt')||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
 const json=res.json.bind(res);res.json=body=>{console.info('IDPROM checkout:',JSON.stringify({event:res.statusCode>=400?'server_rejected':'session_created',attemptId,status:res.statusCode,code:res.statusCode>=400?String(body?.error||'checkout_failed').slice(0,120):undefined,packageId:String(req.body?.packageId||'').slice(0,40)}));return json(body)};next();
});
// Signed-in requests always use the account wallet, including from another device.
app.use(async(req,res,next)=>{try{if(req.get('authorization')){const user=await authUser(req);if(!user)return res.status(401).json({error:'auth_required',message:'กรุณาเข้าสู่ระบบใหม่'});req.accountUser=user}next()}catch(e){next(e)}});

app.post("/api/auth/register",async(req,res)=>{try{const wid=walletId(req);if(!wid)return res.status(400).json({error:"wallet_required"});await ensureWallet(wid);const out=await registerUser(req.body?.email,req.body?.password,wid);if(!out.ok){const messages={invalid_email:"กรุณากรอกอีเมลให้ถูกต้อง",weak_password:"รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร",email_exists:"อีเมลนี้สมัครสมาชิกแล้ว กรุณาเข้าสู่ระบบ",wallet_in_use:"บัญชีนี้ถูกผูกกับสมาชิกแล้ว"};return res.status(409).json({error:out.error,message:messages[out.error]||"สมัครสมาชิกไม่สำเร็จ"})}res.json(out)}catch(e){console.error("Register:",e);res.status(500).json({error:"register_failed",message:"สมัครสมาชิกไม่สำเร็จ"})}});
// New clients request authentication alone; legacy clients still receive bundled credits.
app.post("/api/auth/login",async(req,res)=>{try{const out=await loginUser(req.body?.email,req.body?.password);if(!out.ok)return res.status(401).json({error:out.error,message:"อีเมลหรือรหัสผ่านไม่ถูกต้อง"});res.set('Cache-Control','no-store');if(req.body?.sessionOnly===true)return res.json(out);const [wallet,trial]=await Promise.all([getWallet(out.walletId),trialOptionAccess(out.walletId,trialDeviceFingerprint(req,res,out.walletId),trialNetworkFingerprint(req))]);if(!wallet)throw Error('wallet_not_found');res.json({...out,...wallet,...trial})}catch(e){console.error("Login:",e);res.status(500).json({error:"login_failed",message:"เข้าสู่ระบบไม่สำเร็จ"})}});
app.get("/api/auth/me",async(req,res)=>{res.set("Cache-Control","no-store");try{const u=req.accountUser||await authUser(req);if(!u)return res.status(401).json({error:"auth_required"});res.json({email:u.email,walletId:u.wallet_id})}catch(e){res.status(500).json({error:"auth_failed"})}});
// Payment return fallback: verify the Checkout Session directly with Stripe and
// credit the SAME wallet. This makes paid credits work even if the webhook is delayed.
// creditPaid() is idempotent by session_id, so webhook + return confirmation cannot double-credit.
app.post("/api/payments/confirm",async(req,res)=>{
  try{
    const wid=walletId(req),sessionId=String(req.body?.sessionId||"").trim();
    if(!wid||!sessionId)return res.status(400).json({error:"payment_confirmation_required"});
    const session=await stripeGet(`checkout/sessions/${encodeURIComponent(sessionId)}`);
    const out=await paymentApi.settleSession(session,wid);
    res.json({ok:true,...out,jobId:String(session.metadata?.job_id||'')});
  }catch(e){console.error("Stripe confirm:",e);const status=e.status||500;res.status(status).json({error:status<500?e.message:"payment_confirm_failed",message:e.message||"ตรวจสอบการชำระเงินไม่สำเร็จ"})}
});
app.post("/api/wallet",async(req,res)=>{const current=walletId(req);const w=current&&await getWallet(current)||await newWallet();res.json({...w,...await trialOptionAccess(w.walletId,trialDeviceFingerprint(req,res,w.walletId),trialNetworkFingerprint(req)),...await accountPolicy(req).summary(w.walletId)})});
// A credit display reads current counters without migrations or image-right repair.
app.get('/api/wallet/balance',async(req,res)=>{const started=Date.now();res.set('Cache-Control','no-store');try{
 const id=walletId(req);if(!id)return res.status(404).json({error:'wallet_not_found'});
 const data=await getWalletBalance(id,trialDeviceFingerprint(req,res,id),trialNetworkFingerprint(req));
 if(!data)return res.status(404).json({error:'wallet_not_found'});
 res.json({...data,...await accountPolicy(req).summary(id)});
}catch(error){const stage=['wallet_counter','trial_policy'].includes(error.balanceStage)?error.balanceStage:'credit_read',code=/^[A-Z0-9_]{1,32}$/.test(String(error.code||''))?String(error.code):'READ_UNAVAILABLE';console.error('Wallet balance:',JSON.stringify({stage,code,elapsedMs:Date.now()-started}));res.status(503).json({error:'wallet_balance_unavailable',stage,code,message:'ยังอ่านเครดิตไม่ได้ กรุณาลองอีกครั้ง'})}});
// Credit refreshes need balances and rights, not the account-history query.
// The default route retains history for existing account views.
app.get("/api/wallet",async(req,res)=>{res.set("Cache-Control","no-store");try{
 const id=walletId(req);if(!id)return res.status(404).json({error:"wallet_not_found"});
 const summary=req.query?.summary==='1';
 const [w,trial,history]=await Promise.all([getWallet(id),trialOptionAccess(id,trialDeviceFingerprint(req,res,id),trialNetworkFingerprint(req)),summary?undefined:walletHistory(id)]);
 if(!w)return res.status(404).json({error:"wallet_not_found"});
 res.json({...w,...trial,...await accountPolicy(req).summary(id),...(summary?{}:{history})});
}catch(e){console.error("Wallet:",e);res.status(500).json({error:"wallet_storage_failed"})}});
registerPrivateTrial(app,{walletId,getWallet,appUrl:APP_URL});
app.post("/api/promo/free199",async(req,res)=>{try{const wid=walletId(req);if(!wid)return res.status(400).json({error:"wallet_required"});const out=await redeemPromo199(wid,req.body?.code);if(!out.ok){const messages={invalid:"โค้ดไม่ถูกต้อง",used:"โค้ดนี้ถูกใช้แล้ว",wallet_used:"เครื่องนี้เคยรับเครดิตโค้ดฟรีแล้ว"};return res.status(409).json({error:out.reason,message:messages[out.reason]||"ใช้โค้ดไม่ได้"})}res.json(out)}catch(e){console.error("Free 199 promo:",e);res.status(500).json({error:"promo_failed",message:"ใช้โค้ดไม่สำเร็จ"})}});
app.post('/api/promo/redeem',async(req,res)=>{
 try{
  const user=req.accountUser||await authUser(req);if(!user)return res.status(401).json({error:'auth_required',message:'กรุณาสมัครสมาชิกหรือเข้าสู่ระบบเพื่อรับเครดิตฟรี'});
  const wid=user.wallet_id,jobId=String(req.body?.jobId||'');
  if(jobId){const job=await getAiJobResult(jobId,wid);if(!job||job.status!=='completed'||!String(job.usage_id||'').startsWith('trial_'))return res.status(403).json({error:'image_not_owned',message:'ไม่พบรูปทดลองของบัญชีนี้'})}
  const out=await redeemPromoPackage(wid,req.body?.code,jobId);
  if(!out.ok)return res.status(409).json({error:out.reason,message:out.reason==='used'?'ลิงก์นี้ถูกใช้แล้ว':'ลิงก์ไม่ถูกต้อง'});
  res.json(out);
 }catch(e){console.error('Promo redemption:',e);res.status(500).json({error:'promo_failed',message:'รับเครดิตไม่สำเร็จ กรุณาลองใหม่'})}
});
registerPackageUnlockCodeApi(app,{store:packageUnlockCodeStore,authUser});
app.post('/api/payments/checkout',(req,res)=>paymentApi.checkout(req,res));
paymentApi=registerPromptpayApi(app,{stripePost,stripeGet,ensureWallet,getAiJobResult,creditPaid,recordDownloadRefund,pendingDownloadRefunds,appUrl:APP_URL,scopeForJob:(wid,id)=>downloadPolicy.scopeForJob(wid,id),walletRights:getWallet,isUnlocked:(wid,id)=>downloadPolicy.allowed(wid,id),isPremium:(wid,id)=>downloadPolicy.premiumHair(wid,id)});
setInterval(()=>{void paymentApi.retryReconciliations().catch(error=>console.warn('IDPROM payment reconciliation:',error.code||'storage_unavailable'))},60000).unref();
// Trial identity is a signed, first-party browser cookie, independent of IP.
// Paid requests bypass this entirely; existing wallet IDs and balances stay intact.
function trialDeviceFingerprint(req,res,wid){
  const secret=process.env.TRIAL_DEVICE_SECRET||process.env.STRIPE_WEBHOOK_SECRET||process.env.STRIPE_SECRET_KEY;
  if(!secret)return null; // Fail closed for free trials only.
  const cookieName='idprom_trial_device';
  const sign=id=>crypto.createHmac('sha256',secret).update('idprom-trial-cookie-v1:'+id).digest('hex');
  const cookie=String(req.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='));
  const value=cookie?cookie.slice(cookieName.length+1):'';
  const match=/^([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(value);
  let deviceId;
  if(match){
    const expected=Buffer.from(sign(match[1]),'hex'),actual=Buffer.from(match[2],'hex');
    if(crypto.timingSafeEqual(expected,actual))deviceId=match[1];
  }
  if(!deviceId){
    // Deterministic for the initial wallet: simultaneous first requests share an ID.
    deviceId=crypto.createHmac('sha256',secret).update('idprom-trial-device-v1:'+wid).digest('hex');
  }
  res.cookie(cookieName,deviceId+'.'+sign(deviceId),{
    httpOnly:true,sameSite:'lax',secure:req.secure||APP_URL.startsWith('https://'),
    path:'/',maxAge:10*365*24*60*60*1000
  });
  return 'device_v1_'+crypto.createHash('sha256').update(deviceId).digest('hex');
}
function trialNetworkFingerprint(req){
 const secret=process.env.TRIAL_DEVICE_SECRET||process.env.STRIPE_WEBHOOK_SECRET||process.env.STRIPE_SECRET_KEY;
 if(!secret)return null;
 const traits=String(req.get('X-IDPROM-Device')||'').slice(0,1024);
 const ua=String(req.get('user-agent')||'').replace(/\d+(?:\.\d+)*/g,'#');
 return 'network_v1_'+crypto.createHmac('sha256',secret).update(JSON.stringify([req.ip,ua,traits])).digest('hex');
}
async function requireCredit(req,res,kind){
  const wid=walletId(req);
  if(!wid){res.status(402).json({error:'credit_required',message:'กรุณารีเฟรชหน้าแล้วลองใหม่'});return null}
  // Explicit private testing never consumes purchased credits or normal trial quota.
  if((kind==='ai-finish'||kind==='hairstyle')&&(isPrivateOwner(req,wid)||req.get('X-IDPROM-Private-Trial')==='1')){
    if(!hasPrivateTrial(req,wid)){res.status(403).json({error:'private_trial_inactive',message:'กรุณาเปิดลิงก์ทดสอบส่วนตัวอีกครั้ง'});return null}
    const wallet=await getWallet(wid);
    if(!wallet){res.status(403).json({error:'private_trial_inactive'});return null}
    return {usageId:'private_full_'+crypto.randomBytes(18).toString('hex'),trialPreview:false,generationRemaining:wallet.generationRemaining,hairRemaining:wallet.hairRemaining};
  }
  if(kind==='ai-finish'||kind==='hairstyle'){
   if(!downloadHairAllowed(req.body?.hairId)) {res.status(400).json({error:'invalid_hairstyle',message:'กรุณาเลือกทรงผมจากรายการปัจจุบัน'});return null}
   const chosen=PRODUCTION_HAIR_CATALOG.find(h=>h.id===req.body?.hairId);
   if(chosen&&((chosen.gender==='female'&&![16,38,39].includes(Number(chosen.id.slice(9))))||(chosen.gender==='male'&&![28,33,34].includes(Number(chosen.id.slice(9)))))&&!await accountPolicy(req).canGeneratePremiumHair(wid,String(req.body?.downloadWorkId||''))){res.status(403).json({error:'premium_hair_required',message:'ทรงเพชรปลดล็อกด้วยโปร 159 บาท หรือใช้ได้ขณะที่ยังมีสิทธิ์ดาวน์โหลดโปร 159 เหลืออยู่'});return null}
   return {usageId:'free_'+crypto.randomBytes(18).toString('hex'),trialPreview:true,generationRemaining:0,hairRemaining:0};
  }
  res.status(403).json({error:'unsupported_generation'});return null;
}

const upload=multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:20*1024*1024,files:2,fields:10,parts:12}
});
registerYoucamHairApi(app,{upload,dir,walletId,getWallet,hasPrivateTrial});

// V77: zero-per-image-cost portrait matting after AI using MODNet + ONNX Runtime WebAssembly.
// Uses onnxruntime-web instead of the native onnxruntime-node package so container builds do not need native NuGet binaries.
// The model only predicts an alpha matte. RGB pixels from the exact AI PNG are retained;
// no beauty/skin/sharpen/denoise/color pass is applied here.
const MODNET_URL="https://github.com/yakhyo/modnet/releases/download/weights/modnet_photographic.onnx";
const MODNET_PATH=path.join(dir,".cache","modnet_photographic.onnx");
let modnetSessionPromise=null;

async function getModnetSession(){
  if(modnetSessionPromise) return modnetSessionPromise;
  modnetSessionPromise=(async()=>{
    const fs=await import("fs");
    const fsp=fs.promises;
    await fsp.mkdir(path.dirname(MODNET_PATH),{recursive:true});
    if(!fs.existsSync(MODNET_PATH) || fs.statSync(MODNET_PATH).size<20*1024*1024){
      const r=await fetch(MODNET_URL,{redirect:"follow",signal:AbortSignal.timeout(90000)});
      if(!r.ok) throw new Error(`ดาวน์โหลด MODNet ไม่สำเร็จ (${r.status})`);
      const tmp=MODNET_PATH+".tmp";
      await fsp.writeFile(tmp,Buffer.from(await r.arrayBuffer()));
      await fsp.rename(tmp,MODNET_PATH);
    }
    const ort=await import("onnxruntime-web/wasm");
    ort.env.wasm.numThreads=1;
    ort.env.wasm.proxy=false;
    const modelBytes=new Uint8Array(await fsp.readFile(MODNET_PATH));
    return ort.InferenceSession.create(modelBytes,{executionProviders:["wasm"]});
  })().catch(e=>{modnetSessionPromise=null;throw e});
  return modnetSessionPromise;
}

async function modnetRemoveBackground(input,{refine=true}={}){
  const sharp=(await import("sharp")).default;
  const ort=await import("onnxruntime-web/wasm");
  const src=sharp(input,{failOn:"none"});
  const meta=await src.metadata();
  const W=meta.width,H=meta.height;
  if(!W||!H) throw new Error("อ่านขนาดภาพไม่ได้");
  const target=512;
  let nw,nh;
  if(Math.max(H,W)<target || Math.min(H,W)>target){
    if(W>=H){nh=target;nw=Math.floor(W/H*target)}else{nw=target;nh=Math.floor(H/W*target)}
  }else{nw=W;nh=H}
  nw=Math.max(32,nw-(nw%32));nh=Math.max(32,nh-(nh%32));
  const {data}=await sharp(input).removeAlpha().resize(nw,nh,{fit:"fill",kernel:"lanczos3"}).raw().toBuffer({resolveWithObject:true});
  const plane=nw*nh,tensorData=new Float32Array(3*plane);
  for(let i=0;i<plane;i++){
    tensorData[i]=(data[i*3]/255-.5)/.5;
    tensorData[plane+i]=(data[i*3+1]/255-.5)/.5;
    tensorData[2*plane+i]=(data[i*3+2]/255-.5)/.5;
  }
  const session=await getModnetSession();
  const inputName=session.inputNames[0];
  const out=await session.run({[inputName]:new ort.Tensor("float32",tensorData,[1,3,nh,nw])});
  const output=out[session.outputNames[0]];
  const matte=output.data;
  const dims=output.dims||[];
  const oh=Number(dims[dims.length-2]||nh),ow=Number(dims[dims.length-1]||nw);
  if(!Number.isFinite(ow)||!Number.isFinite(oh)||ow*oh!==matte.length){
    throw new Error(`MODNet output shape ผิดปกติ: ${JSON.stringify(dims)} / ${matte.length}`);
  }

  // V78: build the alpha image explicitly. Do not join a raw one-channel Buffer directly:
  // that path produced row-stride/banding artefacts on the WASM deployment.
  const alphaSmall=Buffer.alloc(ow*oh);
  for(let i=0;i<alphaSmall.length;i++){
    const v=Number(matte[i]);
    alphaSmall[i]=Math.max(0,Math.min(255,Math.round((Number.isFinite(v)?v:0)*255)));
  }
  // V79: resize ONLY the matte. Force the resized result back to one grayscale channel.
  // Sharp may otherwise expand a raw 1-channel image to multiple channels on some builds.
  const alphaResult=await sharp(alphaSmall,{raw:{width:ow,height:oh,channels:1}})
    .resize(W,H,{fit:"fill",kernel:"lanczos3"})
    .greyscale()
    .raw()
    .toBuffer({resolveWithObject:true});
  const alpha=alphaResult.data;
  if(alphaResult.info.width!==W || alphaResult.info.height!==H || alphaResult.info.channels!==1 || alpha.length!==W*H){
    throw new Error(`MODNet alpha resize ผิดขนาด: ${alphaResult.info.width}x${alphaResult.info.height} ch=${alphaResult.info.channels}`);
  }

  // Keep the 01-AI-RAW image at full W×H. Never resize/downsample the portrait RGB.
  // Converting the decoded pixels to sRGB only guarantees a stable 3-channel raw layout for RGBA packing.
  const rgbResult=await sharp(input).toColourspace("srgb").removeAlpha().raw().toBuffer({resolveWithObject:true});
  const rgb=rgbResult.data;
  if(rgbResult.info.width!==W || rgbResult.info.height!==H || rgbResult.info.channels!==3 || rgb.length!==W*H*3){
    throw new Error(`MODNet RGB decode ผิดขนาด: ${rgbResult.info.width}x${rgbResult.info.height} ch=${rgbResult.info.channels}`);
  }
  const refinedAlpha=refine?refineBackgroundAlpha(alpha,rgb,W,H,ow,oh):alpha;
  const rgba=Buffer.allocUnsafe(W*H*4);
  for(let i=0,j=0,k=0;i<W*H;i++,j+=3,k+=4){
    rgba[k]=rgb[j];rgba[k+1]=rgb[j+1];rgba[k+2]=rgb[j+2];rgba[k+3]=refinedAlpha[i];
  }
  return sharp(rgba,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
}

app.post("/api/remove-background",upload.single("image"),async(req,res)=>{
  try{
    if(!req.file) return res.status(400).send("กรุณาเลือกรูป");
    const data=await modnetRemoveBackground(req.file.buffer);
    res.set("Content-Type","image/png");
    res.set("X-Background-Provider","MODNet-local");
    res.set("Cache-Control","no-store");
    res.send(data);
  }catch(e){
    console.error(e);
    res.status(500).send("MODNet ลบพื้นหลังไม่สำเร็จ: "+e.message);
  }
});


// V114: separate provider engine; no Hair Donor, no mask upload, no implicit fallback.
app.get("/api/hairstyle/providers",(req,res)=>res.json(providerStatus()));
app.post("/api/hairstyle/edit",upload.single("image"),async(req,res)=>{
 let creditUse=null;
 try{
  creditUse=await requireCredit(req,res,"hairstyle");if(!creditUse)return;
  const result=await editHairstyle({portrait:req.file,hairId:req.body?.hairId,hairRootTarget:req.body?.hairRootTarget,root:dir});
  res.set("Content-Type","image/png");res.set("Cache-Control","no-store");
  res.set("X-Hairstyle-Provider",result.provider);
  res.set("X-Hairstyle-Cache",result.cache||"MISS");
  if(result.requestId)res.set("X-Request-Id",result.requestId);
  await commitCredit(creditUse.usageId);
  res.set("X-Credits-Remaining",String(creditUse.credits));
  res.send(result.png);
 }catch(error){
  if(creditUse)await refundCredit(creditUse.usageId);
  console.error("Hairstyle engine:",error.message,error.requestId||"");
  res.status(error.status>=400&&error.status<600?error.status:500).send(error.message);
 }
});

const aiFinishHandler=async(req,res)=>{
 let creditUse=req.preReservedCreditUse||null;
 try{
  const input=req.files?.image?.[0];
  try{validateProductionPortrait(input,req.body)}catch(e){return res.status(400).send(e.message)}
  if(req.files?.mask?.length)return res.status(400).send('ขั้นตอนใหม่ไม่ใช้ mask กรุณารีเฟรชหน้าเว็บ');
  if(!process.env.ARK_API_KEY)return res.status(500).send('ยังไม่ได้ตั้งค่า ARK_API_KEY บนเซิร์ฟเวอร์');
  if(!creditUse){creditUse=await requireCredit(req,res,req.body?.creditKind==='hairstyle'?'hairstyle':'ai-finish');if(!creditUse)return;}
  // Prepare the unchanged matting model while the external image generation runs.
  void getModnetSession().catch(e=>console.warn("MODNet warmup:",e.message));
  const data=await processProductionPortrait({input,fields:req.body,root:dir,removeBackground:input=>modnetRemoveBackground(input,{refine:false}),onStage:req.onPortraitStage,key:process.env.ARK_API_KEY});
  if(!req.deferCreditCommit)await commitCredit(creditUse.usageId);
  res.set('Cache-Control','no-store');res.set('X-Credits-Remaining',String(creditUse.credits));
  return res.type('image/png').send(data);
 }catch(e){
  if(creditUse)await refundCredit(creditUse.usageId);
  console.error('Combined portrait:',e.message);
  return res.status(e.status>=400&&e.status<600?e.status:500).send('ประมวลผลไม่สำเร็จ: '+e.message);
 }
};

app.post("/api/ai-finish",upload.fields([{name:"image",maxCount:1},{name:"mask",maxCount:1}]),aiFinishHandler);


// Optional, post-head outfit finishing for job-interview templates ONLY.
// Reuse one result per owned AI job + selected template to avoid repeated paid AI calls.
const jobOutfitGenerationCache=new Map();
app.post('/api/job-outfit/generate',upload.fields([{name:'image',maxCount:1},{name:'head',maxCount:1}]),async(req,res)=>{
 try{
  const wid=walletId(req),jobId=String(req.body?.jobId||''),templatePath=String(req.body?.templatePath||'');
  if(!wid||!/^job_[a-f0-9]{36}$/.test(jobId))return res.status(403).send('ไม่พบสิทธิ์งานที่สร้าง');
  if(!isJobOutfitTemplate(templatePath))return res.status(400).send('รองรับเฉพาะชุดสมัครงาน');
  const owned=await getAiJobResult(jobId,wid);
  if(!owned||owned.status!=='completed'||!owned.result?.length)return res.status(403).send('ต้องใช้รูปที่ประมวลผลสำเร็จจากบัญชีนี้');
  if(!req.files?.image?.[0]?.buffer||!req.files?.head?.[0]?.buffer||req.files.image[0].mimetype!=='image/png'||req.files.head[0].mimetype!=='image/png')return res.status(400).send('กรุณาส่งภาพ PNG หลังประมวลผล');
  const cacheKey=jobId+'|'+templatePath;
  let current=jobOutfitGenerationCache.get(cacheKey);
  if(!current){
   if(!process.env.ARK_API_KEY)return res.status(503).send('AI ใส่ชุดยังไม่พร้อม');
   current=generateJobOutfit({root:dir,templatePath,image:req.files.image[0].buffer,head:req.files.head[0].buffer,placement:req.body?.placement,headFrame:req.body?.headFrame,key:process.env.ARK_API_KEY,removeBackground:buffer=>modnetRemoveBackground(buffer,{refine:false})});
   jobOutfitGenerationCache.set(cacheKey,current);
   current.catch(()=>{if(jobOutfitGenerationCache.get(cacheKey)===current)jobOutfitGenerationCache.delete(cacheKey)});
   setTimeout(()=>{if(jobOutfitGenerationCache.get(cacheKey)===current)jobOutfitGenerationCache.delete(cacheKey)},30*60*1000).unref?.();
  }
  const result=await current;
  return res.type('png').set('Cache-Control','no-store').send(result.png);
 }catch(error){console.error('Job outfit AI:',error.code||error.message);return res.status(error.status>=400&&error.status<600?error.status:502).send('สร้างชุดสมัครงานด้วย AI ไม่สำเร็จ')}
});

const activeAiJobs=new Set();
function captureResponse(){
 let statusCode=200,headers={},payload=null,doneResolve;
 const done=new Promise(r=>doneResolve=r);
 const res={headersSent:false,status(code){statusCode=code;return this},set(k,v){headers[String(k).toLowerCase()]=String(v);return this},type(v){headers['content-type']=v;return this},json(v){payload=Buffer.from(JSON.stringify(v));this.headersSent=true;doneResolve();return this},send(v){payload=Buffer.isBuffer(v)?v:Buffer.from(String(v??''));this.headersSent=true;doneResolve();return this}};
 return {res,done,get:()=>({statusCode,headers,payload})};
}
async function runAiJob(id){
 if(activeAiJobs.has(id))return;activeAiJobs.add(id);let job=null,heartbeat=null;const started=Date.now();
 try{
  job=await claimAiJob(id);if(!job)return;
  heartbeat=setInterval(()=>{void touchAiJob(id).catch(e=>console.error('AI heartbeat:',id,e.message))},30000);heartbeat.unref?.();
  const req={body:job.fields||{},files:{image:[{buffer:job.image,originalname:job.image_name,mimetype:job.image_type}],mask:job.mask?[{buffer:job.mask,originalname:job.mask_name,mimetype:job.mask_type}]:[]},deferCreditCommit:Boolean(job.fields?.delivery_pending),preReservedCreditUse:{usageId:job.usage_id,credits:null},get(name){return String(name).toLowerCase()==='x-wallet-id'?job.wallet_id:''}};
  req.onPortraitStage=async stage=>{console.info('AI stage',id,stage,Date.now()-started+'ms');await touchAiJob(id,stage)};
  const cap=captureResponse();await aiFinishHandler(req,cap.res);await cap.done;const out=cap.get();
  if(out.statusCode>=200&&out.statusCode<300&&out.payload?.length)await completeAiJob(id,out.payload);else{await refundCredit(job.usage_id);await failAiJob(id,out.payload?.toString('utf8')||`AI processing failed (${out.statusCode})`);}
 }catch(e){console.error('AI job:',id,e);if(job?.usage_id)try{await refundCredit(job.usage_id)}catch{};try{await failAiJob(id,e.message)}catch{}}finally{clearInterval(heartbeat);console.info('AI job finished',id,Date.now()-started+'ms');activeAiJobs.delete(id)}
}
app.post('/api/ai-jobs',upload.fields([{name:'image',maxCount:1},{name:'mask',maxCount:1},{name:'originalSource',maxCount:1}]),async(req,res)=>{
 let createdJobId=null,creditUse=null,stage='validate';const started=Date.now();
 const logStage=(next,extra={})=>{stage=next;console.info('AI submit:',JSON.stringify({stage,elapsedMs:Date.now()-started,...extra}))};
 try{
  const image=req.files?.image?.[0],mask=req.files?.mask?.[0],originalSource=req.files?.originalSource?.[0];
  if(!image)return res.status(400).json({error:'image_required'});
  try{validateProductionPortrait(image,req.body);if(mask)throw Error('ขั้นตอนใหม่ไม่ใช้ mask');if(originalSource&&(!originalSource.buffer?.length||!['image/png','image/jpeg','image/webp'].includes(originalSource.mimetype)))throw Error('กรุณาใช้ต้นฉบับ PNG, JPG หรือ WEBP')}catch(e){return res.status(400).json({error:'invalid_portrait',message:e.message})}
  if(req.body?.mode==='hair-inpaint'&&!mask)return res.status(400).json({error:'mask_required'});
  const creditKind=req.body?.creditKind==='hairstyle'?'hairstyle':'ai-finish';
  logStage('reserve_credit',{kind:creditKind});
  creditUse=await requireCredit(req,res,creditKind);
  if(!creditUse){logStage('rejected',{status:res.statusCode});return}
  logStage('persist_job');
  const downloadWorkId=await downloadPolicy.beginWork(walletId(req),image.buffer,String(req.body?.downloadWorkId||''),req.get('X-IDPROM-Saved-Work')||'',originalSource?.buffer||null,{imageType:image.mimetype,originalType:originalSource?.mimetype||image.mimetype});
  const pinned=await downloadPolicy.inputForWork(walletId(req),downloadWorkId),fields={...req.body,delivery_pending:true,delivery_confirmed:false};
  // Only the immutable, owned work input reaches generation. A raw-upload proof
  // does not authorize substituting unrelated pixels beside that proof.
  if(!pinned.buffer.equals(image.buffer))delete fields.faceIdentityBox;
  const jobImage={...image,buffer:pinned.buffer,mimetype:pinned.mimetype,originalname:'portrait-input'+(pinned.mimetype==='image/jpeg'?'.jpg':pinned.mimetype==='image/webp'?'.webp':'.png')};
  const id=await createAiJob({walletId:walletId(req),usageId:creditUse.usageId,fields,image:jobImage,mask});
  createdJobId=id;await downloadPolicy.attach(walletId(req),downloadWorkId,id);
  res.status(202).json({downloadWorkId,jobId:id,status:'queued',generationRemaining:Number(creditUse.generationRemaining||0),hairRemaining:Number(creditUse.hairRemaining||0),trialPreview:Boolean(creditUse.trialPreview)});
  logStage('queued',{jobId:id});setImmediate(()=>runAiJob(id));
 }catch(e){
  // Log the failed stage before refund/storage recovery can itself wait.
  console.error('AI submit:',JSON.stringify({stage,elapsedMs:Date.now()-started,errorCode:String(e.code||'job_create_failed').replace(/[^a-zA-Z0-9_:-]/g,'').slice(0,80)}));
  if(createdJobId)try{await failAiJob(createdJobId,'work_binding_failed')}catch(cleanupError){console.error('AI binding cleanup:',cleanupError.code||'storage_error')}
  if(creditUse)await refundCredit(creditUse.usageId);console.error('Create AI job:',e);if(!res.headersSent)res.status(e.status||500).json({error:'job_create_failed',message:e.message});
 }
});
app.post('/api/ai-jobs/:id/:action',async(req,res,next)=>{
 if(!['cancel','confirm'].includes(req.params.action))return next();
 try{const result=await settleAiJobDelivery(req.params.id,walletId(req),req.params.action);res.status(result.status).json(result)}
 catch(e){console.error('AI job settlement:',e);res.status(500).json({error:'job_settlement_failed'})}
});
app.get('/api/ai-jobs/:id',async(req,res)=>{try{const j=await getAiJob(req.params.id,walletId(req));if(!j)return res.status(404).json({error:'job_not_found'});res.json(j)}catch(e){res.status(500).json({error:'job_status_failed'})}});
app.get('/api/ai-jobs/:id/result',async(req,res)=>{try{
 const wid=walletId(req),j=await getAiJobResult(req.params.id,wid);if(!j)return res.status(404).send('ไม่พบงาน');
 if(j.status==='failed')return res.status(409).send(j.error||'ประมวลผลไม่สำเร็จ');if(j.status!=='completed'||!j.result)return res.status(202).send('กำลังประมวลผล');
 const trial=!await accountPolicy(req).allowed(wid,req.params.id,{savedWorkId:req.get('X-IDPROM-Saved-Work')||''});
 res.type('png').set('Cache-Control','no-store').set('X-IDPROM-Trial',trial?'1':'0').send(j.result);
}catch(e){res.status(500).send('โหลดผลลัพธ์ไม่สำเร็จ')}});
app.post('/api/images/:id/claim',async(req,res)=>{try{
 const user=req.accountUser||await authUser(req);if(!user)return res.status(401).json({error:'auth_required'});
 const source=String(req.body?.sourceWalletId||'');
 if(source===user.wallet_id)return res.json({ok:true});
 if(!source||await walletHasAccount(source))return res.status(403).json({error:'image_account_mismatch',message:'รูปนี้อยู่ในบัญชีอื่น กรุณาเข้าสู่ระบบบัญชีเดิม'});
 await downloadPolicy.claim(source,user.wallet_id,req.params.id);
 if(!await claimTrialImage(req.params.id,source,user.wallet_id)&&!await getAiJobResult(req.params.id,user.wallet_id))return res.status(404).json({error:'trial_image_not_found'});
 res.json({ok:true});
}catch(e){res.status(500).json({error:'image_claim_failed'})}});
app.get('/api/images/:id/rights',async(req,res)=>{res.set('Cache-Control','no-store');try{
 const wid=walletId(req),policy=accountPolicy(req),options={savedWorkId:req.get('X-IDPROM-Saved-Work')||''},unlocked=await policy.allowed(wid,req.params.id,options);
 // Account-wide owner/private access is not a paid grant for this work.
 const paidDownload=await downloadPolicy.allowed(wid,req.params.id,options);
 res.json({unlocked,fullEdit:unlocked,premiumHair:await policy.premiumHair(wid,req.params.id),paidDownload});
}catch(e){res.status(e.status||503).json({error:'output_rights_unavailable'})}});
app.post('/api/images/:id/suits',async(req,res)=>{res.set('Cache-Control','no-store');try{
 const templates=Array.isArray(req.body?.templates)?req.body.templates:[];if(templates.length>2)return res.status(400).json({message:'ข้อมูลชุดไม่ถูกต้อง'});
 res.json(await accountPolicy(req).suits(walletId(req),req.params.id,templates,req.get('X-IDPROM-Saved-Work')||''));
}catch(e){res.status(e.status||503).json({message:e.message||'ตรวจสอบชุดไม่สำเร็จ กรุณาลองใหม่'})}});
app.post('/api/images/:id/unlock',async(req,res)=>{res.set('Cache-Control','no-store');try{
 if(!req.accountUser)return res.status(401).json({error:'auth_required',message:'กรุณาเข้าสู่ระบบเพื่อใช้สิทธิ์ดาวน์โหลด'});
 const policy=accountPolicy(req),out=await policy.redeem(req.accountUser.wallet_id,req.params.id,{premium:req.body?.premium===true});
 res.status(out.ok?200:402).json({...out,...await getWallet(req.accountUser.wallet_id),...await policy.summary(req.accountUser.wallet_id)});
}catch(e){res.status(e.status||503).json({error:'unlock_failed',message:'ยังปลดล็อกไม่ได้ กรุณาลองใหม่ ไม่ต้องจ่ายซ้ำ'})}});

const resumeQueuedAiJobs=async()=>{try{for(const id of await queuedAiJobs())setImmediate(()=>runAiJob(id))}catch(e){console.error('Resume AI jobs:',e)}};
setTimeout(()=>{void getModnetSession().then(()=>console.info('MODNet ready')).catch(e=>console.error('MODNet warmup:',e.message))},2000).unref();
setTimeout(resumeQueuedAiJobs,1500);
setInterval(resumeQueuedAiJobs,60000);


async function savedWorkRights(wid,project,workId='',policy=downloadPolicy){
 const ids=validateProject(project);
 if(await policy.legacyAllows(wid,workId,ids))return true;
 return policy.allowedJobs(wid,ids);
}

registerSavedWorkApi(app,{savedWorkRights,downloadPolicy,policyForRequest:accountPolicy});

// V31: return a useful response for multipart failures instead of a generic Railway upstream error.
app.use((err,req,res,next)=>{
  if(err instanceof multer.MulterError){
    console.error("Upload error:",err.code,err.message);
    return res.status(413).send("อัปโหลดภาพไม่สำเร็จ: "+err.message);
  }
  if(err){
    console.error("Request error:",err);
    if(!res.headersSent) return res.status(400).send("รับข้อมูลภาพไม่สำเร็จ: "+(err.message||"request error"));
  }
  next(err);
});

app.get("/api/health",(req,res)=>res.json({ok:true,provider:"MODNet-local",configured:true,removeBgCreditRequired:false}));
app.use(express.static(path.join(dir,"dist")));
app.use((req,res)=>res.sendFile(path.join(dir,"dist","index.html")));
app.listen(process.env.PORT||3000,()=>console.log("BG Remover ready"));
startSavedWorkRetentionCleanup();










