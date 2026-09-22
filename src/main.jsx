import React,{useEffect,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import{FilesetResolver,FaceLandmarker,ImageSegmenter}from'@mediapipe/tasks-vision';
import'./style.css';

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
function loadImage(src){return new Promise((ok,bad)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=bad;im.src=src})}
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
 const bg=await loadImage('/assets/background.jpg');
 const uniformImg=await loadImage(templatePath);
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
  const v37FinalHeadScale=0.80; // V38: reduce the FINAL placed head uniformly by an additional 20% vs V37
  let scale=canonicalScale*corrected*v37FinalHeadScale*(adjust.scale||1);
  scale=Math.max(.25,Math.min(4.0,scale));

  // ใช้ midpoint ของ landmark ซ้าย/ขวาเป็นแกนกลาง ป้องกัน alpha/hair ทำให้หัวเยื้อง
  const faceCX=((L.x+R.x)/2)*head.naturalWidth;
  const chinX=chin.x*head.naturalWidth, chinY=chin.y*head.naturalHeight;

  // สร้างคอใหม่ทั้งหมดภายหลัง: ตำแหน่งคางถูกกำหนดจากชุด ไม่ใช่คอ/ระยะต้นฉบับ
  // ช่องคอสั้นปานกลาง ลดปัญหาคอยาวและใบหน้าลอย
  // V12 FIXED NECK SOCKET: visible neck is derived from normalized head, not source neck or source crop.
  // Hard limits prevent long/thin necks. For this template the chin sits only a short anatomical gap above collar.
  // V13 COLLAR-GAP LOCK: move the normalized head down so AI never has a tall empty neck area.
  // Keep only a very small anatomical bridge between chin and the real collar edge.
  // This is intentionally template-relative and independent of the source photo/crop.
  // V14: ระยะคอคำนวณจากช่องคอกลางจริง ไม่ใช่ยอดปกเสื้อ
  // จำกัดให้เป็นคอสั้นสมส่วน และ normalize เหมือนกันทุก input โดยไม่สนขนาด/ระยะภาพต้นฉบับ
  // V15 CHIN ANCHOR: scaling must NOT pull the head upward. Keep the final chin close to the
  // real center collar socket, leaving only a small bridge for AI. Gap is proportional to final face scale.
  const finalFaceW=sourceFaceW*scale;
  // V16 HEAD+NECK PRE-PLACEMENT: ยกก้อนหัว/คอขึ้นก่อน โดยยังไม่เปลี่ยน scale
  // ต้องเหลือช่องว่างที่มองเห็นได้ระหว่างใต้คางกับขอบช่องคอของชุด เพื่อไม่ให้ปกเสื้อชนคาง
  // ระยะนี้อิง canvas/template ไม่อิง crop หรือคอจากภาพต้นฉบับ
  const targetNeckVisible=Math.max(H*.022,Math.min(H*.032,finalFaceW*.10));
  // V17: ยกก้อนหัวขึ้นอีกเล็กน้อยจากตำแหน่ง V16 หลังจากขยายหัวแล้ว
  // offset อิงความสูง canvas/template เพื่อให้ทุก input ได้ตำแหน่งเดียวกัน
  const v17Lift=H*.05;
  const chinTargetY=collarSocketY-targetNeckVisible-v17Lift;
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

async function warpUniformCollar(uniform,amount=0){
 // V53: deterministic inverse-mapped collar warp.
 // Rebuild the collar ROI from the ORIGINAL template pixels instead of drawing shifted tiles
 // over the untouched collar. This removes the duplicated lower collar/neck edge.
 if(Math.abs(amount)<.001)return uniform;
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
   sample(srcX-roiL,yy,(yy*rw+xx)*4);
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
   const skinMask=await semanticClassMask(image,W,H,[2,3]).catch(()=>null);
   const hairMask=await semanticClassMask(image,W,H,[1]).catch(()=>null);
   return {skinMask,hairMask};
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
async function gentlyWarmCheeksAndLips(image,skinMask){
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
  const j=(y*W+x)*4;if(d[j+3]<245||m[j+3]<230)continue;
  const blush=Math.min(1,cheeks.reduce((v,q)=>v+gaussian(x,y,q),0));
  const lipTint=lip?gaussian(x,y,lip):0;
  // 10% is a ceiling on a subtle color correction, NOT 10% solid pink paint.
  const r=d[j],g=d[j+1],b=d[j+2];
  // A 10% blend toward a mild healthy rosy tone; no blur, no replacement
  // texture, no change in geometry. Apply lip tint only on naturally reddish
  // lip pixels, not on the surrounding chin or face.
  const actualLip=(r>g*1.045&&r>b*1.025)?lipTint:0;
  const w=.10*Math.min(1,blush*.85+actualLip*.75);
  if(w<.001)continue;
  d[j]=Math.min(255,Math.round(r+w*38));
  d[j+1]=Math.max(0,Math.round(g-w*12));
  d[j+2]=Math.min(255,Math.round(b+w*8));
 }
 ctx.putImageData(data,0,0);return c;
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
function isolateHeadHairAndNeck(image,faceCX,chinY,semanticHairMask=null,semanticSkinMask=null){
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
 const start=Math.max(0,Math.floor(chinY-H*.012));
 // V199: retain the real AI-generated neck and clavicle field. Canvas only
 // feathers its outer alpha; it never synthesizes, stretches or repaints skin.
 const solidEnd=Math.min(H,Math.ceil(chinY+H*.64));
 const fadeEnd=Math.min(H,Math.ceil(chinY+H*.78));
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
  // V200: preserve the jaw first, taper into the middle neck, then open into
  // complete clavicles, upper shoulders and upper chest like the reference.
  // The previous monotonic corridor started too narrow and cut all of this off.
  let anatomical;
  if(neckProgress<.10){
   const q=neckProgress/.10,eased=q*q*(3-2*q);
   anatomical=W*(.190-(.015*eased));
  }else if(neckProgress<.35){
   const q=(neckProgress-.10)/.25,eased=q*q*(3-2*q);
   anatomical=W*(.175+.165*eased);
  }else{
   const q=(neckProgress-.35)/.65,eased=q*q*(3-2*q);
   anatomical=W*(.340+.120*eased);
  }
  const sideFeather=Math.max(3,W*.008);
  const sideAlpha=Math.max(0,Math.min(1,(anatomical-dist)/sideFeather));
  // V203: the MODNet master alpha already identifies the generated person.
  // Do not intersect this mandatory neck/shoulder field with the low-resolution
  // semantic skin mask: that intersection caused the blue bites on both sides.
  const neck=yy<=fadeEnd&&sideAlpha>0;
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
  // Keep only skin or confirmed hair below the jaw. Any AI-created shirt,
  // collar and lower torso are removed before the real template is applied.
  if(!neck){d[i+3]=0;continue}
  // Keep original MODNet opacity throughout the required neck fill. Semantic
  // skin classification is advisory, never allowed to cut away neck pixels.
  let alpha=sideAlpha;
  if(yy>solidEnd){
   const t=Math.max(0,Math.min(1,(yy-solidEnd)/Math.max(1,fadeEnd-solidEnd)));
   const smooth=t*t*(3-2*t);
   alpha*=1-smooth;
  }
  d[i+3]=Math.round(a*alpha);
 }
 x.clearRect(0,0,W,H);x.putImageData(out,0,0);return c;
}

async function renderAdjustedFinal(headMasterBlob,lock,adjust,collarWarp=0,neckAdjust={width:0,length:0},backgroundPath='/assets/background.jpg',ribbonPath=null,ribbonAdjust={x:0,y:0,scale:1},collarPinPair=null,collarPinAdjust={left:{x:0,y:0},right:{x:0,y:0}}){
 // V80 MASTER-RESOLUTION COMPOSITE:
 // Always render the FINAL from the untouched full-resolution transparent head master (02).
 // Never use the already-resampled 03 placed-head canvas as a source for final/export.
 const bg=await loadImage(backgroundPath),uniform=await loadImage(lock.templatePath||'/assets/uniform.png');
 const warpedUniform=await warpUniformCollar(uniform,collarWarp);
 const masterURL=URL.createObjectURL(headMasterBlob);
 try{
 const head=await loadImage(masterURL);
  const masterMasks=await getV192MasterMasks(headMasterBlob,head);
  const neckHead=await warpPersonNeck(head,lock.chinY,neckAdjust);
  // V201: lift only genuinely dark skin, capped at +12%. Correct exposure stays
  // unchanged; hair, uniform and background are never adjusted.
  // V210: gentle 20% fill-flash ceiling on existing skin pixels; no AI face redraw.
  const skinBalancedHead=await applySkinBrightness(neckHead,1.20,masterMasks.skinMask);
  const softlyEvenHead=await gentlyEvenSkin(skinBalancedHead,masterMasks.skinMask);
  const gentlyTintedHead=await gentlyWarmCheeksAndLips(softlyEvenHead,masterMasks.skinMask);
  const cleanHead=isolateHeadHairAndNeck(gentlyTintedHead,lock.faceCX,lock.chinY,masterMasks.hairMask,masterMasks.skinMask);
  const c=document.createElement('canvas');c.width=lock.W;c.height=lock.H;
  const x=c.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(bg,0,0,lock.W,lock.H);
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
  x.save();
  x.translate(centerX,centerY);
  x.rotate(rotation);
  x.drawImage(cleanHead,-drawW/2,-drawH/2,drawW,drawH);
  x.restore();
  x.drawImage(warpedUniform,lock.uX,lock.uY,lock.uW,lock.uH);
  // V180: collar insignia are a matched left/right pair anchored to each
  // government-uniform template. Female pins sit on the upper lapels; male
  // pins sit on the inner standing collar. They never move with the head.
  if(collarPinPair&&/\/government-uniforms\//.test(lock.templatePath||'')){
   const [leftPin,rightPin]=await Promise.all([loadImage(collarPinPair.left),loadImage(collarPinPair.right)]);
   const isFemale=/\/government-uniforms\/female-/.test(lock.templatePath||'');
   const pinBoxW=lock.uW*(isFemale?.078:.068);
   const drawPin=(pin,cx,cy)=>{
    const pinBoxH=pinBoxW*(pin.naturalHeight/pin.naturalWidth);
    x.drawImage(pin,cx-pinBoxW/2,cy-pinBoxH/2,pinBoxW,pinBoxH);
   };
   const leftOffset=collarPinAdjust.left||{x:0,y:0},rightOffset=collarPinAdjust.right||{x:0,y:0};
   if(isFemale){
    const y=lock.uY+lock.uH*.245;
    drawPin(leftPin,lock.uX+lock.uW*(.315+(leftOffset.x||0)),y+lock.uH*(leftOffset.y||0));
    drawPin(rightPin,lock.uX+lock.uW*(.685+(rightOffset.x||0)),y+lock.uH*(rightOffset.y||0));
   }else{
    const y=lock.uY+lock.uH*.245;
    drawPin(leftPin,lock.uX+lock.uW*(.455+(leftOffset.x||0)),y+lock.uH*(leftOffset.y||0));
    drawPin(rightPin,lock.uX+lock.uW*(.545+(rightOffset.x||0)),y+lock.uH*(rightOffset.y||0));
   }
  }
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
  return await new Promise((ok,bad)=>c.toBlob(v=>v?ok(v):bad(Error('ปรับส่วนหัวไม่สำเร็จ')),'image/png'));
 }finally{URL.revokeObjectURL(masterURL)}
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
async function removeBackgroundBlob(blob){
 return removeBackgroundRobust(blob,'ai-person.png');
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
   throw Error('ภาพฐานมีช่องว่างบริเวณใบหน้าหรือคอ กรุณาลองภาพอื่น — ยังไม่ใช้เครดิตสร้างทรงผมใหม่');
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
  const faceLock=faceProtection(face,W,H);
  const faceLockPng=await canvasPng(faceLock);
  return {
   image:new File([png],'head-only-ai-input.png',{type:'image/png'}),
   mask:new File([faceLockPng],'face-lock-mask.png',{type:'image/png'})
  };
 }finally{URL.revokeObjectURL(url)}
}
async function aiFinishPortrait(originalFile,hairId){
 // V69: send the user's original full-quality file directly to the image editor.
 // No remove.bg, crop, canvas redraw, JPEG conversion, sharpen or skin pass before AI.
 const fd=new FormData();
 const aiInput=await headOnlyAIEditFile(originalFile);
 fd.append('image',aiInput.image,aiInput.image.name);
 fd.append('mask',aiInput.mask,aiInput.mask.name);
 fd.append('mode','face-lock');
 fd.append('hairId',hairId||'original');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),120000);
 try{
  const r=await fetch('/api/ai-finish',{method:'POST',body:fd,signal:controller.signal});
  if(!r.ok) throw await responseError(r,'ประมวลผลรูปไม่สำเร็จ');
  return await r.blob();
 }catch(e){
  if(e?.name==='AbortError') throw Error('AI ใช้เวลานานเกิน 120 วินาที กรุณาลองใหม่');
  throw e;
 }finally{clearTimeout(timer)}
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
  const hard=faceProtection(pf,W,H),hx=hard.getContext('2d');
  const eyeD=Math.hypot((pf[263].x-pf[33].x)*W,(pf[263].y-pf[33].y)*H);
  hx.fillStyle='#fff';
  for(const ear of [pf[234],pf[454]]){hx.beginPath();hx.ellipse(ear.x*W,ear.y*H,eyeD*.14,eyeD*.28,0,0,Math.PI*2);hx.fill()}
  const soft=canvasFor(W,H),sx=soft.getContext('2d');
  sx.filter=`blur(${Math.max(1.5,Math.min(4,eyeD*.012))}px)`;sx.drawImage(hard,0,0);sx.filter='none';
  const originalFace=canvasFor(W,H),fx=originalFace.getContext('2d');fx.drawImage(aligned,0,0);fx.globalCompositeOperation='destination-in';fx.drawImage(soft,0,0);
  const out=canvasFor(W,H),ox=out.getContext('2d');ox.drawImage(processed,0,0);ox.drawImage(originalFace,0,0);
  return await canvasPng(out);
 }finally{URL.revokeObjectURL(pu);URL.revokeObjectURL(ou)}
}

