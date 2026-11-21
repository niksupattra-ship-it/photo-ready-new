// The government insignia placement guide only runs on completed Thai photos.
// Unlike the old gender-only preset, it measures the white jacket in the
// actual rendered result. A low-confidence scan must not invent coordinates.
export function isGovernmentUniform(template='',category=''){
 return category==='government'||/\/government-uniforms\//i.test(String(template));
}
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export function detectWhiteGovernmentJacket(image,{allowLowerEdgeWhite=false,allowNarrowJacket=false}={}){
 const width=image?.width,height=image?.height,data=image?.data;
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<160||height<200||!data||data.length<width*height*4)return null;
 const white=(x,y)=>{
  const k=(Math.floor(y)*width+Math.floor(x))*4;
  const r=data[k],g=data[k+1],b=data[k+2],a=data[k+3];
  return a>=170&&r>173&&g>173&&b>173&&Math.max(r,g,b)-Math.min(r,g,b)<41;
 };
 // A flat white backdrop cannot be distinguished from white fabric using
 // RGB alone; reject it instead of silently placing official insignia badly.
 let borderHits=0,borderTotal=0;
 for(let y=Math.floor(height*.55);y<height*.9;y+=Math.max(8,Math.floor(height/48))){
  for(const x of [Math.floor(width*.025),Math.floor(width*.975)]){
   borderTotal++;if(white(x,y))borderHits++;
  }
 }
 if(borderHits>borderTotal*.27){
  // Full-size government jackets legitimately reach the bottom corners of
  // the example photo. Only Easy Mode tolerates those lower white edges.
  // Still reject a flat white background with no separable jacket.
  if(!allowLowerEdgeWhite)return null;
  let upperWhite=0,upperTotal=0;
  for(let y=Math.floor(height*.16);y<height*.36;y+=Math.max(6,Math.floor(height/30))){
   for(const x of [Math.floor(width*.03),Math.floor(width*.10),Math.floor(width*.90),Math.floor(width*.97)]){
    upperTotal++;if(white(x,y))upperWhite++;
   }
  }
  if(upperWhite>upperTotal*.25)return null;
 }
 const rowY=[.65,.69,.73,.77,.81,.85].map(v=>Math.floor(height*v));
 const candidates=[];
 for(let x=Math.floor(width*.08);x<width*.92;x+=3){
  const hits=rowY.reduce((n,y)=>n+(white(x,y)?1:0),0);
  if(hits>=3)candidates.push(x);
 }
 if(candidates.length<width*.21/3)return null;
 const left=candidates[Math.floor(candidates.length*.055)],right=candidates[Math.floor(candidates.length*.945)];
 const span=right-left;
 if(span<width*(allowNarrowJacket?.31:.43)||span>width*.94||left<width*.025||right>width*.975)return null;
 // Find where the actual jacket starts at two shoulder-region columns.
 const findTop=(cx)=>{
  for(let y=Math.floor(height*.36);y<Math.floor(height*.70);y+=3){
   let hits=0;
   for(let dx=-9;dx<=9;dx+=6)for(let dy=0;dy<=6;dy+=3){
    const x=clamp(cx+dx,0,width-1),py=clamp(y+dy,0,height-1);
    if(white(x,py))hits++;
   }
   if(hits>=7)return y;
  }
  return null;
 };
 const topLeft=findTop(left+span*.22),topRight=findTop(right-span*.22);
 if(topLeft===null||topRight===null||Math.abs(topLeft-topRight)>height*.15)return null;
 const top=(topLeft+topRight)/2;
 const frame={
  x:clamp(left-width*.012,0,width*.4),
  y:clamp(top-height*.012,height*.29,height*.72),
  w:clamp(span+width*.024,width*(allowNarrowJacket?.31:.43),width*.95),
  h:height-clamp(top-height*.012,height*.29,height*.72)
 };
 if(frame.x+frame.w>width)frame.w=width-frame.x;
 const density=candidates.length*3/span;
 if(density<.38)return null;
 return {frame,confidence:'measured-white-jacket'};
}
export function governmentInsigniaPreset(frame,gender='female'){
 if(!frame||!Number.isFinite(frame.w)||frame.w<=0)throw Error('missing_government_frame');
 const female=gender==='female';
 return {
  collar:{left:female?.318:.418,right:female?.682:.582,y:.285,width:female?.077:.071},
  chest:{x:female?.26:.27,y:.52,width:.083},
  ribbon:{x:female?.77:.76,top:.51,width:.235}
 };
}

