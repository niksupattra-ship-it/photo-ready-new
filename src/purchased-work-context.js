// Convert only an authenticated purchased-work edit response. Package labels
// are presentation metadata; live rights still come from the owned job APIs.
const imageData=/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/;
const jobIdPattern=/^[A-Za-z0-9_-]{1,160}$/;
const workIdPattern=/^dwork_[a-f0-9]{36}$/;
const isHead=l=>l.kind==='head'||l.name==='หัว · คอ · ผม';

function imageBlob(source){
 if(typeof source!=='string'||!imageData.test(source))throw Error('ข้อมูลรูปที่ซื้อไม่ครบ กรุณาเปิดงานเดิมอีกครั้ง');
 const comma=source.indexOf(','),type=source.slice(5,source.indexOf(';')),decoded=atob(source.slice(comma+1));
 const bytes=new Uint8Array(decoded.length);for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
 if(!bytes.length)throw Error('ไฟล์รูปที่ซื้อว่างเปล่า กรุณาลองเปิดอีกครั้ง');
 return new Blob([bytes],{type});
}

export function purchasedWorkHeadMetadata(context){
 const j=context.job||{},metadata={jobId:context.jobId,kind:'head',portraitMode:j.portraitMode||'female',hairId:j.hairId||'',restrictedTrial:false,outputUnlocked:true};
 for(const key of ['femaleFinishSingleVersion','portraitComposition','englishStudioFinishVersion','portraitFramingVersion','hairPolicyVersion','studioSkinVersion','studioCosmeticsVersion','studioMakeupVersion','naturalFinishVersion','naturalStudioSkinVersion','femaleEyeStyle','initialFemaleEyeStyle','sharedPortraitBaseVersion','studioSkinGeometry'])if(j[key]!==undefined&&j[key]!==null)metadata[key]=j[key];
 if(j.naturalFinishVersion&&!metadata.naturalStudioSkinVersion)metadata.naturalStudioSkinVersion=j.naturalFinishVersion;
 if(context.templatePath)metadata.generatedOutfitTemplate=context.templatePath;
 if(context.makeupSource){metadata.studioSkinBaseSource=context.resultSource;metadata.aiMakeupSource=context.makeupSource;}
 return metadata;
}

