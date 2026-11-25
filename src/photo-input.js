import {withDeadline} from './async-deadline.js';

// Bound user photo buffers before Studio creates masks, comparison copies or
// restore buffers. Layer placement remains independent of source pixel density.
export const PHOTO_INPUT_MAX_EDGE=4096;
export const PHOTO_INPUT_MAX_PIXELS=8_000_000;
const preparedPhotos=new WeakMap();
const supportedTypes=new Set(['image/jpeg','image/png','image/webp']);

export function photoInputSize(width,height){
 width=Number(width);height=Number(height);
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw Error('ขนาดภาพไม่ถูกต้อง กรุณาเลือกภาพใหม่');
 const scale=Math.min(1,PHOTO_INPUT_MAX_EDGE/Math.max(width,height),Math.sqrt(PHOTO_INPUT_MAX_PIXELS/width/height));
 return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}

export function boundedPhotoCanvas(image){
 const size=photoInputSize(image.naturalWidth||image.width,image.naturalHeight||image.height);
 const canvas=Object.assign(document.createElement('canvas'),size),context=canvas.getContext('2d');
 if(!context)throw Error('หน่วยความจำสำหรับภาพไม่พอ กรุณาปิดแท็บอื่นแล้วลองอีกครั้ง');
 context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
 context.drawImage(image,0,0,size.width,size.height);
 return canvas;
}

export function jpegExifOrientation(buffer){
 const data=new DataView(buffer),length=data.byteLength;
 if(length<4||data.getUint16(0)!==0xffd8)return 1;
 for(let offset=2;offset+4<=length;){
  if(data.getUint8(offset)!==0xff)break;
  const marker=data.getUint8(offset+1);offset+=2;
  if(marker===0xda||marker===0xd9)break;
  if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
  const size=data.getUint16(offset);if(size<2||offset+size>length)break;
  const start=offset+2,end=offset+size;
  if(marker===0xe1&&start+14<=end&&data.getUint32(start)===0x45786966&&data.getUint16(start+4)===0){
   const tiff=start+6,order=data.getUint16(tiff),little=order===0x4949;
   if((!little&&order!==0x4d4d)||data.getUint16(tiff+2,little)!==42)return 1;
   const ifd=tiff+data.getUint32(tiff+4,little);
   if(ifd<tiff||ifd+2>end)return 1;
   const count=data.getUint16(ifd,little);
   for(let entry=ifd+2,index=0;index<count&&entry+12<=end;index++,entry+=12){
    if(data.getUint16(entry,little)===0x0112&&data.getUint16(entry+2,little)===3&&data.getUint32(entry+4,little)===1){
     const value=data.getUint16(entry+8,little);return value>=1&&value<=8?value:1;
    }
   }
  }
  offset+=size;
 }
 return 1;
}

async function readHeader(blob){
 const header=blob.slice(0,256*1024);
 if(typeof header.arrayBuffer==='function')return header.arrayBuffer();
 return withDeadline(()=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('อ่านไฟล์ภาพไม่สำเร็จ'));reader.readAsArrayBuffer(header)}),{message:'อ่านไฟล์ภาพใช้เวลานาน กรุณาลองใหม่',code:'PHOTO_HEADER_TIMEOUT'});
}

function inputType(file){
 const type=String(file.type||'').toLowerCase();
 if(type)return type;
 const extension=String(file.name||'').split('.').pop().toLowerCase();
 return ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif'})[extension]||'';
}

async function prepare(file){
 const type=inputType(file),heif=/image\/hei[cf]/.test(type)||/\.hei[cf]$/i.test(file.name||'');
 const decodeMessage=heif?'เครื่องนี้ยังเปิดไฟล์ HEIC/HEIF ไม่ได้ กรุณาเลือกภาพ JPEG หรือ PNG จากแอปรูปภาพ':'เปิดไฟล์ภาพไม่สำเร็จ กรุณาเลือกภาพ JPEG, PNG หรือ WEBP ที่เปิดได้';
 let image,url,canvas;
 const clearImage=()=>{if(image){image.onload=image.onerror=null;image.removeAttribute('src')}};
 try{
  url=URL.createObjectURL(file);
  image=await withDeadline(()=>new Promise((resolve,reject)=>{const decoded=new Image();image=decoded;decoded.onload=()=>resolve(decoded);decoded.onerror=()=>reject(Object.assign(Error(decodeMessage),{code:'PHOTO_DECODE_FAILED'}));decoded.src=url}),{
   message:'เปิดภาพใช้เวลานาน กรุณาเลือกภาพใหม่',code:'PHOTO_DECODE_TIMEOUT',onTimeout:clearImage
  });
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height,size=photoInputSize(width,height);
  const resize=size.width!==width||size.height!==height;
  // The browser's decoded pixels already follow EXIF orientation. Re-encoding
  // an oriented JPEG bakes those pixels and removes the tag, avoiding a second
  // orientation interpretation by the upload/comparison paths.
  const orientation=type==='image/jpeg'&&!resize?jpegExifOrientation(await readHeader(file)):1;
  if(!resize&&supportedTypes.has(type)&&file.type===type&&orientation===1)return file;
  canvas=boundedPhotoCanvas(image);
  const outputType=type==='image/jpeg'||heif?'image/jpeg':'image/png';
  const blob=await withDeadline(()=>new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('เตรียมภาพไม่สำเร็จ กรุณาลองเลือกภาพใหม่')),outputType,.96)),{
   message:'เตรียมภาพใช้เวลานาน กรุณาลองเลือกภาพใหม่',code:'PHOTO_ENCODE_TIMEOUT'
  });
  const name=String(file.name||'portrait').replace(/\.[^.]*$/,'')+(outputType==='image/jpeg'?'.jpg':'.png');
  const result=new File([blob],name,{type:outputType,lastModified:file.lastModified||Date.now()});
  for(const key of ['idpromFemaleEyeStyle','idpromPortraitMode'])if(key in file)result[key]=file[key];
  return result;
 }finally{
  clearImage();if(url)URL.revokeObjectURL(url);
  if(canvas){canvas.width=1;canvas.height=1}
 }
}

export function preparePhotoInput(file){
 if(!file||typeof file!=='object')return Promise.reject(Error('กรุณาเลือกไฟล์ภาพ'));
 const cached=preparedPhotos.get(file);if(cached)return cached;
 const pending=prepare(file).catch(error=>{preparedPhotos.delete(file);throw error});
 preparedPhotos.set(file,pending);return pending;
}
