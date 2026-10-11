// Tighten the native matte only. Preserve the 50% contour and all RGB pixels.
// Partial coverage is allowed only within one pixel of that contour; never
// blur, erode, resize or infer face/ear/neck geometry from landmarks.
export function crispPortraitAlpha(rgba,width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||rgba.length!==width*height*4)throw Error('ขนาดภาพเก็บขอบไม่ถูกต้อง');
 const inside=new Uint8Array(width*height);
 for(let i=0;i<inside.length;i++)inside[i]=rgba[i*4+3]>=128?1:0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,k=i*4+3,a=rgba[k];
  if(a===0||a===255)continue;
  let boundary=false;
  for(let dy=-1;dy<=1&&!boundary;dy++)for(let dx=-1;dx<=1;dx++){
   const xx=x+dx,yy=y+dy;
   if(xx>=0&&xx<width&&yy>=0&&yy<height&&inside[yy*width+xx]!==inside[i]){boundary=true;break;}
  }
  rgba[k]=boundary?a:(inside[i]?255:0);
 }
 return rgba;
}
