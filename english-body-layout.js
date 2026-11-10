import sharp from 'sharp';
import {measureUniformAnchors} from './src/portrait-uniform-fit.js';
// Conditioning reference only. Never paste this mannequin into delivered pixels.
export async function createEnglishBodyLayout(outfit){
 const {data,info}=await sharp(outfit).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const uniform=measureUniformAnchors(data,info.width,info.height),span=uniform.shoulderWidth;
 const headWidth=span*.40,headHeight=span*.54,neckLength=span*.07,neckWidth=span*.22;
 const chinY=uniform.collarTopY-neckLength,headTop=chinY-headHeight;
 const left=Math.min(uniform.bounds.l,uniform.centerX-headWidth/2),right=Math.max(uniform.bounds.r+1,uniform.centerX+headWidth/2);
 const top=Math.min(headTop,uniform.bounds.t),bottom=uniform.bounds.b+1;
 const W=768,H=1024,pad=24,scale=Math.min((W-2*pad)/(right-left),(H-2*pad)/(bottom-top));
 const x=(W-(right-left)*scale)/2-left*scale,y=H-pad-bottom*scale;
 const cx=x+uniform.centerX*scale,headY=y+headTop*scale,chin=y+chinY*scale,collar=y+uniform.collarTopY*scale;
 // The cervical reference ends at the collar/shoulder junction. A deep V
 // exposes chest below it and must not become a longer reference neck.
 const skinBottom=y+Math.max(uniform.socketY,uniform.collarTopY+span*.20)*scale;
 const neckBase=collar+span*.035*scale;
 const skinWidth=span*.40*scale,neck=neckWidth*scale;
 const shape=Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#929ba8"/><stop offset="1" stop-color="#bec5ce"/></linearGradient></defs><rect width="100%" height="100%" fill="#e5e8ed"/><path d="M ${cx-neck/2} ${neckBase} Q ${cx-neck/2} ${skinBottom-neck*.25} ${cx-skinWidth/2} ${skinBottom} L ${cx+skinWidth/2} ${skinBottom} Q ${cx+neck/2} ${skinBottom-neck*.25} ${cx+neck/2} ${neckBase} Z" fill="url(#skin)"/><rect x="${cx-neck/2}" y="${chin-neckLength*scale*.35}" width="${neck}" height="${neckBase-chin+neckLength*scale*.35}" fill="#929ba8"/><ellipse cx="${cx}" cy="${headY+headHeight*scale/2}" rx="${headWidth*scale/2}" ry="${headHeight*scale/2}" fill="#aab2bd"/></svg>`);
 const garment=await sharp(outfit).resize({width:Math.max(1,Math.round(info.width*scale)),height:Math.max(1,Math.round(info.height*scale))}).png().toBuffer();
 // Clip only transparent template margins outside the guide board. The measured
 // opaque garment bounds and all buttons/pockets remain inside the frame.
 const gx=Math.round(x),gy=Math.round(y),meta=await sharp(garment).metadata();
 const il=Math.max(0,-gx),it=Math.max(0,-gy),iw=Math.min(meta.width-il,W-Math.max(0,gx)),ih=Math.min(meta.height-it,H-Math.max(0,gy));
 if(iw<1||ih<1)throw Error('Could not prepare the outfit layout reference.');
 const visible=await sharp(garment).extract({left:il,top:it,width:iw,height:ih}).png().toBuffer();
 return sharp(shape).composite([{input:visible,left:Math.max(0,gx),top:Math.max(0,gy)}]).png().toBuffer();
}
