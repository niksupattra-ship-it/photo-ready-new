import {layerToScene,sceneToLayer} from './studio-transform.js';

export const collarPinKeys=side=>Object.fromEntries(['X','Y','Scale','Rotation'].map(name=>[name.toLowerCase(),'collar'+(side==='left'?'Left':'Right')+name]));
const round=value=>Number(value.toFixed(4));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function collarControlValues(layer,side){
 if(side==='both')return {x:layer.x,y:layer.y,scale:layer.scale*100,rotation:layer.rotation};
 const keys=collarPinKeys(side),origin=layerToScene(layer,{x:450,y:600});
 const moved=layerToScene(layer,{x:450+(layer[keys.x]||0),y:600+(layer[keys.y]||0)});
 return {x:round(moved.x-origin.x),y:round(moved.y-origin.y),scale:(layer[keys.scale]??1)*100,rotation:layer[keys.rotation]||0};
}
function pinPositionPatch(layer,side,x,y){
 const origin=layerToScene(layer,{x:450,y:600}),point=sceneToLayer(layer,{x:origin.x+x,y:origin.y+y}),keys=collarPinKeys(side);
 return {[keys.x]:round(point.x-450),[keys.y]:round(point.y-600)};
}
export function collarControlPatch(layer,side,field,value){
 if(!Number.isFinite(value))return {};
 const limits={x:[-900,900],y:[-1200,1200],scale:[10,300],rotation:[-180,180]};
 value=clamp(value,...limits[field]);
 if(side==='both')return {[field]:field==='scale'?round(value/100):round(value)};
 if(field==='x'||field==='y'){
  const current=collarControlValues(layer,side);
  return pinPositionPatch(layer,side,field==='x'?value:current.x,field==='y'?value:current.y);
 }
 return {[collarPinKeys(side)[field]]:field==='scale'?round(value/100):round(value)};
}
export function collarNudgePatch(layer,side,dx,dy){
 const current=collarControlValues(layer,side),x=clamp(current.x+dx,-900,900),y=clamp(current.y+dy,-1200,1200);
 return side==='both'?{x:round(x),y:round(y)}:pinPositionPatch(layer,side,x,y);
}
export function collarSpacingValue(layer){return round(collarControlValues(layer,'right').x-collarControlValues(layer,'left').x)}
export function collarSpacingPatch(layer,value){
 if(!Number.isFinite(value))return {};
 const left=collarControlValues(layer,'left'),right=collarControlValues(layer,'right'),delta=(clamp(value,-900,900)-collarSpacingValue(layer))/2;
 return {...pinPositionPatch(layer,'left',left.x-delta,left.y),...pinPositionPatch(layer,'right',right.x+delta,right.y)};
}
export function collarResetPatch(side){
 if(side==='both')return {x:0,y:0,scale:1,squeezeX:1,squeezeY:1,rotation:0,...collarResetPatch('left'),...collarResetPatch('right')};
 const keys=collarPinKeys(side);return {[keys.x]:0,[keys.y]:0,[keys.scale]:1,[keys.rotation]:0};
}
export function collarPinCenter(bounds,layer,side){
 const keys=collarPinKeys(side);return {x:bounds.x+bounds.w/2+(layer[keys.x]||0),y:bounds.y+bounds.h/2+(layer[keys.y]||0)};
}
export function collarPinBounds(bounds,layer,side){
 if(!bounds)return null;
 const keys=collarPinKeys(side),center=collarPinCenter(bounds,layer,side),scale=layer[keys.scale]??1,r=(layer[keys.rotation]||0)*Math.PI/180;
 const w=(Math.abs(Math.cos(r))*bounds.w+Math.abs(Math.sin(r))*bounds.h)*scale,h=(Math.abs(Math.sin(r))*bounds.w+Math.abs(Math.cos(r))*bounds.h)*scale;
 return {x:center.x-w/2,y:center.y-h/2,w,h};
}
export function unionPinBounds(boxes){
 const valid=boxes.filter(Boolean);if(!valid.length)return null;
 const x=Math.min(...valid.map(b=>b.x)),y=Math.min(...valid.map(b=>b.y));
 return {x,y,w:Math.max(...valid.map(b=>b.x+b.w))-x,h:Math.max(...valid.map(b=>b.y+b.h))-y};
}

// Part images stay immutable. Cache their native alpha bounds once and render
// every edit from those originals, so repeated rotation never degrades pixels.
const nativeBounds=new WeakMap();
function imageBounds(source){
 if(nativeBounds.has(source))return nativeBounds.get(source);
 const canvas=Object.assign(document.createElement('canvas'),{width:source.naturalWidth||source.width,height:source.naturalHeight||source.height});
 try{
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);
  const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
  for(let i=3;i<data.length;i+=4)if(data[i]>16){const n=(i-3)/4,x=n%canvas.width,y=Math.floor(n/canvas.width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}
  const bounds=right<left?null:{x:left,y:top,w:right-left+1,h:bottom-top+1};nativeBounds.set(source,bounds);return bounds;
 }finally{canvas.width=1;canvas.height=1}
}
export function collarBaseBounds(asset,frame={x:0,y:0,w:900,h:1200}){
 return Object.fromEntries(['left','right'].map(side=>{const source=asset.parts[side],b=imageBounds(source),w=source.naturalWidth||source.width,h=source.naturalHeight||source.height;return [side,b?{x:frame.x+b.x/w*frame.w,y:frame.y+b.y/h*frame.h,w:b.w/w*frame.w,h:b.h/h*frame.h}:null]}));
}
export function composeCollarPins(asset,layer){
 if(!asset.parts||asset.warped)return;
 const frame=layer.sourceFrame||{x:0,y:0,w:900,h:1200};
 const key=JSON.stringify([frame,...['left','right'].flatMap(side=>{const k=collarPinKeys(side);return [layer[k.x]||0,layer[k.y]||0,layer[k.scale]??1,layer[k.rotation]||0]})]);
 if(asset.pinCompositionKey===key&&asset.pinParts===asset.parts)return;
 const source=asset.parts.left,width=source.naturalWidth||source.width,height=source.naturalHeight||source.height;
 const canvas=asset.pinComposition||Object.assign(document.createElement('canvas'),{width,height});
 if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
 const ctx=canvas.getContext('2d');let base;ctx.clearRect(0,0,width,height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 for(const side of ['left','right']){
  const keys=collarPinKeys(side),scale=layer[keys.scale]??1;
  if(scale===1&&!(layer[keys.rotation]||0)){ctx.drawImage(asset.parts[side],(layer[keys.x]||0)*width/frame.w,(layer[keys.y]||0)*height/frame.h);continue}
  base ||= collarBaseBounds(asset,frame);if(!base[side])continue;
  const b=base[side],center=collarPinCenter(b,layer,side);
  ctx.save();ctx.scale(width/frame.w,height/frame.h);ctx.translate(center.x-frame.x,center.y-frame.y);ctx.rotate((layer[keys.rotation]||0)*Math.PI/180);ctx.scale(scale,scale);
  ctx.drawImage(asset.parts[side],frame.x-b.x-b.w/2,frame.y-b.y-b.h/2,frame.w,frame.h);ctx.restore();
 }
 asset.original=canvas;asset.pinComposition=canvas;asset.pinCompositionKey=key;asset.pinParts=asset.parts;asset.pinLayer=layer;
 asset.dirty=true;asset.dirtyRect=null;asset.bounds=null;
}
