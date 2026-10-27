import sharp from 'sharp';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {requestReviewSeedream} from './seedream-review-transport.js';

// Only job / interview attire is allowed. Students and government uniforms
// intentionally remain on their original deterministic template flow.
export function isJobOutfitTemplate(value){
 return typeof value==='string'&&/^\/assets\/job-uniforms\/[a-z0-9-]+\.(?:png|webp)$/.test(value);
}

export function checkedOutfitPlacement(value,width,height){
 let p;
 try{p=typeof value==='string'?JSON.parse(value):value}catch{throw Object.assign(Error('ข้อมูลตำแหน่งชุดไม่ถูกต้อง'),{status:400})}
 if(!p||typeof p!=='object'||![p.uX,p.uY,p.uW,p.uH].every(Number.isFinite))throw Object.assign(Error('ข้อมูลตำแหน่งชุดไม่ถูกต้อง'),{status:400});
 const {uX,uY,uW,uH}=p;
 // Permits the small, intentional edge bleed of the current compositor, but
 // rejects arbitrary placements and rescaling outside a portrait.
 if(uW<=width*.48||uW>width*4||uH<=height*.3||uH>height*4||uX< -width*2||uX>width*.5||uY< -height*2||uY>height*.85)
  throw Object.assign(Error('ตำแหน่งและขนาดชุดไม่อยู่ในกรอบมาตรฐาน'),{status:400});
 return {uX,uY,uW,uH};
}

const prompt=`IMAGE 1 is the already-assembled ID-photo portrait AFTER head, hair and face processing. IMAGE 2 is the customer's SELECTED JOB-APPLICATION OUTFIT reference, not a face reference.
TASK: Photorealistically CREATE A NEW COMPLETE PROFESSIONAL JOB-APPLICATION OUTFIT on Image 1, in the same clothing category as image 2 (formal blazer/suit or office shirt). Improve realistic fabric, stitching, folded cloth, natural lapels, natural sleeves and coherent studio lighting. Do not copy Image 2's background or invent a different uniform.
EXACT COMPOSITION / SILHOUETTE: Preserve the original image's shoulders, outer arm edges, sleeve width, upper torso silhouette, waist/bottom crop, overall size and X/Y position. The current outfit fills exactly the intended frame. DO NOT zoom, enlarge, narrow, move, crop, rotate, or change the shoulders, sleeves or torso. Keep the collar opening aligned to the unchanged neck. Do not elongate or constrict the neck.
HARD PROTECTION: Keep the finished head, hair, face, neck skin, identity, eye/nose/mouth geometry, expression, natural skin, and background ABSOLUTELY unchanged. Edit the OUTFIT only. Never add jewelry, pins, epaulettes, nametags, badges, student or government insignia, logos or texts. Do not create hands or arms outside the existing sleeve silhouette.
Make one coherent high-quality ID photograph; maintain Image 1's exact 3:4 canvas composition. Respond with the photo only, no borders or labels.`;

export async function generateJobOutfit({root,templatePath,image,placement,key}){
 if(!isJobOutfitTemplate(templatePath))throw Object.assign(Error('รองรับ AI ชุดสมัครงานเท่านั้น'),{status:400});
 if(!Buffer.isBuffer(image)||!image.length)throw Object.assign(Error('ไม่มีภาพที่ประมวลผลแล้ว'),{status:400});
 const original=await sharp(image).metadata();
 const width=original.width,height=original.height;
 if(!width||!height||width<450||width>2500||height<600||height>3500||Math.abs(width/height-.75)>.025)
  throw Object.assign(Error('ขนาดภาพสำหรับใส่ชุดต้องเป็นภาพแนวตั้ง 3:4'),{status:400});
 const coords=checkedOutfitPlacement(placement,width,height);
 // The filename is strictly allowlisted above, preventing path traversal.
 const template=await readFile(path.join(root,'public',templatePath.slice(1)));
 const {data:outfit,info}=await sharp(template).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(info.width<32||info.height<32||info.width*info.height>16_000_000)
  throw Object.assign(Error('ขนาดต้นแบบชุดไม่ถูกต้อง'),{status:400});
 const reference=await sharp(template).flatten({background:'#ffffff'}).png().toBuffer();
 const result=await requestReviewSeedream({key,prompt,size:'2K',portrait:image,portraitMime:'image/png',hair:reference});
 const {data:generated,info:generatedInfo}=await sharp(result.png).resize(width,height,{fit:'cover',position:'centre'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
 if(generatedInfo.channels!==3)throw Error('ผลภาพชุดมีช่องสีไม่ถูกต้อง');
 const pixels=Buffer.alloc(info.width*info.height*4,0);
 const stepX=coords.uW/info.width,stepY=coords.uH/info.height;
 let opaque=0,visible=0;
 for(let y=0;y<info.height;y++){
  const py=Math.floor(coords.uY+(y+.5)*stepY);
  for(let x=0;x<info.width;x++){
   const i=(y*info.width+x)*4,a=outfit[i+3];
   if(a<1)continue;
   opaque++;
   const px=Math.floor(coords.uX+(x+.5)*stepX);
   if(px<0||py<0||px>=width||py>=height)continue;
   const gi=(py*width+px)*3;
   pixels[i]=generated[gi];pixels[i+1]=generated[gi+1];pixels[i+2]=generated[gi+2];pixels[i+3]=a;
   visible++;
  }
 }
 if(!visible||visible<opaque*.15)throw Error('จัดตำแหน่งชุด AI ไม่สำเร็จ');
 // Crucially, original template ALPHA is retained pixel-for-pixel. The person
 // can edit the exact same native outfit layer size and position in Studio.
 const png=await sharp(pixels,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
 return {png,provider:'seedream-job-outfit',requestId:result.requestId};
}
