import sharp from 'sharp';
import {planThaiNeckCanvas} from './thai-neck-backing-policy.js';

// Add actual working space for the AI. Existing facial pixels are translated
// onto a larger canvas; no neck stretching, skin patch or extra generation.
export async function prepareThaiNeckCanvas(input,faceBox){
 try{
  const meta=await sharp(input.buffer,{limitInputPixels:33554432}).metadata();
  const plan=planThaiNeckCanvas(meta.width,meta.height,faceBox);
  if(!plan||!Object.values(plan).some(Boolean))return input;
  let image=sharp(input.buffer,{limitInputPixels:33554432}).extend({...plan,background:{r:53,g:107,b:216,alpha:1}});
  const width=meta.width+plan.left+plan.right,height=meta.height+plan.bottom;
  if(width*height>8_000_000){const scale=Math.sqrt(8_000_000/(width*height));image=image.resize({width:Math.max(2,Math.floor(width*scale)),height:Math.max(2,Math.floor(height*scale)),fit:'inside',withoutEnlargement:true})}
  // Keep the expanded aspect in the requested output too. A square output
  // would otherwise crop away the new working space again. Use normal 2K
  // dimensions; unusual source ratios retain the existing automatic size.
  const aspect=width/height,outWidth=Math.round(Math.sqrt(4194304*aspect)/16)*16,outHeight=Math.round(Math.sqrt(4194304/aspect)/16)*16;
  const neckCanvasSize=aspect>=1/3&&aspect<=3&&outWidth>=1024&&outHeight>=1024&&outWidth<=4096&&outHeight<=4096?`${outWidth}x${outHeight}`:undefined;
  return {...input,buffer:await image.png().toBuffer(),mimetype:'image/png',neckCanvasSize};
 }catch{
  // Canvas preparation is optional. A valid portrait must not become a failed
  // job because this additional room could not be prepared on the server.
  return input;
 }
}
