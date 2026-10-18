// Female first-portrait OUTPUT only. Establish a measured studio illuminant,
// rather than applying another fixed brighten/tint pass to every source.
// No coordinates, alpha, skin marks or image detail are reconstructed here.
const EYES=[[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],[263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249]];
const BROWS=[[70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285]];
const LIP=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const MOUTH=[78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95];
const LIDS=[{edge:[33,246,161,160,159,158,157,173,133],brow:52},{edge:[362,398,384,385,386,387,388,466,263],brow:282}];
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)};
const luma=(r,g,b)=>.2126*r+.7152*g+.0722*b;
const quantile=(a,q)=>a[Math.max(0,Math.min(a.length-1,Math.round((a.length-1)*q)))];
const med=a=>quantile(a.sort((x,y)=>x-y),.5);
const inside=(x,y,p)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i].y>y)!==(p[j].y>y)&&x<(p[j].x-p[i].x)*(y-p[i].y)/(p[j].y-p[i].y)+p[i].x)yes=!yes;return yes};
function distance(x,y,p){let best=Infinity;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[j],b=p[i],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1));best=Math.min(best,Math.hypot(x-a.x-t*dx,y-a.y-t*dy))}return best}
function bounds(poly,w,h,pad=0){return [Math.max(0,Math.floor(Math.min(...poly.map(p=>p.x))-pad)),Math.min(w,Math.ceil(Math.max(...poly.map(p=>p.x))+pad)),Math.max(0,Math.floor(Math.min(...poly.map(p=>p.y))-pad)),Math.min(h,Math.ceil(Math.max(...poly.map(p=>p.y))+pad))]}
function paintRegion(plane,poly,w,h,{value=255,feather=0,hole=null}={}){
 const [x0,x1,y0,y1]=bounds(poly,w,h,feather);
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  const xx=x+.5,yy=y+.5,d=distance(xx,yy,poly),within=inside(xx,yy,poly);
  if(hole&&inside(xx,yy,hole))continue;
  const weight=within?1:feather?1-smooth(0,feather,d):0;
  if(weight)plane[y*w+x]=Math.max(plane[y*w+x],Math.round(value*weight));
 }
}
function softenSkin(plane,w,h,radius){
 const row=new Float32Array(w*h),out=new Float32Array(w*h),size=radius*2+1;
 for(let y=0;y<h;y++){
  const base=y*w;let sum=0;for(let k=-radius;k<=radius;k++)sum+=plane[base+clamp(k,0,w-1)];
  for(let x=0;x<w;x++){row[base+x]=sum/size;sum+=plane[base+Math.min(w-1,x+radius+1)]-plane[base+Math.max(0,x-radius)]}
 }
 for(let x=0;x<w;x++){
  let sum=0;for(let k=-radius;k<=radius;k++)sum+=row[clamp(k,0,h-1)*w+x];
  for(let y=0;y<h;y++){out[y*w+x]=sum/size;sum+=row[Math.min(h-1,y+radius+1)*w+x]-row[Math.max(0,y-radius)*w+x]}
 }
 return out;
}
function sclera(pixels,w,h,poly,iris,eyeDistance){
 const [x0,x1,y0,y1]=bounds(poly,w,h),samples=[];
 const radius=Math.max(1.1,...iris.slice(1).map(p=>Math.hypot(p.x-iris[0].x,p.y-iris[0].y)))*1.18;
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  const xx=x+.5,yy=y+.5;if(!inside(xx,yy,poly)||distance(xx,yy,poly)<Math.max(.45,eyeDistance*.002)||Math.hypot(xx-iris[0].x,yy-iris[0].y)<radius)continue;
  const j=(y*w+x)*4,r=pixels[j],g=pixels[j+1],b=pixels[j+2],L=luma(r,g,b);
  if(pixels[j+3]<250||L<18||L>249||Math.max(r,g,b)>252||Math.min(r,g,b)<8)continue;
  samples.push({rgb:[r,g,b],L});
 }
 const minimum=Math.max(3,Math.min(12,Math.round(eyeDistance*.035)));
 if(samples.length<minimum)return null;
 samples.sort((a,b)=>a.L-b.L);
 // The brighter diffuse sclera rejects lash/tear shadows; its top tail is not
 // used as a white reference because catchlights and clipping are unreliable.
 const low=quantile(samples.map(p=>p.L),.50),high=quantile(samples.map(p=>p.L),.90),selected=samples.filter(p=>p.L>=low&&p.L<=high);
 if(selected.length<3)return null;
 const rgb=[0,1,2].map(c=>med(selected.map(p=>p.rgb[c])));
 return {rgb,luma:luma(...rgb),samples:samples.length};
}
const linear=v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const gamma=v=>255*(v<=.0031308?12.92*v:1.055*Math.max(0,v)**(1/2.4)-.055);
function lab(rgb){const [r,g,b]=rgb.map(linear),f=v=>v>.008856?Math.cbrt(v):7.787*v+16/116,x=f((.4124564*r+.3575761*g+.1804375*b)/.95047),y=f(.2126729*r+.7151522*g+.072175*b),z=f((.0193339*r+.119192*g+.9503041*b)/1.08883);return [116*y-16,500*(x-y),200*(y-z)]}
function rgb([L,a,b]){const y=(L+16)/116,x=y+a/500,z=y-b/200,f=v=>v**3>.008856?v**3:(v-16/116)/7.787,X=.95047*f(x),Y=f(y),Z=1.08883*f(z);return [gamma(3.2404542*X-1.5371385*Y-.4985314*Z),gamma(-.969266*X+1.8760108*Y+.041556*Z),gamma(.0556434*X-.2040259*Y+1.0572252*Z)]}
function softChroma(v,low,high){const floor=low+3*Math.log1p(Math.exp((v-low)/3));return high-3*Math.log1p(Math.exp((high-floor)/3))}
function gamutRGB(L,a,b){
 let color=rgb([L,a,b]);if(color.every(v=>v>=0&&v<=255))return color;
 // Reduce chroma toward a neutral colour at the SAME L*, rather than backing
 // toward the old cyan cast or clipping a red channel into a flat plateau.
 let low=0,high=1;
 for(let n=0;n<9;n++){const mid=(low+high)/2,candidate=rgb([L,a*mid,b*mid]);if(candidate.every(v=>v>=0&&v<=255))low=mid;else high=mid}
 return rgb([L,a*low,b*low]);
}
// The same global transfer is also used on lip/lid surfaces. It retains their
// measured shading and real gloss; it does not draw a highlight or flatten L*.
export function transferFemaleStudioRGB(color,transfer){
 const gain=transfer?.rgbGain;
 if(!Array.isArray(gain)||gain.length!==3||gain.some(v=>!Number.isFinite(v)||v<=0))return [...color];
 return color.map((v,c)=>{
  const x=Math.max(0,v*gain[c]);
  // A smooth highlight shoulder avoids hard channel clipping after a lift.
  return x<=232?x:232+23*(1-Math.exp(-(x-232)/23));
 });
}

