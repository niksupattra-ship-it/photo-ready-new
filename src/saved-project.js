import {portraitFinishChoice} from './portrait-finish-choice.js';
import {createProjectResourceGuard} from './project-resource-guard.js';
import {isFemaleFinishProfile} from './female-finish-profile.js';
import {isFemaleFinishReference,FEMALE_FINISH_REFERENCE_MAX_EDGE} from './female-finish-reference.js';
const imageURL=/^data:image\/(png|jpeg|webp);base64,/;
const imageFields=['source','processedOriginalSource','hairOriginalSource','makeupBaseSource','makeupFullSource','mask','warpSource','warpBaseMask','eraseRestoreSource','warpRestoreBase'];
const isHead=l=>l.kind==='head'||l.name==='หัว · คอ · ผม';
const abort=signal=>{if(signal?.aborted)throw Object.assign(Error('ยกเลิกการเปิดงานแล้ว'),{name:'AbortError'})};
export function assertSavedProjectResources(project){validateSavedProject(project);return createProjectResourceGuard(project)}
export function validateSavedProject(project){
 if(project?.format!=='idprom-studio'||project.version!==1||project.width!==900||project.height!==1200||!Array.isArray(project.layers)||!project.layers.length||project.layers.length>20)throw Error('รูปแบบโปรเจกต์ไม่ถูกต้อง');
 for(const l of project.layers){
  if(typeof l.name!=='string'||!imageURL.test(l.source)||![l.x,l.y,l.scale,l.rotation,l.opacity].every(Number.isFinite)||l.scale<.1||l.scale>5||l.opacity<0||l.opacity>1)throw Error('ข้อมูลเลเยอร์ไม่ถูกต้อง');
  if(['squeezeX','squeezeY'].some(k=>l[k]!==undefined&&(!Number.isFinite(l[k])||l[k]<.1||l[k]>3)))throw Error('สัดส่วนเลเยอร์ไม่ถูกต้อง');
  if(l.sourceFrame&&(!['x','y','w','h'].every(k=>Number.isFinite(l.sourceFrame[k]))||l.sourceFrame.w<=0||l.sourceFrame.h<=0))throw Error('ตำแหน่งภาพต้นทางไม่ถูกต้อง');
  if(l.femaleFinishProfile!==undefined&&!isFemaleFinishProfile(l.femaleFinishProfile))throw Error('ข้อมูลโทนผิวที่บันทึกไม่ถูกต้อง');
  if(l.femaleFinishReference!==undefined&&!isFemaleFinishReference(l.femaleFinishReference))throw Error('ภาพอ้างอิงโทนผิวที่บันทึกไม่ถูกต้อง');
  for(const key of imageFields)if(l[key]&&!imageURL.test(l[key]))throw Error('ภาพในโปรเจกต์ไม่ถูกต้อง');
  if(l.collarParts&&(!imageURL.test(l.collarParts.left)||!imageURL.test(l.collarParts.right)))throw Error('ภาพเข็มปกคอไม่ถูกต้อง');
 }
 if(project.downloadSource&&!imageURL.test(project.downloadSource))throw Error('ต้นฉบับดาวน์โหลดไม่ถูกต้อง');
 if(project.downloadWorkId!==undefined&& !/^dwork_[a-f0-9]{36}$/.test(project.downloadWorkId))throw Error('รหัสงานไม่ถูกต้อง');
 if(project.compareSource&&!imageURL.test(project.compareSource))throw Error('รูปต้นฉบับไม่ถูกต้อง');
 if(project.placement&&(!['W','H','uX','uY','uW','uH'].every(k=>Number.isFinite(project.placement[k]))||project.placement.W<=0||project.placement.H<=0||project.placement.uW<=0||project.placement.uH<=0))throw Error('ตำแหน่งชุดไม่ถูกต้อง');
 return project;
}
export function blobDataURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('อ่านรูปต้นฉบับไม่สำเร็จ'));reader.readAsDataURL(blob)})}
export async function makeSavedProject(snapshot){
 const project={format:'idprom-studio',version:1,width:900,height:1200,placement:snapshot.placement||null,layers:snapshot.layers,compareSource:snapshot.compareSource||snapshot.originalPreview||null};
 if(!project.compareSource&&snapshot.sourcePhoto)project.compareSource=await blobDataURL(snapshot.sourcePhoto);
 if(snapshot.sourcePhoto?.idpromDownloadWorkId){project.downloadWorkId=snapshot.sourcePhoto.idpromDownloadWorkId;project.downloadSource=await blobDataURL(snapshot.sourcePhoto)}
 return validateSavedProject(project);
}
// Decode everything before changing the active project; a failed image leaves the current work intact.
export async function prepareSavedProject(project,{decode,fetchImage=fetch,makeFile=(blob)=>new File([blob],'original-portrait.png',{type:blob.type}),signal}){
 abort(signal);const resources=assertSavedProjectResources(project);
 const decoded=new Map();
 const bounded=operation=>new Promise((resolve,reject)=>{
  let settled=false,timer;const finish=(callback,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);callback(value)};
  const cancel=()=>{try{abort(signal)}catch(error){finish(reject,error)}};
  if(signal?.aborted){cancel();return}signal?.addEventListener('abort',cancel,{once:true});
  timer=setTimeout(()=>finish(reject,Object.assign(Error('เปิดไฟล์งานใช้เวลานาน กรุณาลองอีกครั้ง งานปัจจุบันยังอยู่'),{code:'PROJECT_READ_TIMEOUT'})),15000);
  Promise.resolve().then(async()=>{abort(signal);const value=await operation();abort(signal);return value}).then(value=>finish(resolve,value),error=>finish(reject,error));
 });
 const read=async(src,collar=false)=>{abort(signal);if(!decoded.has(src)){const im=await bounded(()=>decode(src)),w=im.naturalWidth||im.width,h=im.naturalHeight||im.height;resources.checkDecoded(src,w,h);if(w<1||h<1||w>(collar?16384:8192)||h>8192)throw Error('ขนาดภาพเลเยอร์ไม่ถูกต้อง');decoded.set(src,im)}return decoded.get(src)};
 const blob=src=>bounded(async()=>{const response=await fetchImage(src,{signal});abort(signal);const data=await response.blob();abort(signal);return data});
 for(const l of project.layers){
  const original=await read(l.source,Boolean(l.collarParts));
  for(const key of imageFields.slice(1))if(l[key]){const im=await read(l[key],Boolean(l.collarParts));if(['eraseRestoreSource','warpRestoreBase'].includes(key)&&((im.naturalWidth||im.width)!==(original.naturalWidth||original.width)||(im.naturalHeight||im.height)!==(original.naturalHeight||original.height)))throw Error('ขนาดภาพอ้างอิงคืนขอบไม่ตรงกับเลเยอร์')}
  if(l.femaleFinishReference){const im=await read(l.femaleFinishReference);if((im.naturalWidth||im.width)>FEMALE_FINISH_REFERENCE_MAX_EDGE||(im.naturalHeight||im.height)>FEMALE_FINISH_REFERENCE_MAX_EDGE)throw Error('ขนาดภาพอ้างอิงโทนผิวที่บันทึกไม่ถูกต้อง')}
  if(l.collarParts)for(const src of [l.collarParts.left,l.collarParts.right]){const part=await read(src,true);if((part.naturalWidth||part.width)!==(original.naturalWidth||original.width)||(part.naturalHeight||part.height)!==(original.naturalHeight||original.height))throw Error('ขนาดเข็มปกคอไม่ถูกต้อง')}
 }
 let source=null;const original=project.downloadSource||project.compareSource;if(original){await read(original);source=makeFile(await blob(original));if(project.downloadWorkId)source.idpromDownloadWorkId=project.downloadWorkId}
 const head=project.layers.find(isHead),suit=project.layers.find(l=>l.kind==='suit'||l.name==='ชุด');
 let editCache=null;
 if(head&&source){
  source.idpromPortraitMode=head.portraitMode;source.idpromFemaleEyeStyle=portraitFinishChoice(head.initialFemaleEyeStyle,head.femaleEyeStyle);
  const im=decoded.get(head.source),width=im.naturalWidth||im.width,height=im.naturalHeight||im.height;
  const f=head.sourceFrame||{x:0,y:0,w:900,h:1200},p=project.placement||{},W=p.W||900,H=p.H||1200;
  const u=suit?.sourceFrame||{x:p.uX/W*900||0,y:p.uY/H*1200||0,w:p.uW/W*900||900,h:p.uH/H*1200||1200};
  const lock={...p,W,H,hX:f.x/900*W,hY:f.y/1200*H,headW:width,headH:height,scale:f.w/900*W/width,uX:u.x/900*W,uY:u.y/1200*H,uW:u.w/900*W,uH:u.h/1200*H,templatePath:suit?.templatePath||p.templatePath};
  // The saved layer may have been moved/resized since its first AI generation.
  for(const key of ['hairFitEyeSize','hairFitEyeCentreX','hairFitChinAnchorY'])delete lock[key];
  editCache={master:await blob(head.source),lock};
 }
 abort(signal);
 const femaleFinish=head&&(head.femaleFinishProfile!==undefined||head.femaleFinishReference!==undefined)?{profile:head.femaleFinishProfile,reference:head.femaleFinishReference}:undefined;
 return {project,source,head,editCache,femaleFinish};
}

