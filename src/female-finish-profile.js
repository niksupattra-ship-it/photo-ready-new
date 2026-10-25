// Continuity of an accepted female finish. The profile contains measurements,
// never face pixels: later hair renders keep their own anatomy and shading.
// This module has no DOM, models, dependencies, or full-frame working masks.
const MAX_PIXELS=8388608;
const OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const U=[[33,246,161,160,159,158,157,173,133],[362,398,384,385,386,387,388,466,263]];
const D=[[33,7,163,144,145,153,154,155,133],[362,382,381,380,374,373,390,249,263]];
const B=[[70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285]];
const LIPS=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const IDS=['forehead','leftCheek','rightCheek','chin','leftEar','rightEar','neck'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v,0,1);return v*v*(3-2*v)};
const quantile=(v,q)=>v.slice().sort((a,b)=>a-b)[Math.floor((v.length-1)*q)];
const median=v=>quantile(v,.5);
const finite=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const pointOK=p=>finite(p?.x,0,1)&&finite(p?.y,0,1);
const round=v=>Math.round(v*10000)/10000;
function inside(x,y,p){let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i].y>y)!==(p[j].y>y)&&x<(p[j].x-p[i].x)*(y-p[i].y)/(p[j].y-p[i].y)+p[i].x)yes=!yes;return yes}
function distance(x,y,p){let best=Infinity;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);best=Math.min(best,Math.hypot(x-a.x-dx*t,y-a.y-dy*t))}return best}
function convexHull(points){const sorted=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y),cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x),half=[];for(const p of sorted){while(half.length>=2&&cross(half[half.length-2],half[half.length-1],p)<=0)half.pop();half.push(p)}const lower=half.slice();half.length=0;for(const p of sorted.slice().reverse()){while(half.length>=2&&cross(half[half.length-2],half[half.length-1],p)<=0)half.pop();half.push(p)}return [...lower.slice(0,-1),...half.slice(0,-1)]}
const linear=v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const gamma=v=>255*(v<=.0031308?12.92*v:1.055*Math.max(0,v)**(1/2.4)-.055);
function lab(r,g,b){r=linear(r);g=linear(g);b=linear(b);const f=v=>v>.008856451679?Math.cbrt(v):v*7.787037037+16/116,x=f((.4124564*r+.3575761*g+.1804375*b)/.95047),y=f(.2126729*r+.7151522*g+.072175*b),z=f((.0193339*r+.119192*g+.9503041*b)/1.08883);return [116*y-16,500*(x-y),200*(y-z)]}
function rgb(L,a,b){const y=(L+16)/116,x=y+a/500,z=y-b/200,f=v=>v**3>.008856451679?v**3:(v-16/116)/7.787037037,X=.95047*f(x),Y=f(y),Z=1.08883*f(z);return [gamma(3.2404542*X-1.5371385*Y-.4985314*Z),gamma(-.969266*X+1.8760108*Y+.041556*Z),gamma(.0556434*X-.2040259*Y+1.0572252*Z)]}
const gamut=c=>c.every(v=>Number.isFinite(v)&&v>=0&&v<=255);
function safeRgb(old,next){let c=rgb(...next);if(gamut(c))return c;let lo=0,hi=1;for(let i=0;i<9;i++){const t=(lo+hi)/2,v=rgb(...old.map((x,j)=>x+(next[j]-x)*t));if(gamut(v)){lo=t;c=v}else hi=t}return lo>.1&&gamut(c)?c:null}
function plane(mask,n){if(!ArrayBuffer.isView(mask)||mask instanceof DataView)return null;if(mask.length===n)return i=>mask[i];if(mask.length===n*4&&(mask instanceof Uint8Array||mask instanceof Uint8ClampedArray))return i=>mask[i*4+3]/255;return null}
function keys(value,allowed){return value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)&&Object.keys(value).every(k=>allowed.includes(k))}