export function finishFemaleStudioLighting({pixels,width:w,height:h,face,skin,hair}={}){
 const report={version:'female-measured-studio-v2',status:'unmeasurable',reason:'insufficient-face-evidence',changedPixels:0,featurePixels:0};
 const unchanged=()=>({pixels,changed:false,report});
 if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<=0||h<=0||w*h>33554432||!(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==w*h*4||skin?.length!==w*h||hair?.length!==w*h)return unchanged();
 const required=[10,9,151,152,234,454,50,101,118,280,330,347,...EYES.flat(),...BROWS.flat(),...LIP,...MOUTH,...LIDS.flatMap(v=>[...v.edge,v.brow]),468,469,470,471,472,473,474,475,476,477];
 if(required.some(i=>!Number.isFinite(face?.[i]?.x)||!Number.isFinite(face?.[i]?.y)||face[i].x<0||face[i].x>1||face[i].y<0||face[i].y>1))return unchanged();
 const n=w*h;for(let i=0;i<n;i++)if(!Number.isFinite(skin[i])||skin[i]<0||skin[i]>1||!Number.isFinite(hair[i])||hair[i]<0||hair[i]>1){report.reason='invalid-confidence';return unchanged()}
 const point=i=>({x:face[i].x*w,y:face[i].y*h}),fw=Math.hypot(point(454).x-point(234).x,point(454).y-point(234).y),left=point(33),right=point(263),d=Math.hypot(right.x-left.x,right.y-left.y);
 if(fw<64||d<25){report.reason='face-too-small';return unchanged()}
 const protectedPixels=new Uint8Array(n),browProtection=new Uint8Array(n),lipSurface=new Uint8Array(n),featurePixels=new Uint8Array(n),eyePolys=EYES.map(ids=>ids.map(point)),lip=LIP.map(point),mouth=MOUTH.map(point),feather=Math.max(1,fw*.007);
 for(const poly of eyePolys)paintRegion(protectedPixels,poly,w,h,{feather});
 for(const poly of BROWS.map(ids=>ids.map(point)))paintRegion(browProtection,poly,w,h,{feather});
 paintRegion(protectedPixels,mouth,w,h,{feather});
 paintRegion(featurePixels,lip,w,h,{hole:mouth});
 paintRegion(lipSurface,lip,w,h,{hole:mouth});
 for(const lid of LIDS){const edge=lid.edge.map(point),brow=point(lid.brow),top=edge.map((p,i)=>({...p,y:p.y-Math.max(0,(p.y-brow.y))*.48*Math.sin(Math.PI*i/(edge.length-1))}));paintRegion(featurePixels,[...edge,...top.reverse()],w,h)}
 const eyes=EYES.map((_,i)=>sclera(pixels,w,h,eyePolys[i],[468+i*5,469+i*5,470+i*5,471+i*5,472+i*5].map(point),d));
 const sampleSets=[],allSamples=[];let sourcePatchPixels=0,sourceClippedPixels=0,allChannelClippedPixels=0;
 for(const ids of [[50,101,118],[280,330,347],[9,151]]){
  const samples=[];
  for(const id of ids){const p=point(id),radius=fw*((id===9||id===151)?.035:.033),step=Math.max(1,Math.floor(radius/5));
   for(let y=Math.max(0,Math.floor(p.y-radius));y<Math.min(h,p.y+radius);y+=step)for(let x=Math.max(0,Math.floor(p.x-radius));x<Math.min(w,p.x+radius);x+=step){
    if(Math.hypot(x+.5-p.x,y+.5-p.y)>radius)continue;
    const i=y*w+x,j=i*4;if(skin[i]<.8||hair[i]>.10||pixels[j+3]<250||protectedPixels[i]>0||browProtection[i]>0||featurePixels[i]>0)continue;
    const color=[pixels[j],pixels[j+1],pixels[j+2]],L=luma(...color);sourcePatchPixels++;if(Math.max(...color)>=253)sourceClippedPixels++;if(Math.min(...color)>=250)allChannelClippedPixels++;if(L<12||L>248)continue;
    samples.push({rgb:color,L,x,y});
   }
  }
  sampleSets.push(samples);allSamples.push(...samples);
 }
 const sourceClippedFraction=sourcePatchPixels?sourceClippedPixels/sourcePatchPixels:0,allChannelClippedFraction=sourcePatchPixels?allChannelClippedPixels/sourcePatchPixels:0;
 report.quality={sourceClippedFraction,allChannelClippedFraction,unrecoverable:allChannelClippedFraction>.35,correctionCapped:false,needsReview:true,semanticMakeupVerified:false};
 if(allSamples.length<30||sampleSets.slice(0,2).some(s=>s.length<8)){report.reason=report.quality.unrecoverable?'source-skin-detail-unrecoverable':'insufficient-skin-samples';return unchanged()}
 const skinValues=allSamples.map(p=>p.L).sort((a,b)=>a-b),skin50=quantile(skinValues,.5),skin70=quantile(skinValues,.7),skin90=quantile(skinValues,.9);
 const eyeAgreement=eyes.every(Boolean)?Math.min(...eyes.map(e=>e.luma))/Math.max(...eyes.map(e=>e.luma)):0;
 const chromaAgreement=eyes.every(Boolean)?Math.max(...[0,1,2].map(c=>Math.abs(Math.log((eyes[0].rgb[c]/eyes[0].luma)/(eyes[1].rgb[c]/eyes[1].luma))))):Infinity;
 const measured=eyeAgreement>.70&&chromaAgreement<.23;
 let exposure=1,wb=[1,1,1],limited=false;
 if(measured){
  const reference=[0,1,2].map(c=>(eyes[0].rgb[c]+eyes[1].rgb[c])/2),referenceL=luma(...reference),target=[208,206,204],targetL=luma(...target);
  wb=reference.map((v,c)=>clamp((target[c]/targetL)/(v/referenceL),.74,1.35));
  const balancedL=allSamples.map(p=>luma(...p.rgb.map((v,c)=>v*wb[c]))).sort((a,b)=>a-b);
  // Sclera commonly sits in a natural eye-socket shadow. Its white point gives
  // cast evidence, but must never brighten already fair cheeks to clipping.
  // A common robust skin median keeps clipped/low-contrast and normal portraits
  // at the same studio exposure. The independent white-point cap preserves
  // darker complexions whose sclera is already bright.
  const requested=Math.min(targetL/referenceL,196/quantile(balancedL,.5));exposure=clamp(requested,.62,2.4);limited=Math.abs(exposure-requested)>.005;
  limited=limited||reference.some((v,c)=>Math.abs(wb[c]-(target[c]/targetL)/(v/referenceL))>.005);
  report.reference={kind:'bilateral-sclera',rgb:reference,luma:referenceL,maximumTargetRGB:target,skinMedianAnchor:196,agreement:eyeAgreement,chromaAgreement,samples:eyes.map(e=>e.samples)};
 }else{
  // Skin alone cannot distinguish exposure from natural pigmentation. Use a
  // broad, bounded studio band instead of forcing every complexion to white.
  const target=clamp(skin70,158,216);exposure=clamp(target/skin70,.76,1.5);
  report.reference={kind:'bounded-skin-fallback',targetBand:[158,216],reason:eyes.some(e=>!e)?'sclera-not-measurable':'sclera-disagreement'};
 }
 const transfer={rgbGain:wb.map(v=>v*exposure),exposure,whiteBalance:wb};
 const correctionCapped=limited;limited=limited||sourceClippedFraction>.06||report.quality.unrecoverable;
 const correctedSamples=allSamples.map(p=>transferFemaleStudioRGB(p.rgb,transfer)),correctedLabs=correctedSamples.map(lab),skinLab=[0,1,2].map(c=>med(correctedLabs.map(p=>p[c]))),targetLab=[skinLab[0],clamp(skinLab[1],11,19),clamp(skinLab[2],9,18)],skinChromaShift=[targetLab[1]-skinLab[1],targetLab[2]-skinLab[2]];
 // Correct residual cast in perceptual chroma coordinates. A clipped original
 // red channel cannot be repaired by a bounded red RGB multiplier: that left
 // cyan islands. Retain each pixel's L* and fine chroma variation instead.
 const cheekL=sampleSets.slice(0,2).map(s=>med(s.map(p=>luma(...transferFemaleStudioRGB(p.rgb,transfer))))),difference=Math.log(cheekL[1]/cheekL[0]);
 // Correct a broad side light only. Small natural cheek shading stays intact;
 // no blur or local averaging removes the photographed pores or skin marks.
 const sideSlope=Math.abs(cheekL[1]-cheekL[0])>14?clamp(difference*.75,-.35,.35):0;
 const cx=(left.x+right.x)/2,cy=(left.y+right.y)/2,ux=(right.x-left.x)/d,uy=(right.y-left.y)/d,chin=point(152),top=point(10),faceTop=Math.min(top.y,chin.y),faceBottom=Math.max(top.y,chin.y);
 const out=new Uint8ClampedArray(pixels),softSkin=softenSkin(skin,w,h,Math.max(1,Math.min(8,Math.round(fw*.015))));let clipped=0,skinCount=0;
 for(let i=0;i<n;i++){
  const j=i*4;if(pixels[j+3]===0)continue;
  const original=[pixels[j],pixels[j+1],pixels[j+2]],L=luma(...original),feature=featurePixels[i]/255;
  // One continuous illuminant grades the complete AI head/neck cutout, including
  // hair and semitransparent edge RGB. Alpha and all coordinates stay exact.
  // The outfit is a separate layer composed after this pass.
  let color=transferFemaleStudioRGB(original,transfer);
  // Only the foundation/local side fill uses skin evidence. Its boundary is
  // continuous and can bridge a small segmentation error at the hairline;
  // dark actual hair/strands are protected by relative luminance evidence.
  const s=smooth(.12,.96,softSkin[i])*smooth(skin50*.25,skin50*.72,L);
  // Eyelid skin needs the same neutral foundation as adjacent skin. Only lip
  // pigment and the protected eye/mouth openings have a separate colour role;
  // excluding a broad upper-lid polygon left a visible cyan band after WB.
  if(!lipSurface[i]&&s>0){
   const x=i%w+.5,y=Math.floor(i/w)+.5,u=((x-cx)*ux+(y-cy)*uy)/fw;
   const vertical=smooth(faceTop-fw*.03,faceTop+fw*.08,y)*(1-smooth(faceBottom-fw*.08,faceBottom+fw*.10,y));
   const local=Math.exp(-sideSlope*clamp(u*2,-1,1)*vertical*s);
   // A brow polygon contains skin between individual hairs. Leaving that skin
   // at the old cast produces a visible coloured box. Use the same skin field
   // on its bright gaps, with a smooth luminance guard on the darker strands.
   const browSkin=1-browProtection[i]/255*(1-smooth(skin50*.35,skin50*.82,L));
   const localWeight=s*(1-protectedPixels[i]/255)*browSkin;
   // Filling a broad shadow must not drive an existing glossy point beyond
   // L*=100. Give only the positive local lift a smooth remaining-headroom
   // shoulder; local=1 stays exact and the original highlight is never dimmed.
   let localGain=local;
   if(local>1){
    const peak=Math.max(...color),headroom=Math.max(0,254-peak);
    localGain=peak>0?(peak+headroom*(-Math.expm1(-peak*(local-1)/Math.max(.000001,headroom))))/peak:1;
   }
   const value=lab(color.map(v=>v*localGain));
   const desiredA=softChroma(value[1]+skinChromaShift[0],4,29),desiredB=softChroma(value[2]+skinChromaShift[1],4,27);
   color=gamutRGB(value[0],value[1]+(desiredA-value[1])*localWeight,value[2]+(desiredB-value[2])*localWeight);
  }
  let changed=false;
  for(let c=0;c<3;c++){const value=Math.round(clamp(color[c],0,255));out[j+c]=value;if(value!==pixels[j+c])changed=true}
  if(changed){report.changedPixels++;if(feature)report.featurePixels++}
  if(s>.8&&!feature){skinCount++;if(Math.max(out[j],out[j+1],out[j+2])>=251)clipped++}
 }
 const actualSamples=allSamples.map(p=>{const k=(p.y*w+p.x)*4;return [out[k],out[k+1],out[k+2]]}),actualLuma=actualSamples.map(c=>luma(...c)).sort((a,b)=>a-b),originalMedian=[0,1,2].map(c=>med(allSamples.map(p=>p.rgb[c]))),actualMedian=[0,1,2].map(c=>med(actualSamples.map(p=>p[c])));
 report.status=limited?'limited':measured?'measured':'fallback';report.correction=report.changedPixels?'corrected':'already-target';report.reason=report.quality.unrecoverable?'source-skin-detail-unrecoverable':correctionCapped?'correction-limit-reached':sourceClippedFraction>.06?'source-single-channel-clipped':measured?'studio-illuminant-normalized':'bounded-correction-without-independent-white-reference';
 report.confidence=measured?clamp(eyeAgreement*(1-chromaAgreement)):0.45;
 report.transfer=transfer;report.skinChromaShift=skinChromaShift;report.sideLightCorrection=sideSlope;report.before={skinLuma:{p50:skin50,p70:skin70,p90:skin90},skinLab:lab(originalMedian)};
 report.after={sampledSkinLuma:{p50:quantile(actualLuma,.5),p70:quantile(actualLuma,.7),p90:quantile(actualLuma,.9)},skinLab:lab(actualMedian),skinClippedFraction:skinCount?clipped/skinCount:0};
 report.quality={...report.quality,independentIlluminantMeasured:measured,correctionCapped,needsReview:limited||!measured,semanticMakeupVerified:false};
 // This is a photometric report, never proof of semantic makeup completeness.
 return {pixels:report.changedPixels?out:pixels,changed:report.changedPixels>0,report};
}
