import React,{useEffect,useRef,useState}from'react';
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

function applyStudioFaceTone(canvas){
 // V84 SKIN METHOD PORTED FROM photoid-studio-th-v9-export-sharpness-only.
 // Scope is deliberately limited to skin finishing only. No AI regeneration, no face overlay,
 // no landmark/geometry edits, no smoothing/denoise/beauty pass and no pipeline/UI changes.
 // Method: restrained RAW-like luminance correction + conservative local micro sharpening.
 const w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d',{willReadFrequently:true});
 if(!w||!h)return canvas;
 const image=ctx.getImageData(0,0,w,h),src=image.data;
 const base=new Uint8ClampedArray(src),out=new Uint8ClampedArray(src);
 const isSkinAt=i=>{
  if(base[i+3]<32)return false;
  const r=base[i],g=base[i+1],b=base[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);
  // Keep the existing conservative skin isolation so this V84 change cannot touch hair,
  // uniform, background, insignia or transparent pixels.
  return r>58&&g>38&&b>28&&(mx-mn)>12&&r>g*.98&&r>b*1.06&&Math.abs(r-g)>5;
 };
 // Pass 1 — RAW-like exposure only on skin luminance. Preserve hue/chroma and taper the lift
 // toward highlights so forehead/nose/cheek specular detail remains dimensional, not flat.
 for(let i=0;i<base.length;i+=4){
  if(!isSkinAt(i))continue;
  const r=base[i],g=base[i+1],b=base[i+2];
  const y=.2126*r+.7152*g+.0722*b;
  const taper=y<150?1:y<215?(215-y)/65:0;
  const target=Math.min(250,y*(1+0.035*taper));
  const k=y>2?target/y:1;
  out[i]=Math.max(0,Math.min(255,Math.round(r*k)));
  out[i+1]=Math.max(0,Math.min(255,Math.round(g*k)));
  out[i+2]=Math.max(0,Math.min(255,Math.round(b*k)));
 }
 // Pass 2 — same conservative 4-neighbour unsharp principle as the reference project:
 // strength 0.18 and delta capped at +/-10. It restores existing pore/camera micro-detail;
 // it does not invent texture and cannot move facial features.
 const exposed=new Uint8ClampedArray(out),strength=.18,maxDelta=10;
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const i=(y*w+x)*4;if(!isSkinAt(i))continue;
  const left=i-4,right=i+4,up=i-w*4,down=i+w*4;
  for(let c=0;c<3;c++){
   const center=exposed[i+c];
   const blur=(exposed[left+c]+exposed[right+c]+exposed[up+c]+exposed[down+c])/4;
   let delta=(center-blur)*strength;
   delta=Math.max(-maxDelta,Math.min(maxDelta,delta));
   out[i+c]=Math.max(0,Math.min(255,Math.round(center+delta)));
  }
  out[i+3]=exposed[i+3];
 }
 image.data.set(out);ctx.putImageData(image,0,0);return canvas;
}

