import sharp from 'sharp';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {requestReviewSeedream} from './seedream-review-transport.js';

// Only job-application outfits; student / government templates never reach this route.
export function isJobOutfitTemplate(value){
 return typeof value==='string'&&/^\/assets\/job-uniforms\/[a-z0-9-]+\.(?:png|webp)$/.test(value);
}

export function checkedOutfitPlacement(value,width,height){
 let p;
 try{p=typeof value==='string'?JSON.parse(value):value}catch{throw Object.assign(Error('ข้อมูลตำแหน่งชุดไม่ถูกต้อง'),{status:400})}
 if(!p||typeof p!=='object'||![p.uX,p.uY,p.uW,p.uH].every(Number.isFinite))throw Object.assign(Error('ข้อมูลตำแหน่งชุดไม่ถูกต้อง'),{status:400});
 const {uX,uY,uW,uH}=p;
 if(uW<=width*.48||uW>width*4||uH<=height*.3||uH>height*4||uX< -width*2||uX>width*.5||uY< -height*2||uY>height*.85)
  throw Object.assign(Error('ตำแหน่งและขนาดชุดไม่อยู่ในกรอบมาตรฐาน'),{status:400});
 return {uX,uY,uW,uH};
}

function checkedHeadFrame(value,width,height){
 let p;
 try{p=typeof value==='string'?JSON.parse(value):value}catch{throw Object.assign(Error('ข้อมูลตำแหน่งศีรษะไม่ถูกต้อง'),{status:400})}
 if(!p||![p.hX,p.hY,p.headW,p.headH,p.scale].every(Number.isFinite))
  throw Object.assign(Error('ข้อมูลตำแหน่งศีรษะไม่ถูกต้อง'),{status:400});
 const w=Math.round(p.headW*p.scale),h=Math.round(p.headH*p.scale);
 const left=Math.round(p.hX),top=Math.round(p.hY);
 if(w<60||h<100||w>width*4||h>height*4||left<=-w||top<=-h||left>=width||top>=height)
  throw Object.assign(Error('สัดส่วนศีรษะไม่ถูกต้อง'),{status:400});
 if((p.chinY!=null&&!Number.isFinite(p.chinY))||(p.faceCX!=null&&!Number.isFinite(p.faceCX)))
  throw Object.assign(Error('จุดอ้างอิงใบหน้าไม่ถูกต้อง'),{status:400});
 return {w,h,left,top,scale:p.scale,chinY:p.chinY??null,faceCX:p.faceCX??null};
}

const OUTFIT_PROMPT=[
 'Create ONE photorealistic 3:4 professional job-application portrait. This is a SECOND STEP after the head and haircut are already finished.',
 'IMAGE 1: the exact full-frame ID photo and precise approved garment placement. IMAGE 2: the specific selected job outfit, use its shirt, jacket, collar, color and design. IMAGE 3: the same person\'s FINISHED TRANSPARENT HEAD, HAIR AND NECK, the ONLY identity and hairstyle authority.',
 'Dress the person in Image 3 in the exact chosen outfit from Image 2, naturally rebuilding the real fabric, lapels, collar, sleeves, shadows and torso as one realistic garment. The full shoulders, upper arms, chest and waist should be visible inside the SAME frame and scale as IMAGE 1.',
 'CRITICAL CHEST COVERAGE: The head reference may show a temporary shallow-U bare neck base used only for compositing. This is NOT part of the final outfit. Never show a large bare chest, clavicle bib, square nude shoulder patch, or scoop neckline unless the SELECTED outfit genuinely has one. The selected shirt and jacket must cover the torso and sit closely and naturally around the neck, with correct shirt collar opening. No skin patch can overlap the suit lapels.',
 'POSITION AND BODY LOCK: identical head size, eye/chin coordinates, shoulder width, shoulder height, outer sleeves, arm width, waist position, torso bottom crop and camera perspective as Image 1. Never zoom out or in, enlarge or shrink head/body, move shoulders, make a wider/narrower jacket, shorten arms, or crop the sleeves or waist differently.',
 'FACE / HAIR IDENTITY LOCK: absolutely preserve the person in Image 3, including face proportions, eyes, eye shape, mouth, nose, expression, hairline, hair length, ears, neck skin and all natural asymmetries. Do NOT redraw or beautify the face. Do not add accessories, jewelry, pins, tie if not in the selected outfit, logos, decorations, or badges.',
 'The result is an evenly lit professional portrait with the ENTIRE PERSON AND OUTFIT together. Use a clean plain backdrop for easy background removal. No borders, no text, no frame, no extra people. Do not output an isolated outfit without a person.'
].join('\n');

