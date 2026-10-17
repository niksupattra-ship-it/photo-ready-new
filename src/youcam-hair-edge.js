// Local matte decontamination for generated female YouCam hair only.
// Pixels are straight-alpha RGBA. The raw provider image supplies the observed
// mixture; an already-refined cutout must never be unmixed a second time.
const OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const rgba=(p,n)=>(p instanceof Uint8Array||p instanceof Uint8ClampedArray)&&p.length===n*4;
const directions=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];

function validPlane(plane,n){
 if(!plane||plane.length!==n)return false;
 for(let i=0;i<n;i++)if(!Number.isFinite(plane[i])||plane[i]<0||plane[i]>1)return false;
 return true;
}

function polygon(mask,points,w,h){
 const top=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y))));
 const bottom=Math.min(h-1,Math.ceil(Math.max(...points.map(p=>p.y))));
 for(let y=top;y<=bottom;y++){
  const line=y+.5,xs=[];
  for(let i=0,j=points.length-1;i<points.length;j=i++){
   const a=points[j],b=points[i];
   if((a.y>line)!==(b.y>line))xs.push(a.x+(line-a.y)*(b.x-a.x)/(b.y-a.y));
  }
  xs.sort((a,b)=>a-b);
  for(let i=0;i+1<xs.length;i+=2){
   const left=Math.max(0,Math.ceil(xs[i]-.5)),right=Math.min(w-1,Math.floor(xs[i+1]-.5));
   if(right>=left)mask.fill(1,y*w+left,y*w+right+1);
  }
 }
}

function anatomy(face,w,h){
 if([...OVAL,33,263].some(i=>!Number.isFinite(face?.[i]?.x)||!Number.isFinite(face?.[i]?.y)))return null;
 const p=i=>({x:face[i].x*w,y:face[i].y*h}),left=p(33),right=p(263),d=Math.hypot(right.x-left.x,right.y-left.y);
 if(d<8)return null;
 const ux=(right.x-left.x)/d,uy=(right.y-left.y)/d,cx=(left.x+right.x)/2,cy=(left.y+right.y)/2;
 let vx=-uy,vy=ux;
 if((p(152).x-cx)*vx+(p(152).y-cy)*vy<0){vx=-vx;vy=-vy}
 const local=(x,y)=>({u:(x-cx)*ux+(y-cy)*uy,v:(x-cx)*vx+(y-cy)*vy});
 const ears=[127,356].map(i=>local(p(i).x,p(i).y)),chin=local(p(152).x,p(152).y);
 const protectedPixels=new Uint8Array(w*h);
 polygon(protectedPixels,OVAL.map(p),w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;if(protectedPixels[i])continue;
  const q=local(x+.5,y+.5);
  const ear=ears.some(e=>((q.u-e.u)/(d*.32))**2+((q.v-e.v-d*.28)/(d*.6))**2<=1);
  const neck=q.v>chin.v-d*.12&&Math.abs(q.u-chin.u)<d*.5;
  if(ear||neck)protectedPixels[i]=1;
 }
 return {d,protectedPixels};
}

function estimate(samples,source){
 let weight=0;const mean=[0,0,0];
 for(const sample of samples){const j=sample.index*4;weight+=sample.weight;for(let c=0;c<3;c++)mean[c]+=source[j+c]*sample.weight}
 for(let c=0;c<3;c++)mean[c]/=weight;
 let variance=0;
 for(const sample of samples){const j=sample.index*4;for(let c=0;c<3;c++)variance+=(source[j+c]-mean[c])**2*sample.weight}
 return {color:mean,spread:Math.sqrt(variance/(weight*3))};
}

/**
 * Recover hair colour from a locally supported opaque-provider matte.
 * Opaque pixels, face/ear/neck pixels and uncertain evidence remain exact.
 * A strongly supported overopaque matte can lose opacity without removing
 * the strand. No image is blurred, eroded, resized or mutated.
 */
