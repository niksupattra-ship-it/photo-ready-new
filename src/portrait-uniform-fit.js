// Geometry only: never resample or reshape the face, garment or insignia.
export const UNIFORM_FIT_VERSION='garment-relative-v1';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)]};
export function measureUniformAnchors(pixels,w,h){
 if(pixels.length!==w*h*4||w<2||h<2)throw Error('ข้อมูลแพทเทิร์นชุดไม่ถูกต้อง');
 let l=w,r=-1,t=h,b=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(pixels[(y*w+x)*4+3]>96){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y)}
 if(r<=l||b<=t)throw Error('ไม่พบพื้นที่ชุดสำหรับจัดสัดส่วน');
 const bw=r-l+1,cx=(l+r)/2,rows=[];
 // Broad shoulder/chest rows suppress isolated collar tips, epaulettes and pins.
 for(let y=t;y<=Math.min(b,t+bw*.30);y+=Math.max(1,Math.floor(bw/160))){
  let a=w,z=-1,count=0;for(let x=l;x<=r;x++)if(pixels[(y*w+x)*4+3]>128){a=Math.min(a,x);z=Math.max(z,x);count++}
  if(z-a>=bw*.65&&count>=bw*.35)rows.push({span:z-a+1,cx:(a+z)/2});
 }
 const shoulderWidth=rows.length?median(rows.map(row=>row.span)):bw*.84;
 const centerX=rows.length?median(rows.map(row=>row.cx)):cx;
 const half=Math.max(1,Math.round(bw*.04)),x0=clamp(Math.round(centerX)-half,0,w-1),x1=clamp(Math.round(centerX)+half,0,w-1);
 let socketY=t,found=false;
 for(let y=t;y<=b;y++){let n=0;for(let x=x0;x<=x1;x++)if(pixels[(y*w+x)*4+3]>96)n++;if(n>=(x1-x0+1)*.20){socketY=y;found=true;break}}
 if(!found)throw Error('ไม่พบช่องคอของชุด');
 return {width:w,height:h,bounds:{l,r,t,b,w:bw,h:b-t+1},shoulderWidth,centerX,socketY};
}
export function planPortraitUniformFit({W,H,uniform,frame,face,opaqueTop=0,adjust={}}){
 const {width,height,cx,chinY,faceWidth,faceHeight,eyeWidth}=face;
 if(![W,H,width,height,faceWidth,faceHeight,eyeWidth,frame.w,frame.h].every(v=>Number.isFinite(v)&&v>0)||![cx,chinY,opaqueTop,frame.x,frame.y].every(Number.isFinite))throw Error('วัดจุดอ้างอิงหัวและชุดไม่สำเร็จ');
 const sx=frame.w/uniform.width,sy=frame.h/uniform.height;
 const shoulderSpan=uniform.shoulderWidth*sx,collarSocketY=frame.y+uniform.socketY*sy,collarCX=frame.x+uniform.centerX*sx;
 // Use the measured garment distance, not the upload size or hair volume.
 const targetFaceWidth=shoulderSpan*.37;
 const topMargin=H*.045;
 const scaleForCrown=(collarSocketY-topMargin)/Math.max(1,chinY-opaqueTop+faceHeight*.24);
 const scale=Math.min(targetFaceWidth/faceWidth,scaleForCrown)*(adjust.scale||1);
 if(!Number.isFinite(scale)||scale<=0)throw Error('ระยะภาพของชุดไม่พอสำหรับวางศีรษะ');
 const neckGap=clamp(faceHeight*scale*.24,H*.025,H*.095);
 const chinTargetY=collarSocketY-neckGap;
 return {scale,hX:collarCX-cx*scale+(adjust.x||0)*W,hY:chinTargetY-chinY*scale+(adjust.y||0)*H,shoulderSpan,collarSocketY,collarCX,chinTargetY,placedFaceW:faceWidth*scale,fitVersion:UNIFORM_FIT_VERSION};
}
