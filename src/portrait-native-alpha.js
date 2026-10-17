// First-portrait alpha inspection and small, evidence-backed repairs only.
// This module never paints RGB, remattes a picture, or filters a whole edge.
const OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const isRgba=(p,n)=>(p instanceof Uint8Array||p instanceof Uint8ClampedArray)&&p.length===n*4;
function dimensions(pixels,width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>33554432||!isRgba(pixels,width*height))throw Error('ข้อมูลขอบภาพบุคคลไม่ถูกต้อง');
}

/** A transparent border or an isolated hole does not establish a portrait matte. */
export function inspectPortraitAlpha({pixels,width:w,height:h}={}){
 dimensions(pixels,w,h);
 const n=w*h,margin=Math.max(2,Math.min(8,Math.floor(Math.min(w,h)*.005)));
 let transparent=0,fractional=0,foreground=0,interiorTransparent=0,minX=w,minY=h,maxX=-1,maxY=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const a=pixels[(y*w+x)*4+3];
  if(a<=16){transparent++;if(x>=margin&&x<w-margin&&y>=margin&&y<h-margin)interiorTransparent++}
  else{foreground++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}
  if(a>0&&a<248)fractional++;
 }
 const bboxArea=foreground?(maxX-minX+1)*(maxY-minY+1):0,fill=bboxArea?foreground/bboxArea:0;
 const sw=Math.min(256,w),sh=Math.min(256,h),sn=sw*sh,alpha=new Uint8Array(sn),seen=new Uint8Array(sn),queue=new Uint32Array(sn);
 let head=0,tail=0,transparentSamples=0,edgeOutliers=0;
 for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){
  const sx=Math.min(w-1,Math.floor((x+.5)*w/sw)),sy=Math.min(h-1,Math.floor((y+.5)*h/sh)),i=y*sw+x;
  alpha[i]=pixels[(sy*w+sx)*4+3];if(alpha[i]<=16)transparentSamples++;
 }
 const push=i=>{if(!seen[i]&&alpha[i]<=16){seen[i]=1;queue[tail++]=i}};
 for(let x=0;x<sw;x++){push(x);push((sh-1)*sw+x)}
 for(let y=1;y<sh-1;y++){push(y*sw);push(y*sw+sw-1)}
 while(head<tail){const i=queue[head++],x=i%sw,y=Math.floor(i/sw);if(x)push(i-1);if(x+1<sw)push(i+1);if(y)push(i-sw);if(y+1<sh)push(i+sw)}
 // Diagnostic only: real tiny hair gaps can also be disconnected background.
 for(let y=1;y<sh-1;y++)for(let x=1;x<sw-1;x++){
  const i=y*sw+x,a=alpha[i];if(a<=16||a>=248)continue;
  const ns=[alpha[i-1],alpha[i+1],alpha[i-sw],alpha[i+sw]],lo=Math.min(...ns),hi=Math.max(...ns);
  if(hi-lo<=4&&(a<lo-64||a>hi+64))edgeOutliers++;
 }
 const connectedFraction=tail/sn,minimumBackground=Math.max(8,Math.ceil(n*.002)),minimumInterior=Math.max(4,Math.ceil(n*.0005));
 let reason='meaningful-cutout';
 if(!foreground)reason='empty-foreground';
 else if(!transparent)reason='no-transparent-background';
 else if(transparent<minimumBackground)reason='incidental-transparency';
 else if(interiorTransparent<minimumInterior)reason='thin-padding-only';
 else if(fill>=.995)reason='rectangular-padding-only';
 else if(tail<Math.max(4,Math.ceil(sn*.001)))reason='transparency-not-connected-to-background';
 const hasMeaningfulTransparency=reason==='meaningful-cutout';
 return {hasMeaningfulTransparency,needsMatting:!hasMeaningfulTransparency,reason,width:w,height:h,transparentPixels:transparent,fractionalPixels:fractional,foregroundPixels:foreground,interiorTransparentPixels:interiorTransparent,boundingBox:foreground?{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1}:null,boundingBoxFill:fill,analysisWidth:sw,analysisHeight:sh,edgeConnectedBackgroundFraction:connectedFraction,disconnectedTransparentSamples:transparentSamples-tail,isolatedAlphaOutlierSamples:edgeOutliers};
}

