import React,{useEffect,useRef,useState} from 'react';
import {deadlineFetch} from './deadline-fetch.js';
import {encodedImageSize} from './project-resource-guard.js';

const PREVIEW_WIDTH=240,PREVIEW_HEIGHT=320,MAX_IMAGE_EDGE=480,MAX_DECODED_PIXELS=3_000_000;
const previewAbort=()=>Object.assign(Error('ยกเลิกการโหลดรูปย่อแล้ว'),{name:'AbortError'});
const assertActive=signal=>{if(signal?.aborted)throw previewAbort()};
const headerScope=value=>{const h=new Headers(value);return JSON.stringify([h.get('Authorization')||'',h.get('X-Wallet-Id')||''])};
const sourceURL=value=>typeof value==='string'&&value.length<=1_500_000&&/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=\s]+$/.test(value);
let renderQueue=Promise.resolve();
const queueRender=operation=>{const task=renderQueue.catch(()=>{}).then(operation);renderQueue=task.catch(()=>{});return task};

function decodePreviewImage(source,signal){
 if(!sourceURL(source))return Promise.reject(Error('ข้อมูลรูปย่อไม่ถูกต้อง'));
 const size=encodedImageSize(source);
 if(!size||size.width<1||size.height<1||size.width>MAX_IMAGE_EDGE||size.height>MAX_IMAGE_EDGE)return Promise.reject(Error('ขนาดรูปย่อไม่ถูกต้อง'));
 return new Promise((resolve,reject)=>{
  const im=new Image();let settled=false,timer;
  const finish=(ok,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);im.onload=null;im.onerror=null;if(!ok)im.src='';(ok?resolve:reject)(value)};
  const cancel=()=>finish(false,previewAbort());
  if(signal?.aborted){cancel();return}
  signal?.addEventListener('abort',cancel,{once:true});
  timer=setTimeout(()=>finish(false,Error('โหลดรูปย่อใช้เวลานาน กรุณาลองอีกครั้ง')),10000);
  im.onload=()=>{const w=im.naturalWidth,h=im.naturalHeight,valid=w>0&&h>0&&w<=MAX_IMAGE_EDGE&&h<=MAX_IMAGE_EDGE;finish(valid,valid?im:Error('ขนาดรูปย่อไม่ถูกต้อง'))};
  im.onerror=()=>finish(false,Error('อ่านรูปย่อไม่สำเร็จ'));
  im.decoding='async';im.src=source;
 });
}

function validFrame(frame){return !frame||['x','y','w','h'].every(k=>Number.isFinite(frame[k]))&&frame.w>0&&frame.h>0}
function assertPreviewScene(scene){
 if(scene?.width!==900||scene.height!==1200||!Array.isArray(scene.layers)||scene.layers.length>20)throw Error('ข้อมูลรูปย่อไม่ครบ');
 const unique=new Set(),ids=new Set();let chars=0;
 for(const [index,l] of scene.layers.entries()){
  if(!l||![l.x,l.y,l.scale,l.rotation,l.opacity].every(Number.isFinite)||l.scale<.1||l.scale>5||l.opacity<0||l.opacity>1||!validFrame(l.sourceFrame)||!validFrame(l.collarFrame))throw Error('ตำแหน่งรูปย่อไม่ถูกต้อง');
  const id=l.id||'preview_'+index;if(ids.has(id))throw Error('ข้อมูลเลเยอร์ในรูปย่อซ้ำกัน');ids.add(id);
  if(['squeezeX','squeezeY'].some(k=>l[k]!==undefined&&(!Number.isFinite(l[k])||l[k]<.1||l[k]>3)))throw Error('สัดส่วนรูปย่อไม่ถูกต้อง');
  for(const src of [l.source,l.mask,l.warpSource,l.collarParts?.left,l.collarParts?.right])if(src){if(!sourceURL(src))throw Error('ข้อมูลรูปย่อไม่ถูกต้อง');if(!unique.has(src)){unique.add(src);chars+=src.length}}
  if(!sourceURL(l.source)||chars>1_500_000)throw Error('รูปย่อมีขนาดเกินที่แสดงได้');
 }
}

