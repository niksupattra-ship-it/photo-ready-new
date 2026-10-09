import {gpuLiquify} from './studio-gpu-warp.js';
const collarSources=new WeakMap();
export function warpStudioCollar(uniform,amount=0,heightAmount=0,bounds){
 // V53: deterministic inverse-mapped collar warp.
 // Rebuild the collar ROI from the ORIGINAL template pixels instead of drawing shifted tiles
 // over the untouched collar. This removes the duplicated lower collar/neck edge.
 if(Math.abs(amount)<.001&&Math.abs(heightAmount)<.001)return uniform;
 const W=uniform.width||uniform.naturalWidth,H=uniform.height||uniform.naturalHeight;
 const out=document.createElement('canvas');out.width=W;out.height=H;
 const ox=out.getContext('2d');ox.imageSmoothingEnabled=true;ox.imageSmoothingQuality='high';ox.drawImage(uniform,0,0);

 // Keep exactly the same V52 collar ROI/strength geometry.
 const b=bounds||{x:0,y:0,w:W,h:H}, cx=b.x+b.w*.50, roiL=Math.floor(b.x+b.w*.285), roiR=Math.ceil(b.x+b.w*.715), roiT=Math.floor(b.y+b.h*.015), roiB=Math.ceil(b.y+b.h*.36);
 const rw=roiR-roiL, rh=roiB-roiT;
 if(gpuLiquify(out,roiL,roiT,rw,rh,cx,roiT,b.w,amount,heightAmount,'collar',b.h,{x:roiL,y:roiT,w:rw,h:rh}))return out;
 const key=[roiL,roiT,rw,rh].join(',');let saved=collarSources.get(uniform);
 if(!saved||saved.key!==key){const src=document.createElement('canvas');src.width=rw;src.height=rh;const sx=src.getContext('2d',{willReadFrequently:true});sx.drawImage(uniform,roiL,roiT,rw,rh,0,0,rw,rh);saved={key,source:sx.getImageData(0,0,rw,rh)};collarSources.set(uniform,saved)}
 const source=saved.source;
 const dest=new ImageData(rw,rh);
 const sd=source.data, dd=dest.data;
 const half=(roiR-roiL)/2;

 let rowFall=1;
 const displacement=(absX,absY)=>{
  const yFall=rowFall;
  const xn=(absX-cx)/half;
  const xFall=Math.pow(Math.max(0,1-Math.abs(xn)),1.8);
  return Math.sign(xn||1)*amount*b.w*.075*xFall*yFall;
 };
 // Height control shares the same inverse-mapped collar ROI as the width control.
 // The displacement fades to zero at every ROI edge so the untouched template joins
 // without a visible seam. Positive values shorten the collar vertically.
 const verticalDisplacement=(absX,absY)=>{
  const yn=Math.max(0,Math.min(1,(absY-roiT)/(roiB-roiT)));
  const xn=Math.max(0,Math.min(1,(absX-roiL)/(roiR-roiL)));
  const fall=Math.pow(Math.sin(Math.PI*yn),2)*Math.pow(Math.sin(Math.PI*xn),.8);
  return heightAmount*b.h*.065*fall;
 };
 const sample=(fx,fy,di)=>{
  fx=Math.max(0,Math.min(rw-1,fx)); fy=Math.max(0,Math.min(rh-1,fy));
  const x0=Math.floor(fx), y0=Math.floor(fy), x1=Math.min(rw-1,x0+1), y1=Math.min(rh-1,y0+1);
  const tx=fx-x0, ty=fy-y0;
  const i00=(y0*rw+x0)*4, i10=(y0*rw+x1)*4, i01=(y1*rw+x0)*4, i11=(y1*rw+x1)*4;
  for(let c=0;c<4;c++){
   const a=sd[i00+c]*(1-tx)+sd[i10+c]*tx;
   const b=sd[i01+c]*(1-tx)+sd[i11+c]*tx;
   dd[di+c]=Math.round(a*(1-ty)+b*ty);
  }
 };

 for(let yy=0;yy<rh;yy++){
  const absY=roiT+yy;rowFall=Math.pow(Math.max(0,1-yy/rh),1.35);
  for(let xx=0;xx<rw;xx++){
   const absX=roiL+xx;
   // Invert xDest = xSource + displacement(xSource,y). A few fixed-point iterations
   // are deterministic and prevent source pixels from remaining underneath moved pixels.
   let srcX=absX;
   for(let k=0;k<5;k++) srcX=absX-displacement(srcX,absY);
   let srcY=absY;
   for(let k=0;k<5;k++) srcY=absY-verticalDisplacement(srcX,srcY);
   sample(srcX-roiL,srcY-roiT,(yy*rw+xx)*4);
  }
 }

 // Replace the ROI once. Falloff reaches zero at its lower/side boundaries, so it joins
 // the untouched template continuously without accumulating or double-drawing pixels.
 ox.putImageData(dest,roiL,roiT);
 return out;
}


export function invalidateCollarSource(source){collarSources.delete(source)}
