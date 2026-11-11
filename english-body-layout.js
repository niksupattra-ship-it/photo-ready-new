import {ENGLISH_HEAD_SCALE} from './english-body-portrait.js';
import sharp from 'sharp';
import {measureUniformAnchors} from './src/portrait-uniform-fit.js';
// Conditioning reference only. Never paste this mannequin into delivered pixels.
export async function createEnglishBodyLayout(outfit,{headScale=ENGLISH_HEAD_SCALE,identity=null}={}){
 if(!Number.isFinite(headScale)||headScale<=0||headScale>1)throw Error('Invalid English head reference scale.');
 const {data,info}=await sharp(outfit).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const uniform=measureUniformAnchors(data,info.width,info.height),span=uniform.shoulderWidth;
 const referenceHeadWidth=span*.40,referenceHeadHeight=span*.54;
 const face=identity?await sharp(identity).metadata():null,faceAspect=face?.width&&face?.height?face.height/face.width:null;
 const headWidth=Math.min(referenceHeadWidth*headScale,faceAspect?referenceHeadHeight/(faceAspect+.12):Infinity),headHeight=faceAspect?headWidth*(faceAspect+.12):referenceHeadHeight*headScale,neckLength=span*.045,neckWidth=span*.22;
 const chinY=uniform.collarTopY-neckLength,headTop=chinY-headHeight;
 const left=Math.min(uniform.bounds.l,uniform.centerX-referenceHeadWidth/2),right=Math.max(uniform.bounds.r+1,uniform.centerX+referenceHeadWidth/2);
 const top=Math.min(chinY-referenceHeadHeight,uniform.bounds.t),bottom=uniform.bounds.b+1;
 const W=768,H=1024,pad=24,scale=Math.min((W-2*pad)/(right-left),(H-2*pad)/(bottom-top));
 const x=(W-(right-left)*scale)/2-left*scale,y=H-pad-bottom*scale;
 const cx=x+uniform.centerX*scale,headY=y+headTop*scale,chin=y+chinY*scale,collar=y+uniform.collarTopY*scale;
 // The cervical reference ends at the collar/shoulder junction. A deep V
 // exposes chest below it and must not become a longer reference neck.
 const skinBottom=y+Math.max(uniform.socketY,uniform.collarTopY+span*.20)*scale;
 const neckBase=collar+span*.035*scale;
 const skinWidth=span*.40*scale,neck=neckWidth*scale,upperNeck=faceAspect?headWidth*.60*scale:neck;
 const neckShape=faceAspect?`<path d="M ${cx-upperNeck/2} ${chin-neckLength*scale*.35} L ${cx-neck/2} ${neckBase} L ${cx+neck/2} ${neckBase} L ${cx+upperNeck/2} ${chin-neckLength*scale*.35} Z" fill="#929ba8"/>`:`<rect x="${cx-neck/2}" y="${chin-neckLength*scale*.35}" width="${neck}" height="${neckBase-chin+neckLength*scale*.35}" fill="#929ba8"/>`;
 const shape=Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#929ba8"/><stop offset="1" stop-color="#bec5ce"/></linearGradient></defs><rect width="100%" height="100%" fill="#e5e8ed"/><path d="M ${cx-neck/2} ${neckBase} Q ${cx-neck/2} ${skinBottom-neck*.25} ${cx-skinWidth/2} ${skinBottom} L ${cx+skinWidth/2} ${skinBottom} Q ${cx+neck/2} ${skinBottom-neck*.25} ${cx+neck/2} ${neckBase} Z" fill="url(#skin)"/>${neckShape}<ellipse cx="${cx}" cy="${headY+headHeight*scale/2}" rx="${headWidth*scale/2}" ry="${headHeight*scale/2}" fill="#aab2bd"/><g fill="#697585" stroke="#697585" stroke-width="${headWidth*scale*.012}" stroke-linecap="round"><circle cx="${cx-headWidth*scale*.19}" cy="${headY+headHeight*scale*.45}" r="${headWidth*scale*.017}"/><circle cx="${cx+headWidth*scale*.19}" cy="${headY+headHeight*scale*.45}" r="${headWidth*scale*.017}"/><path d="M ${cx} ${headY+headHeight*scale*.52} L ${cx} ${headY+headHeight*scale*.64}" fill="none"/></g></svg>`);
 const garment=await sharp(outfit).resize({width:Math.max(1,Math.round(info.width*scale)),height:Math.max(1,Math.round(info.height*scale))}).png().toBuffer();
 // Clip only transparent template margins outside the guide board. The measured
 // opaque garment bounds and all buttons/pockets remain inside the frame.
 const gx=Math.round(x),gy=Math.round(y),meta=await sharp(garment).metadata();
 const il=Math.max(0,-gx),it=Math.max(0,-gy),iw=Math.min(meta.width-il,W-Math.max(0,gx)),ih=Math.min(meta.height-it,H-Math.max(0,gy));
 if(iw<1||ih<1)throw Error('Could not prepare the outfit layout reference.');
 const visible=await sharp(garment).extract({left:il,top:it,width:iw,height:ih}).png().toBuffer();
 const overlays=[];
 if(faceAspect){
  const width=Math.max(1,Math.round(headWidth*scale)),height=Math.max(1,Math.round(width*faceAspect));
  const mask=await sharp(Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="${width*.18}" fill="white"/></svg>`)).blur(Math.max(.3,width*.008)).png().toBuffer();
  const photo=await sharp(identity).resize(width,height).ensureAlpha().composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
  overlays.push({input:photo,left:Math.max(0,Math.round(cx-width/2)),top:Math.max(0,Math.round(chin-height))});
 }
 overlays.push({input:visible,left:Math.max(0,gx),top:Math.max(0,gy)});
 return sharp(shape).composite(overlays).png().toBuffer();
}
