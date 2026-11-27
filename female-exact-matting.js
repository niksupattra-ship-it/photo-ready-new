import sharp from 'sharp';
// Use the matting service only as an alpha mask; never use its resampled RGB.
export async function preserveExactFemalePixels(original,matted){
 const {data,info}=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const mask=await sharp(matted).ensureAlpha().extractChannel(3).resize(info.width,info.height,{fit:'fill'}).toColourspace('b-w').raw().toBuffer();
 if(mask.length!==info.width*info.height)throw Error('Invalid alpha mask dimensions');
 let min=255,max=0;for(let i=0;i<mask.length;i++){const a=mask[i];data[i*4+3]=a;min=Math.min(min,a);max=Math.max(max,a);}
 return {png:await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer(),alpha:{min,max}};
}
