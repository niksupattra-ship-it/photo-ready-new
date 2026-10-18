import {registerYoucamHairApi} from './youcam-hair-api.js';
import {refineBackgroundAlpha} from './background-edge-refine.js';
import {hairRootTargetInstruction} from './hair-root-target.js';
import {registerPasswordResetApi} from './password-reset-api.js';
import {registerPromptpayApi,settlePromptpay} from './promptpay-api.js';
import {HAIRSTYLE_FIT_POLICY,HAIRSTYLE_PROPORTION_POLICY} from './hairstyle-fit-policy.js';
import {selectedHairstyleRule} from './hairstyle-rules.js';
import {validateProject,saveWork,listWorks,getWork,deleteWork,MAX_SAVED_WORKS} from './saved-work-store.js';
import express from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import {editHairstyle,providerStatus} from "./hairstyle-engine/index.js";
import { fileURLToPath } from "url";
import {newWallet,getWallet,ensureWallet,creditPaid,redeemPromo199,redeemPromoPackage,reserveCredit,reserveTrialPreview,commitCredit,refundCredit,walletHistory,imageEntitlements,creditOutputFullEdit,trialOptionAccess} from "./payment-store.js";
import {createAiJob,claimAiJob,completeAiJob,failAiJob,getAiJob,getAiJobResult,queuedAiJobs,claimTrialImage,settleAiJobDelivery} from "./job-store.js";
import {checkoutPackage} from './package-rules.js';
import {registerUser,loginUser,authUser,walletHasAccount,createPasswordReset,resetPassword} from "./auth-store.js";

import {hasPrivateTrial,registerPrivateTrial} from "./private-trial.js";

const dir=path.dirname(fileURLToPath(import.meta.url));
const app=express();
app.set("trust proxy",1);

const STRIPE_PRICE_ID=process.env.STRIPE_PRICE_ID||"price_1UKKMzJdTdkPeQBPQwtPL7kE";
const STRIPE_PRICE_ID_199=process.env.STRIPE_PRICE_ID_199||"";
const APP_URL=(process.env.APP_URL||"").replace(/\/$/,"");
function walletId(req){return req.accountUser?.wallet_id||String(req.get("X-Wallet-Id")||"").trim()}
function verifyStripeSignature(raw,header,secret){
  if(!header||!secret)return false;const parts=Object.fromEntries(header.split(",").map(x=>x.split("=",2)));
  const t=parts.t,v1=parts.v1;if(!t||!v1)return false;if(Math.abs(Date.now()/1000-Number(t))>300)return false;
  const expected=crypto.createHmac("sha256",secret).update(`${t}.${raw.toString("utf8")}`).digest("hex");
  try{return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(v1))}catch{return false}
}
async function stripePost(endpoint,params,idempotencyKey){
  const key=process.env.STRIPE_SECRET_KEY;if(!key)throw new Error("ยังไม่ได้ตั้งค่า STRIPE_SECRET_KEY");
  const body=new URLSearchParams();for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null)body.append(k,String(v));
  const r=await fetch(`https://api.stripe.com/v1/${endpoint}`,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/x-www-form-urlencoded",...(idempotencyKey?{"Idempotency-Key":idempotencyKey}:{})},body});
  const data=await r.json();if(!r.ok)throw new Error(data?.error?.message||"Stripe request failed");return data
}
async function stripeGet(endpoint){
  const key=process.env.STRIPE_SECRET_KEY;if(!key)throw new Error("ยังไม่ได้ตั้งค่า STRIPE_SECRET_KEY");
  const r=await fetch(`https://api.stripe.com/v1/${endpoint}`,{headers:{Authorization:`Bearer ${key}`}});
  const data=await r.json();if(!r.ok)throw new Error(data?.error?.message||"Stripe request failed");return data
}

