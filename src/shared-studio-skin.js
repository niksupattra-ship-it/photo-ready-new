import {STUDIO_SKIN_WORKFLOW_VERSION} from '../studio-skin-treatment.js';
import {NATURAL_STUDIO_SKIN_VERSION} from '../natural-studio-skin.js';
import {finishStudioPostCosmetics} from './studio-post-cosmetics.js';
import {encodedImageSize} from './project-resource-guard.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {SHARED_PORTRAIT_BASE_VERSION,sharedOriginalPortraitSource} from '../shared-portrait-policy.js';

const sourcePattern=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const supported=new Set(['natural','makeup','korean-rosy-v1','soft-rosy-v1']);
const abort=signal=>{if(signal?.aborted)throw Object.assign(Error('ยกเลิกการแต่งเมคอัพแล้ว'),{name:'AbortError'})};

export function isStudioSkinBaseSource(value){return typeof value==='string'&&value.length<=32*1024*1024&&sourcePattern.test(value)}
export function sharedStudioSkinSource(subject){
 const original=sharedOriginalPortraitSource(subject);if(original)return original;
 if((subject?.idpromStudioSkinVersion||subject?.studioSkinVersion)!==STUDIO_SKIN_WORKFLOW_VERSION)return null;
 const value=subject?.idpromStudioSkinBaseSource||subject?.studioSkinBaseSource;
 return isStudioSkinBaseSource(value)?value:null;
}
export function canReuseStudioSkinBase(head){
 return Boolean(sharedStudioSkinSource(head)&&head?.jobId&&head.portraitMode==='female'&&!head.mask&&!head.warpSource&&!head.warpBaseMask&&!head.eraseRestoreSource&&!head.warpRestoreBase&&!head.makeupStyles?.look);
}
export function isStudioSkinGeometry(value){
 return value&&['width','height','chinY','faceCX','faceWidth'].every(key=>Number.isFinite(value[key]))&&value.width>0&&value.height>0&&value.width<=8192&&value.height<=8192&&value.chinY>=0&&value.chinY<=value.height&&value.faceCX>=0&&value.faceCX<=value.width&&value.faceWidth>0&&value.faceWidth<=Math.hypot(value.width,value.height);
}
// A Studio source can be either a native cutout with sourceFrame placement, or
// an already placed full canvas. Its parent master must use that exact frame.
export function studioSkinMasterFrame(head,lock,geometry){
 const size=encodedImageSize(head.freeHairBaseOriginal?head.hairOriginalSource:head.source);
 if(!size||!isStudioSkinGeometry(geometry)||geometry.width!==size.width||geometry.height!==size.height)return null;
 const frame=head.sourceFrame||{x:0,y:0,w:900,h:1200},W=lock?.W||900,H=lock?.H||1200;
 if(!['x','y','w','h'].every(key=>Number.isFinite(frame[key]))||frame.w<=0||frame.h<=0||![W,H].every(value=>Number.isFinite(value)&&value>0))return null;
 const scale=frame.w/900*W/size.width,scaleY=frame.h/1200*H/size.height;
 if(Math.abs(scale-scaleY)>Math.max(.000001,scale*.005))return null;
 const next={...lock,W,H,headW:size.width,headH:size.height,hX:frame.x/900*W,hY:frame.y/1200*H,scale:frame.w/900*W/size.width,chinY:geometry.chinY,faceCX:geometry.faceCX,placedFaceW:geometry.faceWidth*frame.w/900*W/size.width};
 for(const key of ['hairFitEyeSize','hairFitEyeCentreX','hairFitChinAnchorY'])delete next[key];
 return next;
}
// The saved base is processed output, never the original uploaded photograph.
// Decode synchronously so history can update its parent master in one commit.
export function studioSkinBlobFromSource(source){
 if(!isStudioSkinBaseSource(source))throw Error('ภาพฐานแสงและผิวยังไม่พร้อมสำหรับแต่งเมคอัพ');
 const match=sourcePattern.exec(source),binary=atob(match[2]),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 if(!bytes.length)throw Error('ภาพฐานแสงและผิวยังไม่พร้อมสำหรับแต่งเมคอัพ');
 return new Blob([bytes],{type:'image/'+match[1]});
}
export function copyStudioSkinBlobMetadata(source,target,{bare=false}={}){
 for(const key of Object.getOwnPropertyNames(source||{}))if(key.startsWith('idprom')&&(!bare||!['idpromStudioCosmeticsVersion','idpromNaturalStudioSkinVersion'].includes(key)))Object.defineProperty(target,key,Object.getOwnPropertyDescriptor(source,key));
 return target;
}

// Both choices start from the same lossless, native, clothing-cleaned image.
// Switching finish cannot feed makeup pixels back into skin processing.
export async function finishSharedStudioSkin(blob,{style='natural',encodeBase,prepare,toBlob,signal,onProgress}={}){
 abort(signal);
 const version=blob?.idpromStudioSkinVersion,original=version===ORIGINAL_PORTRAIT_AI_VERSION||version==='studio-original-ai-v5';
 if(!supported.has(style)||!original&&version!==STUDIO_SKIN_WORKFLOW_VERSION)throw Error('ภาพฐานแสงและผิวยังไม่พร้อมสำหรับแต่งเมคอัพ');
 let source=sharedStudioSkinSource(blob);
 if(!source){
  if(blob.idpromStudioCosmeticsVersion||typeof encodeBase!=='function')throw Error('ภาพฐานแสงและผิวยังไม่พร้อมสำหรับแต่งเมคอัพ');
  source=await encodeBase(blob);abort(signal);
  if(!isStudioSkinBaseSource(source))throw Error('ภาพฐานแสงและผิวยังไม่พร้อมสำหรับแต่งเมคอัพ');
 }
 const base=copyStudioSkinBlobMetadata(blob,studioSkinBlobFromSource(source),{bare:true});
 base.idpromStudioSkinVersion=version;
 if(original)base.idpromSharedPortraitBaseVersion=SHARED_PORTRAIT_BASE_VERSION;
 base.idpromStudioSkinBaseSource=source;
 base.idpromFemaleEyeStyle=style;
 const finished=await finishStudioPostCosmetics(base,{style,prepare,toBlob,signal,onProgress});abort(signal);
 if(style==='natural')finished.idpromNaturalStudioSkinVersion=NATURAL_STUDIO_SKIN_VERSION;
 return finished;
}