function verifySilhouette(candidate,reference,referenceInfo,placement,width,height){
 // Compare the AI's ACTUAL full-body silhouette against the chosen outfit at
 // three lower-torso elevations. This only rejects gross drift; does not paste
 // the old template alpha back on the garment.
 const rows=[.61,.76,.91].map(n=>Math.round(n*height));
 let compared=0;
 for(const y of rows){
  let expL=width,expR=-1,gotL=width,gotR=-1;
  const ry=Math.floor((y-placement.uY)*referenceInfo.height/placement.uH);
  if(ry<0||ry>=referenceInfo.height)continue;
  for(let x=0;x<width;x+=3){
   const rx=Math.floor((x-placement.uX)*referenceInfo.width/placement.uW);
   if(rx>=0&&rx<referenceInfo.width&&reference[(ry*referenceInfo.width+rx)*4+3]>105){expL=Math.min(expL,x);expR=Math.max(expR,x)}
   if(candidate[(y*width+x)*4+3]>105){gotL=Math.min(gotL,x);gotR=Math.max(gotR,x)}
  }
  if(expR-expL<width*.25)continue;
  compared++;
  if(gotR<gotL||Math.abs(gotL-expL)>width*.16||Math.abs(gotR-expR)>width*.16)
   throw Error('ขนาดไหล่ แขน หรือช่วงเอวจาก AI คลาดเคลื่อนเกินที่กำหนด');
 }
 if(compared<2)throw Error('ตรวจสอบสัดส่วนชุด AI ไม่สำเร็จ');
 // Transparent at the upper corners, opaque in the lower-torso silhouette.
 const corners=[[2,2],[width-3,2],[2,Math.round(height*.3)],[width-3,Math.round(height*.3)]];
 if(corners.some(([x,y])=>candidate[(y*width+x)*4+3]>100))
  throw Error('AI ส่งภาพที่ยังมีพื้นหลัง');
}


/**
 * Protect the original finished FACE/HAIR, not its temporary bare clavicle
 * cutout. Previous implementation overlaid the ENTIRE transparent head asset
 * on top of AI's outfit and produced the large U-shaped bare-skin bib.
 * 
 * Fade natural neck pixels shortly below the chin, and retain genuine dark
 * side-hair strands outside the central neck corridor. The generated outfit
 * remains responsible for collars, shoulders, torso and waist.
 */
