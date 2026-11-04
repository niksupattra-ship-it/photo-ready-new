async function composePortrait(headBlob,adjust={scale:1,x:0,y:0},templatePath='/assets/uniform.png'){
 const [bg,uniformImg]=await Promise.all([loadImage('/assets/background.jpg'),loadImage(templatePath)]);
 try{
  const head=await decodedPortraitImage(headBlob), uniform=uniformImg;
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

  // Keep head placement tied to the facial eye anchor, not hair silhouette.
  // One common X/Y scale preserves the source face aspect ratio.
  const targetEyeW=W*.160;
  const canonicalScale=targetEyeW/sourceEyeW;
  const corrected=1;

  // V17: หลังได้ตำแหน่ง V16 แล้ว เพิ่ม optical head size เล็กน้อยให้สัมพันธ์กับช่วงไหล่มากขึ้น
  // ใช้ multiplier ภายใน ไม่ผูกกับขนาด/crop ของภาพต้นฉบับ
  // V37 FINAL HEAD PROPORTION: after canonical face normalization and shoulder fitting,
  // reduce the final head block slightly so head/neck reads naturally against the fixed real uniform.
  // Uniform geometry is untouched; only the head layer scale changes, uniformly in X/Y.
  // V228: return to V226's original placement; proportion is handled when
  // the AI creates the hair and neck, not by shrinking the finished layer.
  const v37FinalHeadScale=1.28; // Slightly smaller initial head; preserve face proportions and the existing chin/template anchors.
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
 }finally{}
}
