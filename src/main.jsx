import React,{useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import{FilesetResolver,FaceLandmarker}from'@mediapipe/tasks-vision';
import'./style.css';

let landmarkerPromise;
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

async function composePortrait(headBlob,adjust={scale:1,x:0,y:0}){
 const bg=await loadImage('/assets/background.jpg');
 const uniformImg=await loadImage('/assets/uniform.png');
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

  // BODY MASTER: ชุดเป็นแม่แบบคงที่เสมอ ไม่ปรับตามระยะภาพต้นฉบับ
  const uW=W*.94,uScale=uW/uniform.naturalWidth,uH=uniform.naturalHeight*uScale;
  const uX=(W-uW)/2,uY=H*.425;
  const collarCX=W*.5;
  // V12: anchor the anatomy to the REAL first opaque row of the uniform PNG.
  // The old .015 estimate pointed into transparent padding and made AI invent a long neck.
  const ub=await alphaBounds(uniform);
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
  const collarSocketY=uY+socketY*uScale;
  // V15: SHOULDER-RELATIVE BODY MASTER
  // หลังวางตำแหน่งคางแล้ว ขนาดหัวขั้นสุดท้ายต้องอิงไหล่ของชุด ไม่ใช่กรอบ input
  // ใช้ช่วงไหล่ของ template เป็น physical reference คงที่สำหรับทุกภาพต้นฉบับ
  const shoulderSpan=uW*.84;
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
  return {blob,lock:{W,H,hX,hY,scale,faceCX,chinY,headW:head.naturalWidth,headH:head.naturalHeight,uX,uY,uW,uH,collarSocketY}};
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
  const uniform=await loadImage('/assets/uniform.png');
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(uniform,lock.uX,lock.uY,lock.uW,lock.uH);

  return await new Promise((ok,bad)=>c.toBlob(v=>v?ok(v):bad(Error('ล็อกองค์ประกอบ V28 ขั้นสุดท้ายไม่สำเร็จ')),'image/png'));
 }finally{URL.revokeObjectURL(aiURL);URL.revokeObjectURL(headURL);URL.revokeObjectURL(baseURL)}
}

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

async function renderAdjustedFinal(headLayer,lock,adjust){
 const bg=await loadImage('/assets/background.jpg'),uniform=await loadImage('/assets/uniform.png');
 const c=document.createElement('canvas');c.width=lock.W;c.height=lock.H;
 const x=c.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(bg,0,0,lock.W,lock.H);
 const s=adjust.scale||1, dx=(adjust.x||0)*lock.W, dy=(adjust.y||0)*lock.H;
 const cx=lock.hX+(lock.headW*lock.scale)/2, cy=lock.hY+(lock.headH*lock.scale)/2;
 x.save();x.translate(cx+dx,cy+dy);x.scale(s,s);x.translate(-cx,-cy);x.drawImage(headLayer,0,0);x.restore();
 x.drawImage(uniform,lock.uX,lock.uY,lock.uW,lock.uH);
 return await new Promise((ok,bad)=>c.toBlob(v=>v?ok(v):bad(Error('ปรับส่วนหัวไม่สำเร็จ')),'image/png'));
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

async function removeBackgroundBlob(blob){
 const fd=new FormData();
 fd.append('image',blob,'ai-person.png');
 const r=await fetch('/api/remove-background',{method:'POST',body:fd});
 if(!r.ok) throw Error(await r.text());
 return await r.blob();
}

async function aiFinishPortrait(composedBlob,hairId){
 const uploadBlob=await makeAiUploadBlob(composedBlob);
 const fd=new FormData();
 fd.append('image',uploadBlob,'portrait.jpg');
 fd.append('hairId',hairId);
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),120000);
 try{
  const r=await fetch('/api/ai-finish',{method:'POST',body:fd,signal:controller.signal});
  if(!r.ok) throw Error(await r.text());
  return await r.blob();
 }catch(e){
  if(e?.name==='AbortError') throw Error('AI ใช้เวลานานเกิน 120 วินาที กรุณาลองใหม่');
  throw e;
 }finally{clearTimeout(timer)}
}

const HAIR_OPTIONS=[
 {id:'hair-01',name:'ทรงผม 01',src:'/assets/hair/hair-01.png'}
];

