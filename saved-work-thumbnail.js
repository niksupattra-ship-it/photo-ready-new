import sharp from 'sharp';
import {validateSavedProject} from './src/saved-project.js';
import {encodedImageSize,PROJECT_IMAGE_MAX_PIXELS,PROJECT_UNIQUE_MAX_PIXELS} from './src/project-resource-guard.js';

export const SAVED_WORK_PREVIEW_MAX_BYTES=1024*1024;
export const SAVED_WORK_PREVIEW_MAX_EDGE=320;
export const SAVED_WORK_PREVIEW_MAX_PIXELS=2500000;
const imagePattern=/^data:image\/(png|jpeg|webp);base64,/;
const strings=['id','name','kind','templatePath','hairHeadId'];
const numbers=['x','y','scale','rotation','opacity','squeezeX','squeezeY','neckWidth','neckHeight','collarLeftX','collarLeftY','collarRightX','collarRightY'];
const unavailable=()=>Object.assign(Error('ยังแสดงรูปตัวอย่างงานนี้ไม่ได้'),{code:'SAVED_WORK_PREVIEW_UNAVAILABLE'});
const resourceLimit=()=>Object.assign(Error('รูปตัวอย่างมีข้อมูลเกินขีดจำกัด'),{code:'PROJECT_RESOURCE_LIMIT'});
const abort=signal=>{if(signal?.aborted)throw Object.assign(Error('ยกเลิกการโหลดรูปตัวอย่างแล้ว'),{name:'AbortError'})};
const budgetExceeded=Symbol('preview_budget');
function visualLayer(layer){
 const result={visible:layer.visible!==false};
 for(const key of strings)if(layer[key]!==undefined){if(typeof layer[key]!=='string'||layer[key].length>(key==='templatePath'?2048:256))throw unavailable();result[key]=layer[key]}
 for(const key of numbers)if(layer[key]!==undefined){if(!Number.isFinite(layer[key])||Math.abs(layer[key])>(key.startsWith('collar')?5000:key.startsWith('neck')?1000:1000000))throw unavailable();result[key]=layer[key]}
 for(const key of ['sourceFrame','collarFrame'])if(layer[key]){
  const frame=layer[key];if(!['x','y','w','h'].every(name=>Number.isFinite(frame[name])&&Math.abs(frame[name])<=1000000)||frame.w<=0||frame.h<=0)throw unavailable();
  result[key]={x:frame.x,y:frame.y,w:frame.w,h:frame.h};
 }
 return result;
}
function checkCollarGeometry(layer,image){
 if(!(layer.kind==='suit'||layer.name==='ชุด')||(!layer.neckWidth&&!layer.neckHeight))return;
 const f=layer.sourceFrame||{x:0,y:0,w:900,h:1200},logical=layer.collarFrame||{x:0,y:0,w:900,h:1200};
 const b={x:(logical.x-f.x)*image.width/f.w,y:(logical.y-f.y)*image.height/f.h,w:logical.w*image.width/f.w,h:logical.h*image.height/f.h};
 const left=Math.floor(b.x+b.w*.285),right=Math.ceil(b.x+b.w*.715),originalTop=Math.floor(b.y+b.h*.015);
 const top=(layer.templatePath||'').includes('/job-uniforms/')?Math.min(0,originalTop)-Math.ceil(b.h*.12):originalTop,bottom=Math.ceil(b.y+b.h*.36),w=right-left,h=bottom-top;
 if(![left,right,top,bottom].every(value=>Number.isFinite(value)&&Math.abs(value)<=8192)||w<1||h<1||w>1024||h>1024||w*h>1000000)throw unavailable();
}

