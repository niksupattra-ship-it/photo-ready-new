// Production snapshot of the approved v9 layout. Lab-only changes must not alter this version.
import {createEnglishBodyLayout} from './english-body-layout.js';
import sharp from 'sharp';



export function femaleLabChinPlacement(layout){
 const context=layout.measuredCollar;
 if(!context||!Number.isFinite(context.chinY)||!Number.isFinite(context.upperCollarY)||!(context.shoulderWidth>0))throw Error('วัดขอบคอเสื้อไม่สำเร็จ กรุณาเลือกชุดอื่น');
 const scale=layout.shoulderSpan/context.shoulderWidth;
 const baseline=layout.collarTopY+(context.chinY-context.upperCollarY)*scale;
 return Math.max(baseline,Math.min(layout.neckSeatY??baseline,layout.collarTopY+layout.shoulderSpan*.075));
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
 const layout=await createFemaleGarmentLayout(outfit);
 const span=layout.shoulderSpan,cx=layout.centerX,chin=femaleLabChinPlacement(layout);
 const placed=await sharp(face).resize({width:Math.round(span*.35),height:Math.round(span*.465),fit:'inside'}).png().toBuffer(),size=await sharp(placed).metadata();
 const {data}=await sharp(face).ensureAlpha().raw().toBuffer({resolveWithObject:true});let r=0,g=0,b=0,n=0;
 for(let i=0;i<data.length;i+=4)if(data[i+3]>192&&data[i]>data[i+1]&&data[i+1]>data[i+2]){r+=data[i];g+=data[i+1];b+=data[i+2];n++;}
 const colour=n?`rgb(${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)})`:'#cba28c';
 const neck=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024"><path d="M ${cx-span*.10} ${chin-span*.03} L ${cx-span*.12} ${layout.collarTopY+span*.10} L ${cx-span*.22} ${layout.collarTopY+span*.22} L ${cx+span*.22} ${layout.collarTopY+span*.22} L ${cx+span*.12} ${layout.collarTopY+span*.10} L ${cx+span*.10} ${chin-span*.03} Z" fill="${colour}"/></svg>`);
 return sharp({create:{width:768,height:1024,channels:4,background:'#ffffff'}}).composite([{input:neck},{input:placed,left:Math.round(cx-size.width/2),top:Math.round(chin-size.height)},{input:layout.nativeForeground}]).png().toBuffer();
}

export async function createFemaleGarmentLayout(outfit){const layout=await createEnglishBodyLayout(outfit,{headScale:1,canvasWidth:768,fixedIdentityEnvelope:true,stableGarmentFrame:true,returnNativeForeground:true,collarContext:{template:''},profile:{headWidthToShoulder:.415,headHeightToShoulder:.56,chinToCollar:.045,neckToShoulder:.22,chestToShoulder:.40}});
 const {data,info}=await sharp(layout.nativeForeground).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 layout.neckSeatY=measureFemaleNeckSeat(data,info.width,info.height,layout);
 return layout;
}

// Measure the actual selected garment, not its filename or the bottom of its V.
// The garment stays fixed; only the entire face crop is translated in the guide.
export function measureFemaleNeckSeat(data,w,h,layout){
 const {centerX:cx,shoulderSpan:s,collarTopY:t}=layout;
 if(data.length!==w*h*4||![cx,s,t].every(Number.isFinite)||s<=0)return t;
 const alpha=(x,y)=>data[(y*w+x)*4+3];
 const start=Math.max(0,Math.ceil(t)),end=Math.min(h-1,Math.floor(t+s*.35));
 let shoulder=t,found=false;
 for(let y=start;y<=end;y++){
  let left=0,right=0;
  for(let x=Math.max(0,Math.ceil(cx-s*.43));x<=Math.min(w-1,Math.floor(cx-s*.20));x++)if(alpha(x,y)>160)left++;
  for(let x=Math.max(0,Math.ceil(cx+s*.20));x<=Math.min(w-1,Math.floor(cx+s*.43));x++)if(alpha(x,y)>160)right++;
  if(left>=s*.15&&right>=s*.15){shoulder=y;found=true;break;}
 }
 if(!found)return t;
 const desired=Math.min(t+s*.075,shoulder-s*.12);
 // Do not seat the chin inside opaque collar fabric. Check the central jaw
 // region, leaving the open chest below the neck to the garment itself.
 let clear=t;
 for(let y=start;y<=Math.min(end,Math.floor(desired));y++){
  let blocked=false;
  for(let x=Math.max(0,Math.ceil(cx-s*.065));x<=Math.min(w-1,Math.floor(cx+s*.065));x++)if(alpha(x,y)>96){blocked=true;break;}
  if(blocked)break;
  clear=y;
 }
 return Math.min(desired,clear);
}
