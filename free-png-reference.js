import sharp from 'sharp';

// Trim only the lower loose tips of the known side-parted gathered PNG.
// The original file on disk is never modified; other hairstyles are unchanged.
export async function prepareFreePngReference(buffer, id){
 if(id!=='hair-21')return buffer;
 const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let top=info.height,bottom=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>32){top=Math.min(top,y);bottom=Math.max(bottom,y)}
 if(bottom<=top)throw Error('ไม่พบภาพทรงผมต้นแบบ');
 // Keep the complete crown and hairline. Fade just the bottom ~10% where
 // the reference has detached strands extending below the gathered sides.
 const start=top+(bottom-top)*0.88,end=top+(bottom-top)*0.93;
 for(let y=Math.floor(start);y<=bottom;y++){
  const factor=Math.max(0,Math.min(1,(end-y)/(end-start)));
  for(let x=0;x<info.width;x++){const a=(y*info.width+x)*4+3;data[a]=Math.round(data[a]*factor)}
 }
 return sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
}