// Stripe requires the exact raw request body for webhook signature verification.
app.post("/api/payments/stripe-webhook",express.raw({type:"application/json"}),async(req,res)=>{
  try{
    if(!verifyStripeSignature(req.body,req.get("stripe-signature"),process.env.STRIPE_WEBHOOK_SECRET))return res.status(400).send("Invalid Stripe signature");
    const event=JSON.parse(req.body.toString("utf8")),session=event.data?.object;
    if((event.type==="checkout.session.completed"||event.type==="checkout.session.async_payment_succeeded")&&session?.payment_status==="paid"){
      const wid=session.metadata?.wallet_id;const packageId=session.metadata?.package_id||"149";if(wid)await creditPaid(wid,session.id,packageId,session.metadata?.job_id||'');
    }
    if(event.type==='payment_intent.succeeded'&&session?.metadata?.flow==='idprom_promptpay_v1')await settlePromptpay(session,creditPaid);
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
app.post("/api/auth/login",async(req,res)=>{try{const out=await loginUser(req.body?.email,req.body?.password);if(!out.ok)return res.status(401).json({error:out.error,message:"อีเมลหรือรหัสผ่านไม่ถูกต้อง"});res.json(out)}catch(e){console.error("Login:",e);res.status(500).json({error:"login_failed",message:"เข้าสู่ระบบไม่สำเร็จ"})}});
app.get("/api/auth/me",async(req,res)=>{try{const u=await authUser(req);if(!u)return res.status(401).json({error:"auth_required"});res.json({email:u.email,walletId:u.wallet_id})}catch(e){res.status(500).json({error:"auth_failed"})}});
// Payment return fallback: verify the Checkout Session directly with Stripe and
// credit the SAME wallet. This makes paid credits work even if the webhook is delayed.
// creditPaid() is idempotent by session_id, so webhook + return confirmation cannot double-credit.
app.post("/api/payments/confirm",async(req,res)=>{
  try{
    const wid=walletId(req),sessionId=String(req.body?.sessionId||"").trim();
    if(!wid||!sessionId)return res.status(400).json({error:"payment_confirmation_required"});
    const session=await stripeGet(`checkout/sessions/${encodeURIComponent(sessionId)}`);
    if(session?.payment_status!=="paid")return res.status(409).json({error:"payment_not_paid",message:"ยังไม่พบการชำระเงินสำเร็จ"});
    if(String(session.metadata?.wallet_id||"")!==wid)return res.status(403).json({error:"wallet_mismatch",message:"รายการชำระเงินนี้ไม่ตรงกับกระเป๋าสิทธิ์ของเครื่อง"});
    const packageId=String(session.metadata?.package_id||"149");
    const out=await creditPaid(wid,session.id,packageId,session.metadata?.job_id||'');
    res.json({ok:true,...out});
  }catch(e){console.error("Stripe confirm:",e);res.status(500).json({error:"payment_confirm_failed",message:e.message||"ตรวจสอบการชำระเงินไม่สำเร็จ"})}
});
app.post("/api/wallet",async(req,res)=>{const current=walletId(req);const w=current&&await getWallet(current)||await newWallet();res.json({...w,...await trialOptionAccess(w.walletId,trialDeviceFingerprint(req,res,w.walletId),trialNetworkFingerprint(req))})});
app.get("/api/wallet",async(req,res)=>{try{const w=await getWallet(walletId(req));if(!w)return res.status(404).json({error:"wallet_not_found"});res.json({...w,...await trialOptionAccess(w.walletId,trialDeviceFingerprint(req,res,w.walletId),trialNetworkFingerprint(req)),history:await walletHistory(w.walletId)})}catch(e){console.error("Wallet:",e);res.status(500).json({error:"wallet_storage_failed"})}});
registerPrivateTrial(app,{walletId,getWallet,appUrl:APP_URL});
app.post("/api/promo/free199",async(req,res)=>{try{const wid=walletId(req);if(!wid)return res.status(400).json({error:"wallet_required"});const out=await redeemPromo199(wid,req.body?.code);if(!out.ok){const messages={invalid:"โค้ดไม่ถูกต้อง",used:"โค้ดนี้ถูกใช้แล้ว",wallet_used:"เครื่องนี้เคยรับสิทธิ์โค้ดฟรีแล้ว"};return res.status(409).json({error:out.reason,message:messages[out.reason]||"ใช้โค้ดไม่ได้"})}res.json(out)}catch(e){console.error("Free 199 promo:",e);res.status(500).json({error:"promo_failed",message:"ใช้โค้ดไม่สำเร็จ"})}});
app.post('/api/promo/redeem',async(req,res)=>{
 try{
  const user=req.accountUser||await authUser(req);if(!user)return res.status(401).json({error:'auth_required',message:'กรุณาสมัครสมาชิกหรือเข้าสู่ระบบเพื่อรับสิทธิ์ฟรี'});
  const wid=user.wallet_id,jobId=String(req.body?.jobId||'');
  if(jobId){const job=await getAiJobResult(jobId,wid);if(!job||job.status!=='completed'||!String(job.usage_id||'').startsWith('trial_'))return res.status(403).json({error:'image_not_owned',message:'ไม่พบรูปทดลองของบัญชีนี้'})}
  const out=await redeemPromoPackage(wid,req.body?.code,jobId);
  if(!out.ok)return res.status(409).json({error:out.reason,message:out.reason==='used'?'ลิงก์นี้ถูกใช้แล้ว':'ลิงก์ไม่ถูกต้อง'});
  res.json(out);
 }catch(e){console.error('Promo redemption:',e);res.status(500).json({error:'promo_failed',message:'รับสิทธิ์ไม่สำเร็จ กรุณาลองใหม่'})}
});
app.post('/api/payments/checkout',async(req,res)=>{
 try{
  const user=req.accountUser||await authUser(req);if(!user)return res.status(401).json({error:'auth_required',message:'กรุณาเข้าสู่ระบบก่อนชำระเงิน'});
  const wid=user.wallet_id;await ensureWallet(wid);const offer=checkoutPackage(req.body?.packageId||'149');
  let jobId=String(req.body?.jobId||'');
  if(jobId){const job=await getAiJobResult(jobId,wid);if(!job||job.status!=='completed'||!String(job.usage_id).startsWith('trial_')){
   if(!['159_v4','159_v5'].includes(offer.id))return res.status(400).json({error:'trial_image_required',message:'เลือกรูปทดลองที่ประมวลผลสำเร็จก่อนชำระเงิน'});
   // Credit-only purchase can continue; never unlock an invalid or foreign image.
   console.warn('IDPROM checkout:',JSON.stringify({event:'invalid_trial_ignored',packageId:offer.id}));jobId='';
  }}
  if(offer.requiresImage&&!jobId)return res.status(400).json({error:'trial_image_required',message:'ทดลองสร้างรูปก่อน แล้วเลือก 89 บาทเพื่อรับรูปนั้น'});
  const base=APP_URL||`${req.protocol}://${req.get('host')}`;
  const session=await stripePost('checkout/sessions',{
   mode:'payment','line_items[0][price_data][currency]':'thb','line_items[0][price_data][unit_amount]':offer.price*100,
   'line_items[0][price_data][product_data][name]':`IDพร้อม — ${offer.name}`,'line_items[0][quantity]':1,
   'payment_method_types[0]':'promptpay',success_url:`${base}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${base}/?payment=cancelled`,
   'metadata[wallet_id]':wid,'metadata[package_id]':offer.id,'metadata[job_id]':jobId
  });res.json({url:session.url});
 }catch(e){console.error('Stripe checkout:',e);res.status(400).json({error:e.message,message:e.message==='invalid_package'?'เลือกแพ็กเกจ 89 หรือ 159 บาท':e.message})}
});
registerPromptpayApi(app,{stripePost,stripeGet,ensureWallet,getAiJobResult,creditPaid});
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
  if((kind==='ai-finish'||kind==='hairstyle')&&req.get('X-IDPROM-Private-Trial')==='1'){
    if(!hasPrivateTrial(req,wid)){res.status(403).json({error:'private_trial_inactive',message:'กรุณาเปิดลิงก์ทดสอบส่วนตัวอีกครั้ง'});return null}
    const wallet=await getWallet(wid);
    if(!wallet){res.status(403).json({error:'private_trial_inactive'});return null}
    return {usageId:'private_full_'+crypto.randomBytes(18).toString('hex'),trialPreview:false,generationRemaining:wallet.generationRemaining,hairRemaining:wallet.hairRemaining};
  }
  const user=req.accountUser||await authUser(req);
  const r=user&&user.wallet_id===wid?await reserveCredit(wid,kind):null;
  if(r)return r;
  if(kind==='ai-finish'){
    const fingerprint=trialDeviceFingerprint(req,res,wid);
    if(fingerprint){
      const access=await trialOptionAccess(wid,fingerprint,trialNetworkFingerprint(req));
      if(access.hasPurchased&&req.get('X-IDPROM-Accept-Trial')!=='1'){res.status(409).json({error:'trial_confirmation_required',message:'เครดิตของคุณหมดแล้ว กรุณาบันทึกงานเพื่อเก็บรูปไม่มีลายน้ำ'});return null}
      const trial=await reserveTrialPreview(wid,fingerprint,trialNetworkFingerprint(req));if(trial)return trial
    }
  }
  res.status(402).json({error:'credit_required',message:'ทดลองฟรีได้เครื่องละ 2 ครั้งต่อวัน กรุณาลองใหม่วันถัดไปหรือเลือกแพ็กเกจเพื่อประมวลผลต่อ'});
  return null;
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
      const r=await fetch(MODNET_URL,{redirect:"follow"});
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

async function modnetRemoveBackground(input){
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
  const refinedAlpha=refineBackgroundAlpha(alpha,rgb,W,H,ow,oh);
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
    const inputFile=req.files?.image?.[0];
    if(!inputFile) return res.status(400).send("ไม่มีภาพสำหรับ AI finishing");
    const inpaint=req.body?.mode==="hair-inpaint";
    const hairDonor=false; // V113: obsolete donor endpoint disabled
    if(req.body?.mode==="hair-donor")return res.status(400).send("Hair Donor ถูกยกเลิกแล้ว กรุณาอัปเดตหน้าเว็บ");
    const maskFile=req.files?.mask?.[0];
    if(inpaint&&!maskFile) return res.status(400).send("ไม่มี hair inpainting mask");
    if(!inpaint&&maskFile) return res.status(400).send("ส่ง mask ได้เฉพาะโหมด hair-inpaint");
    const key=process.env.ARK_API_KEY;
    if(!key) return res.status(500).send("ยังไม่ได้ตั้งค่า ARK_API_KEY บนเซิร์ฟเวอร์");

    const hairId=req.body?.hairId||"original";
    const maleHairReplacement=/^manhair-\d{2}$/.test(hairId);
    const cleanHead=hairId==="clean-head";
    const keepOriginalHair=hairId==="original"||cleanHead;
    const newPortraitHair=keepOriginalHair&&!inpaint&&!cleanHead&&!hairDonor&&["female","male"].includes(req.body?.portraitMode);
    let hairBuf=null;
    if(!keepOriginalHair){
      const hairPath=path.join(dir,"public","assets","hair",`${hairId}.png`);
      const fs=await import("fs");
      if(!fs.existsSync(hairPath)) return res.status(400).send("ไม่พบไฟล์ทรงผมที่เลือก");
      // Use the identical hair-reference pipeline for men and women.  Do not
      // flatten male RGBA cutouts or supply a model face as an extra reference:
      // Use the original transparent PNG, as in the female path.
      hairBuf=fs.readFileSync(hairPath);
      // Hair-26 is a tucked braided updo. Its PNG contains lower cutout tails
      // that are not present in the hairstyle preview; exclude them from the
      // AI reference without changing the source asset or the reference size.
      if(hairId==='hair-26'){
        const refMeta=await sharp(hairBuf,{failOn:"error"}).metadata();
        if(refMeta.width&&refMeta.height){
          const keepHeight=Math.max(1,Math.min(refMeta.height,Math.round(refMeta.height*.70)));
          hairBuf=await sharp(hairBuf,{failOn:"error"}).ensureAlpha()
            .extract({left:0,top:0,width:refMeta.width,height:keepHeight})
            .extend({top:0,left:0,right:0,bottom:refMeta.height-keepHeight,background:{r:0,g:0,b:0,alpha:0}})
            .png().toBuffer();
        }
      }
      // Normalize only male reference for image-edit API: auxiliary RGBA
      // cutouts can trigger "invalid image file or mode for image 2".
      if(maleHairReplacement){
        hairBuf=await sharp(hairBuf,{failOn:"error"}).rotate().flatten({background:"#ffffff"}).toColourspace("srgb").png().toBuffer();
      }
    }

    // Numeric template geometry only; never accept arbitrary client prompt text.
    let necklineGuidance='';
    try{
      const profile=JSON.parse(req.body?.necklineProfile||'null');
      if(profile&&typeof profile.width==='number'&&typeof profile.depth==='number'&&Number.isFinite(profile.width)&&Number.isFinite(profile.depth)){
        const width=Math.round(Math.max(0,Math.min(.65,profile.width))*100),depth=Math.round(Math.max(0,Math.min(.65,profile.depth))*100);
        necklineGuidance=`\n\nFIXED OUTFIT NECKLINE REFERENCE: its transparent central opening has a maximum width of ${width}% of the outfit image width and a depth of ${depth}% of its height below the first paired collar edges. These describe the clothing opening, NOT human neck proportions. Preserve normal anatomy and prepare uninterrupted real neck/clavicle skin for this opening, with a modest hidden overlap margin. The temporary garment neckline must lie OUTSIDE and BELOW the required skin area. Never stretch the neck, enlarge the head or replace missing skin with white fabric. The final outfit itself must remain unchanged.`;
      }
    }catch{} // Older clients retain the complete-neck default.

    const cleanPrompt=`CLEAN HEAD MASTER FOR A PROFESSIONAL ID PHOTO. This is a one-time anatomical reconstruction before hairstyle replacement. Remove ALL existing hair from the scalp, forehead, temples and behind the ears. Create a natural BALD scalp, complete anatomically plausible ears and uncovered neck wherever hair used to obscure them. Absolutely no remaining long strands, dark hair panels, sideburns, ponytail or hairline. Keep the person's face, expression, eyes, nose, mouth, jaw, original visible skin texture, complexion and head placement unchanged. Return a neutral professional head-and-short-neck crop on a plain temporary background; no torso or shoulders. This is an intermediate layer, not the final portrait.`;
    const prompt=hairDonor?`Create a photographic hairstyle DONOR for the same adult subject in image 1. Image 2 is the hairstyle reference. Change ONLY hair to match image 2: parting, fringe, volume, length, tied or untied shape. Preserve head orientation, eye positions, size, camera framing and background exactly. Natural hair roots, hairline, fine flyaways and studio lighting. Render naturally separated individual strands with soft charcoal-black / natural deep-black color at a restrained 50% professional-black intensity, retaining source hair highlights, tonal variation and texture; no flat jet-black mass or painted gloss. Do not add hair over eyes, cheeks, ears, neck or clothing. The app extracts ONLY hair pixels from this result; face, skin, neck, ears and clothes from this AI output are discarded. Do not change the identity.`:inpaint?`EDIT ONLY THE HAIRSTYLE of the same adult person in image 1. Image 2 is a hairstyle reference ONLY. Follow the selected reference hairstyle, including parting, crown, fringe, silhouette and length. The transparent regions of the supplied mask are editable; preserve the opaque region, especially the entire face, forehead skin, eyebrows, ears, neck and uniform. Reconstruct any scalp and blue studio background previously covered by long hair as needed. Natural deep-black hair at restrained 50% professional-black intensity, preserve strand separation, root direction, subtle brown/charcoal tonal variation and specular highlights. Real photographic hair roots and fine flyaways, no hard cut lines, no rectangular patches or halos. Keep face identity and all uniform insignia unchanged. Return the same framing and scale.`:cleanHead?cleanPrompt:`PROFESSIONAL ID-PORTRAIT REFERENCE EDIT. Image 1 is the ORIGINAL FULL-QUALITY photograph of the subject. It is the sole authority for identity, face, skin, complexion, facial anatomy, expression and photographic skin texture.${keepOriginalHair?" There is no hairstyle reference: preserve the original hairstyle from Image 1.":" Image 2 is a HAIRSTYLE REFERENCE ONLY. Use it only for hairstyle geometry and appearance; never transfer its face, skin, lighting, makeup, head shape or identity."}

GOAL: create a photorealistic, fully clothed professional ID portrait of the SAME PERSON. Preserve the original head, hair, ears, face identity and real photographic skin detail. The subject wears a plain opaque white collarless top with a broad, low scoop neckline, as in an ordinary professional headshot. The application later replaces the clothing with its fixed template.

NECKLINE COMPLETION: Reconstruct a complete natural neck, both sides of the neck base, visible clavicles and the small upper-sternum area of an ordinary clothed professional portrait. Keep the original chin-to-neck proportions; lower the temporary garment neckline rather than lengthening the neck. The collarless white top has a broad rounded scoop opening, with its side edges beyond the outer jaw lines and its lowest edge below the upper sternum. No shirt collar, lapel, inner fabric insert or shoulder fabric may cross this neck/clavicle field. Both shoulders and the remaining torso stay fully covered by opaque fabric. Maintain continuous natural skin texture and original complexion throughout the opening, including the two side wedges beside the neck. No blue background, transparency or flat white patch within that skin field. Keep the entire opening in the frame with a small overlap margin for the final outfit.

GENERATION-STAGE PROPORTION: Judge head width, chin, jaw, ears and skull from Image 1. Keep the chin, eye positions, head scale and original face perspective unchanged. The neck is naturally tapered and centered beneath the jaw, with shoulders relaxed and level. The white shirt provides a complete clothed context; no jacket, tie or insignia is needed. Balance only the hairstyle silhouette around the unchanged skull. Use a medium-blue temporary studio background.

IDENTITY / FACE LOCK: preserve Image 1's exact facial structure and recognizable identity: eye shape and spacing, brows, nose, lips, cheeks, jaw, chin, ears, asymmetry, expression, age and proportions. Do not idealize, reshape, beautify or substitute facial features.

SKIN SOURCE LOCK: Image 1 is authoritative. Preserve the real skin character visible in Image 1: pores, fine texture, tiny blemishes, fine lines, under-eye texture, natural tonal variation and non-uniform surface detail. Do not smooth, airbrush, denoise, blur, wax, porcelainize, repaint, synthesize fake pores, whiten, add heavy makeup, add plastic gloss or apply a beauty filter. Keep the original complexion. At GENERATION TIME, even out uneven illumination and reduce only broad, unwanted facial/neck shadow and dark discoloration by a subtle target of approximately 15% relative to Image 1, adaptive to its actual exposure. Keep the person's natural base complexion and the same photographic lighting direction; preserve natural jaw/nose contours, realistic under-eye structure and all high-frequency skin detail, pore contrast, freckles, fine lines and sharpness. This is low-frequency light/tonal balancing, not smoothing, skin replacement, face regeneration, makeup, whitening or flattening shadows to zero. Match the GENERATED neck's color, exposure and texture continuously to the original face, with no brighter neck, hard seam or plastic surface. Do not apply the 15% again to an already corrected region.

SUBTLE NATURAL ROSY MAKEUP — GENERATION ONLY: In addition to the existing adaptive skin exposure and gentle cheek/lip tint, apply an exceptionally light, source-aware healthy rosy finish, like understated professional studio makeup. Keep the original eyebrow hairs, brow thickness, arch and position EXACTLY; only gently tidy their visible tonal definition without drawing or filling new brows. Keep the original eye shape, size, spacing, iris, eyelashes and eyelids EXACTLY; allow only a barely perceptible natural definition along existing upper lash lines, never eyeliner wings, false lashes, enlarged eyes or altered gaze. Add a faint translucent soft pink warmth to the existing cheek skin and a muted pale rosy tint to the existing lips, following each person's original skin and lip pigmentation rather than applying uniform pink. Preserve lip contour, expression, skin pores, moles, freckles, natural asymmetry and all high-frequency detail. No foundation mask, blush circles, heavy lipstick, eyeshadow, whitening, facial reshaping or new facial features. The result must still look like the exact original person photographed in balanced studio light, not a different or made-up face. Do not add the cheek/lip tint a second time when the application's existing automatic skin finish runs.

HAIR ONLY — STRICT FACE-SAFE EDIT: ${keepOriginalHair?"preserve the original hairstyle geometry from Image 1, but refine only the hair itself so its overall volume and outer silhouette look naturally balanced with the subject's existing face and skull. Do not change the hairline where it touches forehead/temples, and do not alter any face or skin pixels.":"change ONLY the hair region to follow Image 2. Match its parting, fringe, side shape, crown, length and tied/untied structure. Use Image 2 for hairstyle design only; do not copy or change strand thickness, density or hair amount to match it. Keep fine individually separated strands and a light natural hair mass; do not add bulk, overlapping layers, crown height or side fullness. Fit only the outer contour to Image 1's existing skull and ears, reducing excess puff where needed without changing strand density. The hairstyle reference has ZERO authority over face, skin, complexion, lighting or head/face geometry."}

HAIR REALISM: render photographic human hair with natural root direction, fine individually separated strands and light natural density. Keep the selected style's existing hair amount; do not add overlapping layers, fullness or mass. Use subtle flyaways only when present in Image 2. Avoid a solid hair mass, painted texture, plastic shine, artificial edge halos or excessive sharpening. Preserve believable studio-light highlights so fine strand detail remains visible.

HAIR COLOR — NATURAL PRO BLACK 50%: on HAIR PIXELS ONLY, blend toward a restrained neutral professional deep black with approximately 50% visual strength, adapting to the subject/reference natural base color; do not turn naturally light hair into black unless the chosen hairstyle calls for dark hair. Keep realistic brown/charcoal tonal variation and specular highlights; do NOT make the hair flat jet-black, crush shadow detail, tint the skin, or darken eyebrows/eyelashes.

ABSOLUTE EXCLUSION MASK INSTRUCTION: the anatomy, identity and fine skin detail of forehead, temples, eyebrows, eyelashes, eyes, nose, cheeks, ears, lips, jaw and chin are protected and must remain governed exclusively by Image 1; only the subtle low-frequency 15% illumination correction and the explicitly limited, source-aware rosy tonal finish described above are allowed. Hair balancing, strand refinement and Pro Black 50% must affect HAIR PIXELS ONLY. Do not resize, warp, retouch, recolor or regenerate the face to make it fit the hairstyle; fit the hairstyle to the unchanged face instead.

OUTPUT / ANATOMY: one centered, front-facing, fully clothed professional ID portrait with complete hair, head, ears and natural neck, wearing the plain white collarless scoop-neck top described above. Include the full neckline opening and covered shoulders. The application keeps the head, hair and visible neck pixels, removes the generated clothing and applies its original fixed uniform. Keep all visible neck skin continuous, naturally textured and matched to the unchanged face. Do not enlarge the head, lengthen the neck, raise the shoulders or add accessories. Use the medium-blue temporary solid background. Keep the existing high photographic detail without artificial sharpening or halos.

FINAL PRIORITY: (1) same identity and face from Image 1, (2) real skin texture from Image 1, (3) selected hairstyle only from Image 2 when supplied, (4) proportionate generated hair/neck, subtle 15% low-frequency shadow balance and barely perceptible rosy makeup with intact pores. Return a single coherent photographic person layer, not a face mask or pasted face.`

    // Seedream 5.0 Pro: keep the current frontend and payment flow unchanged.
    // Image 1 is always the customer's original portrait; Image 2 (when present)
    // is ONLY the selected hairstyle reference.
    // Natural finish is selected from the hairstyle category, never inferred from facial appearance.
    const selectedFinishMode=maleHairReplacement?"MALE":"FEMALE";
    const genderFinish=selectedFinishMode==="FEMALE"?`
FEMALE NATURAL STUDIO FINISH — TONAL/TEXTURE EDIT ONLY: Keep all facial geometry and identifying details unchanged. Apply balanced frontal studio-flash illumination that gently lifts broad facial shadows while preserving natural 3D contours around the nose, cheeks, jaw and chin. Reduce dark under-eye discoloration by approximately 70% while preserving the original lower-eyelid shape, under-eye volume, folds, pores and fine texture; do not erase the under-eye area or change the eyes. Make facial and neck skin tone more even and clean while retaining the person's original base complexion, pores, small marks, fine lines and realistic texture. Add only a very slight translucent healthy rosy warmth to the skin, subtle enough to remain natural and appropriate for a professional ID photograph; no whitening, foundation mask, blur or porcelain skin. Preserve the exact original eyebrow shape, position, width and arch; refine only visible eyebrow-hair definition into fine natural separated strands, never redraw or reshape the brows. Preserve the exact original lip contour and size; add a light natural rosy-pink tint only, with realistic lip texture and no glossy/heavy lipstick. Hair should be natural deep black, smooth and healthy with clearly separated fine strands, realistic directional flow and restrained photographic shine/highlights; never a flat black mass or plastic gloss. The overall effect is very light, fresh, transparent professional grooming — not obvious makeup and never a new face.`:`
MALE NATURAL STUDIO FINISH — TONAL/TEXTURE EDIT ONLY: Keep all facial geometry and identifying details unchanged. Apply balanced frontal studio-flash illumination that gently lifts broad facial shadows while preserving natural 3D contours around the nose, cheeks, jaw and chin. Make facial and neck skin slightly brighter and more even while retaining the person's original base complexion, pores, small marks, fine lines and realistic texture. Reduce dull or uneven shadowing naturally; no whitening, blur, beauty filter, foundation mask or porcelain skin. Preserve the exact original eyebrows, eyes, nose, cheeks, jaw and chin. Preserve the exact original lip contour and size; add only a very slight healthy natural pink tone to the lips, not lipstick and not glossy. Keep the result clean, natural and masculine with real photographic skin detail. Hair should remain naturally detailed with separated strands and realistic restrained highlights; never plastic or painted.`;

    let seedreamPrompt=(!inpaint&&!cleanHead&&!hairDonor)?`Use Image 1 as the PRIMARY person and ONLY identity reference. Use Image 2 ONLY as the hairstyle reference when Image 2 is supplied.

${keepOriginalHair?'':selectedHairstyleRule(hairId)}

THIS IS A LOCAL EDIT OF THE ORIGINAL PERSON, NOT A NEW PORTRAIT.

IDENTITY FIRST — HAIRSTYLE CHANGE MUST NOT CREATE ANOTHER PERSON: Treat Image 1 as the actual photograph to edit, not an inspiration for generating a similar-looking person. Retain its original facial anatomy and identifying asymmetry: eyebrow shape and height, eyelid folds, eye shape and spacing, nose bridge and nostrils, lip shape, mouth corners, cheek structure, jaw and chin. No face replacement, generic beauty-model face, age change, enlarged eyes, shortened nose, altered lips, narrower jaw or reshaped cheeks. Hair must grow around this SAME original face; never adapt the face to the hairstyle. Image 2 supplies HAIR ONLY; any skin fragments in that cutout are extraction artifacts and must never be copied into the result. Existing skin finish may affect tone and fine texture only, never facial shape or identity. Preserve the existing neck instructions.

SOURCE ORIENTATION / LEFT-RIGHT LOCK — REQUIRED: Keep Image 1 exactly as displayed. NEVER horizontally mirror, flip, swap left and right, rotate or reverse the original face or head. Viewer-left in Image 1 MUST remain viewer-left in the result; viewer-right MUST remain viewer-right. Preserve the SAME side for each eyebrow, eyelid, eye, nostril, mouth corner, ear, mole, mark, beard/moustache pattern and natural facial asymmetry. Do not symmetrize the face or copy one side onto the other. Preserve the original gaze and slight head angle. A hairstyle reference may change HAIR ONLY; its direction, face angle or lighting must never flip or reorient the subject's face. All permitted skin and cosmetic finish must remain tonal/texture edits on the SAME original side of each feature; never move, mirror or reshape facial features to achieve that finish.

ABSOLUTE FACE LOCK: Preserve the original facial structure and recognizable identity from Image 1. Do not regenerate, redraw, reshape, beautify, idealize or replace the eyebrows, eyes, eyelids, eye spacing, nose, nostrils, lips, mouth, cheeks, jawline, chin, ears, expression, facial width, facial length, asymmetry or proportions. Never make the face slimmer, younger, more symmetrical or more attractive. Image 2 has ZERO authority over the face or skin.

HAIR REMOVAL EXCEPTION TO FACE LOCK: ${newPortraitHair?'Replace ALL old source hair, including old bangs and strands overlapping forehead, temples, ear rims, cheeks and neck. Recover only small skin/brow areas previously hidden by removed hair; keep all visible facial features unchanged. The original hair is NOT protected by the identity lock.':keepOriginalHair?'No hairstyle replacement is requested; retain source hair.':'The face lock protects FACIAL ANATOMY and visible facial pixels, NOT source hair overlapping them. Remove ALL obsolete source bangs and strands over forehead, eyebrows, temples and cheeks when those areas are exposed by Image 2. Do not preserve an old diagonal fringe merely because it crosses a protected eyebrow. Recover only the previously hidden small skin/brow portions with natural continuity from the original visible brow shape, position and hairs; do not move, thicken, reshape or symmetrize the brows or alter any visible eye/face detail. Never reintroduce the removed source fringe after applying the selected hairstyle.'}

SKIN: Preserve the real skin character from Image 1: pores, fine texture, small marks, under-eye detail and natural tonal variation. Never alter facial geometry to achieve the finish. The gender-specific finish below may adjust only low-frequency illumination/color and fine cosmetic texture while preserving original identifying detail.
${genderFinish}

BALANCED NATURAL PORE DEFINITION: Keep the established gentle studio illumination, even skin tone and subtle cosmetic finish. Make the subject's EXISTING pores and fine skin microtexture slightly more visible through restrained local texture contrast, especially on the cheeks, forehead and nose. Keep the effect delicate and flattering at normal ID-photo viewing size, with softly lit skin and realistic subtle texture. Preserve the original pore size, placement and natural variation wherever visible; never enlarge or darken pores, invent coarse pores, add grain/noise, exaggerate wrinkles or blemishes, or create crunchy sharpening, halos or a gritty complexion. Where the source does not resolve individual pores, keep natural soft skin detail rather than fabricating a repeated pore pattern. No skin blurring, waxy smoothing or plastic appearance; keep all facial geometry, identity, base complexion and the current neck treatment unchanged.

SOURCE HEADWEAR REMOVAL — REQUIRED: Remove ALL source hats, nurse caps, graduation caps, helmets, head coverings and attached headwear fabric from Image 1. Do not preserve or copy headwear as part of the identity, hairstyle or protected head outline. Remove both central and side panels, white folded wings, rims, seams, straps and cast shadows caused solely by the removed headwear. The final person layer must have no source headwear or headwear-shaped white patches. ${newPortraitHair?'Fill the removed headwear field with the customer-selected completely NEW swept-back tied-up or short hairstyle. Do not reconstruct source hair or original parting. Preserve the unchanged skull, face and skin finish.':keepOriginalHair?'Preserve the original VISIBLE hairstyle, parting, color and hair texture; complete only the hair/scalp portions previously hidden by the removed headwear with plausible continuity of that same hairstyle.':'Fill the headwear-covered area with the selected Image 2 hairstyle, following its established shape, parting, texture and no-dangling-strand rules. Do not change the selected hairstyle to accommodate the source cap.'} Where headwear extended outside the intended hair/head silhouette, restore only the plain temporary background. Keep original visible face, ears, expression, head position/orientation, skin/pore/cosmetic finish and neck preparation unchanged. Removal of headwear is permitted despite the face/head identity lock; it does not authorize reshaping or redrawing any visible facial feature. Do not add replacement hats or headwear accessories.

HAIRSTYLE: ${newPortraitHair?(req.body.portraitMode==='female'?'Generate a completely NEW compact swept-back tied-up hairstyle or low bun with both ears fully exposed. Create new parting, roots and crown to fit the original skull and face. No old hairstyle, old bangs, loose side locks, dangling wisps or hair below the ears.':'Generate a completely NEW neat short hairstyle proportionate to the original skull, with both ears exposed and no old fringe or side locks.'):keepOriginalHair?'Preserve the original hairstyle from Image 1.':'Replace the ENTIRE original hairstyle with Image 2. Image 2 is a HAIRSTYLE DESIGN GUIDE, not a fixed-size overlay. Follow its haircut category, parting, designed fringe, crown structure, strand direction, intended length, side sections and tied/untied structure. Use Image 2 for hairstyle design only; do not copy its thickness, density or total hair amount. Keep fine separated strands and a light natural mass. Do not increase thickness, density, crown height, side width, overlapping layers or total hair mass. Fit the existing hairstyle outline to Image 1\'s unchanged skull by flattening or narrowing excess puff only; fitting must never add bulk. Fit the selected hairstyle around the ORIGINAL unchanged head and face. If Image 2 is shorter, tied up, exposes the ears/neck, or has no long side/back sections, COMPLETELY REMOVE the corresponding original long hair from Image 1. No old ponytail, long side panels, long strands, shoulder-length remnants, dark hair curtains or previous hairstyle may remain outside the selected hairstyle silhouette. Reconstruct only the newly exposed background, ears and neck around the removed hair. Create realistic roots, individual strands, natural density and realistic hairline shadows. Only retain stray hair explicitly present in Image 2; do not invent hanging side strands. HAIR EDGE CLEANUP: refine the complete outer hair silhouette, temples, sideburn area and hair-to-forehead transition with fine photographic strands and soft natural anti-aliased edges; remove cutout halos, jagged blue fringe, hard pasted edges and leftover source-background contamination. FACE OUTLINE CLEANUP: keep the exact original jaw, cheeks, chin and facial width, but make the skin-to-background boundary clean and naturally feathered at pixel level; do not move, redraw, slim, widen or reshape the facial contour. Never reshape the face, jaw, chin or skull to fit the hairstyle.'}

${keepOriginalHair?'':`SELECTED HAIRSTYLE / UPPER HAIRLINE EDIT ZONE — REQUIRED: Image 2 defines the hairstyle design, NOT the reference person's head dimensions or forehead outline. Image 1 alone defines the subject's skull size, facial width, ear positions and head angle. The original upper hair/skin boundary is EDITABLE in the narrow peripheral region from the TOP OF EACH EAR through the temples to the forehead hairline. Within that region, rebuild the hairline, roots and immediately adjacent forehead/scalp transition to fit the selected hairstyle naturally around the same original head. Do not freeze, trace, copy or paste Image 1's old hairline, fringe, widow's peak, wisps or hair-covered forehead edge. Remove every obsolete source hair fragment in this region and replace it with the selected reference's continuous roots or naturally exposed matching skin. This localized boundary exception takes precedence over instructions to preserve the old visible forehead edge; it does NOT authorize changing the face interior or the skull/head proportions.

ANATOMICAL HAIRSTYLE FIT — REQUIRED FOR EVERY SELECTED STYLE: Re-create the selected hairstyle as real hair growing from Image 1's unchanged head, not a pasted wig or a rigid silhouette copied from Image 2. Keep the reference's recognizable haircut, parting, sweep, bangs, tied/loose structure and intended length, while adapting HAIR ONLY to the original subject's head width, crown curvature, temple positions, ear height and camera perspective. Reference hairstyle fidelity means the same design fitted to this person, NOT the same absolute width, height, forehead cutout or reference-face proportions. Adjust the hair envelope and root placement to the original anatomy; fit the roots to the curved scalp rather than copying the reference forehead cutout. Do not copy or change strand thickness, density or hair amount to match the reference. Keep fine separated strands and light natural density across the crown and sides; do not add hair mass to balance the head width. Fit the outer contour to the subject's skull by reducing excess crown puff or side fullness only, without compressing the forehead, narrowing the face or enlarging the head. Respect the unchanged upper-ear attachment and temple positions: route short/tucked hair behind the ears where the chosen design requires it, or retain the reference's legitimate bob/long sections without shifting, shrinking or covering the ears differently to disguise a poor fit. Preserve natural scalp visibility at the chosen parting, with continuous rooted growth and no holes, detached patches or dense helmet-like edge. never resize, stretch, move or reshape the subject's face or ears to fit the hair. Keep crown volume proportionate to the original head and the selected design; no oversized dome, pinched temples, floating hair cap or abrupt ledge above the ears. The reference person's skin, eyebrows, forehead shape and cutout rim must not be transferred.

HAIRLINE SEAM BLENDING — LOCAL FINISH ONLY: Finish the hair-to-forehead and hair-to-temple junction as one continuous photograph, not a hair layer resting on top of skin. Within a very narrow root transition, gradually vary hair density from fine tapered roots into the main hair mass and gently reconcile adjacent scalp/skin tone, exposure and root shadows with the ORIGINAL forehead. Remove a visible pasted contour, dark cut line, pale rim, abrupt texture or color step and any residual cutout edge. Roots must appear embedded in the scalp with realistic strand-level separation and subtle soft contact shading, not a uniform painted shadow. Preserve the forehead's existing pores, focus and natural texture; do not smear skin or blur the hair mass. Keep the recognizable selected hairstyle design; refine root position and contour as needed for an anatomical fit. This narrowly localized blending permission overrides a prohibition on touching the immediately adjacent hairline skin ONLY; it does not permit reshaping the forehead or altering any eyebrow, eye, nose, lip, cheek, jaw, face proportions, general skin finish or neck. No additional flyaways or hanging side locks.

NATURAL ROOT / SKIN INTEGRATION: Within the already authorized upper hairline transition, anchor strands continuously to the scalp and follow the original head's curved surface. Match root lighting, color temperature, focus and photographic grain to the unchanged face. Use subtle contact shadows and short tapered root strands INSIDE the main hair shape, with irregular natural density rather than a uniform dark rim. Remove reference matte residue, doubled hair edges, hard borders, bright halos and skin-colored cutout strips. Keep the edge clean and detailed at normal viewing size, not blurred or broadly feathered; no scalp gaps or invented dangling wisps. Blend only this narrow root transition and HAIR pixels, leaving all existing inner facial features, current skin finish and neck preparation unchanged.

COMPLETE, UNBROKEN HAIR COVERAGE: Follow Image 2's actual parting, swept-back direction, bangs, crown, side sections and length for EVERY selected style. Do not substitute a braid, bun, curl, fringe or different hairstyle absent from the reference. Fill accidental missing hair, scalp gaps and notches at the forehead/temples/above the ears with continuous reference-consistent hair growth and strand direction. A naturally exposed parting or forehead present in Image 2 stays exposed. Transparency in a hairstyle cutout is a reference-background/cutout artifact, not an instruction to create holes, disconnected hair patches or a missing strip of scalp. Where the selected reference has bangs or bob side sections, retain those intended sections; do not remove them as stray hair. No doubled hairline or old hairstyle may remain beneath the replacement.

STRICT INNER-FACE BOUNDARY: Stop the editable hairline/skin-transition zone above the ORIGINAL eyebrows and along the outer temples above the ears. The eyebrows, eyes, eyelids, eye spacing, nose, nostrils, lips, mouth, cheeks, jaw and chin remain governed by Image 1 with their original position, shape, size, expression and asymmetry. Never redraw those features or copy the reference person's face. Preserve the existing skin finish and texture outside this narrow boundary zone, the original ears and the complete current neck treatment. Newly exposed skin immediately at the hairline must match the unchanged face's complexion, pores and lighting seamlessly. Keep fine natural edge strands confined to the chosen hairline, with no wide blur band, hard pasted seam, halo, invented hanging ear wisps or disconnected locks.`}


SOFT PHOTOGRAPHIC HAIR FINISH — HAIR PIXELS ONLY: After following the selected hairstyle geometry, refine its texture and color with a restrained, medium-strength natural professional-black finish. Aim for soft, airy, individually resolved fine strands, not a dense sculpted helmet or a glossy painted mass. ${keepOriginalHair?'Preserve the established parting, length, volume and silhouette;':'Preserve the selected haircut design, parting, intended length and tied/loose structure, keep fine separated strands and light natural density; do not copy the reference\'s thickness or amount; fit the outer contour by reducing excess puff only, never adding mass;'} do not add bangs or cheek-covering hair absent from the selected hairstyle. Use natural deep charcoal-black with subtle tonal separation between overlapping strands and gentle broad studio highlights; retain delicate dark-brown/charcoal variation where needed for realistic depth. Avoid crushed featureless blacks, heavy dye saturation, metallic gloss, hard stripe highlights, excessive sharpening, denoising or hair blur. At the forehead, temples, ears and outer hair contour, taper hair density through very short fine root hairs confined close to the established hairline, with softly resolved strand tips and natural root shadows. Soft texture does NOT mean adding loose locks, dangling wisps or long flyaways beside the ears, cheeks or neck. ${newPortraitHair?'Preserve only the newly generated customer-selected silhouette, never the source silhouette. Keep all fine strands inside the new main hair shape; no external wisps beside the ears or below them.':keepOriginalHair?'Preserve the original hair silhouette.':'Preserve the selected hairstyle design with its silhouette anatomically fitted to Image 1 as specified above; do not copy the reference image absolute head dimensions. When a reference is supplied, any loose side hair must be explicitly present in that reference.'} Keep the hair-to-skin transition finely detailed and gradual, without a solid dark outline, cutout seam, blue/white halo or pasted wig edge. This is strand-level softness, NOT blurring the image or feathering a wide band of facial skin. Preserve all visible facial skin, eyebrows, eyes, ears, facial geometry, the current skin/pore/cosmetic finish and neck preparation; do not recolor, smooth or redraw them as part of the hair finish. The separate source-hair removal instructions apply only when changing the hairstyle; this finish does not authorize any additional face or skin edits.

${keepOriginalHair?'':`SOURCE HAIR OCCLUSION REPLACEMENT — REQUIRED: The selected hairstyle in Image 2 replaces ALL source hair, including strands and hair panels overlapping the forehead, temples, brows or cheeks. Do not preserve source hair as part of the face-identity lock and do not blend the old hairstyle into the new one. Where Image 2 leaves the face open, remove the corresponding source fringe and cheek-covering strands; follow only Image 2 for the new fringe and side sections. Do not invent additional face-covering hair absent from Image 2. Removing old hair is permitted even where it overlaps the protected face. Reconstruct ONLY the small newly revealed skin or ear areas previously hidden by that hair, consistent with the original visible complexion, texture and unchanged facial proportions. All already visible facial features, jaw/chin contour, face orientation and the existing natural skin/cosmetic finish remain protected and unchanged. Never borrow facial features or skin from Image 2.`}

${keepOriginalHair?'':`REFERENCE SIDE-HAIR GEOMETRY — STRICT: Image 2 is the sole authority for hair beside the temples, ears, cheeks and neck, not just the crown. If Image 2 has tucked or tied side hair and exposed ears, tuck ALL side hair back as shown and leave the ears and cheek boundaries cleanly exposed. Remove source strands in those regions and do not generate any new dangling tendrils, long baby hairs, curled side locks, thin loops, wispy curtains or hanging strands in front of or below the ears. Follow Image 2's designed side-hair arrangement and intended endpoints, anatomically fitted around Image 1's unchanged temples and ears rather than copied at fixed pixel positions. Fine texture and soft roots must stay within that contour; they must not change the hairstyle or add decorative strands absent from the pattern. Preserve reference bangs or long side sections ONLY when Image 2 actually contains them. Keep face, skin finish, ears and neck anatomy unchanged except for the already authorized recovery of areas previously hidden by removed source hair.`}

${hairId==='hair-26'?`SELECTED HAIR-26 — BRAIDED OPEN-FOREHEAD UPDO: The supplied reference has its obsolete lower cutout tails removed intentionally. Do not reconstruct those tails or add loose side strands. End both side sections tucked behind the upper ears; keep the skin/background beside the lower ears, cheeks and jaw completely free of hanging hair. Match the braided crown and central part of Image 2, with BOTH eyebrows entirely unobstructed and the side hair swept back behind the ears. No diagonal source fringe may cross either eyebrow, forehead-to-brow opening or eye. The isolated PNG reference may include tapered cutout ends, residual scalp-colored matte and fine extraction wisps at its lower sides: these are NOT a request for hanging side locks or facial skin transfer. Finish the side sections smoothly tucked behind the ears; do not reproduce those cutout tails as dangling tendrils. No loose hair, baby-hair curls, wisps or single hanging strands in front of or below either ear, along the cheeks or onto the neck. For this neat updo, render fine strand texture INSIDE the main hair shape only; omit decorative flyaways entirely. Keep the original visible facial details, skin finish and complete neck unchanged.`:''}

${keepOriginalHair?'':`NO DANGLING STRANDS — ALL NON-LONG-LOOSE STYLES: Determine the selected hairstyle category from Image 2, regardless of its ID or gender. For EVERY short haircut, bob, cropped style, tied ponytail, bun, swept-back style, braided updo or other gathered hairstyle that is NOT long loose hair, do NOT create or retain separate dangling tendrils, loose side locks, long baby hairs, wispy loops or stray hanging strands beside the ears, across the cheeks or onto the neck. This rule applies to ALL such selected styles, not only hair-26. Remove obsolete source strands in these regions. Keep the intended main hair design and legitimate bob/short-cut side sections shown in Image 2, fitted to the original head; do not turn a bob into an updo, crop the main haircut or remove its designed bangs. For gathered hair, keep the sides tucked or gathered as shown. Fine strand texture must remain within the intended main hair silhouette; softness must never add external decorative wisps. Ignore thin detached extraction wisps or tapered cutout artifacts as styling instructions. For long loose hairstyles, retain the selected reference's actual long sections and length, without blending in the source hairstyle. Preserve facial details, skin/pore finish and neck preparation.`}

${newPortraitHair?`SHORT-HAIR / TIED-HAIR CLEANUP: Remove ALL original hair outside the NEW compact tied-up or short silhouette. Keep both ears, jaw, neck and shoulder fitting field fully clear. No Image 2 is supplied for this first portrait: use the customer-selected new grooming, not the original hairstyle. Preserve facial anatomy, existing skin finish and neck preparation.`:keepOriginalHair?`SHORT-HAIR / TIED-HAIR CLEANUP: When Image 2 is shorter or more tightly tied than Image 1, every original hair region extending below or outside Image 2's hairstyle silhouette is obsolete and MUST be removed. Do not preserve original long hair for identity. Identity comes from the unchanged FACE, not the old hairstyle. The final visible hair length and outer contour must follow Image 2, with natural clean separation from the ears, neck, shoulders and background. This cleanup must not alter facial geometry, facial skin, jawline or chin.`:`SHORT-HAIR / TIED-HAIR CLEANUP: When Image 2 is shorter or more tightly tied than Image 1, every original hair region extending below or outside the anatomically fitted selected hairstyle is obsolete and MUST be removed. Do not preserve original long hair for identity. Identity comes from the unchanged FACE, not the old hairstyle. The final visible hair length and outer contour must follow the Image 2 design fitted to Image 1's unchanged anatomy, with natural clean separation from the ears, neck, shoulders and background. This cleanup must not alter facial geometry, facial skin, jawline or chin.`}

NECK / CLOTHING PREPARATION: Keep the ORIGINAL jawline and chin completely unchanged. Reconstruct ONLY the missing neck and garment-fitting skin BELOW the original jaw.

NECK PROPORTION — LOCAL ANATOMY ONLY: Keep the existing natural curved neck shape and smooth transition into the clavicles. Build a centered, proportionate neck BELOW the unchanged jaw, with width and length consistent with the subject's jaw width, head size and front-facing portrait anatomy. Do not copy a pinched, foreshortened or awkwardly angled source neck. SHORT means a normal portrait neck, not a tiny, compressed or thin stalk. Keep the upper neck naturally connected below the jaw; let the lower neck widen smoothly into the clavicle base. Expand only the lower neck/clavicle fitting skin downward and sideways for overlap behind the fixed outfit; never widen, shrink, stretch or reposition the face, head or jaw to fill the outfit. Preserve the established skin texture, complexion, finish and collarless temporary-clothing treatment.
${necklineGuidance}

ORIGINAL COLLAR REMOVAL — REQUIRED: Completely remove ALL visible original shirt collar, lapels, collar points, neckline edges and original garment fabric from the entire neck/clavicle fitting zone. Do not preserve, reuse or reconstruct any part of the source collar around the neck. Where the original collar covered skin, reconstruct natural continuous neck/clavicle skin that matches Image 1.

Create a complete, natural, centered, SHORT neck with both left and right neck edges, a full neck base, both clavicle areas and a modest upper-sternum fitting area. Extend this continuous skin field sufficiently downward and sideways so the application's wide and deep open-neck clothing templates have a safe hidden overlap margin behind every neckline edge. Expand the skin coverage BELOW and BESIDE the neck rather than lengthening the anatomical neck. No blue background, transparency, white patch, old collar or gap may appear anywhere inside this fitting field.

DEEP LOWER-NECK FITTING COVERAGE — REQUIRED: Preserve the current neck width, natural short-neck proportions, curved neck base and clavicles. Extend the continuous matching skin field BELOW the clavicles over the modest upper sternum, approximately an additional one-half of the original jaw width where needed for the outfit opening. This is extra garment-fitting skin below the neck, NOT a longer anatomical neck. The lower boundary must be a broad, smooth, deeper rounded U that continues downward and sideways BEHIND the complete final outfit neckline, including its lowest central opening, with a hidden overlap margin. Do not terminate the skin at a shallow scoop immediately below the clavicles. When outfit neckline guidance is provided, fully cover that opening and put the temporary clothing boundary beyond it; do not treat the requested extra depth as permission to move or resize the head. No background-colored hole, transparent notch or gap may remain below the curved neck base within the fitting field. Place all temporary garment edges, trim, seams and white neckline rims below and outside this deeper fitting field so no temporary white band remains visible above the final outfit collar. Preserve face, skin finish, selected hair and the final outfit unchanged; keep the remaining torso fully covered by the opaque temporary top.

TEMPORARY CLOTHING — WIDE ROUND-NECK T-SHIRT ONLY: Replace the source garment around the neck with a simple plain opaque T-shirt with a very wide, low, smooth ROUND crew/scoop neckline. No collar, no lapels, no V-neck, no shirt points, no tie and no raised fabric beside the neck. Do not generate any new shirt or uniform collar, folded collar, standing collar, ribbed neckband, double neckline or collar-like fabric edge around the neck; do not copy a collar from either reference image. Keep the entire neck/clavicle fitting zone as continuous natural skin, with all temporary garment edges below and outside that zone; the application supplies the final outfit collar. The temporary T-shirt neckline must sit clearly BELOW the completed clavicle/upper-sternum fitting field and extend wider than the neck/clavicle area, leaving uninterrupted natural skin above it. Keep the chest and remaining torso fully covered by this opaque T-shirt at every stage. This is a fully clothed professional portrait; do not generate exposed breasts, nipples, cleavage, bare chest, bare torso or intimate anatomy.

Match all generated neck/clavicle skin to the original face in complexion, exposure, texture, pores and photographic grain. SHOULDER OCCLUSION RULE: the final application places a fixed suit over this result, so no generated/source shoulder, T-shirt shoulder, upper-arm or garment pixel may remain visible above or outside the final suit neckline/shoulder silhouette. Preserve only the neck and modest clavicle fitting skin needed behind the suit; keep shoulder fabric safely below the suit overlay. Do not enlarge the head, move the chin, reshape the jaw, narrow the neck unnaturally, raise the shoulders or change body proportions.

Keep the original head position, head size, camera angle and framing. Do not add earrings, jewelry or accessories.

FINAL PRIORITY: (1) original face and identity from Image 1, (2) original eyebrows/eyes/nose/mouth/jaw/chin, (3) real skin texture, (4) selected hairstyle from Image 2, (5) complete balanced neck below the unchanged jaw. If an edit would require changing the face, DO NOT perform that edit. ${keepOriginalHair?'':'The explicitly defined upper hairline transition is editable; retaining the original forehead hair edge must never override the selected hairstyle. Fit the reference HAIR DESIGN to the unchanged original head anatomy; this requirement overrides literal reference silhouette dimensions. Preserve the inner facial features while completing this narrow boundary.'}`:prompt;
    if(!keepOriginalHair&&!inpaint&&!hairDonor)seedreamPrompt += `\n\n${HAIRSTYLE_FIT_POLICY}`;
    if(!keepOriginalHair)seedreamPrompt += `\n\n${HAIRSTYLE_PROPORTION_POLICY}\n${hairRootTargetInstruction(req.body?.hairRootTarget)}`;
    // Same fitting anatomy for every hairstyle; hair length must never select
    // a different collar, skin coverage or neck reconstruction policy.
    if(!inpaint&&!cleanHead&&!hairDonor)seedreamPrompt += `

FINAL NECK FITTING POLICY — APPLIES EQUALLY TO SHORT, TIED AND LONG HAIR:
The final outfit requires the SAME continuous neck/clavicle fitting skin regardless of hairstyle. A short haircut, bob, braid or updo must receive the same complete neck preparation as long loose hair. Do not preserve the source collar or truncate the skin field just because the ears and neck are exposed by a short/tied hairstyle. Image 2 controls HAIR ONLY, never neck shape, neck length, clothing or neckline.
Preserve the original face, jawline, chin, head size, head angle and selected hairstyle. BELOW that unchanged jaw, complete the neck with natural left and right edges and a smooth widening into both clavicles and the modest upper-sternum fitting area. Keep normal short-neck anatomy; extend the lower fitting coverage rather than elongating the neck. Match the unchanged face's skin tone, light, texture and photographic grain. Recover any skin previously covered by removed hair or the original collar, with no dark shirt panels left beside the neck.
Remove the ENTIRE original high collar, white shirt collar, lapels, V-neck border, collar points and inner fabric insert from the neck/clavicle fitting field. Generate uninterrupted natural SKIN in their place. The temporary top is opaque, plain and collarless with a broad LOW ROUND scoop neckline below the required fitting field; its edges must sit below and outside the final uniform opening with a hidden overlap margin. There must be no white fabric bridge, white triangular patch, blue/transparency gap, horizontal cutoff or old collar between the chin and the final outfit neckline. The remaining torso and shoulders stay covered by opaque clothing.
Inspect the complete central and lateral fitting field under the chin before returning the image: it must be continuous skin from the jaw through the neck base down behind the final collar, including its lowest central opening. Do not use blue background or fabric to replace missing neck skin. Never change face geometry or hairstyle to fill the opening. This BELOW-JAW reconstruction requirement overrides earlier instructions to keep the original/source neck or complete neck unchanged ONLY where reconstruction or collar removal is needed; preserve the selected hair, original face and all other styling instructions. ${necklineGuidance}`;


    if(req.body?.neckInputPrepared==='1'&&!inpaint&&!cleanHead&&!hairDonor){
      seedreamPrompt=`INPUT PREPARATION / COMPLETE NECK RECONSTRUCTION: Image 1 is a deliberately prepared head reference. The neutral light-grey region below the jaw and beside the lower head is a REMOVED original collar/body, not the person's skin, a high neckline or the final crop boundary. Keep the visible original face and jaw exactly. Reconstruct a complete natural neck, widening neck base, both clavicle areas and the modest upper-sternum fitting skin from beneath that same jaw, with realistic continuous complexion and texture matched to the face. Ignore any residual source high-collar cue. Render a fully clothed portrait in a low, broad ROUND collarless temporary top, placing all fabric below the final outfit opening with overlap. Return complete uninterrupted fitting skin for EVERY hair length and style, including short hair and updos. Do not stop at the input's grey boundary, restore the old white/black collar, or leave a flat grey/blue/white patch in the neck field. Preserve the selected hairstyle and all face protections.\n\n${seedreamPrompt}`;
    }

    // Normal front-portrait request only: no bald/clean-head, inpaint, or
    // hairstyle donor route is enabled or changed by this local exception.
    if(!inpaint&&!cleanHead&&!hairDonor)seedreamPrompt += `

LOCAL EAR COMPLETION — NORMAL FRONT-FACING PORTRAIT ONLY:
Complete only missing or incomplete portions of the SUBJECT'S own left and right pinnae at the sides of the existing head. Infer a modest anatomically plausible ear shape from the visible original ear fragments, original temple/jaw contour and original head size. Fit ear height, width, attachment and perspective naturally to this subject; use brow/eye-to-nose level as a soft anatomical guide, never a rigid generic template. Keep original visible ear detail, side-specific asymmetry and left/right orientation. Do not enlarge, protrude, duplicate or symmetrize ears, move the head, widen the face or reshape the jaw to accommodate them. Never borrow ears or skin from the hairstyle reference.
Match completed ear skin to the established face/neck complexion, exposure, fine texture and photographic lighting; blend the attachment naturally without patches or halos. Edit only the missing ear field and its narrow attachment seam. Preserve all existing facial anatomy, eyebrows, eyes, nose, lips, cheeks, jaw, chin, skin finish, pores, neck geometry, clothing preparation, hairstyle, framing and other instructions EXACTLY. This exception overrides ear-preservation instructions ONLY for absent/occluded anatomical portions; it grants no permission to regenerate the face or alter intact ears.
Preserve the upper scalp hairstyle. Clear hair covering the ear outlines under the ear-to-shoulder clearance policy below, then complete only the exposed missing ear portions at their original anatomical attachments. Never create a bald scalp, move an ear, or draw an ear on top of hair. If anatomy cannot be completed without changing visible face pixels, leave those facial pixels unchanged. No earrings, jewelry or accessories.`;

    if(!inpaint&&!cleanHead&&!hairDonor)seedreamPrompt += `

PORTRAIT OUTLINE CLEANUP — LOCAL EDGE EDIT ONLY:
EAR-TO-SHOULDER CLEARANCE — REQUIRED ON BOTH SIDES: Starting at the upper attachment and outer rim of each ear, clear ALL hair from the ear outline downward along the cheeks, jaw, neck, clavicles and shoulder fitting area. Remove every fine wisp, baby hair, sideburn tail, hanging strand, side lock, loose loop and remaining long/back hair entering or bordering this lower fitting field, whether isolated or attached to the main hair. No hair may cover an ear rim, hang beside the jaw, cross neck skin, touch the shoulder fitting skin or remain as a dark panel behind this cleared ear-to-shoulder area. Do not retain lower hair merely because the original hairstyle is long. Keep the main scalp/crown hair, parting, forehead hairline and designed fringe ABOVE this clearance zone; do not shave the head or create a bald reference.
Where hair previously covered a small part of an ear or the lower skin field, recover continuous natural ear/neck/clavicle skin matching the existing face's complexion, pores, light and texture. Where removed hair lay outside the person, restore only the plain temporary background. Keep all already visible ear, cheek, jaw, chin and neck boundaries at their exact anatomical positions; no face slimming, skin erosion, enlarged ears, stretched neck, reshaped shoulders or copied reference skin. Preserve the existing below-jaw fitting coverage and opaque temporary clothing rules.
CRISP UNCONTAMINATED OUTLINE: Return sharply focused, continuous ear, face, neck and shoulder-fitting boundaries with only the minimal pixel-level photographic antialiasing needed to avoid jagged steps. No broad feathering, blurred fringe, translucent haze, white/blue/grey/green rim, residual hair color, background-color spill, dark cut line, blocky corner, rectangular patch, doubled edge or disconnected fragment. Remove foreign color contamination from the mixed boundary pixels only, matching the adjacent real skin tone; do not paint a skin-colored border, brighten the edge, sharpen pores or alter inner facial/skin texture. Do not remove natural internal shadows or genuine skin pigmentation. Detail and sharpness of the face interior remain unchanged.
The application levels a tilted portrait using a rigid rotation of the complete person layer. Preserve original facial proportions, asymmetry and perspective in this AI step; do not stretch the face, narrow the jaw, symmetrize features or invent a new frontal face. Do not mirror left and right. This lower clearance policy overrides earlier source-hair preservation, long-hair retention and hair-over-ear occlusion ONLY within the ear-to-shoulder zone defined above. It does not authorize changes to the upper hairstyle, facial features, skin finish, lighting standard or neck anatomy.`;

    // Normal portrait only. Normalize illumination without changing the
    // established skin finish, anatomy, hair, outfit or other edit routes.
    if(!inpaint&&!cleanHead&&!hairDonor)seedreamPrompt += `

CONSISTENT STUDIO LIGHT — EXPOSURE AND WHITE BALANCE ONLY:
Use one consistent softly diffused front-facing studio-light standard across portraits: neutral daylight white balance, balanced left/right illumination, clear naturally bright midtones, restrained highlights and gentle dimensional shadows. Harmonize face, ears and the complete neck/clavicle skin under this SAME light so the person belongs with the application's fixed professional studio outfit. The outfit is composed separately and is not supplied as a lighting reference: do not invent or repaint it, copy the source garment's color cast, or assume white fabric and skin must have the same brightness. Keep a natural neutral studio tone suitable for both white uniforms and dark suits.
Adapt only broad low-frequency exposure and illumination to the input: gently lift an underexposed person, gently recover an overexposed person when detail exists, and remove unwanted yellow, green, blue or magenta lighting casts. An already balanced image needs little or no correction. Use the same lighting character and tonal balance, NOT the same skin RGB values for everyone; retain each person's authentic base complexion and natural pigment variation. Never whiten darker skin, tan lighter skin, flatten all shadows, introduce clipped highlights, or make the neck brighter than the face.
Preserve the current skin finish and all existing high-frequency details: pore size and placement, freckles, moles, fine lines, fine skin grain and sharpness. No blur, smoothing, denoising, texture replacement, fake pores, oversharpening, glow, foundation mask or additional makeup. Preserve the original facial geometry, expression, hair design, clean silhouette and current neck anatomy and fitting coverage. This lighting policy supersedes instructions to retain an unwanted source-light color cast or source exposure ONLY; all identity, skin-detail, hair and neck protections remain in force. Apply the illumination correction once, not cumulatively.`;

    // An explicit customer choice, never a gender inference from the image.
    const portraitMode=req.body?.portraitMode;
    if(keepOriginalHair&&!inpaint&&!cleanHead&&!hairDonor&&['female','male'].includes(portraitMode))seedreamPrompt += `

CUSTOMER-SELECTED FIRST PORTRAIT GROOMING — HAIR ONLY:
COMPLETE NEW HAIRSTYLE — NOT SOURCE-HAIR GROOMING: Use Image 1 for the customer's FACE AND ANATOMY ONLY, not as the hairstyle design. Replace ALL original hair with newly generated photographic hair: crown, parting, roots, fringe, temple/side hair and back sections. Do not gather, comb, shorten, recolor or preserve the source hairstyle; do not blend remnants of the old hair into the new style. Remove old bangs, side locks, source hair over the skin and all old long/back hair. Return the completed new hairstyle in the SAME portrait request; never return a bald scalp or use a bald intermediate portrait.
The customer explicitly selected ${portraitMode==='female'?'FEMALE: create a completely new neat compact tied-up style or bun behind the head, with a natural balanced parting, smoothly swept-back front and sides, and no loose locks, bangs covering brows or hanging ends':'MALE: create a completely new neat natural short haircut, with a proportionate low crown and clean short sides above and behind both ears, with no source fringe, old side locks or hair covering brows'}. This choice is a hairstyle preference, not an inference of gender or permission to feminize or masculinize facial features. Fit the NEW hair roots and main silhouette to the original skull, forehead, temples and ear attachments; never resize or reshape the face to accommodate hair. Use separated realistic strands, restrained natural deep-black tonal variation and photographic shine; no thick wig, oversized crown, painted hair mass or floating pasted edge. Blend the new roots into the existing skin only within the narrow hairline seam; preserve the established sharp ear-to-shoulder clearance.
Expose both complete ear rims naturally at their original anatomical attachments. Complete only missing ear portions using the established local ear-completion policy, fitting each ear to the unchanged original head. Keep all hair behind or above the ear attachments; no hair over the pinnae or in the cleared cheek/jaw/neck/clavicle/shoulder-fitting field. No sideburn tails, wisps, dangling strands, long hair curtains, jewelry, decorative accessories or bald scalp.
This explicit NEW-HAIR policy overrides ALL earlier original-hairstyle, source-hair geometry, source fringe, source parting and original hairline-retention instructions for this first portrait ONLY. The old hairline may be replaced to root the NEW hair naturally into the SAME unchanged skull. Recover only tiny previously hidden skin/brow portions where old hair was removed, following the original visible anatomy; never redraw already visible facial features. Do not copy a reference face, reshape facial anatomy or reinterpret the selected label as a skin/makeup instruction. Preserve all visible eyebrows, eyes, nose, lips, expression, face dimensions, identifying asymmetry, visible skin microtexture, established skin finish, studio-light policy, neck proportions and complete lower-neck fitting coverage. Keep the current sharply defined uncontaminated skin outline. No change to the existing skin, neck or lighting procedure is authorized.`;

    // Normal portrait only: lower hair clearance overrides decorative flyaways.
    if(!inpaint&&!cleanHead&&!hairDonor)seedreamPrompt += `

FINAL LOWER-HAIR CLEARANCE — SAME UPPER STYLE AND ORIGINAL ANATOMY:
Keep the completed upper scalp/crown hairstyle natural, at the SAME size, parting and root placement required above. Do not redesign or enlarge it during this cleanup. Starting at the upper attachment of EACH ear, remove EVERY hanging hair pixel down beside the ears, cheeks, jaw, neck, clavicles and shoulder fitting skin, including thin translucent wisps, tiny sideburn tails and loops attached to the upper hair. Check viewer-left AND viewer-right independently. No loose strand may continue from a temple past an ear onto the cheek or neck. No long/back hair panel may remain behind this lower fitting area. Fine separated strand detail belongs INSIDE the upper hair mass; instructions for flyaways, baby hairs, natural soft roots or realistic hair-over-ear occlusion never authorize loose hair in this cleared lower zone.
Where removed hair lies OUTSIDE the original anatomical skin contour, fill only the same plain temporary background. Where it overlaps actual ear/face/neck/shoulder skin, recover ONLY the small previously occluded skin field with the adjacent true complexion and fine texture. Never erase skin, guess a narrower jaw, change face width or height, shrink ears, shorten the neck or cut away required neck/clavicle coverage. Keep ALL already visible facial anatomy and skin detail at exactly their original positions. Do not change eyebrows, eyes, nose, lips, expression, skin finish, upper hairline, light standard or neck preparation.
The ear, cheek/jaw and neck silhouette must be continuous, sharply focused and cleanly separated from the temporary background. Use only tiny photographic edge antialiasing: no broad feathering, ghost hair, dark contour line, colored halo or blurred outline. Before returning the image, inspect both ear-to-shoulder boundaries and remove remaining dangling strands; do this within the SAME existing portrait request, without an additional generation or a bald intermediate. This final rule overrides conflicting hair-preservation/flyaway instructions ONLY in the defined lower clearance zone.`;

    if(keepOriginalHair&&!inpaint&&!cleanHead&&!hairDonor)seedreamPrompt += `

FIRST PORTRAIT HAIR FINISH — OPEN FOREHEAD, NO BUN, LIGHTER VOLUME:
Keep the first-portrait grooming specified above, but do NOT create any visible bun, topknot, gathered protruding tuft, knot, ponytail, raised tied mound or accessory on top of or behind the head. For the tied-back female grooming, tuck the gathered hair discreetly behind the head so no bun or knot protrudes from the head silhouette. For the short male grooming, keep the natural low crown without a raised tuft.
Sweep the front hair naturally back or to the sides, ABOVE the natural hairline: the ENTIRE forehead skin must remain uncovered down to both eyebrows, even when Image 1 has bangs, a diagonal fringe or stray hair covering it. Remove all source fringe and stray forehead strands; do not carry them into the output. Recover only previously hidden forehead skin using the adjacent original complexion and texture. Keep the natural forehead height, skull shape and hairline position; do not raise the hairline, enlarge the forehead or change any already visible eyebrow or facial feature.
Reduce the HAIR MASS AND PUFFINESS by approximately 10% relative to the otherwise requested first-portrait style, creating a subtly lighter, less bulky hair silhouette with realistic separated strands. This is hair volume only: never scale the whole head, stretch the face, narrow the jaw, reduce scalp coverage or create thinning/bald patches. Retain the existing root blending, sharp clean ear-to-shoulder clearance, authentic face, skin finish, neck anatomy and lighting. These specific no-bun/open-forehead/lighter-volume requirements override conflicting earlier bun, fringe and upper-hair-volume instructions ONLY for this first portrait; no other edit is authorized.`;

    if(keepOriginalHair&&!inpaint&&!cleanHead&&!hairDonor)seedreamPrompt += `

FIRST PORTRAIT — CLEAN, PROPORTIONATE EXPOSED EARS ONLY:
Expose both complete ears naturally. Use every visible original ear portion as the anatomical reference: preserve its attachment, size, shape and individual asymmetry. Reconstruct only ear portions hidden by source hair or missing from view. If an ear is entirely hidden, complete a plausible ear proportionate to the SAME unchanged head, matching the other visible ear where applicable without forcing symmetry. Keep normal anatomical ear height, projection and attachment relative to the eyes, nose and jaw; never enlarge, shrink or reposition the face to accommodate an ear.
Keep the full helix, upper ear attachment, tragus area and earlobe clearly separated from the hair. End upper side hair above or behind the upper ear attachment. Do not generate sideburn tails, dangling strands, baby hairs, wisps or detached hair across either ear, in front of or below either ear, or continuing beside the jaw onto the neck. Remove obsolete source hair there. Where hair formerly obscured an ear or adjacent skin, reconstruct ONLY that locally missing ear/skin with the neighboring authentic complexion, existing fine texture and lighting. Hair removed outside the anatomical skin silhouette must become background/transparency, never a hole in an ear or missing skin.
Maintain a continuous sharply focused anatomical ear-to-jaw-to-neck outline with only narrow photographic antialiasing: no broad blur, feathered skin, dark hair fringe, jagged cutout or colored halo. Inspect BOTH sides before returning the SAME existing portrait generation. Preserve all already visible facial features, face dimensions, expression, identifying asymmetry, skin finish and pores, upper hairstyle policy, neck shape/coverage and lighting. This rule overrides conflicting hair-over-ear, flyaway or source-hair-retention wording ONLY at the ears and lower hair-clearance zone. No other edit or additional generation is authorized.`;

    if(keepOriginalHair&&!inpaint&&!cleanHead&&!hairDonor&&portraitMode==='male')seedreamPrompt += `

MALE INITIAL PORTRAIT — CONSISTENT NEAT SHORT HAIRCUT:
For EVERY customer-selected MALE first portrait, create a NEW neat professional short haircut, even if the source has long hair, thick bangs, a fringe covering the forehead/brows or an untidy style. Use the unchanged customer's skull and face to fit the cut. Keep the top short but naturally combable, lying close to the head with modest volume and individually resolved strands. Brush it gently back or slightly to one side, leaving the ENTIRE forehead and BOTH eyebrows uncovered. Do not require a central part or invent a tall quiff, pompadour, spiky crown, excessive thickness or a helmet-like wig.
Keep both sides and the nape short with a soft natural taper; no skin-shaved sides, extreme high fade, harsh undercut, shaved line or decorative cut. Expose both complete ears. Keep the upper side hair above or discreetly behind the upper ear attachment, without dangling wisps, hanging strands, long sideburns or tails beside the cheek, below the ears or onto the neck. Remove obsolete original long/back hair and source fringe; reconstruct only previously hidden skin/ear regions according to the existing clean-ear policy. Use natural deep-black/charcoal variation and restrained photographic highlights, not flat painted black or metallic gloss.
Apply this grooming within the SAME initial portrait request. Preserve the original identity, facial geometry and proportions, eyes, eyebrows, nose, mouth, expression and asymmetry; do not masculinize, slim, stretch or mirror the face. Preserve the established skin treatment, pores, complexion, neck anatomy/coverage, lighting, framing and transparency. This overrides only conflicting SOURCE hairstyle, fringe, parting or volume retention for the MALE first portrait. It does not affect female portraits or subsequent local PNG hairstyle placement.`;

    if(keepOriginalHair&&!inpaint&&!cleanHead&&!hairDonor&&portraitMode==='male'&&req.body?.creditKind!=='hairstyle')seedreamPrompt += `

MALE INITIAL PORTRAIT — WIDER, DEEPER CONTINUOUS NECK FITTING SKIN:
For this MALE FIRST PORTRAIT ONLY, complete a wider and deeper BELOW-JAW fitting field than the earlier minimum neck preparation. Keep the upper neck naturally short, centered and connected to the SAME unchanged jaw; do not lengthen or stretch the anatomical neck. Widen the LOWER neck base smoothly into both clavicle regions and both lateral skin wedges: the lower fitting skin spans roughly 1.4–1.5 times the subject's ORIGINAL jaw width where the final outfit opening requires it. Below the clavicles, continue matching modest upper-sternum fitting skin downward by approximately three-quarters of that original jaw width when needed to cover the opening. These are lower garment-overlap skin dimensions, never new face, head, upper-neck or shoulder proportions.
The complete lower boundary is a broad, smooth rounded U, continuing DOWNWARD AND SIDEWAYS behind the whole selected outfit opening, with a safe hidden skin overlap beyond both side edges and the lowest central edge. Use any provided FIXED OUTFIT NECKLINE REFERENCE to cover that opening completely; its outfit-image percentages describe clothing geometry, not anatomical neck width or length. Do not stop the skin at the former shirt edge, at a shallow scoop, or at the temporary input's grey boundary. There must be no blue/background wedge, transparency, notch, flat-colour patch or missing lateral skin inside the required fitting field.
Remove EVERY original black or white T-shirt band, crew-neck ribbing, round-neck trim, dark neck ring, collar, shirt point, lapel, seam and inner fabric insert from this below-jaw fitting field. Clothing is not protected by the face/identity lock. Reconstruct REAL continuous neck/clavicle/upper-sternum skin in place of those garment remnants, matched seamlessly to this person's existing face in complexion, exposure, fine texture, pores and photographic grain. Preserve real natural dimensional neck shadows; a leftover garment band must not be retained as a dark skin shadow. Do not cover a black collar with white fabric, paint a flat skin patch, blur the boundary, stretch source skin or manufacture canvas pixels.
Keep a plain OPAQUE temporary top with a very broad LOW ROUND neckline, with every fabric edge, neckband, trim and shoulder garment edge BELOW AND OUTSIDE this expanded skin fitting field and the final outfit opening. The remaining torso and shoulders stay fully clothed. This is modest professional garment-fitting coverage only; do not expose a bare torso, breasts, nipples or intimate anatomy. The application keeps its fixed final outfit unchanged.
Before returning this SAME existing generation, inspect the entire central and BOTH lateral neck-to-clavicle fitting field: matching photographic skin must remain continuous behind the complete final opening, with no surviving source shirt band and no missing skin. This instruction overrides earlier neck-coverage preservation or smaller-coverage limits ONLY where this expanded below-jaw fitting field requires reconstruction. Preserve the original face and facial geometry, eyes, brows, expression, ears, selected hair, existing skin finish and lighting, head scale, placement, framing and transparency rules. Do not regenerate or move the face, lengthen the neck, change the hair/ear procedure or make an additional AI request.`;

    if(keepOriginalHair&&!inpaint&&!cleanHead&&!hairDonor&&portraitMode==='male'&&req.body?.creditKind!=='hairstyle'){
      seedreamPrompt=seedreamPrompt
        .replace('FEMALE NATURAL STUDIO FINISH — TONAL/TEXTURE EDIT ONLY:','MALE INITIAL NATURAL STUDIO FINISH — TONAL/TEXTURE EDIT ONLY:')
        .replace('Apply balanced frontal studio-flash illumination that gently lifts broad facial shadows while preserving natural 3D contours around the nose, cheeks, jaw and chin.','Use broad, softly diffused frontal studio fill to remove unwanted strong facial cast shadows and uneven directional darkness. Preserve subtle three-dimensional anatomical shading around the nose, lips, cheeks, jaw and chin; follow the male facial-shadow target below without changing facial shape or base complexion.')
        .replace('no whitening, foundation mask, blur or porcelain skin.','no whitening, opaque foundation mask, whole-image blur or porcelain skin.')
        .replace(/BALANCED NATURAL PORE DEFINITION:[^\n]*/,"MALE FINE NATURAL SKIN TEXTURE: Keep the established studio illumination, exposure, complexion and subtle existing finish. Make enlarged pores visibly finer and less prominent by gently reducing their apparent dark openings and harsh local contrast; do not increase pore contrast, add sharpening, invent pores or grain, or erase all natural skin texture. Preserve stable identifying marks and all non-skin details. Follow only the restrained soft-skin target below; keep the complete neck/clavicle fitting coverage unchanged.")
        .replace('beard/moustache pattern and natural facial asymmetry','natural facial asymmetry; visible beard and moustache are removable only under the clean-shaven grooming below')
        .replace('Do not remove natural internal shadows or genuine skin pigmentation.','Preserve genuine skin pigmentation and subtle anatomical contact shading. Correct unwanted broad facial cast shadows only under the male facial-shadow target below; preserve normal neck shading and the anatomical outline.')
        .replace('Preserve the current skin finish and all existing high-frequency details: pore size and placement, freckles, moles, fine lines, fine skin grain and sharpness. No blur, smoothing, denoising, texture replacement, fake pores, oversharpening, glow, foundation mask or additional makeup.','Preserve the original base complexion, stable freckles/moles, natural fine lines, subtle skin grain and photographic focus. Permit the specified soft frontal facial-shadow correction and restrained fine-pore skin diffusion below, without adding makeup or amplifying pore contrast. Keep balanced highlights and all non-skin details sharp. No whole-image blur, waxy smoothing, blank texture, invented pores, oversharpening, glow or foundation mask.');
      seedreamPrompt += `

MALE INITIAL PORTRAIT — CLEAN-SHAVEN FACE, SOFT FRONTAL LIGHT AND NATURAL FINE-PORE SKIN:
Apply these three narrowly defined tonal/texture refinements only to this customer-selected MALE FIRST PORTRAIT, within the SAME existing image generation. Preserve the original identity, facial anatomy, chin and jaw shape, natural asymmetry, expression and pose. This grooming does not authorize face slimming, under-chin tissue removal or a new face.
FACIAL-HAIR GROOMING — CLEAN-SHAVEN: Remove ALL visible moustache and beard, including short stubble, isolated beard hairs and dark beard/moustache cast, from existing facial-hair regions on the upper lip, cheeks, chin, jaw and upper neck. Do not retain a faint stubble pattern, grey beard ring or hard beard border. Where hair obscured skin, reconstruct only that affected small skin field with the person's adjacent genuine complexion, subtle fine texture and unchanged anatomy. Blend continuously without a white patch, grey ring, smeared lip edge or painted skin. Already bare skin needs no hair removal. Never add beard, moustache or artificial hair dots. Preserve the exact lip contour, mouth corners, jaw, chin, stable moles/freckles and natural pigmentation. Scalp hair, eyebrows and eyelashes remain protected.
FACIAL-SHADOW CORRECTION — SOFT FRONTAL FILL: Remove unwanted strong directional/cast shadows and uneven dark patches across the forehead, under-eye skin, cheeks, beside the nose, around the mouth and facial jaw/chin skin using broad soft front-facing studio fill. Correct only shadowed regions as much as the actual image needs; an already evenly lit region receives little or no adjustment. Blend the face and ears into the existing neck illumination without seams, pale patches or a brighter neck. Keep the authentic base complexion, balanced overall exposure and existing highlight detail. Preserve tiny nostril, eyelid, lip-separation and other natural contact shading plus gentle three-dimensional facial gradients; do not flatten the face, bleach pigmentation, clip highlights or turn every shadow into white skin. Keep normal under-chin/neck anatomy and dimensional shading; do not remove a soft-tissue roll or reshape the jaw to erase a shadow. This frontal-fill target supersedes retention of harsh source-light direction only on the facial skin.
SOFT DIFFUSED SKIN — SMOOTH BUT PHOTOGRAPHIC: Give facial and visible neck skin a softly diffused, even, delicately matte finish. Gently reduce conspicuously enlarged pore openings, coarse microcontrast and temporary surface roughness while retaining subtle real pores, fine skin grain, normal fine lines, stable moles/freckles and natural pigmentation. Smooth skin that is already fine needs little or no extra treatment. Keep eyes, irises, eyelashes, eyebrows, lip boundaries and scalp hair sharply focused. Do not blur the whole portrait, invent repeated pores, sharpen pores, erase all texture, add opaque foundation, oily glass shine, waxy/porcelain/plastic skin or change facial geometry. Retain the established base complexion and existing eyebrow/eye/lip treatment.
Keep the previously required WIDER, DEEPER continuous lower-neck/clavicle/upper-sternum fitting field, lateral wedges, broad rounded U and hidden overlap behind the final outfit EXACTLY as specified. Preserve the existing hairstyle, complete ears, head scale, placement, framing, background/transparency procedure and final fixed outfit. Clean-shaven grooming, facial-shadow correction and natural fine-pore skin diffusion override conflicting facial-hair, source-shadow or skin-microcontrast preservation wording ONLY in those local tonal/texture regions. Preserve the chin, jaw and under-chin tissue contours. Complete these refinements in this SAME existing request; do not add a generation or another AI call.`;
    }

    if(!creditUse){creditUse=await requireCredit(req,res,"ai-finish");if(!creditUse)return;}

    // Female initial portraits only; separate from subsequent local skin controls.
    if(keepOriginalHair&&!inpaint&&!cleanHead&&!hairDonor&&req.body?.portraitMode==='female'){
      // Remove the obsolete female finish and categorical cosmetic lock BEFORE
      // sending the target finish; anatomy/identity protection remains explicit.
      seedreamPrompt=seedreamPrompt.replace(genderFinish,"");
      // Female blemish repair: do not increase pore contrast before correcting enlarged pores.
      seedreamPrompt=seedreamPrompt.replace(/BALANCED NATURAL PORE DEFINITION:[^\n]*/,"SKIN TEXTURE: Preserve fine natural skin texture without increasing pore contrast; follow the female acne/enlarged-pore correction below. All non-skin detail remains unchanged.");
      seedreamPrompt=seedreamPrompt.replace(/ABSOLUTE FACE LOCK:[^\n]*/,"ANATOMICAL FACE LOCK: Preserve source identity, facial geometry, eyes, nose, mouth shape, jaw, chin, ears, expression, facial proportions and identifying asymmetry. Cosmetic eyebrow hairs, skin exposure/colour and lip surface finish are editable ONLY as specified by the female target finish below. Do not confuse cosmetic reconstruction with changing facial anatomy. Image 2 has no authority over identity or anatomy.");
      seedreamPrompt += `

FEMALE INITIAL PORTRAIT — COMPLETE SOFT-PINK KOREAN STUDIO FINISH:
IDENTITY SOURCE, FINISH TARGET: Image 1 anchors identity, facial anatomy, original eyebrow head/tail positions, eye shape, lip contour and underlying complexion. It is NOT the target for makeup density, sparse brow coverage, dull skin, uneven lighting or existing lip colour. Deliver the complete requested finish below on EVERY female initial portrait, including a source that already wears makeup. Rebalance or replace conflicting existing cosmetic colour/texture rather than layering additional makeup onto it. Judge completion against the specified target, not whether the source already looks groomed. Make a region unchanged only when it ALREADY meets that region's target. Preserve anatomy, not deficient grooming or cosmetic finish. The style reference is the following written specification; no separate makeup-reference image is supplied in this request.
Keep facial width/height, jaw, cheeks, chin, eye/nose/mouth geometry, expression and identifying asymmetry exactly unchanged. No face slimming, elongation, symmetry filter, eye enlargement or feature replacement. Preserve the current hairstyle procedure, original eyebrow locations and natural relationship to the eyes, ear anatomy, complete neck fitting anatomy, framing and transparent-output requirements.
BROWS — REPLACE OLD BROW APPEARANCE COMPLETELY, KEEP SOURCE ANATOMICAL ANCHORS: This is a complete cosmetic eyebrow reconstruction, NOT gap filling, sharpening old brows or adding a few hairs. First replace all visible old eyebrow pigment, painted outlines, old hair texture and sparse patches within each brow's cosmetic area with continuous matching forehead skin; then render an entirely NEW full eyebrow in the SAME output image. This is an internal image-editing instruction, not a request for an extra API pass. Do not leave an old outline or an old thin eyebrow visible underneath the new hairs. Reconstruct underlying skin without a blank rectangular patch, blur halo, change to brow-bone anatomy or alteration of the adjacent forehead/eyes.
SOURCE HEAD/TAIL ANCHORS, NEW COSMETIC BROW ENVELOPE: Lock each ORIGINAL inner-head and outer-tail location and original inter-brow spacing relative to that person's eyes. Preserve the natural source angle and side-specific anatomy, but the old arch, outline, width and painted shape are NOT mandatory cosmetic contours. Between those fixed endpoints, design a full gently arched grey-brown feathered brow, with a softly rounded body and gradually tapering fine tail, proportionate to this same face. Do not move either endpoint, narrow/widen the inter-brow gap, mirror the brows or reshape the forehead/eyes. Create the new curved overlapping hairs throughout this new proportional envelope, not just inside the old sparse footprint.
OLD BROW EXCESS CLEANUP: Remove ALL original brow hairs or pigment projecting outside the newly designed brow envelope, including old upper/lower outlines, stray old tails and mismatched painted corners. Do not preserve old protruding hairs under an identity-lock rule. Restore ONLY those small vacated cosmetic areas with neighbouring forehead skin colour, illumination, pores and fine photographic grain. Blend the repair boundary invisibly into the same skin; no pale patch, blur stripe, hard eraser edge or double eyebrow. Smooth the repaired transition, not the whole forehead. Preserve genuine stable skin marks and all underlying anatomy.
NEW HAIR STYLE TARGET: A full, softly arched, natural feathered eyebrow made of many fine, individually resolved, gently curved overlapping grey-brown/taupe-brown hairs. The brow body is visibly dense and complete, with realistic narrow skin spaces between interwoven hairs, not large empty patches. At the inner head, render numerous soft upright/slightly diagonal hairs of varied lengths, naturally fanning into the body; do not leave an almost invisible head. Through the middle, overlap gently swept individual hairs following the original brow direction, giving a full softly defined upper contour and a natural diffuse lower edge. At the outer tail, gradually taper density, strand length and width into a fine natural tip at the original tail location. Individual hairs have tapered ends, natural opacity variation and no repeated uniform spacing. The example is FULL hair coverage with a soft photographic boundary, not a thin brow, faint haze or sparse hair wisps. Use a natural MUTED BROWN / soft taupe-brown brow colour, neither jet-black nor reddish/orange. Fill any remaining sparse or incomplete areas along BOTH brow bodies with fine curved overlapping hairs, so the brows look complete from head through body to tail. Render these hairs throughout the NEW proportionate cosmetic envelope specified above, retaining the original head/tail anchors, inter-brow spacing and side-specific natural direction, not the old sparse or painted footprint. Preserve airy feathered heads, visible narrow skin spaces and a gradually tapered tail; do not widen beyond that proportionate design, extend the tail beyond its original anchor, fill a flat block or draw a hard outline.
Preserve visible photographic strand detail while integrating hair roots naturally into skin. No flat base-colour stencil, solid powder block, hard perimeter, rectangular head, angular corner, ruler-straight brow, uniform parallel strokes, tattoo effect, glossy lamination or broad blurry edge. Check BOTH brows before completing: old brow appearance fully replaced; head/body/tail all complete and visibly full; original head/tail positions and spacing retained; surrounding eye shape and forehead anatomy untouched. This explicit complete replacement takes priority over any earlier instruction to keep original eyebrow pixels, preserve existing makeup, add minimally, or fill only sparse areas. Apply to female initial portraits only.
EYES — VERY SHEER PALE PINK WITH FINE CLEAR SHIMMER: Make the eyeshadow softer and less saturated than the previous visible pink finish. Use a very sheer pale neutral pink, with a barely tinted pink-beige base that leaves natural skin clearly visible. It should look clear, delicate and luminous rather than bright pink, red or orange, and must not form a saturated pink band or ring. Keep the cosmetic colour softly discernible on fair skin without washing it to white; do not deepen or redden it to contrast with darker skin. Adjust only cosmetic pigment, not facial exposure, natural complexion or anatomical eye shading.
Add a restrained fine translucent champagne/pearl micro-shimmer over the centre of the mobile upper eyelid, and a few tiny subtle light reflections near the inner corner/lower-lid highlight area, for a clear sparkling finish like delicate natural shimmer. Keep the sparkle fine and sparse, not coarse glitter, opaque silver/white paint, a bright strip, oily glare or a new global light source. Do not colour the iris or change catchlights inside the eye. This specifically permits fine cosmetic micro-shimmer despite older no-glitter restrictions, without authorizing large glitter particles or broad glossy skin.
Keep all upper-lid eyeshadow pigment inside the existing upper-eyelid fold, between the upper lash roots and the original crease; softly taper its boundary inside the fold. Do not spread pink over the socket or brow bone, raise/invent a crease or extend a dark colour patch beyond the outer corner. For hooded/monolid eyes, use the narrow natural mobile-lid area without changing the eye anatomy. Keep the lower-lash colour extremely sheer and light, without a dark/red under-eye ring. Preserve eye shape, size, lid folds, iris colour and pupil size. Keep the existing eyeliner instructions below unchanged. This change affects only eyeshadow pigment softness and tiny local cosmetic shimmer; skin/neck tone, studio light, lips/gloss, hair and other features retain their existing finish.
Draw a VERY THIN dark soft-brown eyeliner immediately along the existing upper lash roots, closely following the person's actual lid edge. At the outer corner, allow only a tiny fine tapered continuation in the natural lash-line direction, not a long lifted wing or a reshaped eye. Keep the line narrow, clean and photographic, never a thick black stripe, graphic triangle or heavy lower-lid liner. Make the upper lashes slightly LONGER than the previous short-lash finish, while keeping each lash very fine, light, separated and naturally curved, with tapered tips and visible gaps between strands. Extend existing lash directions subtly without increasing lash thickness or creating a dense strip, heavy clusters, dramatic extensions, a false-lash band, doll-eye enlargement or an invented crease. Keep lower lashes delicate. Lift excessive under-eye darkness locally while retaining true lower-lid folds, volume, fine texture and natural shading. The result must visibly carry this sheer light-pink eye finish even on a bare-faced source, but remain subtle and continuous with the original face skin. Rebalance existing eye makeup to this finish rather than stacking layers. No coarse glitter or opaque sparkle stripe, hard coloured border, harsh cutoff or blur over the eyes; only the specifically requested fine sparse cosmetic micro-shimmer is allowed.
EXPOSURE AND BARE-FACE HANDLING — REQUIRED: A bare face or dark source requires the SAME complete brow, eye, skin and lip finish as an already made-up source. Lack of source makeup is NOT permission to omit it. For an underexposed image, first reconstruct a correctly exposed, softly diffused frontal studio rendering of this SAME face: lift exposure and shadow detail sufficiently to resolve real skin and brow hairs, neutralize lighting colour casts, protect highlights and keep the subject's natural base complexion. There is no fixed 15% cap on exposure correction for an underexposed female source. Keep anatomical shading, pores and identity; do not fabricate coarse texture, wash out dark skin, or merely sharpen noise in dark pixels. Then apply the complete specified full-strand eyebrows, sheer pink eyelids/fine natural lashes, even healthy rosy skin and smooth rose-pink lips at the corrected exposure. The result must show this finish on a previously bare face. Assess eyebrow coverage and strand definition at final output resolution: both brows must have continuous, full, individually resolved hair detail, not faint unresolved smudges. Do not claim to recover detail that the source cannot resolve by inventing another person's facial features.
SKIN AND LIGHT — ADAPTIVE FRONTAL STUDIO ILLUMINATION: Evaluate the original exposure, white balance, light direction, shadow strength and highlight detail first. Preserve already correct illumination, but always bring deficient exposure, uneven tone and unwanted shadows toward a broad soft light placed in front of the face, with balanced left/right illumination and gentle fill. Reduce unwanted directional/cast shadows under the eyes, beside/under the nose, around the mouth and on the jaw/neck; lift their excessive darkness locally and blend continuously into adjacent skin. Retain just enough subtle anatomical shading for a realistic nose, cheeks, jaw and neck. Do not erase the nostril openings, lip separation, natural facial folds or genuine stable skin marks as if they were unwanted shadows. No pasted frontal-light patch, flat white face, halo, painted bright border or blown highlights.
Make skin colour and exposure more even across the full forehead, temples, both cheeks, nose, chin, ears and complete neck under this SAME frontal light. Match the neck to the face without changing its length, width or fitting coverage. Correct patchy yellow/dull areas and transient redness locally. Remove visible active pimples, temporary acne bumps, acne-related redness and temporary acne marks with a thin, naturally blended concealer-like finish matched to adjacent healthy skin. Smooth only the small acne-related surface irregularities. Reduce the apparent width, dark openings and harsh contrast of visibly enlarged pores, especially on the nose and cheeks, so they appear finer while retaining a subtle authentic photographic skin texture. Do not enhance pore contrast, invent fake pore patterns, blur the whole face or leave thick foundation patches. Clear, already smooth/fine-pored skin receives little or no extra correction. This specifically authorizes local temporary-acne removal and enlarged-pore softening despite earlier blanket requirements to preserve every skin microdetail. Preserve genuine stable moles/freckles, normal facial folds, age, identity and all facial anatomy. Do not whiten skin or increase exposure merely to hide acne/pores. Keep the existing studio illumination and skin colour policy. This local skin correction does not change eyebrow strands/design/colour, eyeshadow, eyeliner, lashes, lips or lip gloss, hair or neck geometry. Blend skin colour continuously into a visibly FAIRER-LOOKING, BRIGHT, SOFTLY DIFFUSED, EVEN complexion with a gentle healthy pink undertone across the forehead, temples, cheeks, nose, chin, ears and complete neck. Reduce uneven yellow/grey dullness, temporary blotchy redness and local colour patches so there are no abrupt tone differences between facial regions or between face and neck. The desired result is softly bright and rosy, not orange/yellow, chalk-white, grey, patchy or a red/pink mask. Assess each region first: already bright/even skin needs little or no further brightening; dull or uneven regions receive the correction needed to harmonize with adjacent healthy skin. Preserve recognizable natural pigmentation, identity and subtle three-dimensional shading; never force every person to identical white RGB values or clip highlights. Create the soft diffused impression through balanced local tone and gentle surface transitions, not a whole-image blur or bright halo. Keep the separately specified eye, brow and lip treatments unchanged. Preserve real pores, skin grain, stable moles/freckles and photographic sharpness. Use a softly luminous soft-matte finish: even and delicate, with a restrained natural sheen only on existing light-catching areas, never oily glass-skin patches or strong glossy hotspots. A very faint translucent rosy cheek warmth can blend into the same skin tone without a visible blush circle or boundary. Skin should look clear and softly lit with fine real texture, not blurred, waxy, textureless, heavily made up or oversharpened.
LIPS — MUTED PEACH-ROSE / SOFT CORAL-PINK COLOUR: Use a softly muted warm PEACH-ROSE lip colour with a slightly more noticeable CORAL-PINK undertone than before, just a small increase in pink warmth while retaining natural peach-pink colour. Avoid vivid cool pink, fuchsia, magenta, purple-rose, strong red, orange lipstick or brown/nude-grey lips. Aim for low-to-moderate saturation and natural colour depth, not a fluorescent pink band. This warm muted peach-rose colour replaces previous rose-pink lip colour wording for female portraits only; it does not change the face/cheek complexion, light or skin finish.
Preserve the exact original lip shape, size, asymmetry, outline, expression, mouth separation, anatomical shading and fine lip-line texture. Before tinting, assess conflicting pre-existing lipstick and patchy old colour, then rebalance ONLY that cosmetic pigment so it does not overpower the target shade. Do not brighten or bleach the lip base, change lip exposure, flatten shadows, add a pale foundation or wash out colour on a bright/fair portrait. Do not deepen or redden the shade on darker skin. Keep a gently visible muted peach-rose body with slightly richer colour toward the inner lips and a softly fading edge strictly within the original boundary. The colour should remain natural and softly present on different complexions without a strong pink cast, opaque pasted fill or an overlined rim.
For these female initial portraits only, this glossy lip finish overrides earlier satin/soft-matte, tiny-sheen-only and no-gloss lip restrictions, while all skin and face-lighting rules remain unchanged. Change the lip finish to a natural moisturized GLOSS: add delicate clear specular reflections following the original lip curvature, especially near the centre of the lower lip, with restrained small highlights on the upper lip where appropriate. The lips should visibly look glossy and hydrated while keeping fine natural lip texture and the original lip shape/size. Do not enlarge the lips, add an opaque white highlight stripe, create plastic/mirror glare or alter face exposure or studio lighting. Gently reduce superficial flakes and temporary patchiness only where present, retaining fine natural creases. Do not alter surrounding skin, forehead, cheeks, face/neck exposure, white balance, studio lighting, eyes, brows, hair, neck anatomy or any other detail. All edits occur within the same existing female portrait generation; no extra request or post-processing system is introduced.
LOWER-HAIR AND NECK CLEANUP — LOCAL REPAIR OF RESIDUE, NOT NECK RESHAPING: Inspect BOTH sides from the lower ear attachments along the original jaw/neck contour to the clavicles and shoulder-fitting boundary. Remove obsolete lower source hair, detached strands, thin slivers and residual dark hair panels. Also remove hair-coloured staining, artificial black outlines, dark cutout/matte fringes, straight dark seams and patchy discoloration left by removal, including mixed edge pixels that still contain old hair/background colour. Do not leave a black/brown contour around the neck as a substitute for a clean anatomical edge.
Where obsolete hair or removal residue lies INSIDE the true anatomical skin contour, reconstruct only that affected small skin field with the adjacent genuine neck skin colour, fine texture and existing studio illumination. Blend the repaired colour/texture continuously into surrounding neck skin, without a painted strip, pale patch, abrupt transition or broad blur. Where it lies OUTSIDE the true person contour, return transparency, not dark RGB residue, background-coloured pixels or a skin-coloured extension. Keep the ear-to-jaw-to-neck silhouette continuous and precisely at the original anatomical contour, with narrow photographic antialiasing only. Do not erase skin, notch the ears, narrow the neck, shorten its complete fitting coverage, reshape shoulders or create a fuzzy edge.
Distinguish genuine anatomical neck shading from removal artifacts: retain soft continuous under-chin/side-neck dimensional shadows, normal folds and stable moles/pigmentation. Correct only demonstrably obsolete hair contamination, artificial edge/seam darkness or temporary patchy removal residue; do not flatten every dark neck region, whiten the neck or brighten it above the face. Keep the already specified overall light, skin finish, face identity, cosmetic eye/brow/lip treatment, upper hairstyle and full neck/clavicle geometry unchanged. This local residue cleanup supersedes generic preservation wording only for those artifacts; it does not authorize a new face/skin/light finish.
For this FEMALE FIRST PORTRAIT only, this complete target-finish instruction overrides earlier instructions to preserve existing makeup, make only barely perceptible corrections, avoid a full finish, preserve sparse brow texture/footprint, fill only gaps, or skip a region because the source already wears makeup. It authorizes new fuller individual-hair brows with fixed original head/tail anchors and locally repaired old-brow excess, sheer pink eyelids and fine natural lashes, clearly even bright rosy skin across forehead/face/neck, temporary-blemish correction, adaptive frontal studio light, and smooth natural muted peach-rose/coral-pink lips with restrained hydrated gloss. Do not interpret identity preservation as cosmetic-finish preservation. Do not change identity, facial geometry, hairstyle procedure, ears, neck anatomy/coverage or output alpha. This policy does not apply to male portraits, later hair replacement, inpaint or clean-head routes.
FEMALE FINISH COMPLETENESS CHECK — WITHIN THIS SAME IMAGE REQUEST: Before returning, inspect viewer-left and viewer-right brows separately at final output resolution: each must contain the specified full, individually resolved taupe-brown feathered hairs from its original head anchor through its new proportionate body to its original tapered tail anchor, with no sparse untreated patches, blank erased brows or old painted outline. Check BOTH eyes for the specified sheer pale-pink mobile-lid finish, fine sparse micro-shimmer, very thin soft-brown upper liner and fine natural separated lashes. Check the full face/ears/neck for the established even softly bright rosy studio finish and the original lip shape for the specified muted peach-rose/coral-pink colour with hydrated gloss. Complete any omitted cosmetic region within this SAME existing generation; an untreated source copy, background removal alone or a skin-only finish is not the completed target. If a region already meets its target, retain it rather than adding another layer or making it darker/heavier. This is a completion check, not permission to increase makeup intensity, move brow anchors, change facial anatomy, redesign the hair, alter ear/neck fitting coverage or request another image.`;
    }

    // Every female first portrait uses ONE cosmetic policy, including normally
    // exposed and already made-up sources. All other routes stay unchanged.
    if(keepOriginalHair&&!inpaint&&!cleanHead&&!hairDonor&&portraitMode==='female'){
      seedreamPrompt=seedreamPrompt
        .replace('eyebrow shape and height, eyelid folds','original eyebrow head/tail anchors and brow-bone anatomy, eyelid folds')
        .replace('original eyebrows/eyes/nose/mouth/jaw/chin','original eyebrow anchors and eye/nose/mouth/jaw/chin anatomy')
        .replace('If an edit would require changing the face, DO NOT perform that edit.','If an edit would require changing facial anatomy, DO NOT perform that edit. Complete the specified female cosmetic and skin finish on that unchanged anatomy.')
        .replace('Preserve the current skin finish and all existing high-frequency details: pore size and placement, freckles, moles, fine lines, fine skin grain and sharpness. No blur, smoothing, denoising, texture replacement, fake pores, oversharpening, glow, foundation mask or additional makeup.','Preserve the specified female skin finish, genuine stable freckles/moles, normal fine lines, subtle skin grain and photographic sharpness. Permit only its explicitly requested temporary-blemish correction, enlarged-pore softening and natural cosmetics. No whole-face blur, waxy smoothing, invented pore texture, oversharpening, glow or thick foundation mask.')
        .replace('No change to the existing skin, neck or lighting procedure is authorized.','This hair-only rule preserves the separately specified female skin and lighting finish and the complete existing neck procedure.')
        .replace('Recover only tiny previously hidden skin/brow portions where old hair was removed, following the original visible anatomy; never redraw already visible facial features.','During this HAIR operation, recover only tiny previously hidden skin/brow portions where old hair was removed, following the original anatomy. The separate female cosmetic finish below may reconstruct brow hairs within its fixed anatomical anchors; never redraw eye/nose/mouth geometry.')
        .replace('Preserve all visible eyebrows, eyes, nose, lips, expression, face dimensions, identifying asymmetry, visible skin microtexture, established skin finish, studio-light policy, neck proportions and complete lower-neck fitting coverage.','During this HAIR operation, preserve original eyebrow head/tail anchors and eye/nose/lip anatomy, expression, face dimensions, identifying asymmetry, the separately specified female cosmetic/skin finish, studio-light policy, neck proportions and complete lower-neck fitting coverage.')
        .replace('Do not change eyebrows, eyes, nose, lips, expression, skin finish, upper hairline, light standard or neck preparation.','During this lower-hair cleanup, preserve the completed female cosmetic finish, original eyebrow anchors and eye/nose/lip anatomy, expression, upper hairline, light standard and neck preparation.')
        .replace('do not raise the hairline, enlarge the forehead or change any already visible eyebrow or facial feature.','do not raise the hairline, enlarge the forehead, move eyebrow anchors or change facial anatomy. Apply the separately specified female cosmetic brow finish at those unchanged anchors.')
        .replace('even healthy rosy skin and smooth rose-pink lips at the corrected exposure','even healthy rosy skin and naturally glossy muted peach-rose/coral-pink lips at the corrected exposure');
    }

    // Only measured, corrected uploads have already-normalized input lighting.
    if(req.body?.portraitInputCorrection==='low-light-v1'&&keepOriginalHair&&!inpaint&&!cleanHead&&!hairDonor&&portraitMode==='female'){
      seedreamPrompt=seedreamPrompt.replace('For an underexposed image, first reconstruct a correctly exposed, softly diffused frontal studio rendering of this SAME face: lift exposure and shadow detail sufficiently to resolve real skin and brow hairs, neutralize lighting colour casts, protect highlights and keep the subject\'s natural base complexion. There is no fixed 15% cap on exposure correction for an underexposed female source.','The supplied photograph already has a bounded exposure/white-balance normalization. Assess its CURRENT pixels: correct only remaining underexposure or lighting cast, protect highlights and preserve the subject\'s natural base complexion. Do not repeat the input normalization, add a fixed exposure lift or whiten already balanced skin.');
      seedreamPrompt=`MEASURED INPUT LIGHTING PREPARATION — SAME FEMALE PORTRAIT TARGET:\nImage 1 is the SAME original person's photograph with only a bounded exposure/white-balance normalization already applied before upload. It remains the sole identity and anatomical reference; it is not a different face or a cosmetic reference. Keep its CURRENT balanced exposure as the starting point. Do not undo the normalization, restore the old yellow/green cast, repeat an exposure multiplier or add whitening. Apply the existing complete female finish below once, correcting only any remaining deficient areas. Keep the SAME established full feathered brows at the original head/tail anchors, sheer pale-pink eyes with fine natural lashes, softly bright even rosy skin, and muted peach-rose/coral-pink lips with restrained hydrated GLOSS. Preserve real skin detail, original facial geometry and identity, the unchanged new-hair design, ear anatomy, complete neck/clavicle fitting coverage and transparent-output rules. Do not return an untreated copy with only its background removed. No extra image or generation request is required.\n\n${seedreamPrompt}`;
    }

    // Normalize female cosmetic targets after every normal/low-light policy
    // so an older lip colour or surface summary cannot override the finish.
    if(keepOriginalHair&&!inpaint&&!cleanHead&&!hairDonor&&portraitMode==='female'&&req.body?.creditKind!=='hairstyle'){
      seedreamPrompt=seedreamPrompt
        .replace('FEMALE INITIAL PORTRAIT — COMPLETE SOFT-PINK KOREAN STUDIO FINISH:','FEMALE INITIAL PORTRAIT — COMPLETE SOFT-ROSE KOREAN STUDIO FINISH:')
        .replace(/EYES — VERY SHEER PALE PINK WITH FINE CLEAR SHIMMER:[^\n]*/,'EYES — VERY SHEER SOFT ROSE-PINK WITH FINE CLEAR SHIMMER: Use a very sheer, muted neutral ROSE-PINK eyeshadow with a transparent soft-rose undertone. Keep the same delicate, low-saturation cosmetic strength and visible natural skin as the existing sheer finish. Blend the colour softly inside the original mobile-lid area. It should look softly rosy and luminous, without a vivid pink band, red eye ring, orange/coral cast, purple patch or dark smoky eye. Keep it gently discernible on fair skin without bleaching it to white; do not deepen or redden it to contrast with darker skin. Change only cosmetic pigment hue, not facial exposure, skin smoothing, natural complexion or anatomical eye shading. Keep the existing fine sparse shimmer, eyeliner and lash treatment unchanged.')
        .replace(/LIPS — MUTED PEACH-ROSE \/ SOFT CORAL-PINK COLOUR:[^\n]*/,'LIPS — SOFT ROSE-RED GRADIENT WITH HYDRATED GLOSS: Use a translucent, softly muted neutral ROSE-PINK lip colour with gentle natural ROSE-RED depth. The target is a softly rosy red-pink body, a slightly richer rose-red inner lip and a delicate fading outer edge, with moist clear reflections and visible fine lip creases. Keep saturation moderate and adapt colour depth to the person, without peach/coral/orange, purple, fuchsia, burgundy, dark brick, brown/nude-grey or vivid opaque red lipstick. Rebalance conflicting existing cosmetic pigment rather than stacking colour. Preserve the exact original lip shape, size, asymmetry, mouth opening, expression and base exposure. This lip-only target does not change the face/neck complexion, skin finish or established studio illumination.')
        .replace('Keep a gently visible muted peach-rose body with slightly richer colour toward the inner lips and a softly fading edge strictly within the original boundary.','Keep a soft rose-pink body with slightly richer rose-red pigment next to the original inner lip, fading gradually toward a sheer soft-pink outer edge. Blend this gradient continuously across each existing lip surface while retaining fine lip-line texture and natural volume. Feather only cosmetic pigment INSIDE the original lip contour; do not blur the surrounding skin, move the border, overline the lips, erase the Cupid\'s bow or replace the person\'s lip shape. Do not increase red saturation merely because the source skin is darker.')
        .replace(/For these female initial portraits only, this glossy lip finish[^\n]*/,'FEMALE LIP SURFACE — SOFT MOIST CLEAR GLOSS: Within this same existing generation, give only the lip surface a hydrated translucent gloss under the already specified broad, softly diffused frontal studio light. Follow the original lip curvature with a soft cluster of delicate clear reflections near the centre of the lower lip and a smaller restrained reflection on the upper lip where the existing light catches it. Keep the inner rose-red pigment readable beneath the gloss and retain fine natural lip creases, soft volume and the existing mouth-separation shadow. The highlight should look softly wet and luminous, with a gradual falloff across the original lip volume, never a painted white stripe, glitter, oily mirror glare, plastic skin or an invented global light source. Locally soften superficial lip flakes or temporary patchiness only when present. Keep surrounding skin and the face/neck exposure, white balance, light direction, brows, eyes, hair, teeth, mouth opening and all anatomy unchanged. Do not enlarge or plump the lips, repaint teeth or add a broad blur. This surface finish supersedes earlier satin/soft-matte or tiny-sheen-only lip restrictions for female initial portraits only; skin and face lighting retain their existing finish. Use the same single image generation, with no extra image or request.')
        .replace('A very faint translucent rosy cheek warmth can blend into the same skin tone without a visible blush circle or boundary.','A very faint translucent SOFT ROSE-PINK cosmetic cheek tint can blend into the same skin tone without a visible blush circle or boundary. Keep the existing sheer amount, brightness and skin texture; this rose hue is a local cheek cosmetic, not a pink/red colour cast across the forehead, face, ears or neck.')
        .replaceAll('sheer light-pink eye finish','sheer soft-rose eye finish')
        .replaceAll('sheer pink eyelids/fine natural lashes','sheer soft-rose eyelids/fine natural lashes')
        .replaceAll('sheer pink eyelids and fine natural lashes','sheer soft-rose eyelids and fine natural lashes')
        .replaceAll('sheer pale-pink eyes with fine natural lashes','sheer soft-rose eyes with fine natural lashes')
        .replaceAll('specified sheer pale-pink mobile-lid finish','specified sheer soft-rose mobile-lid finish')
        .replaceAll('muted peach-rose/coral-pink','soft rose-pink/rose-red gradient');
    }

    // Alpha output is supported only by Pro/Flash 5.x with ONE RGBA input.
    // Keep multi-reference, donor, clean-head and inpaint routes unchanged.
    const arkModel=process.env.ARK_MODEL||"dola-seedream-5-0-pro-260628";
    const transparentPortrait=keepOriginalHair&&!inpaint&&!cleanHead&&!hairDonor&&/seedream[-_ ]5(?:[-_. ]0)?[-_ ](?:pro|flash)(?:[-_ ]|$)/i.test(arkModel);
    let portraitBuffer=inputFile.buffer,portraitMime=inputFile.mimetype||"image/png";
    if(transparentPortrait){
      const sharp=(await import("sharp")).default;
      // Seedream requires a genuinely transparent pixel, not just RGBA.
      // Add a 1px transparent frame without erasing any source photograph pixel.
      portraitBuffer=await sharp(portraitBuffer,{failOn:"error"}).rotate().ensureAlpha()
        .extend({top:1,bottom:1,left:1,right:1,background:{r:0,g:0,b:0,alpha:0}})
        .png().toBuffer();
      portraitMime="image/png";
      seedreamPrompt += `\n\nTRANSPARENT OUTPUT — BACKGROUND ONLY:
Return the completed person as a genuine RGBA PNG with an alpha channel. Remove the temporary background into zero-alpha transparency, not a painted white/blue background or checkerboard. All earlier plain/temporary background instructions apply only as construction guides; the returned background must be transparent. Preserve opaque photographic face, skin, ears, upper hair, complete neck/clavicle coverage and the existing clothing-preparation rules. Keep only narrow natural antialiasing at the silhouette, without background-colored fringes or a broad translucent skin/hair halo. Where obsolete lower hair was removed outside the anatomical silhouette, return transparent pixels rather than colored background pixels. Do not change the face, skin finish, hair design, neck proportions, light, framing or any other requested detail.`;
    }
    if(keepOriginalHair&&!inpaint&&!cleanHead&&!hairDonor&&portraitMode==='male'&&req.body?.creditKind!=='hairstyle'){
      // Retain the established neck fitting while limiting facial edits to
      // clean-shaven grooming, soft frontal light and natural skin texture.
      const maleNeckReplacements=[
        ['NECK / CLOTHING PREPARATION: Keep the ORIGINAL jawline and chin completely unchanged. Reconstruct ONLY the missing neck and garment-fitting skin BELOW the original jaw.','NECK / CLOTHING PREPARATION: Keep the ORIGINAL jawline, chin and under-chin tissue contours unchanged. Reconstruct the missing below-jaw fitting skin and established normal visible neck without removing under-chin tissue.'],
        ['Create a complete, natural, centered, SHORT neck','Create a complete, natural, centered, normally proportioned adult neck with a clearly visible neck column'],
        ['Expand the skin coverage BELOW and BESIDE the neck rather than lengthening the anatomical neck.','Prepare both a normal visible adult neck and the skin coverage BELOW and BESIDE it. When the source neck is compressed, allow a modest increase in visible neck length without scaling the head, shifting the bony chin or making an unnaturally elongated neck.'],
        ['Preserve the current neck width, natural short-neck proportions, curved neck base and clavicles.','Keep natural neck width and reconstruct a normal visible adult neck column, curved neck base and clavicles; do not copy compressed source neck length.'],
        ['This is extra garment-fitting skin below the neck, NOT a longer anatomical neck.','This extra garment-fitting skin supplements the normally proportioned visible neck; it is not permission for an unnaturally elongated neck.'],
        ['Keep normal short-neck anatomy; extend the lower fitting coverage rather than elongating the neck.','Create normal adult neck length with a comfortable visible transition from the chin to the clavicles, in addition to the full lower fitting coverage.'],
        ['Keep the upper neck naturally short, centered and connected to the SAME unchanged jaw; do not lengthen or stretch the anatomical neck.','Keep the upper neck centered and connected to the SAME unchanged bony jaw. If its source appearance is compressed, reconstruct modestly more visible neck length to normal adult proportions; never stretch pixels, displace the chin or create an unnaturally long neck.'],
        ['These are lower garment-overlap skin dimensions, never new face, head, upper-neck or shoulder proportions.','These dimensions describe lower garment-overlap skin, not new face, head or shoulder proportions. The upper neck follows the explicitly required normal visible adult length.'],
        ['Do not regenerate or move the face, lengthen the neck, change the hair/ear procedure or make an additional AI request.','Do not regenerate or move the face, over-elongate the neck, change the hair/ear procedure or make an additional AI request.'],
        ['Keep all already visible ear, cheek, jaw, chin and neck boundaries at their exact anatomical positions;','Keep all already visible ear, cheek, jaw, chin and neck boundaries at their exact anatomical positions; preserve the established complete neck fitting field;'],
        ['No change to the existing skin, neck or lighting procedure is authorized.','Apply only the explicitly authorized male clean-shaven, soft frontal-light and natural-skin finish; preserve the established neck fitting procedure.'],
        ['current neck anatomy and fitting coverage','required normal visible neck anatomy and complete fitting coverage'],
        ['neck anatomy/coverage','normal visible neck anatomy and complete fitting coverage'],
        ['neck shape/coverage','normal visible neck shape and complete fitting coverage'],
        ['neck proportions','required normal adult neck proportions'],
      ];
      for(const [from,to]of maleNeckReplacements)seedreamPrompt=seedreamPrompt.replaceAll(from,to);
      seedreamPrompt=seedreamPrompt
        .replace(/ABSOLUTE FACE LOCK:[^\n]*/,'ANATOMICAL FACE LOCK — MALE INITIAL PORTRAIT: Preserve the original identity, eyebrows, eyes, eyelids, eye spacing, nose, nostrils, lip/mouth shape, cheeks, jaw width, chin tip/projection, ears, expression, facial width/height and natural asymmetry. Do not create a new face, slim the cheeks/jaw, remove under-chin tissue, enlarge eyes, mirror the subject or change head pose. Only the specified clean-shaven grooming, facial-shadow correction and fine-pore tonal/texture finish may alter facial appearance. Image 2 has no authority over the face or skin.')
        .replace(/NECK PROPORTION — LOCAL ANATOMY ONLY:[^\n]*/,'NECK PROPORTION — NORMAL VISIBLE ADULT NECK: Keep the established centered, naturally proportioned visible neck from the unchanged chin/jaw into the clavicles. Preserve the chin and under-chin tissue contours, source head scale/pose, face identity and shoulder proportions. Keep the existing modest visible neck length and full wide/deep lower fitting coverage; do not stretch the neck, narrow the jaw or reshape under-chin tissue. Match the completed skin to the established complexion, fine texture and soft frontal illumination.');
      seedreamPrompt=`MALE INITIAL PRIORITY — CLEAN-SHAVEN, EVEN SOFT LIGHT AND NATURAL SKIN:
Use Image 1 for the SAME face, original facial anatomy, chin/jaw and under-chin tissue contours. Remove visible moustache, beard and stubble plus their dark beard cast. Remove unwanted strong facial cast shadows using soft frontal fill, while preserving tiny anatomical contact shadows and natural three-dimensional facial gradients. Make skin softly diffused and fine-pored with subtle real texture, never waxy, plastic or out of focus. Preserve the existing hairstyle, ears, eye/brow/lip treatment, head pose/scale and established neck fitting.
The ENTIRE final neckline fitting opening must contain continuous real neck/clavicle/upper-sternum SKIN ONLY. Remove every white or black temporary/source crew-neck band, ribbed rim, shirt trim and collar from inside that field; do not disguise it as skin or a shadow. Keep the broad/deep skin coverage and both lateral wedges, lower ALL temporary garment edges beyond the opening, and add a hidden continuous lower/side skin overlap of about .15 of the original jaw width beyond the required opening. This overlap also accommodates an application-side upward placement of up to 2% of the final portrait height; do not move or resize the person inside this AI image in response. Keep the remaining torso fully clothed in an opaque low round-neck top. The final fixed outfit is applied separately and stays unchanged.
The male clean-shaven, facial-light and skin-texture targets supersede conflicting preservation wording ONLY for existing beard/moustache, unwanted facial cast shadows and coarse skin microcontrast. All facial anatomy, under-chin tissue contours, identity, natural pigmentation and other policies remain protected. Complete the edit in this SAME existing generation without an additional inspection or repair request.

${seedreamPrompt}

MALE INITIAL FINAL CHECK — COMPLETE WITHIN THIS SAME GENERATION:
Inspect the facial finish and whole clothing opening before returning this SAME image. No visible beard, moustache, short stubble or grey beard ring should remain. Unwanted strong facial cast shadows should be removed with natural blended frontal illumination, retaining subtle anatomical depth, authentic pigmentation and balanced highlights. Skin should look soft, even and fine-pored while still photographic, without wax, plastic shine, erased texture or whole-face blur. Preserve the original chin/jaw shape and under-chin tissue contours. Confirm uninterrupted matching skin through the full broad/deep central and lateral fitting field and its hidden overlap: no white/black T-shirt band, collar rim, pale fabric bridge, blue wedge, transparency hole, sharp cutoff or painted patch may remain inside it. Preserve the face identity, eyes/brows/nose/mouth, hair, ears, head pose/scale, framing and final outfit. Keep the remaining torso clothed. Complete corrections within this SAME request; do not request another image generation.`;
    }
    const portraitDataUrl=`data:${portraitMime};base64,${portraitBuffer.toString("base64")}`;
    const refs=[portraitDataUrl];
    if(!keepOriginalHair&&hairBuf) refs.push(`data:image/png;base64,${hairBuf.toString("base64")}`);
    const arkPayload={
      model:arkModel,
      prompt:seedreamPrompt,
      image:refs.length===1?refs[0]:refs,
      size:"2K",
      output_format:"png",
      ...(transparentPortrait?{background:"transparent"}:{}),
      response_format:"url",
      watermark:false
    };
    const r=await fetch("https://ark.ap-southeast.bytepluses.com/api/v3/images/generations",{
      method:"POST",
      headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
      body:JSON.stringify(arkPayload)
    });
    const body=await r.json().catch(()=>null);
    if(!r.ok){
      await refundCredit(creditUse.usageId); creditUse=null;
      console.error("Seedream image generation failed",r.status,JSON.stringify(body));
      return res.status(r.status).send("Seedream ประมวลผลไม่สำเร็จ: "+JSON.stringify(body||{}));
    }
    const outputUrl=body?.data?.[0]?.url;
    if(!outputUrl){await refundCredit(creditUse.usageId);creditUse=null;return res.status(500).send("Seedream ไม่ได้ส่งภาพกลับมา (คืนสิทธิ์แล้ว)");}
    const imageResponse=await fetch(outputUrl);
    if(!imageResponse.ok){await refundCredit(creditUse.usageId);creditUse=null;return res.status(502).send(`ดาวน์โหลดภาพ Seedream ไม่สำเร็จ (${imageResponse.status}) (คืนสิทธิ์แล้ว)`);}
    const data=Buffer.from(await imageResponse.arrayBuffer());
    res.set("Content-Type","image/png");
    res.set("Cache-Control","no-store");
    if(!req.deferCreditCommit)await commitCredit(creditUse.usageId);
    res.set("X-Credits-Remaining",String(creditUse.credits));
    res.send(data);
  }catch(e){
    if(creditUse)await refundCredit(creditUse.usageId);
    console.error(e);
    res.status(500).send("AI finishing ไม่สำเร็จ: "+e.message);
  }
};
app.post("/api/ai-finish",upload.fields([{name:"image",maxCount:1},{name:"mask",maxCount:1}]),aiFinishHandler);


const activeAiJobs=new Set();
function captureResponse(){
 let statusCode=200,headers={},payload=null,doneResolve;
 const done=new Promise(r=>doneResolve=r);
 const res={headersSent:false,status(code){statusCode=code;return this},set(k,v){headers[String(k).toLowerCase()]=String(v);return this},type(v){headers['content-type']=v;return this},json(v){payload=Buffer.from(JSON.stringify(v));this.headersSent=true;doneResolve();return this},send(v){payload=Buffer.isBuffer(v)?v:Buffer.from(String(v??''));this.headersSent=true;doneResolve();return this}};
 return {res,done,get:()=>({statusCode,headers,payload})};
}
async function runAiJob(id){
 if(activeAiJobs.has(id))return;activeAiJobs.add(id);let job=null;
 try{
  job=await claimAiJob(id);if(!job)return;
  const req={body:job.fields||{},files:{image:[{buffer:job.image,originalname:job.image_name,mimetype:job.image_type}],mask:job.mask?[{buffer:job.mask,originalname:job.mask_name,mimetype:job.mask_type}]:[]},deferCreditCommit:Boolean(job.fields?.delivery_pending),preReservedCreditUse:{usageId:job.usage_id,credits:null},get(name){return String(name).toLowerCase()==='x-wallet-id'?job.wallet_id:''}};
  const cap=captureResponse();await aiFinishHandler(req,cap.res);await cap.done;const out=cap.get();
  if(out.statusCode>=200&&out.statusCode<300&&out.payload?.length)await completeAiJob(id,out.payload);else{await refundCredit(job.usage_id);await failAiJob(id,out.payload?.toString('utf8')||`AI processing failed (${out.statusCode})`);}
 }catch(e){console.error('AI job:',id,e);if(job?.usage_id)try{await refundCredit(job.usage_id)}catch{};try{await failAiJob(id,e.message)}catch{}}finally{activeAiJobs.delete(id)}
}
app.post('/api/ai-jobs',upload.fields([{name:'image',maxCount:1},{name:'mask',maxCount:1}]),async(req,res)=>{
 let creditUse=null;
 try{const image=req.files?.image?.[0],mask=req.files?.mask?.[0];if(!image)return res.status(400).json({error:'image_required'});if(req.body?.mode==='hair-inpaint'&&!mask)return res.status(400).json({error:'mask_required'});const creditKind=req.body?.creditKind==='hairstyle'?'hairstyle':'ai-finish';creditUse=await requireCredit(req,res,creditKind);if(!creditUse)return;const id=await createAiJob({walletId:walletId(req),usageId:creditUse.usageId,fields:{...req.body,delivery_pending:true,delivery_confirmed:false},image,mask});res.status(202).json({jobId:id,status:'queued',generationRemaining:Number(creditUse.generationRemaining||0),hairRemaining:Number(creditUse.hairRemaining||0),trialPreview:Boolean(creditUse.trialPreview)});setImmediate(()=>runAiJob(id))}
 catch(e){if(creditUse)await refundCredit(creditUse.usageId);console.error('Create AI job:',e);if(!res.headersSent)res.status(500).json({error:'job_create_failed',message:e.message})}
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
 const rights=await imageEntitlements(wid),trial=String(j.usage_id||'').startsWith('trial_')&&!rights.unlockedJobIds.includes(req.params.id);
 res.type('png').set('Cache-Control','no-store').set('X-IDPROM-Trial',trial?'1':'0').send(j.result);
}catch(e){res.status(500).send('โหลดผลลัพธ์ไม่สำเร็จ')}});
app.post('/api/images/:id/claim',async(req,res)=>{try{
 const user=req.accountUser||await authUser(req);if(!user)return res.status(401).json({error:'auth_required'});
 const source=String(req.body?.sourceWalletId||'');
 if(source===user.wallet_id)return res.json({ok:true});
 if(!source||await walletHasAccount(source))return res.status(403).json({error:'image_account_mismatch',message:'รูปนี้อยู่ในบัญชีอื่น กรุณาเข้าสู่ระบบบัญชีเดิม'});
 if(!await claimTrialImage(req.params.id,source,user.wallet_id))return res.status(404).json({error:'trial_image_not_found'});
 res.json({ok:true});
}catch(e){res.status(500).json({error:'image_claim_failed'})}});
app.get('/api/images/:id/rights',async(req,res)=>{res.set('Cache-Control','no-store');try{const wid=walletId(req),j=await getAiJobResult(req.params.id,wid);if(!j||j.status!=='completed')return res.status(404).json({unlocked:false,fullEdit:false});const ent=await imageEntitlements(wid),usage=String(j.usage_id||'');const privateAccess=req.get('X-IDPROM-Private-Trial')==='1'&&hasPrivateTrial(req,wid);const unlocked=privateAccess||Boolean(req.accountUser&&(usage.startsWith('use_')||ent.unlockedJobIds.includes(req.params.id)));res.json({unlocked,fullEdit:unlocked&&(ent.editableJobIds.includes(req.params.id)||await creditOutputFullEdit(usage))})}catch(e){res.status(500).json({unlocked:false,fullEdit:false})}});
const resumeQueuedAiJobs=async()=>{try{for(const id of await queuedAiJobs())setImmediate(()=>runAiJob(id))}catch(e){console.error('Resume AI jobs:',e)}};
setTimeout(resumeQueuedAiJobs,1500);
setInterval(resumeQueuedAiJobs,60000);