/** Strict, bounded JSON schema. Untrusted saved metadata is never coerced. */
export function isFemaleFinishProfile(value){
 try{
  if(!keys(value,['version','kind','coordinate','scale','regions'])||value.version!==1||value.kind!=='female-finish'||value.coordinate!=='face-v1')return false;
  if(!keys(value.scale,['faceWidth','roughnessRadius'])||!finite(value.scale.faceWidth,80,8192)||!finite(value.scale.roughnessRadius,.4,64))return false;
  if(!Array.isArray(value.regions)||value.regions.length<2||value.regions.length>7)return false;
  const seen=new Set();let main=0;
  for(const r of value.regions){
   if(!keys(r,['id','lightness','chroma','roughness','samples','coverage'])||!IDS.includes(r.id)||seen.has(r.id))return false;seen.add(r.id);if(IDS.indexOf(r.id)<4)main++;
   if(!Array.isArray(r.lightness)||r.lightness.length!==3||!r.lightness.every(v=>finite(v,8,95))||r.lightness.some((v,i)=>i&&v<r.lightness[i-1])||r.lightness[2]-r.lightness[0]>28)return false;
   if(!Array.isArray(r.chroma)||r.chroma.length!==2||!r.chroma.every(v=>finite(v,-12,50))||!finite(r.roughness,0,12)||!Number.isSafeInteger(r.samples)||r.samples<32||r.samples>12000||!finite(r.coverage,.6,1))return false;
  }
  return main>=2&&JSON.stringify(value).length<=16384;
 }catch{return false}
}

