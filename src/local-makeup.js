// Local cosmetics alter existing RGB samples only. The native image geometry,
// alpha, and pixels outside the feathered facial regions are retained exactly.
export const LOCAL_MAKEUP_CONTOURS=Object.freeze({
 face:[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109],
 lips:[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146],
 mouth:[78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95],
 eyes:[[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],[263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249]],
 upperLids:[[33,246,161,160,159,158,157,173,133],[263,466,388,387,386,385,384,398,362]],
 brows:[[70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285]],
});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)};
const luma=(r,g,b)=>r*.2126+g*.7152+b*.0722;
const surface=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
const abortIfNeeded=signal=>{if(signal?.aborted)throw Object.assign(Error('ยกเลิกการแต่งเมคอัพแล้ว'),{name:'AbortError'})};
const pause=async signal=>{abortIfNeeded(signal);await new Promise(resolve=>setTimeout(resolve,0));abortIfNeeded(signal)};

// A separable box mean has bounded linear work, independent of brush radius.
async function boxMean(input,w,h,r,signal){
 const tmp=new Float32Array(input.length),out=new Float32Array(input.length),n=2*r+1;
 for(let y=0;y<h;y++){
  const row=y*w;let sum=0;for(let dx=-r;dx<=r;dx++)sum+=input[row+clamp(dx,0,w-1)];
  for(let x=0;x<w;x++){tmp[row+x]=sum/n;sum+=input[row+Math.min(w-1,x+r+1)]-input[row+Math.max(0,x-r)]}
  if(y&&y%96===0)await pause(signal);
 }
 for(let x=0;x<w;x++){
  let sum=0;for(let dy=-r;dy<=r;dy++)sum+=tmp[clamp(dy,0,h-1)*w+x];
  for(let y=0;y<h;y++){out[y*w+x]=sum/n;sum+=tmp[Math.min(h-1,y+r+1)*w+x]-tmp[Math.max(0,y-r)*w+x]}
  if(x&&x%96===0)await pause(signal);
 }
 return out;
}

// Self-guided luminance smoothing: strong edges retain their own samples,
// while only low-contrast skin variations receive the low-frequency estimate.
export async function guidedMakeupLuminance(input,w,h,r,signal){
 if(input.length!==w*h||!w||!h)throw Error('ขนาดพื้นที่ผิวไม่ถูกต้อง');
 r=Math.max(1,Math.min(12,Math.round(r)));
 const mean=await boxMean(input,w,h,r,signal),square=new Float32Array(input.length);
 for(let i=0;i<input.length;i++)square[i]=input[i]*input[i];
 const meanSquare=await boxMean(square,w,h,r,signal),a=new Float32Array(input.length),b=new Float32Array(input.length);
 for(let i=0;i<input.length;i++){const variance=Math.max(0,meanSquare[i]-mean[i]*mean[i]);a[i]=variance/(variance+90);b[i]=mean[i]*(1-a[i])}
 const meanA=await boxMean(a,w,h,r,signal),meanB=await boxMean(b,w,h,r,signal);
 const result=new Float32Array(input.length);
 for(let i=0;i<input.length;i++)result[i]=meanA[i]*input[i]+meanB[i];
 abortIfNeeded(signal);return result;
}

