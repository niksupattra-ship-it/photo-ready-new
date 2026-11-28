import sharp from 'sharp';
import {createFemaleGarmentLayout,femaleLabChinPlacement} from './female-portrait-layout.js';

// Placement only in the experiment. Never reshape the original facial features.
export const GUIDE_EDIT_FACE_SCALE=.95;
export const GUIDE_EDIT_NECK_GAP_SCALE=.8;
export function guideEditFacePlacement(layout){
 const span=layout.shoulderSpan,originalChin=femaleLabChinPlacement(layout),context=layout.measuredCollar;
 if(!Number.isFinite(context.contactY)||!(span>0))throw Error('Missing collar contact');
 // collarTopY is the outer collar top. The skin contact is lower and must
 // be mapped from native garment coordinates using the same garment scale.
 const collarContactY=layout.collarTopY+(context.contactY-context.upperCollarY)*span/context.shoulderWidth;
 const originalGap=collarContactY-originalChin;
 if(!Number.isFinite(originalGap)||originalGap<=0)throw Error('Invalid collar contact gap');
 const neckGap=originalGap*GUIDE_EDIT_NECK_GAP_SCALE;
 return {width:Math.round(span*.35*GUIDE_EDIT_FACE_SCALE),height:Math.round(span*.465*GUIDE_EDIT_FACE_SCALE),
  chin:collarContactY-neckGap,collarContactY,originalGap,neckGap};
}

export async function createGuideEditLabBase(outfit,face){
 const outfitMeta=await sharp(outfit,{limitInputPixels:33554432}).metadata();
 if(!['png','jpeg','webp'].includes(outfitMeta.format))throw Error('Unsupported outfit');
 if(!face?.length)throw Error('Missing original face');
 const meta=await sharp(face,{limitInputPixels:33554432}).metadata();
 if(meta.format!=='png'||!meta.hasAlpha||meta.width<32||meta.height<32)throw Error('Invalid original face');
 const layout=await createFemaleGarmentLayout(outfit),span=layout.shoulderSpan,cx=layout.centerX,placement=guideEditFacePlacement(layout),chin=placement.chin;
 const placed=await sharp(face).resize({width:placement.width,height:placement.height,fit:'inside'}).png().toBuffer(),size=await sharp(placed).metadata();
 const {data}=await sharp(face).ensureAlpha().raw().toBuffer({resolveWithObject:true});let r=0,g=0,b=0,n=0;
 for(let i=0;i<data.length;i+=4)if(data[i+3]>192&&data[i]>data[i+1]&&data[i+1]>data[i+2]){r+=data[i];g+=data[i+1];b+=data[i+2];n++;}
 const colour=n?`rgb(${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)})`:'#cba28c';
 const neck=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024"><path d="M ${cx-span*.10} ${chin-span*.03} L ${cx-span*.12} ${layout.collarTopY+span*.10} L ${cx-span*.22} ${layout.collarTopY+span*.22} L ${cx+span*.22} ${layout.collarTopY+span*.22} L ${cx+span*.12} ${layout.collarTopY+span*.10} L ${cx+span*.10} ${chin-span*.03} Z" fill="${colour}"/></svg>`);
 return sharp({create:{width:768,height:1024,channels:4,background:'#ffffff'}}).composite([{input:neck},{input:placed,left:Math.round(cx-size.width/2),top:Math.round(chin-size.height)},{input:layout.nativeForeground}]).png().toBuffer();
}
