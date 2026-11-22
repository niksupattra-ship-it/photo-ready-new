import {detectUniformDetails,matchUniformDetails,insideDetail,REAL_UNIFORM_DETAILS_VERSION,REAL_UNIFORM_DETAIL_TEMPLATES} from './real-uniform-details.js';
const make=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
const load=source=>source instanceof HTMLCanvasElement?Promise.resolve(source):new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('โหลดภาพชุดจริงไม่สำเร็จ'));im.src=source});
function analyze(im){const scale=640/im.width,c=make(640,Math.round(im.height*scale));c.getContext('2d').drawImage(im,0,0,c.width,c.height);return {pixels:c.getContext('2d').getImageData(0,0,c.width,c.height),geometry:detectUniformDetails(c.getContext('2d').getImageData(0,0,c.width,c.height)),scale:im.width/640}}
const expanded=(g,pad)=>g.hull.map(p=>{const dx=p.x-g.cx,dy=p.y-g.cy,d=Math.hypot(dx,dy)||1;return {x:p.x+pad*dx/d,y:p.y+pad*dy/d}});
function cleanOldDetails(im,analysis,parts){
 const {pixels,scale}=analysis,{width:w,height:h,data}=pixels,mask=new Uint8Array(w*h);
 for(const {target:g}of parts){
  const hull=expanded(g,2),left=Math.max(0,Math.floor(Math.min(...hull.map(p=>p.x)))),right=Math.min(w-1,Math.ceil(Math.max(...hull.map(p=>p.x)))),top=Math.max(0,Math.floor(Math.min(...hull.map(p=>p.y)))),bottom=Math.min(h-1,Math.ceil(Math.max(...hull.map(p=>p.y))));
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)if(insideDetail(x+.5,y+.5,hull))mask[y*w+x]=1;
 }
 const fill=new Uint8ClampedArray(data.length),directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
 for(let n=0;n<mask.length;n++)if(mask[n]){
  const x=n%w,y=Math.floor(n/w);let best=null;
  for(const [dx,dy]of directions)for(let d=1;d<=240;d++){
   const xx=x+dx*d,yy=y+dy*d;if(xx<0||xx>=w||yy<0||yy>=h)break;
   const next=yy*w+xx;if(mask[next])continue;
   const distance=d*Math.hypot(dx,dy);if(!best||distance<best.distance)best={index:next*4,distance};break;
  }
  if(!best)throw Error('เก็บรายละเอียดชุดเดิมไม่สำเร็จ · เก็บภาพเดิมไว้');
  fill.set(data.subarray(best.index,best.index+4),n*4);
 }
 const cleaned=make(im.width,im.height),ctx=cleaned.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);const native=ctx.getImageData(0,0,im.width,im.height);
 // Replace ONLY pixels of the measured old objects, including alpha. Every
 // face/skin/cloth pixel outside these measured regions remains byte-identical.
 for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++){const n=Math.min(h-1,Math.floor(y/scale))*w+Math.min(w-1,Math.floor(x/scale));if(mask[n])native.data.set(fill.subarray(n*4,n*4+4),(y*im.width+x)*4)}
 ctx.putImageData(native,0,0);return cleaned;
}
function sourceCutout(im,g,scale){
 const hull=expanded(g,.8).map(p=>({x:p.x*scale,y:p.y*scale}));
 const left=Math.max(0,Math.floor(Math.min(...hull.map(p=>p.x)))),top=Math.max(0,Math.floor(Math.min(...hull.map(p=>p.y)))),right=Math.min(im.width,Math.ceil(Math.max(...hull.map(p=>p.x)))),bottom=Math.min(im.height,Math.ceil(Math.max(...hull.map(p=>p.y))));
 const c=make(right-left,bottom-top),ctx=c.getContext('2d');ctx.beginPath();hull.forEach((p,i)=>i?ctx.lineTo(p.x-left,p.y-top):ctx.moveTo(p.x-left,p.y-top));ctx.closePath();ctx.clip();ctx.drawImage(im,-left,-top);return {canvas:c,left,top};
}
export async function prepareRealUniformDetails({originalSource,templatePath}){
 if(!REAL_UNIFORM_DETAIL_TEMPLATES.has(templatePath))return null;
 const [portrait,reference]=await Promise.all([load(originalSource),load(templatePath)]);
 if(portrait.width*portrait.height>33554432)throw Error('ภาพใหญ่เกินสำหรับวางรายละเอียดชุด');
 const [a,b]=[analyze(reference),analyze(portrait)],pairs=matchUniformDetails(a.geometry,b.geometry);
 if(!pairs.length)return null;
 const cleaned=cleanOldDetails(portrait,b,pairs),parts=[];
 for(const {source,target,name}of pairs){
  const s=a.scale,t=b.scale,patch=sourceCutout(reference,source,s),c=Math.cos(target.angle),sn=Math.sin(target.angle);
  let sx=target.w*t/(source.w*s),sy=target.h*t/(source.h*s);
  if(source.kind==='button')sx=sy=Math.sqrt(sx*sy); // Keep genuine round metal buttons round.
  const drawW=source.w*s*sx,drawH=source.h*s*sy;
  const halfW=(Math.abs(drawW*c)+Math.abs(drawH*sn))/2+4,halfH=(Math.abs(drawW*sn)+Math.abs(drawH*c))/2+4;
  const left=Math.floor(target.cx*t-halfW),top=Math.floor(target.cy*t-halfH),canvas=make(Math.ceil(halfW*2),Math.ceil(halfH*2)),ctx=canvas.getContext('2d');
  ctx.translate(target.cx*t-left,target.cy*t-top);ctx.rotate(target.angle);ctx.scale(sx,sy);ctx.rotate(-source.angle);ctx.imageSmoothingQuality='high';ctx.drawImage(patch.canvas,patch.left-source.cx*s,patch.top-source.cy*s);
  parts.push({name,kind:source.kind,source:canvas.toDataURL('image/png'),frame:{x:left,y:top,w:canvas.width,h:canvas.height}});
 }
 return {regions:pairs.map(({target})=>expanded(target,2)),version:REAL_UNIFORM_DETAILS_VERSION,cleanedSource:cleaned.toDataURL('image/png'),parts,width:portrait.width,height:portrait.height};
}

