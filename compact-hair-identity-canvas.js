import sharp from 'sharp';
import {selectedHairDesign} from './hairstyle-catalog.js';

// Source conditioning only: do not edit the customer upload, identity crop,
// generated pixels or output matte. Keep the measured face at its exact scale
// and position. The selected hair guide, not the discarded source hair, supplies
// the missing scalp and neck-side content in the one existing provider request.
export async function compactHairIdentityCanvas(input,faceBox,selected,{keepCurrentHair=false}={}){
 if(keepCurrentHair||!['short','gathered'].includes(selectedHairDesign(selected)?.kind)||!Array.isArray(faceBox)||faceBox.length!==4)return input;
 const [x0,y0,x1,y1]=faceBox;
 if(!faceBox.every(x=>Number.isFinite(x)&&x>=0&&x<=1)||x1<=x0||y1<=y0)return input;
 const meta=await sharp(input.buffer,{limitInputPixels:33554432}).metadata();
 const {width:W,height:H}=meta.autoOrient||meta;
 if(!W||!H)return input;
 const fw=(x1-x0)*W,fh=(y1-y0)*H;
 if(fw<16||fh<16)return input;
 // Keep an ear allowance along both sides, but no source crown or lower neck.
 const left=Math.max(0,Math.floor(x0*W-fw*.16)),right=Math.min(W,Math.ceil(x1*W+fw*.16));
 const top=Math.max(0,Math.floor(y0*H-fh*.025)),bottom=Math.min(H,Math.ceil(y1*H+1));
 const crop=await sharp(input.buffer,{limitInputPixels:33554432}).rotate().extract({left,top,width:right-left,height:bottom-top}).png().toBuffer();
 const pad={r:53,g:107,b:216,alpha:1};
 const buffer=await sharp({create:{width:W,height:H,channels:4,background:pad}}).composite([{input:crop,left,top}]).png().toBuffer();
 return {...input,buffer,mimetype:'image/png'};
}
export const COMPACT_IDENTITY_CANVAS_INSTRUCTION='COMPACT SELECTED HAIR — SOURCE IDENTITY CANVAS: Image 1 intentionally contains only the original facial region with ear allowance at the original scale/position; blank blue space replaces obsolete source hair and the old lower image. It is not a finished portrait. Reconstruct the natural scalp, ears where needed and neck with the required existing composition using the same person and the selected hairstyle only. Never treat the blank region as missing source hairstyle to restore. Do not move, resize or reshape the face. Keep all original outfit, cutout, neck geometry, Makeup/Natural and framing instructions. Generate the selected compact hairstyle with a clean nape and open space below both ears. Return the normal complete photo, not the cropped conditioning guide.';
