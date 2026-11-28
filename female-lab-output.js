import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {cleanFemaleWhiteEdge} from './female-white-edge-clean.js';
import {preserveExactFemalePixels} from './female-exact-matting.js';
import {planThaiBodyFrame} from './src/thai-body-framing.js';

// The lab's complete post-AI foreground process, shared with new production jobs.
export async function prepareFemaleLabForeground(original,removeBackground){
 let {png,alpha}=await preserveExactFemalePixels(original,await removeBackground(original));
 if(!alpha||alpha.min>=250||alpha.max<=5)throw Error('Background removal did not produce a valid portrait');
 const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const clean=cleanFemaleWhiteEdge(data,info.width,info.height);
 png=await sharp(clean,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
 const frame=planThaiBodyFrame(clean,info.width,info.height,{fullBodyFrame:true,crownFromAlpha:true});
 // Use raster pixels directly. Embedding a detailed 2K PNG as an SVG data URL
 // exceeds libxml's text-node limit, even when the PNG itself is valid.
 const scaled=await sharp(png).affine([frame.scale,0,0,frame.scale],{background:'#00000000',interpolator:sharp.interpolators.bicubic}).png().toBuffer();
 const size=await sharp(scaled).metadata(),x=Math.round(frame.x),y=Math.round(frame.y);
 const left=Math.max(0,-x),top=Math.max(0,-y),destX=Math.max(0,x),destY=Math.max(0,y);
 const width=Math.min(size.width-left,900-destX),height=Math.min(size.height-top,1200-destY);
 if(width<=0||height<=0)throw Error('Portrait is outside the output frame');
 const visible=await sharp(scaled).extract({left,top,width,height}).png().toBuffer();
 return sharp({create:{width:900,height:1200,channels:4,background:'#00000000'}}).composite([{input:visible,left:destX,top:destY}]).png().toBuffer();
}
export async function compositeFemaleLabBackground(foreground){
 return sharp(fileURLToPath(new URL('./public/assets/background.jpg',import.meta.url))).resize(900,1200,{fit:'fill'}).composite([{input:foreground,left:0,top:0}]).png().toBuffer();
}
export async function completeFemaleLabResult(original,removeBackground){return compositeFemaleLabBackground(await prepareFemaleLabForeground(original,removeBackground));}