function context(input){
 const {pixels,width:w,height:h,face}=input||{},n=w*h;
 if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<=0||h<=0||n>MAX_PIXELS||!(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==n*4)return null;
 const skin=plane(input.skin,n),hair=plane(input.hair,n),required=[...OVAL,...U.flat(),...D.flat(),...B.flat(),...LIPS,1,2,98,327,168,50,101,118,280,330,347];
 if(!skin||!hair||!required.every(i=>pointOK(face?.[i])))return null;
 const point=i=>({x:face[i].x*w,y:face[i].y*h}),a=point(234),b=point(454),fw=Math.hypot(b.x-a.x,b.y-a.y);
 if(fw<80||fw>Math.max(w,h)*1.25)return null;
 const ux=(b.x-a.x)/fw,uy=(b.y-a.y)/fw;let vx=-uy,vy=ux;
 const top=point(10),bottom=point(152);if((bottom.x-top.x)*vx+(bottom.y-top.y)*vy<0){vx=-vx;vy=-vy}
 const origin={x:(a.x+b.x)/2,y:(a.y+b.y)/2},local=p=>({x:((p.x-origin.x)*ux+(p.y-origin.y)*uy)/fw,y:((p.x-origin.x)*vx+(p.y-origin.y)*vy)/fw}),world=(x,y)=>({x:origin.x+fw*(ux*x+vx*y),y:origin.y+fw*(uy*x+vy*y)});
 const oval=OVAL.map(i=>local(point(i))),t=local(top),bt=local(bottom);
 if(bt.y-t.y<.65||bt.y-t.y>1.8||Math.abs(t.x)>.3||Math.abs(bt.x)>.3)return null;
 // Polygon winding, adequate area, and eye placement reject collapsed or
 // corrupt landmark arrays instead of guessing a skin field.
 const area=Math.abs(oval.reduce((s,p,i)=>s+p.x*oval[(i+1)%oval.length].y-p.y*oval[(i+1)%oval.length].x,0))/2;
 if(area<.35||area>1.5)return null;
 const polys=[];
 for(let side=0;side<2;side++){
  const eye=[...U[side].map(point),...D[side].slice(1,-1).reverse().map(point)].map(local),brow=B[side].map(i=>local(point(i))),e0=eye[0],e1=local(point(U[side][8])),span=Math.hypot(e1.x-e0.x,e1.y-e0.y);
  if(span<.10||span>.38)return null;
  // Follow actual brow/eye anatomy and the curved lower orbital grade. A
  // rectangular guard leaves a pale horizontal forehead/cheek edge after
  // tone matching; the wider continuous feather keeps the native pigment
  // and avoids giving surrounding skin an artificial rectangular boundary.
  const lowerGrade=D[side].map((id,j)=>{const p=local(point(id));return {x:p.x,y:p.y+.055*(.35+.65*Math.sin(Math.PI*j/8))}});
  polys.push({poly:convexHull([...eye,...brow,...lowerGrade]),guard:.025,feather:.065});
 }
 const mouthLeft=local(point(61)),mouthRight=local(point(291)),mouthTop=local(point(0)),mouthBottom=local(point(17));
 if(Math.hypot(mouthRight.x-mouthLeft.x,mouthRight.y-mouthLeft.y)<.12||Math.hypot(mouthRight.x-mouthLeft.x,mouthRight.y-mouthLeft.y)>.55||mouthBottom.y-mouthTop.y<.012||mouthBottom.y-mouthTop.y>.25)return null;
 polys.push({poly:LIPS.map(i=>local(point(i))),guard:.035});
 const nose=[98,1,327,2].map(i=>local(point(i)));
 polys.push({poly:nose,guard:.035});
 const protectedWeight=(x,y)=>{let weight=1;for(const p of polys){if(inside(x,y,p.poly))return 0;const d=distance(x,y,p.poly);if(d<=p.guard)return 0;weight=Math.min(weight,smooth((d-p.guard)/(p.feather||.025)))}return weight};
 const mean=ids=>{const ps=ids.map(i=>local(point(i)));return {x:ps.reduce((s,p)=>s+p.x,0)/ps.length,y:ps.reduce((s,p)=>s+p.y,0)/ps.length}};
 const browTop=median([...B[0].slice(0,5),...B[1].slice(0,5)].map(i=>local(point(i)).y)),fy0=t.y+.018,fy1=browTop-.045,fc=(fy0+fy1)/2,lc=mean([50,101,118]),rc=mean([280,330,347]),lip=local(point(17));
 if(fy1-fy0<.10)return null;
 const regions=[
  {id:'forehead',x:t.x*.3,y:fc,rx:.40,ry:(fy1-fy0)/2,optional:false},
  {id:'leftCheek',x:lc.x,y:lc.y+.025,rx:.205,ry:.205,optional:false},
  {id:'rightCheek',x:rc.x,y:rc.y+.025,rx:.205,ry:.205,optional:false},
  {id:'chin',x:bt.x*.5,y:(lip.y+bt.y)/2+.015,rx:.235,ry:Math.max(.08,(bt.y-lip.y)*.46),optional:false},
  {id:'leftEar',x:-.53,y:.045,rx:.095,ry:.17,optional:true},
  {id:'rightEar',x:.53,y:.045,rx:.095,ry:.17,optional:true},
  {id:'neck',x:bt.x,y:bt.y+.14,rx:.26,ry:.17,optional:true},
 ];
 const confidence=i=>{const s=skin(i),hh=hair(i);return finite(s,0,1)&&finite(hh,0,1)?{skin:s,hair:hh}:null};
 const eligible=(i,optional=false)=>{const c=confidence(i);return c&&c.skin>=(optional?.97:.90)&&c.hair<=(optional?.015:.035)&&pixels[i*4+3]===255};
 const radius=Math.max(.6,fw/180),sampleLab=(x,y)=>{
  // Bilinear sampling at the same fraction of face width makes measurements
  // comparable after image resizes and head roll, unlike native-pixel noise.
  const xx=x-.5,yy=y-.5,x0=Math.floor(xx),y0=Math.floor(yy),tx=xx-x0,ty=yy-y0;
  if(x0<0||y0<0||x0+1>=w||y0+1>=h)return null;
  let r=0,g=0,b=0;
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const i=(y0+dy)*w+x0+dx;if(!eligible(i))return null;const wt=(dx?tx:1-tx)*(dy?ty:1-ty),k=i*4;r+=pixels[k]*wt;g+=pixels[k+1]*wt;b+=pixels[k+2]*wt}
  return lab(r,g,b);
 };
 const residual=(p,L)=>{const vals=[];for(const [dx,dy] of [[ux,uy],[-ux,-uy],[vx,vy],[-vx,-vy]]){const q=sampleLab(p.x+dx*radius,p.y+dy*radius);if(!q)return null;vals.push(q[0])}return L-vals.reduce((s,v)=>s+v,0)/4};
 return {pixels,w,h,fw,world,local,oval,regions,protectedWeight,confidence,eligible,residual,radius};
}