export function preparePurchasedWorkContext(data,{makeFile=(blob)=>new File([blob],'purchased-work-original.'+(blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':'png'),{type:blob.type})}={}){
 const id=String(data?.jobId||data?.job?.id||'');
 if(!jobIdPattern.test(id)||!Array.isArray(data?.jobIds)||!data.jobIds.includes(id))throw Error('ไม่พบรหัสงานที่ซื้อ กรุณาเปิดรูปด้วยบัญชีเดิม');
 // The edit endpoint checks retention against the server clock. A phone's
 // incorrect clock must not turn a valid paid response into a fresh paywall.
 if(data.expiresAt&&(!Number.isFinite(Date.parse(data.expiresAt))||(Number.isFinite(Date.parse(data.serverNow))&&Date.parse(data.expiresAt)<=Date.parse(data.serverNow))))throw Error('รูปนี้หมดระยะเก็บ 7 วันแล้ว');
 const job=data.job&&typeof data.job==='object'?{...data.job}:{};
 const resultSource=data.resultSource;
 const resultBlob=imageBlob(resultSource),makeupBlob=data.makeupSource?imageBlob(data.makeupSource):null;
 const downloadWorkId=workIdPattern.test(data.downloadWorkId||data.workId||'')?(data.downloadWorkId||data.workId):null;
 // A stored render/cropped receipt must never become a replacement AI original.
 const originalSource=data.originalAvailable===true?data.originalSource:null;
 const sourceFile=originalSource?makeFile(imageBlob(originalSource)):null;
 if(sourceFile){
  if(downloadWorkId)sourceFile.idpromDownloadWorkId=downloadWorkId;
  sourceFile.idpromCanonicalInput=sourceFile;
  sourceFile.idpromPortraitMode=job.portraitMode||'female';sourceFile.idpromFemaleEyeStyle=job.femaleEyeStyle||'natural';
 }
 const context={archiveId:data.id||'',workScope:data.workId||'',downloadWorkId,jobId:id,jobIds:[...data.jobIds],job,originalAvailable:Boolean(sourceFile),originalSource:originalSource||null,sourceFile,resultSource,resultBlob,makeupSource:data.makeupSource||null,makeupBlob,templatePath:job.neckOutfitReferencePath||job.outfitReferencePath||job.generatedOutfitTemplate||'',packageId:data.packageId,purchasedAt:data.purchasedAt,expiresAt:data.expiresAt};
 const blobMetadata={idpromJobId:id,idpromPortraitMode:job.portraitMode||'female',idpromFemaleEyeStyle:job.femaleEyeStyle||'natural',idpromTrial:false};
 for(const [key,target]of [['femaleFinishSingleVersion','idpromFemaleFinishSingleVersion'],['portraitComposition','idpromPortraitComposition'],['englishStudioFinishVersion','idpromEnglishStudioFinishVersion'],['thaiRealFaceVersion','idpromThaiRealFaceVersion'],['portraitFramingVersion','idpromEnglishFramingVersion'],['studioSkinVersion','idpromStudioSkinVersion'],['studioCosmeticsVersion','idpromStudioCosmeticsVersion'],['studioMakeupVersion','idpromStudioMakeupVersion'],['naturalFinishVersion','idpromNaturalStudioSkinVersion']])if(job[key])blobMetadata[target]=job[key];
 if(data.makeupSource){blobMetadata.idpromStudioSkinBaseSource=resultSource;blobMetadata.idpromAiMakeupSource=data.makeupSource;blobMetadata.idpromAiMakeupBlob=makeupBlob;}
 Object.assign(resultBlob,blobMetadata);
 return context;
}

// Thai callers supply the real composition/layers from composePortrait and
// renderAdjustedFinal; a separated head must never be guessed into a full frame.
export function buildPurchasedWorkProject(context,{layers,placement=null,compareSource}={}){
 if(!Array.isArray(layers)||!layers.some(l=>isHead(l)||(context.job?.source_only===true&&l.kind==='source-photo')))throw Error('ยังเตรียมเลเยอร์งานเดิมไม่สำเร็จ กรุณาเปิดใหม่');
 const metadata=purchasedWorkHeadMetadata(context);
 const project={format:'idprom-studio',version:1,width:900,height:1200,placement,layers:layers.map(l=>({x:0,y:0,scale:1,rotation:0,opacity:1,visible:true,locked:false,...l,...(isHead(l)?metadata:context.job?.source_only===true&&l.kind==='source-photo'?{jobId:context.jobId,restrictedTrial:false,outputUnlocked:true}:{})})),compareSource:compareSource??context.originalSource??null};
 if(context.originalSource){project.downloadSource=context.originalSource;project.canonicalInput=context.originalSource;if(context.downloadWorkId)project.downloadWorkId=context.downloadWorkId;}
 return project;
}

// Used only for archives that predate editable snapshots. Existing saved layers
// stay untouched; a flattened receipt must not become a separated head master.
export async function restorePurchasedWorkProject(context,{composePortrait,renderAdjustedFinal,loadImage,canvasFor,backgroundSource,englishBodyVersion,ensureCurrent=()=>{}}){
 if(context.job.source_only===true){
  const im=await loadImage(context.resultSource);ensureCurrent();
  const w=im.naturalWidth||im.width,h=im.naturalHeight||im.height,scale=Math.min(900/w,1200/h);
  return buildPurchasedWorkProject(context,{layers:[{name:'รูปที่เพิ่ม',kind:'source-photo',source:context.resultSource,sourceFrame:{x:(900-w*scale)/2,y:(1200-h*scale)/2,w:w*scale,h:h*scale}}]});
 }
 const template=context.templatePath||'/assets/uniform.png';
 const composed=await composePortrait(context.resultBlob,{scale:1,x:0,y:0},template,{placementOnly:true});ensureCurrent();
 const layers=[];layers.headOnly=true;
 await renderAdjustedFinal(context.resultBlob,composed.lock,{scale:1,x:0,y:0,rotation:0},0,{width:0,length:0},backgroundSource,null,{},null,{},false,null,0,null,{},layers);ensureCurrent();
 const [background,uniform]=await Promise.all([loadImage(backgroundSource),loadImage(template)]);ensureCurrent();
 const encode=im=>{const c=canvasFor(im.naturalWidth||im.width,im.naturalHeight||im.height);c.getContext('2d').drawImage(im,0,0);try{return c.toDataURL('image/png')}finally{c.width=c.height=1}};
 const p=composed.lock,suit={name:'ชุด',kind:'suit',templatePath:template,source:encode(uniform),sourceFrame:{x:p.uX/p.W*900,y:p.uY/p.H*1200,w:p.uW/p.W*900,h:p.uH/p.H*1200},visible:context.job.portraitComposition!==englishBodyVersion};
 return buildPurchasedWorkProject(context,{layers:[{name:'พื้นหลัง',kind:'background',source:encode(background),sourceFrame:{x:0,y:0,w:900,h:1200}},...layers,suit],placement:p});
}
