import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
export function parseEnglishHairFit(raw){
 if(raw===undefined||raw===null||raw==='')return null;
 let value;try{value=typeof raw==='string'?JSON.parse(raw):raw}catch{throw Error('Invalid personal hair placement')}
 if(!value||![value.width,value.height].every(n=>Number.isInteger(n)&&n>0&&n<=8192)||value.width*value.height>33554432||['leftEye','rightEye','forehead','leftTemple','rightTemple','leftFace','rightFace','chin'].some(k=>!point(value.points?.[k])))throw Error('Invalid personal hair placement');
 if(value.scalpOutline!==undefined&&(!Array.isArray(value.scalpOutline)||value.scalpOutline.length>32||value.scalpOutline.some(p=>!point(p))))throw Error('Invalid scalp outline');
 const {leftEye:a,rightEye:b,chin,forehead}=value.points;
 if(Math.hypot((b.x-a.x)*value.width,(b.y-a.y)*value.height)<8||chin.y<=forehead.y)throw Error('Invalid personal hair placement');
 return {width:value.width,height:value.height,points:value.points,bareScalp:value.bareScalp===true,scalpOutline:value.scalpOutline};
}
// A neutral placement reference only; these pixels never enter the final photo.
// The exact picker hair is aligned to the customer's measured eye axis, not
// placed above the old hairline. Bald skin can therefore be covered by roots.
export async function createEnglishHairFitGuide({fit,hair,selected,root}){
 if(!fit||!hair||!selected?.id?.startsWith('seedream-'))return null;
 try{
  const manifest=JSON.parse(await readFile(path.join(root,'public/assets/catalogue-hair-guides/v1/manifest.json'),'utf8')),entry=manifest.entries[selected.id];
  if(!entry?.face?.[33]||!entry.face[263])return null;
  const W=fit.width,H=fit.height,p=fit.points,l={x:p.leftEye.x*W,y:p.leftEye.y*H},r={x:p.rightEye.x*W,y:p.rightEye.y*H};
  const rl={x:entry.face[33].x*entry.width,y:entry.face[33].y*entry.height},rr={x:entry.face[263].x*entry.width,y:entry.face[263].y*entry.height};
  const dx=rr.x-rl.x,dy=rr.y-rl.y,den=dx*dx+dy*dy,a=((r.x-l.x)*dx+(r.y-l.y)*dy)/den,b=((r.y-l.y)*dx-(r.x-l.x)*dy)/den;
  if(![a,b].every(Number.isFinite))return null;
  const tx=l.x-a*rl.x+b*rl.y,ty=l.y-b*rl.x-a*rl.y,fw=Math.abs(p.rightFace.x-p.leftFace.x)*W,cx=(l.x+r.x)/2,chin=p.chin.y*H,forehead=p.forehead.y*H;
  const cap=fit.bareScalp&&fit.scalpOutline?.length>=5?fit.scalpOutline.map(q=>`${q.x*W},${q.y*H}`).join(' '):null;
  const shape=cap?`<polygon points="${cap} ${p.rightFace.x*W},${p.rightFace.y*H} ${cx},${chin} ${p.leftFace.x*W},${p.leftFace.y*H}"/>`:`<ellipse cx="${cx}" cy="${(forehead+chin)/2}" rx="${fw*.57}" ry="${(chin-forehead)*.68}"/>`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#edf0f4"/><g fill="#c9cdd3" stroke="#798594" stroke-width="${Math.max(1,W*.002)}">${shape}</g><image href="data:image/png;base64,${hair.toString('base64')}" width="${entry.width}" height="${entry.height}" transform="matrix(${a} ${b} ${-b} ${a} ${tx} ${ty})"/><g fill="#4a8492"><circle cx="${l.x}" cy="${l.y}" r="${fw*.027}"/><circle cx="${r.x}" cy="${r.y}" r="${fw*.027}"/></g><path d="M ${l.x} ${l.y} L ${r.x} ${r.y}" fill="none" stroke="#4a8492" stroke-width="${Math.max(1,W*.002)}"/></svg>`;
  return await sharp(Buffer.from(svg)).resize({width:768,height:1024,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 }catch{return null}
}
