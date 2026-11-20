// The government insignia placement guide only runs on completed Thai photos.
// Unlike the old gender-only preset, it measures the white jacket in the
// actual rendered result. A low-confidence scan must not invent coordinates.
export function isGovernmentUniform(template='',category=''){
 return category==='government'||/\/government-uniforms\//i.test(String(template));
}
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export function detectWhiteGovernmentJacket(image){
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
 if(borderHits>borderTotal*.27)return null;
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