async function restoreOriginalIdentityLayer(aiLayerCanvas,originalHeadBlob,aiHeadBlob,lock){
 // V80 SINGLE-SKIN IDENTITY LOCK.
 // Root cause of V79's visible "face mask": several separate ellipses restored photographed pixels
 // over an AI face. Each ellipse had its own alpha/tone transition, so their overlaps became visible
 // as circular/rectangular patches. V80 removes those patches completely.
 // One continuous anatomical face-skin mask is used instead. Original photographed RGB is preserved;
 // AI is used outside that mask for hairstyle + neck only.
 const ou=URL.createObjectURL(originalHeadBlob),au=URL.createObjectURL(aiHeadBlob);
 try{
  const original=await loadImage(ou),ai=await loadImage(au);
  const detector=await getLandmarker();
  const of=detector.detect(original).faceLandmarks?.[0],af=detector.detect(ai).faceLandmarks?.[0];
  if(!of||!af)return aiLayerCanvas;
  const eyePair=(lm,W,H)=>{const a=lm[33],b=lm[263];const ax=a.x*W,ay=a.y*H,bx=b.x*W,by=b.y*H;return{cx:(ax+bx)/2,cy:(ay+by)/2,dx:bx-ax,dy:by-ay,d:Math.hypot(bx-ax,by-ay)}};
  const oe=eyePair(of,original.naturalWidth,original.naturalHeight),ae=eyePair(af,ai.naturalWidth,ai.naturalHeight);
  if(oe.d<8||ae.d<8)return aiLayerCanvas;
  const ratio=ae.d/oe.d,ang=Math.atan2(ae.dy,ae.dx)-Math.atan2(oe.dy,oe.dx);
  const ca=Math.cos(ang)*ratio,sa=Math.sin(ang)*ratio;
  const tx=ae.cx-(ca*oe.cx-sa*oe.cy),ty=ae.cy-(sa*oe.cx+ca*oe.cy);
  const A=lock.scale*ca,B=lock.scale*sa,C=-lock.scale*sa,D=lock.scale*ca,E=lock.hX+lock.scale*tx,F=lock.hY+lock.scale*ty;

  // Place the full-resolution photographed source once. No AI sharpening/beauty regeneration touches it.
  const placed=document.createElement('canvas');placed.width=lock.W;placed.height=lock.H;
  const pc=placed.getContext('2d');pc.imageSmoothingEnabled=true;pc.imageSmoothingQuality='high';
  pc.setTransform(A,B,C,D,E,F);pc.drawImage(original,0,0);pc.setTransform(1,0,0,1,0,0);
  // V81: finish only the real photographed face pixels after placement; identity geometry remains pixel-locked.
  applyStudioFaceTone(placed);

  // A single MediaPipe anatomical contour: hairline/temples -> cheeks -> jaw -> chin -> opposite side.
  // Unlike V79 there are NO eye/nose/mouth/jaw ellipses, therefore no overlapping "mask" shapes can appear.
  const contour=[10,338,297,332,284,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,54,103,67,109];
  const srcMask=document.createElement('canvas');srcMask.width=original.naturalWidth;srcMask.height=original.naturalHeight;
  const sm=srcMask.getContext('2d');sm.beginPath();
  contour.forEach((id,i)=>{const q=of[id],x=q.x*original.naturalWidth,y=q.y*original.naturalHeight;(i?sm.lineTo(x,y):sm.moveTo(x,y));});
  sm.closePath();sm.fillStyle='#fff';sm.fill();

  const hard=document.createElement('canvas');hard.width=lock.W;hard.height=lock.H;
  const hm=hard.getContext('2d');hm.setTransform(A,B,C,D,E,F);hm.drawImage(srcMask,0,0);hm.setTransform(1,0,0,1,0,0);

  // Small continuous feather only. V79 used 24-46 px on multiple patches, which made tone islands visible.
  // 8-14 px is enough for anti-aliased photographic blending while retaining pores and source sharpness.
  const feather=Math.max(8,Math.min(14,lock.W*.010));
  const soft=document.createElement('canvas');soft.width=lock.W;soft.height=lock.H;
  const sf=soft.getContext('2d');sf.filter=`blur(${feather}px)`;sf.drawImage(hard,0,0);sf.filter='none';

  // At the jaw/chin, feather must stay inside the photographed skin so dark matte/hair RGB cannot leak
  // onto the generated neck. This is the only contracted edge; the rest uses the normal soft contour.
  const chin=of[152],chinOutY=B*(chin.x*original.naturalWidth)+D*(chin.y*original.naturalHeight)+F;
  const jawGuard=document.createElement('canvas');jawGuard.width=lock.W;jawGuard.height=lock.H;
  const jg=jawGuard.getContext('2d');
  const fade=Math.max(8,Math.min(14,feather));
  const grad=jg.createLinearGradient(0,chinOutY-fade,0,chinOutY+1);
  grad.addColorStop(0,'rgba(255,255,255,1)');grad.addColorStop(1,'rgba(255,255,255,0)');
  jg.fillStyle=grad;jg.fillRect(0,0,lock.W,chinOutY+1);
  sf.globalCompositeOperation='destination-in';sf.drawImage(jawGuard,0,0);sf.globalCompositeOperation='source-over';

  pc.globalCompositeOperation='destination-in';pc.drawImage(soft,0,0);pc.globalCompositeOperation='source-over';

  const out=document.createElement('canvas');out.width=lock.W;out.height=lock.H;
  const oc=out.getContext('2d');oc.imageSmoothingEnabled=true;oc.imageSmoothingQuality='high';
  oc.drawImage(aiLayerCanvas,0,0);
  oc.drawImage(placed,0,0);
  return out;
 }finally{URL.revokeObjectURL(ou);URL.revokeObjectURL(au)}
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
async function renderAdjustedFinal(headLayer,lock,adjust,collarWarp=0){
 const bg=await loadImage('/assets/background.jpg'),uniform=await loadImage('/assets/uniform.png');
 const warpedUniform=await warpUniformCollar(uniform,collarWarp);
 const c=document.createElement('canvas');c.width=lock.W;c.height=lock.H;
 const x=c.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(bg,0,0,lock.W,lock.H);
 const s=adjust.scale||1, dx=(adjust.x||0)*lock.W, dy=(adjust.y||0)*lock.H, rotation=(adjust.rotation||0)*Math.PI/180;
 x.imageSmoothingEnabled=true; x.imageSmoothingQuality='high';
 const cx=lock.hX+(lock.headW*lock.scale)/2, cy=lock.hY+(lock.headH*lock.scale)/2;
 x.save();x.translate(cx+dx,cy+dy);x.rotate(rotation);x.scale(s,s);x.translate(-cx,-cy);x.drawImage(headLayer,0,0);x.restore();
 x.drawImage(warpedUniform,lock.uX,lock.uY,lock.uW,lock.uH);
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

async function aiFinishPortrait(sourceBlob,hairId){
 // V50 DETAIL-PRESERVATION FIX: send the untouched uploaded source bytes to OpenAI.
 // Do not route the source through headOnly/remove.bg/canvas/JPEG before the high-fidelity edit.
 // This matches the V9 input path and prevents source pores, eyelashes, hair strands and
 // low-contrast facial micro-detail from being discarded before input_fidelity=high can use them.
 const fd=new FormData();
 const sourceName=sourceBlob?.name||'portrait-source';
 fd.append('image',sourceBlob,sourceName);
 fd.append('hairId',hairId||'original');
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

function App(){
 const[f,setF]=useState(),[a,setA]=useState(),[b,setB]=useState(),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[hairId,setHairId]=useState(null);
 const[uniformCategory,setUniformCategory]=useState('government'),[homeFilter,setHomeFilter]=useState('all'),[screen,setScreen]=useState('home'),[selectedStyle,setSelectedStyle]=useState(''),[ministry,setMinistry]=useState('กระทรวงการคลัง'),[gender,setGender]=useState('female'),[level,setLevel]=useState('operational'),[affiliationPreview,setAffiliationPreview]=useState(false);
 const[headAdjust,setHeadAdjust]=useState({scale:1,x:0,y:0,rotation:0});
 const[collarWarp,setCollarWarp]=useState(0);
 const[optionTool,setOptionTool]=useState(null);
 const[resultTool,setResultTool]=useState('head');
 const[previewZoom,setPreviewZoom]=useState(1);
 const[previewPan,setPreviewPan]=useState({x:0,y:0});
 const[comparePreview,setComparePreview]=useState(false);
 const toolBarRef=useRef(null);
 const choiceRailRef=useRef(null);
 const toggleOptionTool=(name,beforeOpen)=>{setOptionTool(current=>{const next=current===name?null:name;if(next&&beforeOpen)beforeOpen();return next})};
 const scrollToolBar=direction=>{const el=toolBarRef.current;if(!el)return;el.scrollBy({left:direction*Math.max(180,el.clientWidth*.55),behavior:'smooth'})};
 const scrollChoiceRail=direction=>{const el=choiceRailRef.current;if(!el)return;el.scrollBy({left:direction*Math.max(180,el.clientWidth*.72),behavior:'smooth'})};
 const gestureRef=useRef({drag:false,x:0,y:0,startX:0,startY:0,startAdjust:null,pinch:false,distance:0,zoom:1,midX:0,midY:0,startPan:{x:0,y:0}});
 useEffect(()=>{if(b&&toolBarRef.current)toolBarRef.current.scrollLeft=0},[b]);
 useEffect(()=>{if(!optionTool)return;const dismiss=e=>{const t=e.target;if(t?.closest?.('.tool-choice-sheet,.process-option-bar,.tool-rail-arrow'))return;setOptionTool(null)};document.addEventListener('pointerdown',dismiss,true);return()=>document.removeEventListener('pointerdown',dismiss,true)},[optionTool]);
 const renderTimer=useRef(null);
 const transparentCache=useRef({key:'',blob:null}), editCache=useRef(null), resultUrl=useRef('');
 const showBlob=blob=>{if(resultUrl.current)URL.revokeObjectURL(resultUrl.current);resultUrl.current=URL.createObjectURL(blob);setB(resultUrl.current)};
 const pick=e=>{const v=e.target.files?.[0];if(v){transparentCache.current={key:'',blob:null};editCache.current=null;setHeadAdjust({scale:1,x:0,y:0,rotation:0});setCollarWarp(0);setPreviewZoom(1);setPreviewPan({x:0,y:0});setComparePreview(false);setF(v);setA(URL.createObjectURL(v));setB();setMsg('')}};
 const applyAdjust=async next=>{setHeadAdjust(next);if(!editCache.current)return;try{const out=await renderAdjustedFinal(editCache.current.layer,editCache.current.lock,next,collarWarp);showBlob(out)}catch(e){setMsg(e.message||'ปรับส่วนหัวไม่สำเร็จ')}};
 const nudge=(k,d)=>{const v={...headAdjust,[k]:headAdjust[k]+d};if(k==='scale')v.scale=Math.max(.20,Math.min(2.00,v.scale));applyAdjust(v)};
 const applyCollarWarp=async amount=>{const v=Math.max(-1,Math.min(1,amount));setCollarWarp(v);if(!editCache.current)return;try{const out=await renderAdjustedFinal(editCache.current.layer,editCache.current.lock,headAdjust,v);showBlob(out)}catch(e){setMsg(e.message||'ปรับช่องคอไม่สำเร็จ')}};
 const autoFitCollar=()=>{const target=Math.max(-.35,Math.min(.35,(headAdjust.scale-1)*.9));applyCollarWarp(target)};
 const scheduleAdjust=next=>{setHeadAdjust(next);clearTimeout(renderTimer.current);renderTimer.current=setTimeout(()=>applyAdjust(next),55)};
 const previewPointerDown=e=>{if(!b||e.pointerType==='touch')return;e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);gestureRef.current={...gestureRef.current,drag:true,x:e.clientX,y:e.clientY,startAdjust:{...headAdjust},startPan:{...previewPan},editHead:optionTool==='head'}};
 const previewPointerMove=e=>{if(e.pointerType==='touch')return;const g=gestureRef.current;if(!g.drag||!b)return;e.preventDefault();if(g.editHead){const r=e.currentTarget.getBoundingClientRect(),next={...g.startAdjust,x:g.startAdjust.x+(e.clientX-g.x)/r.width/previewZoom,y:g.startAdjust.y+(e.clientY-g.y)/r.height/previewZoom};scheduleAdjust(next)}else if(previewZoom>1){setPreviewPan({x:g.startPan.x+(e.clientX-g.x),y:g.startPan.y+(e.clientY-g.y)})}};
 const previewPointerUp=e=>{if(e.pointerType==='touch')return;if(gestureRef.current.drag){const wasHead=gestureRef.current.editHead;gestureRef.current.drag=false;clearTimeout(renderTimer.current);if(wasHead)applyAdjust(headAdjust)}};
 const touchDistance=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
 const touchMid=t=>({x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2});
 const previewTouchStart=e=>{if(!b)return;if(e.touches.length===2){e.preventDefault();const m=touchMid(e.touches);gestureRef.current.pinch=true;gestureRef.current.drag=false;gestureRef.current.distance=touchDistance(e.touches);gestureRef.current.zoom=previewZoom;gestureRef.current.midX=m.x;gestureRef.current.midY=m.y;gestureRef.current.startPan={...previewPan}}else if(e.touches.length===1){gestureRef.current.drag=true;gestureRef.current.x=e.touches[0].clientX;gestureRef.current.y=e.touches[0].clientY;gestureRef.current.startAdjust={...headAdjust};gestureRef.current.startPan={...previewPan};gestureRef.current.editHead=optionTool==='head'}};
 const previewTouchMove=e=>{if(!b)return;const g=gestureRef.current;if(e.touches.length===2&&g.pinch){e.preventDefault();const z=Math.max(1,Math.min(4,g.zoom*touchDistance(e.touches)/Math.max(1,g.distance)));const m=touchMid(e.touches);setPreviewZoom(z);setPreviewPan(z<=1?{x:0,y:0}:{x:g.startPan.x+(m.x-g.midX),y:g.startPan.y+(m.y-g.midY)})}else if(e.touches.length===1&&g.drag&&!g.pinch){e.preventDefault();if(g.editHead){const r=e.currentTarget.getBoundingClientRect(),next={...g.startAdjust,x:g.startAdjust.x+(e.touches[0].clientX-g.x)/r.width/previewZoom,y:g.startAdjust.y+(e.touches[0].clientY-g.y)/r.height/previewZoom};scheduleAdjust(next)}else if(previewZoom>1){setPreviewPan({x:g.startPan.x+(e.touches[0].clientX-g.x),y:g.startPan.y+(e.touches[0].clientY-g.y)})}}};
 const previewTouchEnd=e=>{if(e.touches.length<2)gestureRef.current.pinch=false;if(e.touches.length===0&&gestureRef.current.drag){const wasHead=gestureRef.current.editHead;gestureRef.current.drag=false;clearTimeout(renderTimer.current);if(wasHead)applyAdjust(headAdjust)}};
 const previewWheel=e=>{if(!b)return;e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();const old=previewZoom;const factor=Math.exp(-e.deltaY*0.0015);const z=Math.max(1,Math.min(4,old*factor));if(Math.abs(z-old)<.001)return;const cx=e.clientX-rect.left-rect.width/2,cy=e.clientY-rect.top-rect.height/2;const ratio=z/old;setPreviewZoom(z);setPreviewPan(z<=1?{x:0,y:0}:{x:cx-(cx-previewPan.x)*ratio,y:cy-(cy-previewPan.y)*ratio})};
 const go=async()=>{setBusy(true);setMsg('');try{
  const fileKey=[f.name,f.size,f.lastModified].join(':');let transparent=transparentCache.current.key===fileKey?transparentCache.current.blob:null;
  if(!transparent){transparent=await removeBackgroundRobust(f,f.name||'portrait.png');transparentCache.current={key:fileKey,blob:transparent};}
  // V46 PIPELINE: original -> remove.bg -> cut away original neck/body -> AI head+hair+BARE neck/clavicle only
  // -> remove AI temporary background -> normalize against the real fixed uniform -> place UNDER uniform.
  // The AI never receives the uniform template, so it cannot generate a duplicate uniform.
  const sourceHead=await headOnly(transparent);
  // V50: AI receives the ORIGINAL upload, byte-for-byte, exactly as V9's high-fidelity path.
  // sourceHead remains in the existing geometry/remove.bg path only; it is no longer an AI input.
  // This is the targeted fix for the soft downloaded face: V49 still sent a remove.bg head crop
  // that was then canvas-converted to JPEG 0.95 before AI, losing micro-detail before generation.
  const aiHeadNeck=await aiFinishPortrait(f,hairId||'');
  const headNeckTransparent=await removeBackgroundBlob(aiHeadNeck);
  const composed=await composePortrait(headNeckTransparent,{scale:1,x:0,y:0});
  const aiLayer=await makePlacedHeadNeckLayer(headNeckTransparent,composed.lock);
  // V83: brighten/detail only existing skin pixels after AI; no overlay and no face regeneration.
  applyStudioFaceTone(aiLayer);
  // V82: SINGLE AI ANATOMY LAYER — do not paste the photographed face back over the AI result.
  // This removes the post-process face overlay/mask that caused visible face-shaped seams.
  // The processed head/hair/neck remains one continuous transparent layer; uniform/template logic is unchanged.
  const layer=aiLayer;
  editCache.current={layer,lock:composed.lock};
  setHeadAdjust({scale:1,x:0,y:0,rotation:0});setCollarWarp(0);
  const finished=await renderAdjustedFinal(layer,composed.lock,{scale:1,x:0,y:0},0);
  showBlob(finished);
 }catch(e){setMsg(e.message||'ประมวลผลไม่สำเร็จ')}finally{setBusy(false)}};
 if(screen==='home'){
  const rows=[
   {id:'popular',title:'ตัวเลือกยอดนิยม 🔥',cards:[
    {title:'สูทสมัครงาน',img:'/assets/hairstyle-previews/hair-01.png',cat:'job'},
    {title:'ข้าราชการ',img:'/assets/uniform.png',cat:'government',uniform:true},
    {title:'นักศึกษา',img:'/assets/hairstyle-previews/hair-07.png',cat:'student'},
    {title:'ชุดครุย',img:'/assets/hairstyle-previews/hair-20.png',cat:'gown'}]},
   {id:'job',tag:'สมัครงาน',title:'รูปสมัครงาน พร้อมใช้',cards:[
    {title:'สูทหญิงเรียบร้อย',img:'/assets/hairstyle-previews/hair-03.png',cat:'job'},
    {title:'สูทหญิงคอแบะ',img:'/assets/hairstyle-previews/hair-09.png',cat:'job'},
    {title:'สูทชาย แบบ 1',img:'/assets/hairstyle-previews/hair-16.png',cat:'job'},
    {title:'สูทชาย แบบ 2',img:'/assets/hairstyle-previews/hair-24.png',cat:'job'}]},
   {id:'government',tag:'ข้าราชการ',title:'ชุดราชการ',cards:[
    {title:'ปฏิบัติงาน',img:'/assets/uniform.png',cat:'government',uniform:true},
    {title:'ปฏิบัติการ',img:'/assets/uniform.png',cat:'government',uniform:true},
    {title:'ชำนาญการ / อาวุโส',img:'/assets/uniform.png',cat:'government',uniform:true}]},
   {id:'student',tag:'นักศึกษา',title:'รูปนักศึกษา',cards:[
    {title:'นักศึกษา หญิง',img:'/assets/hairstyle-previews/hair-12.png',cat:'student'},
    {title:'นักศึกษา ชาย',img:'/assets/hairstyle-previews/hair-18.png',cat:'student'}]},
   {id:'gown',tag:'ชุดครุย',title:'ชุดครุยมหาวิทยาลัย',cards:[
    {title:'เพิ่มมหาวิทยาลัยภายหลัง',img:'/assets/hairstyle-previews/hair-28.png',cat:'gown'}]}
  ];
  const visibleRows=homeFilter==='all'?rows:rows.filter(r=>r.id===homeFilter);
  const governmentLevels=[['operational','ปฏิบัติงาน'],['academic','ปฏิบัติการ'],['senior','ชำนาญการ / อาวุโส']];
  const governmentAffiliations=[{id:'finance',name:'กระทรวงการคลัง',img:'/assets/uniform.png'}];
  return <main className="profile-home">
   <header className="profile-home-header">{homeFilter!=='all'?<button type="button" className="home-back-button" onClick={()=>setHomeFilter('all')} aria-label="กลับหน้าแรก">‹ <span>หน้าแรก</span></button>:<div className="home-spacer"></div>}<h1>รูปโปรไฟล์</h1><button type="button" className="my-pill">ของฉัน</button></header>
   <nav className="home-tabs">{[['job','สมัครงาน'],['government','ข้าราชการ'],['student','นักศึกษา'],['gown','ชุดครุย']].map(([id,n])=><button type="button" key={id} className={homeFilter===id?'active':''} onClick={()=>{setUniformCategory(id);setHomeFilter(id)}}>{n}</button>)}</nav>
   <section className="home-content">
    {homeFilter==='government'&&<section className="government-filter-panel"><div className="government-filter-title"><span>ข้าราชการ</span><h2>เลือกแบบชุด</h2></div><div className="government-gender-tabs"><button type="button" className={gender==='male'?'active':''} onClick={()=>setGender('male')}>ชาย</button><button type="button" className={gender==='female'?'active':''} onClick={()=>setGender('female')}>หญิง</button></div><div className="government-level-grid">{governmentLevels.map(([id,n])=><button type="button" key={id} className={level===id?'selected':''} onClick={()=>{setLevel(id);setSelectedStyle(n)}}><img src="/assets/uniform.png"/><strong>{n}</strong><span className="selected-mark">✓</span></button>)}</div><div className="affiliation-section"><div className="affiliation-heading"><h3>เลือกสังกัด</h3><span>แสดงตามระดับที่เลือก</span></div><div className="affiliation-list">{governmentAffiliations.map(a=><button type="button" key={a.id} className="affiliation-card" onClick={()=>{setMinistry(a.name);setUniformCategory('government');setSelectedStyle((governmentLevels.find(x=>x[0]===level)?.[1]||'ชุดราชการ')+' · '+a.name);setAffiliationPreview(true)}}><img src={a.img}/><div><strong>{a.name}</strong><small>{gender==='male'?'ชาย':'หญิง'} · {governmentLevels.find(x=>x[0]===level)?.[1]}</small></div><b>›</b></button>)}</div>{affiliationPreview&&<div className="affiliation-preview"><div className="affiliation-preview-head"><div><span>ตัวอย่างชุดที่เลือก</span><strong>{selectedStyle}</strong></div></div><div className="affiliation-preview-card"><img src="/assets/uniform.png" alt="ตัวอย่างชุดราชการ"/><button type="button" onClick={()=>setScreen('process')}>เลือกแบบนี้</button></div></div>}</div></section>}
    {homeFilter!=='government'&&visibleRows.map(r=><HomeRow key={r.id} tag={r.tag} title={r.title} cards={r.cards}/>)}
   </section>
  </main>;
 }
 function HomeRow({title,tag,cards}){return <section className="home-row"><div className="home-row-head"><div className="home-row-title">{tag&&<span>{tag}</span>}<h2>{title}</h2></div></div><div className="home-card-strip">{cards.map((c,i)=><button type="button" className="home-style-card" key={c.title+i} onClick={()=>{setUniformCategory(c.cat);setSelectedStyle(c.title);setScreen('process')}}><div className={'home-card-image '+(c.uniform?'uniform-card':'')}><img src={c.img}/><div className="home-card-shade"></div><strong>{c.title}</strong></div></button>)}</div></section>}
 return <main className="app-shell modern-shell adaptive-editor"><header className="mobile-topbar process-mobile-topbar editor-context-header"><button type="button" className="detail-back" onClick={()=>{setScreen('home');setHomeFilter(uniformCategory==='government'?'government':uniformCategory)}} aria-label="กลับหน้าก่อนหน้า">‹</button><div><div className="eyebrow">PHOTO READY</div><h1>{selectedStyle||'สร้างรูป'}</h1></div><div className="step-badge">ของฉัน</div></header><section className="modern-flow">
  <section className="style-detail-card"><div className="detail-title process-page-title editor-preview-heading"><h2>เพิ่มรูป</h2><span>{selectedStyle||'แบบที่เลือก'}</span></div><label className={"hero-preview preview-upload "+(b?"direct-edit-preview":"")} onPointerDown={previewPointerDown} onPointerMove={previewPointerMove} onPointerUp={previewPointerUp} onPointerCancel={previewPointerUp} onTouchStart={previewTouchStart} onTouchMove={previewTouchMove} onTouchEnd={previewTouchEnd} onWheel={previewWheel} onClick={e=>{if(a||b){e.preventDefault();if(optionTool)setOptionTool(null)}}}><input type="file" accept="image/*" onChange={pick}/>{b?<><img src={comparePreview&&a?a:b} className="editable-result-image" style={{transform:`translate3d(${comparePreview?0:previewPan.x}px,${comparePreview?0:previewPan.y}px,0) scale(${comparePreview?1:previewZoom})`}}/><div className="preview-floating-actions"><button type="button" onClick={e=>{e.preventDefault();e.stopPropagation();setComparePreview(false);setPreviewZoom(1);setPreviewPan({x:0,y:0});applyAdjust({scale:1,x:0,y:0,rotation:0});applyCollarWarp(0)}} onPointerDown={e=>e.stopPropagation()} aria-label="รีเซ็ต"><span>↻</span><small>รีเซ็ต</small></button><button type="button" className={comparePreview?'active':''} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.preventDefault();e.stopPropagation();setComparePreview(v=>!v)}} aria-label="เปรียบเทียบ"><span>◐</span><small>เปรียบเทียบ</small></button></div>{!comparePreview&&<span className="preview-edit-hint">เลือก “ปรับหัว” แล้วลากเพื่อย้ายหัว · โหมดอื่นลากมุมมองเมื่อซูม · สองนิ้ว/ล้อเมาส์เพื่อซูม</span>}</>:a?<><img src={a} className="source-preview"/></>:<div className="preview-empty"><span className="add-photo">+ เพิ่มรูป</span><small>JPG · PNG · WEBP</small></div>}</label>
   <div className="quick-config">
    {uniformCategory==='government'&&<><label className="field-label">กระทรวง / สังกัด<select value={ministry} onChange={e=>setMinistry(e.target.value)}><option>กระทรวงการคลัง</option><option disabled>เพิ่มกระทรวงอื่นภายหลัง</option></select></label><div className="gender-tabs"><button className={gender==='male'?'active':''} onClick={()=>setGender('male')}>ชาย</button><button className={gender==='female'?'active':''} onClick={()=>setGender('female')}>หญิง</button></div><div className="level-grid">{[['operational','ปฏิบัติงาน'],['academic','ปฏิบัติการ'],['senior','ชำนาญการ / อาวุโส']].map(([id,n])=><button type="button" key={id} className={level===id?'active':''} onClick={()=>setLevel(id)}>{n}</button>)}</div></>}
    {uniformCategory!=='government'&&uniformCategory!=='gown'&&<div className="gender-tabs"><button className={gender==='male'?'active':''} onClick={()=>setGender('male')}>ชาย</button><button className={gender==='female'?'active':''} onClick={()=>setGender('female')}>หญิง</button></div>}
    {uniformCategory==='gown'&&<><label className="field-label">มหาวิทยาลัย<select disabled><option>เพิ่มมหาวิทยาลัยภายหลัง</option></select></label><div className="gender-tabs"><button className={gender==='male'?'active':''} onClick={()=>setGender('male')}>ชาย</button><button className={gender==='female'?'active':''} onClick={()=>setGender('female')}>หญิง</button></div></>}
   </div>
   <button className={"primary-action create-now process-first "+(b?"processed-hidden":"")} disabled={!f||hairId===null||busy} onClick={go}>{busy?'กำลังประมวลผล…':'ประมวลผลรูป'}</button>{msg&&<div className="err">{msg}</div>}{optionTool&&<div className="tool-choice-sheet">{optionTool==='head'?<><div className="tool-choice-tabs"><span className="active">ปรับหัว</span><span>ขนาดและตำแหน่ง</span></div><div className="compact-tool-panel process-head-adjust"><div className="compact-slider-list"><label><span>ขนาด</span><input type="range" min="20" max="200" step="1" value={Math.round(headAdjust.scale*100)} onChange={e=>scheduleAdjust({...headAdjust,scale:Number(e.target.value)/100})}/><b>{Math.round(headAdjust.scale*100)}%</b></label><label><span>ซ้าย–ขวา</span><input type="range" min="-50" max="50" step="0.5" value={headAdjust.x*100} onChange={e=>scheduleAdjust({...headAdjust,x:Number(e.target.value)/100})}/><b>{headAdjust.x>=0?'+':''}{(headAdjust.x*100).toFixed(1)}%</b></label><label><span>บน–ล่าง</span><input type="range" min="-50" max="50" step="0.5" value={headAdjust.y*100} onChange={e=>scheduleAdjust({...headAdjust,y:Number(e.target.value)/100})}/><b>{headAdjust.y>=0?'+':''}{(headAdjust.y*100).toFixed(1)}%</b></label><label><span>เอียง</span><input type="range" min="-30" max="30" step="0.5" value={headAdjust.rotation||0} onChange={e=>scheduleAdjust({...headAdjust,rotation:Number(e.target.value)})}/><b>{(headAdjust.rotation||0)>=0?'+':''}{(headAdjust.rotation||0).toFixed(1)}°</b></label></div></div></>:optionTool==='collar'?<><div className="tool-choice-tabs"><span className="active">ช่องคอ</span><span>บิดเฉพาะ Template ชุด</span></div><div className="compact-tool-panel"><div className="collar-compact-actions"><button type="button" className="collar-auto compact-auto" onClick={autoFitCollar}>พอดีอัตโนมัติ</button></div><div className="compact-slider-list"><label><span>หุบ–ขยาย</span><input type="range" min="-100" max="100" step="1" value={Math.round(collarWarp*100)} onChange={e=>applyCollarWarp(Number(e.target.value)/100)}/><b>{Math.round(collarWarp*100)}%</b></label></div></div></>:<><div className="tool-choice-tabs"><span className="active">{optionTool==='ribbon'?'แพรแถบ':optionTool==='background'?'พื้นหลัง':optionTool==='male-hair'?'ทรงผมชาย':'ทรงผมหญิง'}</span><span>{optionTool==='ribbon'?'เลือกแบบ':optionTool==='background'?'เลือกสีพื้นหลัง':'แตะรูปเพื่อเลือกทรง'}</span></div>{optionTool==='background'?<div className="background-choice-preview"><button type="button" className="background-swatch current" aria-label="พื้นหลังปัจจุบัน"><span></span><strong>พื้นหลังปัจจุบัน</strong></button><small>โครง UI พร้อมสำหรับตัวเลือกพื้นหลังเดิม/ที่จะเพิ่มภายหลัง</small></div>:optionTool!=='ribbon'?<div className="choice-rail-wrap"><button type="button" className="choice-rail-arrow choice-rail-left" onClick={()=>scrollChoiceRail(-1)} aria-label="เลื่อนรายการไปทางซ้าย">‹</button><div ref={choiceRailRef} className="hair-carousel process-thumbnail-strip choice-scroll-rail"><button type="button" className={'hair-card no-hair-card '+(hairId===''?'selected':'')} onClick={()=>setHairId('')}><span className="no-hair-icon">✓</span><span>ผมเดิม</span></button>{HAIR_OPTIONS.map(h=><button type="button" key={h.id} className={'hair-card '+(hairId===h.id?'selected':'')} onClick={()=>setHairId(h.id)}><img src={h.src}/><span>{h.name.replace('ทรงผม ','')}</span></button>)}</div><button type="button" className="choice-rail-arrow choice-rail-right" onClick={()=>scrollChoiceRail(1)} aria-label="เลื่อนรายการไปทางขวา">›</button></div>:<div className="ribbon-choice-preview"><div className="ribbon-empty-thumb"><span>▤</span><strong>แพรแถบ</strong><small>รอเพิ่มไฟล์ PNG ตัวเลือก</small></div></div>}</>}</div>}<div className="tool-rail-wrap"><button type="button" className="tool-rail-arrow tool-rail-left" onClick={()=>scrollToolBar(-1)} aria-label="เลื่อนเครื่องมือไปทางซ้าย">‹</button><div ref={toolBarRef} className="option-icon-bar process-option-bar simple-line-tools"><button type="button" className={optionTool==='head'?'active':''} onClick={()=>toggleOptionTool('head')}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/adjust-face.svg" alt=""/></span><strong>ปรับหัว</strong></button><button type="button" className={optionTool==='collar'?'active':''} onClick={()=>toggleOptionTool('collar')}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/clothes.svg" alt=""/></span><strong>ช่องคอ</strong></button><button type="button" className={optionTool==='male-hair'?'active':''} onClick={()=>toggleOptionTool('male-hair',()=>setGender('male'))}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/hair-male.svg" alt=""/></span><strong>ทรงผมชาย</strong></button><button type="button" className={optionTool==='female-hair'?'active':''} onClick={()=>toggleOptionTool('female-hair',()=>setGender('female'))}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/hair-female.svg" alt=""/></span><strong>ทรงผมหญิง</strong></button><button type="button" className={optionTool==='ribbon'?'active':''} onClick={()=>toggleOptionTool('ribbon')}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/ribbon-bars.svg" alt=""/></span><strong>แพรแถบ</strong></button><button type="button" className={optionTool==='background'?'active':''} onClick={()=>toggleOptionTool('background')}><span className="line-tool-icon" aria-hidden="true"><img src="/app-icons/background.svg" alt=""/></span><strong>พื้นหลัง</strong></button></div><button type="button" className="tool-rail-arrow tool-rail-right" onClick={()=>scrollToolBar(1)} aria-label="เลื่อนเครื่องมือไปทางขวา">›</button></div>{b&&<a className="primary-action download-below-tools" href={b} download="photo-ready.png">ดาวน์โหลด</a>}
  </section>

 </section></main>
}
createRoot(document.getElementById('root')).render(<App/>);