function measure(c){
 const measured=new Map(),report={};
 for(const r of c.regions){
  const values=[],rough=[];let area=0,visible=0,invalid=false;
  // Bounded sampling grid in face coordinates: roughly 1,000 samples per
  // region at every output size; no frame-size confidence/working allocation.
  const step=Math.max(1/c.fw,.012),inner=.88;
  for(let y=r.y-r.ry*inner;y<=r.y+r.ry*inner;y+=step)for(let x=r.x-r.rx*inner;x<=r.x+r.rx*inner;x+=step){
   if(((x-r.x)/r.rx)**2+((y-r.y)/r.ry)**2>inner*inner||c.protectedWeight(x,y)<.98)continue;
   if(!r.optional&&(!inside(x,y,c.oval)||distance(x,y,c.oval)<.012))continue;
   const p=c.world(x,y),xx=Math.floor(p.x),yy=Math.floor(p.y);if(xx<0||yy<0||xx>=c.w||yy>=c.h)continue;
   area++;const i=yy*c.w+xx,k=i*4,confidence=c.confidence(i);if(!confidence){invalid=true;continue}if(!c.eligible(i,r.optional))continue;
   const v=lab(c.pixels[k],c.pixels[k+1],c.pixels[k+2]);
   // Wide limits include deep and fair complexions, while rejecting blown
   // speculars, opaque black marks, and implausible segmentation colours.
   if(v[0]<8||v[0]>95||v[1]<-12||v[1]>42||v[2]<-12||v[2]>50||Math.hypot(v[1],v[2])>55)continue;
   visible++;values.push(v);const res=c.residual(p,v[0]);if(res!==null&&Math.abs(res)<3.5)rough.push(Math.abs(res));
  }
  const coverage=area?visible/area:0;
  if(invalid||visible<48||coverage<(r.optional?.86:.65)||rough.length<32){report[r.id]={status:'unavailable',reason:invalid?'invalid-mask-evidence':'occluded-or-insufficient-skin',samples:visible,coverage};continue}
  // Median chroma and central quantiles resist freckles, small highlights,
  // blush edges, and pores without selecting a preset "white skin" target.
  const L=values.map(v=>v[0]),A=values.map(v=>v[1]),BB=values.map(v=>v[2]),entry={id:r.id,lightness:[.35,.5,.65].map(q=>round(quantile(L,q))),chroma:[round(median(A)),round(median(BB))],roughness:round(median(rough)),samples:visible,coverage:round(coverage)};
  if(entry.lightness[2]-entry.lightness[0]>20){report[r.id]={status:'unavailable',reason:'inconsistent-lighting',samples:visible,coverage};continue}
  measured.set(r.id,entry);report[r.id]={status:'measured',samples:visible,coverage,lightness:entry.lightness[1],roughness:entry.roughness};
 }
 const main=[...measured.values()].filter(r=>IDS.indexOf(r.id)<4);
 // Ear/neck evidence must agree with adjacent measured facial skin. Strongly
 // different colours are usually clothing/background or an occluding hand.
 if(main.length){const L=median(main.map(r=>r.lightness[1])),a=median(main.map(r=>r.chroma[0])),b=median(main.map(r=>r.chroma[1]));for(const r of c.regions.filter(r=>r.optional)){const m=measured.get(r.id);if(m&&(Math.abs(m.lightness[1]-L)>18||Math.hypot(m.chroma[0]-a,m.chroma[1]-b)>10)){measured.delete(r.id);report[r.id]={status:'unavailable',reason:'ambiguous-external-skin'}}}}
 return {measured,report,main:main.length};
}

/** Capture only after the accepted first AI makeup and its eye-tone guard. */
export function createFemaleFinishProfile(input={}){
 try{const c=context(input);if(!c)return null;const m=measure(c);if(m.main<2)return null;const value={version:1,kind:'female-finish',coordinate:'face-v1',scale:{faceWidth:round(c.fw),roughnessRadius:round(c.radius)},regions:[...m.measured.values()]};return isFemaleFinishProfile(value)?value:null}catch{return null}
}

/** Match measured native skin while retaining new hair pixels and geometry.
 * Invalid inputs and processing failures return the exact original buffer.
 */