async function savedWorkRights(wid,project){
 const ids=validateProject(project),ent=await imageEntitlements(wid);
 for(const id of ids){const j=await getAiJobResult(id,wid);if(!j||j.status!=='completed'||!(String(j.usage_id||'').startsWith('use_')||ent.unlockedJobIds.includes(id)))return false}return true;
}
app.post('/api/saved-work',async(req,res)=>{res.set('Cache-Control','no-store');try{
 const user=req.accountUser;if(!user)return res.status(401).json({message:'กรุณาเข้าสู่ระบบเพื่อบันทึกงาน'});
 const project=req.body?.project;if(!await savedWorkRights(user.wallet_id,project))return res.status(403).json({message:'บันทึกได้เฉพาะรูปที่รับสิทธิ์แล้ว'});
 const work=await saveWork(user.wallet_id,String(req.body?.id||''),project);if(!work)return res.status(404).json({message:'ไม่พบงานของบัญชีนี้'});res.json(work);
}catch(e){if(e.code==='saved_work_limit')return res.status(409).json({error:e.code,limit:MAX_SAVED_WORKS,message:e.message});res.status(400).json({message:'บันทึกงานไม่สำเร็จ กรุณาลองใหม่'})}});
app.get('/api/saved-work',async(req,res)=>{res.set('Cache-Control','no-store');try{if(!req.accountUser)return res.status(401).json({message:'กรุณาเข้าสู่ระบบเพื่อเปิดงาน'});res.json({items:await listWorks(req.accountUser.wallet_id),limit:MAX_SAVED_WORKS})}catch(e){res.status(500).json({message:'โหลดงานไม่สำเร็จ'})}});
app.delete('/api/saved-work/:id',async(req,res)=>{res.set('Cache-Control','no-store');try{if(!req.accountUser)return res.status(401).json({message:'กรุณาเข้าสู่ระบบเพื่อลบงาน'});const removed=await deleteWork(req.accountUser.wallet_id,req.params.id);if(!removed)return res.status(404).json({message:'ไม่พบงานของบัญชีนี้'});res.json({ok:true,id:removed.id})}catch(e){res.status(500).json({message:'ลบงานไม่สำเร็จ กรุณาลองใหม่'})}});
app.get('/api/saved-work/:id',async(req,res)=>{res.set('Cache-Control','no-store');try{if(!req.accountUser)return res.status(401).json({message:'กรุณาเข้าสู่ระบบเพื่อเปิดงาน'});const work=await getWork(req.accountUser.wallet_id,req.params.id);if(!work)return res.status(404).json({message:'ไม่พบงานของบัญชีนี้'});if(!await savedWorkRights(req.accountUser.wallet_id,work.project))return res.status(403).json({message:'ไม่มีสิทธิ์เปิดงานนี้'});res.json({...work,unlocked:true})}catch(e){res.status(500).json({message:'เปิดงานไม่สำเร็จ'})}});

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