export function refineYoucamFemaleHairEdges({cutout,source,width:w,height:h,hair,skin,face}={}){
 const n=w*h;
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||n>33554432||!rgba(cutout,n))throw Error('ขนาดภาพเก็บขอบผมไม่ถูกต้อง');
 const pixels=new Uint8ClampedArray(cutout);
 const report={fractionalPixels:0,candidates:0,refined:0,changedHairEdgePixels:0,alphaChanged:0,foregroundSeeds:0,backgroundSeeds:0,reason:'insufficient-evidence',rejectedReasons:{nativeAlpha:0,skinOrAnatomy:0,weakHair:0,missingForeground:0,missingBackground:0,variableForeground:0,variableBackground:0,lowContrast:0,photometricResidual:0,alphaMismatch:0,alreadyDecontaminated:0,outOfGamut:0,colorMismatch:0,alreadyClean:0}};
 if(!rgba(source,n)||!validPlane(hair,n)||!validPlane(skin,n)){report.reason='invalid-evidence';return {pixels,report}}
 const f=anatomy(face,w,h);
 if(!f){report.reason='invalid-face';return {pixels,report}}
 const core=new Uint8Array(n),background=new Uint8Array(n);
 for(let i=0;i<n;i++){
  const j=i*4;
  if(f.protectedPixels[i]||skin[i]>=.08)continue;
  if(cutout[j+3]>=248&&source[j+3]>=248&&hair[i]>.7&&skin[i]<.05){core[i]=1;report.foregroundSeeds++}
  if(cutout[j+3]<=8&&source[j+3]>=248&&hair[i]<.1&&skin[i]<.05){background[i]=1;report.backgroundSeeds++}
 }
 if(!report.foregroundSeeds||report.backgroundSeeds<2)return {pixels,report};
 const radius=clamp(Math.ceil(f.d*.30),16,96),radii=[1,2,3,4,6,8,12,16,24,32,48,64,96].filter(r=>r<=radius);
 if(radii.at(-1)!==radius)radii.push(radius);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,j=i*4;let a=cutout[j+3]/255;
  // A transparent provider does not reveal the former matte colour. Never
  // assume its transparent padding was white or use padding RGB as evidence.
  if(!a||cutout[j+3]>=248)continue;
  report.fractionalPixels++;
  if(source[j+3]<248){report.rejectedReasons.nativeAlpha++;continue}
  if(f.protectedPixels[i]||skin[i]>=.08){report.rejectedReasons.skinOrAnatomy++;continue}
  if(hair[i]<.035||hair[i]<=skin[i]*1.5+.015){report.rejectedReasons.weakHair++;continue}
  report.candidates++;
  const foregroundSamples=[],backgroundSamples=[];
  for(const [dx,dy] of directions){
   let foundF=false,foundB=false;
   for(const r of radii){
    const xx=x+dx*r,yy=y+dy*r;
    if(xx<0||xx>=w||yy<0||yy>=h)break;
    const k=yy*w+xx;
    if(!foundF&&core[k]){foregroundSamples.push({index:k,weight:1/r});foundF=true}
    if(!foundB&&background[k]){backgroundSamples.push({index:k,weight:1/r});foundB=true}
    if(foundF&&foundB)break;
   }
  }
  if(!foregroundSamples.length){report.rejectedReasons.missingForeground++;continue}
  if(backgroundSamples.length<2){report.rejectedReasons.missingBackground++;continue}
  const foreground=estimate(foregroundSamples,source),back=estimate(backgroundSamples,source);
  if(foreground.spread>24){report.rejectedReasons.variableForeground++;continue}
  if(back.spread>12){report.rejectedReasons.variableBackground++;continue}
  const F=foreground.color,B=back.color,C=[source[j],source[j+1],source[j+2]],direction=F.map((v,c)=>v-B[c]);
  if(Math.sqrt(F.reduce((sum,v,c)=>sum+(cutout[j+c]-v)**2,0)/3)<=3){report.rejectedReasons.alreadyClean++;continue}
  const norm=direction.reduce((sum,v)=>sum+v*v,0);
  if(norm<3*35*35){report.rejectedReasons.lowContrast++;continue}
  const fitted=clamp(C.reduce((sum,v,c)=>sum+(v-B[c])*direction[c],0)/norm);
  const residual=Math.sqrt(C.reduce((sum,v,c)=>sum+(v-B[c]-fitted*direction[c])**2,0)/3);
  if(residual>8){report.rejectedReasons.photometricResidual++;continue}
  if(Math.abs(fitted-a)>Math.max(.025,a*.20)){
   if(fitted>=a){report.rejectedReasons.alphaMismatch++;continue}
   // A large pre-existing correction toward foreground is evidence of an
   // already decontaminated gray/specular strand. Do not reinterpret it as
   // an overly opaque background mixture. The shared preliminary refiner's
   // bounded 24-level correction alone cannot trigger this 32-level guard.
   const priorCorrection=Math.sqrt(C.reduce((sum,v,c)=>sum+(v-cutout[j+c])**2,0)/3);
   const priorResidual=Math.sqrt(C.reduce((sum,v,c)=>sum+(v-a*cutout[j+c]-(1-a)*B[c])**2,0)/3);
   if(priorCorrection>2&&priorResidual<=2){report.rejectedReasons.alreadyDecontaminated++;continue}
   const removedMatte=C.reduce((sum,v,c)=>sum+(v-cutout[j+c])*(-direction[c]),0)/Math.sqrt(norm*3);
   if(removedMatte>32){report.rejectedReasons.alreadyDecontaminated++;continue}
   // Real cutouts can retain a much too opaque pale mixture. Use the raw
   // colour-line fit, never increase opacity, and retain nonzero fine support.
   a=Math.max(1/255,fitted);
  }
  const recovered=C.map((v,c)=>(v-(1-a)*B[c])/a);
  if(recovered.some(v=>v< -12||v>267)){report.rejectedReasons.outOfGamut++;continue}
  const agreement=Math.sqrt(recovered.reduce((sum,v,c)=>sum+(v-F[c])**2,0)/3);
  if(agreement>Math.min(32,12+foreground.spread*2)){report.rejectedReasons.colorMismatch++;continue}
  // The division is noisy at tiny alpha. A nearby, colour-consistent hair
  // core is the prior; support of that fine strand remains intact.
  const stable=clamp((a-.035)/.10),confidence=(1-(residual/8)**2)*(1-(back.spread/16)**2);
  let changed=false;
  for(let c=0;c<3;c++){
   const target=clamp(F[c]+(recovered[c]-F[c])*stable,0,255);
   const value=Math.round(cutout[j+c]+(target-cutout[j+c])*confidence);
   if(value!==cutout[j+c])changed=true;
   pixels[j+c]=value;
  }
  pixels[j+3]=Math.max(1,Math.min(cutout[j+3],Math.round(a*255)));
  if(pixels[j+3]!==cutout[j+3]){report.alphaChanged++;changed=true}
  if(changed){report.refined++;report.changedHairEdgePixels++}
 }
 report.reason=report.refined?'refined':'insufficient-evidence';
 return {pixels,report};
}
