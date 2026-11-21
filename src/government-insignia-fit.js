// The government insignia placement guide only runs on completed Thai photos.
// Unlike the old gender-only preset, it measures the white jacket in the
// actual rendered result. A low-confidence scan must not invent coordinates.
export function isGovernmentUniform(template='',category=''){
 return category==='government'||/\/government-uniforms\//i.test(String(template));
}
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export function detectWhiteGovernmentJacket(image,{allowLowerEdgeWhite=false}={}){
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
 if(span<width*.43||span>width*.94||left<width*.025||right>width*.975)return null;
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
  w:clamp(span+width*.024,width*.43,width*.95),
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
export function easyGovernmentReferencePreset(frame,gender='female'){
 if(!frame||!Number.isFinite(frame.w)||frame.w<=0)throw Error('missing_government_frame');
 return gender==='male'
  ?{collar:{left:.435,right:.568,y:.045,width:.078},
    chest:{x:.226,y:.349,width:.090},
    ribbon:{x:.781,top:.304,width:.271}}
  :{collar:{left:.263,right:.744,y:.045,width:.071},
    chest:{x:.153,y:.360,width:.090},
    ribbon:{x:.845,top:.323,width:.265}};
}
// If white-on-white clothing prevents garment segmentation, start from
// the exact reference's normalized photographed layout. Drag adjustment
// remains available. No new AI work or permanent outfit alterations.
export function easyGovernmentPhotoFallback(width=900,height=1200,gender='female'){
 const frame={x:0,y:0,w:width,h:height};
 const preset=gender==='male'
  ?{collar:{left:.448,right:.551,y:.551,width:.060},
    chest:{x:.286,y:.695,width:.070},
    ribbon:{x:.716,top:.672,width:.210}}
  :{collar:{left:.315,right:.687,y:.554,width:.055},
    chest:{x:.230,y:.701,width:.070},
    ribbon:{x:.765,top:.684,width:.205}};
 return {frame,preset,confidence:'photo-reference-fallback'};
}

// Result-photo Easy Mode only. Keep the old Studio preset untouched.
// Each candidate position is gently snapped to actual light jacket FABRIC in
// the finished canvas. Do not move the official artwork or stretch its pixels.
export function easyGovernmentInsigniaFit(image,gender='female'){
 const detected=detectWhiteGovernmentJacket(image,{allowLowerEdgeWhite:true});
 if(!detected)return null;
 const frame=detected.frame;
 const preset=easyGovernmentReferencePreset(frame,gender);
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
 const left=choose(preset.collar.left,preset.collar.y,'left');
 const right=choose(preset.collar.right,preset.collar.y,'right');
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
 return {frame,preset:refined,confidence:detected.confidence};
}