function geometry(face,W,H){
 const required=[...LOCAL_MAKEUP_CONTOURS.face,...LOCAL_MAKEUP_CONTOURS.lips,...LOCAL_MAKEUP_CONTOURS.mouth,...LOCAL_MAKEUP_CONTOURS.eyes.flat(),...LOCAL_MAKEUP_CONTOURS.brows.flat(),1,4,98,327];
 if(required.some(i=>!face?.[i]||!Number.isFinite(face[i].x)||!Number.isFinite(face[i].y)))throw Error('ตรวจตำแหน่งใบหน้าไม่ครบ กรุณาใช้รูปหน้าตรงที่ชัดเจน');
 const point=id=>({x:face[id].x*W,y:face[id].y*H});
 const left=point(33),right=point(263),d=Math.hypot(right.x-left.x,right.y-left.y);
 if(d<24)throw Error('ใบหน้าเล็กเกินไปสำหรับแต่งเมคอัพอย่างละเอียด');
 for(const [a,b]of [[33,133],[263,362],[61,291]]){const p=point(a),q=point(b);if(Math.hypot(p.x-q.x,p.y-q.y)<1)throw Error('ตรวจตำแหน่งตาหรือริมฝีปากไม่ชัดเจน เก็บรูปเดิมไว้')}
 const ux=(right.x-left.x)/d,uy=(right.y-left.y)/d;
 let vx=-uy,vy=ux;const chin=point(152),top=point(10);
 if((chin.x-top.x)*vx+(chin.y-top.y)*vy<0){vx=-vx;vy=-vy}
 const oval=LOCAL_MAKEUP_CONTOURS.face.map(point),padding=Math.ceil(d*.09+4);
 const x=Math.max(0,Math.floor(Math.min(...oval.map(p=>p.x)))-padding),y=Math.max(0,Math.floor(Math.min(...oval.map(p=>p.y)))-padding);
 const w=Math.min(W,Math.ceil(Math.max(...oval.map(p=>p.x)))+padding)-x,h=Math.min(H,Math.ceil(Math.max(...oval.map(p=>p.y)))+padding)-y;
 if(w<12||h<12)throw Error('ไม่พบพื้นที่ใบหน้าภายในรูป');
 return {point,d,ux,uy,vx,vy,x,y,w,h,angle:Math.atan2(uy,ux),cx:oval.reduce((sum,p)=>sum+p.x,0)/oval.length,cy:oval.reduce((sum,p)=>sum+p.y,0)/oval.length};
}