// Result-photo Easy Mode only. Keep the old Studio preset untouched.
// Based on the two supplied government-uniform portraits. The MALE standing
// collar badges sit near the button placket; FEMALE lapel badges sit on the
// outer lapels. Positions are fractions of the measured jacket frame, not
// arbitrary fixed 900x1200 canvas coordinates.
export function easyGovernmentCollarType(templatePath='',gender='female'){
 // Match the actual shirt / standing collar / lapel garment selected in the catalogue.
 const path=String(templatePath||'').toLowerCase();
 if(/(?:formal-tie-suit|navy-suit|open-collar-suit)/.test(path))return 'lapel';
 if(/(?:white-shirt)/.test(path))return 'shirt';
 return gender==='female'?'lapel':'stand';
}
export function easyGovernmentReferencePreset(frame,gender='female',templatePath=''){
 if(!frame||!Number.isFinite(frame.w)||frame.w<=0)throw Error('missing_government_frame');
 const type=easyGovernmentCollarType(templatePath,gender);
 const male=gender==='male';
 // Calibrated against the approved reference portrait, using the detected
 // jacket frame. Example female lapel: left (.265,.053), right (.742,.053),
 // chest (.149,.369) and ribbon centre (.845,.327). The ribbon is deliberately
 // NOT capped to the obsolete 19%-of-frame width.
 const collar=type==='stand'?{left:.435,right:.568,y:.052,width:.070}
  :type==='shirt'?{left:.367,right:.633,y:.073,width:.061}
  :{left:male?.307:.265,right:male?.693:.742,y:.053,width:male?.068:.073};
 return {
  collar,
  chest:male?{x:.226,y:.349,width:.083}:{x:.149,y:.369,width:.078},
  ribbon:male?{x:.781,top:.304,width:.260}:{x:.845,top:.327,width:.260}
 };
}
// If white-on-white clothing prevents garment segmentation, start from
// the exact reference's normalized photographed layout. Drag adjustment
// remains available. No new AI work or permanent outfit alterations.
export function easyGovernmentPhotoFallback(width=900,height=1200,gender='female',templatePath=''){
 const frame={x:0,y:0,w:width,h:height};
 const preset=gender==='male'
  ?{collar:{left:.448,right:.551,y:.551,width:.060},
    chest:{x:.286,y:.695,width:.070},
    ribbon:{x:.716,top:.672,width:.210}}
  :{collar:{left:.315,right:.687,y:.554,width:.055},
    chest:{x:.230,y:.701,width:.070},
    ribbon:{x:.765,top:.684,width:.205}};
 const type=easyGovernmentCollarType(templatePath,gender);
 if(type==='lapel'&&gender==='male')preset.collar={left:.325,right:.675,y:.554,width:.055};
 if(type==='shirt')preset.collar={left:.370,right:.630,y:.554,width:.052};
 // With no measured jacket, preserve the approval reference's natural
 // proportions rather than shrinking the ribbon to 12% and the pins to 3.8%.
 // These are still editable and always flagged for review.
 preset.collar.width=Math.min(preset.collar.width,.059);
 preset.chest.width=Math.min(preset.chest.width,.073);
 preset.ribbon.width=Math.min(preset.ribbon.width,.205);
 return {frame,preset,confidence:'photo-reference-fallback',needsReview:true};
}


