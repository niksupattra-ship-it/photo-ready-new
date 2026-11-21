import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const left=[[760,180],[840,180],[1024,460],[960,610],[970,940],[850,940],[795,650],[735,300]];
const inside=(x,y,p)=>{let hit=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>y)!==(p[j][1]>y)&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])hit=!hit;return hit};
const distance=(x,y,p)=>Math.min(...p.map((a,i)=>{const b=p[(i+1)%p.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)}));
const median=a=>a.sort((x,y)=>x-y)[a.length>>1];
export function removeRealInnerCollar({data,width,height}){
 if(width!==2048||height!==1731||data.length!==width*height*4)throw Error('unexpected_native_uniform_dimensions');
 const output=Buffer.from(data),right=left.map(([x,y])=>[width-x,y]);let changed=0;
 const tieBounds=new Map();
 for(let y=455;y<960;y++){let lo=width,hi=-1;for(let x=890;x<1160;x++){const i=(y*width+x)*4;if(data[i+3]>250&&Math.max(data[i],data[i+1],data[i+2])<135){lo=Math.min(lo,x);hi=Math.max(hi,x)}}if(hi>=lo)tieBounds.set(y,[lo-2,hi+2]);}
 for(const polygon of [left,right])for(let y=180;y<941;y++){
  const xs=[];for(let x=710;x<1340;x++)if(inside(x+.5,y+.5,polygon))xs.push(x);
  if(!xs.length)continue;
  const isLeft=polygon===left,edge=isLeft?xs[0]:xs.at(-1),samples=[[],[],[]];
  for(let sy=Math.max(180,y-2);sy<=Math.min(height-1,y+2);sy++)for(let d=18;d<68;d+=2){const sx=edge+(isLeft?-d:d),i=(sy*width+sx)*4,r=data[i],g=data[i+1],b=data[i+2];if(data[i+3]>250&&Math.min(r,g,b)>180&&Math.max(r,g,b)-Math.min(r,g,b)<60)for(let c=0;c<3;c++)samples[c].push(data[i+c]);}
  if(samples[0].length<5)continue;
  const colour=samples.map(median),tie=tieBounds.get(y);
  for(const x of xs){const i=(y*width+x)*4;if(!data[i+3]||(tie&&x>=tie[0]&&x<=tie[1]))continue;let weight=Math.min(1,distance(x+.5,y+.5,polygon)/14);weight=weight*weight*(3-2*weight);let diff=false;for(let c=0;c<3;c++){output[i+c]=Math.round(data[i+c]*(1-weight)+colour[c]*weight);if(output[i+c]!==data[i+c])diff=true}if(diff)changed++;}
 }
 return {data:output,width,height,changed,region:{left:710,top:180,right:1340,bottom:941}};
}
export async function build(root){
 const dir=path.join(root,'public/assets/government-uniforms/collarless-v2');await mkdir(dir,{recursive:true});
 for(const name of ['female-operational','female-academic','female-senior','female-government-employee']){
  const {data,info}=await sharp(path.join(root,'public/assets/government-uniforms',name+'.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const edited=removeRealInnerCollar({data,width:info.width,height:info.height});
  await sharp(edited.data,{raw:{width:info.width,height:info.height,channels:4}}).webp({lossless:true}).toFile(path.join(dir,name+'.webp'));
  console.log(name,JSON.stringify({changedPixels:edited.changed,editRegion:edited.region}));
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await build(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
