import {SavedWorks} from './saved-works.jsx';
import {deliverImage} from './image-download.js';
import React,{useEffect,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import{FilesetResolver,FaceLandmarker,ImageSegmenter}from'@mediapipe/tasks-vision';
import'./style.css';
import {StudioEditor} from './studio-editor.jsx';
import {makeupMask,blendMakeupPixels} from './makeup-pixels.js';
import {blendHairlineSeam} from './hairline-seam.js';
import {PackageOffers} from './package-offers.jsx';
import {savePurchaseDraft,loadPurchaseDraft} from './purchase-draft.js';
import{analyticsContext,analyticsEvent,analyticsCheckout,analyticsPurchase,analyticsTagError,analyticsProcessFailure}from'./analytics.js';
import{PHOTO_SIZES,DEFAULT_PHOTO_CROP,PhotoSizeEditor,cropPhotoForDownload}from'./photo-size.jsx';

const WALLET_KEY='idprom_wallet_id';
const AUTH_TOKEN_KEY='idprom_auth_token';
function authToken(){try{return localStorage.getItem(AUTH_TOKEN_KEY)||''}catch{return ''}}
function authHeaders(){const token=authToken();return token?{Authorization:`Bearer ${token}`}:{}}
function currentWalletId(){try{return localStorage.getItem(WALLET_KEY)||''}catch{return ''}}
const PRIVATE_TRIAL_KEY='idprom-private-trial-active';
// Normal visits never inherit the private owner's unlimited session.
try{localStorage.removeItem(PRIVATE_TRIAL_KEY)}catch{}
function browserTrialTraits(){try{return JSON.stringify([navigator.platform,navigator.hardwareConcurrency||0,screen.width,screen.height,screen.colorDepth,Intl.DateTimeFormat().resolvedOptions().timeZone])}catch{return 'unknown'}}
async function verifyOutputRights(jobId){if(!jobId)return {unlocked:false,fullEdit:false};try{const r=await fetch('/api/images/'+encodeURIComponent(jobId)+'/rights',{headers:walletHeaders(),cache:'no-store'});return r.ok?await r.json():{unlocked:false,fullEdit:false}}catch{return {unlocked:false,fullEdit:false}}}
function privateTrialRequested(){try{return localStorage.getItem(PRIVATE_TRIAL_KEY)==='1'}catch{return false}}
function walletHeaders(){const id=currentWalletId();return {'X-IDPROM-Device':browserTrialTraits(),...authHeaders(),...(id?{'X-Wallet-Id':id}:{}),...(privateTrialRequested()?{'X-IDPROM-Private-Trial':'1'}:{})}}
function updateCreditsFromResponse(response){const value=response.headers.get('X-Rights-Remaining');if(value){try{window.dispatchEvent(new CustomEvent('idprom-rights',{detail:JSON.parse(value)}))}catch{}}}

const ACTIVE_AI_JOB_KEY='idprom-active-ai-job-v1';
const AI_JOB_DB='idprom-ai-jobs-v1';
function aiJobDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(AI_JOB_DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('files'))req.result.createObjectStore('files')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function saveAiJobFile(file){const db=await aiJobDb();await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(file,'original');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}
async function loadAiJobFile(){const db=await aiJobDb();const file=await new Promise((resolve,reject)=>{const tx=db.transaction('files','readonly');const req=tx.objectStore('files').get('original');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});db.close();return file}
async function clearAiJobFile(){try{const db=await aiJobDb();await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').delete('original');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch{}}
function readActiveAiJob(){try{return JSON.parse(localStorage.getItem(ACTIVE_AI_JOB_KEY)||'null')}catch{return null}}
function writeActiveAiJob(value){if(value)localStorage.setItem(ACTIVE_AI_JOB_KEY,JSON.stringify(value));else localStorage.removeItem(ACTIVE_AI_JOB_KEY)}
async function waitForAiJob(jobId,onStatus){for(;;){const r=await fetch('/api/ai-jobs/'+encodeURIComponent(jobId),{headers:walletHeaders(),cache:'no-store'});if(!r.ok)throw analyticsTagError(Error(await r.text()||'ตรวจสถานะงานไม่สำเร็จ'),{error_stage:'poll_job',http_status:r.status});const j=await r.json();onStatus?.(j.status);if(j.status==='failed')throw analyticsTagError(Error(j.error||'ประมวลผลไม่สำเร็จ'),{error_stage:'ai_job'});if(j.status==='completed'){const out=await fetch('/api/ai-jobs/'+encodeURIComponent(jobId)+'/result',{headers:walletHeaders(),cache:'no-store'});if(!out.ok)throw analyticsTagError(Error(await out.text()||'โหลดผลลัพธ์ไม่สำเร็จ'),{error_stage:'fetch_result',http_status:out.status});const blob=await out.blob();const verified=await verifyOutputRights(jobId);blob.idpromTrial=!verified.unlocked;blob.idpromJobId=jobId;window.dispatchEvent(new CustomEvent('idprom-output-job',{detail:{jobId,isTrial:blob.idpromTrial,fullEdit:verified.fullEdit}}));return blob}await new Promise(resolve=>setTimeout(resolve,1800))}}

let landmarkerPromise;
let segmenterPromise;
async function getPersonSegmenter(){
 if(!segmenterPromise) segmenterPromise=(async()=>{
  const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
  return ImageSegmenter.createFromOptions(vision,{
   baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite'},
   runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false
  });
 })();
 return segmenterPromise;
}
async function semanticProtectedSkinMask(image,W,H){
 // MediaPipe selfie-multiclass labels: 0 background, 1 hair, 2 body-skin,
 // 3 face-skin, 4 clothes, 5 other/accessories. Protect skin + clothes exactly;
 // hair deliberately remains editable. If segmentation is unavailable the caller
 // keeps the landmark hard-protection fallback instead of weakening protection.
 const seg=await getPersonSegmenter();
 const result=await new Promise((ok,bad)=>{try{seg.segment(image,r=>ok(r))}catch(e){bad(e)}});
 const mask=result?.categoryMask;if(!mask)return null;
 try{
  const mw=mask.width||256,mh=mask.height||256,cat=mask.getAsUint8Array();
  const small=document.createElement('canvas');small.width=mw;small.height=mh;
  const sc=small.getContext('2d'),id=sc.createImageData(mw,mh);
  for(let i=0;i<cat.length;i++){
   const v=cat[i],a=(v===2||v===3||v===4)?255:0,j=i*4;
   id.data[j]=id.data[j+1]=id.data[j+2]=255;id.data[j+3]=a;
  }
  sc.putImageData(id,0,0);
  const out=document.createElement('canvas');out.width=W;out.height=H;
  const oc=out.getContext('2d');oc.imageSmoothingEnabled=false;oc.drawImage(small,0,0,W,H);
  return out;
 }finally{mask.close?.()}
}


async function semanticClassMask(image,W,H,classes){
 const seg=await getPersonSegmenter();
 const result=await new Promise((ok,bad)=>{try{seg.segment(image,r=>ok(r))}catch(e){bad(e)}});
 const mask=result?.categoryMask;if(!mask)return null;
 try{
  const mw=mask.width||256,mh=mask.height||256,cat=mask.getAsUint8Array(),wanted=new Set(classes);
  const small=document.createElement('canvas');small.width=mw;small.height=mh;
  const sc=small.getContext('2d'),id=sc.createImageData(mw,mh);
  for(let i=0;i<cat.length;i++){const a=wanted.has(cat[i])?255:0,j=i*4;id.data[j]=id.data[j+1]=id.data[j+2]=255;id.data[j+3]=a}
  sc.putImageData(id,0,0);
  const out=document.createElement('canvas');out.width=W;out.height=H;const oc=out.getContext('2d');oc.imageSmoothingEnabled=false;oc.drawImage(small,0,0,W,H);return out;
 }finally{mask.close?.()}
}

async function getLandmarker(){
 if(!landmarkerPromise) landmarkerPromise=(async()=>{
  const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
  return FaceLandmarker.createFromOptions(vision,{
   baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'},
   runningMode:'IMAGE',numFaces:1,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5
  });
 })();
 return landmarkerPromise;
}
const staticImageCache=new Map();
function loadImage(src){
 // Cache decoded immutable app assets only. User photos/blob URLs remain fresh.
 const reusable=typeof src==='string'&&src.startsWith('/assets/');
 if(reusable&&staticImageCache.has(src)){const hit=staticImageCache.get(src);staticImageCache.delete(src);staticImageCache.set(src,hit);return hit}
 const pending=new Promise((ok,bad)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=bad;im.src=src});
 if(reusable){staticImageCache.set(src,pending);while(staticImageCache.size>12)staticImageCache.delete(staticImageCache.keys().next().value);pending.catch(()=>{if(staticImageCache.get(src)===pending)staticImageCache.delete(src)})}
 return pending;
}
function interp(points,x){
 for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1];if(x>=a.x&&x<=b.x){const t=(x-a.x)/Math.max(1,b.x-a.x);return a.y+(b.y-a.y)*t}}
 return null;
}
async function headOnly(blob){
 const url=URL.createObjectURL(blob);
 try{
  const im=await loadImage(url),W=im.naturalWidth,H=im.naturalHeight;
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);
  const data=ctx.getImageData(0,0,W,H),px=data.data;
  const lm=(await getLandmarker()).detect(im).faceLandmarks?.[0];
  if(!lm) throw Error('ตรวจจับกรอบหน้าไม่สำเร็จ กรุณาใช้รูปหน้าตรงที่เห็นใบหน้าชัด');

  // MediaPipe ใช้เพื่อหา ROI/ตำแหน่งเท่านั้น ไม่ใช้เส้น landmark เป็นขอบตัดสุดท้าย
  const jawIdx=[234,93,132,58,172,136,150,149,176,148,152,377,400,378,379,365,397,288,361,323,454];
  const jaw=jawIdx.map(i=>({x:lm[i].x*W,y:lm[i].y*H})).sort((a,b)=>a.x-b.x);
  const left=jaw[0],right=jaw[jaw.length-1],faceW=right.x-left.x;
  const band=Math.max(10,faceW*.07), search=Math.max(7,faceW*.045);

  // หา "ขอบ alpha จริง" ใกล้แนวกราม: ไล่จากด้านล่างขึ้นบนจนพบ foreground
  // จึงเกาะ pixel ของผิวจริงแทนการตัดตามเส้นเรขาคณิต
  const samples=[];
  const x0=Math.max(0,Math.floor(left.x-faceW*.025)),x1=Math.min(W-1,Math.ceil(right.x+faceW*.025));
  for(let x=x0;x<=x1;x++){
   let seed;
   if(x>=left.x&&x<=right.x) seed=interp(jaw,x);
   else seed=x<left.x?left.y:right.y;
   if(seed==null)continue;
   const top=Math.max(0,Math.floor(seed-search)),bot=Math.min(H-1,Math.ceil(seed+band));
   let edge=null;
   // หา pixel สุดท้ายของ foreground ที่ต่อเนื่องกับใบหน้าในแถบ ROI
   for(let y=bot;y>=top;y--){
    const a=px[(y*W+x)*4+3];
    if(a>=24){edge=y;break;}
   }
   if(edge!=null)samples.push({x,y:edge});
  }
  if(samples.length<Math.max(20,faceW*.25)) throw Error('วิเคราะห์ขอบกรามจริงไม่สำเร็จ');

  // median filter ป้องกันรู/เส้นผม/เศษ alpha ทำให้ contour กระโดด
  const raw=new Map(samples.map(q=>[q.x,q.y])), contour=[];
  const radius=Math.max(2,Math.round(faceW*.008));
  for(const q of samples){
   const ys=[];
   for(let xx=q.x-radius;xx<=q.x+radius;xx++)if(raw.has(xx))ys.push(raw.get(xx));
   ys.sort((a,b)=>a-b);
   contour.push({x:q.x,y:ys[Math.floor(ys.length/2)]});
  }

  // จำกัด contour ให้อยู่ใกล้ anatomy ของกราม ป้องกัน alpha ของคอถูกเข้าใจเป็นหน้า
  for(const q of contour){
   let seed=q.x>=left.x&&q.x<=right.x?interp(jaw,q.x):(q.x<left.x?left.y:right.y);
   const maxDown=seed+faceW*.035;
   q.y=Math.min(q.y,maxDown);
  }

  // V3 matte: เก็บ alpha remove.bg เดิมทั้งหมดเหนือ contour
  // และทำ coverage anti-alias เฉพาะ 1 pixel รอบขอบจริงเท่านั้น
  const edgeAA=Math.max(.75,Math.min(1.35,faceW*.004));
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const ai=(y*W+x)*4+3,orig=px[ai];if(orig===0)continue;
   let boundary=null;
   if(x>=contour[0].x&&x<=contour[contour.length-1].x)boundary=interp(contour,x);
   else if(x<contour[0].x)boundary=contour[0].y;
   else boundary=contour[contour.length-1].y;
   if(boundary==null)continue;
   const d=y-boundary;
   if(d>edgeAA)px[ai]=0;
   else if(d>-edgeAA){
    const coverage=Math.max(0,Math.min(1,(edgeAA-d)/(2*edgeAA)));
    // preserve original remove.bg alpha; only multiply coverage
    px[ai]=Math.round(orig*coverage);
   }
  }

  // RGB decontamination เฉพาะ pixel กึ่งโปร่งใสที่ขอบกราม:
  // ดึงสีจาก pixel ด้านใน 2px ลด halo โดยไม่แตะใบหน้าส่วนทึบ
  const copy=new Uint8ClampedArray(px);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
   const i=(y*W+x)*4,a=px[i+3];
   if(a<=0||a>=245)continue;
   let best=null,bestA=a;
   for(let dy=-3;dy<=0;dy++)for(let dx=-2;dx<=2;dx++){
    const yy=y+dy,xx=x+dx;if(yy<0||xx<0||yy>=H||xx>=W)continue;
    const j=(yy*W+xx)*4,aa=copy[j+3];
    if(aa>bestA){bestA=aa;best=j;}
   }
   if(best!=null&&bestA>180){px[i]=copy[best];px[i+1]=copy[best+1];px[i+2]=copy[best+2];}
  }

  ctx.putImageData(data,0,0);
  if(liveCanvas)return c; // Display directly: no JPEG/PNG encoding while the pointer is moving.
  return await new Promise((ok,bad)=>c.toBlob(v=>v?ok(v):bad(Error('สร้าง PNG ไม่สำเร็จ')),'image/png'));
 }finally{URL.revokeObjectURL(url)}
}
async function alphaBounds(img){
 const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
 const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);
 const d=x.getImageData(0,0,c.width,c.height).data;
 let l=c.width,t=c.height,r=-1,b=-1;
 for(let y=0;y<c.height;y++)for(let xx=0;xx<c.width;xx++){
  if(d[(y*c.width+xx)*4+3]>12){if(xx<l)l=xx;if(xx>r)r=xx;if(y<t)t=y;if(y>b)b=y;}
 }
 return r>=l?{l,t,r,b,w:r-l+1,h:b-t+1}:{l:0,t:0,r:c.width-1,b:c.height-1,w:c.width,h:c.height};
}

async function composePortrait(headBlob,adjust={scale:1,x:0,y:0},templatePath='/assets/uniform.png'){
 const [bg,uniformImg]=await Promise.all([loadImage('/assets/background.jpg'),loadImage(templatePath)]);
 const headURL=URL.createObjectURL(headBlob);
 try{
  const head=await loadImage(headURL), uniform=uniformImg;
  const hb=await alphaBounds(head);
  const face=(await getLandmarker()).detect(head).faceLandmarks?.[0];
  if(!face) throw Error('ตรวจจับสัดส่วนใบหน้าหลังตัดศีรษะไม่สำเร็จ');

  const W=bg.naturalWidth,H=bg.naturalHeight;
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const ctx=c.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(bg,0,0,W,H);

  // V158 PROPORTIONAL EDGE-FIT BODY MASTER:
  // Fit the REAL opaque width to the frame with one uniform X/Y scale. The collar
  // socket is re-anchored after scaling, so the outfit reaches both side edges
  // without looking horizontally stretched or vertically compressed.
  const ub=await alphaBounds(uniform);
  const edgeBleed=2;
  const collarCX=W*.5;
  // V12: anchor the anatomy to the REAL first opaque row of the uniform PNG.
  // The old .015 estimate pointed into transparent padding and made AI invent a long neck.
  // V14: COLLAR SOCKET ANCHOR — ห้ามใช้ pixel ทึบแถวแรกของทั้งชุด เพราะนั่นคือปลายปก/บ่า
  // ซึ่งอยู่สูงกว่าช่องคอกลางจริงมากและเป็นสาเหตุหลักที่ทำให้ AI เติมคอยาว
  // หา pixel ทึบแถวแรกเฉพาะบริเวณกึ่งกลางชุด (ช่องคอ/ปมเนกไท) แล้วใช้เป็น socket จริง
  const uc=document.createElement('canvas'); uc.width=uniform.naturalWidth; uc.height=uniform.naturalHeight;
  const ux=uc.getContext('2d',{willReadFrequently:true}); ux.drawImage(uniform,0,0);
  const ud=ux.getImageData(0,0,uc.width,uc.height).data;
  const cx0=Math.floor(uc.width*.46), cx1=Math.ceil(uc.width*.54);
  let socketY=ub.t;
  outer: for(let y=ub.t;y<=ub.b;y++){
    let opaque=0;
    for(let x=cx0;x<=cx1;x++){ if(ud[(y*uc.width+x)*4+3]>48) opaque++; }
    if(opaque>=(cx1-cx0+1)*.12){ socketY=y; break outer; }
  }
  const approvedScale=(W*.94)/uniform.naturalWidth;
  const approvedCollarSocketY=H*.425+socketY*approvedScale;
  const uScale=(W+edgeBleed*2)/Math.max(1,ub.w);
  const uW=uniform.naturalWidth*uScale,uH=uniform.naturalHeight*uScale;
  const uX=-edgeBleed-ub.l*uScale;
  const uY=approvedCollarSocketY-socketY*uScale;
  const collarSocketY=approvedCollarSocketY;
  // V15: SHOULDER-RELATIVE BODY MASTER
  // หลังวางตำแหน่งคางแล้ว ขนาดหัวขั้นสุดท้ายต้องอิงไหล่ของชุด ไม่ใช่กรอบ input
  // ใช้ช่วงไหล่ของ template เป็น physical reference คงที่สำหรับทุกภาพต้นฉบับ
  // Head normalization stays tied to the approved 94% body master. Horizontal
  // edge fitting must not make the person's head larger.
  const shoulderSpan=W*.94*.84;
  const targetHeadToShoulder=.385; // optical adult ID-photo balance for this fixed template
  const targetHeadW=shoulderSpan*targetHeadToShoulder;

  // FACE MASTER SCALE V10
  // วัดจาก landmark บนใบหน้าจริง (ขมับ/กราม) ไม่ใช้กรอบภาพ ไม่ใช้คอเดิม และไม่ใช้ alpha ของทรงผม
  // ดังนั้นภาพที่ถ่ายใกล้/ไกลจะถูก normalize ให้ขนาดหัวมาตรฐานเดียวกันก่อนประกอบ
  const L=face[234],R=face[454],chin=face[152],forehead=face[10];
  const le=face[33],re=face[263]; // outer eye anchors: stable even when jaw/hair shapes differ
  const sourceFaceW=Math.hypot((R.x-L.x)*head.naturalWidth,(R.y-L.y)*head.naturalHeight);
  const sourceFaceH=Math.hypot((chin.x-forehead.x)*head.naturalWidth,(chin.y-forehead.y)*head.naturalHeight);
  const sourceEyeW=Math.hypot((re.x-le.x)*head.naturalWidth,(re.y-le.y)*head.naturalHeight);
  if(sourceFaceW<20||sourceFaceH<20||sourceEyeW<12) throw Error('วัดขนาดใบหน้าไม่สำเร็จ');

  // V11 CANONICAL FACE NORMALIZATION
  // ไม่ใช้ค่าจุดเดียวตัดสิน scale เพราะรูปหน้าแต่ละคนกว้าง/แคบและ AI อาจตีกรามต่างกัน
  // ใช้ 3 anchor อิสระ (ตา, ความสูงหน้า, ความกว้างขมับ) แล้วหา median scale
  // ทำให้ภาพ close-up / ครึ่งตัว / ถ่ายไกล เข้าสู่ระยะใบหน้ามาตรฐานเดียวกัน
  // V12 TEMPLATE-DRIVEN CANONICAL HEAD SCALE
  // ทุก input ถูก normalize เข้าสู่ optical size เดียวกันบน template ก่อนเสมอ
  // outer-eye distance เป็น master เพราะไม่ขึ้นกับทรงผม/คอ/ระยะกล้องต้นฉบับ
  const targetEyeW=W*.160;
  const targetFaceW=targetEyeW/.455;
  const targetFaceH=targetFaceW*1.16;
  const eyeScale=targetEyeW/sourceEyeW;
  const widthScale=targetFaceW/sourceFaceW;
  const heightScale=targetFaceH/sourceFaceH;
  // eye anchor 70%, face geometry 30%; clamp geometry correction to stop narrow/wide faces changing apparent head size
  const geomScale=(widthScale+heightScale)*.5;
  let canonicalScale=eyeScale*.70+Math.max(eyeScale*.92,Math.min(eyeScale*1.08,geomScale))*.30;

  // V15 SECOND PASS — PLACE FIRST, THEN BALANCE HEAD AGAINST TEMPLATE SHOULDERS.
  // hb.w is the extracted head/hair silhouette width. It is used only after facial normalization,
  // so close-up / distant / half-body source framing cannot make the final head small or huge.
  const normalizedHeadW=hb.w*canonicalScale;
  const shoulderCorrection=targetHeadW/Math.max(1,normalizedHeadW);
  // conservative correction: preserve identity geometry while eliminating visibly tiny/oversized heads
  const corrected=Math.max(.90,Math.min(1.18,shoulderCorrection));
  // V17: หลังได้ตำแหน่ง V16 แล้ว เพิ่ม optical head size เล็กน้อยให้สัมพันธ์กับช่วงไหล่มากขึ้น
  // ใช้ multiplier ภายใน ไม่ผูกกับขนาด/crop ของภาพต้นฉบับ
  // V37 FINAL HEAD PROPORTION: after canonical face normalization and shoulder fitting,
  // reduce the final head block slightly so head/neck reads naturally against the fixed real uniform.
  // Uniform geometry is untouched; only the head layer scale changes, uniformly in X/Y.
  // V228: return to V226's original placement; proportion is handled when
  // the AI creates the hair and neck, not by shrinking the finished layer.
  const v37FinalHeadScale=1.35; // Larger initial head; retain the selected template collar anchor.
  let scale=canonicalScale*corrected*v37FinalHeadScale*(adjust.scale||1);
  scale=Math.max(.25,Math.min(4.0,scale));

  // ใช้ midpoint ของ landmark ซ้าย/ขวาเป็นแกนกลาง ป้องกัน alpha/hair ทำให้หัวเยื้อง
  const faceCX=((L.x+R.x)/2)*head.naturalWidth;
  const chinX=chin.x*head.naturalWidth, chinY=chin.y*head.naturalHeight;

  // Initial placement: anchor the detected chin at the vertical midpoint.
  // Keep the existing head scale, horizontal anchor and all user adjustments.
  const chinTargetY=H*.50;
  const hX=collarCX-faceCX*scale + (adjust.x||0)*W;
  const hY=chinTargetY-chinY*scale + (adjust.y||0)*H;
  const hW=head.naturalWidth*scale,hH=head.naturalHeight*scale;

  // background -> normalized head only -> original uniform template
  ctx.drawImage(head,hX,hY,hW,hH);
  ctx.drawImage(uniform,uX,uY,uW,uH);

  const blob=await new Promise((ok,bad)=>c.toBlob(v=>v?ok(v):bad(Error('สร้างภาพประกอบไม่สำเร็จ')),'image/png'));
  return {blob,lock:{W,H,hX,hY,scale,faceCX,chinY,headW:head.naturalWidth,headH:head.naturalHeight,opaqueHeadW:hb.w*scale,opaqueHeadTop:hb.t,placedFaceW:sourceFaceW*scale,shoulderSpan,uX,uY,uW,uH,collarSocketY,templatePath}};
 }finally{URL.revokeObjectURL(headURL)}
}


async function restoreIdentityCore(aiBlob,headBlob,lock,composedBlob){
 // AI ใช้เพื่อเติมคอ/ผมเท่านั้น จากนั้นวางใบหน้าต้นฉบับที่ normalize แล้วกลับคืน
 // ขั้นนี้เป็น geometry lock จริง จึงไม่ปล่อยให้ AI เปลี่ยน scale/ยืดหน้าในภาพสุดท้าย
 const aiURL=URL.createObjectURL(aiBlob),headURL=URL.createObjectURL(headBlob),baseURL=URL.createObjectURL(composedBlob);
 try{
  const ai=await loadImage(aiURL),head=await loadImage(headURL),base=await loadImage(baseURL);
  const face=(await getLandmarker()).detect(head).faceLandmarks?.[0];
  if(!face)return aiBlob;
  const c=document.createElement('canvas');c.width=lock.W;c.height=lock.H;
  const ctx=c.getContext('2d');
  // V34 ASPECT-RATIO LOCK: OpenAI returns 1024x1536 (2:3), while the V28 final canvas is 3:4.
  // Never stretch the AI image to the V28 canvas because that deforms the face/body horizontally.
  // Center-crop the AI output to the exact V28 aspect ratio first, then scale uniformly.
  const targetAR=lock.W/lock.H, aiAR=ai.naturalWidth/ai.naturalHeight;
  let sx=0,sy=0,sw=ai.naturalWidth,sh=ai.naturalHeight;
  if(aiAR<targetAR){ sh=sw/targetAR; sy=(ai.naturalHeight-sh)/2; }
  else if(aiAR>targetAR){ sw=sh*targetAR; sx=(ai.naturalWidth-sw)/2; }
  // V38: start from the locked V28 composition, never from a full-frame AI result.
  // This prevents any AI-generated uniform/epaulette/background from surviving behind the real template.
  ctx.drawImage(base,0,0,lock.W,lock.H);

  // AI may contribute ONLY inside a narrow central head/hair/neck window.
  // The window deliberately stops before the shoulder/epaulette zones.
  const aiCanvas=document.createElement('canvas'); aiCanvas.width=lock.W; aiCanvas.height=lock.H;
  const ac=aiCanvas.getContext('2d');
  ac.drawImage(ai,sx,sy,sw,sh,0,0,lock.W,lock.H);
  const headLeft=Math.max(0,Math.floor(lock.hX + lock.headW*lock.scale*.12));
  const headRight=Math.min(lock.W,Math.ceil(lock.hX + lock.headW*lock.scale*.88));
  const headTop=Math.max(0,Math.floor(lock.hY));
  const aiBottom=Math.min(lock.H,Math.round(lock.hY + lock.chinY*lock.headH*lock.scale + lock.W*.035));
  ctx.save();
  ctx.beginPath(); ctx.rect(headLeft,headTop,Math.max(1,headRight-headLeft),Math.max(1,aiBottom-headTop)); ctx.clip();
  ctx.drawImage(aiCanvas,0,0); ctx.restore();
  const m=document.createElement('canvas');m.width=lock.W;m.height=lock.H;
  const mc=m.getContext('2d');
  mc.drawImage(head,lock.hX,lock.hY,lock.headW*lock.scale,lock.headH*lock.scale);
  // protected face core: forehead -> cheeks -> jaw, feather edge; exclude outer hairstyle so AI hair remains visible
  const pts=[10,338,297,332,284,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,54,103,67,109];
  const mask=document.createElement('canvas');mask.width=lock.W;mask.height=lock.H;
  const x=mask.getContext('2d');x.beginPath();
  pts.forEach((id,i)=>{const q=face[id],px=lock.hX+q.x*lock.headW*lock.scale,py=lock.hY+q.y*lock.headH*lock.scale;(i?x.lineTo(px,py):x.moveTo(px,py));});
  x.closePath();x.fillStyle='#fff';x.fill();
  x.globalCompositeOperation='destination-in';
  // soften only the mask boundary without changing face geometry
  const tmp=document.createElement('canvas');tmp.width=lock.W;tmp.height=lock.H;tmp.getContext('2d').drawImage(mask,0,0);
  x.clearRect(0,0,lock.W,lock.H);
  // V18: broader but still local feather. It hides cutout/halo seams without blurring face pixels themselves.
  const feather=Math.max(3,Math.min(7,lock.W*.0045));
  x.filter=`blur(${feather}px)`;x.drawImage(tmp,0,0);x.filter='none';
  mc.globalCompositeOperation='destination-in';mc.drawImage(mask,0,0);
  // V26 REAL-SKIN LOCK: restore the original photographed face pixels directly.
  // No beauty pass, denoise, blur, synthetic texture, contrast remapping or heavy skin recoloring.
  // This is intentionally a pixel-preservation step: the AI may create only hair/neck transitions,
  // while the face interior comes back from the real source photo.
  // V28: NATURAL STUDIO SKIN — keep the real photographed face, then use a restrained
  // optical complexion blend to match the approved sample: smooth tonal transitions without
  // wax/plastic skin. This is local canvas processing, not AI face regeneration.
  // V35 PIPELINE LOCK:
  // Remove.bg has already been applied to the uploaded person BEFORE composePortrait().
  // AI is allowed to contribute only the head/skin/hair/very narrow neck transition.
  // Everything below the neck is restored from the untouched V28 composition.
  const restoreY=Math.max(0,Math.round(lock.hY + lock.chinY*lock.headH*lock.scale + lock.W*0.035));
  ctx.save();
  ctx.beginPath();ctx.rect(0,restoreY,lock.W,lock.H-restoreY);ctx.clip();
  ctx.drawImage(base,0,0,lock.W,lock.H);ctx.restore();

  // CRITICAL: overlay the ORIGINAL uniform PNG as the final pixel layer.
  // This happens AFTER AI and AFTER the neck seam. Therefore insignia, epaulettes, tie,
  // collar, buttons and every opaque uniform pixel never come from AI and retain the
  // exact sharpness/detail of the source template. Transparent neck socket remains open.
  const uniform=await loadImage(lock.templatePath||'/assets/uniform.png');
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(uniform,lock.uX,lock.uY,lock.uW,lock.uH);

  return await new Promise((ok,bad)=>c.toBlob(v=>v?ok(v):bad(Error('ล็อกองค์ประกอบ V28 ขั้นสุดท้ายไม่สำเร็จ')),'image/png'));
 }finally{URL.revokeObjectURL(aiURL);URL.revokeObjectURL(headURL);URL.revokeObjectURL(baseURL)}
}

// V68: no face/skin overlay or post-process mask.
// Keep the V66 AI head/face/skin/hair pixels as one continuous layer.

async function makeEditableHeadLayer(finishedBlob,personMaskBlob,lock){
 // V45: editable layer must contain ONLY hair + head + generated neck.
 // Never use the full remove.bg person silhouette here because AI may have painted a uniform/body.
 const fu=URL.createObjectURL(finishedBlob);
 try{
  const finalImg=await loadImage(fu);
  const c=document.createElement('canvas');c.width=lock.W;c.height=lock.H;
  const x=c.getContext('2d');x.drawImage(finalImg,0,0,lock.W,lock.H);

  // Build a strict anatomy mask: broad head/hair region + narrow central neck bridge only.
  // The neck stops at the real collar socket; shoulders, lapels, tie, insignia and epaulettes are excluded.
  const mask=document.createElement('canvas');mask.width=lock.W;mask.height=lock.H;
  const m=mask.getContext('2d');m.fillStyle='#fff';
  const headL=Math.max(0,lock.hX+lock.headW*lock.scale*.08);
  const headR=Math.min(lock.W,lock.hX+lock.headW*lock.scale*.92);
  const headT=Math.max(0,lock.hY);
  const chinY=lock.hY+lock.chinY*lock.headH*lock.scale;
  // Head/hair: stop just below jaw so no AI clothing can enter this block.
  m.fillRect(headL,headT,Math.max(1,headR-headL),Math.max(1,chinY-headT+lock.W*.012));
  // Neck: narrow trapezoid centered on the fixed collar, from under chin to collar socket.
  const faceW=(headR-headL);
  const neckTopW=Math.max(lock.W*.075,faceW*.25);
  const neckBotW=Math.max(lock.W*.060,faceW*.20);
  const neckTop=chinY-lock.W*.004;
  const neckBottom=Math.min(lock.H,lock.collarSocketY ?? (chinY+lock.W*.055));
  const cx=lock.W*.5;
  m.beginPath();
  m.moveTo(cx-neckTopW/2,neckTop);
  m.lineTo(cx+neckTopW/2,neckTop);
  m.lineTo(cx+neckBotW/2,neckBottom);
  m.lineTo(cx-neckBotW/2,neckBottom);
  m.closePath();m.fill();

  x.globalCompositeOperation='destination-in';x.drawImage(mask,0,0);
  x.globalCompositeOperation='source-over';
  return c;
 }finally{URL.revokeObjectURL(fu)}
}
async function makePlacedHeadNeckLayer(personBlob,lock){
 const url=URL.createObjectURL(personBlob);
 try{
  const im=await loadImage(url);
  const c=document.createElement('canvas');c.width=lock.W;c.height=lock.H;
  const x=c.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';
  // AI result is already background-removed and contains only head + hair + bare neck/clavicle.
  // Place this transparent anatomy layer at the exact normalized geometry; no uniform pixels can enter this layer.
  x.drawImage(im,lock.hX,lock.hY,lock.headW*lock.scale,lock.headH*lock.scale);
  return c;
 }finally{URL.revokeObjectURL(url)}
}

async function warpUniformCollar(uniform,amount=0,heightAmount=0){
 // V53: deterministic inverse-mapped collar warp.
 // Rebuild the collar ROI from the ORIGINAL template pixels instead of drawing shifted tiles
 // over the untouched collar. This removes the duplicated lower collar/neck edge.
 if(Math.abs(amount)<.001&&Math.abs(heightAmount)<.001)return uniform;
 const W=uniform.naturalWidth,H=uniform.naturalHeight;
 const src=document.createElement('canvas');src.width=W;src.height=H;
 const sx=src.getContext('2d',{willReadFrequently:true});sx.drawImage(uniform,0,0);
 const out=document.createElement('canvas');out.width=W;out.height=H;
 const ox=out.getContext('2d');ox.imageSmoothingEnabled=true;ox.imageSmoothingQuality='high';ox.drawImage(uniform,0,0);

 // Keep exactly the same V52 collar ROI/strength geometry.
 const cx=W*.50, roiL=Math.floor(W*.285), roiR=Math.ceil(W*.715), roiT=Math.floor(H*.015), roiB=Math.ceil(H*.36);
 const rw=roiR-roiL, rh=roiB-roiT;
 const source=sx.getImageData(roiL,roiT,rw,rh);
 const dest=new ImageData(rw,rh);
 const sd=source.data, dd=dest.data;
 const half=(roiR-roiL)/2;

 const displacement=(absX,absY)=>{
  const yn=(absY-roiT)/(roiB-roiT);
  const yFall=Math.pow(Math.max(0,1-yn),1.35);
  const xn=(absX-cx)/half;
  const xFall=Math.pow(Math.max(0,1-Math.abs(xn)),1.8);
  return Math.sign(xn||1)*amount*W*.075*xFall*yFall;
 };
 // Height control shares the same inverse-mapped collar ROI as the width control.
 // The displacement fades to zero at every ROI edge so the untouched template joins
 // without a visible seam. Positive values shorten the collar vertically.
 const verticalDisplacement=(absX,absY)=>{
  const yn=Math.max(0,Math.min(1,(absY-roiT)/(roiB-roiT)));
  const xn=Math.max(0,Math.min(1,(absX-roiL)/(roiR-roiL)));
  const fall=Math.pow(Math.sin(Math.PI*yn),2)*Math.pow(Math.sin(Math.PI*xn),.8);
  return heightAmount*H*.065*fall;
 };
 const sample=(fx,fy,di)=>{
  fx=Math.max(0,Math.min(rw-1,fx)); fy=Math.max(0,Math.min(rh-1,fy));
  const x0=Math.floor(fx), y0=Math.floor(fy), x1=Math.min(rw-1,x0+1), y1=Math.min(rh-1,y0+1);
  const tx=fx-x0, ty=fy-y0;
  const i00=(y0*rw+x0)*4, i10=(y0*rw+x1)*4, i01=(y1*rw+x0)*4, i11=(y1*rw+x1)*4;
  for(let c=0;c<4;c++){
   const a=sd[i00+c]*(1-tx)+sd[i10+c]*tx;
   const b=sd[i01+c]*(1-tx)+sd[i11+c]*tx;
   dd[di+c]=Math.round(a*(1-ty)+b*ty);
  }
 };

 for(let yy=0;yy<rh;yy++){
  const absY=roiT+yy;
  for(let xx=0;xx<rw;xx++){
   const absX=roiL+xx;
   // Invert xDest = xSource + displacement(xSource,y). A few fixed-point iterations
   // are deterministic and prevent source pixels from remaining underneath moved pixels.
   let srcX=absX;
   for(let k=0;k<5;k++) srcX=absX-displacement(srcX,absY);
   let srcY=absY;
   for(let k=0;k<5;k++) srcY=absY-verticalDisplacement(srcX,srcY);
   sample(srcX-roiL,srcY-roiT,(yy*rw+xx)*4);
  }
 }

 // Replace the ROI once. Falloff reaches zero at its lower/side boundaries, so it joins
 // the untouched template continuously without accumulating or double-drawing pixels.
 ox.putImageData(dest,roiL,roiT);
 return out;
}

async function warpPersonNeck(head,chinY,neckAdjust={width:0,length:0}){
 const width=Math.max(-1,Math.min(1,neckAdjust?.width||0));
 const length=Math.max(-1,Math.min(1,neckAdjust?.length||0));
 if(Math.abs(width)<.001&&Math.abs(length)<.001)return head;
 const W=head.naturalWidth||head.width,H=head.naturalHeight||head.height;
 const src=document.createElement('canvas');src.width=W;src.height=H;
 const sx=src.getContext('2d',{willReadFrequently:true});sx.drawImage(head,0,0,W,H);
 const out=document.createElement('canvas');out.width=W;out.height=H;
 const ox=out.getContext('2d');ox.drawImage(head,0,0,W,H);

 // FACE + HAIR PROTECTION MASK.
 // `chinY` is stored in source-image pixels by composePortrait. Older code treated
 // it as a normalized 0..1 value, clamped it to .82 and consequently warped the
 // almost-empty bottom edge of the master instead of the actual neck.
 const rawChin=Number(chinY);
 const chinPx=Number.isFinite(rawChin)
  ?(rawChin<=1?rawChin*H:rawChin)
  :H*.62;
 const safeChinPx=Math.max(H*.35,Math.min(H*.82,chinPx));
 // Begin just below the chin: the face is untouched while the visible neck bridge
 // participates in the edit. The uniform is composited later and hides the far end.
 const protectedBottom=Math.min(H-2,Math.round(safeChinPx+H*.012));
 const neckBottom=Math.min(H-1,Math.round(protectedBottom+H*.255));
 const neckH=Math.max(2,neckBottom-protectedBottom);
 const cx=W*.5;
 // Narrower than the old rectangular ROI: top/bottom widths approximate the central
 // neck bridge and deliberately exclude side hair, jaw corners and shoulders.
 const topHalf=W*.105;
 const bottomHalf=W*.088;
 const feather=Math.max(2,Math.round(W*.008));
 const expandedScale=1+Math.max(0,width)*.52;
 const roiHalf=Math.ceil(Math.max(topHalf,bottomHalf)*expandedScale+feather+2);
 const left=Math.max(0,Math.floor(cx-roiHalf)),right=Math.min(W,Math.ceil(cx+roiHalf));
 const rw=right-left,rh=neckH;
 if(rw<4||rh<4)return head;
 const si=sx.getImageData(left,protectedBottom,rw,rh);
 const warped=sx.createImageData(rw,rh),sd=si.data,wd=warped.data;
 const sample=(fx,fy,idx)=>{
  if(fx<0||fx>rw-1||fy<0||fy>rh-1){wd[idx]=0;wd[idx+1]=0;wd[idx+2]=0;wd[idx+3]=0;return}
  const x0=Math.floor(fx),y0=Math.floor(fy),x1=Math.min(rw-1,x0+1),y1=Math.min(rh-1,y0+1),tx=fx-x0,ty=fy-y0;
  const a=(y0*rw+x0)*4,b=(y0*rw+x1)*4,c=(y1*rw+x0)*4,d=(y1*rw+x1)*4;
  for(let k=0;k<4;k++){const u=sd[a+k]*(1-tx)+sd[b+k]*tx,v=sd[c+k]*(1-tx)+sd[d+k]*tx;wd[idx+k]=Math.round(u*(1-ty)+v*ty)}
 };
 for(let yy=0;yy<rh;yy++){
  const yn=yy/Math.max(1,rh-1);
  // Ramp in below the protected chin, then retain the requested change through the
  // collar join. Anchoring the vertical transform at the top makes length visible.
  const yInfluence=Math.pow(Math.sin(Math.PI*.5*Math.min(1,yn/.38)),1.1);
  for(let xx=0;xx<rw;xx++){
   const scaleX=1+width*.52*yInfluence;
   const srcX=(cx-left)+(xx-(cx-left))/Math.max(.62,scaleX);
   const lengthScale=1+length*.48*yInfluence;
   const srcY=yy/Math.max(.52,lengthScale);
   sample(srcX,srcY,(yy*rw+xx)*4);
  }
 }

 // Composite the warped pixels ONLY through the neck mask. Outside this mask the
 // original master remains byte-for-byte untouched. A small inner feather prevents
 // a hard seam without allowing the mask to enter the protected face/hair region.
 const wi=warped.data;
 const base=si.data;
 const merged=ox.createImageData(rw,rh),md=merged.data;
 for(let yy=0;yy<rh;yy++){
  const yn=yy/Math.max(1,rh-1),yInfluence=Math.pow(Math.sin(Math.PI*.5*Math.min(1,yn/.38)),1.1);
  const halfAtY=topHalf+(bottomHalf-topHalf)*yn;
  // Expansion needs a wider destination mask; narrowing retains the original mask
  // so pixels from the former outer edge can be cleared.
  const maskHalf=halfAtY*(1+Math.max(0,width)*.52*yInfluence);
  const yGuard=Math.min(1,yy/Math.max(1,feather));
  for(let xx=0;xx<rw;xx++){
   const absX=left+xx,dist=Math.abs(absX-cx);
   const edge=(maskHalf-dist)/Math.max(1,feather);
   const mask=Math.max(0,Math.min(1,edge))*Math.max(0,Math.min(1,yGuard));
   const i=(yy*rw+xx)*4;
   // The geometric mask, rather than the old alpha-only mask, lets the silhouette
   // actually widen or narrow. Sampled transparent pixels also clear the old edge
   // when the neck is shortened or narrowed.
   const alphaMask=mask;
   for(let k=0;k<4;k++)md[i+k]=Math.round(base[i+k]*(1-alphaMask)+wi[i+k]*alphaMask);
  }
 }
 ox.putImageData(merged,left,protectedBottom);
 return out;
}

const v192MasterMaskCache=new WeakMap();
async function getV192MasterMasks(blob,image){
 let pending=v192MasterMaskCache.get(blob);
 if(!pending){
  const W=image.naturalWidth||image.width,H=image.naturalHeight||image.height;
  pending=(async()=>{
   // One segmentation pass for all three masks; cache per full-resolution master.
   // Resample labels only, never the source portrait pixels.
   let categoryMask;
   try{
    const seg=await getPersonSegmenter();
    const result=await new Promise((ok,bad)=>{try{seg.segment(image,ok)}catch(e){bad(e)}});
    categoryMask=result?.categoryMask;
    if(!categoryMask)return {skinMask:null,hairMask:null,clothingMask:null};
    const mw=categoryMask.width||256,mh=categoryMask.height||256,cat=categoryMask.getAsUint8Array();
    const makeMask=classes=>{
     const wanted=new Set(classes),small=canvasFor(mw,mh),sc=small.getContext('2d'),pixels=sc.createImageData(mw,mh);
     for(let i=0;i<cat.length;i++){const j=i*4;pixels.data[j]=pixels.data[j+1]=pixels.data[j+2]=255;pixels.data[j+3]=wanted.has(cat[i])?255:0}
     sc.putImageData(pixels,0,0);
     const out=canvasFor(W,H),oc=out.getContext('2d');oc.imageSmoothingEnabled=false;oc.drawImage(small,0,0,W,H);return out;
    };
    return {skinMask:makeMask([2,3]),hairMask:makeMask([1]),clothingMask:makeMask([4])};
   }catch{return {skinMask:null,hairMask:null,clothingMask:null}}
   finally{categoryMask?.close?.()}

  })();
  v192MasterMaskCache.set(blob,pending);
 }
 return pending;
}
// V211: a very light (10%) skin-only low-frequency blend. The original
// photograph supplies 90% of every pixel, retaining real pores and identity.
// Hair, eye/lip detail, clothes and alpha are never softened.
async function gentlyEvenSkin(image,skinMask){
 if(!skinMask)return image;
 const W=image.naturalWidth||image.width,H=image.naturalHeight||image.height;
 const blur=canvasFor(W,H),bc=blur.getContext('2d');
 bc.filter=`blur(${Math.max(1,Math.min(2,W*.0015))}px)`;
 bc.drawImage(image,0,0,W,H);bc.filter='none';
 const c=canvasFor(W,H),x=c.getContext('2d',{willReadFrequently:true});
 x.drawImage(image,0,0,W,H);
 const orig=x.getImageData(0,0,W,H),d=orig.data;
 const bd=bc.getImageData(0,0,W,H).data;
 const md=skinMask.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
 for(let i=0;i<d.length;i+=4){
  if(d[i+3]<240||md[i+3]<220)continue;
  // Do not smooth sharp features or high-contrast skin edges.
  const delta=Math.max(Math.abs(d[i]-bd[i]),Math.abs(d[i+1]-bd[i+1]),Math.abs(d[i+2]-bd[i+2]));
  if(delta>18)continue;
  for(let k=0;k<3;k++)d[i+k]=Math.round(d[i+k]*.90+bd[i+k]*.10);
 }
 x.putImageData(orig,0,0);return c;
}

// V212: localized, low-strength tonal tint on the existing RGB pixels only.
// No AI face regeneration, landmark movement, blur or flat-color skin replacement.
async function gentlyWarmCheeksAndLips(image,skinMask,sourceProfile=null){
 if(!skinMask)return image;
 const W=image.naturalWidth||image.width,H=image.naturalHeight||image.height;
 let landmarks;
 try{landmarks=(await getLandmarker()).detect(image).faceLandmarks?.[0]}catch{return image}
 if(!landmarks)return image;
 const c=canvasFor(W,H),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,W,H);
 const data=ctx.getImageData(0,0,W,H),d=data.data;
 const m=skinMask.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
 const a=landmarks[234],b=landmarks[454],top=landmarks[10],chin=landmarks[152];
 if(!a||!b||!top||!chin)return image;
 const fw=Math.abs(b.x-a.x)*W,fh=Math.abs(chin.y-top.y)*H;
 if(fw<20||fh<20)return image;
 const cheeks=[landmarks[117],landmarks[346]].filter(Boolean).map(v=>[v.x*W,v.y*H,fw*.16,fh*.105]);
 const lip=landmarks[13]&&landmarks[14]&&landmarks[61]&&landmarks[291]?
  [((landmarks[13].x+landmarks[14].x)/2)*W,((landmarks[13].y+landmarks[14].y)/2)*H,
   Math.abs(landmarks[291].x-landmarks[61].x)*W*.55,fh*.045]:null;
 const gaussian=(x,y,shape)=>{const dx=(x-shape[0])/Math.max(1,shape[2]),dy=(y-shape[1])/Math.max(1,shape[3]);return Math.exp(-2.6*(dx*dx+dy*dy))};
 const x0=Math.max(0,Math.floor(Math.min(...cheeks.map(v=>v[0]-v[2]*2),lip?lip[0]-lip[2]*2:W)));
 const x1=Math.min(W,Math.ceil(Math.max(...cheeks.map(v=>v[0]+v[2]*2),lip?lip[0]+lip[2]*2:0)));
 const y0=Math.max(0,Math.floor(Math.min(...cheeks.map(v=>v[1]-v[3]*2),lip?lip[1]-lip[3]*2:H)));
 const y1=Math.min(H,Math.ceil(Math.max(...cheeks.map(v=>v[1]+v[3]*2),lip?lip[1]+lip[3]*2:0)));
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  const j=(y*W+x)*4;if(d[j+3]<245)continue;
  const blush=Math.min(1,cheeks.reduce((v,q)=>v+gaussian(x,y,q),0));
  const lipTint=lip?gaussian(x,y,lip):0;
  // 10% is a ceiling on a subtle color correction, NOT 10% solid pink paint.
  const r=d[j],g=d[j+1],b=d[j+2];
  // A 10% blend toward a mild healthy rosy tone; no blur, no replacement
  // texture, no change in geometry. Apply lip tint only on naturally reddish
  // lip pixels, not on the surrounding chin or face.
  const actualLip=(r>g*1.045&&r>b*1.025)?lipTint:0;
  // Cheeks require the skin segmentation. Lips are frequently labeled as
  // "other" by MediaPipe, so use the landmark-defined lip region instead.
  const cheekStrength=(m[j+3]/255)*blush;
  const naturalRosiness=Math.max(0,Math.min(1,(r-g-4)/35));
  const sourceRosiness=sourceProfile?.rosiness??naturalRosiness;
  const tintNeed=Math.max(.20,1-Math.max(naturalRosiness,sourceRosiness)*.60);
  const w=.10*Math.min(1,cheekStrength*.85+actualLip*.75)*tintNeed;
  if(w<.001)continue;
  // Add color to the existing RGB channels; never flatten or blur texture.
  d[j]=Math.min(255,Math.round(r+w*38));
  d[j+1]=Math.max(0,Math.round(g-w*12));
  d[j+2]=Math.min(255,Math.round(b+w*8));
 }
 ctx.putImageData(data,0,0);return c;
}

// V226: measure the actual uploaded photograph before the AI edit, so the
// automatic enhancement responds to each person's existing exposure/rosiness.
// No source pixels are altered; if detection fails, use conservative defaults.
async function originalSkinProfile(sourceBlob){
 if(!sourceBlob)return null;
 const url=URL.createObjectURL(sourceBlob);
 try{
  const image=await loadImage(url),W=image.naturalWidth||image.width,H=image.naturalHeight||image.height;
  const face=(await getLandmarker()).detect(image).faceLandmarks?.[0];
  if(!face?.[117]||!face?.[346]||!face?.[234]||!face?.[454])return null;
  const c=canvasFor(W,H),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,W,H);
  const pixels=ctx.getImageData(0,0,W,H).data;
  const fw=Math.abs(face[454].x-face[234].x)*W,radius=Math.max(2,Math.round(fw*.065));
  let light=0,red=0,count=0;
  for(const pt of [face[117],face[346]]){
   const cx=Math.round(pt.x*W),cy=Math.round(pt.y*H);
   for(let y=Math.max(0,cy-radius);y<Math.min(H,cy+radius);y+=3)
    for(let x=Math.max(0,cx-radius);x<Math.min(W,cx+radius);x+=3){
     if(((x-cx)**2+(y-cy)**2)>radius**2)continue;
     const i=(y*W+x)*4;if(pixels[i+3]<240)continue;
     light+=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];
     red+=Math.max(0,Math.min(1,(pixels[i]-pixels[i+1]-4)/35));count++;
    }
  }
  return count?{luma:light/count,rosiness:red/count}:null;
 }catch{return null}finally{URL.revokeObjectURL(url)}
}

// Automatic V227 skin enhancement on the existing transparent AI portrait, not the
// original file or AI prompt. +10% further light lift vs V225's 1.10 setting,
// bounded by original exposure and highlight protection; preserve pores.
async function optionalHealthySkin10(masterBlob,sourceBlob){
 const url=URL.createObjectURL(masterBlob);
 try{
  const image=await loadImage(url),W=image.naturalWidth||image.width,H=image.naturalHeight||image.height;
  const skinMask=await semanticClassMask(image,W,H,[2,3]).catch(()=>null);
  if(!skinMask)return masterBlob;
  const profile=await originalSkinProfile(sourceBlob);
  // Darker source photographs receive the full extra lift. Already-bright
  // photographs receive less, preventing blown-out skin and lost pore detail.
  const exposureWeight=profile?Math.max(.20,Math.min(1,(225-profile.luma)/75)):1;
  // V231: modest extra studio fill, adapting to original exposure; keep the
  // per-pixel shadow/highlight protection and original high-frequency texture.
  const brighter=await applySkinBrightness(image,1.15+.10*exposureWeight,skinMask);
  const tinted=await gentlyWarmCheeksAndLips(brighter,skinMask,profile);
  // One restrained texture pass per new AI master; reuse its skin mask.
  return await refineSkinTextureBlob(await canvasPng(tinted),skinMask);
 }catch(e){console.warn('V231 automatic skin enhancement skipped',e);return masterBlob}
 finally{URL.revokeObjectURL(url)}
}

async function applySkinBrightness(image,factor=null,skinMask=null){
 const W=image.naturalWidth||image.width,H=image.naturalHeight||image.height;
 if(!skinMask)try{skinMask=await semanticClassMask(image,W,H,[2,3])}catch{return image}
 if(!skinMask)return image;
 const soft=canvasFor(W,H),sc=soft.getContext('2d');
 sc.filter=`blur(${Math.max(1,Math.min(4,W*.002))}px)`;sc.drawImage(skinMask,0,0);sc.filter='none';
 const c=canvasFor(W,H),x=c.getContext('2d',{willReadFrequently:true});x.drawImage(image,0,0,W,H);
 const out=x.getImageData(0,0,W,H),d=out.data;
 const md=sc.getImageData(0,0,W,H).data;
 if(factor==null){
  let sum=0,count=0;
  for(let i=0;i<W*H;i++){
   const j=i*4;if(d[j+3]<128||md[j+3]<180)continue;
   const luma=.2126*d[j]+.7152*d[j+1]+.0722*d[j+2];
   if(luma>35&&luma<235){sum+=luma;count++}
  }
  const mean=count?sum/count:160;
  factor=mean<150?Math.min(1.12,150/Math.max(1,mean)):1;
 }
 const lift=Math.max(0,Math.min(.25,factor-1));
 for(let i=0;i<W*H;i++){
  const j=i*4;if(!d[j+3]||!md[j+3])continue;
  // Shadow-weighted neutral fill: preserve pores/local contrast and protect highlights.
  const luma=.2126*d[j]+.7152*d[j+1]+.0722*d[j+2];
  const shadowWeight=Math.max(0,Math.min(1,(235-luma)/145));
  const strength=lift*shadowWeight*(md[j+3]/255)*(d[j+3]/255);
  d[j]=Math.min(255,Math.round(d[j]*(1+strength)));
  d[j+1]=Math.min(255,Math.round(d[j+1]*(1+strength)));
  d[j+2]=Math.min(255,Math.round(d[j+2]*(1+strength)));
 }
 x.putImageData(out,0,0);return c;
}

// V163: retain a longer, softly feathered strip of the photographed neck below
// the jaw. The smoothstep fade removes the horizontal join without repainting
// face pixels or introducing a flat sampled skin colour.
function isolateHeadHairAndNeck(image,faceCX,chinY,semanticHairMask=null,semanticSkinMask=null,semanticClothingMask=null){
 const W=image.naturalWidth||image.width,H=image.naturalHeight||image.height;
 const c=document.createElement('canvas');c.width=W;c.height=H;
 const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(image,0,0,W,H);
 const out=x.getImageData(0,0,W,H),d=out.data;
 const semanticHair=semanticHairMask?.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data||null;
 const expandedSkin=canvasFor(W,H),esc=expandedSkin.getContext('2d');
 if(semanticSkinMask){
  const spread=Math.max(2,Math.round(W*.006));
  for(let dy=-spread;dy<=spread;dy+=spread)for(let dx=-spread;dx<=spread;dx+=spread)esc.drawImage(semanticSkinMask,dx,dy);
 }
 const skinSoft=canvasFor(W,H),ssc=skinSoft.getContext('2d');
 if(semanticSkinMask){ssc.filter=`blur(${Math.max(2,Math.min(6,W*.004))}px)`;ssc.drawImage(expandedSkin,0,0);ssc.filter='none'}
 const semanticSkin=semanticSkinMask?ssc.getImageData(0,0,W,H).data:null;
 const clothing=semanticClothingMask?.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data||null;
 const start=Math.max(0,Math.floor(chinY-H*.012));
 // V199: retain the real AI-generated neck and clavicle field. Canvas only
 // feathers its outer alpha; it never synthesizes, stretches or repaints skin.
 // V233: retain 20% more of the actual generated lower-neck pixels so the
 // open-collar V is filled with skin rather than fading to white/background.
 // Never invent or stretch pixels: this only preserves AI-generated anatomy.
 const solidEnd=Math.min(H,Math.ceil(chinY+H*.64*1.20));
 const fadeEnd=Math.min(H,Math.ceil(chinY+H*.78*1.20));
 const hairSolidEnd=Math.min(H,Math.ceil(chinY+H*.29));
 const hairFadeEnd=Math.min(H,Math.ceil(chinY+H*.46));
 for(let yy=start;yy<H;yy++)for(let xx=0;xx<W;xx++){
  const i=(yy*W+xx)*4,a=d[i+3];if(!a)continue;
  const dist=Math.abs(xx-faceCX);
  const segmentedHair=Boolean(semanticHair&&semanticHair[i+3]>96);
  const skinAlpha=semanticSkin?semanticSkin[i+3]/255:1;
  // V194: below the jaw only confirmed hair can survive. The previous darkness
  // heuristic misread black shirts as hair and kept a duplicate torso layer.
  const hair=yy<hairFadeEnd&&dist<W*.38&&segmentedHair;
  const neckProgress=Math.max(0,Math.min(1,(yy-start)/Math.max(1,fadeEnd-start)));
  // Neck/half-shoulder repair: do not pinch the neck into a narrow central
  // strip. Keep the AI's real neck and skin up to the midpoint of each
  // shoulder, then taper only the covered lower margin behind the uniform.
  // The old .190 -> .130 half-width cut away both sides of the neck and
  // exposed a blue V at the standing collar. Never manufacture skin pixels.
  const smoothstep=t=>{const q=Math.max(0,Math.min(1,t));return q*q*(3-2*q)};
  let anatomical;
  if(neckProgress<.12){
   anatomical=W*(.245+.025*smoothstep(neckProgress/.12));
  }else if(neckProgress<.36){
   anatomical=W*(.270+.090*smoothstep((neckProgress-.12)/.24));
  }else{
   anatomical=W*(.360-.075*smoothstep((neckProgress-.36)/.64));
  }
  // Only soften the outer silhouette, never the central skin/neck bridge.
  const sideFeather=Math.max(3,W*.010);
  const sideAlpha=Math.max(0,Math.min(1,(anatomical-dist)/sideFeather));
  // V203: the MODNet master alpha already identifies the generated person.
  // Do not intersect this mandatory neck/shoulder field with the low-resolution
  // semantic skin mask: that intersection caused the blue bites on both sides.
  const neck=yy<=fadeEnd&&(sideAlpha>0||(semanticSkin&&skinAlpha>.5&&dist<W*.38));
  // V211: NEVER erase pixels inside the anatomical neck to clear hair.
  // Hair segmentation sometimes labels shadowed neck as hair; the old clearing
  // branch punched transparent holes that revealed the blue background.
  // The template covers the lower margin; keep the continuous AI skin here.
  if(hair){
   if(yy<=hairSolidEnd)continue;
   const ht=Math.max(0,Math.min(1,(yy-hairSolidEnd)/Math.max(1,hairFadeEnd-hairSolidEnd)));
   const edgeDelay=Math.max(0,Math.min(.18,dist/Math.max(1,W*.34)*.18));
   const eased=Math.max(0,Math.min(1,(ht-edgeDelay)/Math.max(.01,1-edgeDelay)));
   const hairAlpha=1-eased*eased*(3-2*eased);
   d[i+3]=Math.round(a*hairAlpha);
   if(d[i+3]>0)continue;
  }
  // Remove positively classified shirt pixels, not all pixels missed by the
  // low-resolution skin classifier. Expanded skin protects neckline edges.
  // Face/jaw and confirmed hair were preserved above; RGB detail is untouched.
  if(clothing && yy>chinY+H*.025 && clothing[i+3]>192 && skinAlpha<.08){
   d[i+3]=0;continue;
  }
  // Keep the existing anatomical envelope and remove pixels outside it.
  // Clothing removal above is conservative to protect real neckline edges.
  if(!neck){d[i+3]=0;continue}
  // Keep original MODNet opacity throughout the required neck fill. Semantic
  // skin classification is advisory, never allowed to cut away neck pixels.
  let alpha=semanticSkin&&skinAlpha>.5&&dist<W*.38?Math.max(sideAlpha,skinAlpha):sideAlpha;
  if(yy>solidEnd){
   const t=Math.max(0,Math.min(1,(yy-solidEnd)/Math.max(1,fadeEnd-solidEnd)));
   const smooth=t*t*(3-2*t);
   alpha*=1-smooth;
  }
  d[i+3]=Math.round(a*alpha);
 }
 x.clearRect(0,0,W,H);x.putImageData(out,0,0);return c;
}

const editorPreparedCache=new WeakMap();
async function renderAdjustedFinal(headMasterBlob,lock,adjust,collarWarp=0,neckAdjust={width:0,length:0},backgroundPath='/assets/background.jpg',ribbonPath=null,ribbonAdjust={x:0,y:0,scale:1},collarPinPair=null,collarPinAdjust={left:{x:0,y:0},right:{x:0,y:0}},preview=false,liveCanvas=null,collarHeight=0,chestPinPath=null,chestPinAdjust={x:0,y:0,scale:1},studioLayers=null){
 // V80 MASTER-RESOLUTION COMPOSITE:
 // Always render the FINAL from the untouched full-resolution transparent head master (02).
 // Never use the already-resampled 03 placed-head canvas as a source for final/export.
 const [bg,uniform]=await Promise.all([loadImage(backgroundPath),loadImage(lock.templatePath||'/assets/uniform.png')]);
 let cache=editorPreparedCache.get(headMasterBlob);
 if(!cache){cache={};editorPreparedCache.set(headMasterBlob,cache)}
 const collarKey=`${lock.templatePath}|${collarWarp}|${collarHeight}`;
 if(cache.collarKey!==collarKey){cache.collarKey=collarKey;cache.uniformPromise=warpUniformCollar(uniform,collarWarp,collarHeight)}
 const warpedUniform=await cache.uniformPromise;
 const previewGeneration=preview&&liveCanvas?liveCanvas.__editorGeneration:null;
 const head=cache.head||(cache.head=await (async()=>{
  const url=URL.createObjectURL(headMasterBlob);
  try{return await loadImage(url)}finally{URL.revokeObjectURL(url)}
 })());
 {
  const masterMasks=await (cache.masksPromise||(cache.masksPromise=getV192MasterMasks(headMasterBlob,head)));
  const neckKey=`${lock.chinY}|${neckAdjust.width||0}|${neckAdjust.length||0}`;
  if(cache.neckKey!==neckKey){cache.neckKey=neckKey;cache.neckPromise=warpPersonNeck(head,lock.chinY,neckAdjust);cache.cleanHead=null}
  const neckHead=await cache.neckPromise;
  // V201: lift only genuinely dark skin, capped at +12%. Correct exposure stays
  // unchanged; hair, uniform and background are never adjusted.
  // V210: gentle 20% fill-flash ceiling on existing skin pixels; no AI face redraw.
  // V217: V116 skin fidelity. No post-AI skin brightening, smoothing or makeup.
  // Preserve the exact skin pixels of the master layer; V216 hairstyle/compositor stays intact.
  const cleanHead=cache.cleanHead||(cache.cleanHead=isolateHeadHairAndNeck(neckHead,lock.faceCX,lock.chinY,masterMasks.hairMask,masterMasks.skinMask,masterMasks.clothingMask));
  // V231: compose offscreen. Resizing the visible canvas clears it on every slider tick.
 const c=preview&&liveCanvas?(cache.previewCanvas||(cache.previewCanvas=document.createElement('canvas'))):document.createElement('canvas');const ratio=preview?Math.min(1,Math.max(320,Math.round(liveCanvas?.clientWidth||320)*Math.min(1.5,window.devicePixelRatio||1))/lock.W):1;const targetW=Math.round(lock.W*ratio),targetH=Math.round(lock.H*ratio);if(c.width!==targetW||c.height!==targetH){c.width=targetW;c.height=targetH}
  // V299: a reused preview canvas retains its 2D transform between frames.
  // Reset and clear it before drawing; otherwise each drag compounds scale()
  // and paints progressively nested copies of the uniform/background.
  const x=c.getContext('2d');
  x.setTransform(1,0,0,1,0,0);
  x.clearRect(0,0,c.width,c.height);
  x.imageSmoothingEnabled=true;x.imageSmoothingQuality=preview?'medium':'high';
  x.setTransform(ratio,0,0,ratio,0,0);
  const captureStudioLayer=name=>{if(!studioLayers)return;if(studioLayers.headOnly&&name!=='หัว · คอ · ผม'){x.clearRect(0,0,lock.W,lock.H);return}const layer=canvasFor(c.width,c.height);layer.getContext('2d').drawImage(c,0,0);studioLayers.push({name,source:layer.toDataURL('image/png')});x.clearRect(0,0,lock.W,lock.H)};
  x.drawImage(bg,0,0,lock.W,lock.H);
  captureStudioLayer('พื้นหลัง');
  const s=adjust.scale||1, dx=(adjust.x||0)*lock.W, dy=(adjust.y||0)*lock.H, rotation=(adjust.rotation||0)*Math.PI/180;
  // Combine normalization + user adjustment and sample 02 -> final canvas exactly once.
  // V81-quality direct sampling: draw the untouched transparent master directly to
  // its final destination rectangle. This avoids scaling the whole canvas CTM and
  // keeps face/skin/hair pixels on the same one-resample path used by V81.
  const baseW=lock.headW*lock.scale, baseH=lock.headH*lock.scale;
  const drawW=baseW*s, drawH=baseH*s;
  const centerX=lock.hX+baseW/2+dx, centerY=lock.hY+baseH/2+dy;
  // V199 AI NECK: draw only the coherent AI-generated anatomy layer. The old
  // Canvas extension is intentionally not rendered, preventing duplicated,
  // stretched or mottled synthetic neck skin.
  // Studio stores native cleaned master pixels plus placement metadata. No
  // intermediate placed/resized portrait is used as its source layer.
  if(studioLayers?.headOnly&&rotation===0){
   const master=canvasFor(cleanHead.width||cleanHead.naturalWidth,cleanHead.height||cleanHead.naturalHeight);
   master.getContext('2d').drawImage(cleanHead,0,0);
   studioLayers.push({name:'หัว · คอ · ผม',source:master.toDataURL('image/png'),sourceFrame:{x:(centerX-drawW/2)/lock.W*900,y:(centerY-drawH/2)/lock.H*1200,w:drawW/lock.W*900,h:drawH/lock.H*1200}});
   return studioLayers;
  }
  x.save();
  x.translate(centerX,centerY);
  x.rotate(rotation);
  x.drawImage(cleanHead,-drawW/2,-drawH/2,drawW,drawH);
  x.restore();
  captureStudioLayer('หัว · คอ · ผม');
  if(studioLayers?.headOnly)return studioLayers;
  x.drawImage(warpedUniform,lock.uX,lock.uY,lock.uW,lock.uH);
  captureStudioLayer('ชุด');
  // V180: collar insignia are a matched left/right pair anchored to each
  // government-uniform template. Female pins sit on the upper lapels; male
  // pins sit on the inner standing collar. They never move with the head.
  if(collarPinPair){
   const [leftPin,rightPin]=await Promise.all([loadImage(collarPinPair.left),loadImage(collarPinPair.right)]);
   const isFemale=/\/government-uniforms\/female-/.test(lock.templatePath||'');
   const pinBoxW=lock.uW*(isFemale?.078:.068)*(collarPinAdjust.scale||1);
   const drawPin=(pin,cx,cy)=>{
    const pinBoxH=pinBoxW*(pin.naturalHeight/pin.naturalWidth);
    x.drawImage(pin,cx-pinBoxW/2,cy-pinBoxH/2,pinBoxW,pinBoxH);
   };
   const leftOffset=collarPinAdjust.left||{x:0,y:0},rightOffset=collarPinAdjust.right||{x:0,y:0};
   if(isFemale){
    // Place the initial pair slightly below the shoulder boards on female lapels.
    const y=lock.uY+lock.uH*.28;
    drawPin(leftPin,lock.uX+lock.uW*(.315+(leftOffset.x||0)),y+lock.uH*(leftOffset.y||0));
    drawPin(rightPin,lock.uX+lock.uW*(.685+(rightOffset.x||0)),y+lock.uH*(rightOffset.y||0));
   }else{
    const y=lock.uY+lock.uH*.245;
    drawPin(leftPin,lock.uX+lock.uW*(.455+(leftOffset.x||0)),y+lock.uH*(leftOffset.y||0));
    drawPin(rightPin,lock.uX+lock.uW*(.545+(rightOffset.x||0)),y+lock.uH*(rightOffset.y||0));
   }
  }
  if(collarPinPair)captureStudioLayer('เข็มปกคอ');
  // V264: independent single chest insignia on the wearer's left breast (image right).
  if(chestPinPath){
   const chestPin=await loadImage(chestPinPath);
   const w=lock.uW*.073*(chestPinAdjust.scale||1);
   const h=w*(chestPin.naturalHeight/chestPin.naturalWidth);
   const cx=lock.uX+lock.uW*(.28+(chestPinAdjust.x||0));
   const cy=lock.uY+lock.uH*(.405+(chestPinAdjust.y||0));
   x.drawImage(chestPin,cx-w/2,cy-h/2,w,h);
  }
  if(chestPinPath)captureStudioLayer('เข็มติดอก');
  // V126: ribbon is an independent original PNG layer, anchored to the uniform,
  // never baked into the AI head or moved with head adjustments.
  if(ribbonPath && (lock.templatePath==='/assets/uniform.png'||/\/government-uniforms\//.test(lock.templatePath||''))){
   const ribbon=await loadImage(ribbonPath);
   const isInterior=/\/government-uniforms\/interior-/.test(lock.templatePath||'');
   const ribbonWidth=lock.uW*.205*(ribbonAdjust.scale||1);
   const ribbonHeight=ribbonWidth*(ribbon.naturalHeight/ribbon.naturalWidth);
   // Anchor above the pocket flap (the previous .70/.54 landed on the pocket).
   const centerX=lock.uX+lock.uW*(.73+(ribbonAdjust.x||0));
   const topY=lock.uY+lock.uH*(.495+(ribbonAdjust.y||0));
   x.drawImage(ribbon,centerX-ribbonWidth/2,topY,ribbonWidth,ribbonHeight);
  }
  if(studioLayers){if(ribbonPath)captureStudioLayer('แพรแถบ');return studioLayers;}
  if(preview&&liveCanvas){
   // Draw the completed frame in one operation; never encode during dragging.
   if(liveCanvas.__editorGeneration!==previewGeneration)return null;
   if(liveCanvas.width!==c.width||liveCanvas.height!==c.height){liveCanvas.width=c.width;liveCanvas.height=c.height}
   liveCanvas.getContext('2d').drawImage(c,0,0);
   return null;
  }
  return await new Promise((ok,bad)=>c.toBlob(v=>v?ok(v):bad(Error('ปรับส่วนหัวไม่สำเร็จ')),'image/png'));
 }
}

async function makeAiUploadBlob(composedBlob){
 // V31 transport-only fix: Railway was aborting the large lossless PNG multipart upload.
 // Keep the V28 composition itself untouched; only create a high-quality JPEG copy for the AI request.
 const url=URL.createObjectURL(composedBlob);
 try{
  const img=await loadImage(url);
  const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
  c.getContext('2d').drawImage(img,0,0);
  return await new Promise((ok,bad)=>c.toBlob(v=>v?ok(v):bad(Error('เตรียมไฟล์ส่ง AI ไม่สำเร็จ')),'image/jpeg',0.95));
 }finally{URL.revokeObjectURL(url)}
}

async function makeForegroundFocusedRetryBlob(blob){
 // V85 fallback only: if remove.bg says unknown_foreground, retry with a face-centred crop.
 // The successful crop is restored to the ORIGINAL canvas size afterwards, so the normal pipeline is unchanged.
 const url=URL.createObjectURL(blob);
 try{
  const im=await loadImage(url),W=im.naturalWidth,H=im.naturalHeight;
  const lm=(await getLandmarker()).detect(im).faceLandmarks?.[0];
  if(!lm)return null;
  let minX=1,minY=1,maxX=0,maxY=0;
  for(const q of lm){minX=Math.min(minX,q.x);minY=Math.min(minY,q.y);maxX=Math.max(maxX,q.x);maxY=Math.max(maxY,q.y)}
  const fw=(maxX-minX)*W,fh=(maxY-minY)*H,cx=(minX+maxX)*W/2,cy=(minY+maxY)*H/2;
  // Include complete hair, ears and enough upper torso for remove.bg to recognise a person.
  const cw=Math.min(W,Math.max(fw*3.0,Math.min(W,H)*.48));
  const ch=Math.min(H,Math.max(fh*4.0,Math.min(W,H)*.64));
  let sx=Math.round(cx-cw/2),sy=Math.round(cy-fh*1.35);
  sx=Math.max(0,Math.min(W-Math.round(cw),sx));sy=Math.max(0,Math.min(H-Math.round(ch),sy));
  const sw=Math.min(W-sx,Math.round(cw)),sh=Math.min(H-sy,Math.round(ch));
  const c=document.createElement('canvas');c.width=sw;c.height=sh;
  const x=c.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(im,sx,sy,sw,sh,0,0,sw,sh);
  const retryBlob=await new Promise((ok,bad)=>c.toBlob(v=>v?ok(v):bad(Error('เตรียมภาพสำรองไม่สำเร็จ')),'image/png'));
  return{blob:retryBlob,W,H,sx,sy,sw,sh};
 }finally{URL.revokeObjectURL(url)}
}
async function removeBackgroundRobust(blob,filename='person.png'){
 const call=async input=>{const fd=new FormData();fd.append('image',input,filename);return fetch('/api/remove-background',{method:'POST',body:fd})};
 let r=await call(blob);
 if(r.ok)return r.blob();
 const firstText=await r.text();
 if(!/unknown_foreground|Could not identify foreground/i.test(firstText))throw Error(firstText);
 const focus=await makeForegroundFocusedRetryBlob(blob);
 if(!focus)throw Error(firstText);
 r=await call(focus.blob);
 if(!r.ok)throw Error(await r.text());
 const cut=await r.blob(),u=URL.createObjectURL(cut);
 try{
  const im=await loadImage(u),c=document.createElement('canvas');c.width=focus.W;c.height=focus.H;
  const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);x.drawImage(im,focus.sx,focus.sy,focus.sw,focus.sh);
  return await new Promise((ok,bad)=>c.toBlob(v=>v?ok(v):bad(Error('ประกอบภาพสำรองไม่สำเร็จ')),'image/png'));
 }finally{URL.revokeObjectURL(u)}
}
// Native-resolution edge recovery from the SAME AI image, not a new AI edit.
// Work only on semi-transparent head edges; opaque face/skin and neck stay intact.
function refineNativeHeadEdges(cutout,source,W,H,endY){
 const stop=Math.max(0,Math.min(H,Math.floor(endY)));
 const alpha=new Uint8Array(W*stop);
 for(let i=0;i<alpha.length;i++)alpha[i]=cutout[i*4+3];
 const radius=Math.max(8,Math.min(20,Math.ceil(W/512*4)));
 const dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
 const radii=[1,2,4,8,12,16,20].filter(r=>r<=radius);
 if(radii[radii.length-1]!==radius)radii.push(radius);
 for(let y=0;y<stop;y++)for(let x=0;x<W;x++){
  const i=y*W+x,j=i*4,a=alpha[i];
  if(a<=8||a>=248)continue;
  let fr=0,fg=0,fb=0,fw=0,br=0,bg=0,bb=0,bw=0,fgCount=0,bgCount=0;
  for(const [dx,dy] of dirs){
   let foundF=false,foundB=false;
   for(const r of radii){
    const xx=x+dx*r,yy=y+dy*r;
    if(xx<0||xx>=W||yy<0||yy>=stop)break;
    const n=yy*W+xx,k=n*4,weight=1/r;
    if(!foundF&&alpha[n]>=248){fr+=source[k]*weight;fg+=source[k+1]*weight;fb+=source[k+2]*weight;fw+=weight;foundF=true;fgCount++;}
    if(!foundB&&alpha[n]<=8){br+=source[k]*weight;bg+=source[k+1]*weight;bb+=source[k+2]*weight;bw+=weight;foundB=true;bgCount++;}
    if(foundF&&foundB)break;
   }
  }
  // Do not guess a foreground colour for detached wisps or ambiguous edges.
  if(fgCount<2||bgCount<2||!fw||!bw)continue;
  fr/=fw;fg/=fw;fb/=fw;br/=bw;bg/=bw;bb/=bw;
  const dr=fr-br,dg=fg-bg,db=fb-bb,norm=dr*dr+dg*dg+db*db;
  if(norm<1600)continue;
  const cr=source[j],cg=source[j+1],cb=source[j+2];
  const fit=Math.max(0,Math.min(1,((cr-br)*dr+(cg-bg)*dg+(cb-bb)*db)/norm));
  const er=cr-(br+fit*dr),eg=cg-(bg+fit*dg),eb=cb-(bb+fit*db);
  const residual=Math.sqrt((er*er+eg*eg+eb*eb)/3);
  if(residual>=12)continue;
  const confidence=(1-residual/12)**2;
  const revised=(a/255)*(1-confidence)+fit*confidence;
  cutout[j+3]=Math.max(0,Math.min(255,Math.round(revised*255)));
  // Remove estimated background colour ONLY from mixed boundary pixels.
  // Bound corrections and leave all fully opaque facial texture untouched.
  if(fit>=.15&&fit<.97&&confidence>.25){
   const weight=confidence*Math.min(1,(248-a)/40);
   for(let c=0;c<3;c++){
    const back=c===0?br:c===1?bg:bb;
    const native=source[j+c];
    const unmixed=Math.max(0,Math.min(255,(native-(1-fit)*back)/fit));
    const delta=Math.max(-24,Math.min(24,unmixed-cutout[j+c]));
    cutout[j+c]=Math.max(0,Math.min(255,Math.round(cutout[j+c]+delta*weight)));
   }
  }
 }
}

async function refineAiCutoutEdges(cutoutBlob,sourceBlob){
 const sourceURL=URL.createObjectURL(sourceBlob),cutoutURL=URL.createObjectURL(cutoutBlob);
 try{
  const [original,cutout]=await Promise.all([loadImage(sourceURL),loadImage(cutoutURL)]);
  const W=original.naturalWidth,H=original.naturalHeight;
  if(cutout.naturalWidth!==W||cutout.naturalHeight!==H)return cutoutBlob;
  const face=(await getLandmarker()).detect(original).faceLandmarks?.[0];
  if(!face?.[152])return cutoutBlob;
  const originalCanvas=canvasFor(W,H),ox=originalCanvas.getContext('2d',{willReadFrequently:true});ox.drawImage(original,0,0);
  const canvas=canvasFor(W,H),cx=canvas.getContext('2d',{willReadFrequently:true});cx.drawImage(cutout,0,0);
  const pixels=cx.getImageData(0,0,W,H);
  refineNativeHeadEdges(pixels.data,ox.getImageData(0,0,W,H).data,W,H,Math.ceil(face[152].y*H));
  cx.putImageData(pixels,0,0);
  return await canvasPng(canvas);
 }catch{return cutoutBlob}finally{URL.revokeObjectURL(sourceURL);URL.revokeObjectURL(cutoutURL)}
}

// Blend only the internal upper hairline after the existing skin finish.
// Face features are protected by a hard ROI ending safely above both brows.
async function finishHairlineSeam(masterBlob){
 const url=URL.createObjectURL(masterBlob);
 try{
  const image=await loadImage(url),W=image.naturalWidth,H=image.naturalHeight;
  const face=(await getLandmarker()).detect(image).faceLandmarks?.[0];
  if(!face?.[10]||!face?.[70]||!face?.[300])return masterBlob;
  const faceWidth=Math.abs(face[454].x-face[234].x)*W;
  const region={left:Math.min(face[234].x,face[454].x)*W,right:Math.max(face[234].x,face[454].x)*W,top:Math.max(0,(face[10].y*H)-faceWidth*.13),bottom:Math.min(face[70].y,face[63].y,face[105].y,face[66].y,face[107].y,face[336].y,face[296].y,face[334].y,face[293].y,face[300].y)*H-faceWidth*.04,faceWidth};
  if(region.bottom<=region.top)return masterBlob;
  const seg=await getPersonSegmenter();
  const result=await new Promise((ok,bad)=>{try{seg.segment(image,r=>ok(r))}catch(e){bad(e)}});
  const mask=result?.categoryMask;if(!mask)return masterBlob;
  let hair,skin;
  try{
   const mw=mask.width,mh=mask.height,cat=mask.getAsUint8Array();
   if(!mw||!mh)return masterBlob;
   hair=new Uint8Array(W*H);skin=new Uint8Array(W*H);
   for(let y=Math.max(0,Math.floor(region.top));y<Math.min(H,Math.ceil(region.bottom));y++)for(let x=Math.max(0,Math.floor(region.left));x<Math.min(W,Math.ceil(region.right));x++){
    const id=cat[Math.min(mh-1,Math.floor(y*mh/H))*mw+Math.min(mw-1,Math.floor(x*mw/W))],i=y*W+x;
    if(id===1)hair[i]=1;else if(id===3)skin[i]=1;
   }
  }finally{mask.close?.()}
  const canvas=canvasFor(W,H),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,W,H),finished=blendHairlineSeam(pixels.data,hair,skin,W,H,region);
  if(!finished)return masterBlob;
  pixels.data.set(finished);ctx.putImageData(pixels,0,0);return await canvasPng(canvas);
 }catch{return masterBlob}finally{URL.revokeObjectURL(url)}
}

async function removeBackgroundBlob(blob){
 const cutout=await removeBackgroundRobust(blob,'ai-person.png');
 return refineAiCutoutEdges(cutout,blob);
}

// Extend low-resolution hair segmentation along connected, hair-coloured pixels of
// the LOCKED transparent master. This catches long strands mislabelled as clothes.
// It is bounded by the skin/anatomy shield, and never traverses the central neck.
function refineOldHairMask(locked,semanticHair,protect,eyeD,chinY,centerX){
 const W=locked.naturalWidth,H=locked.naturalHeight,N=W*H;
 const src=document.createElement('canvas');src.width=W;src.height=H;
 const sx=src.getContext('2d',{willReadFrequently:true});sx.drawImage(locked,0,0);
 const px=sx.getImageData(0,0,W,H).data;
 const mx=semanticHair.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
 const shield=protect.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
 const keep=new Uint8Array(N),distance=new Uint16Array(N),queue=new Int32Array(N);
 let n=0,meanR=0,meanG=0,meanB=0,samples=0;
 // Hair colour is measured only in reliable opaque hair seeds above the chin.
 for(let y=0;y<Math.min(H,Math.round(chinY));y+=2)for(let x=0;x<W;x+=2){
  const i=y*W+x,j=i*4;
  if(mx[j+3]>230&&px[j+3]>220&&shield[j+3]<32){meanR+=px[j];meanG+=px[j+1];meanB+=px[j+2];samples++}
 }
 if(samples<20)throw Error('ตรวจจับผมเดิมไม่ชัดเจน กรุณาใช้รูปที่เห็นเส้นผมชัด');
 meanR/=samples;meanG/=samples;meanB/=samples;
 // Follow connected strands to the bottom of the transparent master; do not
 // truncate long hair at an arbitrary 90px / 3.2-eye-distance boundary.
 const maxDist=Math.max(H,W);
 const maxY=H;
 const valid=(i)=>{
  const j=i*4,y=Math.floor(i/W),x=i-y*W;
  if(y>=maxY||px[j+3]<28||shield[j+3]>96||Math.abs(x-centerX)>eyeD*2.7)return false;
  // Below the chin, never flood through a dark tie or other central uniform parts.
  if(y>chinY+eyeD*.5&&Math.abs(x-centerX)<eyeD*.39)return false;
  const r=px[j],g=px[j+1],b=px[j+2];
  const brightness=(r+g+b)/3;
  const difference=Math.hypot(r-meanR,g-meanG,b-meanB);
  return brightness<Math.max(85,(meanR+meanG+meanB)/3+47)&&difference<105;
 };
 // Start with all confident hair pixels, then follow adjoining dark hair strands.
 for(let i=0;i<N;i++){
  const j=i*4;
  if(mx[j+3]>128&&px[j+3]>24&&shield[j+3]<96){keep[i]=255;queue[n++]=i}
 }
 if(n<Math.max(40,Math.round(N*.001)))throw Error('ตรวจจับผมเดิมไม่เพียงพอ จึงไม่เปลี่ยนภาพที่ล็อกไว้');
 let head=0;
 while(head<n){
  const i=queue[head++],d=distance[i];if(d>=maxDist)continue;
  const x=i%W,y=(i-x)/W;
  const neighbors=[x>0?i-1:-1,x<W-1?i+1:-1,y>0?i-W:-1,y<H-1?i+W:-1];
  for(const next of neighbors){if(next<0||keep[next]||!valid(next))continue;keep[next]=255;distance[next]=d+1;queue[n++]=next}
 }
 const c=document.createElement('canvas');c.width=W;c.height=H;
 const ctx=c.getContext('2d'),out=ctx.createImageData(W,H);
 // Expand a few pixels into partially transparent old-hair edges; never expand
 // into locked skin/neck. The previous hard cut left long blue/black hair trails.
 const radius=Math.max(2,Math.min(5,Math.round(eyeD*.018)));
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,j=i*4;
  let hit=keep[i]===255;
  if(!hit&&px[j+3]>0&&shield[j+3]<32){
   for(let dy=-radius;dy<=radius&&!hit;dy++)for(let dx=-radius;dx<=radius;dx++){
    if(dx*dx+dy*dy>radius*radius)continue;
    const xx=x+dx,yy=y+dy;
    if(xx>=0&&xx<W&&yy>=0&&yy<H&&keep[yy*W+xx]){hit=true;break}
   }
  }
  out.data[j]=out.data[j+1]=out.data[j+2]=255;
  out.data[j+3]=hit&&shield[j+3]<32?255:0;
 }
 ctx.putImageData(out,0,0);return c;
}

// V93: A genuinely hair-free immutable master. Never paste the old long-hair
// master beneath a new hairstyle. Generate missing ears/scalp/neck once and
// restore ONLY originally visible face/neck pixels that are also skin in donor.
function canvasFor(W,H){const c=document.createElement('canvas');c.width=W;c.height=H;return c}
function canvasPng(c){return new Promise((ok,bad)=>c.toBlob(b=>b?ok(b):bad(Error('บันทึก Clean Head Master ไม่สำเร็จ')),'image/png'))}
function alignFaceCanvas(source,from,to,W,H){
 const c=canvasFor(W,H),x=c.getContext('2d');
 const a=from[33],b=from[263],la=to[33],lb=to[263];
 // Images expose naturalWidth/naturalHeight, while the normalized hairstyle
 // reference is a Canvas and exposes width/height. Reading only naturalWidth
 // made sw/sh undefined for local PNG hairstyles, producing a NaN transform
 // and a completely empty (bald) composite even though a style was selected.
 const sw=source.naturalWidth||source.width,sh=source.naturalHeight||source.height;
 if(!sw||!sh)throw Error('ขนาดภาพสำหรับจัดตำแหน่งทรงผมไม่ถูกต้อง');
 const d=Math.hypot((b.x-a.x)*sw,(b.y-a.y)*sh)||1;
 const ld=Math.hypot((lb.x-la.x)*W,(lb.y-la.y)*H)||d;
 const rot=Math.atan2((lb.y-la.y)*H,(lb.x-la.x)*W)-Math.atan2((b.y-a.y)*sh,(b.x-a.x)*sw);
 x.translate((la.x+lb.x)*W*.5,(la.y+lb.y)*H*.5);x.rotate(rot);x.scale(ld/d,ld/d);
 x.translate(-(a.x+b.x)*sw*.5,-(a.y+b.y)*sh*.5);x.drawImage(source,0,0);
 return c;
}
// Reuse only the same portrait base, including its upload and face landmarks.
let studioMakeupPreparation=null;
async function prepareStudioMakeup(source){
 if(studioMakeupPreparation?.source===source)return studioMakeupPreparation.promise;
 const entry={source,promise:null};studioMakeupPreparation=entry;
 entry.promise=(async()=>{
  const original=await loadImage(source),W=original.naturalWidth,H=original.naturalHeight;
  const detection=canvasFor(W,H),dx=detection.getContext('2d');dx.fillStyle='#fff';dx.fillRect(0,0,W,H);dx.drawImage(original,0,0);
  const [landmarker,upload]=await Promise.all([getLandmarker(),canvasPng(detection)]);
  const face=landmarker.detect(detection).faceLandmarks?.[0];
  if(!face)throw Error('ไม่พบใบหน้าชัดเจน ยังไม่เรียก AI และไม่ใช้เครดิต');
  return {original,W,H,landmarker,face,upload};
 })().catch(error=>{if(studioMakeupPreparation===entry)studioMakeupPreparation=null;throw error});
 return entry.promise;
}
async function requestStudioMakeup(source,styles){
 const {original,W,H,landmarker,face,upload}=await prepareStudioMakeup(source);
 const base=canvasFor(W,H),bx=base.getContext('2d',{willReadFrequently:true});bx.drawImage(original,0,0);
 const mask=makeupMask(face,W,H,styles),maskData=mask.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
 const fd=new FormData();fd.append('image',upload,'makeup.png');fd.append('styles',JSON.stringify(styles));
 const response=await fetch('/api/makeup/edit',{method:'POST',body:fd,headers:walletHeaders()});
 updateCreditsFromResponse(response);
 if(!response.ok){const error=await response.json().catch(()=>null);throw Error(error?.message||'แต่งเมคอัพไม่สำเร็จ กรุณาลองอีกครั้ง')}
 const url=URL.createObjectURL(await response.blob());
 try{
  const generated=await loadImage(url),freshFace=landmarker.detect(generated).faceLandmarks?.[0];
  if(!freshFace)throw Error('ผลเมคอัพไม่ชัดเจน เก็บภาพเดิมไว้');
  const aligned=alignFaceCanvas(generated,freshFace,face,W,H),cx=aligned.getContext('2d',{willReadFrequently:true});
  // Reject a changed facial proportion rather than applying a shifted mouth/brow.
  const eyeDistance=Math.hypot((face[33].x-face[263].x)*W,(face[33].y-face[263].y)*H);
  const fromEye=Math.hypot((freshFace[33].x-freshFace[263].x)*generated.naturalWidth,(freshFace[33].y-freshFace[263].y)*generated.naturalHeight);
  const ratio=f=>Math.hypot((f[1].x-(f[33].x+f[263].x)/2),(f[1].y-(f[33].y+f[263].y)/2))/Math.hypot(f[33].x-f[263].x,f[33].y-f[263].y);
  if(!eyeDistance||!fromEye||Math.abs(ratio(face)-ratio(freshFace))>.12)throw Error('ผลเมคอัพเปลี่ยนสัดส่วนใบหน้า เก็บภาพเดิมไว้');
  const pixels=bx.getImageData(0,0,W,H),ai=cx.getImageData(0,0,W,H).data;
  const detailMask=styles.look?makeupMask(face,W,H,{brows:'natural',lips:'natural',lashes:'natural'}).getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data:null;
  pixels.data.set(blendMakeupPixels(pixels.data,ai,maskData,detailMask?{width:W,height:H,detailMask}:null));bx.putImageData(pixels,0,0);
  return base; // Keep full-resolution pixels; serialize only when saving the project.
 }finally{URL.revokeObjectURL(url)}
}
function opaqueBounds(canvas){
 const W=canvas.width,H=canvas.height,d=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
 let minX=W,minY=H,maxX=-1,maxY=-1;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(d[(y*W+x)*4+3]<20)continue;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}
 return maxX<minX?null:{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};
}
const localHairAnchorCache=new Map();
async function localHairstyleOnCleanMaster(cleanBlob,hairId){
 if(!hairId)return cleanBlob;
 const cu=URL.createObjectURL(cleanBlob);
 try{
  const clean=await loadImage(cu),W=clean.naturalWidth,H=clean.naturalHeight;
  const [cutout,preview]=await Promise.all([loadImage(`/assets/hair/${hairId}.png`),loadImage(`/assets/hairstyle-previews/${hairId}.png`)]);
  const landmarker=await getLandmarker(),targetFace=landmarker.detect(clean).faceLandmarks?.[0];
  let cached=localHairAnchorCache.get(hairId);
  if(!cached){
   const previewFace=landmarker.detect(preview).faceLandmarks?.[0];
   const previewHair=await semanticClassMask(preview,preview.naturalWidth,preview.naturalHeight,[1]);
   if(!previewFace||!previewHair)throw Error('เตรียมจุดยึดทรงผมไม่สำเร็จ');
   const sourceCanvas=canvasFor(cutout.naturalWidth,cutout.naturalHeight);sourceCanvas.getContext('2d').drawImage(cutout,0,0);
   const sourceBounds=opaqueBounds(sourceCanvas),previewBounds=opaqueBounds(previewHair);
   if(!sourceBounds||!previewBounds)throw Error('ไฟล์ทรงผมไม่มีพื้นที่ทึบ');
   const normalized=canvasFor(preview.naturalWidth,preview.naturalHeight),nx=normalized.getContext('2d');
   nx.imageSmoothingEnabled=true;nx.imageSmoothingQuality='high';
   nx.drawImage(cutout,sourceBounds.x,sourceBounds.y,sourceBounds.w,sourceBounds.h,previewBounds.x,previewBounds.y,previewBounds.w,previewBounds.h);
   cached={normalized,previewFace};localHairAnchorCache.set(hairId,cached);
  }
  if(!targetFace)throw Error('ไม่พบใบหน้าบนภาพฐาน');
  const aligned=alignFaceCanvas(cached.normalized,cached.previewFace,targetFace,W,H);
  const bodySkin=await semanticClassMask(clean,W,H,[2]),faceSkin=await semanticClassMask(clean,W,H,[3]);
  if(!bodySkin||!faceSkin)throw Error('ล็อกผิวก่อนวางผมไม่สำเร็จ');
  const ad=aligned.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H);
  const bd=bodySkin.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const fd=faceSkin.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const eyeD=Math.hypot((targetFace[263].x-targetFace[33].x)*W,(targetFace[263].y-targetFace[33].y)*H),cx=(targetFace[33].x+targetFace[263].x)*W*.5;
  const browIds=[70,63,105,66,107,336,296,334,293,300],browY=browIds.reduce((sum,index)=>sum+targetFace[index].y*H,0)/browIds.length;
  const chinY=targetFace[152].y*H;
  for(let i=0;i<W*H;i++){
   const j=i*4,x=i%W,y=(i-x)/W,centralFace=fd[j+3]>96&&y>=browY-eyeD*.10&&Math.abs(x-cx)<eyeD*.69;
   // Body-skin on a bald clean base often includes the scalp. Protect it only
   // from the jaw downward; otherwise every selected PNG hairstyle disappears.
   const neckOrShoulder=bd[j+3]>80&&y>chinY-eyeD*.04;
   if(neckOrShoulder||centralFace)ad.data[j+3]=0;
  }
  // Never accept a selected hairstyle that became empty after alignment/mask.
  // This check happens locally and before the preview is committed, so a NaN,
  // off-canvas transform or an over-aggressive mask cannot return a bald head.
  let visibleHair=0;
  for(let i=0;i<W*H;i++)if(ad.data[i*4+3]>48)visibleHair++;
  if(visibleHair<Math.max(180,Math.round(eyeD*eyeD*.12)))
   throw Error('ทรงผมที่เลือกไม่ปรากฏครบ — คงภาพก่อนหน้า');
  aligned.getContext('2d').putImageData(ad,0,0);
  const out=canvasFor(W,H),ox=out.getContext('2d');ox.drawImage(clean,0,0);ox.drawImage(aligned,0,0);
  return await canvasPng(out);
 }finally{URL.revokeObjectURL(cu)}
}
async function makeCleanHeadMaster(baldBlob,originalBlob){
 const bu=URL.createObjectURL(baldBlob),ou=URL.createObjectURL(originalBlob);
 try{
  const [bald,original]=await Promise.all([loadImage(bu),loadImage(ou)]);
  const lm=await getLandmarker();const bf=lm.detect(bald).faceLandmarks?.[0],of=lm.detect(original).faceLandmarks?.[0];
  if(!bf||!of)throw Error('ตรวจจับใบหน้าเพื่อสร้าง Clean Head Master ไม่สำเร็จ');
  const W=original.naturalWidth,H=original.naturalHeight;
  const aligned=alignFaceCanvas(bald,bf,of,W,H);
  // V105: MODNet can retain a rectangular patch of the AI temporary background
  // around the forehead. Alpha alone is NOT an anatomical matte. Intersect it
  // with MediaPipe's actual scalp/face/neck/hair silhouette before restoring
  // immutable source skin; otherwise the patch is visible on the blue ID backdrop.
  const anatomicalRaw=await semanticClassMask(bald,bald.naturalWidth,bald.naturalHeight,[1,2,3]);
  if(!anatomicalRaw)throw Error('แยกขอบศีรษะของภาพฐานไม่สำเร็จ — คงพรีวิวเดิม');
  const anatomicalAligned=alignFaceCanvas(anatomicalRaw,bf,of,W,H);
  const anatomicalSoft=canvasFor(W,H),as=anatomicalSoft.getContext('2d');
  as.filter=`blur(${Math.max(1,Math.min(3,W*.002))}px)`;
  as.drawImage(anatomicalAligned,0,0);as.filter='none';
  const ax=aligned.getContext('2d');
  ax.globalCompositeOperation='destination-in';ax.drawImage(anatomicalSoft,0,0);
  ax.globalCompositeOperation='source-over';
  // Reject bald edits that still contain a long hairstyle. This must not be
  // silently cached as a "clean" base or every later hairstyle will ghost.
  const hair=await semanticClassMask(bald,bald.naturalWidth,bald.naturalHeight,[1]);
  if(!hair)throw Error('ตรวจ Clean Head Master ไม่สำเร็จ');
  const hd=hair.getContext('2d',{willReadFrequently:true}).getImageData(0,0,hair.width,hair.height).data;
  // A bald head may still have tiny false-positive hair labels on eyebrows/scalp.
  // Reject specifically the long strands below the jaw, rather than counting
  // all hair-like pixels across the entire portrait.
  const originalW=original.naturalWidth,originalH=original.naturalHeight;
  const jawY=Math.round(of[152].y*originalH),eyeSpan=Math.hypot((of[263].x-of[33].x)*originalW,(of[263].y-of[33].y)*originalH);
  const center=(of[33].x+of[263].x)*originalW*.5;
  const alignedHair=alignFaceCanvas(hair,bf,of,originalW,originalH);
  const ah=alignedHair.getContext('2d',{willReadFrequently:true}).getImageData(0,0,originalW,originalH).data;
  // Scan connected hair components over the whole visible side/shoulder area.
  // A percentage in a narrow jaw box missed strands beyond that box.
  const visited=new Uint8Array(originalW*originalH),queue=new Int32Array(originalW*originalH);
  let residualComponents=0;
  const minY=Math.max(0,Math.floor(jawY-eyeSpan*.12));
  for(let y=minY;y<originalH;y++)for(let x=0;x<originalW;x++){
   const seed=y*originalW+x;
   if(visited[seed]||ah[seed*4+3]<160)continue;
   let n=0,read=0,minX=x,maxX=x,minCompY=y,maxCompY=y;
   queue[n++]=seed;visited[seed]=1;
   while(read<n){
    const i=queue[read++],xx=i%originalW,yy=(i-xx)/originalW;
    minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);
    minCompY=Math.min(minCompY,yy);maxCompY=Math.max(maxCompY,yy);
    for(const j of [xx>0?i-1:-1,xx+1<originalW?i+1:-1,yy>minY?i-originalW:-1,yy+1<originalH?i+originalW:-1]){
     if(j<0||visited[j]||ah[j*4+3]<160)continue;
     visited[j]=1;queue[n++]=j;
    }
   }
   const side=(minX<center-eyeSpan*.37||maxX>center+eyeSpan*.37);
   const extendsBelowJaw=maxCompY>jawY+eyeSpan*.35;
   const longEnough=maxCompY-minCompY>eyeSpan*.30;
   const enoughPixels=n>Math.max(24,eyeSpan*eyeSpan*.0025);
   if(side&&extendsBelowJaw&&longEnough&&enoughPixels)residualComponents++;
  }
  if(residualComponents)throw Error('ภาพฐานยังตรวจพบผมยาวต่อเนื่องถึงข้างคอหรือไหล่ จึงคงภาพเดิมไว้');
  // Independent pixel heuristic for dark side strands that the segmenter may
  // label as background. This is deliberately conservative: only inspect
  // transparent-head pixels outside the central neck and above the uniform.
  const baldData=aligned.getContext('2d',{willReadFrequently:true}).getImageData(0,0,originalW,originalH).data;
  const darkVisited=new Uint8Array(originalW*originalH);
  const strandTop=Math.max(0,Math.floor(jawY-eyeSpan*.10));
  const strandBottom=Math.min(originalH,Math.ceil(jawY+eyeSpan*.95));
  let darkStrands=0;
  const isDarkSide=i=>{
   const y=(i/originalW)|0,x=i-y*originalW,j=i*4;
   if(y<strandTop||y>=strandBottom||Math.abs(x-center)<eyeSpan*.49||Math.abs(x-center)>eyeSpan*1.65)return false;
   if(baldData[j+3]<220)return false;
   const r=baldData[j],g=baldData[j+1],b=baldData[j+2];
   return Math.max(r,g,b)<78&&Math.max(r,g,b)-Math.min(r,g,b)<35;
  };
  for(let y=strandTop;y<strandBottom;y++)for(let x=0;x<originalW;x++){
   const seed=y*originalW+x;if(darkVisited[seed]||!isDarkSide(seed))continue;
   let n=0,read=0,minY=y,maxY=y,minX=x,maxX=x;
   queue[n++]=seed;darkVisited[seed]=1;
   while(read<n){const i=queue[read++],xx=i%originalW,yy=(i-xx)/originalW;
    minY=Math.min(minY,yy);maxY=Math.max(maxY,yy);minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);
    for(const j of [xx>0?i-1:-1,xx+1<originalW?i+1:-1,yy>strandTop?i-originalW:-1,yy+1<strandBottom?i+originalW:-1]){
     if(j<0||darkVisited[j]||!isDarkSide(j))continue;darkVisited[j]=1;queue[n++]=j;
    }
   }
   if(minY<jawY+eyeSpan*.15&&maxY>jawY+eyeSpan*.55&&maxY-minY>eyeSpan*.47&&
      maxX-minX<eyeSpan*.49&&n>Math.max(28,eyeSpan*eyeSpan*.003))darkStrands++;
  }
  // Darkness alone cannot distinguish hair from a naturally dark neck shadow.
  // Semantic connected hair below the jaw remains a hard failure above;
  // preserve this heuristic as a warning for diagnostic review instead.
  const darkStrandWarning=darkStrands>0;
  const donorSkinRaw=await semanticClassMask(bald,bald.naturalWidth,bald.naturalHeight,[2,3]);
  const originalSkin=await semanticClassMask(original,W,H,[2,3]);
  if(!donorSkinRaw||!originalSkin)throw Error('ตรวจผิวใบหน้าสำหรับ Clean Head Master ไม่สำเร็จ');
  const donorSkin=alignFaceCanvas(donorSkinRaw,bf,of,W,H);
  const originalHair=await semanticClassMask(original,W,H,[1]);
  if(!originalHair)throw Error('แยกผมเดิมก่อนป้องกันใบหน้าไม่สำเร็จ');
  const face=canvasFor(W,H),fc=face.getContext('2d');fc.drawImage(originalSkin,0,0);
  fc.globalCompositeOperation='destination-in';fc.drawImage(donorSkin,0,0);
  // A segmenter's skin label must not paste back a strand explicitly labeled
  // as original hair. Preserve the immutable central facial core separately.
  fc.globalCompositeOperation='destination-out';fc.drawImage(originalHair,0,0);
  // Protect the central originally visible facial pixels even if the 256px
  // segmenter makes a small classification error at the eyes or nose.
  fc.globalCompositeOperation='source-over';fc.fillStyle='#fff';
  const eyeD=Math.hypot((of[263].x-of[33].x)*W,(of[263].y-of[33].y)*H);
  const cx=(of[33].x+of[263].x)*W*.5,forehead=of[10].y*H,chin=of[152].y*H;
  // The central facial safety ellipse must have a feathered edge; a hard
  // source-over ellipse on AI skin produced the visible oval seam in V98.
  const oval=canvasFor(W,H),ovalCtx=oval.getContext('2d');
  ovalCtx.fillStyle='#fff';ovalCtx.beginPath();ovalCtx.ellipse(cx,(forehead+chin)*.53,eyeD*.48,(chin-forehead)*.31,0,0,Math.PI*2);ovalCtx.fill();
  const softOval=canvasFor(W,H),softCtx=softOval.getContext('2d');
  softCtx.filter=`blur(${Math.max(4,Math.min(12,eyeD*.035))}px)`;softCtx.drawImage(oval,0,0);softCtx.filter='none';
  fc.drawImage(softOval,0,0);
  // Keep the immutable visible skin (face AND neck) independently of the AI.
  // Both skin segmentations must agree, so hair mislabeled as skin by only one
  // model pass is not blindly pasted back onto the clean master.
  // The central core is checked strictly; feathered hairline pixels are not.
  const core=canvasFor(W,H),coreCtx=core.getContext('2d');
  coreCtx.fillStyle='#fff';coreCtx.beginPath();
  coreCtx.ellipse(cx,(forehead+chin)*.55,eyeD*.38,(chin-forehead)*.25,0,0,Math.PI*2);coreCtx.fill();
  coreCtx.globalCompositeOperation='destination-in';coreCtx.drawImage(face,0,0);
  // Feather the low-resolution semantic edge without softening any actual
  // facial pixels. The inner originalCore is restored fully opaque below.
  const featheredFace=canvasFor(W,H),ff=featheredFace.getContext('2d');
  ff.filter=`blur(${Math.max(2,Math.min(5,eyeD*.012))}px)`;ff.drawImage(face,0,0);ff.filter='none';
  ff.drawImage(core,0,0);
  const originalPixels=canvasFor(W,H),opc=originalPixels.getContext('2d');opc.drawImage(original,0,0);
  opc.globalCompositeOperation='destination-in';opc.drawImage(featheredFace,0,0);
  const clean=canvasFor(W,H),cc=clean.getContext('2d');cc.drawImage(aligned,0,0);cc.drawImage(originalPixels,0,0);
  // Check the actual cached image AFTER restoration, not just the AI donor.
  const mergedHair=await semanticClassMask(clean,W,H,[1]);
  if(!mergedHair)throw Error('ตรวจภาพฐานหลังประกอบไม่สำเร็จ');
  const mh=mergedHair.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const mergedPixels=cc.getImageData(0,0,W,H).data;
  let residualSideHair=0;
  for(let y=Math.max(0,Math.floor(jawY+eyeSpan*.18));y<Math.min(H,Math.ceil(jawY+eyeSpan*1.10));y++)
   for(let x=0;x<W;x++){
    if(Math.abs(x-center)<eyeSpan*.48||Math.abs(x-center)>eyeSpan*2.25)continue;
    const j=(y*W+x)*4;
    if(mh[j+3]>200&&mergedPixels[j+3]>180)residualSideHair++;
   }
  if(residualSideHair>Math.max(70,eyeSpan*eyeSpan*.045))
   throw Error('ภาพฐานหลังประกอบยังมีผมยาวข้างคอ กรุณาตรวจภาพต้นฉบับก่อนลองใหม่');
  const data=cc.getImageData(0,0,W,H).data,fd=face.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const od=canvasFor(W,H);od.getContext('2d').drawImage(original,0,0);
  const orig=od.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  let missing=0,needed=0;
  for(let i=0;i<W*H;i++){const j=i*4;if(fd[j+3]>245&&orig[j+3]>245){needed++;if(data[j+3]<240)missing++}}
  if(missing>0||needed<100)throw Error('Clean Head Master ไม่สามารถรักษาใบหน้าเดิมได้ครบ จึงคงภาพที่ล็อกไว้');
  // Reject transparent holes in the reconstructed side-of-face/neck area.
  // Limit the scan to the head and neck; transparent background is intentional.
  const donorPixels=aligned.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  let headSamples=0,headHoles=0;
  const left=Math.max(0,Math.floor(cx-eyeD*.91)),right=Math.min(W,Math.ceil(cx+eyeD*.91));
  const top=Math.max(0,Math.floor(forehead-eyeD*.12)),bottom=Math.min(H,Math.ceil(chin+eyeD*.43));
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
   const j=(y*W+x)*4;
   // Only require donor coverage near visible original skin; never demand a
   // filled rectangular background or invent skin outside the person.
   if(orig[j+3]<245||fd[j+3]<245)continue;
   headSamples++;
   if(donorPixels[j+3]<230)headHoles++;
  }
  if(headSamples<100||headHoles>Math.max(12,headSamples*.01))
   throw Error('ภาพฐานมีช่องว่างบริเวณใบหน้าหรือคอ กรุณาลองภาพอื่น — ยังไม่ใช้สิทธิ์เปลี่ยนทรงผม');
  return {source:originalBlob,blob:await canvasPng(clean),faceMask:featheredFace,originalFace:originalPixels,originalCore:core,eyeD,forehead,chin,cx,darkStrandWarning};
 }finally{URL.revokeObjectURL(bu);URL.revokeObjectURL(ou)}
}
async function compositeHairOnCleanMaster(aiBlob,prepared){
 const au=URL.createObjectURL(aiBlob),cu=URL.createObjectURL(prepared.blob);
 try{
  const [ai,clean]=await Promise.all([loadImage(au),loadImage(cu)]);
  const lm=await getLandmarker(),af=lm.detect(ai).faceLandmarks?.[0],cf=lm.detect(clean).faceLandmarks?.[0];
  if(!af||!cf)throw Error('ตรวจจับใบหน้าเพื่อวางผมใหม่ไม่สำเร็จ');
  const W=clean.naturalWidth,H=clean.naturalHeight;
  const donor=alignFaceCanvas(ai,af,cf,W,H);
  // V102: the 256px semantic segmenter frequently misses dark braided hair
  // on a transparent donor. Build an additional donor-alpha/dark-strand mask
  // only in the hair region, never in the protected face or neck.
  const raw=await semanticClassMask(ai,ai.naturalWidth,ai.naturalHeight,[1]);
  const hairMask=raw?alignFaceCanvas(raw,af,cf,W,H):canvasFor(W,H);
  const maskCtx=hairMask.getContext('2d',{willReadFrequently:true});
  const maskImage=maskCtx.getImageData(0,0,W,H),maskPixels=maskImage.data;
  const skinPixels=prepared.faceMask.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const donorPixels=donor.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const corePixels=prepared.originalCore.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const crownTop=Math.max(0,Math.floor(prepared.forehead-prepared.eyeD*1.5));
  const crownBottom=Math.min(H,Math.ceil(prepared.forehead+prepared.eyeD*.35));
  const crownLeft=Math.max(0,Math.floor(prepared.cx-prepared.eyeD*1.35));
  const crownRight=Math.min(W,Math.ceil(prepared.cx+prepared.eyeD*1.35));
  let donorCrown=0,donorHair=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const j=(y*W+x)*4,alpha=donorPixels[j+3];
   if(alpha<80||corePixels[j+3]>24){maskPixels[j+3]=0;continue;}
   const r=donorPixels[j],g=donorPixels[j+1],b=donorPixels[j+2];
   const brightness=Math.max(r,g,b),min=Math.min(r,g,b);
   // Reject the white cutout fringe and skin; the fallback only accepts
   // sufficiently dark, near-neutral hair above the brow or beside temples.
   // V106: no horizontal forehead/temple crop. V105's nearCrown
   // y-threshold produced a visibly straight cut across the hairline.
   // The semantic hair matte defines the actual silhouette. For dark hair
   // missed by segmentation, admit only pixels outside a smooth facial
   // envelope; do not substitute a rectangular image crop for a hair mask.
   const dx=Math.abs(x-prepared.cx)/prepared.eyeD;
   const foreheadCurve=prepared.forehead+prepared.eyeD*(.035+.16*Math.min(1,dx*dx));
   const aboveFace=y<foreheadCurve;
   const besideFace=dx>.82&&y<prepared.chin+prepared.eyeD*.12;
   const hairRegion=aboveFace||besideFace;
   const darkStrand=brightness<115&&brightness-min<68;
   const semantic=maskPixels[j+3]>100&&brightness<190;
   const fallback=hairRegion&&darkStrand;
   const keep=semantic||fallback;
   maskPixels[j+3]=keep?Math.min(255,alpha):0;
   if(!keep||maskPixels[j+3]<160)continue;
   donorHair++;
   if(y>=crownTop&&y<crownBottom&&x>=crownLeft&&x<crownRight)donorCrown++;
  }
  maskCtx.putImageData(maskImage,0,0);
  // V106: feather the actual hair silhouette, not a rectangular face crop.
  // The previous binary mask left a visible box across the forehead/temples.
  const softenedMask=canvasFor(W,H),sm=softenedMask.getContext('2d');
  const edgeBlur=Math.max(1.2,Math.min(3.5,prepared.eyeD*.008));
  sm.filter=`blur(${edgeBlur}px)`;sm.drawImage(hairMask,0,0);sm.filter='none';
  // Keep the donor's real alpha: a blurred mask must never invent pixels
  // outside the original hair cutout or turn the white matte into a halo.
  sm.globalCompositeOperation='destination-in';sm.drawImage(donor,0,0);
  sm.globalCompositeOperation='source-over';
  // Count actual donor strands rather than the segmentation model alone.
  // Never commit a bald result if both methods failed to find new hair.
  const minCrown=Math.max(45,Math.round(prepared.eyeD*prepared.eyeD*.012));
  if(donorCrown<minCrown||donorHair<minCrown*2)
   throw Error('ไม่พบเส้นผมใหม่ในภาพ AI ที่ใช้ประกอบได้ — ยังคงพรีวิวเดิม');
  const hair=canvasFor(W,H),hc=hair.getContext('2d');hc.drawImage(donor,0,0);
  hc.globalCompositeOperation='destination-in';hc.drawImage(softenedMask,0,0);
  // Use a soft curved forehead/temple envelope, intersected with the actual
  // donor hair segmentation. No hard rectangular cut across the face.
  const frontRegion=canvasFor(W,H),fr=frontRegion.getContext('2d');
  const foreheadY=prepared.forehead,eyeD=prepared.eyeD;
  const foreheadGradient=fr.createRadialGradient(prepared.cx,foreheadY-eyeD*.35,eyeD*.18,prepared.cx,foreheadY-eyeD*.35,eyeD*1.13);
  foreheadGradient.addColorStop(0,'rgba(255,255,255,1)');
  foreheadGradient.addColorStop(.75,'rgba(255,255,255,1)');
  foreheadGradient.addColorStop(1,'rgba(255,255,255,0)');
  fr.fillStyle=foreheadGradient;
  fr.beginPath();fr.ellipse(prepared.cx,foreheadY-eyeD*.35,eyeD*1.13,eyeD*.92,0,0,Math.PI*2);fr.fill();
  for(const temple of [cf[234],cf[454]]){
   const tx=temple.x*W,ty=temple.y*H;
   const g=fr.createRadialGradient(tx,ty-eyeD*.12,eyeD*.07,tx,ty-eyeD*.12,eyeD*.49);
   g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.72,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,0)');
   fr.fillStyle=g;fr.beginPath();fr.ellipse(tx,ty-eyeD*.12,eyeD*.49,eyeD*.68,0,0,Math.PI*2);fr.fill();
  }
  // Allow actual segmented wisps beside the cheeks, not inside protected skin.
  // The donor hair mask is intersected later, so this cannot create hair by itself.
  for(const temple of [cf[234],cf[454]]){
   const tx=temple.x*W,ty=temple.y*H;
   const g=fr.createRadialGradient(tx,ty+eyeD*.23,eyeD*.08,tx,ty+eyeD*.23,eyeD*.78);
   g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.65,'rgba(255,255,255,.9)');g.addColorStop(1,'rgba(255,255,255,0)');
   fr.fillStyle=g;fr.beginPath();fr.ellipse(tx,ty+eyeD*.23,eyeD*.46,eyeD*.84,0,0,Math.PI*2);fr.fill();
  }
  // Protect the immutable central facial core, not the whole forehead.
  fr.globalCompositeOperation='destination-out';fr.drawImage(prepared.originalCore,0,0);
  const front=canvasFor(W,H),fc=front.getContext('2d');fc.drawImage(hair,0,0);
  fc.globalCompositeOperation='destination-in';fc.drawImage(frontRegion,0,0);
  const back=canvasFor(W,H),bc=back.getContext('2d');bc.drawImage(hair,0,0);
  bc.globalCompositeOperation='destination-out';bc.drawImage(frontRegion,0,0);
  // Subtract the protected anatomy from BACK hair once, explicitly. The
  // face mask is an alpha stencil; it is never painted as visible content.
  bc.globalCompositeOperation='destination-out';
  bc.drawImage(prepared.originalCore,0,0);
  bc.globalCompositeOperation='source-over';
  // Clean scalp must sit UNDER donor hair: drawing the opaque clean scalp
  // after back hair erased the new hairstyle except inside the front envelope.
  // Both hair layers are segmented donor pixels; the original visible skin is
  // restored last and never sourced from the hairstyle AI.
  const out=canvasFor(W,H),oc=out.getContext('2d');oc.drawImage(clean,0,0);oc.drawImage(back,0,0);oc.drawImage(front,0,0);
  // Reapply immutable originally visible face AND neck pixels, then compare against
  // the ORIGINAL source (not against the AI-generated clean base).
  const coreData=prepared.originalCore.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const originalData=prepared.originalFace.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const cleanData=canvasFor(W,H);cleanData.getContext('2d').drawImage(clean,0,0);
  const cd=cleanData.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  let originalMissing=0,coreCount=0;
  for(let i=0;i<W*H;i++){
   const j=i*4;
   if(coreData[j+3]<250)continue;
   coreCount++;
   if(originalData[j+3]<250||cd[j+3]<250||
      Math.abs(cd[j]-originalData[j])>2||
      Math.abs(cd[j+1]-originalData[j+1])>2||
      Math.abs(cd[j+2]-originalData[j+2])>2)originalMissing++;
  }
  if(coreCount<100||originalMissing)throw Error('ภาพฐานไม่รักษาพิกเซลใบหน้าต้นฉบับครบ จึงคงภาพเดิม');
  // V100: keep original skin where it is truly visible, but never paint
  // the original forehead/temple layer OVER the selected hairstyle. The
  // immutable facial core is exempt from the donor-hair subtraction.
  // A segmented hair pixel is not permission to overwrite eyes/nose/mouth.
  const restoredSkin=canvasFor(W,H),rsc=restoredSkin.getContext('2d');
  const skinEdge=canvasFor(W,H),sec=skinEdge.getContext('2d');
  sec.filter=`blur(${Math.max(2,Math.min(6,prepared.eyeD*.016))}px)`;
  sec.drawImage(prepared.originalFace,0,0);sec.filter='none';
  rsc.drawImage(skinEdge,0,0);
  const hairOverSkin=canvasFor(W,H),hos=hairOverSkin.getContext('2d');
  hos.drawImage(softenedMask,0,0);
  hos.globalCompositeOperation='destination-out';hos.drawImage(prepared.originalCore,0,0);
  rsc.globalCompositeOperation='destination-out';rsc.drawImage(hairOverSkin,0,0);
  rsc.globalCompositeOperation='source-over';
  // Restore the exact, unmodified central face pixels, including where the
  // segmentation model incorrectly calls eyebrows/eyes hair.
  const immutableCore=canvasFor(W,H),icc=immutableCore.getContext('2d');
  icc.drawImage(prepared.originalFace,0,0);
  icc.globalCompositeOperation='destination-in';icc.drawImage(prepared.originalCore,0,0);
  rsc.drawImage(immutableCore,0,0);
  oc.drawImage(restoredSkin,0,0);
  // Validate the COMPOSITED output too: a mask may contain hair, yet a later
  // layer or original-skin restore can accidentally erase the hairstyle.
  const visible=oc.getImageData(0,0,W,H).data;
  let visibleCrown=0;
  for(let y=crownTop;y<crownBottom;y++)for(let x=crownLeft;x<crownRight;x++){
   const j=(y*W+x)*4;
   if(maskPixels[j+3]<160||donorPixels[j+3]<160)continue;
   if(visible[j+3]<160)continue;
   const delta=Math.abs(visible[j]-donorPixels[j])+Math.abs(visible[j+1]-donorPixels[j+1])+Math.abs(visible[j+2]-donorPixels[j+2]);
   if(delta<48)visibleCrown++;
  }
  if(visibleCrown<Math.max(60,donorCrown*.30))
   throw Error('ทรงผมใหม่หายระหว่างประกอบภาพ — ยังคงรูปเดิมที่ล็อกไว้');
  const result=oc.getImageData(0,0,W,H).data;
  for(let i=0;i<W*H;i++){
   const j=i*4;if(coreData[j+3]<250)continue;
   if(result[j+3]<250||Math.abs(result[j]-originalData[j])>2||
      Math.abs(result[j+1]-originalData[j+1])>2||Math.abs(result[j+2]-originalData[j+2])>2)
    throw Error('ใบหน้าต้นฉบับเปลี่ยนไปหลังประกอบผม จึงคงภาพเดิม');
  }
  return canvasPng(out);
 }finally{URL.revokeObjectURL(au);URL.revokeObjectURL(cu)}
}
// V103: supply only the head and a short neck to the AI edit endpoint.
// Keep the full-resolution original/master untouched for pixel-safe compositing.
async function headOnlyAIEditFile(file){
 const url=URL.createObjectURL(file);
 try{
  const im=await loadImage(url),W=im.naturalWidth,H=im.naturalHeight;
  const face=(await getLandmarker()).detect(im).faceLandmarks?.[0];
  if(!face)throw Error('ไม่พบใบหน้าในภาพสำหรับเตรียมทรงผม');
  const eyeD=Math.hypot((face[263].x-face[33].x)*W,(face[263].y-face[33].y)*H);
  const chin=face[152].y*H;
  // Keep the jaw and a small amount of neck; exclude shoulders/chest entirely.
  const cutoff=Math.min(H,Math.max(1,Math.round(chin+eyeD*.60)));
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#f2f2f2';ctx.fillRect(0,0,W,H);
  ctx.drawImage(im,0,0,W,cutoff,0,0,W,cutoff);
  // A visible lower-body portion would be a preprocessing error, not a reason
  // to silently submit the unmodified image or consume another API request.
  if(cutoff>=H*.93)throw Error('ตัดภาพเฉพาะศีรษะไม่ได้ กรุณาใช้รูปที่เห็นศีรษะและคอชัดเจน');
  const png=await canvasPng(canvas);
  return new File([png],'head-only-ai-input.png',{type:'image/png'});
 }finally{URL.revokeObjectURL(url)}
}
// Read only the fixed template alpha; this never edits the outfit or skin.
function measureTemplateNeckline(data,W,H){
 const cx=Math.floor(W/2),edge=Math.floor(W*.15);let top=H,bottom=-1,maxWidth=0;
 for(let y=0;y<H;y++){
  let left=-1,right=-1;
  for(let x=cx;x>=edge;x--)if(data[(y*W+x)*4+3]>96){left=x;break}
  for(let x=cx;x<W-edge;x++)if(data[(y*W+x)*4+3]>96){right=x;break}
  if(left<0||right<0)continue;
  if(top===H)top=y;
  if(data[(y*W+cx)*4+3]>96){bottom=y;break}
  maxWidth=Math.max(maxWidth,right-left);
 }
 return {width:Math.min(.65,maxWidth/W),depth:Math.min(.65,Math.max(0,bottom-top)/H)};
}
const necklineProfileCache=new Map();
async function templateNecklineProfile(templatePath){
 if(!templatePath)return null;
 let pending=necklineProfileCache.get(templatePath);
 if(!pending){pending=(async()=>{
  try{const im=await loadImage(templatePath),W=im.naturalWidth,H=im.naturalHeight,c=canvasFor(W,H),x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0);return measureTemplateNeckline(x.getImageData(0,0,W,H).data,W,H)}catch{return null}
 })();necklineProfileCache.set(templatePath,pending)}
 return pending;
}
async function aiFinishPortrait(originalFile,hairId,options={}){
 // Persistent job: the server keeps processing even if this tab is closed.
 const fd=new FormData();
 const aiInput=await headOnlyAIEditFile(originalFile);
 fd.append('image',aiInput,aiInput.name);
 fd.append('hairId',hairId||'original');
 const neckline=await templateNecklineProfile(options.templatePath||options.jobContext?.uniformTemplate);
 if(neckline)fd.append('necklineProfile',JSON.stringify(neckline));
 if(options.creditKind==='hairstyle')fd.append('creditKind','hairstyle');
 if(options.maleHairReplacement&&/^manhair-\d{2}$/.test(hairId))fd.append('maleHairReplacement','1');
 await saveAiJobFile(originalFile);
 const r=await fetch('/api/ai-jobs',{method:'POST',body:fd,headers:walletHeaders()});
 if(!r.ok){const text=await r.text();if(r.status===402)window.dispatchEvent(new Event('idprom-buy'));throw analyticsTagError(Error(text||'สิทธิ์สร้างรูปหมดแล้ว กรุณาซื้อแพ็กเกจเพิ่มเติม'),{error_stage:'submit_job',http_status:r.status})}
 const info=await r.json();
 writeActiveAiJob({jobId:info.jobId,hairId:hairId||'original',context:options.jobContext||null,trialPreview:Boolean(info.trialPreview),createdAt:Date.now()});
 window.dispatchEvent(new CustomEvent('idprom-rights',{detail:{generationRemaining:Number(info.generationRemaining||0),hairRemaining:Number(info.hairRemaining||0)}}));
 const result=await waitForAiJob(info.jobId,options.onJobStatus);return result;
}

// V206: provider edit masks are not a pixel-identity guarantee. Restore the
// photographed face after background removal, aligned from the original eyes.
async function restoreOriginalFacePixels(processedBlob,originalFile){
 const pu=URL.createObjectURL(processedBlob),ou=URL.createObjectURL(originalFile);
 try{
  const [processed,original]=await Promise.all([loadImage(pu),loadImage(ou)]);
  const landmarker=await getLandmarker(),pf=landmarker.detect(processed).faceLandmarks?.[0],of=landmarker.detect(original).faceLandmarks?.[0];
  if(!pf||!of)throw Error('ล็อกใบหน้าต้นฉบับไม่สำเร็จ');
  const W=processed.naturalWidth,H=processed.naturalHeight;
  const aligned=alignFaceCanvas(original,of,pf,W,H);
  // Protect only actual facial skin, not the scalp/hair inside the old
  // face-contour polygon. The old polygon pasted a second hairline/forehead
  // over the newly generated hairstyle, producing a visible mask-shaped seam.
  const eyeD=Math.hypot((pf[263].x-pf[33].x)*W,(pf[263].y-pf[33].y)*H);
  const [newSkin,oldSkin]=await Promise.all([
   semanticClassMask(processed,W,H,[3]),
   semanticClassMask(aligned,W,H,[3])
  ]);
  if(!newSkin||!oldSkin)throw Error('ตรวจบริเวณผิวหน้าก่อนเปลี่ยนทรงผมไม่สำเร็จ');
  const contour=faceProtection(pf,W,H);
  const a=newSkin.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const b=oldSkin.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const c=contour.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const stencil=canvasFor(W,H),st=stencil.getContext('2d');
  const pixels=st.createImageData(W,H);
  for(let j=0;j<pixels.data.length;j+=4){
   pixels.data[j]=pixels.data[j+1]=pixels.data[j+2]=255;
   pixels.data[j+3]=Math.min(a[j+3],b[j+3],c[j+3]);
  }
  st.putImageData(pixels,0,0);
  // Broad feather makes the transition gradual, rather than a sharp oval
  // or a horizontal stripe across the forehead. Never draw the stencil itself.
  const soft=canvasFor(W,H),sx=soft.getContext('2d');
  sx.filter=`blur(${Math.max(8,Math.min(28,eyeD*.085))}px)`;
  sx.drawImage(stencil,0,0);sx.filter='none';
  const originalFace=canvasFor(W,H),fx=originalFace.getContext('2d');
  fx.drawImage(aligned,0,0);fx.globalCompositeOperation='destination-in';fx.drawImage(soft,0,0);
  const out=canvasFor(W,H),ox=out.getContext('2d');ox.drawImage(processed,0,0);ox.drawImage(originalFace,0,0);
  return await canvasPng(out);
 }finally{URL.revokeObjectURL(pu);URL.revokeObjectURL(ou)}
}

// V207: one coherent image layer, with a restrained local unsharp-mask only on
// segmented skin. It clarifies real pore texture without pasting another face,
// reshaping landmarks, whitening skin or touching hair/background/clothing.
async function refineSkinTextureBlob(blob,skinMask=null){
 const url=URL.createObjectURL(blob);
 try{
  const image=await loadImage(url),W=image.naturalWidth,H=image.naturalHeight;
  const skin=skinMask||await semanticClassMask(image,W,H,[2,3]);
  if(!skin)return blob;
  const base=canvasFor(W,H),bx=base.getContext('2d',{willReadFrequently:true});bx.drawImage(image,0,0);
  const blur=canvasFor(W,H),ux=blur.getContext('2d',{willReadFrequently:true});ux.filter=`blur(${Math.max(.7,Math.min(1.4,W*.0011))}px)`;ux.drawImage(image,0,0);ux.filter='none';
  const out=bx.getImageData(0,0,W,H),soft=ux.getImageData(0,0,W,H).data,mask=skin.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  for(let i=0;i<W*H;i++){
   const j=i*4;if(out.data[j+3]<32||mask[j+3]<32)continue;
   const amount=.24*(mask[j+3]/255);
   for(let c=0;c<3;c++)out.data[j+c]=Math.max(0,Math.min(255,Math.round(out.data[j+c]+(out.data[j+c]-soft[j+c])*amount)));
  }
  bx.putImageData(out,0,0);return await canvasPng(base);
 }catch(e){console.warn('Skin texture refinement skipped',e);return blob}
 finally{URL.revokeObjectURL(url)}
}

async function responseError(response,fallback){
 let data=null;
 try{
  data=(response.headers.get('content-type')||'').includes('application/json')?await response.json():await response.text();
 }catch{}
 const error=Error((typeof data==='string'?data:data?.message)||fallback);
 error.code=typeof data==='object'&&data?data.code:'';
 error.appCreditCharged=typeof data==='object'&&data?data.appCreditCharged:undefined;
 error.keepOriginal=typeof data==='object'&&data?data.keepOriginal:undefined;
 return error;
}

// V204: segment + landmark guided EDIT of the immutable head master.
// The AI edits an image, never supplies a separately aligned donor face.
const HAIR_FACE_CONTOUR=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
function faceProtection(face,W,H){
 const c=canvasFor(W,H),x=c.getContext('2d');x.fillStyle='#fff';x.beginPath();
 HAIR_FACE_CONTOUR.forEach((i,n)=>{const q=face[i];n?x.lineTo(q.x*W,q.y*H):x.moveTo(q.x*W,q.y*H)});
 x.closePath();x.fill();return c;
}
async function prepareHairEdit(masterBlob){
 const url=URL.createObjectURL(masterBlob);
 try{
  const image=await loadImage(url),W=image.naturalWidth,H=image.naturalHeight;
  const face=(await getLandmarker()).detect(image).faceLandmarks?.[0];
  if(!face)throw Error('ตรวจใบหน้าในภาพฐานไม่สำเร็จ — ยังไม่เรียก AI');
  const hair=await semanticClassMask(image,W,H,[1]);
  const faceSkinMask=await semanticClassMask(image,W,H,[3]);
  const bodyAndClothesMask=await semanticClassMask(image,W,H,[2,4]);
  if(!hair||!faceSkinMask||!bodyAndClothesMask)throw Error('โมเดลแยกผมหรือผิวไม่พร้อม — ยังไม่เรียก AI');
  const hc=hair.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const faceSkin=faceSkinMask.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const bodyAndClothes=bodyAndClothesMask.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const shield=faceProtection(face,W,H).getContext('2d').getImageData(0,0,W,H).data;
  const faceRegion=new Uint8ClampedArray(shield);
  const eyeD=Math.hypot((face[33].x-face[263].x)*W,(face[33].y-face[263].y)*H);
  let count=0;for(let i=0;i<W*H;i++)if(hc[i*4+3]>128&&shield[i*4+3]===0)count++;
  if(count<Math.max(120,eyeD*eyeD*.025))throw Error('ไม่พบผมในภาพฐานเพียงพอ — ยังไม่เรียก AI');
  // Dilate existing hair and add bounded top/side corridors. The corridors let
  // a selected long style extend past short source hair without opening the
  // face, neck or uniform to the model.
  const expanded=canvasFor(W,H),ex=expanded.getContext('2d');
  const radius=Math.max(3,Math.round(eyeD*.085));
  for(let dy=-radius;dy<=radius;dy+=Math.max(2,Math.round(radius/3)))
   for(let dx=-radius;dx<=radius;dx+=Math.max(2,Math.round(radius/3)))
    if(dx*dx+dy*dy<=radius*radius)ex.drawImage(hair,dx,dy);
  const forehead=face[10].y*H,cx=(face[33].x+face[263].x)*W/2;
  ex.fillStyle='#fff';ex.beginPath();ex.ellipse(cx,forehead-eyeD*.43,eyeD*1.55,eyeD*.85,0,0,Math.PI*2);ex.fill();
  const jawY=face[152].y*H,sideTop=forehead-eyeD*.25,sideBottom=Math.min(H,jawY+eyeD*2.75);
  ex.beginPath();ex.roundRect(cx-eyeD*1.78,sideTop,eyeD*.92,sideBottom-sideTop,eyeD*.35);ex.fill();
  ex.beginPath();ex.roundRect(cx+eyeD*.86,sideTop,eyeD*.92,sideBottom-sideTop,eyeD*.35);ex.fill();
  const edit=ex.getImageData(0,0,W,H),mask=canvasFor(W,H),mx=mask.getContext('2d');
  const md=mx.createImageData(W,H),allowed=new Uint8Array(W*H),immutable=new Uint8ClampedArray(W*H*4);
  const browIds=[70,63,105,66,107,336,296,334,293,300];
  const browY=browIds.reduce((sum,index)=>sum+face[index].y*H,0)/browIds.length;
  const fringeLimit=browY-eyeD*.12;
  for(let i=0;i<W*H;i++){
   const j=i*4,y=Math.floor(i/W);
   // Upper forehead may receive fringe; everything from the brow line down,
   // plus neck/body/clothes, is immutable at the pixel level.
   const protect=bodyAndClothes[j+3]>128||(faceSkin[j+3]>128&&y>=fringeLimit)||(shield[j+3]>0&&y>=fringeLimit);
   immutable[j]=immutable[j+1]=immutable[j+2]=255;immutable[j+3]=protect?255:0;
   if(y<fringeLimit)shield[j+3]=0;
   allowed[i]=!protect&&edit.data[j+3]>0?1:0;
   md.data[j]=md.data[j+1]=md.data[j+2]=255;
   // OpenAI mask: transparent = editable; opaque = protected.
   md.data[j+3]=allowed[i]?0:255;
  }
  mx.putImageData(md,0,0);
  const input=canvasFor(W,H),ix=input.getContext('2d');
  ix.fillStyle='#349cf0';ix.fillRect(0,0,W,H);ix.drawImage(image,0,0);
  return {input:await canvasPng(input),mask:await canvasPng(mask),allowed,W,H,eyeD,forehead,originalHair:hc,protectedSkin:immutable,faceShield:shield,faceRegion};
 }finally{URL.revokeObjectURL(url)}
}
// V204: provider receives one immutable portrait, one exact style and one hard mask.
async function requestHairstyleEngine(master,id){
 const fd=new FormData();fd.append('image',new File([master],'head.png',{type:'image/png'}));fd.append('hairId',id);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
 try{const r=await fetch('/api/hairstyle/edit',{method:'POST',body:fd,signal:controller.signal,headers:walletHeaders()});
  if(!r.ok){const text=await r.text();if(r.status===402)window.dispatchEvent(new Event('idprom-buy'));throw Error(text||'สิทธิ์เปลี่ยนทรงผมหมดแล้ว กรุณาซื้อแพ็กเกจเพิ่มเติม')}updateCreditsFromResponse(r);return await r.blob();
 }catch(e){if(e?.name==='AbortError')throw Error('เปลี่ยนทรงผมใช้เวลานานเกิน 120 วินาที');throw e}
 finally{clearTimeout(timer)}
}
async function composeHairEdit(aiBlob,masterBlob,prepared){
 const au=URL.createObjectURL(aiBlob),mu=URL.createObjectURL(masterBlob);
 try{
  const [ai,master]=await Promise.all([loadImage(au),loadImage(mu)]);
  const {W,H,allowed,originalHair,protectedSkin,faceShield,faceRegion}=prepared;
  const oldC=canvasFor(W,H),oc=oldC.getContext('2d',{willReadFrequently:true});oc.drawImage(master,0,0);
  const original=oc.getImageData(0,0,W,H),out=oc.createImageData(W,H);
  out.data.set(original.data);
  const newC=canvasFor(W,H),nc=newC.getContext('2d',{willReadFrequently:true});nc.drawImage(ai,0,0,W,H);
  const generated=nc.getImageData(0,0,W,H).data;
  // Segmentation is a soft classification hint, not a hard "no hair" abort.
  // The inpaint mask itself is the strict write boundary.
  const newHair=await semanticClassMask(ai,W,H,[1]);
  if(!newHair)throw Error('โมเดลตรวจผมผลลัพธ์ไม่พร้อม — คงภาพเดิม');
  const fresh=newHair.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const newFaceSkin=await semanticClassMask(ai,W,H,[3]);
  const generatedSkin=newFaceSkin?.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  // V214: AI generates the selected hairstyle; segmentation is used ONLY to extract its hair.
  // The original photographed face/skin and its texture remain immutable.
  // V213: 256px segmentation misses thin roots and braids at full resolution.
  // Reclaim only genuinely dark, neutral donor pixels immediately next to a
  // confirmed hair pixel, within the already permitted hair edit region.
  // Blue background and face skin are never used as hair fill.
  const refined=new Uint8Array(W*H);
  const isDonorHair=i=>{
   const j=i*4,r=generated[j],g=generated[j+1],b=generated[j+2];
   return generated[j+3]>245&&Math.max(r,g,b)<155&&Math.abs(r-g)<52&&b<r+30;
  };
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
   const i=y*W+x,j=i*4;
   if(!allowed[i]||protectedSkin[j+3]>128||faceShield[j+3]>0)continue;
   if(fresh[j+3]>64){refined[i]=255;continue}
   if(!isDonorHair(i))continue;
   const nearby=[i-1,i+1,i-W,i+W,i-W-1,i-W+1,i+W-1,i+W+1];
   if(nearby.some(k=>fresh[k*4+3]>64))refined[i]=255;
  }
  // Feather only the outermost hair boundary (not the whole hairstyle).
  // Retain real strand contrast and protect the photographed skin exactly.
  const matte=new Uint8Array(W*H);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
   const i=y*W+x;if(!refined[i])continue;
   let neighbors=0;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)neighbors+=refined[i+dy*W+dx]?1:0;
   matte[i]=neighbors===9?255:Math.max(110,Math.round(neighbors/9*255));
  }
  const hairlineY=(prepared.forehead||0),hairlineHalf=prepared.eyeD*.14;
  let changed=0;
  for(let i=0;i<W*H;i++){
   if(!allowed[i])continue;
   const j=i*4,old=originalHair[j+3]>96,newPx=matte[i]>0;
   if(old&&!newPx){
    // V213: never punch a blue hole in the photographed hairline when the
    // coarse segmenter drops a few roots at the forehead. Keep the original
    // strand there, but only in this narrow anatomical transition band.
    const x=i%W,y=Math.floor(i/W);
    if(Math.abs(y-hairlineY)<hairlineHalf&&Math.abs(x-W/2)<prepared.eyeD*1.3)continue;
    // When a shorter/newly parted style exposes upper forehead, keep the AI's
    // skin fill only inside that tiny permitted face region. Removed hair in
    // the surrounding background becomes transparent for the chosen backdrop.
    if(faceRegion?.[j+3]>0&&generatedSkin?.[j+3]>64){
     out.data[j]=generated[j];out.data[j+1]=generated[j+1];out.data[j+2]=generated[j+2];out.data[j+3]=255;
    }else {
     // A missing segmentation pixel must never punch a blue hole through a
     // photographic hairline. Retain source strands touching AI hair; remove
     // genuinely displaced old hair elsewhere so the selected style is visible.
     const x=i%W,y=Math.floor(i/W);
     let touchesNew=false;
     if(y<prepared.forehead+prepared.eyeD*.32){
      for(let dy=-3;dy<=3&&!touchesNew;dy++)for(let dx=-3;dx<=3;dx++){
       const xx=x+dx,yy=y+dy;if(xx>=0&&xx<W&&yy>=0&&yy<H&&matte[yy*W+xx]>0){touchesNew=true;break;}
      }
     }
     if(touchesNew)continue;
     out.data[j+3]=0;
    }
    changed++;continue
   }
   if(newPx){
    out.data[j]=generated[j];out.data[j+1]=generated[j+1];out.data[j+2]=generated[j+2];
    out.data[j+3]=Math.max(0,Math.min(255,Math.round(matte[i]*generated[j+3]/255)));
    changed++;
   }
  }
  if(changed<Math.max(80,prepared.eyeD*prepared.eyeD*.025))throw Error('ผลแก้ผมไม่มีการเปลี่ยนแปลงเพียงพอ — คงภาพเดิม');
  for(let i=0;i<W*H;i++){
   const j=i*4;
   if((faceShield[j+3]>0||protectedSkin[j+3]>128)&&(
    out.data[j]!==original.data[j]||out.data[j+1]!==original.data[j+1]||
    out.data[j+2]!==original.data[j+2]||out.data[j+3]!==original.data[j+3]))
    throw Error('พื้นที่ใบหน้าหรือชุดถูกแก้ไข — คงภาพเดิม');
  }
  oc.putImageData(out,0,0);return await canvasPng(oldC);
 }finally{URL.revokeObjectURL(au);URL.revokeObjectURL(mu)}
}
const RIBBON_OPTIONS=[
 {id:'2504-2514',name:'2504-2514',src:'/assets/ribbons/2504-2514.png'},
 {id:'2515',name:'2515',src:'/assets/ribbons/2515.png'},
 {id:'2516-2520',name:'2516-2520',src:'/assets/ribbons/2516-2520.png'},
 {id:'2521-2525',name:'2521-2525',src:'/assets/ribbons/2521-2525.png'},
 {id:'2526-2527',name:'2526-2527',src:'/assets/ribbons/2526-2527.png'},
 {id:'2528-2530',name:'2528-2530',src:'/assets/ribbons/2528-2530.png'},
 {id:'2531',name:'2531',src:'/assets/ribbons/2531.png'},
 {id:'2532-2535',name:'2532-2535',src:'/assets/ribbons/2532-2535.png'},
 {id:'2536-2539',name:'2536-2539',src:'/assets/ribbons/2536-2539.png'},
 {id:'2540-2542',name:'2540-2542',src:'/assets/ribbons/2540-2542.png'},
 {id:'2543-2547',name:'2543-2547',src:'/assets/ribbons/2543-2547.png'},
 {id:'2548-2549',name:'2548-2549',src:'/assets/ribbons/2548-2549.png'}
];
const CHEST_PIN_OPTIONS=[
 {id:'pao',name:'อบจ.',src:'/assets/government-insignia/chest-pao.png'},
 {id:'sao',name:'อบต.',src:'/assets/government-insignia/chest-sao.png'},
 {id:'municipality',name:'ทต.',src:'/assets/government-insignia/chest-municipality.png'},
 {id:'bma',name:'กทม.',src:'/assets/government-insignia/chest-bma.png'}
];
const COLLAR_PIN_OPTIONS=[
 {id:'garuda-pair',name:'มท.',left:'/assets/government-insignia/garuda-left.png',right:'/assets/government-insignia/garuda-right.png'},
 {id:'education-pair',name:'ศึกษาธิการ',left:'/assets/government-insignia/education-left.png',right:'/assets/government-insignia/education-right.png'},
 {id:'public-health-pair',name:'สาธารณสุข',left:'/assets/government-insignia/public-health-left.png',right:'/assets/government-insignia/public-health-right.png'},
 {id:'finance-pair',name:'การคลัง',left:'/assets/government-insignia/finance-left.png',right:'/assets/government-insignia/finance-right.png'},
 {id:'agriculture-pair',name:'เกษตร',left:'/assets/government-insignia/agriculture-left.png',right:'/assets/government-insignia/agriculture-right.png'},
 {id:'transport-pair',name:'คมนาคม',left:'/assets/government-insignia/transport-left.png',right:'/assets/government-insignia/transport-right.png'} ,
 {id:'labor-pair',name:'แรงงาน',left:'/assets/government-insignia/labor-left.png',right:'/assets/government-insignia/labor-right.png'},
 {id:'higher-education-pair',name:'อุดมศึกษา',left:'/assets/government-insignia/higher-education-left.png',right:'/assets/government-insignia/higher-education-right.png'},
 {id:'justice-pair',name:'ยุติธรรม',left:'/assets/government-insignia/justice-left.png',right:'/assets/government-insignia/justice-right.png'},
 {id:'industry-pair',name:'อุตสาหกรรม',left:'/assets/government-insignia/industry-left.png',right:'/assets/government-insignia/industry-right.png'},
 {id:'culture-pair',name:'วัฒนธรรม',left:'/assets/government-insignia/culture-left.png',right:'/assets/government-insignia/culture-right.png'},
 {id:'energy-pair',name:'พลังงาน',left:'/assets/government-insignia/energy-left.png',right:'/assets/government-insignia/energy-right.png'},
 {id:'audit-pair',name:'สตง.',left:'/assets/government-insignia/audit-left.png',right:'/assets/government-insignia/audit-right.png'},
 {id:'court-of-justice-pair',name:'ศาลยุติธรรม',left:'/assets/government-insignia/court-of-justice-left.png',right:'/assets/government-insignia/court-of-justice-right.png'},
 {id:'environment-pair',name:'สิ่งแวดล้อม',left:'/assets/government-insignia/environment-left.png',right:'/assets/government-insignia/environment-right.png'},
 {id:'administrative-court-pair',name:'ศาลปกครอง',left:'/assets/government-insignia/administrative-court-left.png',right:'/assets/government-insignia/administrative-court-right.png'},
 {id:'digital-pair',name:'ดิจิทัล',left:'/assets/government-insignia/digital-left.png',right:'/assets/government-insignia/digital-right.png'},
 {id:'nacc-pair',name:'ป.ป.ช.',left:'/assets/government-insignia/nacc-left.png',right:'/assets/government-insignia/nacc-right.png'}
];
const BACKGROUND_OPTIONS=[{id:'default',name:'พื้นหลังเดิม',src:'/assets/background.jpg'},{id:'light-blue',name:'ฟ้าอ่อน',src:'/assets/background-options/light-blue.jpg'},{id:'deep-blue',name:'ฟ้าเข้ม',src:'/assets/background-options/deep-blue.jpg'},{id:'white',name:'ขาว',src:'/assets/background-options/white.jpg'},{id:'periwinkle',name:'ฟ้าอมม่วง',src:'/assets/background-options/periwinkle.jpg'}];
const MALE_HAIR_OPTIONS=Array.from({length:12},(_,i)=>{const number=String(i+1).padStart(2,'0');return {id:`manhair-${number}`,name:`ทรงผม ${number}`,src:`/assets/hairstyle-previews/manhair-${number}.png`};});
const HAIR_OPTIONS=[
 {id:'hair-01',name:'ทรงผม 01',src:'/assets/hairstyle-previews/hair-01.png'},
 {id:'hair-02',name:'ทรงผม 02',src:'/assets/hairstyle-previews/hair-02.png'},
 {id:'hair-03',name:'ทรงผม 03',src:'/assets/hairstyle-previews/hair-03.png'},
 {id:'hair-04',name:'ทรงผม 04',src:'/assets/hairstyle-previews/hair-04.png'},
 {id:'hair-05',name:'ทรงผม 05',src:'/assets/hairstyle-previews/hair-05.png'},
 {id:'hair-06',name:'ทรงผม 06',src:'/assets/hairstyle-previews/hair-06.png'},
 {id:'hair-07',name:'ทรงผม 07',src:'/assets/hairstyle-previews/hair-07.png'},
 {id:'hair-08',name:'ทรงผม 08',src:'/assets/hairstyle-previews/hair-08.png'},
 {id:'hair-09',name:'ทรงผม 09',src:'/assets/hairstyle-previews/hair-09.png'},
 {id:'hair-10',name:'ทรงผม 10',src:'/assets/hairstyle-previews/hair-10.png'},
 {id:'hair-11',name:'ทรงผม 11',src:'/assets/hairstyle-previews/hair-11.png'},
 {id:'hair-12',name:'ทรงผม 12',src:'/assets/hairstyle-previews/hair-12.png'},
 {id:'hair-13',name:'ทรงผม 13',src:'/assets/hairstyle-previews/hair-13.png'},
 {id:'hair-14',name:'ทรงผม 14',src:'/assets/hairstyle-previews/hair-14.png'},
 {id:'hair-15',name:'ทรงผม 15',src:'/assets/hairstyle-previews/hair-15.png'},
 {id:'hair-16',name:'ทรงผม 16',src:'/assets/hairstyle-previews/hair-16.png'},
 {id:'hair-17',name:'ทรงผม 17',src:'/assets/hairstyle-previews/hair-17.png'},
 {id:'hair-18',name:'ทรงผม 18',src:'/assets/hairstyle-previews/hair-18.png'},
 {id:'hair-19',name:'ทรงผม 19',src:'/assets/hairstyle-previews/hair-19.png'},
 {id:'hair-20',name:'ทรงผม 20',src:'/assets/hairstyle-previews/hair-20.png'},
 {id:'hair-21',name:'ทรงผม 21',src:'/assets/hairstyle-previews/hair-21.png'},
 {id:'hair-22',name:'ทรงผม 22',src:'/assets/hairstyle-previews/hair-22.png'},
 {id:'hair-23',name:'ทรงผม 23',src:'/assets/hairstyle-previews/hair-23.png'},
 {id:'hair-24',name:'ทรงผม 24',src:'/assets/hairstyle-previews/hair-24.png'},
 {id:'hair-25',name:'ทรงผม 25',src:'/assets/hairstyle-previews/hair-25.png'},
 {id:'hair-26',name:'ทรงผม 26',src:'/assets/hairstyle-previews/hair-26.png'},
 {id:'hair-27',name:'ทรงผม 27',src:'/assets/hairstyle-previews/hair-27.png'},
 {id:'hair-28',name:'ทรงผม 28',src:'/assets/hairstyle-previews/hair-28.png'},
 {id:'hair-29',name:'ทรงผม 29',src:'/assets/hairstyle-previews/hair-29.png'}
];

const JOB_UNIFORMS=[
 {id:'female-formal-suit',title:'สูทหญิง',img:'/assets/job-uniforms/female-formal-suit-example.png',template:'/assets/job-uniforms/female-formal-suit.png',cat:'job',gender:'female'},
 {id:'female-lapel-suit',title:'สูทหญิงคอแบะ',img:'/assets/job-uniforms/female-lapel-suit-example.png',template:'/assets/job-uniforms/female-lapel-suit.png',cat:'job',gender:'female'},
 {id:'female-suit-03',title:'สูทหญิง แบบ 3',img:'/assets/job-uniforms/female-suit-03-example.png',template:'/assets/job-uniforms/female-suit-03.png',cat:'job',gender:'female'},
 {id:'male-suit-03',title:'สูทชาย แบบ 3',img:'/assets/job-uniforms/male-suit-03-example.png',template:'/assets/job-uniforms/male-suit-03.png',cat:'job',gender:'male'},
 {id:'male-suit-04',title:'สูทชาย แบบ 4',img:'/assets/job-uniforms/male-suit-04-example.png',template:'/assets/job-uniforms/male-suit-04.png',cat:'job',gender:'male'},
 {id:'male-formal-tie-suit',title:'สูทชาย',img:'/assets/job-uniforms/male-formal-tie-suit-example.png',template:'/assets/job-uniforms/male-navy-tie.png',cat:'job',gender:'male'},
 {id:'male-open-collar-suit',title:'สูทชายลำลอง',img:'/assets/job-uniforms/male-open-collar-suit-example.png',template:'/assets/job-uniforms/male-navy-suit.png',cat:'job',gender:'male'},
 {id:'female-white-shirt',title:'เชิ้ตหญิง',img:'/assets/job-uniforms/female-white-shirt-example.png',template:'/assets/job-uniforms/female-white-shirt.png',cat:'job',gender:'female'},
 {id:'female-white-shirt-02',title:'เชิ้ตหญิง แบบ 2',img:'/assets/job-uniforms/female-white-shirt-02-example.png',template:'/assets/job-uniforms/female-white-shirt-02.png',cat:'job',gender:'female'},
 {id:'male-white-shirt-v132',title:'เชิ้ตชาย',img:'/assets/job-uniforms/male-white-shirt-v132-example.png',template:'/assets/job-uniforms/male-open-collar-suit.png',cat:'job',gender:'male'},
];

const STUDENT_UNIFORMS=[
 {id:'student-female-01',title:'นักศึกษาหญิง แบบ 1',img:'/assets/student-uniforms/previews/female-01.jpg',template:'/assets/student-uniforms/female-01.png',cat:'student',gender:'female'},
 {id:'student-female-02',title:'นักศึกษาหญิง แบบ 2',img:'/assets/student-uniforms/previews/female-02.jpg',template:'/assets/student-uniforms/female-02.png',cat:'student',gender:'female'},
 {id:'student-male-01',title:'นักศึกษาชาย แบบ 1',img:'/assets/student-uniforms/previews/male-01.jpg',template:'/assets/student-uniforms/male-01.png',cat:'student',gender:'male'},
 {id:'student-male-02',title:'นักศึกษาชาย แบบ 2',img:'/assets/student-uniforms/previews/male-02.jpg',template:'/assets/student-uniforms/male-02.png',cat:'student',gender:'male'},
];

const GOWN_UNIFORMS=[
 {id:'kmitl-female',title:'ครุย สจล. หญิง',img:'/assets/gown-uniforms/kmitl-female-example.jpg',template:'/assets/gown-uniforms/kmitl-female.png',cat:'gown',gender:'female'},
 {id:'kmitl-male',title:'ครุย สจล. ชาย',img:'/assets/gown-uniforms/kmitl-male-example.jpg',template:'/assets/gown-uniforms/kmitl-male.png',cat:'gown',gender:'male'},
];

const INTERIOR_UNIFORMS=[
 {id:'interior-01',name:'ปฏิบัติงาน',level:'operational',img:'/assets/government-uniforms/interior-01.png',preview:'/assets/government-uniforms/male-operational-example.png'},
 {id:'interior-02',name:'ปฏิบัติการ',level:'academic',img:'/assets/government-uniforms/interior-02.png',preview:'/assets/government-uniforms/male-academic-example.png'},
 {id:'interior-03',name:'ชำนาญการ / อาวุโส',level:'senior',img:'/assets/government-uniforms/interior-03.png',preview:'/assets/government-uniforms/male-senior-example.png'},
 {id:'male-government-employee',name:'พนักงานราชการ',level:'government-employee',img:'/assets/government-uniforms/male-government-employee.png',preview:'/assets/government-uniforms/male-government-employee-example.jpg'},
];
const FEMALE_GOVERNMENT_UNIFORMS=[
 {id:'female-operational',name:'ปฏิบัติงาน',level:'operational',img:'/assets/government-uniforms/female-operational.png',preview:'/assets/government-uniforms/female-operational-example.jpg'},
 {id:'female-academic',name:'ปฏิบัติการ',level:'academic',img:'/assets/government-uniforms/female-academic.png',preview:'/assets/government-uniforms/female-academic-example.jpg'},
 {id:'female-senior',name:'ชำนาญการ / อาวุโส',level:'senior',img:'/assets/government-uniforms/female-senior.png',preview:'/assets/government-uniforms/female-senior-example.jpg'},
 {id:'female-government-employee',name:'พนักงานราชการ',level:'government-employee',img:'/assets/government-uniforms/female-government-employee.png',preview:'/assets/government-uniforms/female-government-employee-example.jpg'},
];
const UNIFORM_GROUPS=[
 {id:'job',name:'สมัครงาน',items:JOB_UNIFORMS.map(item=>({...item,name:item.title,preview:item.img,template:item.template}))},
 {id:'government-female',name:'ข้าราชการหญิง',items:FEMALE_GOVERNMENT_UNIFORMS.map(item=>({...item,title:item.name,template:item.img,cat:'government',gender:'female'}))},
 {id:'government-male',name:'ข้าราชการชาย',items:INTERIOR_UNIFORMS.map(item=>({...item,title:item.name,preview:item.preview,template:item.img,cat:'government',gender:'male'}))},
 {id:'gown',name:'ชุดครุย',items:GOWN_UNIFORMS.map(item=>({...item,name:item.gender==='female'?'หญิง':'ชาย',preview:item.img}))},
 {id:'student',name:'นักศึกษา',items:STUDENT_UNIFORMS.map(item=>({...item,name:item.title,preview:item.img,template:item.template}))},
];
const FREE_TEMPLATE_PATHS=UNIFORM_GROUPS.flatMap(group=>{const seen=new Set();return group.items.filter(item=>{const key=(item.cat||group.id)+'/'+item.gender;if(seen.has(key))return false;seen.add(key);return true}).map(item=>item.template)});
function normalizedRights(data){return {...(Number.isFinite(Number(data.trialRemaining))?{trialRemaining:Number(data.trialRemaining)}:{}),...(typeof data.hasPurchased==='boolean'?{hasPurchased:data.hasPurchased}:{}),...(typeof data.trialAvailable==='boolean'?{trialAvailable:data.trialAvailable}:{}),generationRemaining:Number(data.processRemaining??data.generationRemaining??0),hairRemaining:Number(data.processRemaining??data.hairRemaining??0),...(Array.isArray(data.unlockedJobIds)?{unlockedJobIds:data.unlockedJobIds}:{}),...(Array.isArray(data.editableJobIds)?{editableJobIds:data.editableJobIds}:{})}}
const GOVERNMENT_FINANCE_TEMPLATE=FEMALE_GOVERNMENT_UNIFORMS[0].img;

function HeadAdjustGlyph({type}){
 const common={viewBox:'0 0 32 32','aria-hidden':'true'};
 if(type==='scale')return <svg {...common}><path d="M13 5H5v8M19 5h8v8M13 27H5v-8M19 27h8v-8"/><path d="M5 5l8 8M27 5l-8 8M5 27l8-8M27 27l-8-8"/></svg>;
 if(type==='horizontal')return <svg {...common}><path d="M5 16h22M5 16l6-6M5 16l6 6M27 16l-6-6M27 16l-6 6"/></svg>;
 if(type==='vertical')return <svg {...common}><path d="M16 5v22M16 5l-6 6M16 5l6 6M16 27l-6-6M16 27l6-6"/></svg>;
 return <svg {...common}><path d="M8 11V7h4M24 11V7h-4M8 21v4h4M24 21v4h-4"/><circle cx="16" cy="16" r="5"/><path d="M20.5 12.5A6 6 0 0 1 22 16"/></svg>;
}

function ResetGlyph(){return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 10V5m0 0H3m5 0-3.5 3.5A11 11 0 1 0 8 6"/></svg>}

function firstFitHeadAdjust(lock,gender='female'){
 const desiredFaceRatio=gender==='male'?.40:.445;
 const desiredFaceW=(lock.shoulderSpan||lock.W*.79)*desiredFaceRatio;
 const faceScale=desiredFaceW/Math.max(1,lock.placedFaceW||lock.W*.26);
 const chinCanvasY=lock.hY+lock.chinY*lock.scale;
 const crownDistance=Math.max(1,(lock.chinY-(lock.opaqueHeadTop||0))*lock.scale);
 const maxByTop=(chinCanvasY-lock.H*.065)/crownDistance;
 const maxByWidth=lock.W*.92/Math.max(1,lock.opaqueHeadW||lock.W*.32);
 const scale=Math.max(.75,Math.min(1.75,faceScale,maxByTop,maxByWidth));
 // renderAdjustedFinal scales around the head-master centre. Counter-shift Y so
 // the chin/collar anchor from composePortrait remains unchanged after auto-fit.
 const y=((lock.chinY-lock.headH/2)*lock.scale*(1-scale))/lock.H;
 return {scale,x:0,y,rotation:0};
}

// V292: entirely local, non-generative skin/lip adjustment of the FINAL composite.
// If face detection or segmentation is unavailable, leave the original pixels intact.
const DEFAULT_BEAUTY={brightness:0,smooth:0,pink:0,lip:0,lipColor:'#c46d76'};
const localBeautyMaskCache=new WeakMap();
async function applyLocalBeauty(blob,settings){
 const {brightness,smooth,pink,lip,lipColor}=settings;
 if(!brightness&&!smooth&&!pink&&!lip)return blob;
 const url=URL.createObjectURL(blob);
 try{
  let prepared=localBeautyMaskCache.get(blob);
  if(!prepared){
   const preparation=(async()=>{
    const im=await loadImage(url),W=im.naturalWidth,H=im.naturalHeight;
    const factor=Math.min(1,480/Math.max(W,H));
    const sw=Math.max(1,Math.round(W*factor)),sh=Math.max(1,Math.round(H*factor));
    const small=canvasFor(sw,sh),sc=small.getContext('2d');sc.drawImage(im,0,0,sw,sh);
    const face=(await getLandmarker()).detect(small).faceLandmarks?.[0];
    if(!face)return null;
    const skin=await semanticClassMask(small,sw,sh,[2,3]);if(!skin)return null;
    const maskCanvas=canvasFor(W,H),mc=maskCanvas.getContext('2d',{willReadFrequently:true});
    mc.imageSmoothingEnabled=true;mc.drawImage(skin,0,0,W,H);
    const blurred=canvasFor(W,H),bc=blurred.getContext('2d',{willReadFrequently:true});
    bc.filter='blur(2.2px)';bc.drawImage(im,0,0);bc.filter='none';
    const lipMask=canvasFor(W,H),lc=lipMask.getContext('2d');
    const outer=[61,40,37,0,267,270,291,321,314,17,84,91];
    const inner=[78,81,13,311,308,402,14,178];
    const path=ids=>{lc.beginPath();ids.forEach((n,i)=>{const q=face[n];if(!q)return;i?lc.lineTo(q.x*W,q.y*H):lc.moveTo(q.x*W,q.y*H)});lc.closePath()};
    path(outer);lc.fillStyle='#fff';lc.fill();lc.globalCompositeOperation='destination-out';path(inner);lc.fill();
    return {im,W,H,mask:mc.getImageData(0,0,W,H).data,soft:bc.getImageData(0,0,W,H).data,lips:lc.getImageData(0,0,W,H).data};
   })();
   localBeautyMaskCache.set(blob,preparation);
   prepared=preparation;
  }
  prepared=await prepared;
  if(!prepared)return blob;
  const {im,W,H,mask,soft}=prepared;
  const canvas=canvasFor(W,H),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);
  const src=ctx.getImageData(0,0,W,H),pixels=src.data;
  const lips=lip?prepared.lips:null;
  const rgb=lipColor.match(/[a-f\d]{2}/gi)?.map(h=>parseInt(h,16))||[196,109,118];
  // Yield between scanline batches so touch, tabs and paint stay responsive.
  for(let i=0;i<pixels.length;i+=4){
   if(i && i%(W*4*24)===0)await new Promise(resolve=>setTimeout(resolve,0));
   const a=pixels[i+3]/255;if(!a)continue;
   const skinA=mask[i+3]/255;
   const lipA=lips?lips[i+3]/255:0;
   // Segmentation sometimes includes lips: exclude them from skin effects.
   const weight=skinA*(1-lipA);
   if(weight){
    for(let ch=0;ch<3;ch++){
     const base=pixels[i+ch];
     let value=base+(soft[i+ch]-base)*(smooth/100)*.28;
     value+=brightness/100*42;
     if(ch===0)value+=pink/100*5;
     if(ch===1)value-=pink/100*1;
     if(ch===2)value+=pink/100*3;
     pixels[i+ch]=Math.max(0,Math.min(255,base+(value-base)*weight));
    }
   }
   if(lipA){const strength=lip/100*.48*lipA;for(let ch=0;ch<3;ch++)pixels[i+ch]=pixels[i+ch]*(1-strength)+rgb[ch]*strength}
  }
  ctx.putImageData(src,0,0);
  return await new Promise(resolve=>canvas.toBlob(b=>resolve(b||blob),'image/png'));
 }catch(e){console.warn('Local beauty unavailable; preserving original image',e);return blob}
 finally{URL.revokeObjectURL(url)}
}
function App(){
 const [featureSession,setFeatureSession]=useState(false),[freeFeatureSession,setFreeFeatureSession]=useState(false);
 const [purchaseEditing,setPurchaseEditing]=useState(false),[sessionEditJob,setSessionEditJob]=useState('');
 const [outputJobId,setOutputJobId]=useState(''),[restoredSourcePhoto,setRestoredSourcePhoto]=useState(null);const currentOutputJobRef=useRef(''),currentOutputTrialRef=useRef(false),paymentStudioRef=useRef(null);
 useEffect(()=>{const onJob=e=>{if(e.detail.isTrial)setFreeFeatureSession(true);if(e.detail.fullEdit){setPurchaseEditing(true);setSessionEditJob(e.detail.jobId)}currentOutputJobRef.current=e.detail.jobId;currentOutputTrialRef.current=e.detail.isTrial;studioTrialRef.current=e.detail.isTrial;setTrialPreview(e.detail.isTrial);setOutputJobId(e.detail.jobId)};window.addEventListener('idprom-output-job',onJob);return()=>window.removeEventListener('idprom-output-job',onJob)},[]);

 const[rights,setRights]=useState({generationRemaining:0,hairRemaining:0,unlockedJobIds:[],editableJobIds:[]}),[buyOpen,setBuyOpen]=useState(false),[payBusy,setPayBusy]=useState(false),[payMsg,setPayMsg]=useState('');
 const[authOpen,setAuthOpen]=useState(false),[authMode,setAuthMode]=useState('register'),[authEmail,setAuthEmail]=useState(''),[authPassword,setAuthPassword]=useState(''),[showPassword,setShowPassword]=useState(false),[authBusy,setAuthBusy]=useState(false),[authMsg,setAuthMsg]=useState(''),[pendingPackage,setPendingPackage]=useState(null);
 const[accountMenuOpen,setAccountMenuOpen]=useState(false),[accountEmail,setAccountEmail]=useState(()=>{try{return localStorage.getItem('idprom_account_email')||''}catch{return ''}});
 const submitAuth=async()=>{setAuthBusy(true);setAuthMsg('');try{await refreshWallet();const sourceWalletId=currentWalletId();const r=await fetch(`/api/auth/${authMode}`,{method:'POST',headers:{...walletHeaders(),'Content-Type':'application/json'},body:JSON.stringify({email:authEmail,password:authPassword})});const data=await r.json();if(!r.ok)throw Error(data.message||'ดำเนินการไม่สำเร็จ');localStorage.setItem(AUTH_TOKEN_KEY,data.token);localStorage.setItem('idprom_account_email',authEmail);setAccountEmail(authEmail);if(data.walletId){localStorage.setItem(WALLET_KEY,data.walletId);if(currentOutputTrialRef.current&&currentOutputJobRef.current&&sourceWalletId!==data.walletId){const claim=await fetch('/api/images/'+encodeURIComponent(currentOutputJobRef.current)+'/claim',{method:'POST',headers:{...walletHeaders(),'Content-Type':'application/json'},body:JSON.stringify({sourceWalletId})});if(!claim.ok)throw Error('ย้ายรูปทดลองเข้าบัญชีไม่สำเร็จ กรุณาลองเข้าสู่ระบบบัญชีเดิม');}await refreshWallet()}setAuthOpen(false);const pkg=pendingPackage;setPendingPackage(null);if(pkg?.startsWith('promo:'))await redeemFreeLink(pkg.slice(6));else if(pkg)await startCheckout(pkg,true)}catch(e){setAuthMsg(e.message)}finally{setAuthBusy(false)}};
 useEffect(()=>{const code=new URLSearchParams(location.search).get('free199');if(!code)return;let cancelled=false;(async()=>{try{await refreshWallet();const r=await fetch('/api/promo/free199',{method:'POST',headers:{...walletHeaders(),'Content-Type':'application/json'},body:JSON.stringify({code})});const data=await r.json();if(!r.ok)throw Error(data.message||'ใช้โค้ดไม่ได้');if(!cancelled){setRights(previous=>({...previous,...normalizedRights(data)}));setPayMsg('รับสิทธิ์แพ็กเกจ 199 บาทฟรีเรียบร้อยแล้ว');setBuyOpen(true)}history.replaceState({},'',location.pathname)}catch(e){if(!cancelled){setPayMsg(e.message);setBuyOpen(true)}}})();return()=>{cancelled=true}},[]);
 const[trialPreview,setTrialPreview]=useState(false);
 const[privateTrialActive,setPrivateTrialActive]=useState(false);
 const privateTrialResultRef=useRef(false);
 const[privateTrialChecking,setPrivateTrialChecking]=useState(()=>privateTrialRequested()||new URLSearchParams(location.hash.slice(1)).has('privateTrial'));
 const activatePrivateTrial=async()=>{
  const token=new URLSearchParams(location.hash.slice(1)).get('privateTrial');
  if(!token&&!privateTrialRequested())return;
  setPrivateTrialChecking(true);
  if(token)history.replaceState({},'',location.pathname+location.search);
  try{
   const r=await fetch('/api/private-trial',token?{method:'POST',headers:{...walletHeaders(),'Content-Type':'application/json'},body:JSON.stringify({key:token})}:{headers:walletHeaders(),cache:'no-store'});
   const data=await r.json();
   if(!r.ok||!data.active)throw Error(data.message||'โหมดทดสอบยังไม่เปิดใช้งาน กรุณาเปิดลิงก์ส่วนตัวอีกครั้ง');
   localStorage.setItem(PRIVATE_TRIAL_KEY,'1');setPrivateTrialActive(true);
  }catch(e){localStorage.removeItem(PRIVATE_TRIAL_KEY);setPrivateTrialActive(false);window.alert('เปิดโหมดใช้เองไม่สำเร็จ\n'+(e.message||'กรุณาลองเปิดลิงก์ส่วนตัวอีกครั้ง'))}
  finally{setPrivateTrialChecking(false)}
 };
 useEffect(()=>{const onPrivateTrialLink=()=>{if(new URLSearchParams(location.hash.slice(1)).has('privateTrial'))refreshWallet().then(activatePrivateTrial)};window.addEventListener('hashchange',onPrivateTrialLink);return()=>window.removeEventListener('hashchange',onPrivateTrialLink)},[]);
 const leavePrivateTrial=()=>{localStorage.removeItem(PRIVATE_TRIAL_KEY);setPrivateTrialActive(false)};
 useEffect(()=>{if(rights.generationRemaining>0)setFeatureSession(true)},[rights.generationRemaining]);
 const allOptionsAvailable=privateTrialActive||rights.generationRemaining>0||featureSession||freeFeatureSession||rights.hasPurchased!==true||rights.trialAvailable===true;
 const refreshWallet=async()=>{try{const token=authToken();if(token){const me=await fetch('/api/auth/me',{headers:authHeaders(),cache:'no-store'});if(me.ok){const account=await me.json();if(account.walletId&&account.walletId!==currentWalletId())localStorage.setItem(WALLET_KEY,account.walletId)}else if(me.status===401){localStorage.removeItem(AUTH_TOKEN_KEY)}}let id=currentWalletId();let r;if(!id){r=await fetch('/api/wallet',{method:'POST',headers:walletHeaders()});const data=await r.json();id=data.walletId;localStorage.setItem(WALLET_KEY,id);setRights(previous=>({...previous,...normalizedRights(data)}));return}r=await fetch('/api/wallet',{headers:walletHeaders(),cache:'no-store'});if(r.status===404){localStorage.removeItem(WALLET_KEY);return refreshWallet()}if(r.ok){const data=await r.json();setRights(previous=>({...previous,...normalizedRights(data)}))}}catch{}};
 const redeemFreeLink=async code=>{try{await refreshWallet();const r=await fetch('/api/promo/redeem',{method:'POST',headers:{...walletHeaders(),'Content-Type':'application/json'},body:JSON.stringify({code,jobId:currentOutputTrialRef.current?currentOutputJobRef.current:''})});const data=await r.json();if(!r.ok)throw Error(data.message||'รับสิทธิ์ไม่สำเร็จ');setRights(previous=>({...previous,...normalizedRights(data)}));setPurchaseEditing(true);setPayMsg('รับสิทธิ์แพ็ก '+data.packagePrice+' บาทฟรีแล้ว · เครดิตคงเหลือ '+data.processRemaining+' ครั้ง');setBuyOpen(true);history.replaceState({},'',location.pathname)}catch(e){setPayMsg(e.message);setBuyOpen(true)}};
 useEffect(()=>{const code=new URLSearchParams(location.search).get('free');if(!code)return;let cancelled=false;refreshWallet().then(()=>{if(cancelled)return;if(authToken())redeemFreeLink(code);else{setPendingPackage('promo:'+code);setAuthMode('register');setAuthMsg('');setAuthOpen(true)}}).catch(e=>{if(!cancelled){setPayMsg(e.message);setBuyOpen(true)}});return()=>{cancelled=true}},[]);
 const [savedWorksOpen,setSavedWorksOpen]=useState(false),[savedWorkUnlocked,setSavedWorkUnlocked]=useState(false),[savedWorkRevision,setSavedWorkRevision]=useState(0);const savedWorkIdRef=useRef('');
 const saveAccountWork=async(project,options={})=>{const targetId=options.workId??savedWorkIdRef.current;const r=await fetch('/api/saved-work',{method:'POST',headers:{...walletHeaders(),'Content-Type':'application/json'},body:JSON.stringify({id:options.createCopy?'':targetId,project})});const d=await r.json();if(!r.ok){if(d.error==='saved_work_limit')setSavedWorksOpen(true);throw Error(d.message||'บันทึกงานไม่สำเร็จ')}if(!options.createCopy&&savedWorkIdRef.current===targetId)savedWorkIdRef.current=d.id;return d};
 saveAccountWork.currentWorkId=()=>savedWorkIdRef.current;
 const openAccountWork=async work=>{await refreshWallet();const project=work.project;const source=project.compareSource?await(await fetch(project.compareSource)).blob():null;setRestoredSourcePhoto(source);studioOriginRef.current={starter:true,placement:project.placement};savedWorkIdRef.current=work.id;setSavedWorkUnlocked(work.unlocked===true);setPurchaseEditing(false);setSessionEditJob('');setStudioData(project.layers);setSavedWorkRevision(v=>v+1);setScreen('studio')};
 const SavedWorkUI=()=>savedWorksOpen&&<SavedWorks headers={walletHeaders} onDelete={id=>{if(savedWorkIdRef.current===id)savedWorkIdRef.current=''}} onOpen={openAccountWork} onClose={()=>setSavedWorksOpen(false)}/>;
 const startCheckout=async(packageId,authenticated=false)=>{analyticsEvent('idprom_checkout_click',{package_id:packageId});if(!authenticated&&!authToken()){setPendingPackage(packageId);setAuthMode('register');setAuthMsg('');setAuthOpen(true);return}setPayBusy(true);setPayMsg('');try{await refreshWallet();const r=await fetch('/api/payments/checkout',{method:'POST',headers:{...walletHeaders(),...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({packageId,jobId:currentOutputTrialRef.current?currentOutputJobRef.current:''})});const data=await r.json();if(r.status===401){localStorage.removeItem(AUTH_TOKEN_KEY);setPendingPackage(packageId);setAuthOpen(true);throw Error(data.message||'กรุณาเข้าสู่ระบบก่อนชำระเงิน')}if(!r.ok)throw Error(data.error||'สร้างรายการชำระเงินไม่สำเร็จ');await savePurchaseDraft({walletId:currentWalletId(),jobId:currentOutputJobRef.current,isTrial:currentOutputTrialRef.current,studio:paymentStudioRef.current?.()||null,originalFile:firstUploadedPhotoRef.current,template:activeUniformTemplate,hairId,classicMaster:editCache.current?.master||null,classicLock:editCache.current?.lock||null});analyticsCheckout(packageId,data.url);location.href=data.url}catch(e){analyticsEvent('idprom_checkout_error',{error_stage:'checkout'});setPayMsg(e.message)}finally{setPayBusy(false)}};
 useEffect(()=>{refreshWallet().then(activatePrivateTrial);const onRights=e=>setRights(previous=>({...previous,...normalizedRights(e.detail||{})})),onBuy=()=>setBuyOpen(true);window.addEventListener('idprom-rights',onRights);window.addEventListener('idprom-buy',onBuy);const q=new URLSearchParams(location.search);if(q.get('payment')==='success'){setPurchaseEditing(true);const sessionId=q.get('session_id');setPayMsg('ชำระเงินสำเร็จ กำลังเพิ่มสิทธิ์…');(async()=>{try{await restorePurchaseDraft();await refreshWallet();if(sessionId){const r=await fetch('/api/payments/confirm',{method:'POST',headers:{...walletHeaders(),'Content-Type':'application/json'},body:JSON.stringify({sessionId})});const data=await r.json();if(!r.ok)throw Error(data.message||'ตรวจสอบการชำระเงินไม่สำเร็จ');setRights(previous=>({...previous,...normalizedRights(data)}));setPayMsg('ชำระเงินสำเร็จ เพิ่มสิทธิ์เรียบร้อยแล้ว');if(data.ok===true)analyticsPurchase(sessionId)}else{await refreshWallet();setPayMsg('ชำระเงินสำเร็จ')}}catch(e){setPayMsg(e.message||'กำลังรอการยืนยันการชำระเงิน');let tries=0;const t=setInterval(async()=>{await refreshWallet();if(++tries>=10)clearInterval(t)},1000)}})();history.replaceState({},'',location.pathname)}else if(q.get('payment')==='cancelled'){restorePurchaseDraft();analyticsEvent('idprom_checkout_cancel');setPayMsg('ยกเลิกการชำระเงินแล้ว');history.replaceState({},'',location.pathname)}return()=>{window.removeEventListener('idprom-rights',onRights);window.removeEventListener('idprom-buy',onBuy)}},[]);
 useEffect(()=>{if(outputJobId&&rights.unlockedJobIds.includes(outputJobId)){currentOutputTrialRef.current=false;studioTrialRef.current=false;setTrialPreview(false)}},[outputJobId,rights.unlockedJobIds]);

 const AuthUI=()=> authOpen&&<div className="credit-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget){setAuthOpen(false);setPendingPackage(null)}}}><section role="dialog" aria-modal="true" aria-label="สมัครสมาชิก IDพร้อม" style={{width:'min(420px,calc(100vw - 28px))',background:'#fff',borderRadius:24,padding:26,boxShadow:'0 24px 70px rgba(15,35,65,.24)',position:'relative'}}><button type="button" className="credit-modal-close" onClick={()=>{setAuthOpen(false);setPendingPackage(null)}}>×</button><div style={{fontWeight:900,fontSize:20,color:'#1769c8',marginBottom:6}}>IDพร้อม</div><h2 style={{margin:'0 0 6px',fontSize:26,color:'#12233f'}}>{authMode==='register'?'สมัครสมาชิก':'เข้าสู่ระบบ'}</h2><p style={{margin:'0 0 20px',fontSize:14,color:'#718097'}}>{pendingPackage?.startsWith('promo:')?'สมัครสมาชิกหรือเข้าสู่ระบบเพื่อรับสิทธิ์ฟรีและเก็บเครดิตในบัญชี':authMode==='register'?'สมัครสมาชิกก่อนชำระเงิน เพื่อเก็บสิทธิ์การใช้งานของคุณ':'เข้าสู่ระบบเพื่อชำระเงินต่อ'}</p><label style={{display:'block',fontWeight:700,fontSize:13,marginBottom:6}}>อีเมล</label><input type="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} autoComplete="email" placeholder="example@email.com" style={{width:'100%',boxSizing:'border-box',padding:'12px 14px',border:'1px solid #d8e1ed',borderRadius:12,fontSize:16,marginBottom:14}}/><label style={{display:'block',fontWeight:700,fontSize:13,marginBottom:6}}>รหัสผ่าน</label><div style={{position:'relative'}}><input type={showPassword?'text':'password'} value={authPassword} onChange={e=>setAuthPassword(e.target.value)} autoComplete={authMode==='register'?'new-password':'current-password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="อย่างน้อย 8 ตัวอักษร" onKeyDown={e=>{if(e.key==='Enter'&&!authBusy)submitAuth()}} style={{width:'100%',boxSizing:'border-box',padding:'12px 46px 12px 14px',border:'1px solid #d8e1ed',borderRadius:12,fontSize:16}}/><button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'ซ่อนรหัสผ่าน':'แสดงรหัสผ่าน'} title={showPassword?'ซ่อนรหัสผ่าน':'แสดงรหัสผ่าน'} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',width:36,height:36,border:0,background:'transparent',padding:0,cursor:'pointer',display:'grid',placeItems:'center',color:'#53657d'}}>{showPassword?<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 4.2A10.5 10.5 0 0112 4c5.5 0 9.5 5.2 9.5 5.2a15.6 15.6 0 01-3.1 3.6"/><path d="M6.6 6.6C4 8.3 2.5 10.2 2.5 10.2S6.5 16 12 16c1 0 2-.2 2.9-.5"/></svg>:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 12S6.5 6 12 6s9.5 6 9.5 6-4 6-9.5 6S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.5"/></svg>}</button></div>{authMsg&&<p style={{color:'#c62828',fontSize:13,margin:'10px 0 0'}}>{authMsg}</p>}<button type="button" disabled={authBusy||!authEmail||authPassword.length<8} onClick={submitAuth} style={{width:'100%',border:0,borderRadius:13,padding:'13px 16px',background:'#176fd2',color:'#fff',fontWeight:800,fontSize:15,marginTop:18,cursor:'pointer',opacity:(authBusy||!authEmail||authPassword.length<8)?.6:1}}>{authBusy?'กำลังดำเนินการ…':pendingPackage?.startsWith('promo:')?(authMode==='register'?'สมัครสมาชิกและรับสิทธิ์ฟรี':'เข้าสู่ระบบและรับสิทธิ์ฟรี'):authMode==='register'?'สมัครสมาชิกและชำระเงินต่อ':'เข้าสู่ระบบและชำระเงินต่อ'}</button><button type="button" onClick={()=>{setAuthMode(authMode==='register'?'login':'register');setAuthMsg('')}} style={{width:'100%',border:0,background:'transparent',padding:'13px 0 0',color:'#1769c8',fontWeight:700,cursor:'pointer'}}>{authMode==='register'?'มีบัญชีแล้ว? เข้าสู่ระบบ':'ยังไม่มีบัญชี? สมัครสมาชิก'}</button></section></div>;
 const AccountUI=()=>{const loggedIn=!!authToken();const logout=()=>{setFeatureSession(false);setFreeFeatureSession(false);localStorage.removeItem(AUTH_TOKEN_KEY);localStorage.removeItem('idprom_account_email');localStorage.removeItem(WALLET_KEY);setRights({generationRemaining:0,hairRemaining:0,unlockedJobIds:[],editableJobIds:[]});setAccountEmail('');setAccountMenuOpen(false);refreshWallet()};const openAuth=()=>{setAccountMenuOpen(false);setAuthMode('login');setAuthMsg('');setAuthOpen(true)};return <div style={{position:'relative'}}><button type="button" onClick={()=>loggedIn?setAccountMenuOpen(v=>!v):openAuth()} aria-label={loggedIn?'บัญชีสมาชิก':'เข้าสู่ระบบหรือสมัครสมาชิก'} aria-expanded={loggedIn?accountMenuOpen:false} title={loggedIn?'บัญชีสมาชิก':'เข้าสู่ระบบ / สมัครสมาชิก'} style={{width:42,height:42,border:'1px solid #dbe5f1',background:loggedIn?'#176fd2':'#fff',borderRadius:'50%',padding:0,color:loggedIn?'#fff':'#176fd2',cursor:'pointer',display:'grid',placeItems:'center',flex:'0 0 auto'}}>{loggedIn?<span style={{fontSize:17,fontWeight:900,lineHeight:1}}>{(accountEmail||'ส').trim().charAt(0).toUpperCase()}</span>:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/><path d="M19 8v6M16 11h6"/></svg>}</button>{loggedIn&&accountMenuOpen&&<div style={{position:'absolute',right:0,top:'calc(100% + 9px)',zIndex:1000,width:'min(320px,calc(100vw - 24px))',background:'#232323',color:'#fff',borderRadius:10,padding:'18px 16px 12px',boxShadow:'0 10px 30px rgba(0,0,0,.28)'}}><div style={{display:'flex',gap:12,alignItems:'center',paddingBottom:16,borderBottom:'1px solid rgba(255,255,255,.18)'}}><div style={{width:52,height:52,borderRadius:'50%',background:'#176fd2',display:'grid',placeItems:'center',fontSize:22,fontWeight:900,flex:'0 0 auto'}}>{(accountEmail||'ส').trim().charAt(0).toUpperCase()}</div><div style={{minWidth:0}}><div style={{fontWeight:900,fontSize:16,marginBottom:4}}>สมาชิก IDพร้อม</div><div style={{fontSize:13,color:'#ddd',wordBreak:'break-all'}}>{accountEmail||'เข้าสู่ระบบแล้ว'}</div></div></div><div style={{padding:'14px 0',fontSize:14,borderBottom:'1px solid rgba(255,255,255,.18)'}}><div style={{fontSize:11,color:'#aaa',marginBottom:8}}>สิทธิ์คงเหลือ</div><button type="button" onClick={()=>{setAccountMenuOpen(false);setBuyOpen(true)}} style={{border:'1px solid rgba(255,255,255,.22)',background:'rgba(255,255,255,.08)',color:'#fff',borderRadius:9,padding:'9px 11px',fontWeight:700,cursor:'pointer'}}>ประมวลผล {rights.generationRemaining} ครั้ง</button></div><button type="button" onClick={()=>{setAccountMenuOpen(false);setSavedWorksOpen(true)}} style={{width:'100%',padding:12}}>งานที่บันทึกไว้</button><button type="button" onClick={logout} style={{width:'100%',border:0,background:'transparent',color:'#fff',textAlign:'left',padding:'15px 0 4px',fontSize:14,cursor:'pointer'}}>ลงชื่อออก</button></div>}</div>};
 const CreditUI=({showBalance=true}={})=> <>{privateTrialActive&&<button type="button" onClick={leavePrivateTrial} disabled={busy||hairBusy} title="กลับไปใช้เครดิตตามปกติ">ทดสอบส่วนตัว · ออกจากโหมด</button>}{showBalance&&<button type="button" className="credit-wallet-pill" onClick={()=>setBuyOpen(true)} aria-label={`ประมวลผลคงเหลือ ${rights.generationRemaining} ครั้ง`} style={{display:'inline-flex',alignItems:'center',gap:0,padding:'7px 12px',borderRadius:14,background:'#fff',border:'1px solid #e1e8f2',boxShadow:'0 2px 8px rgba(24,74,130,.06)',color:'#24364f',fontWeight:700}}><span style={{whiteSpace:'nowrap',fontSize:13}}>ประมวลผล <strong style={{color:'#1269c7',fontSize:15}}>{rights.generationRemaining}</strong> ครั้ง</span></button>}{buyOpen&&<div className="credit-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setBuyOpen(false)}}><section className="credit-modal package-pro-modal" role="dialog" aria-modal="true" aria-label="แพ็กเกจ IDพร้อม"><style>{`
.package-pro-modal{width:min(760px,calc(100vw - 28px));max-height:calc(100dvh - 28px);overflow:auto;padding:28px;border-radius:28px;background:#fff;box-shadow:0 24px 70px rgba(15,35,65,.24);box-sizing:border-box}.package-pro-modal .credit-modal-close{top:18px;right:20px}.package-pro-head{padding:0 4px 20px}.package-pro-brand{font-size:18px;font-weight:800;color:#1769c8;margin-bottom:5px}.package-pro-title{font-size:30px!important;line-height:1.15!important;margin:0 0 7px!important;color:#12233f}.package-pro-sub{margin:0;color:#728097;font-size:15px}.package-pro-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.package-card{position:relative;display:flex;flex-direction:column;min-width:0;padding:24px;border:1px solid #d9e7fb;border-radius:22px;background:linear-gradient(180deg,#f8fbff 0%,#fff 100%)}.package-card.popular{border-color:#f3dfe5;background:linear-gradient(180deg,#fffaf7 0%,#fff 100%)}.package-badge{position:absolute;right:16px;top:16px;padding:6px 10px;border-radius:999px;background:#e91e63;color:#fff;font-size:12px;font-weight:800}.package-name{font-size:18px;font-weight:800;color:#172a47;margin:0}.package-price{font-size:38px;line-height:1.1;font-weight:900;color:#146bd1;margin:8px 0 20px}.package-card.popular .package-price{color:#d91d62}.package-price small{font-size:18px;font-weight:800}.package-features{list-style:none!important;padding:0!important;margin:0 0 22px!important;display:grid;gap:14px;flex:1}.package-features li{display:flex;gap:11px;align-items:flex-start;color:#243650;font-size:14px;line-height:1.35}.package-feature-icon{width:8px;height:8px;border-radius:50%;background:#17365f;display:block;flex:0 0 8px;margin:7px 13px 0 5px;font-size:0;line-height:0;color:transparent;overflow:hidden}.package-card.popular .package-feature-icon{background:#b31954}.package-feature-text strong{display:block;font-size:14px;color:#172a47;margin-bottom:1px}.package-feature-text span{color:#718097}.package-select-btn{width:100%;border:0;border-radius:14px;padding:14px 16px;background:#176fd2;color:#fff;font-size:15px;font-weight:800;cursor:pointer}.package-card.popular .package-select-btn{background:#dd2164}.package-select-btn:disabled{opacity:.6;cursor:default}.package-secure{margin-top:18px;padding:13px 16px;border-radius:16px;background:#f7f9fc;text-align:center;color:#66758c;font-size:12px}.package-pro-modal .credit-pay-msg{text-align:center;margin:14px 0 0}.package-pro-modal>small{display:none}@media(max-width:640px){.package-pro-modal{padding:22px 16px;border-radius:24px}.package-pro-title{font-size:25px!important}.package-pro-sub{font-size:13px}.package-pro-grid{grid-template-columns:1fr;gap:14px}.package-card{padding:20px}.package-price{font-size:34px;margin-bottom:16px}.package-badge{top:14px;right:14px}}
`}</style><button className="credit-modal-close" onClick={()=>setBuyOpen(false)}>×</button><PackageOffers payBusy={payBusy} payMsg={payMsg} hasTrial={Boolean(currentOutputTrialRef.current&&outputJobId)} startCheckout={startCheckout}/></section></div>}</>;
 const ContactUI=()=> <><button type="button" className="line-contact-button" onClick={()=>setLineContactOpen(true)} aria-label="ติดต่อแอดมินทาง LINE"><span className="line-contact-bubble">LINE</span><span className="line-contact-label">ติดต่อ</span></button>{lineContactOpen&&<div className="line-contact-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setLineContactOpen(false)}}><section className="line-contact-modal" role="dialog" aria-modal="true" aria-label="ติดต่อแอดมินทาง LINE"><button type="button" className="line-contact-close" onClick={()=>setLineContactOpen(false)} aria-label="ปิด">×</button><h2>ติดต่อแอดมิน</h2><p>สแกน QR Code เพื่อเพิ่มเพื่อนทาง LINE</p><img src="/assets/line-contact-qr.png" alt="QR Code ติดต่อ IDพร้อม ทาง LINE"/></section></div>}</>;
 const[f,setF]=useState(),[a,setA]=useState(),[b,setB]=useState(),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[hairId,setHairId]=useState(null);
 const[studioData,setStudioData]=useState(null),[studioBusy,setStudioBusy]=useState(false);
 const studioDraftRef=useRef(null),studioOriginRef=useRef(null),studioHairOriginRef=useRef(null),studioTrialRef=useRef(false);
 const[photoGuideOpen,setPhotoGuideOpen]=useState(false);
 const[safetyBlocked,setSafetyBlocked]=useState(false);
 const[selectedJobTemplate,setSelectedJobTemplate]=useState(JOB_UNIFORMS[0].template||JOB_UNIFORMS[0].img);
 const[selectedStudentTemplate,setSelectedStudentTemplate]=useState(STUDENT_UNIFORMS[0].template);
 const[selectedGownTemplate,setSelectedGownTemplate]=useState(GOWN_UNIFORMS[0].template);
 const[selectedInteriorTemplate,setSelectedInteriorTemplate]=useState(INTERIOR_UNIFORMS[0].img);
 const[homeInfoOpen,setHomeInfoOpen]=useState(false),[homeShowGender,setHomeShowGender]=useState('all');
 const[lineContactOpen,setLineContactOpen]=useState(false);
 const[uniformCategory,setUniformCategory]=useState('government'),[homeFilter,setHomeFilter]=useState('all'),[screen,setScreen]=useState('home'),[selectedStyle,setSelectedStyle]=useState(''),[gender,setGender]=useState('female'),[level,setLevel]=useState('operational');
 const homeResultsRef=useRef(null);
 const selectedFemaleGovernmentTemplate=FEMALE_GOVERNMENT_UNIFORMS.find(t=>t.level===level)?.img||GOVERNMENT_FINANCE_TEMPLATE;
 const selectedGovernmentTemplate=gender==='male'?selectedInteriorTemplate:selectedFemaleGovernmentTemplate;
 const selectGovernmentGender=(next)=>{setGender(next);if(next==='male'){setSelectedInteriorTemplate((INTERIOR_UNIFORMS.find(t=>t.level===level)||INTERIOR_UNIFORMS[0]).img)}};
 const activeUniformTemplate=uniformCategory==='job'?selectedJobTemplate:uniformCategory==='student'?selectedStudentTemplate:uniformCategory==='government'?selectedGovernmentTemplate:uniformCategory==='gown'?selectedGownTemplate:GOVERNMENT_FINANCE_TEMPLATE;
 // Analytics observes committed selections; it never changes editor state.
 useEffect(()=>{analyticsContext({category:screen==='process'?uniformCategory:'unselected',template:screen==='process'?activeUniformTemplate:'',gender:screen==='process'?gender:'',level});if(screen==='process')analyticsEvent('idprom_uniform_select')},[screen,uniformCategory,activeUniformTemplate,gender,level]);
 useEffect(()=>{if(buyOpen)analyticsEvent('idprom_package_view')},[buyOpen]);
 const[headAdjust,setHeadAdjust]=useState({scale:1,x:0,y:0,rotation:0});
 const[collarWarp,setCollarWarp]=useState(0);
 const[collarHeight,setCollarHeight]=useState(0);
 const[neckAdjust,setNeckAdjust]=useState({width:0,length:0});
 const[placementLocked,setPlacementLocked]=useState(false);
 const[hairBusy,setHairBusy]=useState(false);
 const[uniformChanging,setUniformChanging]=useState(false);
 const[uniformPickerTab,setUniformPickerTab]=useState('job');
 const[processProgress,setProcessProgress]=useState({active:false,value:0,label:''});
 const progressTimerRef=useRef(null);
 const progressStartedAtRef=useRef(0);
 const progressLabelFor=value=>value>=100?'ประมวลผลสำเร็จ':value>=86?'กำลังเก็บรายละเอียด':value>=31?'กำลังประมวลผลภาพ':'กำลังเตรียมภาพ';
 const beginProgress=()=>{
  clearInterval(progressTimerRef.current);
  progressStartedAtRef.current=Date.now();
  setProcessProgress({active:true,value:1,label:progressLabelFor(1)});
  progressTimerRef.current=setInterval(()=>setProcessProgress(current=>{
   if(!current.active||current.value>=100)return current;
   const elapsed=Math.max(0,Date.now()-progressStartedAtRef.current);
   // Display-only progress: move steadily and smoothly, then wait at 99%
   // until the real server job has actually completed.
   const target=Math.min(99,1+Math.floor(elapsed/700));
   const nextValue=Math.min(99,Math.max(Math.round(current.value),target));
   return {...current,value:nextValue,label:progressLabelFor(nextValue)};
  }),350);
 };
 // Real pipeline stages must never make the visible percentage jump or change copy rapidly.
 // The timer owns the display progress; 100% is reserved for actual completion only.
 const setProgressStage=()=>{};
 const finishProgress=async success=>{
  clearInterval(progressTimerRef.current);
  progressTimerRef.current=null;
  if(!success){setProcessProgress({active:false,value:0,label:''});return;}
  setProcessProgress({active:true,value:100,label:'ประมวลผลสำเร็จ'});
  await new Promise(resolve=>setTimeout(resolve,420));
  setProcessProgress({active:false,value:0,label:''});
 };
 useEffect(()=>()=>{clearInterval(progressTimerRef.current);clearTimeout(gestureRef.current?.holdTimer)},[]);
 const lockedPlacementRef=useRef(null);
 const lockedMasterRef=useRef(null);
 const initialProcessedMasterRef=useRef(null);
 // Immutable upload reference: hairstyle changes must never use an AI result as input.
 const firstUploadedPhotoRef=useRef(null);
 const hairResultCacheRef=useRef(new Map()),hairRequestRef=useRef(false);
 const preparedHairBaseRef=useRef(null),lastHairDonorRef=useRef(null),cleanHairBaseRef=useRef(null),initialStyledHairRef=useRef(null);
 const[optionTool,setOptionTool]=useState(null);
 const [desktopSelectorActive,setDesktopSelectorActive]=useState('uniform');  const[beautyPanelTab,setBeautyPanelTab]=useState('skin');  const[beauty,setBeauty]=useState(DEFAULT_BEAUTY);const beautyRef=useRef(DEFAULT_BEAUTY);
 const beautyRenderRef=useRef(0);
 const beautyBaseRef=useRef(null);
 const beautyPreviewBaseRef=useRef(null);
 const beautyWorkingRef=useRef(false);
 const[downloadBusy,setDownloadBusy]=useState(false);
 const[photoCrop,setPhotoCrop]=useState({...DEFAULT_PHOTO_CROP});
 const[photoSizeBlob,setPhotoSizeBlob]=useState(null),[photoSizeBusy,setPhotoSizeBusy]=useState(false);
 const[backgroundId,setBackgroundId]=useState('default');const backgroundRef=useRef('/assets/background.jpg');
 const[ribbonId,setRibbonId]=useState('');const ribbonRef=useRef(null);
 const[ribbonAdjust,setRibbonAdjust]=useState({x:0,y:0,scale:1});const ribbonAdjustRef=useRef({x:0,y:0,scale:1});
 const[collarPinId,setCollarPinId]=useState('');const collarPinRef=useRef(null);
 const[collarPinAdjust,setCollarPinAdjust]=useState({left:{x:0,y:0},right:{x:0,y:0},scale:1});const collarPinAdjustRef=useRef({left:{x:0,y:0},right:{x:0,y:0},scale:1});
 const[pinAdjustTab,setPinAdjustTab]=useState('left');
 const[pinPanelTab,setPinPanelTab]=useState('select');  const[pinKindTab,setPinKindTab]=useState('collar');
 const[chestPinId,setChestPinId]=useState('');const chestPinRef=useRef(null);
 const[chestPinAdjust,setChestPinAdjust]=useState({x:0,y:0,scale:1});const chestPinAdjustRef=useRef({x:0,y:0,scale:1});
 const[chestPinPanelTab,setChestPinPanelTab]=useState('select');
 const[ribbonPanelTab,setRibbonPanelTab]=useState('select');
 const ribbonDragRef=useRef(null);
 const renderWithRibbon=async(...args)=>{
  const base=await renderAdjustedFinal(...args,ribbonRef.current,ribbonAdjustRef.current,collarPinRef.current,collarPinAdjustRef.current,false,null,liveCollarHeightRef.current,chestPinRef.current,chestPinAdjustRef.current);
  beautyBaseRef.current=base;beautyPreviewBaseRef.current=null;
  return applyLocalBeauty(base,beautyRef.current);
 };
 const renderQuickPreview=(...args)=>renderAdjustedFinal(...args,ribbonRef.current,ribbonAdjustRef.current,collarPinRef.current,collarPinAdjustRef.current,true,null,liveCollarHeightRef.current,chestPinRef.current,chestPinAdjustRef.current);
 const[resultTool,setResultTool]=useState('head');
 const[previewZoom,setPreviewZoom]=useState(1);
 const[previewPan,setPreviewPan]=useState({x:0,y:0});
 const[comparePreview,setComparePreview]=useState(false);
 const[headMasterPreview,setHeadMasterPreview]=useState(null);
 const[headPreviewLock,setHeadPreviewLock]=useState(null);
 const headLayerRef=useRef(null);
 const liveCanvasRef=useRef(null);
 const [liveCanvasVisible,setLiveCanvasVisible]=useState(false);
 const previewStageRef=useRef(null);
 const fileInputRef=useRef(null);
 useEffect(()=>{
  if(screen!=='process')return;
  const stage=previewStageRef.current,workspace=stage?.closest('.editor-workspace'),root=stage?.closest('.adaptive-editor');
  if(!workspace||!root)return;
  let frame=0;
  const measure=()=>{
   cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
    if(!window.matchMedia('(max-width:1099px)').matches){workspace.style.removeProperty('--workspace-height');return;}
    const viewport=window.visualViewport,height=viewport?.height||window.innerHeight;
    const dock=root.querySelector('.editor-tool-dock'),panel=dock?.querySelector(':scope > .tool-choice-sheet');
    const top=workspace.getBoundingClientRect().top;
    if(panel)panel.style.setProperty('max-height',Math.max(60,Math.min(height*.36,300,height-Math.max(0,top)-(dock?.getBoundingClientRect().height||0)-88))+'px','important');
    const bottom=dock?.getBoundingClientRect().top??height;
    workspace.style.setProperty('--workspace-height',Math.max(80,Math.min(height,bottom)-Math.max(0,top)-8)+'px');
   });
  };
  const observer=new ResizeObserver(measure);
  for(const el of root.querySelectorAll('.process-mobile-topbar,.editor-mobile-actions,.editor-mobile-help,.tool-rail-wrap,.tool-choice-sheet'))observer.observe(el);
  window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);measure();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure)};
 },[screen,optionTool,a,b]);

 const showSafetyBlock=message=>{
  setSafetyBlocked(true);
  console.warn('Image request was blocked; original preview retained.',message||'');
  setMsg('');
 };
 const suppressUiError=(error,context)=>{console.warn(context,error);setMsg('')};
 const liveAdjustRef=useRef(headAdjust);
 const liveCollarWarpRef=useRef(collarWarp);
 const liveCollarHeightRef=useRef(collarHeight);
 const liveNeckAdjustRef=useRef(neckAdjust);
 const initialHeadAdjustRef=useRef({scale:1,x:0,y:0,rotation:0});
 const rafRef=useRef(0);
 const toolBarRef=useRef(null);
 const choiceRailRef=useRef(null);
 const toggleOptionTool=(name,beforeOpen)=>{setOptionTool(current=>{const next=current===name?null:name;if(next&&beforeOpen)beforeOpen();return next})};
 const guideToHair=()=>{const next=gender==='male'?'male-hair':'female-hair';setOptionTool(next);const bar=toolBarRef.current;if(bar){const target=bar.querySelector(`[data-hair-guide="${next}"]`);target?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});}};
 const scrollToolBar=direction=>{const el=toolBarRef.current;if(!el)return;el.scrollBy({left:direction*Math.max(180,el.clientWidth*.55),behavior:'smooth'})};
 const scrollChoiceRail=direction=>{const el=choiceRailRef.current;if(!el)return;el.scrollBy({left:direction*Math.max(180,el.clientWidth*.72),behavior:'smooth'})};
 const gestureRef=useRef({pointers:new Map(),drag:false,pending:false,holdTimer:null,primary:null,x:0,y:0,downX:0,downY:0,startAdjust:null,pinch:false,distance:0,zoom:1,midX:0,midY:0,startPan:{x:0,y:0}});
 const viewGestureRef=useRef({pointers:new Map(),drag:false,pinch:false,x:0,y:0,distance:0,startZoom:1,startPan:{x:0,y:0},midX:0,midY:0});
 useEffect(()=>{if(b&&toolBarRef.current)toolBarRef.current.scrollLeft=0},[b]);
 useEffect(()=>{if(typeof window==='undefined'||!window.matchMedia('(min-width:1100px)').matches||screen!=='process'||!uniformCategory||!gender)return;setDesktopSelectorActive('uniform');setOptionTool('uniform');setUniformPickerTab(uniformCategory==='government'?`government-${gender}`:uniformCategory)},[screen,uniformCategory]);
 useEffect(()=>{if(!optionTool)return;const dismiss=e=>{const t=e.target;if(t?.closest?.('.tool-choice-sheet,.process-option-bar,.tool-rail-arrow,.direct-edit-preview,.desktop-accessory-adjust,.desktop-adjust-only-rail,.preview-desktop-actions,.photo-size-overlay,.photo-size-trigger'))return;setOptionTool(null)};document.addEventListener('pointerdown',dismiss,true);return()=>document.removeEventListener('pointerdown',dismiss,true)},[optionTool]);
 const renderTimer=useRef(null);
 const beautyTimerRef=useRef(null);
 const adjustRenderBusyRef=useRef(false);
 const pendingAdjustRef=useRef(null);
 const transparentCache=useRef({key:'',blob:null}), editCache=useRef(null), resultUrl=useRef('');
 const showBlob=blob=>{if(resultUrl.current)URL.revokeObjectURL(resultUrl.current);resultUrl.current=URL.createObjectURL(blob);setB(resultUrl.current)};
 const pick=e=>{const v=e.target.files?.[0];if(v){currentOutputJobRef.current='';currentOutputTrialRef.current=false;setOutputJobId('');analyticsEvent('idprom_photo_add');setPhotoCrop({...DEFAULT_PHOTO_CROP});setPhotoSizeBlob(null);setTrialPreview(false);undoStackRef.current=[];redoStackRef.current=[];historyRefresh();firstUploadedPhotoRef.current=v;setSafetyBlocked(false);ribbonRef.current=null;setRibbonId('');ribbonAdjustRef.current={x:0,y:0,scale:1};setRibbonAdjust(ribbonAdjustRef.current);collarPinAdjustRef.current={left:{x:0,y:0},right:{x:0,y:0},scale:1};setCollarPinAdjust(collarPinAdjustRef.current);chestPinRef.current=null;setChestPinId('');chestPinAdjustRef.current={x:0,y:0,scale:1};setChestPinAdjust(chestPinAdjustRef.current);backgroundRef.current='/assets/background.jpg';setBackgroundId('default');if(headMasterPreview)URL.revokeObjectURL(headMasterPreview);setHeadMasterPreview(null);setHeadPreviewLock(null);transparentCache.current={key:'',blob:null};editCache.current=null;setLiveCanvasVisible(false);initialHeadAdjustRef.current={scale:1,x:0,y:0,rotation:0};setHeadAdjust(initialHeadAdjustRef.current);liveAdjustRef.current={...initialHeadAdjustRef.current};setPlacementLocked(false);lockedPlacementRef.current=null;lockedMasterRef.current=null;initialProcessedMasterRef.current=null;hairResultCacheRef.current.clear();preparedHairBaseRef.current=null;lastHairDonorRef.current=null;cleanHairBaseRef.current=null;initialStyledHairRef.current=null;setCollarWarp(0);liveCollarWarpRef.current=0;setCollarHeight(0);liveCollarHeightRef.current=0;setNeckAdjust({width:0,length:0});liveNeckAdjustRef.current={width:0,length:0};setPlacementLocked(false);lockedPlacementRef.current=null;setPreviewZoom(1);setPreviewPan({x:0,y:0});setComparePreview(false);setHairId(null);setF(v);setA(URL.createObjectURL(v));setB();setMsg('')}};
 const applyAdjust=next=>{if(placementLocked)return;paintHeadTransform(next)};
 const nudge=(k,d)=>{const v={...headAdjust,[k]:headAdjust[k]+d};if(k==='scale')v.scale=Math.max(.20,Math.min(2.00,v.scale));applyAdjust(v)};
 const applyCollarWarp=amount=>{if(placementLocked)return;const v=Math.max(-2,Math.min(2,amount));liveCollarWarpRef.current=v;setCollarWarp(v);if(editCache.current){drawLivePreview();commitAdjust()}};
 const applyCollarHeight=amount=>{if(placementLocked)return;const v=Math.max(-2,Math.min(2,amount));liveCollarHeightRef.current=v;setCollarHeight(v);if(editCache.current){drawLivePreview();commitAdjust()}};
 const autoFitCollar=()=>{const target=Math.max(-.35,Math.min(.35,(headAdjust.scale-1)*.9));applyCollarWarp(target)};
 const applyNeckAdjust=async next=>{if(placementLocked)return;const v={width:Math.max(-1,Math.min(1,next.width||0)),length:Math.max(-1,Math.min(1,next.length||0))};liveNeckAdjustRef.current=v;setNeckAdjust(v);if(!editCache.current)return;drawLivePreview();commitAdjust()};
 const headTransformCss=(adj=liveAdjustRef.current)=>{
  const lock=headPreviewLock;if(!lock)return '';
  const s=adj.scale||1,rot=adj.rotation||0,stage=previewStageRef.current;
  const dx=(adj.x||0)*(stage?.clientWidth||0),dy=(adj.y||0)*(stage?.clientHeight||0);
  return `translate3d(${dx}px,${dy}px,0) rotate(${rot}deg) scale(${s})`;
 };
 const renderSeqRef=useRef(0);
 // V225: draw straight into a persistent canvas. No image encoding or React
 // image-src replacement while moving a slider, finger or mouse.
 const finishTimer=useRef(null);
 // Keep the canvas visible throughout a range-pointer gesture. Switching to
 // the encoded image mid-drag caused the preview to jump between two frames.
 const activeSliderPointersRef=useRef(new Set());
 const finishSliderRef=useRef(null);
 useEffect(()=>{
  const finish=e=>{
   if(!activeSliderPointersRef.current.delete(e.pointerId))return;
   if(activeSliderPointersRef.current.size===0)finishSliderRef.current?.();
  };
  document.addEventListener('pointerup',finish,true);
  document.addEventListener('pointercancel',finish,true);
  return()=>{document.removeEventListener('pointerup',finish,true);document.removeEventListener('pointercancel',finish,true)};
 },[]);
 // V243: one history entry per pointer gesture (not one per slider animation frame).
 const undoStackRef=useRef([]),redoStackRef=useRef([]);
 const[historyCounts,setHistoryCounts]=useState({undo:0,redo:0});
 const historySnapshot=()=>({
  master:editCache.current?.master,lock:editCache.current?.lock,
  adjust:{...liveAdjustRef.current},warp:liveCollarWarpRef.current,height:liveCollarHeightRef.current,
  neck:{...liveNeckAdjustRef.current},ribbon:ribbonRef.current,ribbonId,
  ribbonAdjust:{...ribbonAdjustRef.current},pins:collarPinRef.current,pinId:collarPinId,
  pinAdjust:{left:{...collarPinAdjustRef.current.left},right:{...collarPinAdjustRef.current.right},scale:collarPinAdjustRef.current.scale||1},
  chestPin:chestPinRef.current,chestPinId,chestPinAdjust:{...chestPinAdjustRef.current},
  background:backgroundRef.current,backgroundId,hairId,placementLocked,
  category:uniformCategory,gender,level,style:selectedStyle,
  job:selectedJobTemplate,student:selectedStudentTemplate,gown:selectedGownTemplate,interior:selectedInteriorTemplate
 });
 const historySignature=s=>JSON.stringify({...s,master:undefined,lock:undefined});
 const historyRefresh=()=>setHistoryCounts({undo:undoStackRef.current.length,redo:redoStackRef.current.length});
 const rememberEdit=()=>{
  if(!editCache.current||busy||hairBusy||uniformChanging||downloadBusy)return;
  const snap=historySnapshot(),stack=undoStackRef.current;
  if(stack.length&&stack[stack.length-1].master===snap.master&&stack[stack.length-1].lock===snap.lock&&historySignature(stack[stack.length-1])===historySignature(snap))return;
  stack.push(snap);if(stack.length>60)stack.shift();redoStackRef.current=[];historyRefresh();
 };
 const restoreHistory=async(direction)=>{
  if(busy||hairBusy||uniformChanging||downloadBusy||!editCache.current)return;
  const from=direction==='undo'?undoStackRef.current:redoStackRef.current;
  const to=direction==='undo'?redoStackRef.current:undoStackRef.current;
  // Skip clicks that did not actually modify the editor.
  let snap;
  const current=historySnapshot();
  while(from.length){const candidate=from.pop();if(candidate.master!==current.master||candidate.lock!==current.lock||historySignature(candidate)!==historySignature(current)){snap=candidate;break;}}
  if(!snap){historyRefresh();return;}
  to.push(current);if(to.length>60)to.shift();historyRefresh();
  beginOptionRender();editCache.current={...editCache.current,master:snap.master,lock:snap.lock};
  liveAdjustRef.current={...snap.adjust};setHeadAdjust({...snap.adjust});
  liveCollarWarpRef.current=snap.warp;setCollarWarp(snap.warp);
  liveCollarHeightRef.current=snap.height;setCollarHeight(snap.height);
  liveNeckAdjustRef.current={...snap.neck};setNeckAdjust({...snap.neck});
  ribbonRef.current=snap.ribbon;setRibbonId(snap.ribbonId);
  ribbonAdjustRef.current={...snap.ribbonAdjust};setRibbonAdjust({...snap.ribbonAdjust});
  collarPinRef.current=snap.pins;setCollarPinId(snap.pinId);
  collarPinAdjustRef.current={left:{...snap.pinAdjust.left},right:{...snap.pinAdjust.right},scale:snap.pinAdjust.scale||1};setCollarPinAdjust(collarPinAdjustRef.current);
  chestPinRef.current=snap.chestPin;setChestPinId(snap.chestPinId);chestPinAdjustRef.current={...snap.chestPinAdjust};setChestPinAdjust(chestPinAdjustRef.current);
  backgroundRef.current=snap.background;setBackgroundId(snap.backgroundId);setHairId(snap.hairId);
  setPlacementLocked(snap.placementLocked);setUniformCategory(snap.category);setGender(snap.gender);
  setLevel(snap.level);setSelectedStyle(snap.style);setSelectedJobTemplate(snap.job);
  setSelectedStudentTemplate(snap.student);if(snap.gown)setSelectedGownTemplate(snap.gown);setSelectedInteriorTemplate(snap.interior);
  setHeadPreviewLock(snap.lock);
  if(headMasterPreview)URL.revokeObjectURL(headMasterPreview);
  setHeadMasterPreview(URL.createObjectURL(snap.master));
  try{const seq=renderSeqRef.current;
   const out=await renderWithRibbon(snap.master,snap.lock,snap.adjust,snap.warp,snap.neck,snap.background);
   if(seq===renderSeqRef.current)showBlob(out);
  }catch(e){suppressUiError(e,'ย้อนกลับ/คืนค่าไม่สำเร็จ')}
 };
 const captureSliderPointer=e=>{
  if(e.target?.matches?.('input[type="range"]'))activeSliderPointersRef.current.add(e.pointerId);
  if(e.target?.closest?.('.head-adjust-row,.ribbon-option,.collar-pin-option,.background-swatch,.hair-card,.placement-lock-btn,.uniform-option,.uniform-card')||(e.target?.closest?.('.hero-preview')&&!e.target?.closest?.('button,input')&&!comparePreview)||e.target?.closest?.('.preview-floating-actions button[aria-label="รีเซ็ต"]'))rememberEdit();
 };

 const previewFrame=useRef(null);
 const previewDrawingRef=useRef(false);
 const previewDirtyRef=useRef(false);
 const previewEpochRef=useRef(0);
 // An option click replaces the displayed composite; do not leave the old live canvas over it.
 const beginOptionRender=()=>{
  clearTimeout(renderTimer.current);clearTimeout(finishTimer.current);
  previewEpochRef.current++;previewDirtyRef.current=false;
  if(previewFrame.current){cancelAnimationFrame(previewFrame.current);previewFrame.current=null}
  setLiveCanvasVisible(false);
  return ++renderSeqRef.current;
 };
 // V297: one preview frame at a time. Never queue a while-loop of stale
 // full composites behind pointer events; a released finger must remain responsive.
 const drawLivePreview=()=>{
  if(!editCache.current||!liveCanvasRef.current)return;
  previewDirtyRef.current=true;
  if(previewFrame.current||previewDrawingRef.current)return;
  previewFrame.current=requestAnimationFrame(async()=>{
   previewFrame.current=null;
   if(previewDrawingRef.current||!previewDirtyRef.current)return;
   previewDirtyRef.current=false;
   previewDrawingRef.current=true;
   const current=editCache.current,epoch=previewEpochRef.current;
   const canvas=liveCanvasRef.current;
   canvas.__editorGeneration=epoch;
   try{
    await renderAdjustedFinal(current.master,current.lock,{...liveAdjustRef.current},liveCollarWarpRef.current,{...liveNeckAdjustRef.current},backgroundRef.current,ribbonRef.current,{...ribbonAdjustRef.current},collarPinRef.current,{...collarPinAdjustRef.current},true,canvas,liveCollarHeightRef.current,chestPinRef.current,chestPinAdjustRef.current);
    if(epoch===previewEpochRef.current)setLiveCanvasVisible(true);
   }catch(e){suppressUiError(e,'แสดงภาพขณะลากไม่สำเร็จ')}
   finally{
    previewDrawingRef.current=false;
    if(previewDirtyRef.current)drawLivePreview();
   }
  });
 };
 const commitAdjust=()=>{
  if(placementLocked||!editCache.current)return;
  clearTimeout(finishTimer.current);
  if(activeSliderPointersRef.current.size)return;
  const seq=++renderSeqRef.current;
  finishTimer.current=setTimeout(async()=>{
   if(seq!==renderSeqRef.current||!editCache.current)return;
   const current=editCache.current;
   try{
    const out=await renderWithRibbon(current.master,current.lock,{...liveAdjustRef.current},liveCollarWarpRef.current,{...liveNeckAdjustRef.current},backgroundRef.current);
    // Invalidate old preview work rather than waiting on a render queue.
    if(seq===renderSeqRef.current){
     previewEpochRef.current++;previewDirtyRef.current=false;
     if(previewFrame.current){cancelAnimationFrame(previewFrame.current);previewFrame.current=null}
     if(liveCanvasRef.current)liveCanvasRef.current.__editorGeneration=previewEpochRef.current;
    }
    if(seq===renderSeqRef.current&&!activeSliderPointersRef.current.size){
     // Keep one visible rendering surface: switching canvas <-> img changes
     // rasterisation/scale and makes the portrait appear to zoom back and forth.
     showBlob(out);
     setLiveCanvasVisible(false);
    }
   }catch(e){if(seq===renderSeqRef.current)suppressUiError(e,'ปรับภาพไม่สำเร็จ')}
  },180);
 };
 finishSliderRef.current=commitAdjust;
 const paintHeadTransform=next=>{
  if(placementLocked)return;
  liveAdjustRef.current=next;setHeadAdjust(next);
  ++renderSeqRef.current;clearTimeout(finishTimer.current);
  drawLivePreview();
  // During a held pointer, commit once on release, not after every move.
  if(!gestureRef.current.drag)commitAdjust();
 };
 const scheduleAdjust=next=>paintHeadTransform(next);
 const sliderAdjust=next=>paintHeadTransform(next);
 const stepRangeValue=(value,delta,min,max)=>Math.max(min,Math.min(max,Math.round((Number(value)+delta)*1000)/1000));
 const stepHeadSlider=(key,delta,min,max)=>{const current=key==='scale'?headAdjust.scale*100:key==='x'?headAdjust.x*100:key==='y'?-headAdjust.y*100:(headAdjust.rotation||0);const next=Math.max(min,Math.min(max,Math.round((current+delta)*1000)/1000));sliderAdjust({...headAdjust,[key]:key==='scale'||key==='x'?next/100:key==='y'?-next/100:next});};
 const clampPreviewPan=(pan,zoom=previewZoom)=>{const stage=previewStageRef.current;const maxX=(stage?.clientWidth||0)*Math.abs(zoom-1)/2,maxY=(stage?.clientHeight||0)*Math.abs(zoom-1)/2;return{x:Math.max(-maxX,Math.min(maxX,pan.x)),y:Math.max(-maxY,Math.min(maxY,pan.y))}};
 const setPreviewViewZoom=next=>{const zoom=Math.max(.2,Math.min(2,next));setPreviewZoom(zoom);setPreviewPan(current=>clampPreviewPan(current,zoom))};
 const previewCanvasPoint=e=>{const rect=e.currentTarget.getBoundingClientRect(),lock=editCache.current?.lock;return !lock?null:{rect,lock,x:(e.clientX-rect.left)/rect.width*lock.W,y:(e.clientY-rect.top)/rect.height*lock.H}};
 const isHeadTouch=e=>{if(!b||comparePreview||placementLocked||optionTool!=='head')return false;const p=previewCanvasPoint(e);if(!p)return false;const {lock,x,y}=p,adj=liveAdjustRef.current,s=adj.scale||1,baseW=lock.headW*lock.scale,baseH=lock.headH*lock.scale,cx=lock.hX+baseW/2+(adj.x||0)*lock.W,cy=lock.hY+baseH/2+(adj.y||0)*lock.H;return x>=cx-baseW*s*.52&&x<=cx+baseW*s*.52&&y>=cy-baseH*s*.52&&y<=cy+baseH*s*.38};
 const beginViewGesture=e=>{e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture?.(e.pointerId);const v=viewGestureRef.current;if(!v.pointers)v.pointers=new Map();v.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(v.pointers.size===1){v.drag=true;v.pinch=false;v.x=e.clientX;v.y=e.clientY;v.startPan={...previewPan}}else{const pts=[...v.pointers.values()].slice(0,2);v.drag=false;v.pinch=true;v.distance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);v.startZoom=previewZoom;v.startPan={...previewPan};v.midX=(pts[0].x+pts[1].x)/2;v.midY=(pts[0].y+pts[1].y)/2}};
 // V271: tap an existing image layer to open its own adjustment tab.
 // Use the same final-composite geometry as renderAdjustedFinal; do not change layer positions.
 const selectPreviewLayer=e=>{
  if(!b||comparePreview||busy||hairBusy||uniformChanging||downloadBusy||e.pointerType==='touch'&&!e.isPrimary)return false;
  const p=previewCanvasPoint(e);if(!p)return false;
  const {lock,x,y}=p;
  if(!/\/government-uniforms\//.test(lock.templatePath||'')){
   // The head tool is also available for non-government outfits.
   return selectPreviewHead(p);
  }
  const inside=(cx,cy,w,h)=>x>=cx-w/2&&x<=cx+w/2&&y>=cy-h/2&&y<=cy+h/2;
  const pins=collarPinRef.current,cp=collarPinAdjustRef.current;
  if(pins){
   const female=/\/government-uniforms\/female-/.test(lock.templatePath||'');
   const w=lock.uW*(female?.078:.068)*(cp.scale||1),h=w*1.6;
   const left=cp.left||{x:0,y:0},right=cp.right||{x:0,y:0};
   const yy=lock.uY+lock.uH*.245;
   if(inside(lock.uX+lock.uW*((female?.315:.455)+(left.x||0)),yy+lock.uH*(left.y||0),w*1.45,h*1.4)||
      inside(lock.uX+lock.uW*((female?.685:.545)+(right.x||0)),yy+lock.uH*(right.y||0),w*1.45,h*1.4)){
    setOptionTool('pins');setPinKindTab('collar');setPinPanelTab('adjust');return true;
   }
  }
  if(chestPinRef.current){
   const v=chestPinAdjustRef.current,w=lock.uW*.073*(v.scale||1);
   if(inside(lock.uX+lock.uW*(.28+(v.x||0)),lock.uY+lock.uH*(.405+(v.y||0)),w*1.6,w*2.3)){
    setOptionTool('pins');setPinKindTab('chest');setPinPanelTab('adjust');return true;
   }
  }
  if(ribbonRef.current){
   const v=ribbonAdjustRef.current,w=lock.uW*.205*(v.scale||1);
   if(inside(lock.uX+lock.uW*(.73+(v.x||0)),lock.uY+lock.uH*(.495+(v.y||0))+w/7,w*1.2,w*.65)){
    if(optionTool==='ribbon')return false; // preserve the existing direct ribbon drag
    setOptionTool('ribbon');setRibbonPanelTab('adjust');return true;
   }
  }
  return selectPreviewHead(p);
 };
 const selectPreviewHead=({lock,x,y})=>{
  if(placementLocked)return false;
  const adj=liveAdjustRef.current,s=adj.scale||1,w=lock.headW*lock.scale*s,h=lock.headH*lock.scale*s;
  const cx=lock.hX+lock.headW*lock.scale/2+(adj.x||0)*lock.W;
  const cy=lock.hY+lock.headH*lock.scale/2+(adj.y||0)*lock.H;
  if(x<cx-w*.52||x>cx+w*.52||y<cy-h*.52||y>cy+h*.38)return false;
  if(optionTool==='head')return false; // keep existing hold-to-drag behavior once selected
  setOptionTool('head');return true;
 };
 const previewTapRef=useRef(null);
 // All touch pointers share one viewport pinch, regardless of the layer under either finger.
 const startPreviewPinch=e=>{
  const v=viewGestureRef.current,g=gestureRef.current,drag=ribbonDragRef.current;
  const points=new Map(v.pointers||[]);
  for(const [id,point] of g.pointers||[])points.set(id,point);
  if(drag)points.set(drag.id,{x:drag.lastX??drag.x,y:drag.lastY??drag.y});
  points.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(points.size<2)return false;
  e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture?.(e.pointerId);
  clearTimeout(g.holdTimer);g.holdTimer=null;g.pending=false;g.drag=false;g.pinch=false;
  g.pointers.clear();ribbonDragRef.current=null;previewTapRef.current=null;
  v.pointers=points;v.drag=false;v.pinch=true;v.wasPinch=true;
  const pts=[...points.values()].slice(0,2);
  v.distance=Math.max(1,Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y));
  v.startZoom=previewZoom;v.startPan={...previewPan};
  v.midX=(pts[0].x+pts[1].x)/2;v.midY=(pts[0].y+pts[1].y)/2;
  return true;
 };
 const previewPointerDown=e=>{
  if(e.pointerType==='touch'){
   if(startPreviewPinch(e))return;
   previewTapRef.current={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
  }
  if(e.pointerType!=='touch'&&selectPreviewLayer(e)){e.preventDefault();e.stopPropagation();return;}
  if(optionTool==='ribbon'&&ribbonRef.current&&b&&!comparePreview){
   const rect=e.currentTarget.getBoundingClientRect();
   const lock=editCache.current?.lock;
   if(!lock)return;
   const px=(e.clientX-rect.left)/rect.width*lock.W,py=(e.clientY-rect.top)/rect.height*lock.H;
   const v=ribbonAdjustRef.current,w=lock.uW*.205*v.scale,h=w*(2/7);
   const cx=lock.uX+lock.uW*(.73+v.x),top=lock.uY+lock.uH*(.495+v.y);
   if(px<cx-w*.8||px>cx+w*.8||py<top-h||py>top+h*2){beginViewGesture(e);return}
   e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture?.(e.pointerId);
   ribbonDragRef.current={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,start:{...v}};return;
  }
  if(!isHeadTouch(e)){if(a||b)beginViewGesture(e);return}
  e.preventDefault();e.stopPropagation();
  e.currentTarget.setPointerCapture?.(e.pointerId);
  const g=gestureRef.current;
  if(!g.pointers)g.pointers=new Map();g.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(g.pointers.size===1){
   clearTimeout(g.holdTimer);g.drag=false;g.pending=true;g.primary=e.pointerId;
   g.x=g.downX=e.clientX;g.y=g.downY=e.clientY;g.startAdjust={...liveAdjustRef.current};g.pinch=false;
   g.holdTimer=setTimeout(()=>{
    const point=g.pointers?.get(g.primary);
    if(!g.pending||g.pinch||g.pointers?.size!==1||!point)return;
    g.pending=false;g.drag=true;g.x=point.x;g.y=point.y;g.startAdjust={...liveAdjustRef.current};
    navigator.vibrate?.(10);
   },320);
  }
 };
 const previewPointerMove=e=>{
  const v=viewGestureRef.current;
  if(previewTapRef.current?.id===e.pointerId&&Math.hypot(e.clientX-previewTapRef.current.x,e.clientY-previewTapRef.current.y)>8)previewTapRef.current.moved=true;
  if(v.pointers?.has(e.pointerId)){
   e.preventDefault();v.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(v.pointers.size>=2&&v.pinch){const pts=[...v.pointers.values()].slice(0,2),distance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),midX=(pts[0].x+pts[1].x)/2,midY=(pts[0].y+pts[1].y)/2,zoom=Math.max(.2,Math.min(2,v.startZoom*distance/Math.max(1,v.distance)));setPreviewZoom(zoom);setPreviewPan(clampPreviewPan({x:v.startPan.x+(midX-v.midX),y:v.startPan.y+(midY-v.midY)},zoom))}
   else if(v.drag&&v.pointers.size===1){setPreviewPan(clampPreviewPan({x:v.startPan.x+(e.clientX-v.x),y:v.startPan.y+(e.clientY-v.y)},previewZoom))}
   return;
  }
  const drag=ribbonDragRef.current;
  if(drag&&drag.id===e.pointerId){drag.lastX=e.clientX;drag.lastY=e.clientY;e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();const lock=editCache.current?.lock;if(lock)applyRibbonAdjust({...drag.start,x:drag.start.x+(e.clientX-drag.x)/rect.width*lock.W/lock.uW,y:drag.start.y+(e.clientY-drag.y)/rect.height*lock.H/lock.uH});return;}
  const g=gestureRef.current;if(!g.pointers?.has(e.pointerId)||(optionTool&&optionTool!=='head'))return;
  e.preventDefault();g.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const rect=e.currentTarget.getBoundingClientRect();
  if(g.pending&&e.pointerId===g.primary){if(Math.hypot(e.clientX-g.downX,e.clientY-g.downY)>10){clearTimeout(g.holdTimer);g.pending=false}return}
  else if(g.drag&&e.pointerId===g.primary){const next={...g.startAdjust,x:g.startAdjust.x+(e.clientX-g.x)/rect.width,y:g.startAdjust.y+(e.clientY-g.y)/rect.height};paintHeadTransform(next)}
 };
 const previewPointerUp=e=>{
  const tap=previewTapRef.current;
  if(tap?.id===e.pointerId){previewTapRef.current=null;if(!tap.moved&&e.type!=='pointercancel'&&!viewGestureRef.current.wasPinch){selectPreviewLayer(e)}}
  const v=viewGestureRef.current;
  if(v.pointers?.has(e.pointerId)){
   e.preventDefault();v.pointers.delete(e.pointerId);
   if(v.pointers.size===0){v.drag=false;v.pinch=false;v.wasPinch=false}
   else if(v.wasPinch){v.drag=false;v.pinch=false} // Lift remaining finger before starting a new gesture.
   else if(v.pointers.size===1){const [,point]=[...v.pointers.entries()][0];v.drag=true;v.pinch=false;v.x=point.x;v.y=point.y;v.startPan={...previewPan}}
   return;
  }
  if(ribbonDragRef.current?.id===e.pointerId){e.preventDefault();ribbonDragRef.current=null;commitAdjust();return;}
  const g=gestureRef.current;if(!g.pointers?.has(e.pointerId))return;
  e.preventDefault();clearTimeout(g.holdTimer);g.holdTimer=null;g.pointers.delete(e.pointerId);
  if(g.pointers.size===0){const changed=g.drag||g.pinch;g.drag=false;g.pending=false;g.pinch=false;if(changed)commitAdjust()}
  else if(g.pointers.size===1){g.drag=false;g.pending=false;g.pinch=false;g.primary=[...g.pointers.keys()][0]}
 };
 // V298: the empty area surrounding the portrait participates in the same
 // two-finger gesture. Controls keep their own pointer handling untouched.
 const isPreviewControl=e=>!!e.target?.closest?.('button,input,select,textarea,a,[role="button"],.tool-choice-sheet,.process-option-bar,.preview-floating-actions,.image-progress-overlay');
 const previewAreaPointerDown=e=>{
  if(!a&&!b||e.pointerType!=='touch'||e.target?.closest?.('.hero-preview')||isPreviewControl(e))return;
  if(startPreviewPinch(e))return;
  // Track the first finger outside the frame, so the next finger (even inside)
  // can immediately convert the gesture into a pinch.
  beginViewGesture(e);
 };
 const previewAreaPointerMove=e=>{
  if(e.target?.closest?.('.hero-preview')||!viewGestureRef.current.pointers?.has(e.pointerId))return;
  previewPointerMove(e);
 };
 const previewAreaPointerUp=e=>{
  if(e.target?.closest?.('.hero-preview')||!viewGestureRef.current.pointers?.has(e.pointerId))return;
  previewPointerUp(e);
 };
 const previewWheel=e=>{if(a||b){e.preventDefault();setPreviewViewZoom(previewZoom*Math.exp(-e.deltaY*.0015))}};
 // Kept only for compatibility with the hidden legacy row in this build.
 const lockPlacement=()=>{};
 const unlockPlacement=()=>{};
 const changeHair=async id=>{
  if(!privateTrialActive&&rights.generationRemaining<1&&id){setPayMsg('ซื้อแพ็ก 159 บาทเพื่อเลือกทรงผมและประมวลผลเพิ่ม 10 ครั้ง');setBuyOpen(true);return;}
  if(hairRequestRef.current||hairBusy||busy)return;
  setHairId(id);
  if(!editCache.current)return;
  const firstUploadedPhoto=firstUploadedPhotoRef.current;
  if(!firstUploadedPhoto){setMsg('ไม่พบรูปที่อัปโหลดครั้งแรก กรุณาเพิ่มรูปใหม่');return;}
  // Re-run the SAME first-processing pipeline from the untouched uploaded File.
  // Never send the previously AI-generated head or the completed uniform portrait
  // to the hairstyle-only endpoint: it can alter identity and leave old hair behind.
  const snap={adjust:{...liveAdjustRef.current},collarWarp:liveCollarWarpRef.current,collarHeight:liveCollarHeightRef.current,neckAdjust:{...liveNeckAdjustRef.current}};
  hairRequestRef.current=true;setHairBusy(true);beginProgress('กำลังประมวลผลทรงผมใหม่');setMsg('กำลังสร้างทรงผมจากรูปต้นฉบับ…');
  let completed=false;
  try{
   let nextMaster;
   if(false&&initialProcessedMasterRef.current){
    // Return to the exact first processed result without a second paid API call.
    nextMaster=initialProcessedMasterRef.current;
    setProgressStage(78,'กำลังคืนภาพแรก');
   }else{
    const cached=null; // Each explicit AI reprocess consumes one shared credit.
    if(cached){nextMaster=cached;setProgressStage(78,'กำลังใช้ภาพที่เคยสร้างไว้');}
    else{
     // Only the untouched first upload is submitted for the new hairstyle.
     const aiHeadNeck=await aiFinishPortrait(firstUploadedPhoto,id||'',{maleHairReplacement:/^manhair-\d{2}$/.test(id||''),creditKind:'hairstyle',templatePath:editCache.current?.lock?.templatePath||activeUniformTemplate});
     if(aiHeadNeck?.idpromTrial)setTrialPreview(true);
     setProgressStage(60,'กำลังแยกพื้นหลัง');
     const transparent=await removeBackgroundBlob(aiHeadNeck);
     setProgressStage(76,'กำลังปรับผิวแบบประมวลผลครั้งแรก');
     nextMaster=await finishHairlineSeam(await optionalHealthySkin10(transparent,firstUploadedPhoto));
     // Match the female hairstyle pipeline: use one coherent AI output layer.
     // Do not paste a second face over the new male hairline: the overlapping
     // face stencil produced the visible forehead patch / mask-shaped seam.
     hairResultCacheRef.current.set(id||'original',nextMaster);
    }
   }
   setProgressStage(88,'กำลังประกอบกับชุดเดิม');
   const current=editCache.current;
   if(!current)throw Error('ไม่พบภาพที่กำลังแก้ไข');
   const out=await renderWithRibbon(nextMaster,current.lock,snap.adjust,snap.collarWarp,snap.neckAdjust,backgroundRef.current);
   // The old editor canvas may otherwise cover the newly generated PNG.
   beginOptionRender();
   editCache.current={...current,master:nextMaster};
   liveAdjustRef.current={...snap.adjust};setHeadAdjust({...snap.adjust});
   liveCollarWarpRef.current=snap.collarWarp;setCollarWarp(snap.collarWarp);liveCollarHeightRef.current=snap.collarHeight;setCollarHeight(snap.collarHeight);
   liveNeckAdjustRef.current={...snap.neckAdjust};setNeckAdjust({...snap.neckAdjust});
   if(headMasterPreview)URL.revokeObjectURL(headMasterPreview);
   setHeadMasterPreview(URL.createObjectURL(nextMaster));
   setHeadPreviewLock(current.lock);
   setProgressStage(97,'กำลังแสดงผลทรงผมใหม่');
   showBlob(out);setHairId(id);setMsg('เปลี่ยนทรงผมจากภาพต้นฉบับแล้ว');completed=true;
  }catch(e){setMsg(e.message||'เปลี่ยนทรงผมไม่สำเร็จ — คงภาพเดิมไว้')}
  finally{await refreshWallet();await finishProgress(completed);hairRequestRef.current=false;setHairBusy(false)}
 };
 const changeHairForStudio=async id=>{
  if(hairRequestRef.current||hairBusy||busy)return;
  setHairId(id);
  if(!editCache.current)return;
  const firstUploadedPhoto=firstUploadedPhotoRef.current;
  if(!firstUploadedPhoto){setMsg('ไม่พบรูปที่อัปโหลดครั้งแรก กรุณาเพิ่มรูปใหม่');return;}
  // Re-run the SAME first-processing pipeline from the untouched uploaded File.
  // Never send the previously AI-generated head or the completed uniform portrait
  // to the hairstyle-only endpoint: it can alter identity and leave old hair behind.
  const snap={adjust:{...liveAdjustRef.current},collarWarp:liveCollarWarpRef.current,collarHeight:liveCollarHeightRef.current,neckAdjust:{...liveNeckAdjustRef.current}};
  hairRequestRef.current=true;setHairBusy(true);beginProgress('กำลังประมวลผลทรงผมใหม่');setMsg('กำลังสร้างทรงผมจากรูปต้นฉบับ…');
  let completed=false;
  try{
   let nextMaster;
   if(false&&initialProcessedMasterRef.current&&!studioHairOriginRef.current){
    // Return to the exact first processed result without a second paid API call.
    nextMaster=initialProcessedMasterRef.current;
    setProgressStage(78,'กำลังคืนภาพแรก');
   }else{
    const cached=null; // Each explicit AI reprocess consumes one shared credit.
    if(cached){nextMaster=cached;setProgressStage(78,'กำลังใช้ภาพที่เคยสร้างไว้');}
    else{
     // Only the untouched first upload is submitted for the new hairstyle.
     const aiHeadNeck=await aiFinishPortrait(firstUploadedPhoto,id||'',{maleHairReplacement:/^manhair-\d{2}$/.test(id||''),creditKind:'hairstyle',templatePath:editCache.current?.lock?.templatePath||activeUniformTemplate});
     if(aiHeadNeck?.idpromTrial){studioTrialRef.current=true;setTrialPreview(true);}
     setProgressStage(60,'กำลังแยกพื้นหลัง');
     const transparent=await removeBackgroundBlob(aiHeadNeck);
     setProgressStage(76,'กำลังปรับผิวแบบประมวลผลครั้งแรก');
     nextMaster=await finishHairlineSeam(await optionalHealthySkin10(transparent,firstUploadedPhoto));
     // Match the female hairstyle pipeline: use one coherent AI output layer.
     // Do not paste a second face over the new male hairline: the overlapping
     // face stencil produced the visible forehead patch / mask-shaped seam.
     hairResultCacheRef.current.set(id||'original',nextMaster);
    }
   }
   setProgressStage(88,'กำลังประกอบกับชุดเดิม');
   const current=editCache.current;
   if(!current)throw Error('ไม่พบภาพที่กำลังแก้ไข');
   const out=await renderWithRibbon(nextMaster,current.lock,snap.adjust,snap.collarWarp,snap.neckAdjust,backgroundRef.current);
   // The old editor canvas may otherwise cover the newly generated PNG.
   beginOptionRender();
   editCache.current={...current,master:nextMaster};
   liveAdjustRef.current={...snap.adjust};setHeadAdjust({...snap.adjust});
   liveCollarWarpRef.current=snap.collarWarp;setCollarWarp(snap.collarWarp);liveCollarHeightRef.current=snap.collarHeight;setCollarHeight(snap.collarHeight);
   liveNeckAdjustRef.current={...snap.neckAdjust};setNeckAdjust({...snap.neckAdjust});
   if(headMasterPreview)URL.revokeObjectURL(headMasterPreview);
   setHeadMasterPreview(URL.createObjectURL(nextMaster));
   setHeadPreviewLock(current.lock);
   setProgressStage(97,'กำลังแสดงผลทรงผมใหม่');
   showBlob(out);setHairId(id);setMsg('เปลี่ยนทรงผมจากภาพต้นฉบับแล้ว');completed=true;
  }catch(e){setMsg(e.message||'เปลี่ยนทรงผมไม่สำเร็จ — คงภาพเดิมไว้')}
  finally{await refreshWallet();await finishProgress(completed);hairRequestRef.current=false;setHairBusy(false)}
  return completed;
 };
 const downloadHairDonor=async()=>{
  if(!(await verifyOutputRights(currentOutputJobRef.current)).unlocked){setBuyOpen(true);return;}
  const blob=lastHairDonorRef.current;
  if(!blob){setMsg('ยังไม่มีภาพทรงผมจาก AI ให้ตรวจ');return;}
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='selected-hair-ai-v100.png';document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const downloadCleanHead=async()=>{
  if(!(await verifyOutputRights(currentOutputJobRef.current)).unlocked){setBuyOpen(true);return;}
  const prepared=preparedHairBaseRef.current;
  if(!prepared?.blob){setMsg('ยังไม่มีภาพฐาน Clean Head — ล็อกตำแหน่งและลองเลือกทรงผมก่อน');return;}
  const url=URL.createObjectURL(prepared.blob),link=document.createElement('a');
  link.href=url;link.download='clean-head-master-v100.png';document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const applyRibbonAdjust=next=>{
  const v={x:Math.max(-.35,Math.min(.35,next.x)),y:Math.max(-.35,Math.min(.35,next.y)),scale:Math.max(.45,Math.min(2,next.scale))};
  ribbonAdjustRef.current=v;setRibbonAdjust(v);drawLivePreview();
  if(!ribbonDragRef.current)commitAdjust();
 };
 const selectRibbon=async option=>{
  if(busy||hairBusy||downloadBusy)return;
  const previous=ribbonRef.current,previousId=ribbonId;
  ribbonRef.current=option?.src||null;setRibbonId(option?.id||'');
  if(!editCache.current)return;
  const seq=beginOptionRender();
  // Keep the sharp composite visible until the full-resolution ribbon render is ready.
  try{
   const out=await renderWithRibbon(editCache.current.master,editCache.current.lock,{...liveAdjustRef.current},liveCollarWarpRef.current,liveNeckAdjustRef.current,backgroundRef.current);
   finishPinRender(seq,out);
  }catch(e){if(seq===renderSeqRef.current){ribbonRef.current=previous;setRibbonId(previousId);suppressUiError(e,'เปลี่ยนแพรแถบไม่สำเร็จ')}}
 };
 // Pin selection keeps the current sharp image until the full composite is ready.
 // Invalidate pending previews so an older low-resolution frame cannot cover it.
 const finishPinRender=(seq,out)=>{
  if(seq!==renderSeqRef.current)return false;
  previewEpochRef.current++;previewDirtyRef.current=false;
  if(previewFrame.current){cancelAnimationFrame(previewFrame.current);previewFrame.current=null}
  if(liveCanvasRef.current)liveCanvasRef.current.__editorGeneration=previewEpochRef.current;
  showBlob(out);setLiveCanvasVisible(false);
  return true;
 };
 const selectCollarPins=async option=>{
  if(busy||hairBusy||downloadBusy)return;
  const previous=collarPinRef.current,previousId=collarPinId;
  collarPinRef.current=option?{left:option.left,right:option.right}:null;setCollarPinId(option?.id||'');
  if(!editCache.current){setMsg('');return;}
  const seq=beginOptionRender();
  try{
   const out=await renderWithRibbon(editCache.current.master,editCache.current.lock,{...liveAdjustRef.current},liveCollarWarpRef.current,liveNeckAdjustRef.current,backgroundRef.current);
   if(finishPinRender(seq,out))setMsg('');
  }catch(e){if(seq===renderSeqRef.current){collarPinRef.current=previous;setCollarPinId(previousId);suppressUiError(e,'วางเข็มไม่สำเร็จ')}}
 };
 const applyCollarPinAdjust=next=>{
  const clampSide=side=>({x:Math.max(-.2,Math.min(.2,side?.x||0)),y:Math.max(-.2,Math.min(.2,side?.y||0))});
  const v={left:clampSide(next.left),right:clampSide(next.right),scale:Math.max(.5,Math.min(2,next.scale||1))};
  collarPinAdjustRef.current=v;setCollarPinAdjust(v);drawLivePreview();commitAdjust();
 };
 const selectChestPin=async option=>{
  if(busy||hairBusy||downloadBusy)return;
  rememberEdit();const previous=chestPinRef.current,previousId=chestPinId;
  chestPinRef.current=option?.src||null;setChestPinId(option?.id||'');
  if(!editCache.current)return;
  const seq=beginOptionRender();
  try{const out=await renderWithRibbon(editCache.current.master,editCache.current.lock,{...liveAdjustRef.current},liveCollarWarpRef.current,liveNeckAdjustRef.current,backgroundRef.current);
   finishPinRender(seq,out);
  }catch(e){if(seq===renderSeqRef.current){chestPinRef.current=previous;setChestPinId(previousId);suppressUiError(e,'วางเข็มติดอกไม่สำเร็จ')}}
 };
 const applyChestPinAdjust=next=>{
  const v={x:Math.max(-.35,Math.min(.35,next.x)),y:Math.max(-.35,Math.min(.35,next.y)),scale:Math.max(.45,Math.min(2,next.scale))};
  chestPinAdjustRef.current=v;setChestPinAdjust(v);drawLivePreview();commitAdjust();
 };
 const pinSlider=(label,value,min,max,step,change)=> <div className="head-adjust-row pin-control">
  <div className="pin-control-title"><span>{label}</span><output>{value>0&&min<0?'+':''}{Math.round(value)}%</output></div>
  <div className="pin-control-track"><button type="button" className="pin-step" aria-label={`ลด${label}`} onClick={()=>change(Number(stepRangeValue(value,-step,min,max)))}>−</button><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={e=>change(Number(e.target.value))}/><button type="button" className="pin-step" aria-label={`เพิ่ม${label}`} onClick={()=>change(Number(stepRangeValue(value,step,min,max)))}>+</button></div>
 </div>;
 const chestPinControls=()=> <div className="pin-controls" role="group" aria-label="ปรับเข็มติดอก">{!chestPinId?<div className="ribbon-adjust-empty">เลือกเข็มติดอกก่อนปรับตำแหน่ง</div>:<>
  {pinSlider('ซ้าย–ขวา',chestPinAdjust.x*100,-35,35,.5,v=>applyChestPinAdjust({...chestPinAdjust,x:v/100}))}
  {pinSlider('ขึ้น–ลง',-chestPinAdjust.y*100,-35,35,.5,v=>applyChestPinAdjust({...chestPinAdjust,y:-v/100}))}
  {pinSlider('ขนาด',chestPinAdjust.scale*100,45,200,1,v=>applyChestPinAdjust({...chestPinAdjust,scale:v/100}))}
  <button type="button" className="pin-reset" onClick={()=>{rememberEdit();applyChestPinAdjust({x:0,y:0,scale:1})}}>คืนค่าเข็มติดอก</button>
 </>}</div>;
 const collarPinControls=()=>{if(!collarPinId)return <div className="ribbon-adjust-empty">เลือกเข็มก่อนปรับตำแหน่ง</div>;const side=pinAdjustTab==='right'?'right':'left',value=collarPinAdjust[side];return <div className="pin-controls" role="group" aria-label="ปรับเข็มปกคอ">
  <div className="pin-adjust-tabs" role="group" aria-label="ส่วนที่ต้องการปรับ">{[['left','เข็มซ้าย'],['right','เข็มขวา'],['scale','ขนาดคู่']].map(([id,label])=><button type="button" key={id} aria-pressed={pinAdjustTab===id} className={pinAdjustTab===id?'active':''} onClick={()=>setPinAdjustTab(id)}>{label}</button>)}</div>
  {pinAdjustTab==='scale'?pinSlider('ขนาดเข็มทั้งสองข้าง',(collarPinAdjust.scale||1)*100,50,200,1,v=>applyCollarPinAdjust({...collarPinAdjust,scale:v/100})):<>
   {pinSlider('ซ้าย–ขวา',value.x*100,-20,20,.5,v=>applyCollarPinAdjust({...collarPinAdjust,[side]:{...value,x:v/100}}))}
   {pinSlider('ขึ้น–ลง',-value.y*100,-20,20,.5,v=>applyCollarPinAdjust({...collarPinAdjust,[side]:{...value,y:-v/100}}))}
  </>}
  <button type="button" className="pin-reset" onClick={()=>{rememberEdit();applyCollarPinAdjust(pinAdjustTab==='scale'?{...collarPinAdjust,scale:1}:{...collarPinAdjust,[side]:{x:0,y:0}})}}>คืนค่า{pinAdjustTab==='scale'?'ขนาดคู่':side==='left'?'เข็มซ้าย':'เข็มขวา'}</button>
 </div>};
 const selectBackground=async option=>{
  if(busy||hairBusy||downloadBusy)return;
  const previousPath=backgroundRef.current,previousId=backgroundId;
  backgroundRef.current=option.src;setBackgroundId(option.id);
  if(!editCache.current)return;
  const seq=beginOptionRender();
  try{
   const out=await renderWithRibbon(editCache.current.master,editCache.current.lock,{...liveAdjustRef.current},liveCollarWarpRef.current,liveNeckAdjustRef.current,option.src);
   if(seq===renderSeqRef.current)showBlob(out);
  }catch(e){if(seq===renderSeqRef.current){backgroundRef.current=previousPath;setBackgroundId(previousId);drawLivePreview();suppressUiError(e,'เปลี่ยนพื้นหลังไม่สำเร็จ')}}
 };
 const commitUniformSelection=option=>{
  if(option.cat==='job')setSelectedJobTemplate(option.template);
  if(option.cat==='student')setSelectedStudentTemplate(option.template);
  if(option.cat==='gown')setSelectedGownTemplate(option.template);
  if(option.cat==='government'&&option.gender==='male')setSelectedInteriorTemplate(option.template);
  setUniformCategory(option.cat);setGender(option.gender);if(option.level)setLevel(option.level);setSelectedStyle(option.title||option.name);
 };
 const selectProcessedUniform=async option=>{
  if(!allowTemplate(option.template))return;
  if(busy||hairBusy||downloadBusy||uniformChanging)return;
  if(!editCache.current){
   commitUniformSelection(option);
   setMsg('');
   return;
  }
  const previousLock=editCache.current.lock;
  setUniformChanging(true);beginProgress('กำลังเปลี่ยนชุด');setMsg('');
  let completed=false;
  try{
   clearTimeout(renderTimer.current);const seq=++renderSeqRef.current;
   const composed=await composePortrait(editCache.current.master,{scale:1,x:0,y:0},option.template);
   setProgressStage(76,'กำลังจัดตำแหน่งชุด');
   const out=await renderWithRibbon(editCache.current.master,composed.lock,{...liveAdjustRef.current},liveCollarWarpRef.current,liveNeckAdjustRef.current,backgroundRef.current);
   if(seq!==renderSeqRef.current)return;
   editCache.current={...editCache.current,lock:composed.lock};
   commitUniformSelection(option);
   // V232: V231 keeps the live canvas visible after editing. Updating only the
   // hidden PNG made a successful uniform change look like it did nothing.
   // Redraw that same visible surface using the NEW template lock, without
   // changing the slider renderer or the face/hair/skin pipeline.
   setProgressStage(97,'กำลังแสดงผล');showBlob(out);
   if(liveCanvasVisible){
    previewDirtyRef.current=true;
    drawLivePreview();
   }
   setMsg('');completed=true;
  }catch(e){editCache.current={...editCache.current,lock:previousLock};suppressUiError(e,'เปลี่ยนชุดไม่สำเร็จ')}
  finally{await finishProgress(completed);setUniformChanging(false)}
 };
 const updateBeauty=next=>{
  beautyRef.current=next;setBeauty(next);
  if(!editCache.current||!beautyBaseRef.current)return;
  ++beautyRenderRef.current;
  clearTimeout(beautyTimerRef.current);
  // Keep the original full-resolution composite on screen while processing.
  // Only one beauty job runs at a time; coalesce rapid slider updates.
  const processLatest=async()=>{
   if(beautyWorkingRef.current)return;
   beautyWorkingRef.current=true;
   try{
    while(editCache.current&&beautyBaseRef.current){
     const seq=beautyRenderRef.current;
     const base=beautyBaseRef.current;
     const values={...beautyRef.current};
     const out=await applyLocalBeauty(base,values);
     if(seq===beautyRenderRef.current&&base===beautyBaseRef.current){
      setLiveCanvasVisible(false);showBlob(out);
      break;
     }
     // Discard obsolete results instead of displaying a blurry intermediate frame.
     await new Promise(resolve=>setTimeout(resolve,0));
    }
   }catch(e){suppressUiError(e,'ปรับผิวไม่สำเร็จ')}
   finally{beautyWorkingRef.current=false}
  };
  beautyTimerRef.current=setTimeout(processLatest,0);
 };
 const openPhotoSize=async()=>{
  if(!editCache.current||busy||hairBusy||uniformChanging||downloadBusy||photoSizeBusy)return;
  setPhotoSizeBusy(true);
  try{
   const base=await renderAdjustedFinal(editCache.current.master,editCache.current.lock,{...liveAdjustRef.current},liveCollarWarpRef.current,{...liveNeckAdjustRef.current},backgroundRef.current,ribbonRef.current,{...ribbonAdjustRef.current},collarPinRef.current,{...collarPinAdjustRef.current},false,null,liveCollarHeightRef.current,chestPinRef.current,{...chestPinAdjustRef.current});
   const out=await applyLocalBeauty(base,{...beautyRef.current});
   setPhotoSizeBlob(out);
  }catch(e){suppressUiError(e,'เปิดเลือกขนาดรูปไม่สำเร็จ')}finally{setPhotoSizeBusy(false)}
 };
 const openStudio=async()=>{
  if(!editCache.current||studioBusy||busy||hairBusy||uniformChanging||downloadBusy)return;
  if(!(await verifyOutputRights(currentOutputJobRef.current)).unlocked){setTrialPreview(true);setBuyOpen(true);setPayMsg('ชำระเงินเพื่อปลดล็อก Studio และดาวน์โหลดภาพ');return;}
  const origin={master:editCache.current.master,key:JSON.stringify([editCache.current.lock,liveAdjustRef.current,liveCollarWarpRef.current,liveCollarHeightRef.current,liveNeckAdjustRef.current,backgroundRef.current,ribbonRef.current,ribbonAdjustRef.current,collarPinRef.current,collarPinAdjustRef.current,chestPinRef.current,chestPinAdjustRef.current,beautyRef.current])};
  studioOriginRef.current=origin;
  if(studioDraftRef.current?.master===origin.master&&studioDraftRef.current?.key===origin.key){setStudioData(studioDraftRef.current.layers);return;}
  setStudioBusy(true);
  try{const layers=[];await renderAdjustedFinal(editCache.current.master,editCache.current.lock,{...liveAdjustRef.current},liveCollarWarpRef.current,{...liveNeckAdjustRef.current},backgroundRef.current,ribbonRef.current,{...ribbonAdjustRef.current},collarPinRef.current,{...collarPinAdjustRef.current},false,null,liveCollarHeightRef.current,chestPinRef.current,{...chestPinAdjustRef.current},layers);
   for(const layer of layers.filter(l=>l.name==='หัว · คอ · ผม')){Object.assign(layer,{jobId:currentOutputJobRef.current,restrictedTrial:trialPreview,outputUnlocked:!trialPreview});const blob=await (await fetch(layer.source)).blob();const adjusted=await applyLocalBeauty(blob,{...beautyRef.current});layer.source=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(adjusted)})}
   setStudioData(layers);
  }catch(e){suppressUiError(e,'เปิด Studio ไม่สำเร็จ')}finally{setStudioBusy(false)}
 };
 const downloadCurrentFinal=async()=>{
  if(!editCache.current||downloadBusy||hairBusy||busy||photoSizeBusy)return;
  analyticsEvent('idprom_download_click',{is_trial:trialPreview});
  if(!(await verifyOutputRights(currentOutputJobRef.current)).unlocked){setTrialPreview(true);setBuyOpen(true);setPayMsg('ชำระเงินเพื่อปลดล็อกการดาวน์โหลดภาพความละเอียดสูง');return;}
  setDownloadBusy(true);setMsg('');
  try{
   clearTimeout(beautyTimerRef.current);++beautyRenderRef.current;
   clearTimeout(renderTimer.current);
   ++renderSeqRef.current;
   const out=await renderWithRibbon(editCache.current.master,editCache.current.lock,{...liveAdjustRef.current},liveCollarWarpRef.current,liveNeckAdjustRef.current,backgroundRef.current);
   showBlob(out);
   const downloadBlob=await cropPhotoForDownload(out,photoCrop);
   const delivery=deliverImage(downloadBlob,photoCrop.sizeId==='original'?'photo-ready.png':`photo-ready-${photoCrop.sizeId}.png`);analyticsEvent('idprom_download_requested',{size_id:photoCrop.sizeId,delivery});
  }catch(e){analyticsEvent('idprom_download_error',{error_stage:'download'});suppressUiError(e,'ดาวน์โหลดภาพไม่สำเร็จ')}finally{setDownloadBusy(false)}
 };
 const applyFinishedAiPortrait=async(aiHeadNeck,originalFile,uniformTemplate)=>{
  setProgressStage(60,'กำลังเตรียมภาพบุคคล');
  const originalHeadNeckTransparent=await removeBackgroundBlob(aiHeadNeck);
  const headNeckTransparent=await finishHairlineSeam(await optionalHealthySkin10(originalHeadNeckTransparent,originalFile));
  setProgressStage(78,'กำลังประกอบกับชุด');
  const composed=await composePortrait(headNeckTransparent,{scale:1,x:0,y:0},uniformTemplate);
  setProgressStage(88,'กำลังจัดตำแหน่งภาพ');
  initialProcessedMasterRef.current=headNeckTransparent;
  editCache.current={master:headNeckTransparent,lock:composed.lock};setLiveCanvasVisible(false);
  if(headMasterPreview)URL.revokeObjectURL(headMasterPreview);
  const masterPreviewURL=URL.createObjectURL(headNeckTransparent);setHeadMasterPreview(masterPreviewURL);setHeadPreviewLock(composed.lock);
  setHeadAdjust({scale:1,x:0,y:0,rotation:0});liveAdjustRef.current={scale:1,x:0,y:0,rotation:0};setPlacementLocked(false);lockedPlacementRef.current=null;lockedMasterRef.current=null;hairResultCacheRef.current.clear();preparedHairBaseRef.current=null;lastHairDonorRef.current=null;setCollarWarp(0);liveCollarWarpRef.current=0;setCollarHeight(0);liveCollarHeightRef.current=0;setNeckAdjust({width:0,length:0});liveNeckAdjustRef.current={width:0,length:0};
  const finished=await renderWithRibbon(headNeckTransparent,composed.lock,{scale:1,x:0,y:0},0,{width:0,length:0},backgroundRef.current);
  setProgressStage(97,'กำลังแสดงผล');showBlob(finished);
 };
 const go=async()=>{if(busy||hairBusy)return;let analyticsStage='prepare_or_submit';const analyticsStart=Date.now(),analyticsMode=rights.generationRemaining>0?'paid':'trial';analyticsEvent('idprom_process_start',{usage_mode:analyticsMode});++renderSeqRef.current;clearTimeout(renderTimer.current);setBusy(true);beginProgress('กำลังประมวลผลรูป');setMsg('');let completed=false;try{
  const jobContext={uniformTemplate:activeUniformTemplate,uniformCategory,gender,level,selectedStyle,selectedJobTemplate,selectedStudentTemplate,selectedGownTemplate,selectedInteriorTemplate};
  const aiHeadNeck=await aiFinishPortrait(f,hairId||'',{jobContext,onJobStatus:status=>{analyticsStage='poll_job';if(status==='queued')setProgressStage(18,'กำลังรอประมวลผล');else if(status==='processing')setProgressStage(42,'กำลังปรับภาพและเก็บรายละเอียด…')}});
  analyticsStage='compose';await applyFinishedAiPortrait(aiHeadNeck,f,activeUniformTemplate);analyticsStage='cleanup';
  const isTrial=Boolean(aiHeadNeck?.idpromTrial);privateTrialResultRef.current=isTrial&&privateTrialActive;setTrialPreview(isTrial);
  if(!isTrial){writeActiveAiJob(null);await clearAiJobFile()}await refreshWallet();completed=true;analyticsEvent('idprom_process_success',{usage_mode:isTrial?'trial':'paid',duration_ms:Date.now()-analyticsStart});
 }catch(e){analyticsProcessFailure(e,analyticsStage,{usage_mode:analyticsMode,duration_ms:Date.now()-analyticsStart});setMsg('ประมวลผลไม่สำเร็จ กรุณาลองกดอีกครั้ง หรือเปลี่ยนรูปหน้าตรงใหม่');const pending=readActiveAiJob();if(pending){try{const r=await fetch('/api/ai-jobs/'+encodeURIComponent(pending.jobId),{headers:walletHeaders(),cache:'no-store'});if(r.ok){const j=await r.json();if(j.status==='failed'){writeActiveAiJob(null);await clearAiJobFile()}}}catch{}}}finally{await refreshWallet();await finishProgress(completed);setBusy(false)}};
 const goForStudio=async(sourceFile,template,selectedHair)=>{if(busy||hairBusy)return;let analyticsStage='prepare_or_submit';const analyticsStart=Date.now(),analyticsMode=rights.generationRemaining>0?'paid':'trial';analyticsEvent('idprom_process_start',{usage_mode:analyticsMode});++renderSeqRef.current;clearTimeout(renderTimer.current);setBusy(true);beginProgress('กำลังประมวลผลรูป');setMsg('');let completed=false;try{
  const jobContext={uniformTemplate:template,uniformCategory,gender,level,selectedStyle,selectedJobTemplate,selectedStudentTemplate,selectedGownTemplate,selectedInteriorTemplate};
  const aiHeadNeck=await aiFinishPortrait(sourceFile,selectedHair||'',{jobContext,onJobStatus:status=>{analyticsStage='poll_job';if(status==='queued')setProgressStage(18,'กำลังรอประมวลผล');else if(status==='processing')setProgressStage(42,'กำลังปรับภาพและเก็บรายละเอียด…')}});
  analyticsStage='compose';await applyFinishedAiPortrait(aiHeadNeck,sourceFile,template);analyticsStage='cleanup';
  const isTrial=Boolean(aiHeadNeck?.idpromTrial);studioTrialRef.current=isTrial;privateTrialResultRef.current=isTrial&&privateTrialActive;setTrialPreview(isTrial);
  if(!isTrial){writeActiveAiJob(null);await clearAiJobFile()}await refreshWallet();completed=true;analyticsEvent('idprom_process_success',{usage_mode:isTrial?'trial':'paid',duration_ms:Date.now()-analyticsStart});
 }catch(e){analyticsProcessFailure(e,analyticsStage,{usage_mode:analyticsMode,duration_ms:Date.now()-analyticsStart});setMsg('ประมวลผลไม่สำเร็จ กรุณาลองกดอีกครั้ง หรือเปลี่ยนรูปหน้าตรงใหม่');const pending=readActiveAiJob();if(pending){try{const r=await fetch('/api/ai-jobs/'+encodeURIComponent(pending.jobId),{headers:walletHeaders(),cache:'no-store'});if(r.ok){const j=await r.json();if(j.status==='failed'){writeActiveAiJob(null);await clearAiJobFile()}}}catch{}}}finally{await refreshWallet();await finishProgress(completed);setBusy(false)}return completed};
 // Do not auto-resume a previous browser AI job on a fresh page load.
 // A new visit must stay idle until the user explicitly adds a photo and presses Process.
 useEffect(()=>{
  writeActiveAiJob(null);
  clearAiJobFile();
 },[]);
 useEffect(()=>{
  if(screen!=='studio'||studioData)return;
  const group=UNIFORM_GROUPS.find(g=>g.items.some(i=>i.template===activeUniformTemplate));
  const starterTemplate=allOptionsAvailable||FREE_TEMPLATE_PATHS.includes(activeUniformTemplate)?activeUniformTemplate:(group?.items[0]?.template||FREE_TEMPLATE_PATHS[0]);
  let cancelled=false;setStudioBusy(true);
  (async()=>{try{
   const [uniform,bg]=await Promise.all([loadImage(starterTemplate),loadImage('/assets/background.jpg')]);const ub=await alphaBounds(uniform),W=bg.naturalWidth,H=bg.naturalHeight;
   const uc=canvasFor(uniform.naturalWidth,uniform.naturalHeight),ux=uc.getContext('2d',{willReadFrequently:true});ux.drawImage(uniform,0,0);const ud=ux.getImageData(0,0,uc.width,uc.height).data;
   const cx0=Math.floor(uc.width*.46),cx1=Math.ceil(uc.width*.54);let socketY=ub.t;
   outer:for(let y=ub.t;y<=ub.b;y++){let opaque=0;for(let x=cx0;x<=cx1;x++)if(ud[(y*uc.width+x)*4+3]>48)opaque++;if(opaque>=(cx1-cx0+1)*.12){socketY=y;break outer}}
   const uScale=(W+4)/Math.max(1,ub.w),uW=uniform.naturalWidth*uScale,uH=uniform.naturalHeight*uScale,uX=-2-ub.l*uScale,uY=H*.425+socketY*(W*.94/uniform.naturalWidth)-socketY*uScale;
   const placement={W,H,uX,uY,uW,uH,templatePath:starterTemplate};
   const background=canvasFor(bg.naturalWidth,bg.naturalHeight),suit=canvasFor(uniform.naturalWidth,uniform.naturalHeight);background.getContext('2d').drawImage(bg,0,0);suit.getContext('2d').drawImage(uniform,0,0);
   if(!cancelled){studioOriginRef.current={starter:true,placement};setStudioData([{name:'พื้นหลัง',source:background.toDataURL(),sourceFrame:{x:0,y:0,w:900,h:1200}},{name:'ชุด',kind:'suit',templatePath:starterTemplate,source:suit.toDataURL(),sourceFrame:{x:uX/W*900,y:uY/H*1200,w:uW/W*900,h:uH/H*1200}}])}
  }catch(e){if(!cancelled)setMsg('เปิด Studio ไม่สำเร็จ กรุณาลองใหม่')}finally{if(!cancelled)setStudioBusy(false)}})();
  return()=>{cancelled=true};
 },[screen,activeUniformTemplate,studioData]);
 const restorePurchaseDraft=async()=>{
  const draft=await loadPurchaseDraft();if(!draft||draft.walletId!==currentWalletId())return;
  currentOutputJobRef.current=draft.jobId||'';currentOutputTrialRef.current=Boolean(draft.isTrial);setOutputJobId(draft.jobId||'');setTrialPreview(Boolean(draft.isTrial));studioTrialRef.current=Boolean(draft.isTrial);
  if(draft.originalFile){firstUploadedPhotoRef.current=draft.originalFile;setF(draft.originalFile);setA(URL.createObjectURL(draft.originalFile))}
  if(draft.classicMaster&&draft.classicLock){editCache.current={master:draft.classicMaster,lock:draft.classicLock};initialProcessedMasterRef.current=draft.classicMaster;setHairId(draft.hairId);}
  if(draft.studio){setRestoredSourcePhoto(draft.studio.sourcePhoto||draft.originalFile||null);studioOriginRef.current={starter:true,placement:draft.studio.placement};setScreen('studio');setStudioData(draft.studio.layers)}
  else if(draft.classicMaster&&draft.classicLock){const layers=[];await renderAdjustedFinal(draft.classicMaster,draft.classicLock,{scale:1,x:0,y:0,rotation:0},0,{width:0,length:0},backgroundRef.current,null,{},null,{},false,null,0,null,{},layers);for(const layer of layers.filter(l=>l.name==='หัว · คอ · ผม'))Object.assign(layer,{jobId:draft.jobId,restrictedTrial:draft.isTrial,outputUnlocked:!draft.isTrial});studioOriginRef.current={starter:true,placement:draft.classicLock};setScreen('studio');setStudioData(layers)}
 };
 const fullCatalog=allOptionsAvailable||Boolean(outputJobId&&(purchaseEditing&&(rights.editableJobIds.includes(outputJobId)||sessionEditJob===outputJobId)));
 const allowTemplate=(template,existing=true)=>{if(allOptionsAvailable||(existing&&outputJobId&&(purchaseEditing&&(rights.editableJobIds.includes(outputJobId)||sessionEditJob===outputJobId)))||FREE_TEMPLATE_PATHS.includes(template))return true;setPayMsg('เครดิตหมดแล้ว เลือกชุดได้หมวดละ 1 แบบต่อชาย/หญิง ซื้อแพ็ก 159 บาทเพื่อเปิดทุกแบบ');setBuyOpen(true);return false};
 const processStudioPhoto=async(file,template,selectedHair='')=>{
  // Overlap local asset downloads with the existing AI request, never submit AI twice.
  void Promise.allSettled([loadImage(backgroundRef.current),loadImage(template)]);
  pick({target:{files:[file]}});
  const success=await goForStudio(file,template,selectedHair);if(!success)throw Error('ประมวลผลไม่สำเร็จ กรุณาลองอีกครั้งหรือเปลี่ยนรูป');
  const layers=[],current=editCache.current;layers.headOnly=true;
  await renderAdjustedFinal(current.master,current.lock,{...liveAdjustRef.current},0,{width:0,length:0},backgroundRef.current,null,{},null,{},false,null,0,null,{},layers);
  const head=layers.find(l=>l.name==='หัว · คอ · ผม');head.jobId=currentOutputJobRef.current;head.restrictedTrial=studioTrialRef.current;head.outputUnlocked=!studioTrialRef.current;head.hairId=selectedHair;studioHairOriginRef.current=selectedHair;setHairId(selectedHair);hairResultCacheRef.current.set(selectedHair||'original',current.master);
  return {layer:head,placement:current.lock};
 };
 const applyStudioMakeup=async(source,styles)=>{
  return requestStudioMakeup(source,styles);
 };
 const changeStudioHair=async(id)=>{
  if(!privateTrialActive&&rights.generationRemaining<1){setBuyOpen(true);throw Error('เครดิตหมดแล้ว ซื้อแพ็ก 159 บาทเพื่อประมวลผลเพิ่ม');}
  if(!editCache.current||!firstUploadedPhotoRef.current)throw Error('เพิ่มรูปต้นฉบับและประมวลผลใน Studio ก่อนเปลี่ยนทรงผม');
  const ok=await changeHairForStudio(id);if(!ok)throw Error('เปลี่ยนทรงผมไม่สำเร็จ กรุณาลองใหม่');
  const layers=[],current=editCache.current;layers.headOnly=true;
  await renderAdjustedFinal(current.master,current.lock,{scale:1,x:0,y:0,rotation:0},0,{width:0,length:0},backgroundRef.current,null,{},null,{},false,null,0,null,{},layers);
  const head=layers.find(l=>l.name==='หัว · คอ · ผม');head.jobId=currentOutputJobRef.current;head.restrictedTrial=studioTrialRef.current;head.outputUnlocked=!studioTrialRef.current;head.hairId=id;return {layer:head};
 };
 if(screen==='home'){
  const rows=[
   {id:'popular',title:'ตัวเลือกยอดนิยม 🔥',cards:[
    {...JOB_UNIFORMS[2],title:'สูทสมัครงาน'},
    {title:'ข้าราชการ',img:'/assets/government-uniforms/female-operational-example.jpg',cat:'government',uniform:true},
    {...STUDENT_UNIFORMS[0],title:'นักศึกษา'},
    {title:'ชุดครุย',img:'/assets/hairstyle-previews/hair-20.png',cat:'gown'}]},
   {id:'job',tag:'สมัครงาน',title:'รูปสมัครงาน พร้อมใช้',cards:JOB_UNIFORMS},
   {id:'government',tag:'ข้าราชการ',title:'ชุดราชการ',cards:[
    {title:'ปฏิบัติงาน',img:'/assets/government-uniforms/female-operational-example.jpg',cat:'government',uniform:true},
    {title:'ปฏิบัติการ',img:'/assets/government-uniforms/female-academic-example.jpg',cat:'government',uniform:true},
    {title:'ชำนาญการ / อาวุโส',img:'/assets/government-uniforms/female-senior-example.jpg',cat:'government',uniform:true}]},
   {id:'student',tag:'นักศึกษา',title:'รูปนักศึกษา',cards:STUDENT_UNIFORMS},
   {id:'gown',tag:'ชุดครุย',title:'ชุดครุย สจล.',cards:GOWN_UNIFORMS}
  ];
  const visibleRows=homeFilter==='all'?rows:rows.filter(r=>r.id===homeFilter);
  const governmentLevels=[['operational','ปฏิบัติงาน'],['academic','ปฏิบัติการ'],['senior','ชำนาญการ / อาวุโส'],['government-employee','พนักงานราชการ']];
  const maleJobUniforms=JOB_UNIFORMS.filter(item=>item.gender==='male');
  const femaleJobUniforms=JOB_UNIFORMS.filter(item=>item.gender==='female');
  const chooseJobUniform=item=>{setUniformCategory('job');setSelectedJobTemplate(item.template);setGender(item.gender);setSelectedStyle(item.title);setStudioData(null);setScreen('studio')};
  const homeCategories=[
   {id:'job',icon:'/assets/category-icons/job.png',title:'สมัครงาน',desc:'ชุดสูท / เชิ้ตขาว\nสำหรับสมัครงานทั่วไป',image:'/assets/home-cutouts/job.png'},
   {id:'government',icon:'/assets/category-icons/government.png',title:'ข้าราชการ',desc:'ชุดปฏิบัติงาน\nปฏิบัติการ\nชำนาญการ\nเลือกเข็มสังกัด และแพรแถบได้เอง',image:'/assets/home-cutouts/government.png'},
   {id:'student',icon:'/assets/category-icons/student.png',title:'นักศึกษา',desc:'ชุดนักศึกษาชาย/หญิง\nมีทั้งแบบผูกไทด์\nและไม่ผูกไทด์',image:'/assets/home-cutouts/student.png'},
   {id:'gown',icon:'/assets/category-icons/gown.png',title:'ชุดครุย',desc:'ชุดครุย สจล.\nสำหรับชายและหญิง',image:null}
  ];
  const featured=[JOB_UNIFORMS[2],JOB_UNIFORMS[3],JOB_UNIFORMS[5],JOB_UNIFORMS[0],JOB_UNIFORMS[1],JOB_UNIFORMS[4],
   {...INTERIOR_UNIFORMS[0],title:'ข้าราชการชาย',cat:'government',gender:'male',img:INTERIOR_UNIFORMS[0].preview},
   {...FEMALE_GOVERNMENT_UNIFORMS[0],title:'ข้าราชการหญิง',cat:'government',gender:'female',img:FEMALE_GOVERNMENT_UNIFORMS[0].preview}].filter(item=>item&&item.img);
  const openFeatured=item=>{
   if(item.cat==='job'){chooseJobUniform(item);return}
   if(item.cat==='government'){
    setUniformCategory('government');setGender(item.gender);setLevel(item.level||'operational');
    if(item.gender==='male')setSelectedInteriorTemplate(item.img&&item.id?.startsWith('interior')?INTERIOR_UNIFORMS.find(u=>u.id===item.id)?.img||INTERIOR_UNIFORMS[0].img:INTERIOR_UNIFORMS[0].img);
    setSelectedStyle(item.name||item.title);setStudioData(null);setScreen('studio');return
   }
   setUniformCategory(item.cat);setSelectedStyle(item.title);setStudioData(null);setScreen('studio');
  };
  return <main className="profile-home studio-home"><SavedWorkUI/>
   <header className="studio-home-topbar"><div className="studio-home-brand"><img className="studio-brand-logo" src="/assets/id-phrom-logo.png" alt="IDพร้อม"/></div><div className="studio-top-actions"><CreditUI showBalance={false}/>{AuthUI()}<ContactUI/><AccountUI/></div></header>
   {homeInfoOpen&&<div className="studio-home-help" role="status">เลือกประเภทและแบบชุด → เพิ่มรูปต้นฉบับ → ประมวลผล → ปรับแต่ง → ดาวน์โหลด</div>}
   <div className="studio-home-inner"><div className="studio-home-intro"><div><h1>{homeFilter==='all'?'รูปด่วน รูปติดบัตรออนไลน์ สมจริงเหมือนถ่ายที่สตูดิโอ':homeCategories.find(c=>c.id===homeFilter)?.title||'เลือกแบบรูปถ่าย'}</h1><p>สมัครงาน · ข้าราชการ · นักศึกษา · ชุดครุย</p><p>เลือกรูปแบบที่ต้องการ แล้วสร้างรูปพร้อมใช้งานได้ง่าย ๆ</p><button type="button" className="studio-home-free-cta" onClick={()=>{setStudioData(null);setScreen('studio')}}>ทดลองฟรี <span aria-hidden="true">→</span></button></div><div className="studio-steps" aria-label="ขั้นตอนการสร้างรูป">{['เลือกประเภท','เลือกแบบ','อัปโหลดรูป','ปรับแต่ง','ดาวน์โหลด'].map((step,i)=><span key={step} className={i===(homeFilter==='all'?0:1)?'current':''}><b>{i+1}</b><small>{step}</small>{i<4&&<i aria-hidden="true">›</i>}</span>)}</div></div>
   <div className="studio-category-grid">{homeCategories.map((cat,i)=><button type="button" key={cat.id} className={'studio-category-card studio-category-'+cat.id+(homeFilter===cat.id?' chosen':'')} onClick={()=>{setUniformCategory(cat.id);setHomeFilter(cat.id);if(window.matchMedia('(max-width:1100px), (pointer:coarse) and (max-width:1366px)').matches)requestAnimationFrame(()=>homeResultsRef.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'}))}}><span className="studio-category-icon" aria-hidden="true"><img src={cat.icon} alt="" /></span><strong>{cat.title}</strong><small>{cat.desc}</small>{cat.image?<img src={cat.image} alt="" loading={i>1?'lazy':'eager'}/>:<span className="studio-gown-placeholder" aria-hidden="true">🎓</span>}<span className="studio-category-arrow" aria-hidden="true">→</span></button>)}</div>
   {homeFilter!=='all'&&<button type="button" className="studio-all-back" onClick={()=>setHomeFilter('all')}>← กลับหน้าหลัก</button>}
   {homeFilter==='all'&&<section className="studio-featured"><div className="studio-featured-head"><div><h2>▣ &nbsp; ตัวอย่างยอดนิยม</h2><p>ตัวอย่างรูปที่ลูกค้าเลือกใช้มากที่สุด</p></div><div className="studio-featured-filter" role="group" aria-label="กรองตัวอย่าง">{[['all','ทั้งหมด'],['male','ผู้ชาย'],['female','ผู้หญิง']].map(([id,name])=><button type="button" key={id} className={homeShowGender===id?'active':''} onClick={()=>setHomeShowGender(id)}>{name}</button>)}</div></div><div className="studio-featured-list">{featured.filter(c=>homeShowGender==='all'||c.gender===homeShowGender).map((c,i)=><button type="button" key={c.id||i} className="studio-featured-item" onClick={()=>openFeatured(c)}><img src={c.img} alt={c.title} loading="lazy"/>{c.cat==='government'&&<strong>{c.title}</strong>}</button>)}</div></section>}
   {homeFilter!=='all'&&<section ref={homeResultsRef} className="home-content studio-home-results">
    {homeFilter==='job'&&<section className="government-filter-panel job-gender-panel"><section className="government-gender-section"><h2 className="government-section-title">ชุดสมัครงานชาย</h2><div className="government-level-grid">{maleJobUniforms.map(item=><button type="button" key={item.id} className={gender==='male'&&selectedJobTemplate===item.template?'selected':''} onClick={()=>chooseJobUniform(item)}><img src={item.img} alt={item.title}/><span className="selected-mark">✓</span></button>)}</div></section><section className="government-gender-section female-government-section"><h2 className="government-section-title">ชุดสมัครงานหญิง</h2><div className="government-level-grid">{femaleJobUniforms.map(item=><button type="button" key={item.id} className={gender==='female'&&selectedJobTemplate===item.template?'selected':''} onClick={()=>chooseJobUniform(item)}><img src={item.img} alt={item.title}/><span className="selected-mark">✓</span></button>)}</div></section></section>}
    {homeFilter==='government'&&<section className="government-filter-panel"><section className="government-gender-section"><h2 className="government-section-title">ชุดข้าราชการชาย</h2><div className="government-level-grid">{governmentLevels.map(([id,n])=>{const u=INTERIOR_UNIFORMS.find(t=>t.level===id)||INTERIOR_UNIFORMS[0];return <button type="button" key={'male-'+id} className={gender==='male'&&level===id?'selected':''} onClick={()=>{setGender('male');setLevel(id);setSelectedInteriorTemplate(u.img);setUniformCategory('government');setSelectedStyle(n);setStudioData(null);setScreen('studio')}}><img src={u.preview} alt={'ชุดข้าราชการชาย '+n}/><strong>{n}</strong><span className="selected-mark">✓</span></button>})}</div></section><section className="government-gender-section female-government-section"><h2 className="government-section-title">ชุดข้าราชการหญิง</h2><div className="government-level-grid">{governmentLevels.map(([id,n])=>{const u=FEMALE_GOVERNMENT_UNIFORMS.find(t=>t.level===id)||FEMALE_GOVERNMENT_UNIFORMS[0];return <button type="button" key={'female-'+id} className={gender==='female'&&level===id?'selected':''} onClick={()=>{setGender('female');setLevel(id);setUniformCategory('government');setSelectedStyle(n);setStudioData(null);setScreen('studio')}}><img src={u.preview} alt={'ชุดข้าราชการหญิง '+n}/><strong>{n}</strong><span className="selected-mark">✓</span></button>})}</div></section></section>}
    {homeFilter==='gown'&&<section className="government-filter-panel">{[['male','ชาย'],['female','หญิง']].map(([g,title])=><section key={g} className={'government-gender-section'+(g==='female'?' female-government-section':'')}><h2 className="government-section-title">{title}</h2><div className="government-level-grid">{GOWN_UNIFORMS.filter(item=>item.gender===g).map(item=><button type="button" key={item.id} className={selectedGownTemplate===item.template?'selected':''} onClick={()=>{commitUniformSelection(item);setStudioData(null);setScreen('studio')}}><img src={item.img} alt={item.title}/><strong>สจล.</strong><span className="selected-mark">✓</span></button>)}</div></section>)}</section>}{homeFilter!=='government'&&homeFilter!=='job'&&homeFilter!=='gown'&&visibleRows.map(r=><HomeRow key={r.id} tag={r.tag} title={r.title} cards={r.cards}/>)}
   </section>}
   {homeFilter==='all'&&<div className="studio-home-benefits">{[['✦','ใบหน้าเดิม 100%','ไม่เปลี่ยนโครงหน้า รักษารายละเอียดผิวเดิม'],['▣','คุณภาพสตูดิโอ','คมชัด ดูเป็นธรรมชาติ ไม่เป็นพลาสติก'],['◉','ปรับแต่งได้อิสระ','ปรับตำแหน่งหัว คอเสื้อ ทรงผม พื้นหลัง แพรแถบ เข็ม'],['▧','ดาวน์โหลดความละเอียดสูง','ขนาด 900 × 1200 px ตรงกับตัวอย่าง 100%']].map(([icon,title,desc])=><div key={title}><span aria-hidden="true">{icon}</span><div><strong>{title}</strong><small>{desc}</small></div></div>)}</div>}
   </div>
  </main>;
 }
 function HomeRow({title,tag,cards}){return <section className="home-row"><div className="home-row-head"><div className="home-row-title">{tag&&<span>{tag}</span>}<h2>{title}</h2></div></div><div className="home-card-strip">{cards.map((c,i)=><button type="button" className="home-style-card" key={c.title+i} onClick={()=>{setUniformCategory(c.cat);if(c.cat==='job'&&(c.template||c.img)?.startsWith('/assets/job-uniforms/')){setSelectedJobTemplate(c.template||c.img);setGender(c.gender)}if(c.cat==='student'&&c.template?.startsWith('/assets/student-uniforms/')){setSelectedStudentTemplate(c.template);setGender(c.gender)}setSelectedStyle(c.title);setStudioData(null);setScreen('studio')}}><div className={'home-card-image '+(c.uniform?'uniform-card':'')}><img src={c.img}/><div className="home-card-shade"></div>{c.cat==='government'&&<strong>{c.title}</strong>}</div></button>)}</div></section>}
 const renderPreviewActions=(extraClass)=>( <div className={"preview-floating-actions "+extraClass}><button type="button" onClick={e=>{e.preventDefault();e.stopPropagation();setComparePreview(false);setPreviewZoom(1);setPreviewPan({x:0,y:0});applyAdjust({...initialHeadAdjustRef.current});applyCollarWarp(0);applyCollarHeight(0)}} onPointerDown={e=>e.stopPropagation()} aria-label="รีเซ็ต"><span>↻</span><small>รีเซ็ต</small></button>
<button type="button" className={comparePreview?'active':''} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.preventDefault();e.stopPropagation();setComparePreview(v=>!v)}} aria-label="เปรียบเทียบ"><span>◐</span><small>เปรียบเทียบ</small></button><button type="button" disabled={!historyCounts.undo||busy||hairBusy||uniformChanging||downloadBusy} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.preventDefault();e.stopPropagation();restoreHistory('undo')}} aria-label="ย้อนกลับ" title="ย้อนกลับการปรับครั้งล่าสุด"><span>↶</span><small>ย้อนกลับ</small></button><button type="button" disabled={!historyCounts.redo||busy||hairBusy||uniformChanging||downloadBusy} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.preventDefault();e.stopPropagation();restoreHistory('redo')}} aria-label="คืนค่าที่เพิ่งย้อนกลับ" title="คืนค่าที่เพิ่งย้อนกลับ"><span>↷</span><small>คืนค่า</small></button></div> );
 const renderProcessActions=(desktop=false)=>(<div className={"process-action-row "+(b?"processed-state":"")}><button className={"primary-action create-now process-first "+(b?"processed-hidden":"")} disabled={!f||hairId===null||busy||privateTrialChecking} onClick={go}>{busy?'กำลังประมวลผล…':privateTrialActive?'ประมวลผลรูป':rights.generationRemaining>0?'ประมวลผลรูป':'ทดลองประมวลผลฟรี'}</button>{(a||b)&&<div className="preview-file-actions">{b&&<button type="button" className="photo-size-trigger" disabled={photoSizeBusy||downloadBusy||hairBusy||busy||uniformChanging} onClick={openPhotoSize} aria-label="เลือกขนาดรูป" aria-haspopup="dialog"><span>{photoSizeBusy?'กำลังเตรียม…':PHOTO_SIZES.find(s=>s.id===photoCrop.sizeId)?.label||'ขนาดเดิม'}</span><span aria-hidden="true">⌄</span></button>}{b&&<button type="button" className="inline-download-button" disabled={downloadBusy||hairBusy||busy||uniformChanging||photoSizeBusy} onClick={downloadCurrentFinal}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/></svg><span>{downloadBusy?'กำลังสร้าง…':'ดาวน์โหลด'}</span></button>}<label htmlFor="process-photo-input" className={(busy||hairBusy||downloadBusy||uniformChanging||photoSizeBusy)?'disabled':''} aria-disabled={busy||hairBusy||downloadBusy||uniformChanging||photoSizeBusy} onClick={e=>{if(busy||hairBusy||downloadBusy||uniformChanging||photoSizeBusy){e.preventDefault();return}const input=fileInputRef.current;if(input)input.value=''}}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m5 17 4-4 3 3 3-3 4 4"/></svg><span>เปลี่ยนรูป</span></label>{desktop&&<button type="button" className="photo-guide-trigger desktop-photo-guide" onClick={()=>setPhotoGuideOpen(true)} aria-label="ดูตัวอย่างรูปที่ถูกต้อง"><span aria-hidden="true">?</span> แนะนำรูป</button>}</div>}</div>);
 if(studioData)return <><SavedWorkUI/><StudioEditor key={savedWorkRevision} savedWorkUnlocked={savedWorkUnlocked} onSaveWork={saveAccountWork} onOpenSavedWorks={()=>setSavedWorksOpen(true)} hasCredits={rights.generationRemaining>0} processRemaining={privateTrialActive?'∞':rights.generationRemaining>0?rights.generationRemaining:rights.trialAvailable===true?(rights.trialRemaining??2):0} allOptionsAvailable={allOptionsAvailable} trialUnlocked={privateTrialActive} paidOutputIds={rights.unlockedJobIds} editableOutputIds={purchaseEditing?rights.editableJobIds:[]} onVerifyOutput={verifyOutputRights} editingPurchasedImage={purchaseEditing} fullCatalog={fullCatalog} freeTemplatePaths={FREE_TEMPLATE_PATHS} purchaseSnapshotRef={paymentStudioRef} initialSourcePhoto={restoredSourcePhoto} onRequestUnlock={()=>{setPayMsg('เลือกแพ็กเกจเพื่อบันทึกและดาวน์โหลดภาพที่สร้าง');setBuyOpen(true)}} initialLayers={studioData} templates={UNIFORM_GROUPS.flatMap(g=>g.items.map(t=>({...t,group:g.name})))} collarPins={COLLAR_PIN_OPTIONS} chestPins={CHEST_PIN_OPTIONS} ribbons={RIBBON_OPTIONS} backgrounds={BACKGROUND_OPTIONS} maleHair={MALE_HAIR_OPTIONS} femaleHair={HAIR_OPTIONS} onChangeHair={changeStudioHair} onMakeup={applyStudioMakeup} placement={studioOriginRef.current?.starter?studioOriginRef.current.placement:editCache.current?.lock} onProcessPhoto={processStudioPhoto} processing={busy||hairBusy} processProgress={processProgress} onClose={layers=>{studioDraftRef.current={...studioOriginRef.current,layers};setPurchaseEditing(false);setSessionEditJob('');setSavedWorkUnlocked(false);savedWorkIdRef.current='';setStudioData(null);setScreen('home')}}/>{buyOpen&&<div className="studio-payment-dialog"><CreditUI/>{AuthUI()}</div>}</>;
 if(screen==='studio')return <main className="idstudio studio-starting"><p>{studioBusy?'กำลังเปิด Studio…':msg}</p><button onClick={()=>setScreen('home')}>กลับหน้าหลัก</button></main>;
 return <main className="app-shell modern-shell adaptive-editor" onPointerDownCapture={captureSliderPointer} onKeyDownCapture={e=>{if((e.key==='Enter'||e.key===' ')&&e.target?.closest?.('.head-adjust-row,.ribbon-option,.collar-pin-option,.background-swatch,.hair-card,.preview-floating-actions button,.placement-lock-btn'))rememberEdit()}} onContextMenu={e=>e.preventDefault()}>{photoSizeBlob&&<PhotoSizeEditor blob={photoSizeBlob} value={photoCrop} trial={trialPreview} onClose={()=>setPhotoSizeBlob(null)} onApply={crop=>{setPhotoCrop(crop);setPhotoSizeBlob(null)}}/>}<header className="mobile-topbar process-mobile-topbar editor-context-header"><button type="button" className="detail-back" onClick={()=>{setScreen('home');setHomeFilter(uniformCategory==='government'?'government':uniformCategory)}} aria-label="กลับหน้าก่อนหน้า">‹</button><div><div className="eyebrow">PHOTO READY</div><h1>{{government:'ข้าราชการ',job:'สมัครงาน',student:'นักศึกษา',gown:'ครุย'}[uniformCategory]||'สร้างรูป'}</h1></div><div className="editor-credit-actions"><AccountUI/><CreditUI showBalance={false}/>{AuthUI()}<ContactUI/></div></header><div className="editor-mobile-actions">{renderProcessActions()}</div><div className="editor-mobile-help"><button type="button" className="photo-guide-trigger" onClick={()=>setPhotoGuideOpen(true)} aria-label="ดูตัวอย่างรูปที่ถูกต้อง"><span aria-hidden="true">?</span> แนะนำรูป</button></div><section className="modern-flow">
  <section className={"style-detail-card "+((a||b)?"preview-gesture-area":"")} onPointerDown={previewAreaPointerDown} onPointerMove={previewAreaPointerMove} onPointerUp={previewAreaPointerUp} onPointerCancel={previewAreaPointerUp}><div className="detail-title process-page-title editor-preview-heading"><h2>เพิ่มรูป</h2><button type="button" className="photo-guide-trigger" onClick={()=>setPhotoGuideOpen(true)} aria-label="ดูตัวอย่างรูปที่ถูกต้อง" title="แนะนำรูปที่ถูกต้อง"><span aria-hidden="true">?</span> แนะนำรูปที่ถูกต้อง</button>{uniformCategory==='government'&&<span>{selectedStyle||'แบบที่เลือก'}</span>}</div><input id="process-photo-input" ref={fileInputRef} className="process-photo-input" type="file" accept="image/*" onChange={pick} disabled={busy||hairBusy}/>{b&&renderPreviewActions('preview-desktop-actions')}<div className="editor-workspace"><div ref={previewStageRef} className={"hero-preview preview-upload "+(b?"direct-edit-preview":"")+(trialPreview?" trial-preview-active":"")+((previewZoom!==1||previewPan.x||previewPan.y)?" preview-zoomed":"")} style={{'--preview-view-transform':`translate3d(${previewPan.x}px,${previewPan.y}px,0) scale(${previewZoom})`}} onPointerDown={previewPointerDown} onPointerMove={previewPointerMove} onPointerUp={previewPointerUp} onPointerCancel={previewPointerUp} onWheel={previewWheel} onClick={e=>{if(!a&&!b)fileInputRef.current?.click()}}>{b?<><img src={comparePreview&&a?a:b} className="editable-result-image final-render-preview" style={{visibility:liveCanvasVisible&&!comparePreview?'hidden':'visible'}}/><canvas ref={liveCanvasRef} className="live-editor-canvas" style={{display:liveCanvasVisible&&!comparePreview?'block':'none'}} aria-hidden="true"/>{trialPreview&&<div className="trial-watermark-grid" aria-hidden="true">{Array.from({length:64},(_,i)=><span key={i}>ตัวอย่าง IDพร้อม</span>)}</div>}{renderPreviewActions('preview-mobile-actions')}{!comparePreview&&<span className="preview-edit-hint">{optionTool==='ribbon'?'ลากแพรแถบเพื่อปรับ · ลากพื้นที่อื่นเพื่อเลื่อน · ใช้สองนิ้วซูม':optionTool==='head'?'แตะค้างที่หัวแล้วลากเพื่อย้าย · การซูมเหมือนเดิม':'ลากพื้นที่ว่างเพื่อเลื่อนมุมมอง · ใช้สองนิ้วซูม 20–200%'}</span>}</>:a?<><img src={a} className="source-preview"/></>:<div className="preview-empty"><span className="add-photo">+ เพิ่มรูป</span><small>JPG · PNG · WEBP</small></div>}{processProgress.active&&<div className="image-progress-overlay" role="status" aria-live="polite" onClick={e=>{e.preventDefault();e.stopPropagation()}}><div className={"image-progress-card "+(processProgress.value>=100?'is-complete':processProgress.value>=90?'is-waiting':'is-processing')}><div className="image-progress-copy"><span>{processProgress.label}</span><strong>{`${Math.round(processProgress.value)}%`}</strong></div><div className="image-progress-track" aria-hidden="true"><i style={{width:`${processProgress.value}%`}}/></div><p className="image-progress-hint">{processProgress.value>=100?'ภาพพร้อมแล้ว':processProgress.value>=99?'กำลังเก็บรายละเอียดขั้นสุดท้าย กรุณาเปิดหน้านี้ไว้':'กำลังสร้างภาพให้คุณ กรุณาเปิดหน้านี้ไว้จนเสร็จ'}</p></div></div>}</div>{b&&<div className="desktop-workspace-caption"><span>เลื่อนล้อเมาส์เพื่อซูม · ลากพื้นที่ว่างเพื่อเลื่อน</span><output>{Math.round(previewZoom*100)}%</output></div>}</div>
   <div className="quick-config">
    {uniformCategory==='government'&&<><div className="gender-tabs"><button className={gender==='male'?'active':''} onClick={()=>selectGovernmentGender('male')}>ชาย</button><button className={gender==='female'?'active':''} onClick={()=>selectGovernmentGender('female')}>หญิง</button></div><div className="level-grid">{[['operational','ปฏิบัติงาน'],['academic','ปฏิบัติการ'],['senior','ชำนาญการ / อาวุโส'],['government-employee','พนักงานราชการ']].map(([id,n])=><button type="button" key={id} className={level===id?'active':''} onClick={()=>{setLevel(id);if(gender==='male')setSelectedInteriorTemplate((INTERIOR_UNIFORMS.find(t=>t.level===id)||INTERIOR_UNIFORMS[0]).img)}}>{n}</button>)}</div></>}
    {uniformCategory!=='government'&&uniformCategory!=='gown'&&uniformCategory!=='student'&&<div className="gender-tabs"><button className={gender==='male'?'active':''} onClick={()=>setGender('male')}>ชาย</button><button className={gender==='female'?'active':''} onClick={()=>selectGovernmentGender('female')}>หญิง</button></div>}
    {uniformCategory==='gown'&&<><label className="field-label">มหาวิทยาลัย<select disabled><option>สถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง (สจล.)</option></select></label><div className="gender-tabs">{[['male','ชาย'],['female','หญิง']].map(([g,label])=><button key={g} className={gender===g?'active':''} onClick={()=>selectProcessedUniform(GOWN_UNIFORMS.find(item=>item.gender===g))}>{label}</button>)}</div></>}
   </div>
   {f&&!b&&hairId===null&&!busy&&<button type="button" className="hair-selection-guide" onClick={guideToHair}><span className="hair-selection-guide-icon" aria-hidden="true">✦</span><span><strong>เลือกทรงผมก่อนประมวลผล</strong><small>แตะที่นี่เพื่อเลือกทรงผมที่ต้องการ หรือเลือก “ผมเดิม”</small></span><span className="hair-selection-guide-arrow" aria-hidden="true">↓</span></button>}
   {b&&trialPreview&&<div className="trial-preview-notice"><strong>ตัวอย่างฟรี</strong><span>ภาพนี้เป็นตัวอย่างก่อนชำระเงิน • ดาวน์โหลดได้หลังเลือกแพ็กเกจ</span><button type="button" onClick={()=>setBuyOpen(true)}>ปลดล็อกภาพความละเอียดสูง</button></div>}<div className="editor-desktop-actions">{renderProcessActions(true)}</div>
{msg&&<div className="err photo-process-alert"><span>{msg}</span><button type="button" onClick={()=>setPhotoGuideOpen(true)}>ดูตัวอย่างรูปที่ถูกต้อง</button></div>}
{photoGuideOpen&&<div className="photo-guide-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setPhotoGuideOpen(false)}}><section className="photo-guide-modal" role="dialog" aria-modal="true" aria-label="ตัวอย่างรูปที่ถูกต้อง"><button type="button" className="photo-guide-close" onClick={()=>setPhotoGuideOpen(false)} aria-label="ปิด">×</button><img src="/assets/photo-guide.png" alt="ตัวอย่างภาพที่ระบบอาจไม่ประมวลผล และตัวอย่างภาพหน้าตรงครึ่งตัวที่ใช้ได้"/></section></div>}
<div className="editor-tool-dock">{optionTool&&optionTool!=='ribbonAdjust'&&optionTool!=='pinsAdjust'&&<div className={"tool-choice-sheet "+(optionTool==='pins'?'pin-tools-panel '+(pinPanelTab==='select'?'pin-selection-panel ':''):'')+((optionTool==='uniform'||optionTool==='male-hair'||optionTool==='female-hair'||optionTool==='background'||(optionTool==='pins'&&pinPanelTab==='select')||(optionTool==='ribbon'&&ribbonPanelTab==='select'))?"desktop-sample-panel":"desktop-adjust-panel")}><button type="button" className="mobile-tool-close" aria-label="ปิดเครื่องมือ" onClick={()=>setOptionTool(null)}>×</button>{optionTool==='pins'&&<div className="pin-panel-heading"><strong>ปรับเข็ม</strong><button type="button" aria-label="ปิดแผงเข็ม" onClick={()=>setOptionTool(null)}>×</button></div>}{optionTool==='beauty'?<div className="local-beauty-panel" role="group" aria-label="ปรับแต่งผิวโดยไม่ใช้ AI"><div className="tool-choice-tabs" role="tablist" aria-label="เครื่องมือปรับผิวและสีทาปาก"><button type="button" role="tab" aria-selected={beautyPanelTab==='skin'} className={beautyPanelTab==='skin'?'active':''} onClick={()=>setBeautyPanelTab('skin')}>ปรับผิว</button><button type="button" role="tab" aria-selected={beautyPanelTab==='lip'} className={beautyPanelTab==='lip'?'active':''} onClick={()=>setBeautyPanelTab('lip')}>สีทาปาก</button></div>{(beautyPanelTab==='skin'?[['brightness','ความสว่างผิว',0,100],['smooth','ผิวเนียน',0,100],['pink','โทนผิวอมชมพู',0,100]]:[['lip','สีทาปาก',0,100]]).map(([key,label,min,max])=><label className="beauty-control" key={key}><span><strong>{label}</strong><output>{beauty[key]>0?'+':''}{beauty[key]}%</output></span><input type="range" min={min} max={max} value={beauty[key]} onChange={e=>updateBeauty({...beauty,[key]:Number(e.target.value)})}/></label>)}{beautyPanelTab==='lip'&&<div className="beauty-lip-swatches" aria-label="เลือกสีทาปาก">{['#b87578','#ca777e','#bd5d69','#ad6b58','#a34c60','#e6a0ad','#e38caa','#d8759b','#d65b88','#f0a8ba','#c95a8b','#b94778','#e5a2a8','#dc8193'].map(color=><button key={color} type="button" title={color} aria-label={'สีทาปาก '+color} aria-pressed={beauty.lipColor===color} className={beauty.lipColor===color?'selected':''} style={{backgroundColor:color}} onClick={()=>updateBeauty({...beauty,lipColor:color})}/>)}</div>}<button className="beauty-reset" type="button" onClick={()=>updateBeauty({...DEFAULT_BEAUTY})}>↺ รีเซ็ตค่าปรับผิว</button></div>:optionTool==='head'?<div className="head-adjust-modern head-adjust-with-steps" role="group" aria-label="ปรับขนาดและตำแหน่งศีรษะ"><div className="head-adjust-row"><span className="head-adjust-glyph" title="ขนาด"><HeadAdjustGlyph type="scale"/></span><button type="button" className="head-slider-step" aria-label="ลดขนาดศีรษะ" onClick={()=>stepHeadSlider('scale',-1,20,200)}>−</button><input aria-label="ขนาดศีรษะ" type="range" min="20" max="200" step="1" value={Math.round(headAdjust.scale*100)} onChange={e=>sliderAdjust({...headAdjust,scale:Number(e.target.value)/100})}/><button type="button" className="head-slider-step" aria-label="เพิ่มขนาดศีรษะ" onClick={()=>stepHeadSlider('scale',1,20,200)}>+</button><output>{Math.round(headAdjust.scale*100)}%</output><button type="button" className="head-row-reset" onClick={()=>sliderAdjust({...headAdjust,scale:1})} aria-label="คืนค่าขนาด"><ResetGlyph/></button></div><div className="head-adjust-row"><span className="head-adjust-glyph" title="ซ้าย–ขวา"><HeadAdjustGlyph type="horizontal"/></span><button type="button" className="head-slider-step" aria-label="ลดเลื่อนซ้ายขวา" onClick={()=>stepHeadSlider('x',-0.1,-50,50)}>−</button><input aria-label="เลื่อนซ้ายขวา" type="range" min="-50" max="50" step="0.1" value={headAdjust.x*100} onChange={e=>sliderAdjust({...headAdjust,x:Number(e.target.value)/100})}/><button type="button" className="head-slider-step" aria-label="เพิ่มเลื่อนซ้ายขวา" onClick={()=>stepHeadSlider('x',0.1,-50,50)}>+</button><output>{headAdjust.x>=0?'+':''}{(headAdjust.x*100).toFixed(1)}</output><button type="button" className="head-row-reset" onClick={()=>sliderAdjust({...headAdjust,x:0})} aria-label="คืนค่าตำแหน่งซ้ายขวา"><ResetGlyph/></button></div><div className="head-adjust-row"><span className="head-adjust-glyph" title="บน–ล่าง"><HeadAdjustGlyph type="vertical"/></span><button type="button" className="head-slider-step" aria-label="ลดเลื่อนขึ้นลง" onClick={()=>stepHeadSlider('y',-0.1,-50,50)}>−</button><input aria-label="เลื่อนขึ้นลง" type="range" min="-50" max="50" step="0.1" value={-headAdjust.y*100} onChange={e=>sliderAdjust({...headAdjust,y:-Number(e.target.value)/100})}/><button type="button" className="head-slider-step" aria-label="เพิ่มเลื่อนขึ้นลง" onClick={()=>stepHeadSlider('y',0.1,-50,50)}>+</button><output>{(-headAdjust.y)>=0?'+':''}{(-headAdjust.y*100).toFixed(1)}</output><button type="button" className="head-row-reset" onClick={()=>sliderAdjust({...headAdjust,y:0})} aria-label="คืนค่าตำแหน่งบนล่าง"><ResetGlyph/></button></div><div className="head-adjust-row"><span className="head-adjust-glyph" title="เอียง"><HeadAdjustGlyph type="rotation"/></span><button type="button" className="head-slider-step" aria-label="ลดปรับองศาเอียง" onClick={()=>stepHeadSlider('rotation',-0.5,-30,30)}>−</button><input aria-label="ปรับองศาเอียง" type="range" min="-30" max="30" step="0.5" value={headAdjust.rotation||0} onChange={e=>sliderAdjust({...headAdjust,rotation:Number(e.target.value)})}/><button type="button" className="head-slider-step" aria-label="เพิ่มปรับองศาเอียง" onClick={()=>stepHeadSlider('rotation',0.5,-30,30)}>+</button><output>{(headAdjust.rotation||0)>=0?'+':''}{(headAdjust.rotation||0).toFixed(1)}°</output><button type="button" className="head-row-reset" onClick={()=>sliderAdjust({...headAdjust,rotation:0})} aria-label="คืนค่าองศาเอียง"><ResetGlyph/></button></div></div>:
optionTool==='collar'?<div className="head-adjust-modern head-adjust-with-steps collar-adjust-modern" role="group" aria-label="ปรับคอ"><div className="head-adjust-row"><span className="head-adjust-glyph" title="ปรับคอ"><HeadAdjustGlyph type="horizontal"/></span><button type="button" className="head-slider-step" aria-label="ลดหุบหรือขยายคอ" onClick={()=>applyCollarWarp(Number(stepRangeValue(Math.round(collarWarp*100),-1*1.0,-200.0,200.0))/100)}>−</button><input aria-label="หุบหรือขยายคอ" type="range" min="-200" max="200" step="1" value={Math.round(collarWarp*100)} onChange={e=>applyCollarWarp(Number(e.target.value)/100)}/><button type="button" className="head-slider-step" aria-label="เพิ่มหุบหรือขยายคอ" onClick={()=>applyCollarWarp(Number(stepRangeValue(Math.round(collarWarp*100),1*1.0,-200.0,200.0))/100)}>+</button><output>{collarWarp>=0?'+':''}{Math.round(collarWarp*100)}%</output><button type="button" className="head-row-reset" onClick={()=>applyCollarWarp(0)} aria-label="คืนค่าการปรับคอ"><ResetGlyph/></button></div><div className="head-adjust-row"><span className="head-adjust-glyph" title="ย่อหรือขยายความสูงคอเสื้อ"><HeadAdjustGlyph type="vertical"/></span><button type="button" className="head-slider-step" aria-label="ลดย่อหรือขยายความสูงคอเสื้อ" onClick={()=>applyCollarHeight(Number(stepRangeValue(Math.round(collarHeight*100),-1*1.0,-200.0,200.0))/100)}>−</button><input aria-label="ย่อหรือขยายความสูงคอเสื้อ" type="range" min="-200" max="200" step="1" value={Math.round(collarHeight*100)} onChange={e=>applyCollarHeight(Number(e.target.value)/100)}/><button type="button" className="head-slider-step" aria-label="เพิ่มย่อหรือขยายความสูงคอเสื้อ" onClick={()=>applyCollarHeight(Number(stepRangeValue(Math.round(collarHeight*100),1*1.0,-200.0,200.0))/100)}>+</button><output>{collarHeight>=0?'+':''}{Math.round(collarHeight*100)}%</output><button type="button" className="head-row-reset" onClick={()=>applyCollarHeight(0)} aria-label="คืนค่าความสูงคอเสื้อ"><ResetGlyph/></button></div></div>:
optionTool==='uniform'?<><div className="tool-choice-tabs"><span className="active">เปลี่ยนชุด</span><span>เลือกแพทเทิร์นใหม่</span></div><div className="uniform-switch-tabs">{UNIFORM_GROUPS.map(group=><button type="button" key={group.id} className={uniformPickerTab===group.id?'active':''} onClick={()=>setUniformPickerTab(group.id)}>{group.name}</button>)}</div><div className="uniform-switch-grid">{(UNIFORM_GROUPS.find(group=>group.id===uniformPickerTab)?.items||[]).map(option=><button type="button" key={option.id} className={(editCache.current?.lock?.templatePath||activeUniformTemplate)===option.template?'selected':''} disabled={uniformChanging||busy||hairBusy||downloadBusy} onClick={()=>selectProcessedUniform(option)}><img src={option.preview} alt=""/>{uniformPickerTab.startsWith('government')&&<strong>{option.title||option.name}</strong>}<span className="selected-mark">✓</span></button>)}</div></>:
optionTool==='pins'?<><div className="tool-choice-tabs ribbon-panel-tabs desktop-pin-kind-tabs" role="tablist" aria-label="เมนูเข็ม"><button type="button" role="tab" aria-selected={pinKindTab==='collar'} className={pinKindTab==='collar'?'active':''} onClick={()=>{setPinKindTab('collar');setPinPanelTab('select')}}>เข็มปกคอ</button><button type="button" role="tab" aria-selected={pinKindTab==='chest'} className={pinKindTab==='chest'?'active':''} onClick={()=>{setPinKindTab('chest');setPinPanelTab('select')}}>เข็มติดอก</button></div><div className="tool-choice-tabs ribbon-panel-tabs mobile-pin-mode-tabs" role="tablist" aria-label={pinKindTab==='chest'?'เลือกหรือปรับเข็มติดอก':'เลือกหรือปรับเข็ม'}><button type="button" role="tab" aria-selected={pinPanelTab==='select'} className={pinPanelTab==='select'?'active':''} onClick={()=>setPinPanelTab('select')}>เลือก</button><button type="button" role="tab" aria-selected={pinPanelTab==='adjust'} className={pinPanelTab==='adjust'?'active':''} onClick={()=>setPinPanelTab('adjust')}>ปรับ</button></div>{pinKindTab==='chest'?<>{pinPanelTab==='select'?<div className="choice-rail-wrap collar-pin-choice-rail-wrap" role="tabpanel"><button type="button" className="choice-rail-arrow choice-rail-left" onClick={()=>scrollChoiceRail(-1)} aria-label="เลื่อนเข็มติดอกไปทางซ้าย">‹</button><div ref={choiceRailRef} className="collar-pin-choice-preview choice-scroll-rail"><button type="button" className={'collar-pin-option '+(!chestPinId?'selected':'')} disabled={busy||hairBusy||downloadBusy} onClick={()=>selectChestPin(null)}><span className="no-pin-symbol">×</span><strong>ไม่ติดเข็ม</strong></button>{CHEST_PIN_OPTIONS.map(option=><button type="button" key={option.id} className={'collar-pin-option '+(chestPinId===option.id?'selected':'')} disabled={busy||hairBusy||downloadBusy} onClick={()=>selectChestPin(option)} aria-label={option.name} aria-pressed={chestPinId===option.id}><span className="collar-pin-pair"><img src={option.src} alt={option.name}/></span><strong>{option.name}</strong></button>)}</div><button type="button" className="choice-rail-arrow choice-rail-right" onClick={()=>scrollChoiceRail(1)} aria-label="เลื่อนเข็มติดอกไปทางขวา">›</button></div>:chestPinControls()}</>:<>{pinPanelTab==='select'?<div className="choice-rail-wrap collar-pin-choice-rail-wrap" role="tabpanel"><button type="button" className="choice-rail-arrow choice-rail-left" onClick={()=>scrollChoiceRail(-1)} aria-label="เลื่อนเข็มไปทางซ้าย">‹</button><div ref={choiceRailRef} className="collar-pin-choice-preview choice-scroll-rail"><button type="button" className={"collar-pin-option "+(!collarPinId?'selected':'')} disabled={busy||hairBusy||downloadBusy} onClick={()=>selectCollarPins(null)} aria-pressed={!collarPinId}><span className="no-pin-symbol">×</span><strong>ไม่ติดเข็ม</strong></button>{COLLAR_PIN_OPTIONS.map(option=><button type="button" key={option.id} className={"collar-pin-option "+(collarPinId===option.id?'selected':'')} disabled={busy||hairBusy||downloadBusy} onClick={()=>selectCollarPins(option)} aria-label={option.name} aria-pressed={collarPinId===option.id}><span className="collar-pin-pair"><img src={option.left} alt="เข็มซ้าย"/><img src={option.right} alt="เข็มขวา"/></span><strong>{option.name}</strong></button>)}</div><button type="button" className="choice-rail-arrow choice-rail-right" onClick={()=>scrollChoiceRail(1)} aria-label="เลื่อนเข็มไปทางขวา">›</button></div>:collarPinControls()}</>}</>:
<>{optionTool==='ribbon'?<div className="tool-choice-tabs ribbon-panel-tabs" role="tablist" aria-label="เมนูแพรแถบ"><button type="button" role="tab" aria-selected={ribbonPanelTab==='select'} className={ribbonPanelTab==='select'?'active':''} onClick={()=>setRibbonPanelTab('select')}>แพรแถบ</button><button type="button" role="tab" aria-selected={ribbonPanelTab==='adjust'} className={ribbonPanelTab==='adjust'?'active':''} onClick={()=>setRibbonPanelTab('adjust')}>ปรับ</button></div>:<div className="tool-choice-tabs"><span className="active">{optionTool==='background'?'พื้นหลัง':optionTool==='male-hair'?'ทรงผมชาย':'ทรงผมหญิง'}</span><span>{optionTool==='background'?'เลือกสีพื้นหลัง':'แตะรูปเพื่อเลือกทรง'}</span></div>}{optionTool==='background'?<div className="background-choice-preview">{BACKGROUND_OPTIONS.map(option=><button type="button" key={option.id} className={"background-swatch "+(backgroundId===option.id?"selected":"")} disabled={busy||hairBusy||downloadBusy} onClick={()=>selectBackground(option)} aria-label={option.name} aria-pressed={backgroundId===option.id}><img src={option.src} alt=""/><strong>{option.name}</strong></button>)}</div>:optionTool!=='ribbon'?<div className="choice-rail-wrap"><button type="button" className="choice-rail-arrow choice-rail-left" onClick={()=>scrollChoiceRail(-1)} aria-label="เลื่อนรายการไปทางซ้าย">‹</button><div ref={choiceRailRef} className="hair-carousel process-thumbnail-strip choice-scroll-rail"><button type="button" className={'hair-card no-hair-card '+(hairId===''?'selected':'')} disabled={hairBusy||busy} onClick={()=>changeHair('')}><span className="no-hair-icon">✓</span><span>ผมเดิม</span></button>{(optionTool==='male-hair'?MALE_HAIR_OPTIONS:HAIR_OPTIONS).map(h=><button type="button" key={h.id} className={'hair-card '+(hairId===h.id?'selected':'')} disabled={hairBusy||busy} onClick={()=>changeHair(h.id)} aria-label={h.name} title={h.name}><img src={h.src} alt={h.name}/></button>)}</div><button type="button" className="choice-rail-arrow choice-rail-right" onClick={()=>scrollChoiceRail(1)} aria-label="เลื่อนรายการไปทางขวา">›</button></div>:ribbonPanelTab==='select'?<div className="choice-rail-wrap ribbon-choice-rail-wrap" role="tabpanel"><button type="button" className="choice-rail-arrow choice-rail-left" onClick={()=>scrollChoiceRail(-1)} aria-label="เลื่อนแพรแถบไปทางซ้าย">‹</button><div ref={choiceRailRef} className="ribbon-choice-preview choice-scroll-rail"><button type="button" className={"ribbon-option "+(!ribbonId?'selected':'')} disabled={busy||hairBusy||downloadBusy} onClick={()=>selectRibbon(null)} aria-pressed={!ribbonId}>ไม่ติดแพรแถบ</button>{RIBBON_OPTIONS.map(option=><button type="button" key={option.id} className={"ribbon-option "+(ribbonId===option.id?'selected':'')} disabled={busy||hairBusy||downloadBusy} onClick={()=>selectRibbon(option)} aria-label={option.name} aria-pressed={ribbonId===option.id}><img src={option.src} alt=""/><strong>{option.name}</strong></button>)}</div><button type="button" className="choice-rail-arrow choice-rail-right" onClick={()=>scrollChoiceRail(1)} aria-label="เลื่อนแพรแถบไปทางขวา">›</button></div>:<div className="head-adjust-modern head-adjust-with-steps ribbon-modern-adjust" role="tabpanel" aria-label="ปรับแพรแถบ">{!ribbonId?<div className="ribbon-adjust-empty">เลือกแพรแถบก่อนปรับตำแหน่ง</div>:<><div className="head-adjust-row"><span className="head-adjust-glyph" title="ซ้าย–ขวา"><HeadAdjustGlyph type="horizontal"/></span><button type="button" className="head-slider-step" aria-label="ลดเลื่อนแพรแถบซ้ายขวา" onClick={()=>applyRibbonAdjust({...ribbonAdjust,x:Number(stepRangeValue(ribbonAdjust.x*100,-1*0.5,-35.0,35.0))/100})}>−</button><input aria-label="เลื่อนแพรแถบซ้ายขวา" type="range" min="-35" max="35" step=".5" value={ribbonAdjust.x*100} onChange={e=>applyRibbonAdjust({...ribbonAdjust,x:Number(e.target.value)/100})}/><button type="button" className="head-slider-step" aria-label="เพิ่มเลื่อนแพรแถบซ้ายขวา" onClick={()=>applyRibbonAdjust({...ribbonAdjust,x:Number(stepRangeValue(ribbonAdjust.x*100,1*0.5,-35.0,35.0))/100})}>+</button><output>{ribbonAdjust.x>=0?'+':''}{Math.round(ribbonAdjust.x*100)}%</output><button type="button" className="head-row-reset" onClick={()=>applyRibbonAdjust({...ribbonAdjust,x:0})} aria-label="คืนค่าตำแหน่งซ้ายขวา"><ResetGlyph/></button></div><div className="head-adjust-row"><span className="head-adjust-glyph" title="ขึ้น–ลง"><HeadAdjustGlyph type="vertical"/></span><button type="button" className="head-slider-step" aria-label="ลดเลื่อนแพรแถบขึ้นลง" onClick={()=>applyRibbonAdjust({...ribbonAdjust,y:-Number(stepRangeValue(-ribbonAdjust.y*100,-1*0.5,-35.0,35.0))/100})}>−</button><input aria-label="เลื่อนแพรแถบขึ้นลง" type="range" min="-35" max="35" step=".5" value={-ribbonAdjust.y*100} onChange={e=>applyRibbonAdjust({...ribbonAdjust,y:-Number(e.target.value)/100})}/><button type="button" className="head-slider-step" aria-label="เพิ่มเลื่อนแพรแถบขึ้นลง" onClick={()=>applyRibbonAdjust({...ribbonAdjust,y:-Number(stepRangeValue(-ribbonAdjust.y*100,1*0.5,-35.0,35.0))/100})}>+</button><output>{-ribbonAdjust.y>=0?'+':''}{Math.round(-ribbonAdjust.y*100)}%</output><button type="button" className="head-row-reset" onClick={()=>applyRibbonAdjust({...ribbonAdjust,y:0})} aria-label="คืนค่าตำแหน่งขึ้นลง"><ResetGlyph/></button></div><div className="head-adjust-row"><span className="head-adjust-glyph" title="ขนาด"><HeadAdjustGlyph type="scale"/></span><button type="button" className="head-slider-step" aria-label="ลดปรับขนาดแพรแถบ" onClick={()=>applyRibbonAdjust({...ribbonAdjust,scale:Number(stepRangeValue(ribbonAdjust.scale*100,-1*1.0,45.0,200.0))/100})}>−</button><input aria-label="ปรับขนาดแพรแถบ" type="range" min="45" max="200" step="1" value={ribbonAdjust.scale*100} onChange={e=>applyRibbonAdjust({...ribbonAdjust,scale:Number(e.target.value)/100})}/><button type="button" className="head-slider-step" aria-label="เพิ่มปรับขนาดแพรแถบ" onClick={()=>applyRibbonAdjust({...ribbonAdjust,scale:Number(stepRangeValue(ribbonAdjust.scale*100,1*1.0,45.0,200.0))/100})}>+</button><output>{Math.round(ribbonAdjust.scale*100)}%</output><button type="button" className="head-row-reset" onClick={()=>applyRibbonAdjust({...ribbonAdjust,scale:1})} aria-label="คืนค่าขนาด"><ResetGlyph/></button></div></>}</div>}</>}</div>}<div className="placement-lock-row"><button type="button" className={placementLocked?"placement-lock-btn locked":"placement-lock-btn"} disabled={!b||hairBusy} onClick={placementLocked?unlockPlacement:lockPlacement}>{placementLocked?"🔓 ปลดล็อกเพื่อแก้ตำแหน่ง":"✓ ยืนยันและล็อกตำแหน่ง"}</button>{placementLocked&&<small>หน้า · ตำแหน่งหัว · คอ ถูกล็อกไว้</small>}{hairBusy&&<small>กำลังเปลี่ยนทรงผม…</small>}</div>
<div className="desktop-persistent-selector" aria-label="เครื่องมือเลือกสำหรับเดสก์ท็อป">
<button type="button" className={desktopSelectorActive==='uniform'?'active':''} onClick={()=>{setDesktopSelectorActive('uniform');setOptionTool('uniform');setUniformPickerTab(uniformCategory==='government'?`government-${gender}`:uniformCategory)}}><span className="line-tool-icon"><img src="/app-icons/tool-uniform-change.svg" alt=""/></span><strong>แบบชุด</strong></button>
<button type="button" data-hair-guide="male-hair" className={desktopSelectorActive==='male-hair'?'active':''} onClick={()=>{setDesktopSelectorActive('male-hair');setOptionTool('male-hair')}}><span className="line-tool-icon"><img src="/app-icons/tool-3.png" alt=""/></span><strong>ทรงผมชาย</strong></button>
<button type="button" data-hair-guide="female-hair" className={desktopSelectorActive==='female-hair'?'active':''} onClick={()=>{setDesktopSelectorActive('female-hair');setOptionTool('female-hair')}}><span className="line-tool-icon"><img src="/app-icons/tool-4.png" alt=""/></span><strong>ทรงผมหญิง</strong></button>
{uniformCategory==='government'&&<button type="button" className={desktopSelectorActive==='ribbon'?'active':''} onClick={()=>{setDesktopSelectorActive('ribbon');setRibbonPanelTab('select');setOptionTool('ribbon')}}><span className="line-tool-icon"><img src="/app-icons/tool-5.png" alt=""/></span><strong>แพรแถบ</strong></button>}
{uniformCategory==='government'&&<button type="button" className={desktopSelectorActive==='pins'?'active':''} onClick={()=>{setDesktopSelectorActive('pins');setPinKindTab('collar');setPinPanelTab('select');setOptionTool('pins')}}><span className="line-tool-icon collar-pin-tool-icon"><img src="/app-icons/tool-collar-pins.png" alt=""/></span><strong>เข็ม</strong></button>}
<button type="button" className={desktopSelectorActive==='background'?'active':''} onClick={()=>{setDesktopSelectorActive('background');setOptionTool('background')}}><span className="line-tool-icon"><img src="/app-icons/tool-6.png" alt=""/></span><strong>พื้นหลัง</strong></button>
</div>
{optionTool==='ribbonAdjust'&&ribbonId&&<div className="desktop-accessory-adjust" aria-label="ปรับแพรแถบ">
 <strong className="desktop-accessory-adjust-title">ปรับแพรแถบ</strong>
 <div className="head-adjust-modern head-adjust-with-steps ribbon-modern-adjust">
  <div className="head-adjust-row"><span className="head-adjust-glyph"><HeadAdjustGlyph type="horizontal"/></span><button type="button" className="head-slider-step" onClick={()=>applyRibbonAdjust({...ribbonAdjust,x:Number(stepRangeValue(ribbonAdjust.x*100,-.5,-35,35))/100})}>−</button><input aria-label="เลื่อนแพรแถบซ้ายขวา" type="range" min="-35" max="35" step=".5" value={ribbonAdjust.x*100} onChange={e=>applyRibbonAdjust({...ribbonAdjust,x:Number(e.target.value)/100})}/><button type="button" className="head-slider-step" onClick={()=>applyRibbonAdjust({...ribbonAdjust,x:Number(stepRangeValue(ribbonAdjust.x*100,.5,-35,35))/100})}>+</button><output>{ribbonAdjust.x>=0?'+':''}{Math.round(ribbonAdjust.x*100)}%</output></div>
  <div className="head-adjust-row"><span className="head-adjust-glyph"><HeadAdjustGlyph type="vertical"/></span><button type="button" className="head-slider-step" onClick={()=>applyRibbonAdjust({...ribbonAdjust,y:-Number(stepRangeValue(-ribbonAdjust.y*100,-.5,-35,35))/100})}>−</button><input aria-label="เลื่อนแพรแถบขึ้นลง" type="range" min="-35" max="35" step=".5" value={-ribbonAdjust.y*100} onChange={e=>applyRibbonAdjust({...ribbonAdjust,y:-Number(e.target.value)/100})}/><button type="button" className="head-slider-step" onClick={()=>applyRibbonAdjust({...ribbonAdjust,y:-Number(stepRangeValue(-ribbonAdjust.y*100,.5,-35,35))/100})}>+</button><output>{-ribbonAdjust.y>=0?'+':''}{Math.round(-ribbonAdjust.y*100)}%</output></div>
  <div className="head-adjust-row"><span className="head-adjust-glyph"><HeadAdjustGlyph type="scale"/></span><button type="button" className="head-slider-step" onClick={()=>applyRibbonAdjust({...ribbonAdjust,scale:Number(stepRangeValue(ribbonAdjust.scale*100,-1,45,200))/100})}>−</button><input aria-label="ขนาดแพรแถบ" type="range" min="45" max="200" step="1" value={ribbonAdjust.scale*100} onChange={e=>applyRibbonAdjust({...ribbonAdjust,scale:Number(e.target.value)/100})}/><button type="button" className="head-slider-step" onClick={()=>applyRibbonAdjust({...ribbonAdjust,scale:Number(stepRangeValue(ribbonAdjust.scale*100,1,45,200))/100})}>+</button><output>{Math.round(ribbonAdjust.scale*100)}%</output></div>
 </div>
</div>}
{optionTool==='pinsAdjust'&&(collarPinId||chestPinId)&&<div className="desktop-accessory-adjust pin-tools-panel" aria-label="ปรับเข็ม">
 <div className="pin-panel-heading"><strong>{pinKindTab==='chest'?'ปรับเข็มติดอก':'ปรับเข็ม'}</strong><button type="button" aria-label="ปิดแผงเข็ม" onClick={()=>setOptionTool(null)}>×</button></div>
 {pinKindTab==='chest'?chestPinControls():collarPinControls()}
</div>}
<div className="desktop-adjust-only-rail" aria-label="เครื่องมือปรับสำหรับเดสก์ท็อป">
<button type="button" disabled={placementLocked} className={optionTool==='head'?'active':''} onClick={()=>toggleOptionTool('head')}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/tool-1.png" alt=""/></span><strong>ปรับหัว</strong></button>
<button type="button" disabled={placementLocked} className={optionTool==='collar'?'active':''} onClick={()=>toggleOptionTool('collar')}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/tool-2.png" alt=""/></span><strong>ปรับคอ</strong></button>
<button type="button" className={optionTool==='beauty'?'active':''} onClick={()=>toggleOptionTool('beauty')}><span className="line-tool-icon" aria-hidden="true">✧</span><strong>ปรับผิว</strong></button>
{uniformCategory==='government'&&<button type="button" className={optionTool==='ribbonAdjust'?'active':''} onClick={()=>{setRibbonPanelTab('adjust');setOptionTool(optionTool==='ribbonAdjust'?null:'ribbonAdjust')}}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/tool-5.png" alt=""/></span><strong>ปรับแพรแถบ</strong></button>}
{uniformCategory==='government'&&<button type="button" className={optionTool==='pinsAdjust'?'active':''} onClick={()=>{setPinPanelTab('adjust');setOptionTool(optionTool==='pinsAdjust'?null:'pinsAdjust')}}><span className="line-tool-icon collar-pin-tool-icon" aria-hidden="true"><img src="/app-icons/tool-collar-pins.png" alt=""/></span><strong>ปรับเข็ม</strong></button>}
</div><div className="tool-rail-wrap"><button type="button" className="tool-rail-arrow tool-rail-left" onClick={()=>scrollToolBar(-1)} aria-label="เลื่อนเครื่องมือไปทางซ้าย">‹</button><div ref={toolBarRef} className="option-icon-bar process-option-bar simple-line-tools"><button type="button" disabled={placementLocked} className={optionTool==='head'?'active':''} onClick={()=>toggleOptionTool('head')}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/tool-1.png" alt=""/></span><strong>ปรับหัว</strong></button>
<button type="button" disabled={placementLocked} className={optionTool==='collar'?'active':''} onClick={()=>toggleOptionTool('collar')}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/tool-2.png" alt=""/></span><strong>ปรับคอ</strong></button>
<button type="button" className={optionTool==='beauty'?'active':''} onClick={()=>toggleOptionTool('beauty')}><span className="line-tool-icon" aria-hidden="true">✧</span><strong>ปรับผิว</strong></button>
<button type="button" data-hair-guide="male-hair" className={(optionTool==='male-hair'?'active ':'')+(f&&!b&&hairId===null?'hair-tool-attention':'')} onClick={()=>toggleOptionTool('male-hair',()=>setGender('male'))}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/tool-3.png" alt=""/></span><strong>ทรงผมชาย</strong></button>
<button type="button" data-hair-guide="female-hair" className={(optionTool==='female-hair'?'active ':'')+(f&&!b&&hairId===null?'hair-tool-attention':'')} onClick={()=>toggleOptionTool('female-hair',()=>uniformCategory==='government'?selectGovernmentGender('female'):setGender('female'))}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/tool-4.png" alt=""/></span><strong>ทรงผมหญิง</strong></button>
{uniformCategory==='government'&&<button type="button" className={optionTool==='ribbon'?'active':''} onClick={()=>toggleOptionTool('ribbon',()=>setRibbonPanelTab('select'))}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/tool-5.png" alt=""/></span><strong>แพรแถบ</strong></button>}

{uniformCategory==='government'&&<button type="button" className={optionTool==='pins'?'active':''} onClick={()=>toggleOptionTool('pins',()=>setPinPanelTab('select'))}><span className="line-tool-icon collar-pin-tool-icon" aria-hidden="true"><img src="/app-icons/tool-collar-pins.png" alt=""/></span><strong>เข็ม</strong></button>}


<button type="button" className={optionTool==='background'?'active':''} onClick={()=>toggleOptionTool('background')}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/tool-6.png" alt=""/></span><strong>พื้นหลัง</strong></button>
<button type="button" disabled={uniformChanging} className={optionTool==='uniform'?'active':''} onClick={()=>toggleOptionTool('uniform',()=>setUniformPickerTab(uniformCategory==='government'?`government-${gender}`:uniformCategory))}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/tool-uniform-change.svg" alt=""/></span><strong>เปลี่ยนชุด</strong></button></div><button type="button" className="tool-rail-arrow tool-rail-right" onClick={()=>scrollToolBar(1)} aria-label="เลื่อนเครื่องมือไปทางขวา">›</button></div></div>
  </section>

 </section></main>
}
createRoot(document.getElementById('root')).render(<App/>);
