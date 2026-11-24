import {loadVisionRuntime,createCompatibleVisionModel} from './vision-runtime.js';
import {VISION_WASM_ROOT,FACE_LANDMARK_MODEL,POSE_LANDMARK_MODEL} from './vision-assets.js';
import {withDeadline} from './async-deadline.js';
import {assessUploadPortrait} from './photo-upload-assessment.js';
import './photo-upload-scan.css';

export async function inspectUploadPortrait(file){
 let faceModel,poseModel,expired=false,url,result;
 const pending=(async()=>{
  url=URL.createObjectURL(file);const im=new Image();im.src=url;await im.decode();
  const scale=Math.min(1,1024/Math.max(im.naturalWidth,im.naturalHeight));
  const canvas=Object.assign(document.createElement('canvas'),{width:Math.round(im.naturalWidth*scale),height:Math.round(im.naturalHeight*scale)});
  canvas.getContext('2d').drawImage(im,0,0,canvas.width,canvas.height);
  const runtime=await loadVisionRuntime();
  const make=async(Type,path,extra)=>createCompatibleVisionModel({resolver:runtime.FilesetResolver,root:VISION_WASM_ROOT,options:{baseOptions:{modelAssetPath:path},runningMode:'IMAGE',...extra},create:(vision,options)=>{if(expired)throw Error('scan expired');return Type.createFromOptions(vision,options)}});
  faceModel=await make(runtime.FaceLandmarker,FACE_LANDMARK_MODEL,{numFaces:2,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5});
  if(expired)return;
  const faces=faceModel.detect(canvas).faceLandmarks||[];
  faceModel.close();faceModel=null;
  if(faces.length!==1)return assessUploadPortrait({faces});
  poseModel=await make(runtime.PoseLandmarker,POSE_LANDMARK_MODEL,{numPoses:1,outputSegmentationMasks:true,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5});
  if(expired)return;
  result=poseModel.detect(canvas);
  const mask=result.segmentationMasks?.[0];let crownTouchesEdge=false;
  if(mask){
   const data=mask.getAsFloat32Array(),face=faces[0],xs=face.map(p=>p.x),lo=Math.max(0,Math.floor((Math.min(...xs)-.04)*mask.width)),hi=Math.min(mask.width,Math.ceil((Math.max(...xs)+.04)*mask.width));
   let hit=0;for(let x=lo;x<hi;x++)if(data[x]>.75)hit++;
   crownTouchesEdge=hit>Math.max(3,(hi-lo)*.15);
  }
  return assessUploadPortrait({faces,pose:result.landmarks?.[0]||[],crownTouchesEdge});
 })();
 const cleanup=()=>{for(const mask of result?.segmentationMasks||[])mask.close?.();faceModel?.close?.();poseModel?.close?.();if(url)URL.revokeObjectURL(url)};
 pending.finally(cleanup).catch(()=>{});
 return withDeadline(pending,{timeoutMs:60000,code:'UPLOAD_SCAN_UNAVAILABLE',onTimeout:()=>{expired=true}});
}

// One transient dialog owns the candidate only. The editor is untouched until
// this resolves true; rejecting/cancelling never resets paid work or its history.
export async function scanNewPortrait(file,{inspect=inspectUploadPortrait}={}){
 const previous=document.activeElement,url=URL.createObjectURL(file),host=document.createElement('div');host.className='photo-upload-scan';
 host.innerHTML='<section class="photo-upload-scan-card" role="dialog" aria-modal="true" aria-labelledby="photo-upload-scan-title"><button type="button" class="photo-upload-scan-close" aria-label="ยกเลิก">×</button><h2 id="photo-upload-scan-title">กำลังตรวจรูปก่อนเริ่ม</h2><div class="photo-upload-scan-image"><img alt="รูปที่กำลังตรวจ"/><div class="photo-upload-scan-beam" aria-hidden="true"></div></div><div class="photo-upload-scan-copy" role="status" aria-live="polite">กำลังตรวจหัว คอ ไหล่ ต้นแขน และลำตัวช่วงบน…</div><div class="photo-upload-scan-actions"></div></section>';
 host.querySelector('img').src=url;document.body.append(host);const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
 let done=false,attempt=0,finish;
 const answer=new Promise(resolve=>{finish=value=>{if(done)return;done=true;attempt++;host.remove();URL.revokeObjectURL(url);document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',keys,true);previous?.focus?.();resolve(value)}});
 const keys=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false)}if(e.key==='Tab'){const buttons=[...host.querySelectorAll('button')];const i=buttons.indexOf(document.activeElement);e.preventDefault();buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus()}};
 document.addEventListener('keydown',keys,true);const close=host.querySelector('button');close.onclick=()=>finish(false);close.focus();
 const title=host.querySelector('h2'),copy=host.querySelector('.photo-upload-scan-copy'),actions=host.querySelector('.photo-upload-scan-actions');
 const button=(text,click)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=click;actions.append(b)};
 const run=async()=>{
  const id=++attempt;host.dataset.state='scanning';title.textContent='กำลังตรวจรูปก่อนเริ่ม';copy.textContent='กำลังตรวจหัว คอ ไหล่ ต้นแขน และลำตัวช่วงบน…';actions.replaceChildren();
  let report;try{report=await inspect(file)}catch{report={status:'unavailable'}}
  if(done||id!==attempt)return;
  host.dataset.state=report.status;
  if(report.status==='pass'){title.textContent='รูปพร้อมใช้งาน';copy.textContent='ตรวจหัว คอ ไหล่ และลำตัวช่วงบนแล้ว กำลังไปขั้นตอนถัดไป';setTimeout(()=>finish(true),450);return}
  const technical=report.status==='unavailable',uncertain=report.status==='uncertain';
  title.textContent=technical?'เครื่องมือตรวจยังไม่พร้อม':uncertain?'ยังตรวจรูปได้ไม่ครบ':'แนะนำให้เปลี่ยนรูป';
  copy.replaceChildren();
  const lines=technical?['ยังตรวจรูปไม่ได้ ไม่ได้หมายความว่ารูปไม่ผ่าน และยังไม่ได้ส่งงาน AI']:uncertain?report.uncertain:report.issues;
  for(const text of lines){const p=document.createElement('p');p.textContent=text;copy.append(p)}
  const hint=document.createElement('p');hint.textContent='เลือกรูปที่เห็นยอดผม คอ ไหล่ทั้งสองข้าง ต้นแขน และช่วงอก ไม่จำเป็นต้องเห็นมือหรือแขนเต็ม';copy.append(hint);
  button('กลับไปเลือกรูปใหม่',()=>finish(false));
  if(technical||uncertain){button('ตรวจอีกครั้ง',run);button('ใช้รูปนี้ต่อ',()=>finish(true))}
 };
 void run();return answer;
}
