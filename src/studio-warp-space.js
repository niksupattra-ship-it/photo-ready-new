import {PROJECT_IMAGE_MAX_PIXELS} from './project-resource-guard.js';

const SIDE_LIMIT=8192,REPLACEMENT_BYTES=256*1024*1024;
const frameFor=frame=>frame||{x:0,y:0,w:900,h:1200};
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const failure=(code,message)=>({expanded:false,limited:true,error:{code,message}});
const invalid=()=>failure('WARP_SPACE_INVALID','ยังเตรียมพื้นที่บิดรูปไม่สำเร็จ งานเดิมยังอยู่ กรุณาลองอีกครั้ง');
const limited=()=>failure('WARP_SPACE_LIMIT','บิดออกจากขอบได้ถึงขีดจำกัดภาพนี้แล้ว งานเดิมยังอยู่ กรุณาลดขนาดแปรงหรือดึงทีละน้อย');

// Grow in whole native pixels. The source-to-workspace pixel density is kept
// exact, so adding a transparent border never moves or resizes existing pixels.
export function planWarpSpace(frame,width,height,{start,end=start,radius},{maxSide=SIDE_LIMIT,maxPixels=PROJECT_IMAGE_MAX_PIXELS}={}){
 const f=frameFor(frame);
 if(![f.x,f.y,f.w,f.h,width,height,radius,maxSide,maxPixels].every(Number.isFinite)||f.w<=0||f.h<=0||width<1||height<1||!Number.isInteger(width)||!Number.isInteger(height)||radius<=0||!finitePoint(start)||!finitePoint(end))return invalid();
 const sx=width/f.w,sy=height/f.h,r=radius*Math.max(sx,sy);
 const x0=(Math.min(start.x,end.x)-f.x)*sx-r,x1=(Math.max(start.x,end.x)-f.x)*sx+r;
 const y0=(Math.min(start.y,end.y)-f.y)*sy-r,y1=(Math.max(start.y,end.y)-f.y)*sy+r;
 if(x1<0||y1<0||x0>width||y0>height)return {expanded:false};
 const minimum={left:Math.max(0,Math.ceil(-x0)),right:Math.max(0,Math.ceil(x1-width)),top:Math.max(0,Math.ceil(-y0)),bottom:Math.max(0,Math.ceil(y1-height))};
 if(!Object.values(minimum).some(Boolean))return {expanded:false};
 const reserve=Math.max(16,r*.25),grow=n=>n?Math.ceil((n+reserve)/32)*32:0;
 let padding=Object.fromEntries(Object.entries(minimum).map(([key,value])=>[key,grow(value)]));
 const valid=p=>width+p.left+p.right<=maxSide&&height+p.top+p.bottom<=maxSide&&(width+p.left+p.right)*(height+p.top+p.bottom)<=maxPixels;
 // At the image limit, avoid rejecting a small useful drag merely because the
 // amortization reserve would exceed the cap. Never resize pixels to make room.
 if(!valid(padding)){padding=minimum;if(!valid(padding))return limited()}
 const w=width+padding.left+padding.right,h=height+padding.top+padding.bottom;
 return {expanded:true,width:w,height:h,padding,frame:{x:f.x-padding.left/sx,y:f.y-padding.top/sy,w:w/sx,h:h/sy},oldFrame:{...f},oldWidth:width,oldHeight:height};
}

// Construct replacements off to the side. The caller commits both returned
// records together; an invalid source/allocation leaves every live pixel intact.
export function ensureWarpSpace(asset,layer,stroke,options={}){
 if(!asset?.original||!asset.mask)return invalid();
 const width=asset.original.naturalWidth||asset.original.width,height=asset.original.naturalHeight||asset.original.height;
 const plan=planWarpSpace(layer.sourceFrame||asset.sourceFrame,width,height,stroke,options);
 if(!plan.expanded)return plan;
 const fields=['original','mask','warped','warpBaseMask','eraseRestoreSource','warpRestoreBase'];
 const originals=fields.map(key=>asset[key]).filter(Boolean),parts=asset.parts&&['left','right'].map(key=>asset.parts[key]);
 if(parts)originals.push(...parts);
 const frameSources=asset.frameSources||{};
 originals.push(...Object.values(frameSources).filter(Boolean));
 const sources=[...new Set(originals)];
 const readable=source=>source&&typeof source!=='string'&&Number.isFinite(source.naturalWidth||source.width)&&Number.isFinite(source.naturalHeight||source.height)&&(source.naturalWidth||source.width)>0&&(source.naturalHeight||source.height)>0;
 if(sources.some(source=>!readable(source)))return invalid();
 const maxBytes=options.maxBytes??REPLACEMENT_BYTES;
 if(!Number.isFinite(maxBytes)||maxBytes<=0||(sources.length+1)*plan.width*plan.height*4>maxBytes)return limited();
 const create=options.createCanvas||((w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h}));
 const expanded=new Map(),made=[];
 try{
  for(const source of sources){
   const surface=create(plan.width,plan.height);made.push(surface);
   if(surface.width!==plan.width||surface.height!==plan.height)throw Error('canvas allocation');
   const ctx=surface.getContext('2d');if(!ctx)throw Error('canvas allocation');
   // A few legacy masks use workspace resolution. This matches their previous
   // draw-time scaling while aligning all editable references to native pixels.
   ctx.drawImage(source,plan.padding.left,plan.padding.top,width,height);expanded.set(source,surface);
  }
  const nextAsset={...asset,sourceFrame:plan.frame,dirty:true,dirtyRect:null,bounds:null,boundsSource:null,historyPixels:null,collarRendered:null,collarSource:null,partBounds:undefined,pixelSurfaceOwned:true};
  for(const key of fields)if(asset[key])nextAsset[key]=expanded.get(asset[key]);
  if(parts)nextAsset.parts={left:expanded.get(asset.parts.left),right:expanded.get(asset.parts.right)};
  nextAsset.frameSources=Object.fromEntries(Object.entries(frameSources).map(([key,source])=>[key,source?expanded.get(source):source]));
  // Replacing the draw buffer avoids sharing a resized buffer with a pending
  // gesture/history rollback. It is populated by the normal scene painter.
  nextAsset.buffer=create(1,1);made.push(nextAsset.buffer);
  if(!nextAsset.buffer.getContext('2d'))throw Error('canvas allocation');
  const nextLayer={...layer,sourceFrame:plan.frame,source:nextAsset.original,mask:nextAsset.mask};
  for(const [field,key]of [['warpSource','warped'],['warpBaseMask','warpBaseMask'],['eraseRestoreSource','eraseRestoreSource'],['warpRestoreBase','warpRestoreBase']])if(nextAsset[key])nextLayer[field]=nextAsset[key];
  if(nextAsset.parts)nextLayer.collarParts=nextAsset.parts;
  for(const [key,source]of Object.entries(nextAsset.frameSources))if(source)nextLayer[key]=source;
  return {...plan,asset:nextAsset,layer:nextLayer};
 }catch{
  // Only newly allocated canvases are released. The original records and all
  // surfaces from the current document remain untouched and can be retried.
  for(const surface of made)try{surface.width=1;surface.height=1}catch{}
  return failure('WARP_SPACE_ALLOCATION','หน่วยความจำสำหรับบิดรูปไม่พอ งานเดิมยังอยู่ กรุณาลดขนาดแปรงแล้วลองอีกครั้ง');
 }
}