// V207: one coherent image layer, with a restrained local unsharp-mask only on
// segmented skin. It clarifies real pore texture without pasting another face,
// reshaping landmarks, whitening skin or touching hair/background/clothing.
async function refineSkinTextureBlob(blob){
 const url=URL.createObjectURL(blob);
 try{
  const image=await loadImage(url),W=image.naturalWidth,H=image.naturalHeight;
  const skin=await semanticClassMask(image,W,H,[2,3]);
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
 }finally{URL.revokeObjectURL(url)}
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
async function requestHairstyleEngine(master,id,mask){
 const fd=new FormData();
 fd.append('image',new File([master],'head.png',{type:'image/png'}));
 fd.append('mask',new File([mask],'hair-edit-mask.png',{type:'image/png'}));
 fd.append('hairId',id);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
 try{const r=await fetch('/api/hairstyle/edit',{method:'POST',body:fd,signal:controller.signal});
  if(!r.ok)throw await responseError(r,'เปลี่ยนทรงผมไม่สำเร็จ');return await r.blob();
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
const COLLAR_PIN_OPTIONS=[
 {id:'garuda-pair',name:'มท.',left:'/assets/government-insignia/garuda-left.png',right:'/assets/government-insignia/garuda-right.png'}
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
 {id:'male-formal-tie-suit',title:'สูทชาย',img:'/assets/job-uniforms/male-formal-tie-suit-example.png',template:'/assets/job-uniforms/male-formal-tie-suit.png',cat:'job',gender:'male'},
 {id:'male-open-collar-suit',title:'สูทชายลำลอง',img:'/assets/job-uniforms/male-open-collar-suit-example.png',template:'/assets/job-uniforms/male-open-collar-suit.png',cat:'job',gender:'male'},
 {id:'female-white-shirt',title:'เชิ้ตหญิง',img:'/assets/job-uniforms/female-white-shirt-example.png',template:'/assets/job-uniforms/female-white-shirt.png',cat:'job',gender:'female'},
 {id:'male-white-shirt-v132',title:'เชิ้ตชาย',img:'/assets/job-uniforms/male-white-shirt-v132-example.png',template:'/assets/job-uniforms/male-white-shirt-v132.png',cat:'job',gender:'male'},
];

const STUDENT_UNIFORMS=[
 {id:'student-female-01',title:'นักศึกษาหญิง แบบ 1',img:'/assets/student-uniforms/previews/female-01.jpg',template:'/assets/student-uniforms/female-01.png',cat:'student',gender:'female'},
 {id:'student-female-02',title:'นักศึกษาหญิง แบบ 2',img:'/assets/student-uniforms/previews/female-02.jpg',template:'/assets/student-uniforms/female-02.png',cat:'student',gender:'female'},
 {id:'student-male-01',title:'นักศึกษาชาย แบบ 1',img:'/assets/student-uniforms/previews/male-01.jpg',template:'/assets/student-uniforms/male-01.png',cat:'student',gender:'male'},
 {id:'student-male-02',title:'นักศึกษาชาย แบบ 2',img:'/assets/student-uniforms/previews/male-02.jpg',template:'/assets/student-uniforms/male-02.png',cat:'student',gender:'male'},
];

const INTERIOR_UNIFORMS=[
 {id:'interior-01',name:'ปฏิบัติงาน',level:'operational',img:'/assets/government-uniforms/interior-01.png',preview:'/assets/government-uniforms/male-operational-example.png'},
 {id:'interior-02',name:'ปฏิบัติการ',level:'academic',img:'/assets/government-uniforms/interior-02.png',preview:'/assets/government-uniforms/male-academic-example.png'},
 {id:'interior-03',name:'ชำนาญการ / อาวุโส',level:'senior',img:'/assets/government-uniforms/interior-03.png',preview:'/assets/government-uniforms/male-senior-example.png'},
];
const FEMALE_GOVERNMENT_UNIFORMS=[
 {id:'female-operational',name:'ปฏิบัติงาน',level:'operational',img:'/assets/government-uniforms/female-operational.png',preview:'/assets/government-uniforms/female-operational-example.jpg'},
 {id:'female-academic',name:'ปฏิบัติการ',level:'academic',img:'/assets/government-uniforms/female-academic.png',preview:'/assets/government-uniforms/female-academic-example.jpg'},
 {id:'female-senior',name:'ชำนาญการ / อาวุโส',level:'senior',img:'/assets/government-uniforms/female-senior.png',preview:'/assets/government-uniforms/female-senior-example.jpg'},
];
const UNIFORM_GROUPS=[
 {id:'job',name:'สมัครงาน',items:JOB_UNIFORMS.map(item=>({...item,name:item.title,preview:item.img,template:item.template}))},
 {id:'student',name:'นักศึกษา',items:STUDENT_UNIFORMS.map(item=>({...item,name:item.title,preview:item.img,template:item.template}))},
 {id:'government-female',name:'ข้าราชการหญิง',items:FEMALE_GOVERNMENT_UNIFORMS.map(item=>({...item,title:item.name,template:item.img,cat:'government',gender:'female'}))},
 {id:'government-male',name:'ข้าราชการชาย',items:INTERIOR_UNIFORMS.map(item=>({...item,title:item.name,preview:item.preview,template:item.img,cat:'government',gender:'male'}))},
];
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

function App(){
 const[f,setF]=useState(),[a,setA]=useState(),[b,setB]=useState(),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[hairId,setHairId]=useState(null);
 const[safetyBlocked,setSafetyBlocked]=useState(false);
 const[selectedJobTemplate,setSelectedJobTemplate]=useState(JOB_UNIFORMS[0].template||JOB_UNIFORMS[0].img);
 const[selectedStudentTemplate,setSelectedStudentTemplate]=useState(STUDENT_UNIFORMS[0].template);
 const[selectedInteriorTemplate,setSelectedInteriorTemplate]=useState(INTERIOR_UNIFORMS[0].img);
 const[uniformCategory,setUniformCategory]=useState('government'),[homeFilter,setHomeFilter]=useState('all'),[screen,setScreen]=useState('home'),[selectedStyle,setSelectedStyle]=useState(''),[gender,setGender]=useState('female'),[level,setLevel]=useState('operational');
 const selectedFemaleGovernmentTemplate=FEMALE_GOVERNMENT_UNIFORMS.find(t=>t.level===level)?.img||GOVERNMENT_FINANCE_TEMPLATE;
 const selectedGovernmentTemplate=gender==='male'?selectedInteriorTemplate:selectedFemaleGovernmentTemplate;
 const selectGovernmentGender=(next)=>{setGender(next);if(next==='male'){setSelectedInteriorTemplate((INTERIOR_UNIFORMS.find(t=>t.level===level)||INTERIOR_UNIFORMS[0]).img)}};
 const activeUniformTemplate=uniformCategory==='job'?selectedJobTemplate:uniformCategory==='student'?selectedStudentTemplate:uniformCategory==='government'?selectedGovernmentTemplate:GOVERNMENT_FINANCE_TEMPLATE;
 const[headAdjust,setHeadAdjust]=useState({scale:1,x:0,y:0,rotation:0});
 const[collarWarp,setCollarWarp]=useState(0);
 const[neckAdjust,setNeckAdjust]=useState({width:0,length:0});
 const[placementLocked,setPlacementLocked]=useState(false);
 const[hairBusy,setHairBusy]=useState(false);
 const[uniformChanging,setUniformChanging]=useState(false);
 const[uniformPickerTab,setUniformPickerTab]=useState('job');
 const[processProgress,setProcessProgress]=useState({active:false,value:0,label:''});
 const progressTimerRef=useRef(null);
 const beginProgress=label=>{
  clearInterval(progressTimerRef.current);
  setProcessProgress({active:true,value:3,label});
  progressTimerRef.current=setInterval(()=>setProcessProgress(current=>{
   if(!current.active||current.value>=94)return current;
   const step=current.value<45?2:current.value<75?1:.4;
   return {...current,value:Math.min(94,current.value+step)};
  }),350);
 };
 const setProgressStage=(value,label)=>setProcessProgress(current=>({active:true,value:Math.max(current.value,value),label}));
 const finishProgress=async success=>{
  clearInterval(progressTimerRef.current);
  progressTimerRef.current=null;
  if(!success){setProcessProgress({active:false,value:0,label:''});return;}
  setProcessProgress(current=>({...current,active:true,value:100,label:'เสร็จเรียบร้อย'}));
  await new Promise(resolve=>setTimeout(resolve,280));
  setProcessProgress({active:false,value:0,label:''});
 };
 useEffect(()=>()=>{clearInterval(progressTimerRef.current);clearTimeout(gestureRef.current?.holdTimer)},[]);
 const lockedPlacementRef=useRef(null);
 const lockedMasterRef=useRef(null);
 const hairResultCacheRef=useRef(new Map()),hairRequestRef=useRef(false);
 const preparedHairBaseRef=useRef(null),lastHairDonorRef=useRef(null),cleanHairBaseRef=useRef(null),initialStyledHairRef=useRef(null);
 const[optionTool,setOptionTool]=useState(null);
 const[downloadBusy,setDownloadBusy]=useState(false);
 const[backgroundId,setBackgroundId]=useState('default');const backgroundRef=useRef('/assets/background.jpg');
 const[ribbonId,setRibbonId]=useState('');const ribbonRef=useRef(null);
 const[ribbonAdjust,setRibbonAdjust]=useState({x:0,y:0,scale:1});const ribbonAdjustRef=useRef({x:0,y:0,scale:1});
 const[collarPinId,setCollarPinId]=useState('');const collarPinRef=useRef(null);
 const[collarPinAdjust,setCollarPinAdjust]=useState({left:{x:0,y:0},right:{x:0,y:0}});const collarPinAdjustRef=useRef({left:{x:0,y:0},right:{x:0,y:0}});
 const[pinPanelTab,setPinPanelTab]=useState('select');
 const[ribbonPanelTab,setRibbonPanelTab]=useState('select');
 const ribbonDragRef=useRef(null);
 const renderWithRibbon=(...args)=>renderAdjustedFinal(...args,ribbonRef.current,ribbonAdjustRef.current,collarPinRef.current,collarPinAdjustRef.current);
 const[resultTool,setResultTool]=useState('head');
 const[previewZoom,setPreviewZoom]=useState(1);
 const[previewPan,setPreviewPan]=useState({x:0,y:0});
 const[comparePreview,setComparePreview]=useState(false);
 const[headMasterPreview,setHeadMasterPreview]=useState(null);
 const[headPreviewLock,setHeadPreviewLock]=useState(null);
 const headLayerRef=useRef(null);
 const previewStageRef=useRef(null);
 const fileInputRef=useRef(null);
 const showSafetyBlock=message=>{
  setSafetyBlocked(true);
  console.warn('Image request was blocked; original preview retained.',message||'');
  setMsg('');
 };
 const suppressUiError=(error,context)=>{console.warn(context,error);setMsg('')};
 const liveAdjustRef=useRef(headAdjust);
 const liveCollarWarpRef=useRef(collarWarp);
 const liveNeckAdjustRef=useRef(neckAdjust);
 const initialHeadAdjustRef=useRef({scale:1,x:0,y:0,rotation:0});
 const rafRef=useRef(0);
 const toolBarRef=useRef(null);
 const choiceRailRef=useRef(null);
 const toggleOptionTool=(name,beforeOpen)=>{setOptionTool(current=>{const next=current===name?null:name;if(next&&beforeOpen)beforeOpen();return next})};
 const scrollToolBar=direction=>{const el=toolBarRef.current;if(!el)return;el.scrollBy({left:direction*Math.max(180,el.clientWidth*.55),behavior:'smooth'})};
 const scrollChoiceRail=direction=>{const el=choiceRailRef.current;if(!el)return;el.scrollBy({left:direction*Math.max(180,el.clientWidth*.72),behavior:'smooth'})};
 const gestureRef=useRef({pointers:new Map(),drag:false,pending:false,holdTimer:null,primary:null,x:0,y:0,downX:0,downY:0,startAdjust:null,pinch:false,distance:0,zoom:1,midX:0,midY:0,startPan:{x:0,y:0}});
 const viewGestureRef=useRef({pointers:new Map(),drag:false,pinch:false,x:0,y:0,distance:0,startZoom:1,startPan:{x:0,y:0},midX:0,midY:0});
 useEffect(()=>{if(b&&toolBarRef.current)toolBarRef.current.scrollLeft=0},[b]);
 useEffect(()=>{if(!optionTool)return;const dismiss=e=>{const t=e.target;if(t?.closest?.('.tool-choice-sheet,.process-option-bar,.tool-rail-arrow,.direct-edit-preview'))return;setOptionTool(null)};document.addEventListener('pointerdown',dismiss,true);return()=>document.removeEventListener('pointerdown',dismiss,true)},[optionTool]);
 const renderTimer=useRef(null);
 const adjustRenderBusyRef=useRef(false);
 const pendingAdjustRef=useRef(null);
 const transparentCache=useRef({key:'',blob:null}), editCache=useRef(null), resultUrl=useRef('');
 const showBlob=blob=>{if(resultUrl.current)URL.revokeObjectURL(resultUrl.current);resultUrl.current=URL.createObjectURL(blob);setB(resultUrl.current)};
 const pick=e=>{const v=e.target.files?.[0];if(v){setSafetyBlocked(false);ribbonRef.current=null;setRibbonId('');ribbonAdjustRef.current={x:0,y:0,scale:1};setRibbonAdjust(ribbonAdjustRef.current);collarPinAdjustRef.current={left:{x:0,y:0},right:{x:0,y:0}};setCollarPinAdjust(collarPinAdjustRef.current);backgroundRef.current='/assets/background.jpg';setBackgroundId('default');if(headMasterPreview)URL.revokeObjectURL(headMasterPreview);setHeadMasterPreview(null);setHeadPreviewLock(null);transparentCache.current={key:'',blob:null};editCache.current=null;initialHeadAdjustRef.current={scale:1,x:0,y:0,rotation:0};setHeadAdjust(initialHeadAdjustRef.current);liveAdjustRef.current={...initialHeadAdjustRef.current};setPlacementLocked(false);lockedPlacementRef.current=null;lockedMasterRef.current=null;hairResultCacheRef.current.clear();preparedHairBaseRef.current=null;lastHairDonorRef.current=null;cleanHairBaseRef.current=null;initialStyledHairRef.current=null;setCollarWarp(0);liveCollarWarpRef.current=0;setNeckAdjust({width:0,length:0});liveNeckAdjustRef.current={width:0,length:0};setPlacementLocked(false);lockedPlacementRef.current=null;setPreviewZoom(1);setPreviewPan({x:0,y:0});setComparePreview(false);setF(v);setA(URL.createObjectURL(v));setB();setMsg('')}};
 const applyAdjust=async next=>{if(placementLocked)return;liveAdjustRef.current=next;paintHeadTransform?.(next);setHeadAdjust(next);if(!editCache.current)return;try{const out=await renderWithRibbon(editCache.current.master,editCache.current.lock,next,liveCollarWarpRef.current,liveNeckAdjustRef.current,backgroundRef.current);showBlob(out)}catch(e){suppressUiError(e,'ปรับส่วนหัวไม่สำเร็จ')}};
 const nudge=(k,d)=>{const v={...headAdjust,[k]:headAdjust[k]+d};if(k==='scale')v.scale=Math.max(.20,Math.min(2.00,v.scale));applyAdjust(v)};
 const applyCollarWarp=amount=>{if(placementLocked)return;const v=Math.max(-1.6,Math.min(1.2,amount));liveCollarWarpRef.current=v;setCollarWarp(v);if(editCache.current)paintHeadTransform({...liveAdjustRef.current})};
 const autoFitCollar=()=>{const target=Math.max(-.35,Math.min(.35,(headAdjust.scale-1)*.9));applyCollarWarp(target)};
 const applyNeckAdjust=async next=>{if(placementLocked)return;const v={width:Math.max(-1,Math.min(1,next.width||0)),length:Math.max(-1,Math.min(1,next.length||0))};liveNeckAdjustRef.current=v;setNeckAdjust(v);if(!editCache.current)return;const seq=++renderSeqRef.current;try{const out=await renderWithRibbon(editCache.current.master,editCache.current.lock,{...liveAdjustRef.current},liveCollarWarpRef.current,v,backgroundRef.current);if(seq===renderSeqRef.current)showBlob(out)}catch(e){if(seq===renderSeqRef.current)suppressUiError(e,'ปรับคอไม่สำเร็จ')}};
 const headTransformCss=(adj=liveAdjustRef.current)=>{
  const lock=headPreviewLock;if(!lock)return '';
  const s=adj.scale||1,rot=adj.rotation||0,stage=previewStageRef.current;
  const dx=(adj.x||0)*(stage?.clientWidth||0),dy=(adj.y||0)*(stage?.clientHeight||0);
  return `translate3d(${dx}px,${dy}px,0) rotate(${rot}deg) scale(${s})`;
 };
 const renderSeqRef=useRef(0);
 const commitAdjust=async next=>{
  liveAdjustRef.current=next;setHeadAdjust(next);
  if(!editCache.current)return;
  if(adjustRenderBusyRef.current){pendingAdjustRef.current={...next};return}
  adjustRenderBusyRef.current=true;
  let current={...next};
  try{
   while(current){
    pendingAdjustRef.current=null;
    const seq=++renderSeqRef.current;
    const out=await renderWithRibbon(editCache.current.master,editCache.current.lock,current,liveCollarWarpRef.current,liveNeckAdjustRef.current,backgroundRef.current);
    if(!pendingAdjustRef.current&&seq===renderSeqRef.current)showBlob(out);
    current=pendingAdjustRef.current;
   }
  }catch(e){suppressUiError(e,'ปรับส่วนหัวไม่สำเร็จ')}
  finally{adjustRenderBusyRef.current=false;if(pendingAdjustRef.current){const latest=pendingAdjustRef.current;pendingAdjustRef.current=null;commitAdjust(latest)}}
 };
 // V85 SINGLE-RENDERER EDITOR: the bitmap visible in Preview is produced by the
 // exact same renderAdjustedFinal() used by Download. No CSS-only head layer remains.
 const paintHeadTransform=next=>{
  liveAdjustRef.current=next;setHeadAdjust(next);
  if(renderTimer.current)return;
  renderTimer.current=setTimeout(()=>{renderTimer.current=null;commitAdjust({...liveAdjustRef.current})},34);
 };
 const scheduleAdjust=next=>paintHeadTransform(next);
 const sliderAdjust=next=>paintHeadTransform(next);
 const clampPreviewPan=(pan,zoom=previewZoom)=>{const stage=previewStageRef.current;const maxX=(stage?.clientWidth||0)*Math.abs(zoom-1)/2,maxY=(stage?.clientHeight||0)*Math.abs(zoom-1)/2;return{x:Math.max(-maxX,Math.min(maxX,pan.x)),y:Math.max(-maxY,Math.min(maxY,pan.y))}};
 const setPreviewViewZoom=next=>{const zoom=Math.max(.2,Math.min(2,next));setPreviewZoom(zoom);setPreviewPan(current=>clampPreviewPan(current,zoom))};
 const previewCanvasPoint=e=>{const rect=e.currentTarget.getBoundingClientRect(),lock=editCache.current?.lock;return !lock?null:{rect,lock,x:(e.clientX-rect.left)/rect.width*lock.W,y:(e.clientY-rect.top)/rect.height*lock.H}};
 const isHeadTouch=e=>{if(!b||comparePreview||placementLocked||optionTool!=='head')return false;const p=previewCanvasPoint(e);if(!p)return false;const {lock,x,y}=p,adj=liveAdjustRef.current,s=adj.scale||1,baseW=lock.headW*lock.scale,baseH=lock.headH*lock.scale,cx=lock.hX+baseW/2+(adj.x||0)*lock.W,cy=lock.hY+baseH/2+(adj.y||0)*lock.H;return x>=cx-baseW*s*.52&&x<=cx+baseW*s*.52&&y>=cy-baseH*s*.52&&y<=cy+baseH*s*.38};
 const beginViewGesture=e=>{e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture?.(e.pointerId);const v=viewGestureRef.current;if(!v.pointers)v.pointers=new Map();v.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(v.pointers.size===1){v.drag=true;v.pinch=false;v.x=e.clientX;v.y=e.clientY;v.startPan={...previewPan}}else{const pts=[...v.pointers.values()].slice(0,2);v.drag=false;v.pinch=true;v.distance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);v.startZoom=previewZoom;v.startPan={...previewPan};v.midX=(pts[0].x+pts[1].x)/2;v.midY=(pts[0].y+pts[1].y)/2}};
 const previewPointerDown=e=>{
  if(optionTool==='ribbon'&&ribbonRef.current&&b&&!comparePreview){
   const rect=e.currentTarget.getBoundingClientRect();
   const lock=editCache.current?.lock;
   if(!lock)return;
   const px=(e.clientX-rect.left)/rect.width*lock.W,py=(e.clientY-rect.top)/rect.height*lock.H;
   const v=ribbonAdjustRef.current,w=lock.uW*.205*v.scale,h=w*(2/7);
   const cx=lock.uX+lock.uW*(.73+v.x),top=lock.uY+lock.uH*(.495+v.y);
   if(px<cx-w*.8||px>cx+w*.8||py<top-h||py>top+h*2){beginViewGesture(e);return}
   e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture?.(e.pointerId);
   ribbonDragRef.current={id:e.pointerId,x:e.clientX,y:e.clientY,start:{...v}};return;
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
  else if(g.pointers.size===2){clearTimeout(g.holdTimer);g.pending=false;const pts=[...g.pointers.values()];g.pinch=true;g.drag=false;g.distance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);g.startAdjust={...liveAdjustRef.current};g.midX=(pts[0].x+pts[1].x)/2;g.midY=(pts[0].y+pts[1].y)/2}
 };
 const previewPointerMove=e=>{
  const v=viewGestureRef.current;
  if(v.pointers?.has(e.pointerId)){
   e.preventDefault();v.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(v.pointers.size>=2&&v.pinch){const pts=[...v.pointers.values()].slice(0,2),distance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),midX=(pts[0].x+pts[1].x)/2,midY=(pts[0].y+pts[1].y)/2,zoom=Math.max(.2,Math.min(2,v.startZoom*distance/Math.max(1,v.distance)));setPreviewZoom(zoom);setPreviewPan(clampPreviewPan({x:v.startPan.x+(midX-v.midX),y:v.startPan.y+(midY-v.midY)},zoom))}
   else if(v.drag&&v.pointers.size===1){setPreviewPan(clampPreviewPan({x:v.startPan.x+(e.clientX-v.x),y:v.startPan.y+(e.clientY-v.y)},previewZoom))}
   return;
  }
  const drag=ribbonDragRef.current;
  if(drag&&drag.id===e.pointerId){e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();const lock=editCache.current?.lock;if(lock)applyRibbonAdjust({...drag.start,x:drag.start.x+(e.clientX-drag.x)/rect.width*lock.W/lock.uW,y:drag.start.y+(e.clientY-drag.y)/rect.height*lock.H/lock.uH});return;}
  const g=gestureRef.current;if(!g.pointers?.has(e.pointerId)||(optionTool&&optionTool!=='head'))return;
  e.preventDefault();g.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const rect=e.currentTarget.getBoundingClientRect();
  if(g.pointers.size>=2&&g.pinch){const pts=[...g.pointers.values()].slice(0,2),dist=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),mx=(pts[0].x+pts[1].x)/2,my=(pts[0].y+pts[1].y)/2;const ratio=dist/Math.max(1,g.distance);const scale=Math.max(.20,Math.min(2,g.startAdjust.scale*ratio));const next={...g.startAdjust,scale,x:g.startAdjust.x+(mx-g.midX)/rect.width,y:g.startAdjust.y+(my-g.midY)/rect.height};paintHeadTransform(next)}
  else if(g.pending&&e.pointerId===g.primary){if(Math.hypot(e.clientX-g.downX,e.clientY-g.downY)>10){clearTimeout(g.holdTimer);g.pending=false}return}
  else if(g.drag&&e.pointerId===g.primary){const next={...g.startAdjust,x:g.startAdjust.x+(e.clientX-g.x)/rect.width,y:g.startAdjust.y+(e.clientY-g.y)/rect.height};paintHeadTransform(next)}
 };
 const previewPointerUp=e=>{
  const v=viewGestureRef.current;
  if(v.pointers?.has(e.pointerId)){
   e.preventDefault();v.pointers.delete(e.pointerId);
   if(v.pointers.size===0){v.drag=false;v.pinch=false}
   else if(v.pointers.size===1){const [,point]=[...v.pointers.entries()][0];v.drag=true;v.pinch=false;v.x=point.x;v.y=point.y;v.startPan={...previewPan}}
   return;
  }
  if(ribbonDragRef.current?.id===e.pointerId){e.preventDefault();ribbonDragRef.current=null;return;}
  const g=gestureRef.current;if(!g.pointers?.has(e.pointerId))return;
  e.preventDefault();clearTimeout(g.holdTimer);g.holdTimer=null;g.pointers.delete(e.pointerId);
  if(g.pointers.size===0){const changed=g.drag||g.pinch;g.drag=false;g.pending=false;g.pinch=false;if(changed)commitAdjust({...liveAdjustRef.current})}
  else if(g.pointers.size===1){g.drag=false;g.pending=false;g.pinch=false;g.primary=[...g.pointers.keys()][0]}
 };
 const previewWheel=e=>{if(a||b){e.preventDefault();setPreviewViewZoom(previewZoom*Math.exp(-e.deltaY*.0015))}};
 // Kept only for compatibility with the hidden legacy row in this build.
 const lockPlacement=()=>{};
 const unlockPlacement=()=>{};
 const changeHair=async id=>{
  if(hairRequestRef.current||hairBusy||busy)return;
  if(!editCache.current){setHairId(id);return;}
  // V216: re-edit the immutable approved first-pass head, NOT the raw upload
  // or a previously edited hairstyle. Keep the editor placement/template unchanged.
  clearTimeout(renderTimer.current);
  ++renderSeqRef.current;
  lockedPlacementRef.current={adjust:{...liveAdjustRef.current},collarWarp:liveCollarWarpRef.current,neckAdjust:{...liveNeckAdjustRef.current}};
  if(!lockedMasterRef.current){
   lockedMasterRef.current=initialStyledHairRef.current||editCache.current.master;
   preparedHairBaseRef.current=null;lastHairDonorRef.current=null;hairResultCacheRef.current.clear();
  }
  hairRequestRef.current=true;setHairBusy(true);beginProgress('กำลังเปลี่ยนทรงผม');setMsg('กำลังเปลี่ยนเฉพาะทรงผม โดยคงตำแหน่งปัจจุบันไว้…');
  let completed=false;
  try{
   const snap=lockedPlacementRef.current||{adjust:{...liveAdjustRef.current},collarWarp:liveCollarWarpRef.current,neckAdjust:{...liveNeckAdjustRef.current}};
   // Every hairstyle starts from the SAME immutable master. Results never
   // become the source for another AI request, preventing accumulated drift.
   const src=lockedMasterRef.current||initialStyledHairRef.current||editCache.current.master;
   let nextMaster;
   if(!id){
    nextMaster=initialStyledHairRef.current||src;setProgressStage(78,'กำลังคืนทรงเริ่มต้น');
   }else{
    setMsg('กำลังเปลี่ยนทรงผมจากภาพรอบแรก โดยล็อกผิวและใบหน้าเดิม…');
    const cached=hairResultCacheRef.current.get(id);
    if(cached){nextMaster=cached;setProgressStage(78,'กำลังใช้ทรงผมที่บันทึกไว้');setMsg('นำผลทรงผมที่ผ่านการล็อกใบหน้าแล้วกลับมาใช้ · ไม่เสียเครดิตซ้ำ');}
    else{
     // V216: use the APPROVED first-pass portrait as the image authority.
     // Re-editing the raw upload re-runs beauty/lighting decisions and changes skin.
     // The immutable first pass already has the correct face, complexion and neck.
     const firstPass=initialStyledHairRef.current;
     if(!firstPass)throw Error('ไม่พบภาพรอบแรกที่ใช้ล็อกผิว กรุณาประมวลผลภาพใหม่');
     const firstPassFile=new File([firstPass],'approved-first-pass.png',{type:'image/png'});
     setProgressStage(38,'กำลังเปลี่ยนเฉพาะผมจากภาพรอบแรกที่ผิวถูกต้อง');
     const aiHeadNeck=await aiFinishPortrait(firstPassFile,id);
     setProgressStage(65,'กำลังลบพื้นหลัง');
     const removedHeadNeck=await removeBackgroundBlob(aiHeadNeck);
     setProgressStage(78,'กำลังคืนผิวและรายละเอียดใบหน้าจากภาพรอบแรก');
     // A prompt/mask alone is not a pixel lock: restore photographed skin
     // from the approved image AFTER the AI edit and background removal.
     // Do not run the skin sharpening pass a second time.
     nextMaster=await restoreOriginalFacePixels(removedHeadNeck,firstPassFile);
     // Cache only successfully processed images. Never cache errors or intermediate AI output.
     hairResultCacheRef.current.set(id,nextMaster);
    }
   }
   // Keep the immutable locked master separate. editCache.master is only the currently
   // displayed hairstyle result and is never used as the source for the next hairstyle.
   const out=await renderWithRibbon(nextMaster,editCache.current.lock,snap.adjust,snap.collarWarp,snap.neckAdjust,backgroundRef.current);
   setProgressStage(97,'กำลังแสดงผล');
   // Invalidate editor renders started before the new hairstyle was selected.
   ++renderSeqRef.current;
   // Commit only after the new composite and final render have both succeeded.
   editCache.current={...editCache.current,master:nextMaster};
   liveAdjustRef.current={...snap.adjust};setHeadAdjust({...snap.adjust});
   liveCollarWarpRef.current=snap.collarWarp;setCollarWarp(snap.collarWarp);
   liveNeckAdjustRef.current={...snap.neckAdjust};setNeckAdjust({...snap.neckAdjust});
   showBlob(out);setHairId(id);setMsg('เปลี่ยนทรงผมแล้ว · คืนผิวใบหน้าจากภาพรอบแรกและคงตำแหน่งเดิม');completed=true;
  }catch(e){if(e?.code==='IMAGE_SAFETY_BLOCK')showSafetyBlock(e.message);else suppressUiError(e,'เปลี่ยนทรงผมไม่สำเร็จ')}finally{await finishProgress(completed);hairRequestRef.current=false;setHairBusy(false)}
 };
 const downloadHairDonor=()=>{
  const blob=lastHairDonorRef.current;
  if(!blob){setMsg('ยังไม่มีภาพทรงผมจาก AI ให้ตรวจ');return;}
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='selected-hair-ai-v100.png';document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const downloadCleanHead=()=>{
  const prepared=preparedHairBaseRef.current;
  if(!prepared?.blob){setMsg('ยังไม่มีภาพฐาน Clean Head — ล็อกตำแหน่งและลองเลือกทรงผมก่อน');return;}
  const url=URL.createObjectURL(prepared.blob),link=document.createElement('a');
  link.href=url;link.download='clean-head-master-v100.png';document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const applyRibbonAdjust=next=>{
  const v={x:Math.max(-.35,Math.min(.35,next.x)),y:Math.max(-.35,Math.min(.35,next.y)),scale:Math.max(.45,Math.min(2,next.scale))};
  ribbonAdjustRef.current=v;setRibbonAdjust(v);
  clearTimeout(renderTimer.current);
  const seq=++renderSeqRef.current;
  renderTimer.current=setTimeout(async()=>{
   if(!editCache.current||!ribbonRef.current)return;
   try{const out=await renderWithRibbon(editCache.current.master,editCache.current.lock,{...liveAdjustRef.current},liveCollarWarpRef.current,liveNeckAdjustRef.current,backgroundRef.current);if(seq===renderSeqRef.current)showBlob(out)}
   catch(e){if(seq===renderSeqRef.current)suppressUiError(e,'ปรับแพรแถบไม่สำเร็จ')}
  },20);
 };
 const selectRibbon=async option=>{
  if(busy||hairBusy||downloadBusy)return;
  const previous=ribbonRef.current,previousId=ribbonId;
  ribbonRef.current=option?.src||null;setRibbonId(option?.id||'');
  if(!editCache.current)return;
  const seq=++renderSeqRef.current;clearTimeout(renderTimer.current);
  try{
   const out=await renderWithRibbon(editCache.current.master,editCache.current.lock,{...liveAdjustRef.current},liveCollarWarpRef.current,liveNeckAdjustRef.current,backgroundRef.current);
   if(seq===renderSeqRef.current)showBlob(out);
  }catch(e){if(seq===renderSeqRef.current){ribbonRef.current=previous;setRibbonId(previousId);suppressUiError(e,'เปลี่ยนแพรแถบไม่สำเร็จ')}}
 };
 const selectCollarPins=async option=>{
  if(busy||hairBusy||downloadBusy)return;
  const previous=collarPinRef.current,previousId=collarPinId;
  collarPinRef.current=option?{left:option.left,right:option.right}:null;setCollarPinId(option?.id||'');
  if(!editCache.current){setMsg(option?'เลือกเข็มคู่แล้ว · ระบบจะวางตามชุดชายหรือหญิงเมื่อประมวลผล':'เลือกไม่ติดเข็มแล้ว');return;}
  const seq=++renderSeqRef.current;clearTimeout(renderTimer.current);
  try{
   const out=await renderWithRibbon(editCache.current.master,editCache.current.lock,{...liveAdjustRef.current},liveCollarWarpRef.current,liveNeckAdjustRef.current,backgroundRef.current);
   if(seq===renderSeqRef.current){showBlob(out);setMsg(option?'วางเข็มซ้าย–ขวาตามตำแหน่งปกเสื้อแล้ว':'นำเข็มออกแล้ว')}
  }catch(e){if(seq===renderSeqRef.current){collarPinRef.current=previous;setCollarPinId(previousId);suppressUiError(e,'วางเข็มไม่สำเร็จ')}}
 };
 const applyCollarPinAdjust=next=>{
  const clampSide=side=>({x:Math.max(-.2,Math.min(.2,side?.x||0)),y:Math.max(-.2,Math.min(.2,side?.y||0))});
  const v={left:clampSide(next.left),right:clampSide(next.right)};
  collarPinAdjustRef.current=v;setCollarPinAdjust(v);
  clearTimeout(renderTimer.current);const seq=++renderSeqRef.current;
  renderTimer.current=setTimeout(async()=>{
   if(!editCache.current||!collarPinRef.current)return;
   try{const out=await renderWithRibbon(editCache.current.master,editCache.current.lock,{...liveAdjustRef.current},liveCollarWarpRef.current,liveNeckAdjustRef.current,backgroundRef.current);if(seq===renderSeqRef.current)showBlob(out)}
   catch(e){if(seq===renderSeqRef.current)suppressUiError(e,'ปรับตำแหน่งเข็มไม่สำเร็จ')}
  },20);
 };
 const pinSideControls=(side,label)=>{const value=collarPinAdjust[side];return <section className="pin-side-adjust"><strong>{label}</strong><div className="head-adjust-row"><span className="head-adjust-glyph" title="ซ้าย–ขวา"><HeadAdjustGlyph type="horizontal"/></span><input aria-label={`${label} เลื่อนซ้ายขวา`} type="range" min="-20" max="20" step=".5" value={value.x*100} onChange={e=>applyCollarPinAdjust({...collarPinAdjust,[side]:{...value,x:Number(e.target.value)/100}})}/><output>{value.x>=0?'+':''}{Math.round(value.x*100)}%</output><button type="button" className="head-row-reset" onClick={()=>applyCollarPinAdjust({...collarPinAdjust,[side]:{...value,x:0}})} aria-label={`${label} คืนค่าซ้ายขวา`}><ResetGlyph/></button></div><div className="head-adjust-row"><span className="head-adjust-glyph" title="ขึ้น–ลง"><HeadAdjustGlyph type="vertical"/></span><input aria-label={`${label} เลื่อนขึ้นลง`} type="range" min="-20" max="20" step=".5" value={-value.y*100} onChange={e=>applyCollarPinAdjust({...collarPinAdjust,[side]:{...value,y:-Number(e.target.value)/100}})}/><output>{-value.y>=0?'+':''}{Math.round(-value.y*100)}%</output><button type="button" className="head-row-reset" onClick={()=>applyCollarPinAdjust({...collarPinAdjust,[side]:{...value,y:0}})} aria-label={`${label} คืนค่าขึ้นลง`}><ResetGlyph/></button></div></section>};
 const selectBackground=async option=>{
  if(busy||hairBusy||downloadBusy)return;
  const previousPath=backgroundRef.current,previousId=backgroundId;
  backgroundRef.current=option.src;setBackgroundId(option.id);
  if(!editCache.current)return;
  const seq=++renderSeqRef.current;clearTimeout(renderTimer.current);
  try{
   const out=await renderWithRibbon(editCache.current.master,editCache.current.lock,{...liveAdjustRef.current},liveCollarWarpRef.current,liveNeckAdjustRef.current,option.src);
   if(seq===renderSeqRef.current)showBlob(out);
  }catch(e){if(seq===renderSeqRef.current){backgroundRef.current=previousPath;setBackgroundId(previousId);suppressUiError(e,'เปลี่ยนพื้นหลังไม่สำเร็จ')}}
 };
 const commitUniformSelection=option=>{
  if(option.cat==='job')setSelectedJobTemplate(option.template);
  if(option.cat==='student')setSelectedStudentTemplate(option.template);
  if(option.cat==='government'&&option.gender==='male')setSelectedInteriorTemplate(option.template);
  setUniformCategory(option.cat);setGender(option.gender);if(option.level)setLevel(option.level);setSelectedStyle(option.title||option.name);
 };
 const selectProcessedUniform=async option=>{
  if(busy||hairBusy||downloadBusy||uniformChanging)return;
  if(!editCache.current){
   commitUniformSelection(option);
   setMsg(`เลือกชุด ${option.title||option.name} แล้ว · เพิ่มรูปเพื่อเริ่มประมวลผล`);
   return;
  }
  const previousLock=editCache.current.lock;
  setUniformChanging(true);beginProgress('กำลังเปลี่ยนชุด');setMsg('กำลังวางแพทเทิร์นชุดใหม่…');
  let completed=false;
  try{
   clearTimeout(renderTimer.current);const seq=++renderSeqRef.current;
   const composed=await composePortrait(editCache.current.master,{scale:1,x:0,y:0},option.template);
   setProgressStage(76,'กำลังจัดตำแหน่งชุด');
   const out=await renderWithRibbon(editCache.current.master,composed.lock,{...liveAdjustRef.current},liveCollarWarpRef.current,liveNeckAdjustRef.current,backgroundRef.current);
   if(seq!==renderSeqRef.current)return;
   editCache.current={...editCache.current,lock:composed.lock};
   commitUniformSelection(option);
   setProgressStage(97,'กำลังแสดงผล');showBlob(out);setMsg('เปลี่ยนชุดแล้ว · คงใบหน้า ทรงผม และตำแหน่งเดิม');completed=true;
  }catch(e){editCache.current={...editCache.current,lock:previousLock};suppressUiError(e,'เปลี่ยนชุดไม่สำเร็จ')}
  finally{await finishProgress(completed);setUniformChanging(false)}
 };
 const downloadCurrentFinal=async()=>{
  if(!editCache.current||downloadBusy||hairBusy||busy)return;
  setDownloadBusy(true);setMsg('');
  try{
   clearTimeout(renderTimer.current);
   ++renderSeqRef.current;
   const out=await renderWithRibbon(editCache.current.master,editCache.current.lock,{...liveAdjustRef.current},liveCollarWarpRef.current,liveNeckAdjustRef.current,backgroundRef.current);
   showBlob(out);
   const url=URL.createObjectURL(out),link=document.createElement('a');
   link.href=url;link.download='photo-ready.png';document.body.appendChild(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){suppressUiError(e,'ดาวน์โหลดภาพไม่สำเร็จ')}finally{setDownloadBusy(false)}
 };
 const go=async()=>{if(busy||hairBusy)return;++renderSeqRef.current;clearTimeout(renderTimer.current);setBusy(true);setSafetyBlocked(false);beginProgress('กำลังประมวลผลรูป');setMsg('');let completed=false;try{
  // V209: generate the selected hairstyle together with the coherent head/neck
  // in one AI edit. This removes the faceless PNG overlay that produced hard
  // hairline edges and a pasted-looking face while the opaque mask locks the face.
  const aiHeadNeck=await aiFinishPortrait(f,hairId||'original');
  setProgressStage(60,'กำลังเตรียมภาพบุคคล');
  // 01 = exact bytes returned by GPT Image before remove.bg / Canvas / resize.
  const removedHeadNeck=await removeBackgroundBlob(aiHeadNeck);
  const headNeckTransparent=await refineSkinTextureBlob(removedHeadNeck);
  setProgressStage(78,'กำลังประกอบกับชุด');
  // 02 = exact remove.bg result before placement/resampling.
  const composed=await composePortrait(headNeckTransparent,{scale:1,x:0,y:0},activeUniformTemplate);
  setProgressStage(88,'กำลังจัดตำแหน่งภาพ');
  const aiLayer=await makePlacedHeadNeckLayer(headNeckTransparent,composed.lock);
  // V68: use the V66 AI anatomy layer directly. No face mask, source-face paste-back,
  // skin-isolation overlay, tone pass, or post-process face layer is applied.
  // V82: SINGLE AI ANATOMY LAYER — do not paste the photographed face back over the AI result.
  // This removes the post-process face overlay/mask that caused visible face-shaped seams.
  // The processed head/hair/neck remains one continuous transparent layer; uniform/template logic is unchanged.
  const layer=aiLayer;
  editCache.current={master:headNeckTransparent,lock:composed.lock};
  cleanHairBaseRef.current=null;
  initialStyledHairRef.current=headNeckTransparent;
  if(headMasterPreview)URL.revokeObjectURL(headMasterPreview);
  const initialFit=firstFitHeadAdjust(composed.lock,gender);
  initialHeadAdjustRef.current=initialFit;
  const masterPreviewURL=URL.createObjectURL(headNeckTransparent);setHeadMasterPreview(masterPreviewURL);setHeadPreviewLock(composed.lock);
  setHeadAdjust(initialFit);liveAdjustRef.current={...initialFit};setPlacementLocked(false);lockedPlacementRef.current=null;lockedMasterRef.current=headNeckTransparent;hairResultCacheRef.current.clear();if(hairId)hairResultCacheRef.current.set(hairId,headNeckTransparent);preparedHairBaseRef.current=null;lastHairDonorRef.current=null;setCollarWarp(0);liveCollarWarpRef.current=0;setNeckAdjust({width:0,length:0});liveNeckAdjustRef.current={width:0,length:0};
  const finished=await renderWithRibbon(headNeckTransparent,composed.lock,initialFit,0,{width:0,length:0},backgroundRef.current);
  setProgressStage(97,'กำลังแสดงผล');
  showBlob(finished);completed=true;
 }catch(e){if(e?.code==='IMAGE_SAFETY_BLOCK')showSafetyBlock(e.message);else suppressUiError(e,'ประมวลผลไม่สำเร็จ')}finally{await finishProgress(completed);setBusy(false)}};
 if(screen==='home'){
  const rows=[
   {id:'popular',title:'ตัวเลือกยอดนิยม 🔥',cards:[
    {...JOB_UNIFORMS[2],title:'สูทสมัครงาน'},
    {title:'ข้าราชการ',img:'/assets/uniform.png',cat:'government',uniform:true},
    {...STUDENT_UNIFORMS[0],title:'นักศึกษา'},
    {title:'ชุดครุย',img:'/assets/hairstyle-previews/hair-20.png',cat:'gown'}]},
   {id:'job',tag:'สมัครงาน',title:'รูปสมัครงาน พร้อมใช้',cards:JOB_UNIFORMS},
   {id:'government',tag:'ข้าราชการ',title:'ชุดราชการ',cards:[
    {title:'ปฏิบัติงาน',img:'/assets/uniform.png',cat:'government',uniform:true},
    {title:'ปฏิบัติการ',img:'/assets/uniform.png',cat:'government',uniform:true},
    {title:'ชำนาญการ / อาวุโส',img:'/assets/uniform.png',cat:'government',uniform:true}]},
   {id:'student',tag:'นักศึกษา',title:'รูปนักศึกษา',cards:STUDENT_UNIFORMS},
   {id:'gown',tag:'ชุดครุย',title:'ชุดครุยมหาวิทยาลัย',cards:[
    {title:'เพิ่มมหาวิทยาลัยภายหลัง',img:'/assets/hairstyle-previews/hair-28.png',cat:'gown'}]}
  ];
  const visibleRows=homeFilter==='all'?rows:rows.filter(r=>r.id===homeFilter);
  const governmentLevels=[['operational','ปฏิบัติงาน'],['academic','ปฏิบัติการ'],['senior','ชำนาญการ / อาวุโส']];
  const maleJobUniforms=JOB_UNIFORMS.filter(item=>item.gender==='male');
  const femaleJobUniforms=JOB_UNIFORMS.filter(item=>item.gender==='female');
  const chooseJobUniform=item=>{setUniformCategory('job');setSelectedJobTemplate(item.template);setGender(item.gender);setSelectedStyle(item.title);setScreen('process')};
  return <main className="profile-home">
   <header className="profile-home-header">{homeFilter!=='all'?<button type="button" className="home-back-button" onClick={()=>setHomeFilter('all')} aria-label="กลับหน้าแรก">‹ <span>หน้าแรก</span></button>:<div className="home-spacer"></div>}<h1>รูปโปรไฟล์</h1><button type="button" className="my-pill">ของฉัน</button></header>
   <nav className="home-tabs">{[['job','สมัครงาน'],['government','ข้าราชการ'],['student','นักศึกษา'],['gown','ชุดครุย']].map(([id,n])=><button type="button" key={id} className={homeFilter===id?'active':''} onClick={()=>{setUniformCategory(id);setHomeFilter(id)}}>{n}</button>)}</nav>
   <section className="home-content">
    {homeFilter==='job'&&<section className="government-filter-panel job-gender-panel">
     <section className="government-gender-section"><h2 className="government-section-title">ชุดสมัครงานชาย</h2><div className="government-level-grid">{maleJobUniforms.map(item=><button type="button" key={item.id} className={gender==='male'&&selectedJobTemplate===item.template?'selected':''} onClick={()=>chooseJobUniform(item)}><img src={item.img} alt={item.title}/><strong>{item.title}</strong><span className="selected-mark">✓</span></button>)}</div></section>
     <section className="government-gender-section female-government-section"><h2 className="government-section-title">ชุดสมัครงานหญิง</h2><div className="government-level-grid">{femaleJobUniforms.map(item=><button type="button" key={item.id} className={gender==='female'&&selectedJobTemplate===item.template?'selected':''} onClick={()=>chooseJobUniform(item)}><img src={item.img} alt={item.title}/><strong>{item.title}</strong><span className="selected-mark">✓</span></button>)}</div></section>
    </section>}
    {homeFilter==='government'&&<section className="government-filter-panel">
     <section className="government-gender-section"><h2 className="government-section-title">ชุดข้าราชการชาย</h2><div className="government-level-grid">{governmentLevels.map(([id,n])=>{const maleUniform=INTERIOR_UNIFORMS.find(t=>t.level===id)||INTERIOR_UNIFORMS[0];return <button type="button" key={'male-'+id} className={gender==='male'&&level===id?'selected':''} onClick={()=>{setGender('male');setLevel(id);setSelectedInteriorTemplate(maleUniform.img);setUniformCategory('government');setSelectedStyle(n);setScreen('process')}}><img src={maleUniform.preview} alt={'ชุดข้าราชการชาย '+n}/><strong>{n}</strong><span className="selected-mark">✓</span></button>})}</div></section>
     <section className="government-gender-section female-government-section"><h2 className="government-section-title">ชุดข้าราชการหญิง</h2><div className="government-level-grid">{governmentLevels.map(([id,n])=>{const femaleUniform=FEMALE_GOVERNMENT_UNIFORMS.find(t=>t.level===id)||FEMALE_GOVERNMENT_UNIFORMS[0];return <button type="button" key={'female-'+id} className={gender==='female'&&level===id?'selected':''} onClick={()=>{setGender('female');setLevel(id);setUniformCategory('government');setSelectedStyle(n);setScreen('process')}}><img src={femaleUniform.preview} alt={'ชุดข้าราชการหญิง '+n}/><strong>{n}</strong><span className="selected-mark">✓</span></button>})}</div></section>
    </section>}
    {homeFilter!=='government'&&homeFilter!=='job'&&visibleRows.map(r=><HomeRow key={r.id} tag={r.tag} title={r.title} cards={r.cards}/>)}
   </section>
  </main>;
 }
 function HomeRow({title,tag,cards}){return <section className="home-row"><div className="home-row-head"><div className="home-row-title">{tag&&<span>{tag}</span>}<h2>{title}</h2></div></div><div className="home-card-strip">{cards.map((c,i)=><button type="button" className="home-style-card" key={c.title+i} onClick={()=>{setUniformCategory(c.cat);if(c.cat==='job'&&(c.template||c.img)?.startsWith('/assets/job-uniforms/')){setSelectedJobTemplate(c.template||c.img);setGender(c.gender)}if(c.cat==='student'&&c.template?.startsWith('/assets/student-uniforms/')){setSelectedStudentTemplate(c.template);setGender(c.gender)}setSelectedStyle(c.title);setScreen('process')}}><div className={'home-card-image '+(c.uniform?'uniform-card':'')}><img src={c.img}/><div className="home-card-shade"></div><strong>{c.title}</strong></div></button>)}</div></section>}
 return <main className="app-shell modern-shell adaptive-editor" onContextMenu={e=>e.preventDefault()}><header className="mobile-topbar process-mobile-topbar editor-context-header"><button type="button" className="detail-back" onClick={()=>{setScreen('home');setHomeFilter(uniformCategory==='government'?'government':uniformCategory)}} aria-label="กลับหน้าก่อนหน้า">‹</button><div><div className="eyebrow">PHOTO READY</div><h1>{uniformCategory==='government'&&selectedStyle?`${selectedStyle} ${gender==='male'?'ชาย':'หญิง'}`:selectedStyle||'สร้างรูป'}</h1></div><div className="step-badge">ของฉัน</div></header><section className="modern-flow">
  <section className="style-detail-card"><div className="detail-title process-page-title editor-preview-heading"><h2>เพิ่มรูป</h2><span>{selectedStyle||'แบบที่เลือก'}</span></div><input id="process-photo-input" ref={fileInputRef} className="process-photo-input" type="file" accept="image/*" onChange={pick} disabled={busy||hairBusy}/><div ref={previewStageRef} className={"hero-preview preview-upload "+(b?"direct-edit-preview":"")+((previewZoom!==1||previewPan.x||previewPan.y)?" preview-zoomed":"")} style={{'--preview-view-transform':`translate3d(${previewPan.x}px,${previewPan.y}px,0) scale(${previewZoom})`}} onPointerDown={previewPointerDown} onPointerMove={previewPointerMove} onPointerUp={previewPointerUp} onPointerCancel={previewPointerUp} onWheel={previewWheel} onClick={e=>{if(a||b){if(optionTool&&optionTool!=='head'&&optionTool!=='ribbon')setOptionTool(null)}else fileInputRef.current?.click()}}>{b?<><img src={comparePreview&&a?a:b} className="editable-result-image final-render-preview"/><div className="preview-floating-actions"><button type="button" onClick={e=>{e.preventDefault();e.stopPropagation();setComparePreview(false);setPreviewZoom(1);setPreviewPan({x:0,y:0});applyAdjust({...initialHeadAdjustRef.current});applyCollarWarp(0)}} onPointerDown={e=>e.stopPropagation()} aria-label="รีเซ็ต"><span>↻</span><small>รีเซ็ต</small></button>
<button type="button" className={comparePreview?'active':''} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.preventDefault();e.stopPropagation();setComparePreview(v=>!v)}} aria-label="เปรียบเทียบ"><span>◐</span><small>เปรียบเทียบ</small></button></div>{!comparePreview&&<span className="preview-edit-hint">{optionTool==='ribbon'?'ลากแพรแถบเพื่อปรับ · ลากพื้นที่อื่นเพื่อเลื่อน · ใช้สองนิ้วซูม':optionTool==='head'?'แตะค้างที่หัวแล้วลากเพื่อย้าย · การซูมเหมือนเดิม':'ลากพื้นที่ว่างเพื่อเลื่อนมุมมอง · ใช้สองนิ้วซูม 20–200%'}</span>}</>:a?<><img src={a} className="source-preview"/></>:<div className="preview-empty"><span className="add-photo">+ เพิ่มรูป</span><small>JPG · PNG · WEBP</small></div>}{processProgress.active&&<div className="image-progress-overlay" role="status" aria-live="polite" onClick={e=>{e.preventDefault();e.stopPropagation()}}><div className="image-progress-card"><div className="image-progress-copy"><span>{processProgress.label}</span><strong>{Math.round(processProgress.value)}%</strong></div><div className="image-progress-track"><i style={{width:`${processProgress.value}%`}}/></div></div></div>}</div>
   <div className="quick-config">
    {uniformCategory==='government'&&<><div className="gender-tabs"><button className={gender==='male'?'active':''} onClick={()=>selectGovernmentGender('male')}>ชาย</button><button className={gender==='female'?'active':''} onClick={()=>selectGovernmentGender('female')}>หญิง</button></div><div className="level-grid">{[['operational','ปฏิบัติงาน'],['academic','ปฏิบัติการ'],['senior','ชำนาญการ / อาวุโส']].map(([id,n])=><button type="button" key={id} className={level===id?'active':''} onClick={()=>{setLevel(id);if(gender==='male')setSelectedInteriorTemplate((INTERIOR_UNIFORMS.find(t=>t.level===id)||INTERIOR_UNIFORMS[0]).img)}}>{n}</button>)}</div></>}
    {uniformCategory!=='government'&&uniformCategory!=='gown'&&uniformCategory!=='student'&&<div className="gender-tabs"><button className={gender==='male'?'active':''} onClick={()=>setGender('male')}>ชาย</button><button className={gender==='female'?'active':''} onClick={()=>selectGovernmentGender('female')}>หญิง</button></div>}
    {uniformCategory==='gown'&&<><label className="field-label">มหาวิทยาลัย<select disabled><option>เพิ่มมหาวิทยาลัยภายหลัง</option></select></label><div className="gender-tabs"><button className={gender==='male'?'active':''} onClick={()=>setGender('male')}>ชาย</button><button className={gender==='female'?'active':''} onClick={()=>selectGovernmentGender('female')}>หญิง</button></div></>}
   </div>
   <div className={"process-action-row "+(b?"processed-state":"")}><button className={"primary-action create-now process-first "+(b?"processed-hidden":"")} disabled={!f||hairId===null||busy} onClick={go}>{busy?'กำลังประมวลผล…':'ประมวลผลรูป'}</button>{(a||b)&&<div className="preview-file-actions">{b&&<button type="button" className="inline-download-button" disabled={downloadBusy||hairBusy||busy||uniformChanging} onClick={downloadCurrentFinal}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/></svg><span>{downloadBusy?'กำลังสร้าง…':'ดาวน์โหลด'}</span></button>}<label htmlFor="process-photo-input" className={(busy||hairBusy||downloadBusy||uniformChanging)?'disabled':''} aria-disabled={busy||hairBusy||downloadBusy||uniformChanging} onClick={e=>{if(busy||hairBusy||downloadBusy||uniformChanging){e.preventDefault();return}const input=fileInputRef.current;if(input)input.value=''}}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m5 17 4-4 3 3 3-3 4 4"/></svg><span>เปลี่ยนรูป</span></label></div>}</div>
{msg&&<div className="err">{msg}</div>}<div className="editor-tool-dock">{optionTool&&<div className="tool-choice-sheet">{optionTool==='head'?<div className="head-adjust-modern" role="group" aria-label="ปรับขนาดและตำแหน่งศีรษะ"><div className="head-adjust-row"><span className="head-adjust-glyph" title="ขนาด"><HeadAdjustGlyph type="scale"/></span><input aria-label="ขนาดศีรษะ" type="range" min="20" max="200" step="1" value={Math.round(headAdjust.scale*100)} onChange={e=>sliderAdjust({...headAdjust,scale:Number(e.target.value)/100})}/><output>{Math.round(headAdjust.scale*100)}%</output><button type="button" className="head-row-reset" onClick={()=>sliderAdjust({...headAdjust,scale:1})} aria-label="คืนค่าขนาด"><ResetGlyph/></button></div><div className="head-adjust-row"><span className="head-adjust-glyph" title="ซ้าย–ขวา"><HeadAdjustGlyph type="horizontal"/></span><input aria-label="เลื่อนซ้ายขวา" type="range" min="-50" max="50" step="0.1" value={headAdjust.x*100} onChange={e=>sliderAdjust({...headAdjust,x:Number(e.target.value)/100})}/><output>{headAdjust.x>=0?'+':''}{(headAdjust.x*100).toFixed(1)}</output><button type="button" className="head-row-reset" onClick={()=>sliderAdjust({...headAdjust,x:0})} aria-label="คืนค่าตำแหน่งซ้ายขวา"><ResetGlyph/></button></div><div className="head-adjust-row"><span className="head-adjust-glyph" title="บน–ล่าง"><HeadAdjustGlyph type="vertical"/></span><input aria-label="เลื่อนขึ้นลง" type="range" min="-50" max="50" step="0.1" value={-headAdjust.y*100} onChange={e=>sliderAdjust({...headAdjust,y:-Number(e.target.value)/100})}/><output>{(-headAdjust.y)>=0?'+':''}{(-headAdjust.y*100).toFixed(1)}</output><button type="button" className="head-row-reset" onClick={()=>sliderAdjust({...headAdjust,y:0})} aria-label="คืนค่าตำแหน่งบนล่าง"><ResetGlyph/></button></div><div className="head-adjust-row"><span className="head-adjust-glyph" title="เอียง"><HeadAdjustGlyph type="rotation"/></span><input aria-label="ปรับองศาเอียง" type="range" min="-30" max="30" step="0.5" value={headAdjust.rotation||0} onChange={e=>sliderAdjust({...headAdjust,rotation:Number(e.target.value)})}/><output>{(headAdjust.rotation||0)>=0?'+':''}{(headAdjust.rotation||0).toFixed(1)}°</output><button type="button" className="head-row-reset" onClick={()=>sliderAdjust({...headAdjust,rotation:0})} aria-label="คืนค่าองศาเอียง"><ResetGlyph/></button></div></div>:
optionTool==='collar'?<div className="head-adjust-modern collar-adjust-modern" role="group" aria-label="ปรับคอ"><div className="head-adjust-row"><span className="head-adjust-glyph" title="ปรับคอ"><HeadAdjustGlyph type="horizontal"/></span><input aria-label="หุบหรือขยายคอ" type="range" min="-160" max="120" step="1" value={Math.round(collarWarp*100)} onChange={e=>applyCollarWarp(Number(e.target.value)/100)}/><output>{collarWarp>=0?'+':''}{Math.round(collarWarp*100)}%</output><button type="button" className="head-row-reset" onClick={()=>applyCollarWarp(0)} aria-label="คืนค่าการปรับคอ"><ResetGlyph/></button></div></div>:
optionTool==='uniform'?<><div className="tool-choice-tabs"><span className="active">เปลี่ยนชุด</span><span>เลือกแพทเทิร์นใหม่</span></div><div className="uniform-switch-tabs">{UNIFORM_GROUPS.map(group=><button type="button" key={group.id} className={uniformPickerTab===group.id?'active':''} onClick={()=>setUniformPickerTab(group.id)}>{group.name}</button>)}</div><div className="uniform-switch-grid">{(UNIFORM_GROUPS.find(group=>group.id===uniformPickerTab)?.items||[]).map(option=><button type="button" key={option.id} className={(editCache.current?.lock?.templatePath||activeUniformTemplate)===option.template?'selected':''} disabled={uniformChanging||busy||hairBusy||downloadBusy} onClick={()=>selectProcessedUniform(option)}><img src={option.preview} alt=""/><strong>{option.title||option.name}</strong><span className="selected-mark">✓</span></button>)}</div></>:
optionTool==='pins'?<><div className="tool-choice-tabs ribbon-panel-tabs" role="tablist" aria-label="เมนูเข็ม"><button type="button" role="tab" aria-selected={pinPanelTab==='select'} className={pinPanelTab==='select'?'active':''} onClick={()=>setPinPanelTab('select')}>เข็ม</button><button type="button" role="tab" aria-selected={pinPanelTab==='adjust'} className={pinPanelTab==='adjust'?'active':''} onClick={()=>setPinPanelTab('adjust')}>ปรับ</button></div>{pinPanelTab==='select'?<div className="collar-pin-choice-preview"><button type="button" className={"collar-pin-option "+(!collarPinId?'selected':'')} disabled={busy||hairBusy||downloadBusy} onClick={()=>selectCollarPins(null)} aria-pressed={!collarPinId}><span className="no-pin-symbol">×</span><strong>ไม่ติดเข็ม</strong></button>{COLLAR_PIN_OPTIONS.map(option=><button type="button" key={option.id} className={"collar-pin-option "+(collarPinId===option.id?'selected':'')} disabled={busy||hairBusy||downloadBusy} onClick={()=>selectCollarPins(option)} aria-label={option.name} aria-pressed={collarPinId===option.id}><span className="collar-pin-pair"><img src={option.left} alt="เข็มซ้าย"/><img src={option.right} alt="เข็มขวา"/></span><strong>{option.name}</strong></button>)}</div>:<div className="head-adjust-modern collar-pin-modern-adjust" role="tabpanel" aria-label="ปรับตำแหน่งเข็มซ้ายและขวา">{!collarPinId?<div className="ribbon-adjust-empty">เลือกเข็มก่อนปรับตำแหน่ง</div>:<>{pinSideControls('left','เข็มซ้าย')}{pinSideControls('right','เข็มขวา')}</>}</div>}</>:
<>{optionTool==='ribbon'?<div className="tool-choice-tabs ribbon-panel-tabs" role="tablist" aria-label="เมนูแพรแถบ"><button type="button" role="tab" aria-selected={ribbonPanelTab==='select'} className={ribbonPanelTab==='select'?'active':''} onClick={()=>setRibbonPanelTab('select')}>แพรแถบ</button><button type="button" role="tab" aria-selected={ribbonPanelTab==='adjust'} className={ribbonPanelTab==='adjust'?'active':''} onClick={()=>setRibbonPanelTab('adjust')}>ปรับ</button></div>:<div className="tool-choice-tabs"><span className="active">{optionTool==='background'?'พื้นหลัง':optionTool==='male-hair'?'ทรงผมชาย':'ทรงผมหญิง'}</span><span>{optionTool==='background'?'เลือกสีพื้นหลัง':'แตะรูปเพื่อเลือกทรง'}</span></div>}{optionTool==='background'?<div className="background-choice-preview">{BACKGROUND_OPTIONS.map(option=><button type="button" key={option.id} className={"background-swatch "+(backgroundId===option.id?"selected":"")} disabled={busy||hairBusy||downloadBusy} onClick={()=>selectBackground(option)} aria-label={option.name} aria-pressed={backgroundId===option.id}><img src={option.src} alt=""/><strong>{option.name}</strong></button>)}</div>:optionTool!=='ribbon'?<div className="choice-rail-wrap"><button type="button" className="choice-rail-arrow choice-rail-left" onClick={()=>scrollChoiceRail(-1)} aria-label="เลื่อนรายการไปทางซ้าย">‹</button><div ref={choiceRailRef} className="hair-carousel process-thumbnail-strip choice-scroll-rail"><button type="button" className={'hair-card no-hair-card '+(hairId===''?'selected':'')} disabled={hairBusy||busy} onClick={()=>changeHair('')}><span className="no-hair-icon">✓</span><span>ผมเดิม</span></button>{(optionTool==='male-hair'?MALE_HAIR_OPTIONS:HAIR_OPTIONS).map(h=><button type="button" key={h.id} className={'hair-card '+(hairId===h.id?'selected':'')} disabled={hairBusy||busy} onClick={()=>changeHair(h.id)} aria-label={h.name} title={h.name}><img src={h.src} alt={h.name}/></button>)}</div><button type="button" className="choice-rail-arrow choice-rail-right" onClick={()=>scrollChoiceRail(1)} aria-label="เลื่อนรายการไปทางขวา">›</button></div>:ribbonPanelTab==='select'?<div className="choice-rail-wrap ribbon-choice-rail-wrap" role="tabpanel"><button type="button" className="choice-rail-arrow choice-rail-left" onClick={()=>scrollChoiceRail(-1)} aria-label="เลื่อนแพรแถบไปทางซ้าย">‹</button><div ref={choiceRailRef} className="ribbon-choice-preview choice-scroll-rail"><button type="button" className={"ribbon-option "+(!ribbonId?'selected':'')} disabled={busy||hairBusy||downloadBusy} onClick={()=>selectRibbon(null)} aria-pressed={!ribbonId}>ไม่ติดแพรแถบ</button>{RIBBON_OPTIONS.map(option=><button type="button" key={option.id} className={"ribbon-option "+(ribbonId===option.id?'selected':'')} disabled={busy||hairBusy||downloadBusy} onClick={()=>selectRibbon(option)} aria-label={option.name} aria-pressed={ribbonId===option.id}><img src={option.src} alt=""/><strong>{option.name}</strong></button>)}</div><button type="button" className="choice-rail-arrow choice-rail-right" onClick={()=>scrollChoiceRail(1)} aria-label="เลื่อนแพรแถบไปทางขวา">›</button></div>:<div className="head-adjust-modern ribbon-modern-adjust" role="tabpanel" aria-label="ปรับแพรแถบ">{!ribbonId?<div className="ribbon-adjust-empty">เลือกแพรแถบก่อนปรับตำแหน่ง</div>:<><div className="head-adjust-row"><span className="head-adjust-glyph" title="ซ้าย–ขวา"><HeadAdjustGlyph type="horizontal"/></span><input aria-label="เลื่อนแพรแถบซ้ายขวา" type="range" min="-35" max="35" step=".5" value={ribbonAdjust.x*100} onChange={e=>applyRibbonAdjust({...ribbonAdjust,x:Number(e.target.value)/100})}/><output>{ribbonAdjust.x>=0?'+':''}{Math.round(ribbonAdjust.x*100)}%</output><button type="button" className="head-row-reset" onClick={()=>applyRibbonAdjust({...ribbonAdjust,x:0})} aria-label="คืนค่าตำแหน่งซ้ายขวา"><ResetGlyph/></button></div><div className="head-adjust-row"><span className="head-adjust-glyph" title="ขึ้น–ลง"><HeadAdjustGlyph type="vertical"/></span><input aria-label="เลื่อนแพรแถบขึ้นลง" type="range" min="-35" max="35" step=".5" value={-ribbonAdjust.y*100} onChange={e=>applyRibbonAdjust({...ribbonAdjust,y:-Number(e.target.value)/100})}/><output>{-ribbonAdjust.y>=0?'+':''}{Math.round(-ribbonAdjust.y*100)}%</output><button type="button" className="head-row-reset" onClick={()=>applyRibbonAdjust({...ribbonAdjust,y:0})} aria-label="คืนค่าตำแหน่งขึ้นลง"><ResetGlyph/></button></div><div className="head-adjust-row"><span className="head-adjust-glyph" title="ขนาด"><HeadAdjustGlyph type="scale"/></span><input aria-label="ปรับขนาดแพรแถบ" type="range" min="45" max="200" step="1" value={ribbonAdjust.scale*100} onChange={e=>applyRibbonAdjust({...ribbonAdjust,scale:Number(e.target.value)/100})}/><output>{Math.round(ribbonAdjust.scale*100)}%</output><button type="button" className="head-row-reset" onClick={()=>applyRibbonAdjust({...ribbonAdjust,scale:1})} aria-label="คืนค่าขนาด"><ResetGlyph/></button></div></>}</div>}</>}</div>}<div className="placement-lock-row"><button type="button" className={placementLocked?"placement-lock-btn locked":"placement-lock-btn"} disabled={!b||hairBusy} onClick={placementLocked?unlockPlacement:lockPlacement}>{placementLocked?"🔓 ปลดล็อกเพื่อแก้ตำแหน่ง":"✓ ยืนยันและล็อกตำแหน่ง"}</button>{placementLocked&&<small>หน้า · ตำแหน่งหัว · คอ ถูกล็อกไว้</small>}{hairBusy&&<small>กำลังเปลี่ยนทรงผม…</small>}</div>
<div className="tool-rail-wrap"><button type="button" className="tool-rail-arrow tool-rail-left" onClick={()=>scrollToolBar(-1)} aria-label="เลื่อนเครื่องมือไปทางซ้าย">‹</button><div ref={toolBarRef} className="option-icon-bar process-option-bar simple-line-tools"><button type="button" disabled={placementLocked} className={optionTool==='head'?'active':''} onClick={()=>toggleOptionTool('head')}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/tool-1.png" alt=""/></span><strong>ปรับหัว</strong></button>
<button type="button" disabled={placementLocked} className={optionTool==='collar'?'active':''} onClick={()=>toggleOptionTool('collar')}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/tool-2.png" alt=""/></span><strong>ปรับคอ</strong></button>
<button type="button" className={optionTool==='male-hair'?'active':''} onClick={()=>toggleOptionTool('male-hair',()=>setGender('male'))}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/tool-3.png" alt=""/></span><strong>ทรงผมชาย</strong></button>
<button type="button" className={optionTool==='female-hair'?'active':''} onClick={()=>toggleOptionTool('female-hair',()=>uniformCategory==='government'?selectGovernmentGender('female'):setGender('female'))}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/tool-4.png" alt=""/></span><strong>ทรงผมหญิง</strong></button>
<button type="button" className={optionTool==='ribbon'?'active':''} onClick={()=>toggleOptionTool('ribbon',()=>setRibbonPanelTab('select'))}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/tool-5.png" alt=""/></span><strong>แพรแถบ</strong></button>
{uniformCategory==='government'&&<button type="button" className={optionTool==='pins'?'active':''} onClick={()=>toggleOptionTool('pins',()=>setPinPanelTab('select'))}><span className="line-tool-icon collar-pin-tool-icon" aria-hidden="true"><img src="/app-icons/tool-collar-pins.png" alt=""/></span><strong>เข็ม</strong></button>}
<button type="button" className={optionTool==='background'?'active':''} onClick={()=>toggleOptionTool('background')}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/tool-6.png" alt=""/></span><strong>พื้นหลัง</strong></button>
<button type="button" disabled={uniformChanging} className={optionTool==='uniform'?'active':''} onClick={()=>toggleOptionTool('uniform',()=>setUniformPickerTab(uniformCategory==='government'?`government-${gender}`:uniformCategory))}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/tool-uniform-change.svg" alt=""/></span><strong>เปลี่ยนชุด</strong></button></div><button type="button" className="tool-rail-arrow tool-rail-right" onClick={()=>scrollToolBar(1)} aria-label="เลื่อนเครื่องมือไปทางขวา">›</button></div></div>
  </section>

 </section></main>
}
createRoot(document.getElementById('root')).render(<App/>);
