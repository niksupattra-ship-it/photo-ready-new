import {registerPasswordResetApi} from './password-reset-api.js';
import {registerPromptpayApi,settlePromptpay} from './promptpay-api.js';
import {HAIRSTYLE_FIT_POLICY} from './hairstyle-fit-policy.js';
import {selectedHairstyleRule} from './hairstyle-rules.js';
import {validateProject,saveWork,listWorks,getWork,deleteWork,MAX_SAVED_WORKS} from './saved-work-store.js';
import express from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import {registerMakeupApi} from './makeup-api.js';
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
 console.warn('IDPROM checkout:',JSON.stringify({event:'client_failure',attemptId:clean(req.body?.attemptId),stage,code:clean(req.body?.code),httpStatus:Number(req.body?.httpStatus)||0,packageId:clean(req.body?.packageId)}));res.sendStatus(204);
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
   if(offer.id!=='159_v4')return res.status(400).json({error:'trial_image_required',message:'เลือกรูปทดลองที่ประมวลผลสำเร็จก่อนชำระเงิน'});
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
registerMakeupApi(app,{upload,requireCredit,commitCredit,refundCredit,getWallet,walletId});

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
  const rgba=Buffer.allocUnsafe(W*H*4);
  for(let i=0,j=0,k=0;i<W*H;i++,j+=3,k+=4){
    rgba[k]=rgb[j];rgba[k+1]=rgb[j+1];rgba[k+2]=rgb[j+2];rgba[k+3]=alpha[i];
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
  const result=await editHairstyle({portrait:req.file,hairId:req.body?.hairId,root:dir});
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

HAIR ONLY — STRICT FACE-SAFE EDIT: ${keepOriginalHair?"preserve the original hairstyle geometry from Image 1, but refine only the hair itself so its overall volume and outer silhouette look naturally balanced with the subject's existing face and skull. Do not change the hairline where it touches forehead/temples, and do not alter any face or skin pixels.":"change ONLY the hair region to follow Image 2. Match its parting, fringe, side shape, crown, length and tied/untied structure, but adapt ONLY the hair volume and outer silhouette so the hairstyle is naturally proportioned to Image 1's existing face, skull, ears and head size. The hairstyle reference has ZERO authority over face, skin, complexion, lighting or head/face geometry."}

HAIR REALISM: render photographic human hair with natural root direction, fine individual strands, strand separation, irregular density, subtle flyaways and realistic overlapping layers. Avoid a solid hair mass, painted texture, plastic shine, overly smooth strands, artificial edge halos or excessive sharpening. Preserve believable studio-light highlights so strand detail remains visible.

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

HAIR REMOVAL EXCEPTION TO FACE LOCK: ${keepOriginalHair?'No hairstyle replacement is requested; retain source hair.':'The face lock protects FACIAL ANATOMY and visible facial pixels, NOT source hair overlapping them. Remove ALL obsolete source bangs and strands over forehead, eyebrows, temples and cheeks when those areas are exposed by Image 2. Do not preserve an old diagonal fringe merely because it crosses a protected eyebrow. Recover only the previously hidden small skin/brow portions with natural continuity from the original visible brow shape, position and hairs; do not move, thicken, reshape or symmetrize the brows or alter any visible eye/face detail. Never reintroduce the removed source fringe after applying the selected hairstyle.'}

SKIN: Preserve the real skin character from Image 1: pores, fine texture, small marks, under-eye detail and natural tonal variation. Never alter facial geometry to achieve the finish. The gender-specific finish below may adjust only low-frequency illumination/color and fine cosmetic texture while preserving original identifying detail.
${genderFinish}

BALANCED NATURAL PORE DEFINITION: Keep the established gentle studio illumination, even skin tone and subtle cosmetic finish. Make the subject's EXISTING pores and fine skin microtexture slightly more visible through restrained local texture contrast, especially on the cheeks, forehead and nose. Keep the effect delicate and flattering at normal ID-photo viewing size, with softly lit skin and realistic subtle texture. Preserve the original pore size, placement and natural variation wherever visible; never enlarge or darken pores, invent coarse pores, add grain/noise, exaggerate wrinkles or blemishes, or create crunchy sharpening, halos or a gritty complexion. Where the source does not resolve individual pores, keep natural soft skin detail rather than fabricating a repeated pore pattern. No skin blurring, waxy smoothing or plastic appearance; keep all facial geometry, identity, base complexion and the current neck treatment unchanged.

SOURCE HEADWEAR REMOVAL — REQUIRED: Remove ALL source hats, nurse caps, graduation caps, helmets, head coverings and attached headwear fabric from Image 1. Do not preserve or copy headwear as part of the identity, hairstyle or protected head outline. Remove both central and side panels, white folded wings, rims, seams, straps and cast shadows caused solely by the removed headwear. The final person layer must have no source headwear or headwear-shaped white patches. ${keepOriginalHair?'Preserve the original VISIBLE hairstyle, parting, color and hair texture; complete only the hair/scalp portions previously hidden by the removed headwear with plausible continuity of that same hairstyle.':'Fill the headwear-covered area with the selected Image 2 hairstyle, following its established shape, parting, texture and no-dangling-strand rules. Do not change the selected hairstyle to accommodate the source cap.'} Where headwear extended outside the intended hair/head silhouette, restore only the plain temporary background. Keep original visible face, ears, expression, head position/orientation, skin/pore/cosmetic finish and neck preparation unchanged. Removal of headwear is permitted despite the face/head identity lock; it does not authorize reshaping or redrawing any visible facial feature. Do not add replacement hats or headwear accessories.

HAIRSTYLE: ${keepOriginalHair?'Preserve the original hairstyle from Image 1.':'Replace the ENTIRE original hairstyle with Image 2. Image 2 is a HAIRSTYLE DESIGN GUIDE, not a fixed-size overlay. Follow its haircut category, parting, designed fringe, crown structure, strand direction, intended length, side sections and tied/untied structure. Adapt only hair thickness, density, crown volume and fitted contour to the unchanged head anatomy in Image 1. Fit the selected hairstyle around the ORIGINAL unchanged head and face. If Image 2 is shorter, tied up, exposes the ears/neck, or has no long side/back sections, COMPLETELY REMOVE the corresponding original long hair from Image 1. No old ponytail, long side panels, long strands, shoulder-length remnants, dark hair curtains or previous hairstyle may remain outside the selected hairstyle silhouette. Reconstruct only the newly exposed background, ears and neck around the removed hair. Create realistic roots, individual strands, natural density and realistic hairline shadows. Only retain stray hair explicitly present in Image 2; do not invent hanging side strands. HAIR EDGE CLEANUP: refine the complete outer hair silhouette, temples, sideburn area and hair-to-forehead transition with fine photographic strands and soft natural anti-aliased edges; remove cutout halos, jagged blue fringe, hard pasted edges and leftover source-background contamination. FACE OUTLINE CLEANUP: keep the exact original jaw, cheeks, chin and facial width, but make the skin-to-background boundary clean and naturally feathered at pixel level; do not move, redraw, slim, widen or reshape the facial contour. Never reshape the face, jaw, chin or skull to fit the hairstyle.'}

${keepOriginalHair?'':`SELECTED HAIRSTYLE / UPPER HAIRLINE EDIT ZONE — REQUIRED: Image 2 defines the hairstyle design, NOT the reference person's head dimensions or forehead outline. Image 1 alone defines the subject's skull size, facial width, ear positions and head angle. The original upper hair/skin boundary is EDITABLE in the narrow peripheral region from the TOP OF EACH EAR through the temples to the forehead hairline. Within that region, rebuild the hairline, roots and immediately adjacent forehead/scalp transition to fit the selected hairstyle naturally around the same original head. Do not freeze, trace, copy or paste Image 1's old hairline, fringe, widow's peak, wisps or hair-covered forehead edge. Remove every obsolete source hair fragment in this region and replace it with the selected reference's continuous roots or naturally exposed matching skin. This localized boundary exception takes precedence over instructions to preserve the old visible forehead edge; it does NOT authorize changing the face interior or the skull/head proportions.

ANATOMICAL HAIRSTYLE FIT — REQUIRED FOR EVERY SELECTED STYLE: Re-create the selected hairstyle as real hair growing from Image 1's unchanged head, not a pasted wig or a rigid silhouette copied from Image 2. Keep the reference's recognizable haircut, parting, sweep, bangs, tied/loose structure and intended length, while adapting HAIR ONLY to the original subject's head width, crown curvature, temple positions, ear height and camera perspective. Reference hairstyle fidelity means the same design fitted to this person, NOT the same absolute width, height, forehead cutout or reference-face proportions. Adjust the hair envelope and root placement to the original anatomy; fit the roots to the curved scalp rather than copying the reference forehead cutout. Balance hair thickness and density across the crown and sides with the subject's head width, without compressing the forehead, narrowing the face or enlarging the head. Respect the unchanged upper-ear attachment and temple positions: route short/tucked hair behind the ears where the chosen design requires it, or retain the reference's legitimate bob/long sections without shifting, shrinking or covering the ears differently to disguise a poor fit. Preserve natural scalp visibility at the chosen parting, with continuous rooted growth and no holes, detached patches or dense helmet-like edge. never resize, stretch, move or reshape the subject's face or ears to fit the hair. Keep crown volume proportionate to the original head and the selected design; no oversized dome, pinched temples, floating hair cap or abrupt ledge above the ears. The reference person's skin, eyebrows, forehead shape and cutout rim must not be transferred.

HAIRLINE SEAM BLENDING — LOCAL FINISH ONLY: Finish the hair-to-forehead and hair-to-temple junction as one continuous photograph, not a hair layer resting on top of skin. Within a very narrow root transition, gradually vary hair density from fine tapered roots into the main hair mass and gently reconcile adjacent scalp/skin tone, exposure and root shadows with the ORIGINAL forehead. Remove a visible pasted contour, dark cut line, pale rim, abrupt texture or color step and any residual cutout edge. Roots must appear embedded in the scalp with realistic strand-level separation and subtle soft contact shading, not a uniform painted shadow. Preserve the forehead's existing pores, focus and natural texture; do not smear skin or blur the hair mass. Keep the recognizable selected hairstyle design; refine root position and contour as needed for an anatomical fit. This narrowly localized blending permission overrides a prohibition on touching the immediately adjacent hairline skin ONLY; it does not permit reshaping the forehead or altering any eyebrow, eye, nose, lip, cheek, jaw, face proportions, general skin finish or neck. No additional flyaways or hanging side locks.

NATURAL ROOT / SKIN INTEGRATION: Within the already authorized upper hairline transition, anchor strands continuously to the scalp and follow the original head's curved surface. Match root lighting, color temperature, focus and photographic grain to the unchanged face. Use subtle contact shadows and short tapered root strands INSIDE the main hair shape, with irregular natural density rather than a uniform dark rim. Remove reference matte residue, doubled hair edges, hard borders, bright halos and skin-colored cutout strips. Keep the edge clean and detailed at normal viewing size, not blurred or broadly feathered; no scalp gaps or invented dangling wisps. Blend only this narrow root transition and HAIR pixels, leaving all existing inner facial features, current skin finish and neck preparation unchanged.

COMPLETE, UNBROKEN HAIR COVERAGE: Follow Image 2's actual parting, swept-back direction, bangs, crown, side sections and length for EVERY selected style. Do not substitute a braid, bun, curl, fringe or different hairstyle absent from the reference. Fill accidental missing hair, scalp gaps and notches at the forehead/temples/above the ears with continuous reference-consistent hair growth and strand direction. A naturally exposed parting or forehead present in Image 2 stays exposed. Transparency in a hairstyle cutout is a reference-background/cutout artifact, not an instruction to create holes, disconnected hair patches or a missing strip of scalp. Where the selected reference has bangs or bob side sections, retain those intended sections; do not remove them as stray hair. No doubled hairline or old hairstyle may remain beneath the replacement.

STRICT INNER-FACE BOUNDARY: Stop the editable hairline/skin-transition zone above the ORIGINAL eyebrows and along the outer temples above the ears. The eyebrows, eyes, eyelids, eye spacing, nose, nostrils, lips, mouth, cheeks, jaw and chin remain governed by Image 1 with their original position, shape, size, expression and asymmetry. Never redraw those features or copy the reference person's face. Preserve the existing skin finish and texture outside this narrow boundary zone, the original ears and the complete current neck treatment. Newly exposed skin immediately at the hairline must match the unchanged face's complexion, pores and lighting seamlessly. Keep fine natural edge strands confined to the chosen hairline, with no wide blur band, hard pasted seam, halo, invented hanging ear wisps or disconnected locks.`}


SOFT PHOTOGRAPHIC HAIR FINISH — HAIR PIXELS ONLY: After following the selected hairstyle geometry, refine its texture and color with a restrained, medium-strength natural professional-black finish. Aim for soft, airy, individually resolved fine strands, not a dense sculpted helmet or a glossy painted mass. ${keepOriginalHair?'Preserve the established parting, length, volume and silhouette;':'Preserve the selected haircut design, parting, intended length and tied/loose structure, with thickness, density, volume and contour adapted to Image 1 as specified above;'} do not add bangs or cheek-covering hair absent from the selected hairstyle. Use natural deep charcoal-black with subtle tonal separation between overlapping strands and gentle broad studio highlights; retain delicate dark-brown/charcoal variation where needed for realistic depth. Avoid crushed featureless blacks, heavy dye saturation, metallic gloss, hard stripe highlights, excessive sharpening, denoising or hair blur. At the forehead, temples, ears and outer hair contour, taper hair density through very short fine root hairs confined close to the established hairline, with softly resolved strand tips and natural root shadows. Soft texture does NOT mean adding loose locks, dangling wisps or long flyaways beside the ears, cheeks or neck. ${keepOriginalHair?'Preserve the original hair silhouette.':'Preserve the selected hairstyle design with its silhouette anatomically fitted to Image 1 as specified above; do not copy the reference image absolute head dimensions. When a reference is supplied, any loose side hair must be explicitly present in that reference.'} Keep the hair-to-skin transition finely detailed and gradual, without a solid dark outline, cutout seam, blue/white halo or pasted wig edge. This is strand-level softness, NOT blurring the image or feathering a wide band of facial skin. Preserve all visible facial skin, eyebrows, eyes, ears, facial geometry, the current skin/pore/cosmetic finish and neck preparation; do not recolor, smooth or redraw them as part of the hair finish. The separate source-hair removal instructions apply only when changing the hairstyle; this finish does not authorize any additional face or skin edits.

${keepOriginalHair?'':`SOURCE HAIR OCCLUSION REPLACEMENT — REQUIRED: The selected hairstyle in Image 2 replaces ALL source hair, including strands and hair panels overlapping the forehead, temples, brows or cheeks. Do not preserve source hair as part of the face-identity lock and do not blend the old hairstyle into the new one. Where Image 2 leaves the face open, remove the corresponding source fringe and cheek-covering strands; follow only Image 2 for the new fringe and side sections. Do not invent additional face-covering hair absent from Image 2. Removing old hair is permitted even where it overlaps the protected face. Reconstruct ONLY the small newly revealed skin or ear areas previously hidden by that hair, consistent with the original visible complexion, texture and unchanged facial proportions. All already visible facial features, jaw/chin contour, face orientation and the existing natural skin/cosmetic finish remain protected and unchanged. Never borrow facial features or skin from Image 2.`}

${keepOriginalHair?'':`REFERENCE SIDE-HAIR GEOMETRY — STRICT: Image 2 is the sole authority for hair beside the temples, ears, cheeks and neck, not just the crown. If Image 2 has tucked or tied side hair and exposed ears, tuck ALL side hair back as shown and leave the ears and cheek boundaries cleanly exposed. Remove source strands in those regions and do not generate any new dangling tendrils, long baby hairs, curled side locks, thin loops, wispy curtains or hanging strands in front of or below the ears. Follow Image 2's designed side-hair arrangement and intended endpoints, anatomically fitted around Image 1's unchanged temples and ears rather than copied at fixed pixel positions. Fine texture and soft roots must stay within that contour; they must not change the hairstyle or add decorative strands absent from the pattern. Preserve reference bangs or long side sections ONLY when Image 2 actually contains them. Keep face, skin finish, ears and neck anatomy unchanged except for the already authorized recovery of areas previously hidden by removed source hair.`}

${hairId==='hair-26'?`SELECTED HAIR-26 — BRAIDED OPEN-FOREHEAD UPDO: The supplied reference has its obsolete lower cutout tails removed intentionally. Do not reconstruct those tails or add loose side strands. End both side sections tucked behind the upper ears; keep the skin/background beside the lower ears, cheeks and jaw completely free of hanging hair. Match the braided crown and central part of Image 2, with BOTH eyebrows entirely unobstructed and the side hair swept back behind the ears. No diagonal source fringe may cross either eyebrow, forehead-to-brow opening or eye. The isolated PNG reference may include tapered cutout ends, residual scalp-colored matte and fine extraction wisps at its lower sides: these are NOT a request for hanging side locks or facial skin transfer. Finish the side sections smoothly tucked behind the ears; do not reproduce those cutout tails as dangling tendrils. No loose hair, baby-hair curls, wisps or single hanging strands in front of or below either ear, along the cheeks or onto the neck. For this neat updo, render fine strand texture INSIDE the main hair shape only; omit decorative flyaways entirely. Keep the original visible facial details, skin finish and complete neck unchanged.`:''}

${keepOriginalHair?'':`NO DANGLING STRANDS — ALL NON-LONG-LOOSE STYLES: Determine the selected hairstyle category from Image 2, regardless of its ID or gender. For EVERY short haircut, bob, cropped style, tied ponytail, bun, swept-back style, braided updo or other gathered hairstyle that is NOT long loose hair, do NOT create or retain separate dangling tendrils, loose side locks, long baby hairs, wispy loops or stray hanging strands beside the ears, across the cheeks or onto the neck. This rule applies to ALL such selected styles, not only hair-26. Remove obsolete source strands in these regions. Keep the intended main hair design and legitimate bob/short-cut side sections shown in Image 2, fitted to the original head; do not turn a bob into an updo, crop the main haircut or remove its designed bangs. For gathered hair, keep the sides tucked or gathered as shown. Fine strand texture must remain within the intended main hair silhouette; softness must never add external decorative wisps. Ignore thin detached extraction wisps or tapered cutout artifacts as styling instructions. For long loose hairstyles, retain the selected reference's actual long sections and length, without blending in the source hairstyle. Preserve facial details, skin/pore finish and neck preparation.`}

${keepOriginalHair?`SHORT-HAIR / TIED-HAIR CLEANUP: When Image 2 is shorter or more tightly tied than Image 1, every original hair region extending below or outside Image 2's hairstyle silhouette is obsolete and MUST be removed. Do not preserve original long hair for identity. Identity comes from the unchanged FACE, not the old hairstyle. The final visible hair length and outer contour must follow Image 2, with natural clean separation from the ears, neck, shoulders and background. This cleanup must not alter facial geometry, facial skin, jawline or chin.`:`SHORT-HAIR / TIED-HAIR CLEANUP: When Image 2 is shorter or more tightly tied than Image 1, every original hair region extending below or outside the anatomically fitted selected hairstyle is obsolete and MUST be removed. Do not preserve original long hair for identity. Identity comes from the unchanged FACE, not the old hairstyle. The final visible hair length and outer contour must follow the Image 2 design fitted to Image 1's unchanged anatomy, with natural clean separation from the ears, neck, shoulders and background. This cleanup must not alter facial geometry, facial skin, jawline or chin.`}

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

    if(!creditUse){creditUse=await requireCredit(req,res,"ai-finish");if(!creditUse)return;}

    // ModelArk accepts data URLs for image-to-image/multi-reference generation.
    const portraitDataUrl=`data:${inputFile.mimetype||"image/png"};base64,${inputFile.buffer.toString("base64")}`;
    const refs=[portraitDataUrl];
    if(!keepOriginalHair&&hairBuf) refs.push(`data:image/png;base64,${hairBuf.toString("base64")}`);
    const arkPayload={
      model:process.env.ARK_MODEL||"dola-seedream-5-0-pro-260628",
      prompt:seedreamPrompt,
      image:refs.length===1?refs[0]:refs,
      size:"2K",
      output_format:"png",
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
