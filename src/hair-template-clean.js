// Strip template skin/ears/background BEFORE measuring or fitting its hair.
// Classification comes from the intact reference portrait, not the damaged
// cutout (several male PNGs contain stretched skin and opaque white pixels).
export function extractTemplateHair(cutout,hairMask,sourceToReference,makeCanvas){
 if(!hairMask||!Array.isArray(sourceToReference)||sourceToReference.length!==6||!sourceToReference.every(Number.isFinite))throw Error('ตรวจพื้นที่ผมในแบบไม่สำเร็จ · เก็บภาพเดิมไว้');
 const width=cutout.naturalWidth||cutout.width,height=cutout.naturalHeight||cutout.height;
 const out=makeCanvas(width,height),ctx=out.getContext('2d');ctx.drawImage(cutout,0,0);
 const pixels=ctx.getImageData(0,0,width,height),mw=hairMask.width,mh=hairMask.height;
 const mask=hairMask.getContext('2d').getImageData(0,0,mw,mh).data;
 const [a,b,c,d,e,f]=sourceToReference;let retained=0;
 const sample=(x,y)=>x<0||y<0||x>=mw||y>=mh?0:mask[(y*mw+x)*4+3];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const j=(y*width+x)*4;if(!pixels.data[j+3])continue;
  // Bilinear sampling at pixel centers gives a narrow, soft hair boundary
  // without resizing or repainting native strand RGB.
  const px=a*(x+.5)+c*(y+.5)+e-.5,py=b*(x+.5)+d*(y+.5)+f-.5;
  const ix=Math.floor(px),iy=Math.floor(py),dx=px-ix,dy=py-iy;
  const alpha=sample(ix,iy)*(1-dx)*(1-dy)+sample(ix+1,iy)*dx*(1-dy)+sample(ix,iy+1)*(1-dx)*dy+sample(ix+1,iy+1)*dx*dy;
  pixels.data[j+3]=Math.round(pixels.data[j+3]*alpha/255);
  if(pixels.data[j+3]>20)retained++;
 }
 if(retained<16)throw Error('ไม่พบพื้นที่ผมที่ตรงกับแบบ · เก็บภาพเดิมไว้');
 ctx.putImageData(pixels,0,0);return out;
}
