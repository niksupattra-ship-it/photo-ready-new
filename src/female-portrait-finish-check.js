// Pixel evidence for a female first-portrait result. This is deliberately not
// a makeup classifier: colour, shimmer and individual hairs cannot be proved
// reliably from RGB alone. It never changes pixels or infers complexion.
const BROWS=[
 {side:'left',top:[70,63,105,66,107],bottom:[46,53,52,65,55]},
 {side:'right',top:[336,296,334,293,300],bottom:[285,295,282,283,276]}
];
const EYES=[{upper:[33,160,159,158,133],brow:[46,53,52,65,55]},{upper:[362,385,386,387,263],brow:[285,295,282,283,276]}];
const LIPS=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const INNER_LIPS=[78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95];
const CHEEKS=[50,101,118,280,330,347];
const quantile=(a,q)=>{if(!a.length)return null;const s=[...a].sort((a,b)=>a-b);return s[Math.floor((s.length-1)*q)];};
const inside=(x,y,p)=>{let v=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i].y>y)!==(p[j].y>y)&&x<(p[j].x-p[i].x)*(y-p[i].y)/(p[j].y-p[i].y)+p[i].x)v=!v;return v;};

function context(input){
 const {pixels,width:w,height:h,face,skin,hair}=input||{};
 if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<=0||h<=0||!Number.isSafeInteger(w*h)||w*h>33554432)return null;
 if(!(pixels instanceof Uint8ClampedArray||pixels instanceof Uint8Array)||pixels.length!==w*h*4||!face)return null;
 if(!skin||skin.length!==w*h||hair&&hair.length!==w*h)return null;
 const ids=[234,454,...BROWS.flatMap(b=>[...b.top,...b.bottom]),...EYES.flatMap(b=>b.upper),...LIPS,...INNER_LIPS,...CHEEKS];
 if(ids.some(i=>!Number.isFinite(face[i]?.x)||!Number.isFinite(face[i]?.y)||face[i].x<0||face[i].x>1||face[i].y<0||face[i].y>1))return null;
 const fw=Math.hypot((face[454].x-face[234].x)*w,(face[454].y-face[234].y)*h);
 if(fw<64)return null;
 const point=id=>({x:face[id].x*w,y:face[id].y*h});
 const result={w,h,face,fw,point,invalidConfidence:false};
 const sample=(x,y,requireSkin=false)=>{
  x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=w||y>=h)return null;
  const i=y*w+x,k=i*4,skinValue=skin[i],hairValue=hair?hair[i]:0;
  // Validate only the sampled local evidence. A malformed confidence value
  // makes the audit uncertain; it must never look like missing eyebrow hair.
  if(!Number.isFinite(skinValue)||skinValue<0||skinValue>1||!Number.isFinite(hairValue)||hairValue<0||hairValue>1){result.invalidConfidence=true;return null;}
  if(pixels[k+3]<248||requireSkin&&skinValue<.5)return null;
  const r=pixels[k],g=pixels[k+1],b=pixels[k+2];
  return {luma:.2126*r+.7152*g+.0722*b,rose:(r-g)/(r+g+b+1),hair:hairValue};
 };
 result.sample=sample;return result;
}

function browEvidence(c,brow){
 const cells=[];
 for(let k=0;k<4;k++){
  const target=[],reference=[];let hairOcclusion=0;
  const a=c.point(brow.top[k]),b=c.point(brow.top[k+1]),d=c.point(brow.bottom[k]),e=c.point(brow.bottom[k+1]);
  for(let j=0;j<12;j++){
   const t=(j+.5)/12,tx=a.x*(1-t)+b.x*t,ty=a.y*(1-t)+b.y*t,bx=d.x*(1-t)+e.x*t,by=d.y*(1-t)+e.y*t;
   for(let n=0;n<8;n++){
    const q=(n+.5)/8,dx=bx-tx,dy=by-ty;
    const p=c.sample(tx+dx*q,ty+dy*q);if(p){target.push(p.luma);if(p.hair>.6)hairOcclusion++;}
    const r=c.sample(tx-dx*(.75+q),ty-dy*(.75+q),true);if(r)reference.push(r.luma);
   }
  }
  const skinLuma=quantile(reference,.5),spread=reference.length?quantile(reference,.85)-quantile(reference,.15):null;
  // Broad hair/eyelid shadows, low-alpha edges and unresolved dark regions
  // cannot establish an empty eyebrow. Leave those cells unmeasurable.
  const measurable=target.length>=86&&reference.length>=34&&hairOcclusion<target.length*.25&&skinLuma>=40&&skinLuma<=245&&spread<=Math.max(24,skinLuma*.28);
  const threshold=skinLuma===null?0:Math.max(3,skinLuma*.025);
  const coverage=measurable?target.filter(v=>skinLuma-v>threshold).length/target.length:null;
  cells.push({measurable,coverage,skinLuma,referenceSamples:reference.length,visibleSamples:target.length});
 }
 const valid=cells.filter(v=>v.measurable),measurable=valid.length>=2;
 const coverage=measurable?valid.reduce((sum,v)=>sum+v.coverage,0)/valid.length:null;
 const missing=measurable&&valid.every(v=>v.coverage<.035)&&coverage<.02;
 return {side:brow.side,measurable,missing,coverage,cells};
}

