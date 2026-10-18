// Female initial portraits only. Lighting is normalized before this pass;
// cosmetic pigment is measured independently in each visible region. Keep
// lightness detail, gloss, mouth/eye openings, geometry and alpha intact.
// Lip body lightness follows the measured, normalized surrounding skin; it is
// shifted as a field, never filled with one flat RGB/L* value.
const LIP=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const HOLE=[78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95];
const EYES=[{name:'leftEye',edge:[33,246,161,160,159,158,157,173,133],brow:52},{name:'rightEye',edge:[362,398,384,385,386,387,388,466,263],brow:282}];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v,0,1);return v*v*(3-2*v)};
const median=a=>{a.sort((x,y)=>x-y);return a[Math.floor(a.length/2)]};
const inside=(x,y,p)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i].y>y)!==(p[j].y>y)&&x<(p[j].x-p[i].x)*(y-p[i].y)/(p[j].y-p[i].y)+p[i].x)yes=!yes;return yes};
function distance(x,y,p){let best=Infinity;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);best=Math.min(best,Math.hypot(x-a.x-dx*t,y-a.y-dy*t))}return best}
const linear=v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const gamma=v=>255*(v<=.0031308?12.92*v:1.055*Math.max(0,v)**(1/2.4)-.055);
function lab(r,g,b){r=linear(r);g=linear(g);b=linear(b);const f=v=>v>.008856?Math.cbrt(v):7.787*v+16/116;const x=f((.4124564*r+.3575761*g+.1804375*b)/.95047),y=f(.2126729*r+.7151522*g+.072175*b),z=f((.0193339*r+.119192*g+.9503041*b)/1.08883);return [116*y-16,500*(x-y),200*(y-z)]}
function rgb(L,a,b){const y=(L+16)/116,x=y+a/500,z=y-b/200,f=v=>v**3>.008856?v**3:(v-16/116)/7.787;const X=.95047*f(x),Y=f(y),Z=1.08883*f(z);return [gamma(3.2404542*X-1.5371385*Y-.4985314*Z),gamma(-.969266*X+1.8760108*Y+.041556*Z),gamma(.0556434*X-.2040259*Y+1.0572252*Z)]}
const inGamut=c=>c.every(v=>Number.isFinite(v)&&v>=0&&v<=255);
// At bright/dark gamut limits reduce chroma along the desired hue. Reducing
// the correction instead would leave saturated orange/purple lipstick behind.
function pigmentRgb(L,a,b){let c=rgb(L,a,b);if(inGamut(c))return c;let lo=0,hi=1;for(let i=0;i<12;i++){const m=(lo+hi)/2;if(inGamut(rgb(L,a*m,b*m)))lo=m;else hi=m}c=rgb(L,a*lo,b*lo);return inGamut(c)?c:null}
const unavailable=reason=>({status:'unavailable',reason,sampleCount:0,changedPixels:0});
const validPoint=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
const medians=values=>[0,1,2].map(i=>median(values.map(v=>v[i])));