// Read saved pixels only; this never saves, opens, processes or extends a project.
export async function compactSavedWorkPreview(project,{signal}={}){
 abort(signal);validateSavedProject(project);
 const started=Date.now(),metadata=new Map();let uniquePixels=0,encodedChars=0;
 const check=()=>{abort(signal);if(Date.now()-started>15000)throw unavailable()};
 const parents=new Map(project.layers.map(layer=>[layer.id,layer]));
 const layers=project.layers.filter(layer=>layer.visible!==false&&(!layer.hairHeadId||(parents.has(layer.hairHeadId)&&parents.get(layer.hairHeadId).visible!==false)));
 const visuals=layers.map(visualLayer);
 const imageMetadata=async src=>{
  check();if(metadata.has(src))return metadata.get(src);
  const match=typeof src==='string'&&imagePattern.exec(src);if(!match||src.length>64*1024*1024)throw unavailable();
  const header=encodedImageSize(src);
  if(header&&(header.width<1||header.height<1||header.width*header.height>PROJECT_IMAGE_MAX_PIXELS))throw resourceLimit();
  const buffer=Buffer.from(src.slice(match[0].length),'base64');
  const info=await sharp(buffer,{limitInputPixels:PROJECT_IMAGE_MAX_PIXELS,animated:false}).metadata();
  check();if(!['png','jpeg','webp'].includes(info.format)||!info.width||!info.height||(info.pages||1)>1)throw unavailable();
  if(info.width>16384||info.height>8192||info.width*info.height>PROJECT_IMAGE_MAX_PIXELS)throw resourceLimit();
  uniquePixels+=info.width*info.height;encodedChars+=src.length;
  if(uniquePixels>PROJECT_UNIQUE_MAX_PIXELS||encodedChars>64*1024*1024)throw resourceLimit();
  const value={width:info.width,height:info.height};metadata.set(src,value);return value;
 };
 for(const edge of [SAVED_WORK_PREVIEW_MAX_EDGE,160,80,40,20]){
  const converted=new Map(),decodedImages=new Set(),output=[];let size=Buffer.byteLength(JSON.stringify(visuals))+1024,decodedPixels=0;
  const resize=async(src,mask=false)=>{
   check();const key=(mask?'mask:':'image:')+src;
   if(!converted.has(key)){
    await imageMetadata(src);check();
    const match=imagePattern.exec(src),input=Buffer.from(src.slice(match[0].length),'base64');
    let pipeline=sharp(input,{limitInputPixels:PROJECT_IMAGE_MAX_PIXELS,animated:false}).rotate().resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).timeout({seconds:3});
    pipeline=mask?pipeline.png({compressionLevel:3}):pipeline.webp({lossless:true,effort:1});
    const {data,info}=await pipeline.toBuffer({resolveWithObject:true});check();
    const image={src:'data:image/'+(mask?'png':'webp')+';base64,'+data.toString('base64'),width:info.width,height:info.height};
    if(!decodedImages.has(image.src)){decodedImages.add(image.src);decodedPixels+=image.width*image.height;if(decodedPixels>SAVED_WORK_PREVIEW_MAX_PIXELS)throw budgetExceeded}
    converted.set(key,image);
   }
   const image=converted.get(key);size+=image.src.length;if(size>SAVED_WORK_PREVIEW_MAX_BYTES)throw budgetExceeded;return image;
  };
  try{
   for(let i=0;i<layers.length;i++){
    const input=layers[i],layer={...visuals[i]},source=await resize(input.source);layer.source=source.src;
    if(input.mask)layer.mask=(await resize(input.mask,true)).src;
    let drawn=source;if(input.warpSource){drawn=await resize(input.warpSource);layer.warpSource=drawn.src}
    if(input.collarParts)layer.collarParts={left:(await resize(input.collarParts.left)).src,right:(await resize(input.collarParts.right)).src};
    checkCollarGeometry(layer,drawn);output.push(layer);
   }
   const result={width:900,height:1200,layers:output};if(Buffer.byteLength(JSON.stringify(result))>SAVED_WORK_PREVIEW_MAX_BYTES)throw budgetExceeded;
   return result;
  }catch(error){if(error!==budgetExceeded)throw error}
 }
 throw resourceLimit();
}
