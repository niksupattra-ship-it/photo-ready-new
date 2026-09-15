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
  const data=ctx.getImageData(0,0,W,H);
  const lm=(await getLandmarker()).detect(im).faceLandmarks?.[0];
  if(!lm) throw Error('ตรวจจับกรอบหน้าไม่สำเร็จ กรุณาใช้รูปหน้าตรงที่เห็นใบหน้าชัด');

  // แนวกราม MediaPipe: ใต้หูซ้าย -> กราม -> คาง -> กราม -> ใต้หูขวา
  const jawIdx=[234,93,132,58,172,136,150,149,176,148,152,377,400,378,379,365,397,288,361,323,454];
  let jaw=jawIdx.map(i=>({x:lm[i].x*W,y:lm[i].y*H})).sort((a,b)=>a.x-b.x);

  // ขยายจุดเริ่ม/จบเล็กน้อยไปถึงใต้ใบหู เพื่อไม่เหลือเศษคอด้านข้าง
  const faceW=jaw[jaw.length-1].x-jaw[0].x;
  const pad=Math.max(2,faceW*.025);
  jaw[0].x-=pad;jaw[jaw.length-1].x+=pad;

  // V2: เก็บ alpha เดิมของ remove.bg ทั้งศีรษะ/ผม/หู และแก้เฉพาะรอยตัดใต้กราม
  // ใช้ขอบนุ่มระดับ sub-pixel 1.5–2.5 px ตามขนาดใบหน้า เพื่อลดฟันเลื่อยโดยไม่ทำให้กรามฟุ้ง
  const left=jaw[0],right=jaw[jaw.length-1];
  const feather=Math.max(1.25,Math.min(2.5,faceW*.008));
  const eraseMargin=Math.max(.35,faceW*.0015);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const ai=(y*W+x)*4+3,origA=data.data[ai];if(origA===0)continue;
   let boundary=null;
   if(x>=left.x&&x<=right.x) boundary=interp(jaw,x);
   else if(x<left.x) boundary=left.y + Math.min(0,(x-left.x)*.12);
   else boundary=right.y + Math.min(0,(right.x-x)*.12);
   if(boundary===null)continue;
   const d=y-(boundary+eraseMargin);
   if(d>=feather){data.data[ai]=0;}
   else if(d>-feather){
    // smoothstep: premultiplied-like alpha transition, RGB ไม่ถูกสร้างหรือแก้
    const t=(d+feather)/(2*feather);
    const smooth=t*t*(3-2*t);
    data.data[ai]=Math.round(origA*(1-smooth));
   }
  }
  ctx.putImageData(data,0,0);
  return await new Promise(ok=>c.toBlob(ok,'image/png'));
 }finally{URL.revokeObjectURL(url)}
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
  setB(URL.createObjectURL(head));
 }catch(e){setMsg(e.message||'ประมวลผลไม่สำเร็จ')}finally{setBusy(false)}};
 return <main><h1>แยกศีรษะอัตโนมัติ · ขอบกรามเนียน V2</h1><p>กดครั้งเดียว: ลบพื้นหลัง → วิเคราะห์กรอบหน้า → ลบคอและลำตัวตามแนวกรามอัตโนมัติ</p><section>
 <label className="upload"><input type="file" accept="image/*" onChange={pick}/>{a?<img src={a}/>:<><strong>เลือกรูปภาพ</strong><small>JPG · PNG · WEBP</small></>}</label>
 <button disabled={!f||busy} onClick={go}>{busy?'กำลังลบพื้นหลังและเก็บเฉพาะศีรษะ…':'ประมวลผลอัตโนมัติ'}</button>
 {msg&&<div className="err">{msg}</div>}
 {b&&<div className="grid"><figure><figcaption>ต้นฉบับ</figcaption><img src={a}/></figure><figure><figcaption>ผลลัพธ์หลัง 2 ขั้นตอน</figcaption><div className="check"><img src={b}/></div></figure></div>}
 {b&&<a className="save" href={b} download="head-only.png">ดาวน์โหลด PNG</a>}
 </section></main>
}
createRoot(document.getElementById('root')).render(<App/>);