export function finishFemaleRosePigment({pixels,width:w,height:h,face,skin,hair}={}){
 const regions={lips:unavailable('invalid-input'),leftEye:unavailable('invalid-input'),rightEye:unavailable('invalid-input')};
 const finish=(out=pixels,changed=false)=>{
  const measured=Object.values(regions).filter(r=>r.status!=='unavailable').length;
  return {pixels:changed?out:pixels,changed,status:measured===3?'measured':measured?'partial':'unmeasurable',regions};
 };
 if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<=0||h<=0||w*h>33554432||!(pixels instanceof Uint8ClampedArray||pixels instanceof Uint8Array)||pixels.length!==w*h*4||!face||skin?.length!==w*h||hair?.length!==w*h)return finish();
 if(!validPoint(face[234])||!validPoint(face[454]))return finish();
 const point=i=>({x:face[i].x*w,y:face[i].y*h}),fw=Math.hypot((face[454].x-face[234].x)*w,(face[454].y-face[234].y)*h);
 if(fw<64){for(const key of Object.keys(regions))regions[key]=unavailable('face-too-small');return finish()}
 const skinLightSamples=[];
 for(const id of [50,101,118,280,330,347,9,151]){
  if(!validPoint(face[id]))continue;
  const c=point(id),r=fw*.033;
  for(let y=Math.max(0,Math.floor(c.y-r));y<Math.min(h,c.y+r);y++)for(let x=Math.max(0,Math.floor(c.x-r));x<Math.min(w,c.x+r);x++){
   if(Math.hypot(x+.5-c.x,y+.5-c.y)>r)continue;
   const n=y*w+x,k=n*4;if(!Number.isFinite(skin[n])||skin[n]<.7||skin[n]>1||!Number.isFinite(hair[n])||hair[n]<0||hair[n]>.15||pixels[k+3]<250)continue;
   const L=lab(pixels[k],pixels[k+1],pixels[k+2])[0];if(L>=20&&L<=95)skinLightSamples.push(L);
  }
 }
 const skinReferenceL=skinLightSamples.length>=30?median(skinLightSamples):null;
 const descriptors=[];
 for(const eye of EYES){
  if([...eye.edge,eye.brow].some(i=>!validPoint(face[i]))){regions[eye.name]=unavailable('invalid-landmarks');continue}
  const edge=eye.edge.map(point),brow=point(eye.brow),mid=edge[4],span=Math.hypot(edge[8].x-edge[0].x,edge[8].y-edge[0].y),gap=mid.y-brow.y;
  if(span<fw*.10||span>fw*.43||gap<fw*.012||gap>fw*.22){regions[eye.name]=unavailable('unreliable-eyelid-geometry');continue}
  // A narrow mobile-lid band above the upper lash line, separated from brows.
  // Increase evidence over the old subpixel strip without painting the socket.
  const depth=Math.min(gap*.24,fw*.018),top=edge.map((p,i)=>({...p,y:p.y-depth*Math.sin(Math.PI*i/8)}));
  descriptors.push({name:eye.name,kind:'eye',poly:[...edge,...top.reverse()],hole:null,target:[10,2],feather:Math.max(.6,depth*.25),minSamples:4});
 }
 if([...LIP,...HOLE].some(i=>!validPoint(face[i])))regions.lips=unavailable('invalid-landmarks');
 else{
  const lip=LIP.map(point),hole=HOLE.map(point),lipWidth=Math.max(...lip.map(p=>p.x))-Math.min(...lip.map(p=>p.x)),lipHeight=Math.max(...lip.map(p=>p.y))-Math.min(...lip.map(p=>p.y));
  if(lipWidth<fw*.12||lipWidth>fw*.65||lipHeight<fw*.015||lipHeight>fw*.25||hole.some(p=>!inside(p.x,p.y,lip)))regions.lips=unavailable('unreliable-lip-geometry');
  // Keep the feather inside the original lip outline. A subpixel rim looks
  // pasted onto a softer/upscaled source; cap its width for genuinely thin lips.
  else descriptors.push({name:'lips',kind:'lip',poly:lip,hole,target:[38,5],lipHeight,feather:Math.max(.7,Math.min(fw*.009,lipHeight*.16)),minSamples:12});
 }
 const out=new Uint8ClampedArray(pixels);let changed=false;
 for(const region of descriptors){
  const {poly,hole}=region,x0=clamp(Math.floor(Math.min(...poly.map(p=>p.x))),0,w),x1=clamp(Math.ceil(Math.max(...poly.map(p=>p.x))),0,w),y0=clamp(Math.floor(Math.min(...poly.map(p=>p.y))),0,h),y1=clamp(Math.ceil(Math.max(...poly.map(p=>p.y))),0,h),samples=[];
  let area=0,occluded=0,protectedCount=0,invalid=false;
  const edgeSkin=[];
  if(region.kind==='lip'){
   const ring=Math.max(1.5,fw*.009);
   for(let y=Math.max(0,Math.floor(y0-ring));y<Math.min(h,Math.ceil(y1+ring));y++)for(let x=Math.max(0,Math.floor(x0-ring));x<Math.min(w,Math.ceil(x1+ring));x++){
    if(inside(x+.5,y+.5,poly)||distance(x+.5,y+.5,poly)>ring)continue;
    const n=y*w+x,k=n*4;if(skin[n]<.65||skin[n]>1||hair[n]>.15||hair[n]<0||!Number.isFinite(skin[n])||!Number.isFinite(hair[n])||pixels[k+3]<250)continue;
    const value=lab(pixels[k],pixels[k+1],pixels[k+2]);if(value[0]>=22&&value[0]<=88)edgeSkin.push(value);
   }
  }
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
   if(!inside(x+.5,y+.5,poly)||hole&&inside(x+.5,y+.5,hole))continue;
   area++;const n=y*w+x,k=n*4,s=skin[n],hairValue=hair[n];
   if(!Number.isFinite(s)||s<0||s>1||!Number.isFinite(hairValue)||hairValue<0||hairValue>1){invalid=true;continue}
   if(pixels[k+3]<250||hairValue>.15||region.kind==='eye'&&s<.55){occluded++;continue}
   const value=lab(pixels[k],pixels[k+1],pixels[k+2]),C=Math.hypot(value[1],value[2]);
   // Preserve black lash roots, deep mouth creases and clear gloss/speculars.
   if(value[0]<22||value[0]>88||value[0]>70&&C<5){protectedCount++;continue}
   const edge=distance(x+.5,y+.5,poly),weight=smooth(edge/region.feather);
   if(weight>0)samples.push({k,x:x+.5,y:y+.5,value,weight});
  }
  const evidence={area,occludedPixels:occluded,protectedPixels:protectedCount};
  if(invalid){regions[region.name]={...unavailable('invalid-mask-evidence'),...evidence};continue}
  if(samples.length<region.minSamples||samples.length<area*.12){regions[region.name]={...unavailable(occluded>area*.5?'occluded-or-low-confidence':protectedCount>area*.5?'protected-highlights-or-deep-shadows':'insufficient-visible-pixels'),sampleCount:samples.length,...evidence};continue}
  const before=medians(samples.map(p=>p.value)),core=samples.filter(p=>p.weight>.8),medianCore=core.length>=region.minSamples?medians(core.map(p=>p.value)):before,outerTone=edgeSkin.length>=12?medians(edgeSkin):null;
  const requestedL=region.kind==='lip'&&skinReferenceL!==null?clamp(skinReferenceL-18,30,76):null,requestedShift=requestedL===null?0:requestedL-before[0],lightnessShift=clamp(requestedShift,-24,24);
  const lightness=region.kind==='lip'?{status:requestedL===null?'unavailable':Math.abs(lightnessShift-requestedShift)>.01?'limited':'measured',reason:requestedL===null?'insufficient-skin-light-reference':Math.abs(lightnessShift-requestedShift)>.01?'lip-lightness-correction-limit':'relative-to-normalized-skin',referenceSkinL:skinReferenceL,referenceSamples:skinLightSamples.length,targetMedianL:requestedL,shift:lightnessShift,correctionCapped:Math.abs(lightnessShift-requestedShift)>.01}:undefined;
  const deviation=Math.hypot(medianCore[1]-region.target[0],medianCore[2]-region.target[1]),colourDistances=samples.map(p=>Math.hypot(p.value[1]-region.target[0],p.value[2]-region.target[1])).sort((a,b)=>a-b);
  // Preserve an already matching finish, including the model's genuine lip
  // gradient and shimmer. A median alone must not hide strong patchy pigment.
  if(deviation<(region.kind==='lip'?3:1.5)&&colourDistances[Math.floor(colourDistances.length*.8)]<8&&Math.abs(lightnessShift)<.6){regions[region.name]={status:'already-target',reason:'within-target-tolerance',sampleCount:samples.length,coreSampleCount:core.length,changedPixels:0,beforeLab:before,afterLab:before,targetAB:region.target,sourceTargetDistance:deviation,gamutReducedPixels:0,...(lightness?{lightness}:{}),...evidence};continue}
  let changedPixels=0,gamutReducedPixels=0;const after=[];
  for(const p of samples){
   const [sourceL,A,B]=p.value;
   const L=region.kind==='lip'?clamp(sourceL+lightnessShift*p.weight*smooth((sourceL-22)/8),22,91):sourceL;
   // Dark lash detail within a mobile-lid band must not become pink eyeliner.
   if(region.kind==='eye'&&sourceL<before[0]-12){after.push(p.value);continue}
   const inner=hole?1-smooth(distance(p.x,p.y,hole)/(region.lipHeight*.34)):0;
   const targetA=region.target[0]+(region.kind==='lip'?3*inner:0),targetB=region.target[1]+(region.kind==='lip'?1*inner:0),texture=region.kind==='lip'?.25:.35;
   // A common target replaces source pigment; retain only fine local variation.
   const newA=targetA+clamp((A-medianCore[1])*texture,-4,4),newB=targetB+clamp((B-medianCore[2])*texture,-4,4);
   // On lips, feather toward measured surrounding skin rather than old
   // lipstick: blending with strong purple/orange leaves a coloured outline.
   // The mouth opening is excluded; the original dark contact crease survives.
   const edgeA=outerTone?outerTone[1]:region.target[0]*.6,edgeB=outerTone?outerTone[2]:region.target[1]*.6;
   const mixedA=region.kind==='lip'?edgeA+(newA-edgeA)*p.weight:A+(newA-A)*p.weight,mixedB=region.kind==='lip'?edgeB+(newB-edgeB)*p.weight:B+(newB-B)*p.weight,color=pigmentRgb(L,mixedA,mixedB);
   if(!color){after.push(p.value);continue}
   if(!inGamut(rgb(L,mixedA,mixedB)))gamutReducedPixels++;
   let pixelChanged=false;for(let channel=0;channel<3;channel++){const v=Math.round(color[channel]);if(v!==out[p.k+channel])pixelChanged=true;out[p.k+channel]=v}
   if(pixelChanged){changedPixels++;changed=true}
   after.push(lab(out[p.k],out[p.k+1],out[p.k+2]));
  }
  const result=medians(after);
  const measuredLightness=lightness?{...lightness,measuredMedianL:result[0],targetError:requestedL===null?null:Math.abs(result[0]-requestedL)}:null;
  if(measuredLightness?.status==='measured'&&measuredLightness.targetError>1.5){measuredLightness.status='limited';measuredLightness.reason='lip-body-lightness-target-not-reached'}
  regions[region.name]={status:changedPixels?'changed':'already-target',reason:changedPixels?'pigment-normalized':'within-rounding-tolerance',sampleCount:samples.length,coreSampleCount:core.length,changedPixels,beforeLab:before,afterLab:result,targetAB:region.target,sourceTargetDistance:deviation,gamutReducedPixels,...(measuredLightness?{lightness:measuredLightness}:{}),...evidence};
 }
 return finish(out,changed);
}