// Easy Mode only: fit each emblem to the visible UPPER TORSO half-panel,
// not the broader lower-jacket bounding box. Studio presets remain unchanged.
// The genuine PNG is scaled uniformly by nativeAsset, never warped.
export function easyGovernmentFitBadgeSizes(image,frame,preset,gender='female',templatePath=''){
 const type=easyGovernmentCollarType(templatePath,gender);
 const fw=frame.w;
 const output={collar:{...preset.collar},chest:{...preset.chest},ribbon:{...preset.ribbon}};
 // Uniform artwork must remain proportionate to shoulder/chest anatomy.
 // Restrict overlapping male standing-collar pins by gap, NOT to a fraction
 // that makes both pins tiny; female lapel pins use the approved badge width.
 output.collar.width=Math.min(output.collar.width,
  type==='lapel'?.073:type==='shirt'?.061:.069,
  Math.max(.035,(output.collar.right-output.collar.left)*.48));
 const w=image?.width,h=image?.height,data=image?.data;
 const valid=Number.isFinite(w)&&Number.isFinite(h)&&w>=160&&h>=200&&data&&data.length>=w*h*4;
 const light=(x,y)=>{
  x=Math.round(x);y=Math.round(y);
  if(x<0||y<0||x>=w||y>=h)return false;
  const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
  return a>=170&&r>173&&g>173&&b>173&&Math.max(r,g,b)-Math.min(r,g,b)<41;
 };
 const lane=(side,yRatio)=>{
  // These are measured upper-front torso panels. The approved two-row
  // ribbon reaches near the outside edge of the right breast, not the centre.
  const geometric=side==='left'?{min:.075,max:.465}:{min:.525,max:.985};
  if(!valid)return {...geometric,measured:false};
  const lo=side==='left'?.025:.515,hi=side==='left'?.485:.995;
  const x0=Math.max(0,Math.round(frame.x+fw*lo));
  const x1=Math.min(w-1,Math.round(frame.x+fw*hi));
  const y=Math.round(frame.y+frame.h*yRatio),dy=Math.max(2,Math.round(h*.004));
  let best=null,run=null;
  const flush=()=>{
   if(!run)return;
   const length=run.end-run.start;
   if(length>=fw*.11&&(!best||length>best.end-best.start))best={...run};
   run=null;
  };
  for(let x=x0;x<=x1;x+=2){
   let hits=0;for(const py of [y-dy,y,y+dy])if(light(x,py))hits++;
   if(hits>=2){if(!run)run={start:x,end:x};else run.end=x}
   else flush();
  }
  flush();
  if(!best)return {...geometric,measured:false};
  const padding=Math.max(3,fw*.025);
  const min=(best.start+padding-frame.x)/fw,max=(best.end-padding-frame.x)/fw;
  if(max-min<.14)return {...geometric,measured:false};
  return {min:Math.max(geometric.min,min),max:Math.min(geometric.max,max),measured:true};
 };
 const left=lane('left',output.chest.y),right=lane('right',output.ribbon.top+.028);
 const bound=(item,slot,maximum,usable)=>{
  const available=Math.max(.09,slot.max-slot.min);
  const width=Math.max(.024,Math.min(item.width,maximum,available*usable));
  const min=slot.min+width/2,max=slot.max-width/2;
  // Keep the horizontal centre calibrated to the visible garment.
  // Change it only if a badge would actually cross an upper-chest boundary.
  return {...item,width,x:max>=min?clamp(item.x,min,max):(slot.min+slot.max)/2};
 };
 output.chest=bound(output.chest,left,.086,.32);
 output.ribbon=bound(output.ribbon,right,.276,.76);
 return {preset:output,needsReview:!left.measured||!right.measured,lanes:{left,right}};
}