function assertCollarPreview(l,a){
 if(l.kind!=='suit'&&l.name!=='ชุด')return;
 const neckWidth=l.neckWidth??0,neckHeight=l.neckHeight??0;
 if(![neckWidth,neckHeight].every(Number.isFinite))throw Error('ตำแหน่งคอเสื้อในรูปย่อไม่ถูกต้อง');
 if(Math.abs(neckWidth)<.1&&Math.abs(neckHeight)<.1)return;
 const src=a.warped||a.parts?.left||a.original,f=l.sourceFrame||{x:0,y:0,w:900,h:1200},logical=l.collarFrame||{x:0,y:0,w:900,h:1200};
 const w=logical.w*src.width/f.w,h=logical.h*src.height/f.h,smooth=(l.templatePath||'').includes('/job-uniforms/');
 const x=(logical.x-f.x)*src.width/f.w,y=(logical.y-f.y)*src.height/f.h;
 const left=Math.floor(x+w*.285),right=Math.ceil(x+w*.715),top=Math.floor(y+h*.015),roiTop=smooth?Math.min(0,top)-Math.ceil(h*.12):top,bottom=Math.ceil(y+h*.36);
 if(![left,right,roiTop,bottom].every(Number.isFinite)||right-left<1||bottom-roiTop<1||right-left>1024||bottom-roiTop>1024||(right-left)*(bottom-roiTop)>1_000_000||[left,right,roiTop,bottom].some(v=>Math.abs(v)>1_000_000))throw Error('ขนาดคอเสื้อในรูปย่อเกินที่แสดงได้');
}

// Paint only the compact scene. Original saved images and the editor asset cache are never used.
export async function paintSavedWorkPreview(target,scene,{signal}={}){
 assertActive(signal);assertPreviewScene(scene);
 const {paintScene}=await import('./studio-editor.jsx');assertActive(signal);
 const decoded=new Map(),assets=new Map(),white=document.createElement('canvas');let pixels=0;
 white.width=1;white.height=1;white.getContext('2d').fillStyle='#fff';white.getContext('2d').fillRect(0,0,1,1);
 const read=async source=>{assertActive(signal);if(!decoded.has(source)){const im=await decodePreviewImage(source,signal);pixels+=im.naturalWidth*im.naturalHeight;if(pixels>MAX_DECODED_PIXELS){im.src='';throw Error('รูปย่อมีรายละเอียดเกินที่แสดงได้')}decoded.set(source,im)}return decoded.get(source)};
 try{
  const layers=[];
  for(let index=0;index<scene.layers.length;index++){
   assertActive(signal);const l={visible:true,...scene.layers[index],id:scene.layers[index].id||'preview_'+index};
   const original=await read(l.source),mask=l.mask?await read(l.mask):white,warped=l.warpSource?await read(l.warpSource):null;
   const parts=l.collarParts?{left:await read(l.collarParts.left),right:await read(l.collarParts.right)}:null;
   const buffer=document.createElement('canvas'),a={original,mask,warped,parts,buffer,dirty:true,dirtyRect:null};
   assertCollarPreview(l,a);assets.set(l.id,a);layers.push(l);
  }
  assertActive(signal);target.width=PREVIEW_WIDTH;target.height=PREVIEW_HEIGHT;
  paintScene(target.getContext('2d'),layers,assets);
  assertActive(signal);return target;
 }finally{
  const canvases=new Set([white]);
  for(const a of assets.values())for(const value of [a.buffer,a.original,a.collarRendered])if(value instanceof HTMLCanvasElement&&value!==target)canvases.add(value);
  for(const surface of canvases){surface.width=1;surface.height=1}
  for(const im of decoded.values())im.src='';decoded.clear();assets.clear();
 }
}

