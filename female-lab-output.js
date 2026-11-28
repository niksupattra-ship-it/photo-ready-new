import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {cleanFemaleWhiteEdge} from './female-white-edge-clean.js';
import {preserveExactFemalePixels} from './female-exact-matting.js';

// The lab's complete post-AI foreground process, shared with new production jobs.
export async function prepareFemaleLabForeground(original,removeBackground){
 let {png,alpha}=await preserveExactFemalePixels(original,await removeBackground(original));
 if(!alpha||alpha.min>=250||alpha.max<=5)throw Error('Background removal did not produce a valid portrait');
 const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const clean=cleanFemaleWhiteEdge(data,info.width,info.height);
 png=await sharp(clean,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
 // Preserve the complete provider canvas. Do not fit/zoom to the coat silhouette:
 // that crops the lower garment and changes the composition seen in ModelArk.
 return sharp(png).resize(900,1200,{fit:'contain',background:'#00000000'}).png().toBuffer();
}
export async function compositeFemaleLabBackground(foreground){
 return sharp(fileURLToPath(new URL('./public/assets/background.jpg',import.meta.url))).resize(900,1200,{fit:'fill'}).composite([{input:foreground,left:0,top:0}]).png().toBuffer();
}
export async function completeFemaleLabResult(original,removeBackground){return compositeFemaleLabBackground(await prepareFemaleLabForeground(original,removeBackground));}