function plane(p,n){
 if(!p||p.length!==n)return false;
 for(let i=0;i<n;i++)if(!Number.isFinite(p[i])||p[i]<0||p[i]>1)return false;
 return true;
}
function anatomy(face,w,h){
 if([...OVAL,33,263].some(k=>!Number.isFinite(face?.[k]?.x)||!Number.isFinite(face?.[k]?.y)||face[k].x<0||face[k].x>1||face[k].y<0||face[k].y>1))return null;
 const point=k=>({x:face[k].x*w,y:face[k].y*h}),a=point(33),b=point(263),d=Math.hypot(b.x-a.x,b.y-a.y);
 if(d<8)return null;
 const ex=(b.x-a.x)/d,ey=(b.y-a.y)/d,cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,local=p=>({u:(p.x-cx)*ex+(p.y-cy)*ey,v:-(p.x-cx)*ey+(p.y-cy)*ex});
 const polygon=OVAL.map(point),ears=[127,356].map(k=>local(point(k))),chin=local(point(152));
 if(chin.v<d*.2)return null;
 const inside=(x,y)=>{let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)yes=!yes}return yes};
 return (x,y)=>{
  const q=local({x:x+.5,y:y+.5});
  if(ears.some(e=>((q.u-e.u)/(d*.4))**2+((q.v-e.v-d*.2)/(d*.8))**2<=1))return true;
  if(q.v>chin.v-d*.15&&Math.abs(q.u-chin.u)<d*.65)return true;
  return inside(x+.5,y+.5);
 };
}

/**
 * Fix isolated fractional-alpha defects with local support, never a whole edge.
 * Native normalized confidence planes are optional; missing/uncertain evidence
 * leaves the original array unchanged. Opaque pixels and RGB are always exact.
 */
export function refinePortraitAlpha({pixels,width:w,height:h,face=null,skin=null,hair=null}={}){
 dimensions(pixels,w,h);
 const n=w*h,report={reason:'unchanged',changedPixels:0,filledHairPinholes:0,softenedIsolatedSpikes:0,correctedRowSteps:0,rgbChanged:0,opaquePixelsChanged:0};
 const protectedAt=anatomy(face,w,h);
 if(!protectedAt||!plane(skin,n)||!plane(hair,n)){report.reason='insufficient-evidence';return {pixels,changed:false,report}}
 let out=null;
 const alpha=i=>pixels[i*4+3],same=(a,b,t=6)=>Math.abs(pixels[a*4]-pixels[b*4])<=t&&Math.abs(pixels[a*4+1]-pixels[b*4+1])<=t&&Math.abs(pixels[a*4+2]-pixels[b*4+2])<=t;
 const write=(i,value,kind)=>{value=clamp(Math.round(value),1,255);if(value===alpha(i))return;if(!out)out=new Uint8ClampedArray(pixels);out[i*4+3]=value;report.changedPixels++;report[kind]++};
 for(let y=3;y<h-3;y++)for(let x=3;x<w-3;x++){
  const i=y*w+x,a=alpha(i);if(a<32||a>=248||skin[i]>.02||protectedAt(x,y))continue;
  // A missing alpha sample in an otherwise opaque, same-colour hair core is
  // different from a genuine light background gap between separate strands.
  const around=[i-w-1,i-w,i-w+1,i-1,i+1,i+w-1,i+w,i+w+1];
  if(hair[i]>=.85&&around.every(k=>alpha(k)>=248&&hair[k]>=.75&&skin[k]<=.015&&same(i,k,8))){write(i,Math.min(...around.map(alpha)),'filledHairPinholes');continue}
  // Coherent hair, including a one-pixel strand, never enters smoothing paths.
  if(hair[i]>.015||skin[i]>.005)continue;
  const r=pixels[i*4],g=pixels[i*4+1],b=pixels[i*4+2];
  // Dark or coloured pixels may be a strand missed by the coarse model.
  if(Math.min(r,g,b)<160||Math.max(r,g,b)-Math.min(r,g,b)>32)continue;
  if(around.every(k=>alpha(k)>0&&alpha(k)<=32&&hair[k]<=.015&&skin[k]<=.005&&same(i,k))){
   const values=around.map(alpha),lo=Math.min(...values),hi=Math.max(...values);
   if(hi-lo<=4&&a>hi+64&&a<=hi+96){write(i,Math.max(lo,a-32),'softenedIsolatedSpikes');continue}
  }
  // Only a single-row impulse amid six nearly identical fractional samples
  // qualifies. This does not soften regular curves, hard edges or hair wisps.
  for(const [along,normal]of [[w,1],[1,w]]){
   const axis=[i-3*along,i-2*along,i-along,i+along,i+2*along,i+3*along];
   if(!axis.every(k=>alpha(k)>16&&alpha(k)<248&&hair[k]<=.015&&skin[k]<=.005&&same(i,k)))continue;
   const values=axis.map(alpha),lo=Math.min(...values),hi=Math.max(...values),target=Math.round(values.reduce((s,v)=>s+v,0)/values.length),delta=Math.abs(a-target);
   if(hi-lo>4||delta<=64||delta>96)continue;
   let polarity=0,valid=true;
   for(const k of [i,...axis]){
    const l=alpha(k-normal),r=alpha(k+normal),side=l>=248&&r<=8?1:r>=248&&l<=8?-1:0;
    if(!side||(polarity&&side!==polarity)){valid=false;break}polarity=side;
   }
   if(valid){write(i,a+clamp(target-a,-32,32),'correctedRowSteps');break}
  }
 }
 if(report.changedPixels)report.reason='isolated-alpha-defects-repaired';
 return {pixels:out||pixels,changed:Boolean(out),report};
}
