import {encodedImageSize} from './project-resource-guard.js';

// The immutable finish reference is metadata, never a full-resolution edit source.
export const FEMALE_FINISH_REFERENCE_MAX_CHARS=512*1024;
export const FEMALE_FINISH_REFERENCE_MAX_EDGE=512;
const prefix='data:image/jpeg;base64,';
const base64=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function isFemaleFinishReference(value){
 if(typeof value!=='string'||value.length>FEMALE_FINISH_REFERENCE_MAX_CHARS||!value.startsWith(prefix))return false;
 const payload=value.slice(prefix.length);if(!payload||!base64.test(payload))return false;
 try{
  const bytes=atob(payload);
  // Require canonical base64, a JPEG envelope, and a bounded declared canvas.
  if(btoa(bytes)!==payload||bytes.length<4||bytes.charCodeAt(0)!==255||bytes.charCodeAt(1)!==216||bytes.charCodeAt(bytes.length-2)!==255||bytes.charCodeAt(bytes.length-1)!==217)return false;
  const size=encodedImageSize(value);
  return Boolean(size&&size.width>=1&&size.height>=1&&size.width<=FEMALE_FINISH_REFERENCE_MAX_EDGE&&size.height<=FEMALE_FINISH_REFERENCE_MAX_EDGE);
 }catch{return false}
}
