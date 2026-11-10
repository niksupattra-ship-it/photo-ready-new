// Download framing permits moving the photo without first zooming in. Space
// outside the source keeps the existing background instead of blocking a drag.
export function downloadPhotoRect(width,height,size,crop){
 const ratio=size.width/size.height,zoom=Math.max(.5,Math.min(3,Number(crop.zoom)||1));
 const w=Math.min(width,height*ratio)/zoom,h=w/ratio;
 return {x:(Number.isFinite(crop.x)?crop.x:.5)*width-w/2,y:(Number.isFinite(crop.y)?crop.y:.5)*height-h/2,width:w,height:h};
}
const backgrounds=new WeakMap();
export function drawDownloadPhoto(ctx,image,rect,{x=0,y=0,width,height}){
 let background=backgrounds.get(image);
 if(!background){const c=document.createElement('canvas');c.width=c.height=1;const p=c.getContext('2d');p.drawImage(image,0,0,1,1,0,0,1,1);const rgba=p.getImageData(0,0,1,1).data;background=`rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3]/255})`;backgrounds.set(image,background)}
 ctx.fillStyle=background;ctx.fillRect(x,y,width,height);
 ctx.drawImage(image,rect.x,rect.y,rect.width,rect.height,x,y,width,height);
}