// Restore only the old detail locations, keeping any later face/makeup edits.
export async function restoreRealUniformDetails({currentSource,originalSource,regions}){
 if(!Array.isArray(regions)||regions.length>8||regions.some(p=>!Array.isArray(p)||p.length<3||p.length>256||p.some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.y)||q.x< -8||q.x>648||q.y< -8||q.y>2008)))throw Error('ข้อมูลตำแหน่งชุดไม่ครบ · เก็บภาพเดิมไว้');
 const [current,original]=await Promise.all([load(currentSource),load(originalSource)]);
 if(current.width!==original.width||current.height!==original.height)throw Error('ขนาดภาพเปลี่ยนแล้ว · เก็บภาพเดิมไว้');
 const c=make(current.width,current.height),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(current,0,0);const target=ctx.getImageData(0,0,c.width,c.height),base=make(c.width,c.height),bx=base.getContext('2d',{willReadFrequently:true});bx.drawImage(original,0,0);const source=bx.getImageData(0,0,c.width,c.height).data;
 const scale=current.width/640;
 for(const polygon of regions){
  const left=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p.x))*scale)),right=Math.min(c.width,Math.ceil(Math.max(...polygon.map(p=>p.x))*scale)+1),top=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p.y))*scale)),bottom=Math.min(c.height,Math.ceil(Math.max(...polygon.map(p=>p.y))*scale)+1);
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(insideDetail(Math.floor(x/scale)+.5,Math.floor(y/scale)+.5,polygon)){const i=(y*c.width+x)*4;target.data.set(source.subarray(i,i+4),i)}
 }
 ctx.putImageData(target,0,0);return c.toDataURL('image/png');
}
