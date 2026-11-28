import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {createFemaleGarmentLayout,createFemaleLabBase,femaleLabChinPlacement,guardCollarRegistration} from './female-portrait-layout.js';
import {prepareFemaleFace} from './female-preplaced-face.js';
import {seedreamProPayload} from './seedream-pro-payload.js';

// Lab only. Use the previously approved government template as the reference
// coordinate system; never change the production guide or either AI prompt.
const W=768,H=1024;
let referencePromise;
async function reference(){
 if(!referencePromise)referencePromise=(async()=>{
  const outfit=await readFile(new URL('./public/assets/government-uniforms/female-operational.png',import.meta.url));
  return {outfit,layout:await createFemaleGarmentLayout(outfit)};
 })().catch(e=>{referencePromise=null;throw e;});
 return referencePromise;
}
export async function fixedLabFacePlacement(face,layout){
 const span=layout.shoulderSpan,cx=layout.centerX;
 const placed=await sharp(face).resize({width:Math.round(span*.35),height:Math.round(span*.465),fit:'inside'}).png().toBuffer();
 const {width,height}=await sharp(placed).metadata();
 let chin=femaleLabChinPlacement(layout);
 const from=femaleLabChinPlacement({...layout,innerCollarSeatY:null});
 if(chin>from)chin=guardCollarRegistration({garmentAlpha:await sharp(layout.nativeForeground).extractChannel(3).raw().toBuffer(),faceAlpha:await sharp(placed).extractChannel(3).raw().toBuffer(),faceWidth:width,faceHeight:height,w:W,h:H,cx,from,to:chin});
 return {placed,width,height,left:Math.round(cx-width/2),top:Math.round(chin-height),chin,cx,span};
}
async function transformGarment(layout,target,face){
 const scale=target.span/layout.shoulderSpan;
 if(!Number.isFinite(scale)||scale<.5||scale>2)throw Error('Invalid garment scale');
 const resized=await sharp(layout.nativeForeground).resize({width:Math.round(W*scale)}).png().toBuffer();
 const {width,height}=await sharp(resized).metadata();
 const x=Math.round(target.cx-layout.centerX*scale);
 let y=Math.round(target.chin-femaleLabChinPlacement(layout)*scale);
 const alpha=await sharp(resized).ensureAlpha().extractChannel(3).raw().toBuffer();
 const faceAlpha=await sharp(face.placed).extractChannel(3).raw().toBuffer();
 // Move only the garment down if its opaque collar would obscure the
 // original face crop. The actual face pixels and their coordinates stay fixed.
 const overlaps=offset=>{
  for(let fy=0;fy<face.height;fy++)for(let fx=0;fx<face.width;fx++){
   if(faceAlpha[fy*face.width+fx]===0)continue;
   const gx=face.left+fx-x,gy=face.top+fy-offset;
   if(gx>=0&&gx<width&&gy>=0&&gy<height&&alpha[gy*width+gx]>0)return true;
  }
  return false;
 };
 const limit=y+Math.ceil(target.span*.25);
 while(y<=limit&&overlaps(y))y++;
 if(y>limit)throw Error('Could not align collar without obscuring original face');
 const left=Math.max(0,-x),top=Math.max(0,-y),dx=Math.max(0,x),dy=Math.max(0,y);
 const iw=Math.min(width-left,W-dx),ih=Math.min(height-top,H-dy);
 if(iw<=0||ih<=0)throw Error('Invalid garment placement');
 const visible=await sharp(resized).extract({left,top,width:iw,height:ih}).png().toBuffer();
 return {visible,left:dx,top:dy,collar:layout.collarTopY*scale+y};
}
export async function createFixedFemaleLabBase(outfit,face){
 const canonical=await reference(),target=await fixedLabFacePlacement(face,canonical.layout);
 // Keep the approved reference garment byte-for-byte equivalent to V6.
 if(outfit.equals(canonical.outfit))return createFemaleLabBase(outfit,face);
 const garment=await transformGarment(await createFemaleGarmentLayout(outfit),target,target);
 const {cx,span,chin}=target;
 const {data}=await sharp(face).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let r=0,g=0,b=0,n=0;
 for(let i=0;i<data.length;i+=4)if(data[i+3]>192&&data[i]>data[i+1]&&data[i+1]>data[i+2]){r+=data[i];g+=data[i+1];b+=data[i+2];n++;}
 const colour=n?`rgb(${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)})`:'#cba28c';
 const collar=Math.max(chin,garment.collar);
 const neck=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024"><path d="M ${cx-span*.10} ${chin-span*.03} L ${cx-span*.12} ${collar+span*.10} L ${cx-span*.22} ${collar+span*.22} L ${cx+span*.22} ${collar+span*.22} L ${cx+span*.12} ${collar+span*.10} L ${cx+span*.10} ${chin-span*.03} Z" fill="${colour}"/></svg>`);
 return sharp({create:{width:W,height:H,channels:4,background:'#ffffff'}}).composite([{input:neck},{input:garment.visible,left:garment.left,top:garment.top},{input:target.placed,left:target.left,top:target.top}]).png().toBuffer();
}
export async function fixedFemaleLabPayload({prompt,order,files,fields}){
 if(order!=='person-outfit-hair')throw Error('Invalid reference order');
 const person=files?.person?.[0]?.buffer,outfit=files?.outfit?.[0]?.buffer,hair=files?.hair?.[0]?.buffer;
 if(!person?.length||!outfit?.length||!hair?.length)throw Error('Missing references');
 const reference=async buffer=>{const meta=await sharp(buffer,{limitInputPixels:33554432}).metadata(),mime={png:'image/png',jpeg:'image/jpeg',webp:'image/webp'}[meta.format];if(!mime)throw Error('Unsupported reference');return 'data:'+mime+';base64,'+buffer.toString('base64');};
 const face=await prepareFemaleFace(person,fields?.femalePreplacedFace),guide=await createFixedFemaleLabBase(outfit,face);
 return seedreamProPayload(prompt,['data:image/png;base64,'+guide.toString('base64'),await reference(hair),await reference(outfit)]);
}
