import React,{useState}from'react';
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

async function composePortrait(headBlob){
 const bg=await loadImage('/assets/background.jpg');
 const uniformImg=await loadImage('/assets/uniform.png');
 const headURL=URL.createObjectURL(headBlob);
 try{
  const head=await loadImage(headURL), uniform=uniformImg;
  const hb=await alphaBounds(head);
  const W=bg.naturalWidth,H=bg.naturalHeight;
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const ctx=c.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(bg,0,0,W,H);

  // ชุด: ยึดไฟล์ PNG จริงและวางตำแหน่งตาม reference #3
  const uW=W*.94,uScale=uW/uniform.naturalWidth,uH=uniform.naturalHeight*uScale;
  const uX=(W-uW)/2,uY=H*.425;

  // Geometry ของ template นี้: ช่องคออยู่กึ่งกลางชุด
  const collarCX=W*.5;
  const collarTop=uY+uH*.015;
  const collarOpening=uW*.235;

  // ใช้ "ขอบศีรษะจริง" หลังตัด alpha ไม่ใช้ขนาด canvas ต้นฉบับ
  // เป้าหมาย: ความกว้างหัวสัมพันธ์กับช่องคอและความกว้างไหล่ของชุด
  const targetVisibleHeadW=collarOpening*2.02;
  let scale=targetVisibleHeadW/hb.w;

  // จำกัดช่วงเพื่อกันรูปต้นฉบับที่ crop/zoom ผิดปกติ
  const minHeadW=uW*.285,maxHeadW=uW*.37;
  const proposed=hb.w*scale;
  if(proposed<minHeadW)scale=minHeadW/hb.w;
  if(proposed>maxHeadW)scale=maxHeadW/hb.w;

  const visibleW=hb.w*scale,visibleH=hb.h*scale;
  const visibleLeft=collarCX-visibleW/2;

  // คางซ้อนลงใต้ปกเสื้อเล็กน้อย เพื่อให้ชุดเป็น foreground ซ่อนรอยต่อ
  const overlap=uH*.052;
  const visibleTop=collarTop-visibleH+overlap;

  // แปลงตำแหน่ง visible bounds กลับเป็นตำแหน่ง canvas ของ head
  const hX=visibleLeft-hb.l*scale;
  const hY=visibleTop-hb.t*scale;
  const hW=head.naturalWidth*scale,hH=head.naturalHeight*scale;

  // ลำดับเลเยอร์: background -> head -> uniform
  ctx.drawImage(head,hX,hY,hW,hH);
  ctx.drawImage(uniform,uX,uY,uW,uH);

  return await new Promise((ok,bad)=>c.toBlob(v=>v?ok(v):bad(Error('สร้างภาพประกอบไม่สำเร็จ')),'image/jpeg',.97));
 }finally{URL.revokeObjectURL(headURL)}
}
function App(){
 const[f,setF]=useState(),[a,setA]=useState(),[b,setB]=useState(),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 const pick=e=>{const v=e.target.files?.[0];if(v){setF(v);setA(URL.createObjectURL(v));setB();setMsg('')}};
 const go=async()=>{setBusy(true);setMsg('');try{
  const d=new FormData();d.append('image',f);
  const r=await fetch('/api/remove-background',{method:'POST',body:d});
  if(!r.ok)throw Error(await r.text());
  const transparent=await r.blob();
  const head=await headOnly(transparent);
  const composed=await composePortrait(head);
  setB(URL.createObjectURL(composed));
 }catch(e){setMsg(e.message||'ประมวลผลไม่สำเร็จ')}finally{setBusy(false)}};
 return <main><h1>ประกอบหัวกับชุด PNG โปร่งใสอัตโนมัติ</h1><p>กดครั้งเดียว: ลบพื้นหลัง → วิเคราะห์กรอบหน้า → ลบพื้นหลัง → แยกศีรษะ → วัดขอบหัวจริง → ปรับสัดส่วนกับช่องคอ/ไหล่ → วางหัวใต้ชุดอัตโนมัติ</p><section>
 <label className="upload"><input type="file" accept="image/*" onChange={pick}/>{a?<img src={a}/>:<><strong>เลือกรูปภาพ</strong><small>JPG · PNG · WEBP</small></>}</label>
 <button disabled={!f||busy} onClick={go}>{busy?'กำลังลบพื้นหลังและเก็บเฉพาะศีรษะ…':'ประมวลผลอัตโนมัติ'}</button>
 {msg&&<div className="err">{msg}</div>}
 {b&&<div className="grid"><figure><figcaption>ต้นฉบับ</figcaption><img src={a}/></figure><figure><figcaption>ผลลัพธ์ประกอบอัตโนมัติ</figcaption><div className="check"><img src={b}/></div></figure></div>}
 {b&&<a className="save" href={b} download="photo-composed.jpg">ดาวน์โหลดภาพ</a>}
 </section></main>
}
createRoot(document.getElementById('root')).render(<App/>);