export function SavedWorkPreview({id,updatedAt,headers,accountScope,className=''}){
 const canvas=useRef(null),callbacks=useRef({headers}),[revision,setRevision]=useState(0),[result,setResult]=useState({scope:'',status:'loading'});callbacks.current={headers};
 const currentHeaders=()=>typeof callbacks.current.headers==='function'?callbacks.current.headers():callbacks.current.headers;
 const scopeNow=()=>{try{return headerScope(currentHeaders())}catch{return null}};
 const account=accountScope??scopeNow(),scope=JSON.stringify([account,id,updatedAt||'',revision]);
 const status=result.scope===scope?result.status:'loading';
 useEffect(()=>{
  const controller=new AbortController();let active=true;
  const current=()=>active&&!controller.signal.aborted&&scopeNow()===account;
  const clear=()=>{const target=canvas.current;target?.getContext('2d')?.clearRect(0,0,target.width,target.height)};
  const timer=setTimeout(()=>{if(current()){setResult({scope,status:'error'});controller.abort()}},45000);
  clear();setResult({scope,status:'loading'});
  (async()=>{try{
   const requestHeaders=currentHeaders();if(headerScope(requestHeaders)!==account)return;
   const response=await deadlineFetch('/api/saved-work/'+encodeURIComponent(id)+'/preview',{headers:requestHeaders,cache:'no-store',signal:controller.signal},{timeoutMs:30000,timeoutMessage:'โหลดรูปย่อใช้เวลานาน กรุณาลองอีกครั้ง'});
   const data=await response.json();if(!current())return;
   if(!response.ok){setResult({scope,status:response.status===410?'expired':response.status===401||response.status===403?'unavailable':'error'});return}
   await queueRender(async()=>{
    if(!current())return;const target=canvas.current;if(!target)return;
    const staged=document.createElement('canvas');
    try{
     await paintSavedWorkPreview(staged,data,{signal:controller.signal});
     if(!current()||canvas.current!==target)return;
     target.width=PREVIEW_WIDTH;target.height=PREVIEW_HEIGHT;target.getContext('2d').drawImage(staged,0,0);
    }finally{staged.width=1;staged.height=1}
   });
   if(current())setResult({scope,status:'ready'});
  }catch(error){if(current())setResult({scope,status:'error'})}finally{clearTimeout(timer)}})();
  return()=>{active=false;clearTimeout(timer);controller.abort();clear()};
 },[id,updatedAt,account,revision]);
 return <div className={'idprom-saved-preview '+className} aria-busy={status==='loading'}>
  <style>{`.idprom-saved-preview{box-sizing:border-box;position:relative;display:grid;place-items:center;flex:0 0 auto;width:96px;height:128px;max-width:100%;overflow:hidden;border:1px solid #3b5660;border-radius:10px;background:#e8eef2;color:#42606b}.idprom-saved-preview canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.idprom-saved-preview-placeholder{display:grid;justify-items:center;gap:5px;padding:6px;text-align:center;font-size:10px;line-height:1.5}.idprom-saved-preview-placeholder svg{width:25px;height:25px;opacity:.65}.idprom-saved-preview-retry{font:inherit;font-size:10px!important;line-height:1.4;min-height:28px;border:1px solid #a9bdc6;border-radius:6px;padding:4px 6px;background:#fff;color:#254651;cursor:pointer}.idprom-saved-preview canvas[hidden]{display:none}`}</style>
  <canvas ref={canvas} width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} hidden={status!=='ready'} role="img" aria-label="รูปย่องานที่บันทึก"/>
  {status!=='ready'&&<div className="idprom-saved-preview-placeholder" role="status"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m4 18 6-6 4 4 3-3 3 4"/></svg><span>{status==='loading'?'กำลังโหลดรูปย่อ…':status==='expired'?'งานหมดอายุแล้ว':'แสดงรูปย่อไม่ได้'}</span>{status==='error'&&<button type="button" className="idprom-saved-preview-retry" onClick={event=>{event.stopPropagation();setRevision(value=>value+1)}}>ลองอีกครั้ง</button>}</div>}
 </div>;
}
