// Measure native alpha pixels; transforms stay in metadata so faces and insignia are not stretched.
export const UNIFORM_FIT_VERSION='measured-neck-v3';
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
 const openings=[];
 for(let y=collarTopY+1;y<socketY;y++){
  const mid=Math.round(centerX);if(pixels[(y*w+mid)*4+3]>96)continue;
  let a=mid,z=mid;while(a>=l&&pixels[(y*w+a)*4+3]<=96)a--;while(z<=r&&pixels[(y*w+z)*4+3]<=96)z++;
  if(a>=l&&z<=r&&z-a>bw*.05&&z-a<bw*.45)openings.push(z-a-1);
 }
 const neckOpeningWidth=openings.length?median(openings.slice(0,Math.max(1,Math.ceil(openings.length/2)))):null;
 return {width:w,height:h,bounds:{l,r,t,b,w:bw,h:b-t+1},shoulderWidth,centerX,collarTopY,socketY,neckOpeningWidth};
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

export function measurePortraitNeck(pixels,w,h,{cx,chinY,faceWidth,faceHeight}){
 if(pixels.length!==w*h*4||![w,h,faceWidth,faceHeight].every(v=>Number.isFinite(v)&&v>0)||![cx,chinY].every(Number.isFinite))throw Error('ข้อมูลคอของภาพไม่ถูกต้อง');
 const mid=Math.round(cx),half=Math.max(1,Math.round(faceWidth*.04)),start=Math.max(0,Math.ceil(chinY)+1);
 if(mid-half<0||mid+half>=w||start>=h)throw Error('ไม่พบคอใต้คางในภาพ');
 const opaque=(x,y)=>pixels[(y*w+x)*4+3]>128;
 let baseY=start-1,gaps=0;const tolerated=Math.max(2,Math.round(faceHeight*.012));
 for(let y=start;y<h;y++){
  let n=0;for(let x=mid-half;x<=mid+half;x++)if(opaque(x,y))n++;
  if(n/(half*2+1)>=.7){baseY=y;gaps=0}else if(++gaps>tolerated)break;
 }
 const length=baseY-chinY;
 if(length<faceHeight*.06||length>faceHeight*.9)throw Error('วัดฐานคอไม่ชัดเจน กรุณาใช้ภาพที่เห็นคอและไม่มีเสื้อเดิมติดมา');
 const widths=[],centres=[];
 for(let y=start+Math.floor(length*.15);y<=start+Math.floor(length*.6);y+=Math.max(1,Math.floor(length/20))){
  if(!opaque(mid,y))continue;let a=mid,z=mid;while(a>0&&opaque(a-1,y))a--;while(z<w-1&&opaque(z+1,y))z++;
  const span=z-a+1;if(span>=faceWidth*.2&&span<=faceWidth*.95){widths.push(span);centres.push((a+z)/2)}
 }
 if(widths.length<2)throw Error('แยกขอบคอออกจากผมหรือเสื้อเดิมไม่ได้');
 return {baseY,width:median(widths),cx:median(centres),topY:chinY};
}

export function planPortraitUniformFit({W,H,uniform,face,opaqueTop=0,adjust={},headFrame=null,neck=null}){
 const {width,height,cx,chinY,faceWidth,faceHeight,eyeWidth}=face;
 if(![W,H,width,height,faceWidth,faceHeight,eyeWidth].every(v=>Number.isFinite(v)&&v>0)||![cx,chinY,opaqueTop].every(Number.isFinite))throw Error('วัดจุดอ้างอิงหัวและชุดไม่สำเร็จ');
 const scale=headFrame?headFrame.w/width:W*.29/faceWidth*(adjust.scale||1);
 if(!Number.isFinite(scale)||scale<=0||headFrame&&![headFrame.x,headFrame.y,headFrame.w,headFrame.h].every(Number.isFinite))throw Error('ตำแหน่งหัวไม่ถูกต้อง');
 const hX=headFrame?headFrame.x:W/2-cx*scale+(adjust.x||0)*W;
 const hY=headFrame?headFrame.y:H*.13-opaqueTop*scale+(adjust.y||0)*H;
 const chinTargetY=hY+chinY*scale,collarCX=hX+cx*scale;
 if(!neck||![neck.baseY,neck.width,neck.cx,uniform.neckOpeningWidth].every(v=>Number.isFinite(v)&&v>0))throw Error('ไม่พบขอบคอหรือช่องคอชุดที่ชัดเจน จึงยังจัดชุดอัตโนมัติไม่ได้');
 const garmentScale=neck.width*scale/uniform.neckOpeningWidth;
 const overlap=Math.max(1,H/1200*2),neckBaseY=hY+neck.baseY*scale;
 const uniformFrame={x:hX+neck.cx*scale-uniform.centerX*garmentScale,y:neckBaseY-overlap-uniform.socketY*garmentScale,w:uniform.width*garmentScale,h:uniform.height*garmentScale};
 const collarTopY=uniformFrame.y+uniform.collarTopY*garmentScale;
 if(collarTopY<chinTargetY+faceHeight*scale*.04)throw Error('ช่องคอชุดลึกเกินส่วนคอที่มีในภาพ กรุณาปรับคอก่อนเปลี่ยนชุด');
 if(uniformFrame.y+(uniform.bounds.b+1)*garmentScale<H-2)throw Error('ชุดสั้นเกินกรอบภาพเมื่อจัดคอพอดี กรุณาปรับระยะภาพก่อน');
 if(uniform.bounds.w*garmentScale>W*1.65)throw Error('ขนาดช่องคอชุดไม่สัมพันธ์กับภาพ กรุณาปรับระยะภาพก่อน');
 return {scale,hX,hY,uniformFrame,shoulderSpan:uniform.shoulderWidth*garmentScale,collarSocketY:uniformFrame.y+uniform.socketY*garmentScale,collarTopY,collarCX,chinTargetY,placedFaceW:faceWidth*scale,fitVersion:UNIFORM_FIT_VERSION};
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