// Result-photo Easy Mode only. Keep the old Studio preset untouched.
// Each candidate position is gently snapped to actual light jacket FABRIC in
// the finished canvas. Do not move the official artwork or stretch its pixels.
export function easyGovernmentInsigniaFit(image,gender='female',templatePath=''){
 const detected=detectWhiteGovernmentJacket(image,{allowLowerEdgeWhite:true,allowNarrowJacket:true});
 if(!detected)return null;
 const frame=detected.frame;
 const preset=easyGovernmentReferencePreset(frame,gender,templatePath);
 const {width,height,data}=image;
 const white=(x,y)=>{
  x=Math.round(x);y=Math.round(y);
  if(x<0||y<0||x>=width||y>=height)return false;
  const k=(y*width+x)*4,r=data[k],g=data[k+1],b=data[k+2],a=data[k+3];
  return a>=170&&r>173&&g>173&&b>173&&Math.max(r,g,b)-Math.min(r,g,b)<41;
 };
 const sampleRadius=Math.max(2,Math.min(5,Math.round(width*.004)));
 const support=(x,y)=>{
  let hits=0;
  for(const dx of [-sampleRadius,0,sampleRadius])for(const dy of [-sampleRadius,0,sampleRadius])
   if(white(x+dx,y+dy))hits++;
  return hits/9;
 };
 const choose=(ax,ay,side)=>{
  const ox=frame.x+frame.w*ax,oy=frame.y+frame.h*ay;
  // An existing correctly positioned badge stays exactly in place.
  if(support(ox,oy)>=.65)return {x:ax,y:ay};
  const rx=Math.min(width*.065,frame.w*.12),ry=Math.min(height*.05,frame.h*.12);
  const step=Math.max(2,Math.round(width/270));
  let best=null;
  for(let dy=-ry;dy<=ry;dy+=step)for(let dx=-rx;dx<=rx;dx+=step){
   if((dx/rx)**2+(dy/ry)**2>1)continue;
   const x=ox+dx,y=oy+dy;
   if(side==='left'&&x>frame.x+frame.w*.47)continue;
   if(side==='right'&&x<frame.x+frame.w*.53)continue;
   const ratio=support(x,y);
   if(ratio<.77)continue;
   const score=(dx/rx)**2+(dy/ry)**2+(1-ratio)*.12;
   if(!best||score<best.score)best={x,y,score};
  }
  if(!best)return {x:ax,y:ay};
  return {x:clamp((best.x-frame.x)/frame.w,.05,.95),
   y:clamp((best.y-frame.y)/frame.h,.05,.90)};
 };
 // Check the FULL collar-pin footprint, not only a bright centre pixel.
 // A pale lapel seam can pass under the pin while centre-only colour testing
 // still reports white. Prefer a nearby flat-fabric patch in that case.
 const clearCollar=(place,side)=>{
  if(easyGovernmentCollarType(templatePath,gender)==='stand')return place;
  const emblemWidth=frame.w*(gender==='female'?.069:.066);
  const sample=(px,py)=>{
   let ok=0,edges=0,total=0;
   const quarter=Math.max(3,emblemWidth*.29);
   for(const u of [-1,-.5,0,.5,1])for(const v of [-1,-.5,0,.5,1]){
    const x=Math.round(px+u*quarter),y=Math.round(py+v*quarter);
    if(x<5||y<5||x>=width-5||y>=height-5)continue;
    total++;
    if(white(x,y))ok++;
    const k=(y*width+x)*4,a=data[k]+data[k+1]+data[k+2];
    const h=(y*width+x+3)*4,b=data[h]+data[h+1]+data[h+2];
    const j=((y+3)*width+x)*4,c=data[j]+data[j+1]+data[j+2];
    if(Math.abs(a-b)>48||Math.abs(a-c)>48)edges++;
   }
   return total?{clean:ok/total,edge:edges/total}:{clean:0,edge:1};
  };
  const ox=frame.x+frame.w*place.x,oy=frame.y+frame.h*place.y;
  const initial=sample(ox,oy);
  if(initial.clean>=.91&&initial.edge<=.10)return place;
  const maxDx=frame.w*.055,maxDy=frame.h*.057;
  let best={x:place.x,y:place.y,score:(1-initial.clean)*4+initial.edge*3};
  for(let dx=-maxDx;dx<=maxDx;dx+=Math.max(3,frame.w*.009)){
   for(let dy=-maxDy;dy<=maxDy;dy+=Math.max(3,frame.h*.009)){
    const x=ox+dx,y=oy+dy;
    if(side==='left'&&(x-frame.x)/frame.w>.43)continue;
    if(side==='right'&&(x-frame.x)/frame.w<.57)continue;
    const quality=sample(x,y);
    if(quality.clean<.75)continue;
    const distance=(dx/maxDx)**2+(dy/maxDy)**2;
    const score=(1-quality.clean)*4+quality.edge*3+distance*.30;
    if(score<best.score-.015)best={x:(x-frame.x)/frame.w,y:(y-frame.y)/frame.h,score};
   }
  }
  return {x:clamp(best.x,.05,.95),y:clamp(best.y,.025,.24)};
 };
 const left=clearCollar(choose(preset.collar.left,preset.collar.y,'left'),'left');
 const right=clearCollar(choose(preset.collar.right,preset.collar.y,'right'),'right');
 const chest=choose(preset.chest.x,preset.chest.y,'left');
 // Ribbon placement is TOP-aligned in nativeAsset; sample near its top edge,
 // then compensate for the probe offset without altering original ribbon size.
 const ribbonProbe=.025;
 const ribbon=choose(preset.ribbon.x,preset.ribbon.top+ribbonProbe,'right');
 const refined={
  collar:{...preset.collar,left:left.x,right:right.x,y:clamp((left.y+right.y)/2,.05,.9)},
  chest:{...preset.chest,x:chest.x,y:chest.y},
  ribbon:{...preset.ribbon,x:ribbon.x,top:clamp(ribbon.y-ribbonProbe,.05,.90)}
 };
 const sized=easyGovernmentFitBadgeSizes(image,frame,refined,gender,templatePath);
 const bounded=sized.preset;
 const px=(x,y)=>support(frame.x+frame.w*x,frame.y+frame.h*y);
 // If at least one of the inferred garment anchors has no visible fabric,
 // do not describe the placement as certain.
 const needsReview=sized.needsReview||[px(bounded.collar.left,bounded.collar.y),
  px(bounded.collar.right,bounded.collar.y),
  px(bounded.chest.x,bounded.chest.y),
  px(bounded.ribbon.x,bounded.ribbon.top+ribbonProbe)].some(score=>score<.45);
 return {frame,preset:bounded,confidence:needsReview?'manual-review':detected.confidence,
  needsReview,collarType:easyGovernmentCollarType(templatePath,gender)};
}