export async function protectedJobHead(head,frame,width,height){
 const {data,info}=await sharp(head).resize(frame.w,frame.h,{fit:'fill'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(info.channels!==4)throw Error('ภาพหัวมีช่องสีไม่ถูกต้อง');
 const chinY=frame.chinY!=null?frame.top+frame.chinY*frame.scale:height*.50;
 const centerX=frame.faceCX!=null?frame.left+frame.faceCX*frame.scale:width*.50;
 // A face-only protection mask. Never restore original clothes, skin bib,
 // shoulder areas or dark lapels mistakenly classified as long hair.
 // The outfit AI owns the neck BELOW this contour and the entire garment.
 const halfFace=Math.max(width*.115,Math.min(width*.20,frame.w*.16));
 const transition=Math.max(5,Math.round(height*.012));
 for(let y=0;y<info.height;y++){
  const gy=frame.top+y;
  for(let x=0;x<info.width;x++){
   const i=(y*info.width+x)*4;
   if(!data[i+3])continue;
   const gx=frame.left+x;
   const lateral=Math.abs(gx-centerX)/halfFace;
   // Move the cutoff upwards at cheek sides and keep the real chin at centre.
   const lowerEdge=chinY-height*.042*Math.min(1,lateral*lateral);
   const keep=Math.max(0,Math.min(1,(lowerEdge-gy)/transition));
   data[i+3]=Math.round(data[i+3]*keep);
  }
 }
 return sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
}

async function preserveOriginalHead(body,protectedHead,frame,width,height){
 const image=protectedHead;
 const x0=Math.max(0,frame.left),y0=Math.max(0,frame.top);
 const sx=x0-frame.left,sy=y0-frame.top;
 const cropW=Math.min(frame.w-sx,width-x0),cropH=Math.min(frame.h-sy,height-y0);
 if(cropW<1||cropH<1)throw Error('ตำแหน่งศีรษะเกินกรอบภาพ');
 const clipped=await sharp(image).extract({left:sx,top:sy,width:cropW,height:cropH}).png().toBuffer();
 // The original processed head is composited pixel-for-pixel over AI's body:
 // no AI face changes can survive in the visible final PNG.
 return sharp(body).composite([{input:clipped,left:x0,top:y0}]).png().toBuffer();
}

/**
 * Generates a whole dressed portrait, not a replacement texture constrained
 * to the template alpha. Background is removed locally; original finished
 * head is composited over the result to enforce exact facial identity.
 */
export async function generateJobOutfit({root,templatePath,image,head,placement,headFrame,key,removeBackground}){
 if(!isJobOutfitTemplate(templatePath))throw Object.assign(Error('รองรับ AI ชุดสมัครงานเท่านั้น'),{status:400});
 if(!Buffer.isBuffer(image)||!image.length||!Buffer.isBuffer(head)||!head.length)
  throw Object.assign(Error('ไม่มีภาพหัวที่ประมวลผลสำเร็จ'),{status:400});
 const metadata=await sharp(image).metadata();
 const width=metadata.width,height=metadata.height;
 if(!width||!height||width<450||width>2500||height<600||height>3500||Math.abs(width/height-.75)>.025)
  throw Object.assign(Error('ภาพสำหรับใส่ชุดต้องมีสัดส่วน 3:4'),{status:400});
 const coords=checkedOutfitPlacement(placement,width,height);
 const frame=checkedHeadFrame(headFrame,width,height);
 const headMeta=await sharp(head).metadata();
 if(headMeta.width<64||headMeta.height<64||headMeta.width>4096||headMeta.height>4096)
  throw Object.assign(Error('ภาพหัวไม่ถูกต้อง'),{status:400});
 const template=await readFile(path.join(root,'public',templatePath.slice(1)));
 const {data:refPixels,info:refInfo}=await sharp(template).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(refInfo.width<32||refInfo.height<32||refInfo.width*refInfo.height>16_000_000)
  throw Object.assign(Error('ขนาดต้นแบบชุดไม่ถูกต้อง'),{status:400});
 const reference=await sharp(template).flatten({background:'#ffffff'}).png().toBuffer();
 const faceOnly=await protectedJobHead(head,frame,width,height);
 const generated=await requestReviewSeedream({
  key,prompt:OUTFIT_PROMPT,size:'2K',portrait:image,portraitMime:'image/png',
  hair:reference,identity:faceOnly
 });
 // Keep 3:4 camera coordinates without changing aspect ratio.
 const framed=await sharp(generated.png).resize(width,height,{fit:'cover',position:'centre'}).png().toBuffer();
 const cutout=await removeBackground(framed);
 const {data:pixels,info}=await sharp(cutout).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(info.width!==width||info.height!==height||info.channels!==4)
  throw Error('ภาพชุดโปร่งใสมีขนาดไม่ถูกต้อง');
 verifySilhouette(pixels,refPixels,refInfo,coords,width,height);
 const rgba=await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer();
 const png=await preserveOriginalHead(rgba,faceOnly,frame,width,height);
 return {png,provider:'seedream-job-outfit-transparent-v2',requestId:generated.requestId};
}
