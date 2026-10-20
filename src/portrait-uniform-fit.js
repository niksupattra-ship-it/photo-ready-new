// Measure native alpha pixels; transforms stay in metadata so faces and insignia are not stretched.
export const UNIFORM_FIT_VERSION='fixed-uniform-head-fit-v3';
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
export function measureUniformAnchors(pixels,w,h){
 if(pixels.length!==w*h*4||w<2||h<2)throw Error('ข้อมูลแพทเทิร์นชุดไม่ถูกต้อง');
 let l=w,r=-1,t=h,b=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(pixels[(y*w+x)*4+3]>96){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y)}
 if(r<=l||b<=t)throw Error('ไม่พบพื้นที่ชุดสำหรับจัดสัดส่วน');
 const bw=r-l+1,cx=(l+r)/2,rows=[];
 for(let y=t;y<=Math.min(b,t+bw*.3);y+=Math.max(1,Math.floor(bw/160))){
  let a=w,z=-1,count=0;for(let x=l;x<=r;x++)if(pixels[(y*w+x)*4+3]>128){a=Math.min(a,x);z=Math.max(z,x);count++}
  if(z-a>=bw*.65&&count>=bw*.35)rows.push({span:z-a+1,cx:(a+z)/2});
 }
 const shoulderWidth=rows.length?median(rows.map(row=>row.span)):bw*.84;
 const centerX=rows.length?median(rows.map(row=>row.cx)):cx;
 const firstRow=(half,fraction)=>{const x0=Math.max(l,Math.floor(centerX-bw*half)),x1=Math.min(r,Math.ceil(centerX+bw*half));for(let y=t;y<=b;y++){let n=0;for(let x=x0;x<=x1;x++)if(pixels[(y*w+x)*4+3]>96)n++;if(n>=Math.max(2,(x1-x0+1)*fraction))return y}return t};
 // Top of the collar, not the bottom of the V opening or the tie knot.
 const collarTopY=firstRow(.22,.025),socketY=firstRow(.04,.20);
 return {width:w,height:h,bounds:{l,r,t,b,w:bw,h:b-t+1},shoulderWidth,centerX,collarTopY,socketY};
}
export function placeUniformForPortrait({W,H,uniform,collarX=W/2,collarY=H*.55,faceWidth=W*.29}){
 if(![W,H,uniform.width,uniform.height,uniform.shoulderWidth,uniform.bounds.w,faceWidth].every(v=>Number.isFinite(v)&&v>0)||![collarX,collarY,uniform.collarTopY].every(Number.isFinite))throw Error('วัดจุดอ้างอิงชุดไม่สำเร็จ');
 const length=uniform.bounds.b+1-uniform.collarTopY;
 if(length<=0||collarY>=H-20)throw Error('ระยะคอเสื้ออยู่นอกภาพ กรุณาจัดตำแหน่งหัวใหม่');
 // One native-pixel scale for BOTH axes. Cover the lower frame without reusing another PNG's aspect ratio.
 const scale=Math.max((W+4)/uniform.bounds.w,(faceWidth/.32)/uniform.shoulderWidth,(H+2-collarY)/length);
 if(uniform.bounds.w*scale>W*1.65)throw Error('ภาพชุดสั้นเกินไปสำหรับระยะนี้ กรุณาเลือกไฟล์ชุดเต็มช่วงตัว');
 return {x:collarX-uniform.centerX*scale,y:collarY-uniform.collarTopY*scale,w:uniform.width*scale,h:uniform.height*scale};
}
export function planPortraitUniformFit({W,H,uniform,face,opaqueTop=0,adjust={},frame=null}){
 const {width,height,cx,chinY,faceWidth,faceHeight,eyeWidth}=face;
 if(![W,H,width,height,faceWidth,faceHeight,eyeWidth].every(v=>Number.isFinite(v)&&v>0)||![cx,chinY,opaqueTop].every(Number.isFinite))throw Error('วัดจุดอ้างอิงหัวและชุดไม่สำเร็จ');
 // The garment is the fixed reference. Only the head receives a uniform scale and translation.
 const uniformFrame=frame?{...frame}:placeUniformForPortrait({W,H,uniform});
 if(![uniformFrame.x,uniformFrame.y,uniformFrame.w,uniformFrame.h].every(Number.isFinite)||uniformFrame.w<=0||uniformFrame.h<=0)throw Error('ตำแหน่งชุดไม่ถูกต้อง');
 const garmentScale=uniformFrame.w/uniform.width;
 const shoulderSpan=uniform.shoulderWidth*garmentScale;
 const collarCX=uniformFrame.x+uniform.centerX*garmentScale;
 const collarTopY=uniformFrame.y+uniform.collarTopY*uniformFrame.h/uniform.height;
 const collarSocketY=uniformFrame.y+uniform.socketY*uniformFrame.h/uniform.height;
 let scale=shoulderSpan*.32/faceWidth*(adjust.scale||1);
 const available=collarTopY-H*.045;
 const crownToCollar=chinY-opaqueTop+faceHeight*.16;
 if(crownToCollar>0&&available>0)scale=Math.min(scale,available/crownToCollar);
 if(!Number.isFinite(scale)||scale<=0)throw Error('จัดขนาดหัวให้เข้ากับชุดไม่สำเร็จ');
 const chinTargetY=collarTopY-faceHeight*scale*.16;
 const hX=collarCX-cx*scale+(adjust.x||0)*W;
 const hY=chinTargetY-chinY*scale+(adjust.y||0)*H;
 return {scale,hX,hY,uniformFrame,shoulderSpan,collarSocketY,collarTopY,collarCX,chinTargetY,placedFaceW:faceWidth*scale,fitVersion:UNIFORM_FIT_VERSION};
}
export function replaceUniformPlacement(layers,previousSuit,nextSuit){
 if(!previousSuit||!nextSuit)return layers;
 const before=previousSuit.collarFrame||previousSuit.sourceFrame,after=nextSuit.collarFrame||nextSuit.sourceFrame;
 return layers.map(layer=>{
  if(layer.id===previousSuit.id)return nextSuit;
  if(!before||!after||!['collar','chest','ribbon'].includes(layer.kind)||!layer.sourceFrame)return layer;
  const f=layer.sourceFrame,k=after.w/before.w,cx=after.x+((f.x+f.w/2-before.x)/before.w)*after.w,cy=after.y+((f.y+f.h/2-before.y)/before.h)*after.h;
  return {...layer,sourceFrame:{x:cx-f.w*k/2,y:cy-f.h*k/2,w:f.w*k,h:f.h*k},collarFrame:{...after},x:nextSuit.x||0,y:nextSuit.y||0,scale:nextSuit.scale||1,rotation:nextSuit.rotation||0,squeezeX:1,squeezeY:1};
 });
}
