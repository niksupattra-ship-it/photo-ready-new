import express from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import {editHairstyle,providerStatus} from "./hairstyle-engine/index.js";
import { fileURLToPath } from "url";
import {newWallet,getWallet,ensureWallet,creditPaid,reserveCredit,reserveTrialPreview,commitCredit,refundCredit,walletHistory} from "./payment-store.js";
import {createAiJob,claimAiJob,completeAiJob,failAiJob,getAiJob,getAiJobResult,queuedAiJobs} from "./job-store.js";

const dir=path.dirname(fileURLToPath(import.meta.url));
const app=express();

const STRIPE_PRICE_ID=process.env.STRIPE_PRICE_ID||"price_1UKKMzJdTdkPeQBPQwtPL7kE";
const STRIPE_PRICE_ID_199=process.env.STRIPE_PRICE_ID_199||"";
const APP_URL=(process.env.APP_URL||"").replace(/\/$/,"");
function walletId(req){return String(req.get("X-Wallet-Id")||"").trim()}
function verifyStripeSignature(raw,header,secret){
  if(!header||!secret)return false;const parts=Object.fromEntries(header.split(",").map(x=>x.split("=",2)));
  const t=parts.t,v1=parts.v1;if(!t||!v1)return false;if(Math.abs(Date.now()/1000-Number(t))>300)return false;
  const expected=crypto.createHmac("sha256",secret).update(`${t}.${raw.toString("utf8")}`).digest("hex");
  try{return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(v1))}catch{return false}
}
async function stripePost(endpoint,params){
  const key=process.env.STRIPE_SECRET_KEY;if(!key)throw new Error("ยังไม่ได้ตั้งค่า STRIPE_SECRET_KEY");
  const body=new URLSearchParams();for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null)body.append(k,String(v));
  const r=await fetch(`https://api.stripe.com/v1/${endpoint}`,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/x-www-form-urlencoded"},body});
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
      const wid=session.metadata?.wallet_id;const packageId=session.metadata?.package_id||"149";if(wid)await creditPaid(wid,session.id,packageId);
    }
    res.json({received:true});
  }catch(e){console.error("Stripe webhook:",e);res.status(500).send("Webhook failed")}
});
app.use(express.json({limit:"64kb"}));
app.post("/api/wallet",async(req,res)=>{const current=walletId(req);if(current){const w=await getWallet(current);if(w)return res.json(w)}res.json(await newWallet())});
app.get("/api/wallet",async(req,res)=>{try{const w=await getWallet(walletId(req));if(!w)return res.status(404).json({error:"wallet_not_found"});res.json({...w,history:await walletHistory(w.walletId)})}catch(e){console.error("Wallet:",e);res.status(500).json({error:"wallet_storage_failed"})}});
app.post("/api/payments/checkout",async(req,res)=>{
  try{const wid=walletId(req);if(!wid)return res.status(400).json({error:"wallet_required"});await ensureWallet(wid);const base=APP_URL||`${req.protocol}://${req.get("host")}`;
    const packageId=String(req.body?.packageId||req.body?.package_id||"149");
    if(!["149","199"].includes(packageId))return res.status(400).json({error:"invalid_package"});
    const priceId=packageId==="199"?STRIPE_PRICE_ID_199:STRIPE_PRICE_ID;
    if(!priceId)return res.status(500).json({error:"stripe_price_not_configured",packageId});
    const session=await stripePost("checkout/sessions",{"mode":"payment","line_items[0][price]":priceId,"line_items[0][quantity]":1,"payment_method_types[0]":"promptpay","success_url":`${base}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,"cancel_url":`${base}/?payment=cancelled`,"metadata[wallet_id]":wid,"metadata[package_id]":packageId});
    res.json({url:session.url});
  }catch(e){console.error("Stripe checkout:",e);res.status(500).json({error:e.message})}
});
// Recovery/confirmation path: do not rely on webhook delivery alone.
// After Stripe redirects the buyer back, verify the Checkout Session directly
// with Stripe and idempotently grant the package to the same browser wallet.
app.get("/api/payments/confirm",async(req,res)=>{
  try{
    const wid=walletId(req),sessionId=String(req.query?.session_id||"").trim();
    if(!wid)return res.status(400).json({error:"wallet_required"});
    if(!/^cs_[A-Za-z0-9_]+$/.test(sessionId))return res.status(400).json({error:"invalid_session"});
    const session=await stripeGet(`checkout/sessions/${encodeURIComponent(sessionId)}`);
    const paidWallet=String(session?.metadata?.wallet_id||"");
    if(!paidWallet||paidWallet!==wid)return res.status(403).json({error:"wallet_mismatch"});
    if(session?.payment_status!=="paid")return res.status(202).json({paid:false,paymentStatus:session?.payment_status||"unknown"});
    const packageId=String(session?.metadata?.package_id||"149");
    const credited=await creditPaid(wid,session.id,packageId);
    res.json({paid:true,packageId,generationRemaining:credited.generationRemaining,hairRemaining:credited.hairRemaining});
  }catch(e){console.error("Stripe confirm:",e);res.status(500).json({error:"payment_confirm_failed"})}
});
async function requireCredit(req,res,kind){const wid=walletId(req);if(!wid){res.status(402).json({error:"credit_required",message:"กรุณารีเฟรชหน้าแล้วลองใหม่"});return null}const r=await reserveCredit(wid,kind);if(r)return r;if(kind==="ai-finish"){const raw=`${req.ip||req.socket?.remoteAddress||""}|${req.get("user-agent")||""}`;const fingerprint=crypto.createHash("sha256").update(raw).digest("hex");const trial=await reserveTrialPreview(wid,fingerprint,30);if(trial)return trial}res.status(402).json({error:"credit_required",message:"สิทธิ์ทดลองฟรีถูกใช้แล้ว กรุณาเลือกแพ็กเกจเพื่อประมวลผลต่อ"});return null}

const upload=multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:20*1024*1024,files:2,fields:10,parts:12}
});

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
    const key=process.env.OPENAI_API_KEY;
    if(!key) return res.status(500).send("ยังไม่ได้ตั้งค่า OPENAI_API_KEY บนเซิร์ฟเวอร์");

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
      // Normalize only male reference for image-edit API: auxiliary RGBA
      // cutouts can trigger "invalid image file or mode for image 2".
      if(maleHairReplacement){
        hairBuf=await sharp(hairBuf,{failOn:"error"}).rotate().flatten({background:"#ffffff"}).toColourspace("srgb").png().toBuffer();
      }
    }

    const cleanPrompt=`CLEAN HEAD MASTER FOR A PROFESSIONAL ID PHOTO. This is a one-time anatomical reconstruction before hairstyle replacement. Remove ALL existing hair from the scalp, forehead, temples and behind the ears. Create a natural BALD scalp, complete anatomically plausible ears and uncovered neck wherever hair used to obscure them. Absolutely no remaining long strands, dark hair panels, sideburns, ponytail or hairline. Keep the person's face, expression, eyes, nose, mouth, jaw, original visible skin texture, complexion and head placement unchanged. Return a neutral professional head-and-short-neck crop on a plain temporary background; no torso or shoulders. This is an intermediate layer, not the final portrait.`;
    const prompt=hairDonor?`Create a photographic hairstyle DONOR for the same adult subject in image 1. Image 2 is the hairstyle reference. Change ONLY hair to match image 2: parting, fringe, volume, length, tied or untied shape. Preserve head orientation, eye positions, size, camera framing and background exactly. Natural hair roots, hairline, fine flyaways and studio lighting. Render naturally separated individual strands with soft charcoal-black / natural deep-black color at a restrained 50% professional-black intensity, retaining source hair highlights, tonal variation and texture; no flat jet-black mass or painted gloss. Do not add hair over eyes, cheeks, ears, neck or clothing. The app extracts ONLY hair pixels from this result; face, skin, neck, ears and clothes from this AI output are discarded. Do not change the identity.`:inpaint?`EDIT ONLY THE HAIRSTYLE of the same adult person in image 1. Image 2 is a hairstyle reference ONLY. Follow the selected reference hairstyle, including parting, crown, fringe, silhouette and length. The transparent regions of the supplied mask are editable; preserve the opaque region, especially the entire face, forehead skin, eyebrows, ears, neck and uniform. Reconstruct any scalp and blue studio background previously covered by long hair as needed. Natural deep-black hair at restrained 50% professional-black intensity, preserve strand separation, root direction, subtle brown/charcoal tonal variation and specular highlights. Real photographic hair roots and fine flyaways, no hard cut lines, no rectangular patches or halos. Keep face identity and all uniform insignia unchanged. Return the same framing and scale.`:cleanHead?cleanPrompt:`PROFESSIONAL ID-PORTRAIT REFERENCE EDIT. Image 1 is the ORIGINAL FULL-QUALITY photograph of the subject. It is the sole authority for identity, face, skin, complexion, facial anatomy, expression and photographic skin texture.${keepOriginalHair?" There is no hairstyle reference: preserve the original hairstyle from Image 1.":" Image 2 is a HAIRSTYLE REFERENCE ONLY. Use it only for hairstyle geometry and appearance; never transfer its face, skin, lighting, makeup, head shape or identity."}

GOAL: create one continuous, photorealistic head + hair + ears + anatomically proportionate neck AND REAL EXPOSED UPPER-CHEST SKIN of the SAME PERSON for an ID portrait. Preserve the subject as a real photographed person, not a beautified or re-rendered face. The application will place this layer behind its existing fixed clothing template, so DO NOT create or modify any clothing.

NECKLINE COMPLETION — CRITICAL: The final garment is a separate fixed overlay with a deep V-shaped opening. Output uninterrupted PHOTOGRAPHIC SKIN from the underside of the chin, down the complete neck and over the upper sternum to approximately mid upper chest, so the skin extends beyond the deepest point of the garment opening. This is a conventional clothed ID portrait: only a small patch of skin inside a shirt neckline will be visible; no breasts, cleavage, nudity, bare torso, or suggestive framing. DO NOT draw a white bib, white collar insert, blank triangular panel, rectangular skin placeholder, white fill, pale cutout, hard horizontal cut at the base of the neck, or any garment. No synthetic flat-color patch is acceptable. The exposed upper-chest skin must have the same naturally varied complexion, pores, light direction and camera detail as the actual neck. Continue skin behind the clothing overlay; never stop skin at the neckline. If the input shirt covers this area, reconstruct only anatomically continuous neck/upper-sternum skin, not fabric. Keep normal chin-to-collar proportions; add covered-under-shirt depth rather than stretching the visible neck. Use a medium-blue temporary background so any missing neck is conspicuous rather than white-on-white.

GENERATION-STAGE PROPORTION / NECK CONSTRUCTION: Judge the subject's REAL facial width, chin, jaw, ear positions and skull from Image 1, never from the hair reference or transparent padding. Build the new neck directly beneath the existing jaw: a natural width at the jaw-to-neck junction, gradual taper, centered under the chin, and a naturally continuous visible neck and upper chest skin extending approximately 35% deeper than the earlier short-neck output, so the entire open V-shaped neckline of a formal white shirt is backed by uninterrupted real skin, including the small lowest triangle below the collar tips. Generate enough actual lower-neck/upper-sternum skin to continue BEHIND the fixed shirt template by a safe margin; never leave a white, pale, transparent or background-colored triangle at the bottom of the V. Extend only the LOWER NECK / upper sternum skin; do not lengthen the distance from chin to shoulders, enlarge the head, stretch skin pixels, generate a white patch, or create clothing. The lower neck must remain real continuous skin with the same color, pores and illumination as the original face. Keep the chin, face plane and eyes in their original perspective: do not project the face forward, enlarge the skull, lengthen the neck, narrow it into a stick, or extend the chin. Balance the GENERATED hairstyle silhouette around the unchanged skull and face; reduce excessive crown/side bulk of the HAIR ONLY, not the face. Hair, ears, jaw and neck must read as a single naturally photographed head, without pasted-on seams. These corrections belong in this AI generation step, NOT a resize, warp or repositioning of the completed portrait.

IDENTITY / FACE LOCK: preserve Image 1's exact facial structure and recognizable identity: eye shape and spacing, brows, nose, lips, cheeks, jaw, chin, ears, asymmetry, expression, age and proportions. Do not idealize, reshape, beautify or substitute facial features.

SKIN SOURCE LOCK: Image 1 is authoritative. Preserve the real skin character visible in Image 1: pores, fine texture, tiny blemishes, fine lines, under-eye texture, natural tonal variation and non-uniform surface detail. Do not smooth, airbrush, denoise, blur, wax, porcelainize, repaint, synthesize fake pores, whiten, add heavy makeup, add plastic gloss or apply a beauty filter. Keep the original complexion. At GENERATION TIME, even out uneven illumination and reduce only broad, unwanted facial/neck shadow and dark discoloration by a subtle target of approximately 15% relative to Image 1, adaptive to its actual exposure. Keep the person's natural base complexion and the same photographic lighting direction; preserve natural jaw/nose contours, realistic under-eye structure and all high-frequency skin detail, pore contrast, freckles, fine lines and sharpness. This is low-frequency light/tonal balancing, not smoothing, skin replacement, face regeneration, makeup, whitening or flattening shadows to zero. Match the GENERATED neck's color, exposure and texture continuously to the original face, with no brighter neck, hard seam or plastic surface. Do not apply the 15% again to an already corrected region.

SUBTLE NATURAL ROSY MAKEUP — GENERATION ONLY: In addition to the existing adaptive skin exposure and gentle cheek/lip tint, apply an exceptionally light, source-aware healthy rosy finish, like understated professional studio makeup. Keep the original eyebrow hairs, brow thickness, arch and position EXACTLY; only gently tidy their visible tonal definition without drawing or filling new brows. Keep the original eye shape, size, spacing, iris, eyelashes and eyelids EXACTLY; allow only a barely perceptible natural definition along existing upper lash lines, never eyeliner wings, false lashes, enlarged eyes or altered gaze. Add a faint translucent soft pink warmth to the existing cheek skin and a muted pale rosy tint to the existing lips, following each person's original skin and lip pigmentation rather than applying uniform pink. Preserve lip contour, expression, skin pores, moles, freckles, natural asymmetry and all high-frequency detail. No foundation mask, blush circles, heavy lipstick, eyeshadow, whitening, facial reshaping or new facial features. The result must still look like the exact original person photographed in balanced studio light, not a different or made-up face. Do not add the cheek/lip tint a second time when the application's existing automatic skin finish runs.

HAIR ONLY — STRICT FACE-SAFE EDIT: ${keepOriginalHair?"preserve the original hairstyle geometry from Image 1, but refine only the hair itself so its overall volume and outer silhouette look naturally balanced with the subject's existing face and skull. Do not change the hairline where it touches forehead/temples, and do not alter any face or skin pixels.":"change ONLY the hair region to follow Image 2. Match its parting, fringe, side shape, crown, length and tied/untied structure, but adapt ONLY the hair volume and outer silhouette so the hairstyle is naturally proportioned to Image 1's existing face, skull, ears and head size. The hairstyle reference has ZERO authority over face, skin, complexion, lighting or head/face geometry."}

HAIR REALISM: render photographic human hair with natural root direction, fine individual strands, strand separation, irregular density, subtle flyaways and realistic overlapping layers. Avoid a solid hair mass, painted texture, plastic shine, overly smooth strands, artificial edge halos or excessive sharpening. Preserve believable studio-light highlights so strand detail remains visible.

HAIR COLOR — NATURAL PRO BLACK 50%: on HAIR PIXELS ONLY, blend toward a restrained neutral professional deep black with approximately 50% visual strength, adapting to the subject/reference natural base color; do not turn naturally light hair into black unless the chosen hairstyle calls for dark hair. Keep realistic brown/charcoal tonal variation and specular highlights; do NOT make the hair flat jet-black, crush shadow detail, tint the skin, or darken eyebrows/eyelashes.

ABSOLUTE EXCLUSION MASK INSTRUCTION: the anatomy, identity and fine skin detail of forehead, temples, eyebrows, eyelashes, eyes, nose, cheeks, ears, lips, jaw and chin are protected and must remain governed exclusively by Image 1; only the subtle low-frequency 15% illumination correction and the explicitly limited, source-aware rosy tonal finish described above are allowed. Hair balancing, strand refinement and Pro Black 50% must affect HAIR PIXELS ONLY. Do not resize, warp, retouch, recolor or regenerate the face to make it fit the hairstyle; fit the hairstyle to the unchanged face instead.

OUTPUT / ANATOMY: centered front-facing ID-photo head, complete hair and ears, plus a jaw-proportional, naturally tapered neck and small upper-sternum skin extension continuing approximately 35% deeper than the earlier short-neck result, fully covering the lowest V-shaped shirt opening and continuing behind its fabric; the skin must reach below the bottom of that opening without a white or transparent wedge. Do not lengthen the visible chin-to-collar distance or generate a bare torso. Generate only the modest neck/upper-sternum skin area needed beneath the fully clothed fixed template; no breasts, cleavage or nudity. No shirt, collar, tie, jacket, uniform, epaulettes, insignia, buttons, white neck insert, flat white patch, rectangular blank region or fabric. Use a medium-blue temporary solid background, never white. Keep natural camera detail without halos or artificial sharpening.

FINAL PRIORITY: (1) same identity and face from Image 1, (2) real skin texture from Image 1, (3) selected hairstyle only from Image 2 when supplied, (4) proportionate generated hair/neck, subtle 15% low-frequency shadow balance and barely perceptible rosy makeup with intact pores. Return a single coherent photographic person layer, not a face mask or pasted face.`

    const form=new FormData();
    form.append("model","gpt-image-1.5");
    // Both genders use the same edit prompt and two-image ordering:
    // Image 1 = the customer's first upload, Image 2 = selected hair PNG.
    // No reference-model face is sent to the image editor.
    // Female hairstyle guidance uses only the selected hair cutout, never a model face.
    // Keep the existing face/skin/neck processing prompt unchanged.
    const femaleSelectedHair=/^hair-\d{2}$/.test(hairId);
    // Hairstyle-specific silhouette guidance, NOT a new face/skin pipeline.
    // The cutout for hair-25 is a SHORT pixie: without explicit removal of the
    // original back hair, image editing may keep the uploaded long hairstyle.
    const femaleShortCut=hairId==='hair-25';
    const femaleTiedCut=/^hair-(18|20|21|22|23|24|26|27|28|29)$/.test(hairId);
    const selectedHairGeometry=femaleShortCut
      ? `SELECTED CUT hair-25 IS SHORT: swept side fringe and a short tapered pixie silhouette. NO long hair behind ears, NO hair behind neck, NO hair falling onto shoulders or uniform. Fully REMOVE the original long back/side hair and reconstruct only the studio background where that old hair was. Preserve the existing forehead SKIN and original face; change only hair pixels and formerly hair-covered background.`
      : femaleTiedCut
        ? `SELECTED CUT IS TIED/PULLED BACK: do not retain the original loose long hair falling down either side of the neck or over shoulders. Follow the selected cutout's actual back-hair silhouette and keep the existing face and skin unchanged.`
        : `Replace the uploaded hairstyle's old side and back silhouette, not only the fringe; use the selected cutout's actual length and shape.`;
    const finalPrompt=femaleSelectedHair && !keepOriginalHair
      ? prompt+`\n\nHAIRSTYLE MATCH (IMAGE 2 ONLY): Match the selected cutout's part, fringe, crown, outer silhouette and length. ${selectedHairGeometry} HAIRLINE / STRAY-HAIR FIDELITY: The selected cutout in Image 2 is the authority for whether there are loose strands, side tendrils, baby hairs, wisps or bangs along the forehead, temples, cheeks, ears and neck. If they are ABSENT from Image 2, do NOT preserve them from the customer's old hairstyle and do NOT invent any. Remove only those obsolete hair strands, reconstruct the formerly hair-covered original skin or blue background naturally, and leave all existing uncovered face and skin pixels, features, complexion and the existing skin-processing instructions unchanged. Do not erase or redraw eyebrows, eyelashes or actual skin texture. No added side locks or loose wisps for a clean pulled-back hairstyle. The customer's original photo (Image 1) remains the ONLY face and skin source; do not change face shape, features, complexion, skin texture, or existing skin processing.`
      : prompt;
    form.append("prompt",finalPrompt);
    form.append("input_fidelity","high");
    form.append("quality","high");
    form.append("size","1024x1536");
    form.append("output_format","png");
    // Match PNG MIME and filename to actual bytes in the male-hair path.
    const portraitBytes=maleHairReplacement
      ?await sharp(inputFile.buffer,{failOn:"error"}).rotate().toColourspace("srgb").png().toBuffer()
      :inputFile.buffer;
    form.append("image[]",new Blob([portraitBytes],{type:maleHairReplacement?"image/png":(inputFile.mimetype||"image/png")}),maleHairReplacement?"portrait.png":(inputFile.originalname||"portrait.png"));
    if(inpaint) form.append("mask",new Blob([maskFile.buffer],{type:"image/png"}),"hair-mask.png");
    if(!keepOriginalHair) form.append("image[]",new Blob([hairBuf],{type:"image/png"}),`${hairId}.png`);

    if(!creditUse){creditUse=await requireCredit(req,res,"ai-finish");if(!creditUse)return;}
    const r=await fetch("https://api.openai.com/v1/images/edits",{
      method:"POST",headers:{Authorization:`Bearer ${key}`},body:form
    });
    const body=await r.json();
    if(!r.ok){
      const code=body?.error?.code || "image_edit_failed";
      const stage=body?.error?.moderation_details?.moderation_stage;
      if(code==="moderation_blocked" || code==="safety_violations"){
        console.error("OpenAI image edit safety block", JSON.stringify({code,moderation_details:body?.error?.moderation_details,request_id:r.headers.get("x-request-id")}));
        await refundCredit(creditUse.usageId); creditUse=null;
        return res.status(r.status).send(`OpenAI image edit safety block${stage?` (${stage})`:""}. ระบบตรวจสอบผลลัพธ์ไม่อนุญาตให้ส่งภาพกลับมา (คืนสิทธิ์แล้ว) — คงภาพเดิมไว้ ไม่มีการลองซ้ำอัตโนมัติ`);
      }
      await refundCredit(creditUse.usageId); creditUse=null;
      return res.status(r.status).send("OpenAI image edit: "+JSON.stringify(body));
    }
    const b64=body?.data?.[0]?.b64_json;
    if(!b64){await refundCredit(creditUse.usageId);creditUse=null;return res.status(500).send("OpenAI ไม่ได้ส่งภาพกลับมา (คืนสิทธิ์แล้ว)");}
    const data=Buffer.from(b64,"base64");
    res.set("Content-Type","image/png");
    res.set("Cache-Control","no-store");
    await commitCredit(creditUse.usageId);
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
  const req={body:job.fields||{},files:{image:[{buffer:job.image,originalname:job.image_name,mimetype:job.image_type}],mask:job.mask?[{buffer:job.mask,originalname:job.mask_name,mimetype:job.mask_type}]:[]},preReservedCreditUse:{usageId:job.usage_id,credits:null},get(name){return String(name).toLowerCase()==='x-wallet-id'?job.wallet_id:''}};
  const cap=captureResponse();await aiFinishHandler(req,cap.res);await cap.done;const out=cap.get();
  if(out.statusCode>=200&&out.statusCode<300&&out.payload?.length)await completeAiJob(id,out.payload);else{await refundCredit(job.usage_id);await failAiJob(id,out.payload?.toString('utf8')||`AI processing failed (${out.statusCode})`);}
 }catch(e){console.error('AI job:',id,e);if(job?.usage_id)try{await refundCredit(job.usage_id)}catch{};try{await failAiJob(id,e.message)}catch{}}finally{activeAiJobs.delete(id)}
}
app.post('/api/ai-jobs',upload.fields([{name:'image',maxCount:1},{name:'mask',maxCount:1}]),async(req,res)=>{
 let creditUse=null;
 try{const image=req.files?.image?.[0],mask=req.files?.mask?.[0];if(!image)return res.status(400).json({error:'image_required'});if(req.body?.mode==='hair-inpaint'&&!mask)return res.status(400).json({error:'mask_required'});creditUse=await requireCredit(req,res,'ai-finish');if(!creditUse)return;const id=await createAiJob({walletId:walletId(req),usageId:creditUse.usageId,fields:req.body,image,mask});res.status(202).json({jobId:id,status:'queued',generationRemaining:Number(creditUse.generationRemaining||0),hairRemaining:Number(creditUse.hairRemaining||0),trialPreview:Boolean(creditUse.trialPreview)});setImmediate(()=>runAiJob(id))}
 catch(e){if(creditUse)await refundCredit(creditUse.usageId);console.error('Create AI job:',e);if(!res.headersSent)res.status(500).json({error:'job_create_failed',message:e.message})}
});
app.get('/api/ai-jobs/:id',async(req,res)=>{try{const j=await getAiJob(req.params.id,walletId(req));if(!j)return res.status(404).json({error:'job_not_found'});res.json(j)}catch(e){res.status(500).json({error:'job_status_failed'})}});
app.get('/api/ai-jobs/:id/result',async(req,res)=>{try{const j=await getAiJobResult(req.params.id,walletId(req));if(!j)return res.status(404).send('ไม่พบงาน');if(j.status==='failed')return res.status(409).send(j.error||'ประมวลผลไม่สำเร็จ');if(j.status!=='completed'||!j.result)return res.status(202).send('กำลังประมวลผล');res.type('png').set('Cache-Control','no-store').set('X-IDPROM-Trial',String(j.usage_id||'').startsWith('trial_')?'1':'0').send(j.result)}catch(e){res.status(500).send('โหลดผลลัพธ์ไม่สำเร็จ')}});
const resumeQueuedAiJobs=async()=>{try{for(const id of await queuedAiJobs())setImmediate(()=>runAiJob(id))}catch(e){console.error('Resume AI jobs:',e)}};
setTimeout(resumeQueuedAiJobs,1500);
setInterval(resumeQueuedAiJobs,60000);

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