function pigmentEvidence(c){
 const cheeks=[];
 for(const ids of [[50,101,118],[280,330,347]])for(const id of ids){const p=c.point(id),s=c.sample(p.x,p.y,true);if(s)cheeks.push(s.rose);}
 const skinRose=quantile(cheeks,.5),eyes=[];
 for(const eye of EYES){
  const samples=[];
  // The mobile-lid strip stays above the lash roots and far below the brows.
  // Narrow/hooded lids naturally yield weak or unavailable colour evidence.
  for(let j=1;j<4;j++){
   const p=c.point(eye.upper[j]),q=c.point(eye.brow[j]);
   for(const t of [.13,.21,.29]){const s=c.sample(p.x+(q.x-p.x)*t,p.y+(q.y-p.y)*t,true);if(s)samples.push(s.rose);}
  }
  const rose=quantile(samples,.5);eyes.push({measurable:samples.length>=5&&skinRose!==null,relativeRose:rose!==null&&skinRose!==null?rose-skinRose:null});
 }
 const poly=LIPS.map(c.point),hole=INNER_LIPS.map(c.point),lip=[];
 const x0=Math.max(0,Math.floor(Math.min(...poly.map(p=>p.x)))),x1=Math.min(c.w-1,Math.ceil(Math.max(...poly.map(p=>p.x)))),y0=Math.max(0,Math.floor(Math.min(...poly.map(p=>p.y)))),y1=Math.min(c.h-1,Math.ceil(Math.max(...poly.map(p=>p.y))));
 const stepX=Math.max(1,Math.ceil((x1-x0)/60)),stepY=Math.max(1,Math.ceil((y1-y0)/32));
 for(let y=y0;y<=y1;y+=stepY)for(let x=x0;x<=x1;x+=stepX)if(inside(x+.5,y+.5,poly)&&!inside(x+.5,y+.5,hole)){const s=c.sample(x,y);if(s&&s.luma>25&&s.luma<245)lip.push(s.rose);}
 const lipRose=quantile(lip,.5),lips={measurable:lip.length>=20&&skinRose!==null,relativeRose:lipRose!==null&&skinRose!==null?lipRose-skinRose:null};
 return {lips,eyelids:eyes,advisoryOnly:true};
}

function observe(input){const c=context(input);if(!c)return null;const report={brows:BROWS.map(b=>browEvidence(c,b)),pigment:pigmentEvidence(c)};return c.invalidConfidence?null:report;}

export function auditFemalePortraitFinish(input){
 const evidence=observe(input);
 if(!evidence)return {ok:true,measurable:false,status:'unmeasurable',issues:[],report:{reason:'insufficient-face-evidence'}};
 const measurable=evidence.brows.every(b=>b.measurable),missing=evidence.brows.filter(b=>b.missing);
 // Reject only a clearly empty side supported by a complete opposite brow,
 // or bilateral empty brows. Light natural strands and uncertain/occluded
 // regions are never rejected merely for being faint.
 const clearOther=evidence.brows.some(b=>b.measurable&&!b.missing&&b.coverage>=.3);
 const incomplete=missing.length===2||missing.length===1&&clearOther;
 const issues=incomplete?missing.map(b=>`missing-${b.side}-brow-evidence`):[];
 return {ok:!incomplete,measurable,status:incomplete?'incomplete':measurable?'pass':'unmeasurable',issues,report:{...evidence,reason:incomplete?'clear-empty-brow-region':measurable?'visible-brow-evidence':'occluded-or-uncertain-brow-region'}};
}