// A composited PNG uniform has its own stable geometry. Never infer its
// anchors by scanning the AI face/portrait, whose jacket may be differently
// cropped or may include an unrelated background. The native insignia layer
// shares the suit's scene transform (x/y/scale/rotation).
// These initial per-collar profiles are intentionally flagged for review until
// each source template is approved against an actual reference image.
export function governmentPngTemplatePlacement(suit,gender='female'){
 const path=String(suit?.templatePath||'');
 if(!isGovernmentUniform(path)||!suit?.visible||suit?.warpSource||suit?.suitPreviewOnly)return null;
 const frame=suit.collarFrame||suit.sourceFrame;
 if(!frame||![frame.x,frame.y,frame.w,frame.h].every(Number.isFinite)||frame.w<=0||frame.h<=0)return null;
 const type=easyGovernmentCollarType(path,gender);
 const preset=easyGovernmentReferencePreset(frame,gender,path);
 // The template coordinate system is independent of the photo's pixels.
 // A collar pair is left/right symmetric only for standing collars.
 if(type==='stand'){
  preset.collar.left=.435;preset.collar.right=.565;
  preset.collar.y=.075;preset.collar.width=.062;
 }else if(type==='lapel'){
  preset.collar.left=gender==='female'?.265:.307;
  preset.collar.right=gender==='female'?.742:.693;
  preset.collar.y=.105;preset.collar.width=.067;
 }
 // Keep badge footprints inside both respective torso panels.
 preset.chest.x=Math.max(.12,Math.min(.36,preset.chest.x));
 preset.ribbon.x=Math.min(.84,Math.max(.68,preset.ribbon.x));
 preset.ribbon.width=Math.min(preset.ribbon.width,2*(.98-preset.ribbon.x));
 return {frame:{...frame},preset,confidence:'png-template-anchor',
  needsReview:true,collarType:type,templatePath:path};
}

// Correct the opposite-sized accessories in finished Thai government results.
// The source PNGs retain their own artwork; this affects ONLY separately
// selected insignia overlays, never bakes/stretchs the underlying uniform.
export function balanceEasyGovernmentBadgeSizes(fit){
 if(!fit?.frame||!fit?.preset)return fit;
 const p=fit.preset;
 const collar={...p.collar,width:clamp(p.collar.width*.67,.031,.050)};
 const chest={...p.chest,width:clamp(p.chest.width*1.45,.092,.116)};
 const ribbon={...p.ribbon,width:clamp(p.ribbon.width*1.47,.285,.335)};
 // Keep each FULL badge footprint on its own half of the chest. Width
 // remains uniform; no nonuniform scaling of the official source PNG.
 chest.x=clamp(chest.x,.07+chest.width/2,.46-chest.width/2);
 ribbon.x=clamp(ribbon.x,.53+ribbon.width/2,.985-ribbon.width/2);
 return {...fit,preset:{...p,collar,chest,ribbon},needsReview:true};
}
