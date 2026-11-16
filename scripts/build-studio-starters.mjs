import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import sharp from 'sharp';

export function measureStarterUniform(data,width,height){
 let left=width,top=height,right=-1,bottom=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>12){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)}
 if(right<left){left=top=0;right=width-1;bottom=height-1}
 const cx0=Math.floor(width*.46),cx1=Math.ceil(width*.54);let socketY=top;
 outer:for(let y=top;y<=bottom;y++){
  let opaque=0;for(let x=cx0;x<cx1;x++)if(data[(y*width+x)*4+3]>48)opaque++;
  if(opaque>=(cx1-cx0+1)*.12){socketY=y;break outer}
 }
 return {width,height,left,top,opaqueWidth:right-left+1,socketY};
}

export async function buildStudioStarters(){
 const previews=JSON.parse(await readFile(new URL('../src/uniform-quick-previews.json',import.meta.url),'utf8'));
 const uniforms={},backgrounds={};
 for(const [path,preview] of Object.entries(previews)){
  const input=await readFile(new URL('../public'+path,import.meta.url));
  const {data,info}=await sharp(input).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  uniforms[path]={...measureStarterUniform(data,info.width,info.height),preview,sha256:crypto.createHash('sha256').update(input).digest('hex')};
 }
 for(const path of ['/assets/background.jpg','/assets/background-options/white.jpg']){
  const {width,height}=await sharp(new URL('../public'+path,import.meta.url).pathname).metadata();backgrounds[path]={width,height};
 }
 await writeFile(new URL('../src/studio-starters.json',import.meta.url),JSON.stringify({uniforms,backgrounds},null,2)+'\n');
 return Object.keys(uniforms).length;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])console.log('Prepared native-derived starter geometry for '+await buildStudioStarters()+' native outfits');