function maskTools(g){
 const {w,h,x:offsetX,y:offsetY,point}=g;
 const make=()=>{const canvas=surface(w,h),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.strokeStyle='#fff';return {canvas,ctx}};
 const polygon=(ctx,ids,inset=1)=>{
  ctx.beginPath();ids.forEach((id,i)=>{const p=point(id),x=g.cx+(p.x-g.cx)*inset-offsetX,y=g.cy+(p.y-g.cy)*inset-offsetY;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.closePath();ctx.fill();
 };
 const ellipse=(ctx,p,rx,ry)=>{ctx.beginPath();ctx.ellipse(p.x-offsetX,p.y-offsetY,rx,ry,g.angle,0,Math.PI*2);ctx.fill()};
 const feather=(canvas,r)=>{const out=make();out.ctx.filter=`blur(${r}px)`;out.ctx.drawImage(canvas,0,0);out.ctx.filter='none';return out.canvas};
 const pixels=canvas=>canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
 return {make,polygon,ellipse,feather,pixels};
}

function nativeMaskPixels(mask,g,W,H,expand=0){
 const {canvas,ctx}=maskTools(g).make();
 const draw=(dx,dy)=>ctx.drawImage(mask,0,0,mask.width,mask.height,-g.x+dx,-g.y+dy,W,H);
 draw(0,0);
 if(expand){for(const [x,y]of [[-1,0],[1,0],[0,-1],[0,1],[-.7,-.7],[-.7,.7],[.7,-.7],[.7,.7]])draw(x*expand,y*expand)}
 return ctx.getImageData(0,0,g.w,g.h).data;
}

function buildMasks(g,hairMask,skinMask,W,H){
 const t=maskTools(g),hard=t.make(),inset=t.make(),details=t.make(),eyeHoles=t.make(),lip=t.make(),mouth=t.make();
 t.polygon(hard.ctx,LOCAL_MAKEUP_CONTOURS.face);
 t.polygon(inset.ctx,LOCAL_MAKEUP_CONTOURS.face,.965);
 for(const ids of LOCAL_MAKEUP_CONTOURS.eyes){t.polygon(eyeHoles.ctx,ids);eyeHoles.ctx.lineWidth=Math.max(.8,g.d*.005);eyeHoles.ctx.stroke()}
 details.ctx.drawImage(eyeHoles.canvas,0,0);
 for(const ids of LOCAL_MAKEUP_CONTOURS.brows){t.polygon(details.ctx,ids);details.ctx.lineWidth=g.d*.012;details.ctx.stroke()}
 t.polygon(details.ctx,LOCAL_MAKEUP_CONTOURS.lips);details.ctx.lineWidth=g.d*.014;details.ctx.stroke();
 // The nose retains its sharp original texture, but receives the same gentle
 // illumination as adjacent skin. Only its nostril openings reject the tone.
 const toneDetails=t.make();toneDetails.ctx.drawImage(details.canvas,0,0);
 t.ellipse(details.ctx,g.point(1),g.d*.10,g.d*.075);
 for(const id of [98,327]){t.ellipse(details.ctx,g.point(id),g.d*.024,g.d*.016);t.ellipse(toneDetails.ctx,g.point(id),g.d*.024,g.d*.016)}
 t.polygon(lip.ctx,LOCAL_MAKEUP_CONTOURS.lips);
 t.polygon(mouth.ctx,LOCAL_MAKEUP_CONTOURS.mouth);mouth.ctx.lineWidth=Math.max(.6,g.d*.003);mouth.ctx.stroke();
 const hardPixels=t.pixels(hard.canvas),softPixels=t.pixels(t.feather(inset.canvas,Math.max(1,g.d*.018)));
 const detailHard=t.pixels(details.canvas),protectedPixels=t.pixels(t.feather(details.canvas,Math.max(.5,g.d*.004))),eyePixels=t.pixels(eyeHoles.canvas);
 const toneHard=t.pixels(toneDetails.canvas),toneSoft=t.pixels(t.feather(toneDetails.canvas,Math.max(.5,g.d*.004)));
 const lipHard=t.pixels(lip.canvas),lipSoft=t.pixels(t.feather(lip.canvas,Math.max(.45,g.d*.0035))),mouthPixels=t.pixels(mouth.canvas);
 const hp=nativeMaskPixels(hairMask,g,W,H,Math.max(1,Math.min(5,W/256))),sp=nativeMaskPixels(skinMask,g,W,H);
 const skin=new Float32Array(g.w*g.h),tone=new Float32Array(skin.length),support=new Float32Array(skin.length),lips=new Float32Array(skin.length),eyes=new Float32Array(skin.length),protectedDetails=new Float32Array(skin.length);
 for(let i=0;i<skin.length;i++){
  const j=i*4;
  support[i]=hardPixels[j+3]/255*(1-smooth(1,36,hp[j+3]));
  eyes[i]=eyePixels[j+3]/255;
  protectedDetails[i]=detailHard[j+3]/255;
  skin[i]=support[i]*(softPixels[j+3]/255)*(sp[j+3]/255)*(1-protectedPixels[j+3]/255)*(1-protectedDetails[i]);
  tone[i]=support[i]*(softPixels[j+3]/255)*(sp[j+3]/255)*(1-toneHard[j+3]/255)*(1-toneSoft[j+3]/255);
  lips[i]=support[i]*(lipHard[j+3]/255)*(lipSoft[j+3]/255)*(1-mouthPixels[j+3]/255);
 }
 return {skin,tone,support,lips,eyes,protectedDetails,skinPixels:sp};
}

function eyeEffects(g,masks){
 const t=maskTools(g),blush=t.make(),lashes=t.make();
 for(let side=0;side<2;side++){
  const ids=LOCAL_MAKEUP_CONTOURS.upperLids[side],points=ids.map(g.point);
  const start=points[0],end=points[points.length-1],width=Math.hypot(end.x-start.x,end.y-start.y),ax=(end.x-start.x)/width,ay=(end.y-start.y)/width;
  let nx=-ay,ny=ax;if(nx*g.vx+ny*g.vy>0){nx=-nx;ny=-ny}
  const center=points[4],p={x:center.x+nx*g.d*.028,y:center.y+ny*g.d*.028};
  blush.ctx.save();blush.ctx.translate(p.x-g.x,p.y-g.y);blush.ctx.rotate(Math.atan2(ay,ax));blush.ctx.scale(width*.48,g.d*.060);
  const gradient=blush.ctx.createRadialGradient(0,0,0,0,0,1);gradient.addColorStop(0,'rgba(255,255,255,.66)');gradient.addColorStop(.5,'rgba(255,255,255,.28)');gradient.addColorStop(1,'rgba(255,255,255,0)');blush.ctx.fillStyle=gradient;blush.ctx.fillRect(-1,-1,2,2);blush.ctx.restore();
  // Sparse individually tapered strokes follow the actual, possibly tilted lid.
  const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
  const total=lengths[lengths.length-1];
  for(let n=0;n<9;n++){
   const f=.12+n*.09,distance=total*f;let segment=1;while(segment<lengths.length-1&&lengths[segment]<distance)segment++;
   const a=points[segment-1],b=points[segment],part=(distance-lengths[segment-1])/Math.max(.01,lengths[segment]-lengths[segment-1]);
   const root={x:a.x+(b.x-a.x)*part,y:a.y+(b.y-a.y)*part},envelope=Math.sin(Math.PI*f),length=g.d*(.008+.006*envelope),outward=side===0?-1:1;
   const tip={x:root.x+nx*length+g.ux*outward*length*.25,y:root.y+ny*length+g.uy*outward*length*.25};
   for(let piece=0;piece<4;piece++){
    const s=piece/4,e=(piece+1)/4,curve=v=>({x:root.x+(tip.x-root.x)*v+g.ux*outward*length*.12*v*(1-v),y:root.y+(tip.y-root.y)*v+g.uy*outward*length*.12*v*(1-v)}),p=curve(s),q=curve(e);
    lashes.ctx.globalAlpha=.32*envelope*(1-s*.65);lashes.ctx.lineWidth=Math.max(.32,g.d*.003)*(1-s*.68);lashes.ctx.lineCap='round';lashes.ctx.beginPath();lashes.ctx.moveTo(p.x-g.x,p.y-g.y);lashes.ctx.lineTo(q.x-g.x,q.y-g.y);lashes.ctx.stroke();
   }
  }
 }
 const blushPixels=t.pixels(blush.canvas),lashPixels=t.pixels(lashes.canvas),blushMask=new Float32Array(g.w*g.h),lashMask=new Float32Array(blushMask.length);
 for(let i=0;i<blushMask.length;i++){
  const j=i*4,safe=masks.support[i]*(1-masks.eyes[i]);
  blushMask[i]=blushPixels[j+3]/255*safe*(1-masks.protectedDetails[i])*(masks.skinPixels[j+3]/255);
  lashMask[i]=lashPixels[j+3]/255*safe;
 }
 return {blushMask,lashMask};
}

export async function renderLocalMakeup({original,face,hairMask=null,skinMask=null,lookId='local-natural-pink-v1',signal,onProgress}){
 abortIfNeeded(signal);
 const W=original?.naturalWidth||original?.width,H=original?.naturalHeight||original?.height;
 if(!Number.isInteger(W)||!Number.isInteger(H)||W<1||H<1)throw Error('ขนาดรูปเมคอัพไม่ถูกต้อง');
 if(!hairMask||!skinMask)throw Error('ตรวจพื้นที่ผิวและขอบผมไม่สำเร็จ เก็บรูปเดิมไว้');
 const progress=n=>{abortIfNeeded(signal);onProgress?.(n)};
 const glow=lookId==='local-pink-glow-v1';
 const g=geometry(face,W,H);progress(12);await pause(signal);
 const out=surface(W,H),ctx=out.getContext('2d',{willReadFrequently:true});ctx.drawImage(original,0,0,W,H);
 const area=ctx.getImageData(g.x,g.y,g.w,g.h),source=new Uint8ClampedArray(area.data),pixels=area.data;
 const masks=buildMasks(g,hairMask,skinMask,W,H),effects=eyeEffects(g,masks);progress(30);await pause(signal);
 const luminance=new Float32Array(g.w*g.h);let sum=0,weight=0;
 for(let i=0;i<luminance.length;i++){
  const j=i*4,Y=luma(source[j],source[j+1],source[j+2]);luminance[i]=Y;
  const a=masks.skin[i]*(source[j+3]/255);if(Y>45&&Y<240){sum+=Y*a;weight+=a}
 }
 const softened=await guidedMakeupLuminance(luminance,g.w,g.h,Math.max(2,g.d*.018),signal);
 // Only the new glow preset reads local colour means for small red blemishes.
 let localColor=null;
 if(glow){localColor=[];for(let c=0;c<3;c++){const channel=new Float32Array(luminance.length);for(let i=0;i<channel.length;i++)channel[i]=source[i*4+c];localColor.push(await boxMean(channel,g.w,g.h,Math.max(2,Math.min(12,Math.round(g.d*.025))),signal))}}
 const mean=weight?sum/weight:190,lift=glow?clamp(9+(215-mean)*.12,7,18):clamp(7+(210-mean)*.12,6,16);
 const cheekCenters=[g.point(50),g.point(280)],glowCenters=[g.point(117),g.point(346),g.point(151),g.point(4)];
 const field=(px,py,points,rx,ry)=>Math.max(...points.map(p=>{const dx=px-p.x,dy=py-p.y,u=(dx*g.ux+dy*g.uy)/(g.d*rx),v=(dx*g.vx+dy*g.vy)/(g.d*ry);return Math.exp(-2*(u*u+v*v))}));
 const left=g.point(61),right=g.point(291),lipWidth=Math.hypot(right.x-left.x,right.y-left.y),lx=(right.x-left.x)/lipWidth,ly=(right.y-left.y)/lipWidth;
 const lower=g.point(17),inner=g.point(14),gloss={x:inner.x*.55+lower.x*.45,y:inner.y*.55+lower.y*.45};
 progress(68);await pause(signal);
 for(let y=0;y<g.h;y++){
  for(let x=0;x<g.w;x++){
   const i=y*g.w+x,j=i*4;if(source[j+3]<240)continue;
   const Y=luminance[i],skin=masks.skin[i],tone=masks.tone[i];
   if(skin>.0001||tone>.0001){
    const detail=softened[i]-Y,edge=1-smooth(7,19,Math.abs(detail));
    const polish=clamp(detail,-8,8)*(glow?.62:.40)*edge*skin;
    const light=lift*clamp((248-Y)/95),rose=1;
    pixels[j]=source[j]+polish+tone*(light+rose);
    pixels[j+1]=source[j+1]+polish+tone*(light-rose*.18);
    pixels[j+2]=source[j+2]+polish+tone*(light+rose*.35);
   }
   if(glow&&skin>.0001){
    // Reject dark marks and strong edges; reduce only locally red, small variations.
    const red=source[j]-source[j+1],nearRed=localColor[0][i]-localColor[1][i];
    const blemish=smooth(7,23,red-nearRed)*(1-smooth(18,38,Math.abs(softened[i]-Y)))*skin*.62;
    for(let c=0;c<3;c++)pixels[j+c]+=clamp(localColor[c][i]-source[j+c],-20,20)*blemish;
    const px=g.x+x,py=g.y+y,shine=field(px,py,glowCenters,.13,.09)*tone*clamp((247-Y)/70);
    for(let c=0;c<3;c++)pixels[j+c]+=3.5*shine;
    const cheek=field(px,py,cheekCenters,.22,.13)*skin*.15,tint=[224,137,164],target=luma(...tint),current=luma(pixels[j],pixels[j+1],pixels[j+2]);
    for(let c=0;c<3;c++)pixels[j+c]+=cheek*((tint[c]-target)-(pixels[j+c]-current));
   }
   const lip=masks.lips[i];
   if(lip>.0001){
    // Shift chroma gently toward rose while keeping each original texture sample.
    const tint=glow?[220,119,153]:[209,118,139],targetY=luma(...tint),strength=(glow?.30:.22)*lip;
    for(let c=0;c<3;c++)pixels[j+c]=source[j+c]+strength*((tint[c]-targetY)-(source[j+c]-Y));
    const dx=g.x+x-gloss.x,dy=g.y+y-gloss.y,u=(dx*lx+dy*ly)/Math.max(1,lipWidth*.28),v=(-dx*ly+dy*lx)/Math.max(.8,g.d*.008);
    const satin=Math.exp(-2.8*(u*u+v*v))*lip*(glow?.17:.11);
    for(let c=0;c<3;c++)pixels[j+c]+=Math.min(10,(255-pixels[j+c])*satin);
   }
   const blush=effects.blushMask[i]*.16;
   if(blush>.0001){const tint=[200,135,153],target=luma(...tint),current=luma(pixels[j],pixels[j+1],pixels[j+2]);for(let c=0;c<3;c++)pixels[j+c]+=blush*((tint[c]-target)-(pixels[j+c]-current))}
   const lash=effects.lashMask[i];if(lash>.0001){const brown=[49,34,31];for(let c=0;c<3;c++)pixels[j+c]=pixels[j+c]*(1-lash)+brown[c]*lash}
  }
  if(y&&y%32===0){progress(68+Math.round(y/g.h*25));await pause(signal)}
 }
 abortIfNeeded(signal);ctx.putImageData(area,g.x,g.y);progress(96);await pause(signal);return out;
}