export function matchFemaleFinishProfile(input={}){
 const original=input?.pixels,report={status:'unavailable',reason:'invalid-input',changedPixels:0,regions:{},textureChangedPixels:0,comparableRegions:0,beforeToneError:null,afterToneError:null,beforeChromaError:null,afterChromaError:null};
 const unchanged=()=>({pixels:original,changed:false,report});
 try{
  if(!isFemaleFinishProfile(input.profile)){report.reason='invalid-profile';return unchanged()}
  const c=context(input);if(!c)return unchanged();const m=measure(c);report.regions=m.report;
  if(m.main<2){report.reason='insufficient-skin-evidence';return unchanged()}
  const targets=new Map(input.profile.regions.map(r=>[r.id,r])),corrections=[],comparable=[];let active=0,grossDrift=0;
  for(const r of c.regions){
   const current=m.measured.get(r.id),target=targets.get(r.id),entry={...r,delta:[0,0,0],texture:0,current};
   if(current&&target){
    // Central quantiles must indicate a coherent change. A different cast
    // shadow or newly occluded patch is not reliable finish evidence.
    const shifts=target.lightness.map((v,j)=>v-current.lightness[j]),delta=median(shifts),coherent=Math.max(...shifts)-Math.min(...shifts)<4.5;
    if(!r.optional&&coherent){comparable.push(r.id);if(Math.abs(delta)>=20)grossDrift++}
    if(coherent&&Math.abs(delta)<20&&Math.hypot(target.chroma[0]-current.chroma[0],target.chroma[1]-current.chroma[1])<13){
     entry.delta=[Math.abs(delta)>.8?clamp(delta,-8,12):0,...target.chroma.map((v,j)=>Math.abs(v-current.chroma[j])>1?clamp(v-current.chroma[j],-4,4):0)];
     // Only low-contrast, moderate microtexture excess is safe to refine.
     // The broad dead band stops an already matched finish being polished
     // again. High residuals and individual dark marks remain native.
     const threshold=Math.max(target.roughness*1.6,target.roughness+.35),goal=Math.max(target.roughness*1.18,target.roughness+.16);
     if(current.roughness>threshold&&current.roughness<1.35&&target.roughness<1.0){const strength=clamp((current.roughness-goal)/current.roughness,0,.55);if(current.roughness*(1-strength)<=threshold*.95)entry.texture=strength}
    }
    const changing=entry.delta.some(v=>v!==0)||entry.texture>0;if(changing)active++;
    report.regions[r.id]={...report.regions[r.id],status:changing?'matching':'already-target',deltaLab:entry.delta,textureStrength:entry.texture};
   }
   // Rejected/hidden regions remain zero anchors. They cannot borrow a
   // correction from another visible cheek or an uncovered forehead later.
   corrections.push(entry);
  }
  report.comparableRegions=comparable.length;
  if(comparable.length<2){report.reason='insufficient-comparable-skin';return unchanged()}
  const errors=measured=>({tone:median(comparable.map(id=>Math.abs(targets.get(id).lightness[1]-measured.get(id).lightness[1]))),chroma:median(comparable.map(id=>Math.hypot(...targets.get(id).chroma.map((v,j)=>v-measured.get(id).chroma[j]))))});
  const before=errors(m.measured);report.beforeToneError=round(before.tone);report.beforeChromaError=round(before.chroma);report.afterToneError=report.beforeToneError;report.afterChromaError=report.beforeChromaError;
  report.status=active?'matched':grossDrift>=2?'limited':'already-target';report.reason=active?'native-skin-matched':grossDrift>=2?'coherent-drift-exceeds-safe-bound':'already-target';if(!active)return unchanged();
  const optional=corrections.filter(r=>r.optional&&r.current&&targets.has(r.id)),missing=corrections.filter(r=>!r.optional&&(!r.current||!targets.has(r.id)));
  const allPoints=c.oval.map(p=>c.world(p.x,p.y));for(const r of optional)for(const [dx,dy] of [[-r.rx,-r.ry],[-r.rx,r.ry],[r.rx,-r.ry],[r.rx,r.ry]])allPoints.push(c.world(r.x+dx,r.y+dy));
  const x0=clamp(Math.floor(Math.min(...allPoints.map(p=>p.x))),0,c.w),x1=clamp(Math.ceil(Math.max(...allPoints.map(p=>p.x))),0,c.w),y0=clamp(Math.floor(Math.min(...allPoints.map(p=>p.y))),0,c.h),y1=clamp(Math.ceil(Math.max(...allPoints.map(p=>p.y))),0,c.h);
  let out=null;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
   const i=y*c.w+x,k=i*4;if(!c.eligible(i))continue;const q=c.local({x:x+.5,y:y+.5}),inFace=inside(q.x,q.y,c.oval);let edge=inFace?smooth(distance(q.x,q.y,c.oval)/.045):0;
   if(!inFace){for(const r of optional){const d=Math.hypot((q.x-r.x)/r.rx,(q.y-r.y)/r.ry);if(d<1&&c.eligible(i,true))edge=Math.max(edge,smooth((1-d)/.24))}if(!edge)continue}
   let protection=c.protectedWeight(q.x,q.y);if(!protection)continue;
   // An unmeasurable or previously hidden region is not supplied by a cheek
   // next to it. Its core is exact native and the surrounding field feathers.
   for(const r of missing){const d=Math.hypot((q.x-r.x)/r.rx,(q.y-r.y)/r.ry);protection*=smooth((d-.82)/.30)}
   if(!protection)continue;
   let weight=0,dL=0,dA=0,dB=0,texture=0,baseL=0;
   // Normalize the continuous field even between sparse sample regions.
   // A support threshold here creates sharp unchanged jaw islands where two
   // small Gaussian tails meet; anatomical/segmentation feathers already
   // supply the actual skin boundary. Never truncate individual tails.
   for(const r of corrections){const d2=((q.x-r.x)/r.rx)**2+((q.y-r.y)/r.ry)**2,v=Math.exp(-d2*1.35);weight+=v;dL+=r.delta[0]*v;dA+=r.delta[1]*v;dB+=r.delta[2]*v;texture+=r.texture*v;baseL+=(r.current?.lightness[1]??0)*v}
   if(weight<1e-12)continue;dL/=weight;dA/=weight;dB/=weight;texture/=weight;baseL/=weight;
   if(Math.abs(dL)<.05&&Math.abs(dA)<.05&&Math.abs(dB)<.05&&texture<.01)continue;
   const old=lab(c.pixels[k],c.pixels[k+1],c.pixels[k+2]),L=old[0];if(L<Math.max(8,baseL-19)||L>=96)continue;
   // Moles, freckles and deep creases are not roughness. Preserve their native
   // RGB exactly whenever a strong local dark residual makes them ambiguous.
   const p={x:x+.5,y:y+.5},res=(texture>0||L<baseL-5)?c.residual(p,L):null;if(res!==null&&res< -2.8)continue;
   const cc=c.confidence(i),evidence=smooth((cc.skin-.90)/.075)*(1-smooth((cc.hair-.01)/.025));
   // The additive Lab field preserves 3-D shading. Speculars receive zero
   // lift, with a continuous shoulder instead of channel clipping.
   const highlights=1-smooth((L-Math.max(78,baseL+10))/Math.max(5,95-Math.max(78,baseL+10))),dark=smooth((L-Math.max(8,baseL-19))/8),blend=edge*protection*evidence*dark;
   let textureDelta=0;if(texture>0&&res!==null&&Math.abs(res)<2.3)textureDelta=clamp(-res*texture,-.75,.75)*highlights;
   const next=[L+(dL*highlights+textureDelta)*blend,old[1]+dA*highlights*blend,old[2]+dB*highlights*blend],color=safeRgb(old,next);if(!color)continue;
   const rounded=color.map(v=>clamp(Math.round(v),0,255));if(rounded.every((v,j)=>v===c.pixels[k+j]))continue;
   if(!out)out=new Uint8ClampedArray(c.pixels);for(let j=0;j<3;j++)out[k+j]=rounded[j];report.changedPixels++;if(Math.abs(textureDelta*blend)>.05)report.textureChangedPixels++;
  }
  if(out){
   const afterContext=context({...input,pixels:out}),after=afterContext?measure(afterContext):null;
   if(after&&comparable.every(id=>after.measured.has(id))){const e=errors(after.measured);report.afterToneError=round(e.tone);report.afterChromaError=round(e.chroma);if(report.afterToneError>4.5&&report.beforeToneError-report.afterToneError<2){report.status='limited';report.reason='coherent-drift-remains-outside-safe-bound'}}
   return {pixels:out,changed:true,report};
  }
  return unchanged();
 }catch{report.status='unavailable';report.reason='processing-unavailable';report.changedPixels=0;report.textureChangedPixels=0;return unchanged()}
}
