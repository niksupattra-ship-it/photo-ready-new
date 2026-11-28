import sharp from 'sharp';
function coatAnchor(data,w,h){
 let bottom=-1;
 for(let y=0;y<h;y++){let count=0;for(let x=Math.floor(w*.25);x<Math.ceil(w*.75);x++)if(data[(y*w+x)*4+3]>=160)count++;if(count>=w*.15)bottom=y;}
 if(bottom<h*.5)throw Error('ยังวัดขอบล่างชุดไม่ได้ กรุณาสร้างภาพใหม่');
 const rows=[];
 for(let y=Math.max(0,Math.floor(bottom-h*.10));y<=bottom;y++){
  let left=w,right=-1;for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>=160){left=Math.min(left,x);right=x;}
  if(right-left>=w*.25)rows.push({left,right,width:right-left+1});
 }
 rows.sort((a,b)=>a.width-b.width);const row=rows[Math.floor(rows.length/2)];
 if(!row)throw Error('ยังวัดความกว้างชุดไม่ได้ กรุณาสร้างภาพใหม่');
 return {width:row.width,center:(row.left+row.right+1)/2,bottom:bottom+1};
}
export function planFemaleBodyGuide(source,target,w,h){
 const from=coatAnchor(source,w,h),to=coatAnchor(target,w,h),scale=to.width/from.width;
 if(scale<.5||scale>1.8)throw Error('สัดส่วนชุดจาก AI ต่างจากไกด์มากเกินไป กรุณาสร้างใหม่');
 return {scale,x:to.center-from.center*scale,y:h+2-from.bottom*scale,from,to};
}
// Keep the complete provider resolution on the existing 3:4 logical frame.
// Tiny test/source images stay tiny; this does not invent detail by upscaling.
export function femaleMasterSize(width,height){
 if(![width,height].every(n=>Number.isInteger(n)&&n>0))throw Error('Invalid portrait dimensions');
 const units=Math.ceil(Math.max(width/3,height/4));return {width:units*3,height:units*4};
}
export async function fitFemaleBodyToGuide(png,garmentGuide){
 const [src,target]=await Promise.all([png,garmentGuide].map(input=>sharp(input).resize(900,1200,{fit:'contain',background:'#00000000'}).ensureAlpha().raw().toBuffer()));
 const plan=planFemaleBodyGuide(src,target,900,1200);
 const original=await sharp(png).metadata(),size=femaleMasterSize(original.width,original.height);
 // Only the alpha/geometry proxy is 900x1200. Transform original-resolution RGB once.
 const native=await sharp(png).resize(size.width,size.height,{fit:'contain',background:'#00000000'}).ensureAlpha().raw().toBuffer();
 const scaled=await sharp(native,{raw:{...size,channels:4}}).affine([plan.scale,0,0,plan.scale],{background:'#00000000',interpolator:sharp.interpolators.bicubic}).png().toBuffer();
 const meta=await sharp(scaled).metadata(),x=Math.round(plan.x*size.width/900),y=Math.round(plan.y*size.height/1200),left=Math.max(0,-x),top=Math.max(0,-y),dx=Math.max(0,x),dy=Math.max(0,y),width=Math.min(meta.width-left,size.width-dx),height=Math.min(meta.height-top,size.height-dy);
 if(width<=0||height<=0)throw Error('จัดภาพกลับตำแหน่งไกด์ไม่ได้');
 const visible=await sharp(scaled).extract({left,top,width,height}).png().toBuffer();
 return sharp({create:{...size,channels:4,background:'#00000000'}}).composite([{input:visible,left:dx,top:dy}]).png().toBuffer();
}
