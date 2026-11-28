import sharp from 'sharp';
import {femaleMasterSize} from './female-body-guide-fit.js';
import {preserveExactFemalePixels} from './female-exact-matting.js';
import {compositeFemaleLabBackground} from './female-lab-output.js';

// PR #279 framing shared by Thai female production and the labs: one uniform transform of the whole native-resolution person.
export function planGuideEditLabFrame(pixels,width,height){
 if(![width,height].every(n=>Number.isInteger(n)&&n>0)||pixels?.length!==width*height*4)return null;
 const rows=[],support=Math.max(3,Math.ceil(width*.003));let crown=-1,bottom=-1,run=0;
 for(let y=0;y<height;y++){
  let left=width,right=0,solidLeft=width,solidRight=0,count=0,central=0;
  for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>=160){left=Math.min(left,x);right=x+1;count++;if(x>=width*.25&&x<width*.75)central++;if(pixels[(y*width+x)*4+3]>=250){solidLeft=Math.min(solidLeft,x);solidRight=x+1;}}
  if(solidRight-solidLeft>=width*.12){left=solidLeft;right=solidRight;}
  rows.push({left,right,count,central});run=count>=support?run+1:0;
  if(crown<0&&run>=3)crown=y-2;
  if(central>=width*.12)bottom=y+1;
 }
 if(crown<0||bottom<height*.5||bottom-crown<height*.3)return null;
 const lower=rows.slice(Math.max(crown,Math.floor(bottom-height*.10)),bottom).filter(r=>r.central>=width*.12&&r.right-r.left>=width*.25);
 if(!lower.length)return null;
 const centres=lower.map(r=>(r.left+r.right)/2).sort((a,b)=>a-b),centre=centres[Math.floor(centres.length/2)];
 const headroom=height*.07;
 if(Math.abs(crown-headroom)<=.5&&bottom===height&&Math.abs(centre-width/2)<=.5&&rows.slice(-3).every(r=>r.left===0&&r.right===width))return {scale:1,x:0,y:0,crown,bottom,cutY:bottom,fullWidth:true};
 // Two output pixels of lower overscan avoid a translucent interpolation seam.
 const usable=height-headroom+2;
 // Find the least zoom that covers both sides at the actual visible bottom.
 // Search finite rows instead of repeatedly guessing a scale. Extra torso may
 // fall below the frame; the face/neck/garment ratios never change.
 const minimum=Math.ceil(crown+(bottom-crown)*.5);
 for(let y=bottom-1;y>=Math.max(minimum,2);y--){
  const band=rows.slice(y-2,y+1);if(band.some(r=>r.central<width*.12))continue;
  const leftEdge=Math.max(...band.map(r=>r.left)),rightEdge=Math.min(...band.map(r=>r.right));
  const left=leftEdge+(leftEdge>0?1:0),right=rightEdge-(rightEdge<width?1:0);
  const scale=usable/(y+1-crown),halfSpan=Math.min(centre-left,right-centre);
  if(halfSpan>0&&halfSpan*2*scale>=width)return {scale,x:width/2-centre*scale,y:headroom-crown*scale,crown,bottom,cutY:y+1,fullWidth:true};
 }
 // A very narrow/incomplete cutout keeps the whole head and a safe bottom fit.
 const scale=usable/(bottom-crown);
 return {scale,x:width/2-centre*scale,y:headroom-crown*scale,crown,bottom,cutY:bottom,fullWidth:false};
}

export async function frameGuideEditLabForeground(png){
 const original=await sharp(png).metadata(),size=femaleMasterSize(original.width,original.height);
 const native=await sharp(png).resize(size.width,size.height,{fit:'contain',background:'#00000000'}).ensureAlpha().raw().toBuffer();
 const plan=planGuideEditLabFrame(native,size.width,size.height);
 if(!plan)throw Error('ยังวัดขอบรูปไม่ได้ กรุณาใช้ภาพคนและชุดที่เห็นครบ');
 const scaled=await sharp(native,{raw:{...size,channels:4}}).affine([plan.scale,0,0,plan.scale],{background:'#00000000',interpolator:sharp.interpolators.bicubic}).png().toBuffer();
 const meta=await sharp(scaled).metadata(),x=Math.round(plan.x),y=Math.round(plan.y),left=Math.max(0,-x),top=Math.max(0,-y),dx=Math.max(0,x),dy=Math.max(0,y);
 const width=Math.min(meta.width-left,size.width-dx),height=Math.min(meta.height-top,size.height-dy);
 if(width<=0||height<=0)throw Error('จัดรูปเต็มกรอบไม่ได้');
 const visible=await sharp(scaled).extract({left,top,width,height}).png().toBuffer();
 return sharp({create:{...size,channels:4,background:'#00000000'}}).composite([{input:visible,left:dx,top:dy}]).png().toBuffer();
}

export async function prepareGuideEditForeground(original,removeBackground){
 const {png,alpha}=await preserveExactFemalePixels(original,await removeBackground(original));
 if(!alpha||alpha.min>=250||alpha.max<=5)throw Error('Background removal did not produce a valid portrait');
 return frameGuideEditLabForeground(png);
}

export async function completeGuideEditLabResult(original,removeBackground){return compositeFemaleLabBackground(await prepareGuideEditForeground(original,removeBackground));}
