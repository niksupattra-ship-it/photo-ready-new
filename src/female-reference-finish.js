// First female portrait only: measured light -> fine skin -> one cosmetic finish.
// No geometry changes, face generation, alpha edits or whole-face pink wash.
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const ease=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const EYES=[[33,246,161,160,159,158,157,173,133],[362,398,384,385,386,387,388,466,263]];
const BROWS=[{top:[70,63,105,66,107],bottom:[46,53,52,65,55]}, {top:[336,296,334,293,300],bottom:[285,295,282,283,276]}];
const LIPS=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const LOWER=[[33,7,163,144,145,153,154,155,133],[362,382,381,380,374,373,390,249,263]];
const make=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
function context(input){
 const {pixels,width:w,height:h,face,skin,hair}=input||{};
 if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w*h>33554432||w<=0||h<=0||pixels?.length!==w*h*4||skin?.length!==w*h||hair?.length!==w*h)return null;
 const ids=[234,454,1,14,17,50,101,118,280,330,347,...EYES.flat(),...LOWER.flat(),...LIPS,...BROWS.flatMap(b=>[...b.top,...b.bottom])];
 if(ids.some(i=>!Number.isFinite(face?.[i]?.x)||!Number.isFinite(face?.[i]?.y)))return null;
 const point=i=>({x:face[i].x*w,y:face[i].y*h});
 const fw=Math.hypot(point(234).x-point(454).x,point(234).y-point(454).y);
 return fw>=64?{pixels,w,h,face,skin,hair,fw,point}:null;
}
function path(ctx,points){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath()}
function protection(c){
 const cv=make(c.w,c.h),ctx=cv.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.strokeStyle='white';ctx.lineJoin='round';ctx.lineWidth=Math.max(2,c.fw*.025);
 for(const ids of [...EYES.map((v,i)=>[...v,...LOWER[i].slice().reverse()]),LIPS,...BROWS.map(b=>[...b.top,...b.bottom.slice().reverse()])]){path(ctx,ids.map(c.point));ctx.fill();ctx.stroke()}
 // Protect nostrils and fine nose-tip detail from texture averaging.
 const nose=c.point(1);ctx.beginPath();ctx.ellipse(nose.x,nose.y,c.fw*.065,c.fw*.035,0,0,Math.PI*2);ctx.fill();
 return ctx.getImageData(0,0,c.w,c.h).data;
}
export function refineFemaleSkinTexture(input){
 const c=context(input);if(!c)return {pixels:input?.pixels,changed:false,status:'unmeasurable'};
 const {pixels,w,h,skin,hair,fw}=c,protectedPixels=protection(c),n=w*h,Y=new Float32Array(n),temp=new Float32Array(n),out=new Uint8ClampedArray(pixels);
 for(let i=0;i<n;i++)Y[i]=pixels[i*4]*.2126+pixels[i*4+1]*.7152+pixels[i*4+2]*.0722;
 // Small edge-aware low pass, retaining at least 55% of native microtexture.
 // Luminance-only residual means no whitened colour or synthetic pore pattern.
 const radius=Math.max(1,Math.min(4,Math.round(fw*.0045)));
 for(let i=0;i<n;i++){
  const x=i%w;let sum=0,weight=0;
  for(let d=-radius;d<=radius;d++){const xx=x+d;if(xx<0||xx>=w)continue;const q=i+d,diff=Y[q]-Y[i],v=Math.exp(-d*d/(radius*radius)-diff*diff/100);sum+=Y[q]*v;weight+=v}
  temp[i]=sum/weight;
 }
 let changed=false;
 for(let i=0;i<n;i++){
  const j=i*4;
  if(pixels[j+3]<250||!Number.isFinite(skin[i])||!Number.isFinite(hair[i])||protectedPixels[j+3])continue;
  const coverage=ease(.65,.98,skin[i])*(1-ease(.03,.18,hair[i]))*ease(32,80,Y[i])*(1-ease(225,250,Y[i]));if(!coverage)continue;
  const y=Math.floor(i/w);let sum=0,weight=0;
  for(let d=-radius;d<=radius;d++){const yy=y+d;if(yy<0||yy>=h)continue;const q=i+d*w,diff=Y[q]-Y[i],v=Math.exp(-d*d/(radius*radius)-diff*diff/100);sum+=temp[q]*v;weight+=v}
  const residual=sum/weight-Y[i];
  const delta=clamp(residual*.45,-4,4)*coverage;
  for(let k=0;k<3;k++){out[j+k]=clamp(pixels[j+k]+delta,0,255);if(out[j+k]!==pixels[j+k])changed=true}
 }
 return {pixels:out,changed,status:'measured'};
}
function stroke(ctx,a,b,width,color,bend=0){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo((a.x+b.x)/2+bend,(a.y+b.y)/2,b.x,b.y);ctx.lineWidth=width;ctx.strokeStyle=color;ctx.lineCap='round';ctx.stroke()}
export function applyFemaleReferenceMakeup(input){
 const c=context(input);if(!c)return {pixels:input?.pixels,changed:false,status:'unmeasurable'};
 const {pixels,w,h,skin,hair,fw,point}=c,layer=make(w,h),ctx=layer.getContext('2d',{willReadFrequently:true});
 // Broad sheer cheek colour only; no pink under-eye ring or neck tint.
 for(const ids of [[50,101,118],[280,330,347]]){
  const ps=ids.map(point),cx=ps.reduce((s,p)=>s+p.x,0)/3,cy=ps.reduce((s,p)=>s+p.y,0)/3;
  ctx.save();ctx.translate(cx,cy+fw*.018);ctx.scale(1,.65);const g=ctx.createRadialGradient(0,0,0,0,0,fw*.17);g.addColorStop(0,'rgba(208,91,121,.17)');g.addColorStop(.45,'rgba(211,107,135,.09)');g.addColorStop(1,'rgba(211,107,135,0)');ctx.fillStyle=g;ctx.fillRect(-fw*.17,-fw*.17,fw*.34,fw*.34);ctx.restore();
 }
 const blush=ctx.getImageData(0,0,w,h).data,out=new Uint8ClampedArray(pixels),protect=protection(c);
 for(let i=0;i<w*h;i++){
  const j=i*4,weight=blush[j+3]/255*ease(.6,.95,skin[i])*(1-ease(.03,.18,hair[i]))*(1-protect[j+3]/255);
  if(!Number.isFinite(weight)||pixels[j+3]<250)continue;
  for(let k=0;k<3;k++)out[j+k]=pixels[j+k]+(blush[j+k]-pixels[j+k])*weight;
 }
 ctx.clearRect(0,0,w,h);
 // Keep both original brow envelopes and anchors. Add airy brown hairs,
 // rather than erasing real eyebrows or stamping a new rectangular outline.
 for(const [browSide,brow] of BROWS.entries()){
  const top=brow.top.map(point),bottom=brow.bottom.map(point);ctx.save();path(ctx,[...top,...bottom.slice().reverse()]);ctx.clip();
  for(let s=0;s<4;s++){
   const a=top[s],b=top[s+1],d=bottom[s],e=bottom[s+1],count=Math.max(5,Math.round(Math.hypot(b.x-a.x,b.y-a.y)/(fw*.009)));
   for(let k=0;k<count;k++){
    const t=(k+.35)/count,tx=a.x+(b.x-a.x)*t,ty=a.y+(b.y-a.y)*t,bx=d.x+(e.x-d.x)*t,by=d.y+(e.y-d.y)*t;
    const inner=browSide===0?s===3:s===0;const len=.55+.18*Math.sin(k*2.4+s),dir=(b.x-a.x)>=0?1:-1;
    stroke(ctx,{x:bx,y:by},{x:bx+(tx-bx)*len+dir*fw*(inner?.002:.009),y:by+(ty-by)*(.75+.15*Math.sin(k*1.7))},Math.max(.45,fw*.0015),`rgba(85,65,58,${inner?.16:.24})`,fw*.001*Math.sin(k));
   }
  }ctx.restore();
 }
 for(let side=0;side<2;side++){
  const edge=EYES[side].map(point),span=Math.hypot(edge[8].x-edge[0].x,edge[8].y-edge[0].y);
  if(span<fw*.10||span>fw*.43)continue;
  // Very thin warm brown liner following the actual upper lid.
  ctx.beginPath();ctx.moveTo(edge[0].x,edge[0].y);for(const p of edge.slice(1))ctx.lineTo(p.x,p.y);ctx.strokeStyle='rgba(91,57,43,.62)';ctx.lineWidth=Math.max(.55,fw*.0021);ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
  const oi=side===0?0:8,outer=edge[oi],near=edge[side===0?1:7],dx=outer.x-near.x,dy=outer.y-near.y,norm=Math.hypot(dx,dy)||1;
  stroke(ctx,outer,{x:outer.x+dx/norm*span*.035,y:outer.y+dy/norm*span*.035},Math.max(.4,fw*.0012),'rgba(91,57,43,.42)');
  // Fine separated tapered lashes, fanning in the original eye direction.
  for(let k=0;k<15;k++){
   const u=(k+1)/16*8,seg=Math.min(7,Math.floor(u)),t=u-seg,a=edge[seg],b=edge[seg+1],root={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
   const len=span*(.055+.025*Math.sin(Math.PI*u/8))*(.9+.1*Math.sin(k*2.1)),fan=(u/8-.5)*.75;
   const mid={x:root.x+fan*len*.6,y:root.y-len*.65},tip={x:root.x+fan*len,y:root.y-len};
   stroke(ctx,root,mid,Math.max(.45,fw*.0014),'rgba(71,48,39,.55)');stroke(ctx,mid,tip,Math.max(.3,fw*.0007),'rgba(71,48,39,.32)');
  }
  // Subtle inner-corner pearl, no lower-lid colour or glitter band.
  const inner=edge[side===0?8:0],r=Math.max(.7,fw*.007),g=ctx.createRadialGradient(inner.x,inner.y,0,inner.x,inner.y,r);g.addColorStop(0,'rgba(244,226,210,.28)');g.addColorStop(1,'rgba(244,226,210,0)');ctx.fillStyle=g;ctx.fillRect(inner.x-r,inner.y-r,2*r,2*r);
 }
 // Small soft reflection within the lower lip; never a painted white stripe.
 ctx.save();path(ctx,LIPS.map(point));ctx.clip();
 const lower=point(17),innerLip=point(14),gx=lower.x*.6+innerLip.x*.4,gy=lower.y*.55+innerLip.y*.45;
 const gh=Math.max(.65,Math.hypot(lower.x-innerLip.x,lower.y-innerLip.y)*.24);
 ctx.translate(gx,gy);ctx.scale(1,gh/(fw*.055));
 const gloss=ctx.createRadialGradient(0,0,0,0,0,fw*.055);gloss.addColorStop(0,'rgba(255,232,230,.16)');gloss.addColorStop(1,'rgba(255,232,230,0)');ctx.fillStyle=gloss;ctx.fillRect(-fw*.055,-fw*.055,fw*.11,fw*.11);ctx.restore();
 const details=ctx.getImageData(0,0,w,h).data;let changed=false;
 for(let i=0;i<w*h;i++){
  const j=i*4;if(pixels[j+3]<250||!Number.isFinite(hair[i]))continue;
  const a=details[j+3]/255*(1-ease(.25,.65,hair[i]));
  for(let k=0;k<3;k++){out[j+k]=out[j+k]+(details[j+k]-out[j+k])*a;if(out[j+k]!==pixels[j+k])changed=true}
 }
 return {pixels:out,changed,status:'measured'};
}
