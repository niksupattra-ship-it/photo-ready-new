// Wire-only image sharing. Stored projects and native image bytes keep their v1 format.
export const TRANSFER_HEADER='X-IDPROM-Project-Transfer';
export const TRANSFER_VERSION='images-v1';
export const SAVED_WORK_TRANSFER_MAX_BYTES=64*1024*1024;
const FORMAT='idprom-project-transfer',MAX_IMAGES=241,MIN_SAVINGS=1024;
const imageURL=/^data:image\/(?:png|jpeg|webp);base64,/;
const imageFields=['source','processedOriginalSource','hairOriginalSource','makeupBaseSource','makeupFullSource','mask','warpSource','warpBaseMask','eraseRestoreSource','warpRestoreBase'];
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const invalid=()=>Object.assign(Error('ข้อมูลรับส่งงานไม่ถูกต้อง กรุณาลองอีกครั้ง'),{code:'invalid_saved_work_transfer'});
const tooLarge=()=>Object.assign(Error('งานนี้มีขนาดเกิน 64 MB กรุณาลบเลเยอร์ที่ไม่ใช้แล้วบันทึกใหม่'),{code:'saved_work_too_large'});
const encoder=typeof TextEncoder==='function'?new TextEncoder():null;
function utf8Bytes(text){
 if(encoder)return encoder.encode(text).length;
 let bytes=0;for(let i=0;i<text.length;i++){
  const c=text.charCodeAt(i);if(c<128)bytes++;else if(c<2048)bytes+=2;
  else if(c>=0xd800&&c<=0xdbff&&i+1<text.length&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){bytes+=4;i++}else bytes+=3;
 }return bytes;
}
function jsonBytes(value){let text;try{text=JSON.stringify(value)}catch{throw invalid()}if(typeof text!=='string')throw invalid();return utf8Bytes(text)}
function imageBytes(value){
 // Canvas data URLs are ASCII without JSON escapes; avoid copying large strings.
 return /^[\x20-\x21\x23-\x5b\x5d-\x7f]*$/.test(value)?value.length+2:jsonBytes(value);
}
function checkProjectShape(project){
 if(!plain(project)||project.format!=='idprom-studio'||project.version!==1||project.width!==900||project.height!==1200||!Array.isArray(project.layers)||project.layers.length<1||project.layers.length>20)throw invalid();
}
function mapImages(project,visit){
 checkProjectShape(project);
 const layers=project.layers.map(layer=>{
  if(!plain(layer))throw invalid();const copy={...layer};
  for(const key of imageFields)if(own(layer,key))copy[key]=visit(layer[key]);
  if(layer.collarParts){
   if(!plain(layer.collarParts))throw invalid();copy.collarParts={...layer.collarParts};
   for(const key of ['left','right'])if(own(layer.collarParts,key))copy.collarParts[key]=visit(layer.collarParts[key]);
  }
  return copy;
 });
 const copy={...project,layers};if(own(project,'compareSource'))copy.compareSource=visit(project.compareSource);return copy;
}
function projectBytes(project){
 if(!plain(project)||project.format!=='idprom-studio'||!Array.isArray(project.layers))return jsonBytes(project);
 let adjustment=0;const sizes=new Map();
 const metadata=mapImages(project,value=>{
  if(typeof value!=='string'||!imageURL.test(value))return value;
  let bytes=sizes.get(value);if(bytes===undefined){bytes=imageBytes(value);sizes.set(value,bytes)}
  adjustment+=bytes-4;return null;
 });
 return jsonBytes(metadata)+adjustment;
}
function inspect(wire){
 if(!plain(wire)||wire.format!==FORMAT||wire.version!==1||!Array.isArray(wire.images)||wire.images.length<1||wire.images.length>MAX_IMAGES)throw invalid();
 checkProjectShape(wire.project);
 const sizes=[];let resourceBytes=0;
 for(const image of wire.images){
  if(typeof image!=='string'||!imageURL.test(image))throw invalid();
  const bytes=imageBytes(image);sizes.push(bytes);resourceBytes+=bytes;if(resourceBytes>SAVED_WORK_TRANSFER_MAX_BYTES)throw tooLarge();
 }
 let adjustment=0,refs=0;const used=new Set();
 const indexOf=value=>{
  if(!plain(value)||Object.keys(value).length!==1||!own(value,'$image')||!Number.isInteger(value.$image)||value.$image<0||value.$image>=wire.images.length)throw invalid();
  return value.$image;
 };
 mapImages(wire.project,value=>{
  if(value!==null&&typeof value==='object'){
   const index=indexOf(value);if(++refs>MAX_IMAGES)throw invalid();used.add(index);adjustment+=sizes[index]-jsonBytes(value);
  }
  return value;
 });
 if(used.size!==wire.images.length)throw invalid();
 const metadataBytes=jsonBytes(wire.project),bytes=metadataBytes+adjustment;if(bytes>SAVED_WORK_TRANSFER_MAX_BYTES)throw tooLarge();
 return {bytes,indexOf,metadataBytes,resourceBytes};
}
export function packSavedProjectTransfer(project){
 // Legacy and invalid inputs still reach the existing project validation unchanged.
 if(!plain(project)||project.format!== 'idprom-studio'||!Array.isArray(project.layers))return project;
 const images=[],indices=new Map();let unsuitable=false,refs=0;
 const packed=mapImages(project,value=>{
  if(value!==null&&typeof value==='object'){unsuitable=true;return value}
  if(typeof value!=='string'||!imageURL.test(value))return value;
  refs++;let index=indices.get(value);
  if(index===undefined){index=images.length;indices.set(value,index);images.push(value)}
  return {$image:index};
 });
 if(unsuitable||images.length<1||images.length>MAX_IMAGES||refs===images.length)return project;
 const wire={format:FORMAT,version:1,images,project:packed},details=inspect(wire);
 const listBytes=2+Math.max(0,images.length-1)+details.resourceBytes;
 const fixedBytes=jsonBytes({format:FORMAT,version:1,images:[],project:null})-6;
 const wireBytes=fixedBytes+listBytes+details.metadataBytes;
 return details.bytes-wireBytes>=MIN_SAVINGS?wire:project;
}
export function unpackSavedProjectTransfer(value){
 if(!plain(value)||value.format!==FORMAT){if(projectBytes(value)>SAVED_WORK_TRANSFER_MAX_BYTES)throw tooLarge();return value}
 const details=inspect(value);
 return mapImages(value.project,item=>item!==null&&typeof item==='object'?value.images[details.indexOf(item)]:item);
}
// Count the original expanded POST body without serializing repeated image strings.
// GET callers should only unpack the project: response metadata can have a longer id.
export function getSavedWorkRequestSize(id,projectOrWire){
 let bytes;
 if(plain(projectOrWire)&&projectOrWire.format===FORMAT){
  const details=inspect(projectOrWire);bytes=jsonBytes({id,project:null})-4+details.bytes;
 }else bytes=jsonBytes({id,project:null})-4+projectBytes(projectOrWire);
 if(bytes>SAVED_WORK_TRANSFER_MAX_BYTES)throw tooLarge();return bytes;
}