function App(){
 const[f,setF]=useState(),[a,setA]=useState(),[b,setB]=useState(),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[hairId,setHairId]=useState('hair-01');
 const[headAdjust,setHeadAdjust]=useState({scale:1,x:0,y:0});
 const transparentCache=useRef({key:'',blob:null}), editCache=useRef(null), resultUrl=useRef('');
 const showBlob=blob=>{if(resultUrl.current)URL.revokeObjectURL(resultUrl.current);resultUrl.current=URL.createObjectURL(blob);setB(resultUrl.current)};
 const pick=e=>{const v=e.target.files?.[0];if(v){transparentCache.current={key:'',blob:null};editCache.current=null;setHeadAdjust({scale:1,x:0,y:0});setF(v);setA(URL.createObjectURL(v));setB();setMsg('')}};
 const applyAdjust=async next=>{setHeadAdjust(next);if(!editCache.current)return;try{const out=await renderAdjustedFinal(editCache.current.layer,editCache.current.lock,next);showBlob(out)}catch(e){setMsg(e.message||'ปรับส่วนหัวไม่สำเร็จ')}};
 const nudge=(k,d)=>{const v={...headAdjust,[k]:headAdjust[k]+d};if(k==='scale')v.scale=Math.max(.55,Math.min(1.45,v.scale));applyAdjust(v)};
 const go=async()=>{setBusy(true);setMsg('');try{
  const fileKey=[f.name,f.size,f.lastModified].join(':');let transparent=transparentCache.current.key===fileKey?transparentCache.current.blob:null;
  if(!transparent){const d=new FormData();d.append('image',f);const r=await fetch('/api/remove-background',{method:'POST',body:d});if(!r.ok)throw Error(await r.text());transparent=await r.blob();transparentCache.current={key:fileKey,blob:transparent};}
  // V46 PIPELINE: original -> remove.bg -> cut away original neck/body -> AI head+hair+BARE neck/clavicle only
  // -> remove AI temporary background -> normalize against the real fixed uniform -> place UNDER uniform.
  // The AI never receives the uniform template, so it cannot generate a duplicate uniform.
  const sourceHead=await headOnly(transparent);
  const aiHeadNeck=hairId?await aiFinishPortrait(sourceHead,hairId):sourceHead;
  const headNeckTransparent=hairId?await removeBackgroundBlob(aiHeadNeck):aiHeadNeck;
  const composed=await composePortrait(headNeckTransparent,{scale:1,x:0,y:0});
  const layer=await makePlacedHeadNeckLayer(headNeckTransparent,composed.lock);
  editCache.current={layer,lock:composed.lock};
  setHeadAdjust({scale:1,x:0,y:0});
  const finished=await renderAdjustedFinal(layer,composed.lock,{scale:1,x:0,y:0});
  showBlob(finished);
 }catch(e){setMsg(e.message||'ประมวลผลไม่สำเร็จ')}finally{setBusy(false)}};
 return <main><h1>ประกอบหัวกับชุด PNG โปร่งใสอัตโนมัติ</h1><p>V46: คงการปรับผิวแบบ V9 จากเวอร์ชันนี้ แต่ AI ทำเฉพาะหัว + ผม + คอเปล่าถึงไหปลาร้า แล้วลบพื้นหลังก่อนวางใต้ Template ชุดจริง</p><section>
 <label className="upload"><input type="file" accept="image/*" onChange={pick}/>{a?<img src={a}/>:<><strong>เลือกรูปภาพ</strong><small>JPG · PNG · WEBP</small></>}</label>
 <div className="hair-options"><div className="hair-title">ทรงผม</div>{HAIR_OPTIONS.map(h=><button type="button" key={h.id} className={'hair-card '+(hairId===h.id?'selected':'')} onClick={()=>setHairId(h.id)}><img src={h.src}/><span>{h.name}</span></button>)}</div>
 <button disabled={!f||busy} onClick={go}>{busy?'กำลังประมวลผล…':'ประมวลผลอัตโนมัติ'}</button>
 {msg&&<div className="err">{msg}</div>}
 {b&&<><div className="head-tools"><div className="head-tools-title">ปรับส่วนหัวที่วางแล้ว</div><div className="head-tools-grid">
  <button type="button" onClick={()=>nudge('y',-.01)}>↑ บน</button><button type="button" onClick={()=>nudge('y',.01)}>↓ ล่าง</button><button type="button" onClick={()=>nudge('x',-.01)}>← ซ้าย</button><button type="button" onClick={()=>nudge('x',.01)}>→ ขวา</button><button type="button" onClick={()=>nudge('scale',-.05)}>− ลดหัว</button><button type="button" onClick={()=>nudge('scale',.05)}>＋ ขยายหัว</button><button type="button" className="reset-head" onClick={()=>applyAdjust({scale:1,x:0,y:0})}>คืนค่ามาตรฐาน</button></div><small>ขนาด {Math.round(headAdjust.scale*100)}% · ซ้าย/ขวา {Math.round(headAdjust.x*100)}% · บน/ล่าง {Math.round(headAdjust.y*100)}%</small></div>
 <div className="grid"><figure><figcaption>ต้นฉบับ</figcaption><img src={a}/></figure><figure><figcaption>ผลลัพธ์ประกอบอัตโนมัติ</figcaption><div className="check"><img src={b}/></div></figure></div><a className="save" href={b} download="photo-composed.png">ดาวน์โหลดภาพ</a></>}
 </section></main>
}
createRoot(document.getElementById('root')).render(<App/>);
