// Production snapshot of the approved v9 layout. Lab-only changes must not alter this version.
import {createEnglishBodyLayout} from './english-body-layout.js';
import sharp from 'sharp';

export const FEMALE_GUIDE_INSTRUCTION="IMAGE 1 — PREPLACED REAL FACE AND FIXED GARMENT: This is the PRIMARY image to edit, not a loose style reference. The customer's actual face has already been levelled with a rigid rotation and placed with a single uniform scale above THIS garment's collar. Preserve its existing face width, height, centre, chin position and garment/collar geometry. The chin was positioned using THIS garment's measured upper collar contact, not a universal shoulder gap. Keep this compact jaw-to-upper-collar relationship: never raise the face, extend a straight neck column to the bottom of a V, bow or tie knot, move the garment, or enlarge the head to hide the gap. An open neckline exposes upper chest below the neck; it does not lengthen the cervical neck. Complete the skull and selected hair around the placed face while keeping the whole head including scalp hair within 40–43% of the shoulder span. Image 2 supplies original identity and skin detail ONLY; ignore its original pose, selfie perspective, head size, camera distance, hairstyle, clothing and crop. Image 3 supplies the selected hair ONLY. Image 4 supplies original garment details ONLY. Reconstruct the missing forehead/hair/neck transitions and apply the requested makeup and acne cleanup as one coherent photographic edit. Do not redesign the composition, enlarge the face, zoom in or shrink the shoulders. Return the complete finished portrait in the SAME single call.";

export function femaleLabChinPlacement(layout){
 const context=layout.measuredCollar;
 if(!context||!Number.isFinite(context.chinY)||!Number.isFinite(context.upperCollarY)||!(context.shoulderWidth>0))throw Error('วัดขอบคอเสื้อไม่สำเร็จ กรุณาเลือกชุดอื่น');
 const scale=layout.shoulderSpan/context.shoulderWidth;
 return layout.collarTopY+(context.chinY-context.upperCollarY)*scale;
}

export async function createFemaleLabGuide(outfit){
 const meta=await sharp(outfit,{limitInputPixels:33554432}).metadata();
 if(!['png','jpeg','webp'].includes(meta.format))throw Error('Unsupported outfit');
 return createEnglishBodyLayout(outfit,{
  headScale:1,canvasWidth:768,fixedIdentityEnvelope:true,stableGarmentFrame:true,
  profile:{headWidthToShoulder:.415,headHeightToShoulder:.56,chinToCollar:.045,neckToShoulder:.22,chestToShoulder:.40}
 });
}

export async function createFemaleLabBase(outfit,face){
 const outfitMeta=await sharp(outfit,{limitInputPixels:33554432}).metadata();
 if(!['png','jpeg','webp'].includes(outfitMeta.format))throw Error('Unsupported outfit');
 if(!face?.length)throw Error('กรุณาเตรียมใบหน้าก่อนสร้างภาพ');
 const meta=await sharp(face,{limitInputPixels:33554432}).metadata();
 if(meta.format!=='png'||!meta.hasAlpha||meta.width<32||meta.height<32)throw Error('ข้อมูลใบหน้าไม่ถูกต้อง');
 const layout=await createEnglishBodyLayout(outfit,{headScale:1,canvasWidth:768,fixedIdentityEnvelope:true,stableGarmentFrame:true,returnNativeForeground:true,collarContext:{template:''},profile:{headWidthToShoulder:.415,headHeightToShoulder:.56,chinToCollar:.045,neckToShoulder:.22,chestToShoulder:.40}});
 const span=layout.shoulderSpan,cx=layout.centerX,chin=femaleLabChinPlacement(layout);
 const placed=await sharp(face).resize({width:Math.round(span*.35),height:Math.round(span*.465),fit:'inside'}).png().toBuffer(),size=await sharp(placed).metadata();
 const {data}=await sharp(face).ensureAlpha().raw().toBuffer({resolveWithObject:true});let r=0,g=0,b=0,n=0;
 for(let i=0;i<data.length;i+=4)if(data[i+3]>192&&data[i]>data[i+1]&&data[i+1]>data[i+2]){r+=data[i];g+=data[i+1];b+=data[i+2];n++;}
 const colour=n?`rgb(${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)})`:'#cba28c';
 const neck=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024"><path d="M ${cx-span*.10} ${chin-span*.03} L ${cx-span*.12} ${layout.collarTopY+span*.10} L ${cx-span*.22} ${layout.collarTopY+span*.22} L ${cx+span*.22} ${layout.collarTopY+span*.22} L ${cx+span*.12} ${layout.collarTopY+span*.10} L ${cx+span*.10} ${chin-span*.03} Z" fill="${colour}"/></svg>`);
 return sharp({create:{width:768,height:1024,channels:4,background:'#ffffff'}}).composite([{input:neck},{input:placed,left:Math.round(cx-size.width/2),top:Math.round(chin-size.height)},{input:layout.nativeForeground}]).png().toBuffer();
}
