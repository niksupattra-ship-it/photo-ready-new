import sharp from 'sharp';
import {createFemaleGarmentLayout} from './female-portrait-layout.js';
import {fitFemaleBodyToGuide} from './female-body-guide-fit.js';
import {fileURLToPath} from 'node:url';
import {preserveExactFemalePixels} from './female-exact-matting.js';

// The lab's complete post-AI foreground process, shared with new production jobs.
export async function prepareFemaleLabForeground(original,removeBackground,{outfit}={}){
 const {png,alpha}=await preserveExactFemalePixels(original,await removeBackground(original));
 if(!alpha||alpha.min>=250||alpha.max<=5)throw Error('Background removal did not produce a valid portrait');
 const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(outfit){const layout=await createFemaleGarmentLayout(outfit);return fitFemaleBodyToGuide(png,layout.nativeForeground);}
 // Preserve the complete provider canvas; never zoom to the coat or recalculate head placement.
 return sharp(png).resize(900,1200,{fit:'contain',background:'#00000000'}).png().toBuffer();
}
export async function compositeFemaleLabBackground(foreground){
 return sharp(fileURLToPath(new URL('./public/assets/background.jpg',import.meta.url))).resize(900,1200,{fit:'fill'}).composite([{input:foreground,left:0,top:0}]).png().toBuffer();
}
export async function completeFemaleLabResult(original,removeBackground,options){return compositeFemaleLabBackground(await prepareFemaleLabForeground(original,removeBackground,options));}
