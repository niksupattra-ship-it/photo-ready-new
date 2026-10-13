// Male-only, coherent sideburn fit. Read the portrait to locate the attachment;
// move existing PNG pixels only. No eraser, skin fill or whole-hair squeeze.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>{const t=clamp(x,0,1);return t*t*(3-2*t)};
const median=values=>{values.sort((a,b)=>a-b);return values[Math.floor(values.length/2)]};
function frame(face,w,h){
 if([33,263,10,127,356,234,454].some(id=>!face?.[id]||![face[id].x,face[id].y].every(Number.isFinite)))return null;
 const dx=(face[263].x-face[33].x)*w,dy=(face[263].y-face[33].y)*h,eye=Math.hypot(dx,dy);
 if(eye<8)return null;
 const c=dx/eye,s=dy/eye,cx=(face[33].x+face[263].x)*w/2,cy=(face[33].y+face[263].y)*h/2;
 const local=(x,y)=>({u:(x-cx)*c+(y-cy)*s,v:-(x-cx)*s+(y-cy)*c}),world=(u,v)=>({x:cx+u*c-v*s,y:cy+u*s+v*c}),p=id=>local(face[id].x*w,face[id].y*h);
 const width=Math.abs(p(454).u-p(234).u);
 if(width<eye||width>eye*2.5)return null;
 return {local,world,p,eye,width};
}
function pixel(pixels,w,h,p){
 const x=Math.round(p.x),y=Math.round(p.y);
 return x>=0&&x<w&&y>=0&&y<h?pixels.subarray((y*w+x)*4,(y*w+x)*4+4):null;
}
function skinReference(pixels,w,h,f){
 const samples=[[],[],[]];
 for(let v=.2;v<=.7;v+=.08)for(let u=-.25;u<=.25;u+=.08){const p=pixel(pixels,w,h,f.world(u*f.eye,v*f.eye));if(!p||p[3]<200)continue;for(let k=0;k<3;k++)samples[k].push(p[k])}
 if(samples[0].length<12)return null;
 const colour=samples.map(median),luma=colour.reduce((a,b)=>a+b,0)/3;
 return {colour,luma,match:p=>p&&p[3]>=200&&(p[0]+p[1]+p[2])/3>=luma*.62&&colour.reduce((sum,v,k)=>sum+Math.abs(v-p[k]),0)<=Math.max(24,luma*.60)};
}
function contour(f,face,sign,w,h){
 const ids=sign<0?[21,162,127,234,93]:[251,389,356,454,323];
 const points=ids.filter(id=>face[id]&&[face[id].x,face[id].y].every(Number.isFinite)).map(id=>f.local(face[id].x*w,face[id].y*h)).filter(p=>sign*p.u>f.eye*.5).sort((a,b)=>a.v-b.v);
 return v=>{
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(v>=a.v&&v<=b.v&&b.v-a.v>.1){const t=(v-a.v)/(b.v-a.v);return sign*(a.u+(b.u-a.u)*t)}}
  const temple=f.p(sign<0?127:356);return Math.abs(v-temple.v)<=f.eye*.4?sign*temple.u:null;
 };
}
// Infer each template's actual root/edge/tip from native PNG material within
// the reference temple band. Alpha alone would mistake retained face skin for
// a sideburn. The reference is positioning evidence, never pasted into output.
export function createMaleSideburnGuide(native,sw,sh,reference,rw,rh,face,matrix,pins=null,referenceLabels=null){
 const f=frame(Array.from(face||[],p=>p?{...p}:p),rw,rh);
 if(!f||native?.length!==sw*sh*4||reference?.length!==rw*rh*4||matrix?.length!==6||!matrix.every(Number.isFinite))return null;
 const [a,b,c,d,e,g]=matrix,det=a*d-b*c;if(det<=0)return null;
 const skin=skinReference(reference,rw,rh,f);if(!skin)return null;
 const anatomy=[21,162,127,234,93,251,389,356,454,323].flatMap(id=>face[id]?[{id,...f.p(id)}]:[]);
 if(pins&&pins.sourceSize?.[0]===sw&&pins.sourceSize?.[1]===sh){
  const map=p=>({x:a*p[0]+c*p[1]+e,y:b*p[0]+d*p[1]+g});
  const sides=pins.sides.map(side=>({sign:side.sign,rows:side.curve.map(row=>{const point=map(row.inner),outerPoint=map(row.outer),q=f.local(point.x,point.y);return {point,outerPoint,ref:{r:side.sign*q.u,v:q.v}}})}));
  return {sides,eye:f.eye,width:f.width,anatomy,reference,referenceWidth:rw,referenceHeight:rh,referenceLabels,referenceFrame:f};
 }
 const nativeAt=p=>pixel(native,sw,sh,{x:(d*(p.x-e)-c*(p.y-g))/det,y:(a*(p.y-g)-b*(p.x-e))/det});
 const hair=p=>{const n=nativeAt(p),r=pixel(reference,rw,rh,p);return n&&r&&n[3]>=96&&(n[0]+n[1]+n[2])/3<skin.luma*.60&&(r[0]+r[1]+r[2])/3<skin.luma*.65&&Math.max(n[0],n[1],n[2])-Math.min(n[0],n[1],n[2])<90};
 const sides=[-1,1].map(sign=>{
  const temple=f.p(sign<0?127:356),root=Math.max(f.p(10).v+f.eye*.20,temple.v-f.eye*.28),bottom=temple.v+f.eye*.45,edgeAt=contour(f,face,sign,rw,rh),rows=[];
  const step=Math.max(1,f.eye/96),run=Math.max(2,f.eye*.018);
  for(let v=root;v<=bottom;v+=step){
   const expected=edgeAt(v);if(expected===null)continue;
   let inner=null,outer=null,start=null;
   for(let r=Math.max(f.width*.32,expected-f.eye*.18);r<=expected+f.eye*.22;r+=step){
    if(hair(f.world(sign*r,v))){if(start===null)start=r;if(r-start>=run){if(inner===null)inner=start;outer=r}}
    else if(inner!==null)break;else start=null;
   }
   if(inner!==null&&outer-inner>=run)rows.push({v,inner:inner-step*.5,outer:outer+step*.5});
  }
  if(rows.length<5||rows.at(-1).v-rows[0].v<f.eye*.08)return null;
  let jump=0;for(let i=1;i<rows.length;i++)if(Math.abs(rows[i].inner-rows[i-1].inner)>f.eye*.14||rows[i].v-rows[i-1].v>step*3)jump++;
  if(jump>1)return null;
  return {sign,root:rows[0].v,tip:rows.at(-1).v,rows:rows.map(row=>({...row,point:f.world(sign*row.inner,row.v),outerPoint:f.world(sign*row.outer,row.v)}))};
 });
 return {sides,eye:f.eye,width:f.width,anatomy,reference,referenceWidth:rw,referenceHeight:rh,referenceLabels,referenceFrame:f};
}
function sample(input,w,h,x,y){
 const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;let alpha=0,r=0,g=0,b=0;
 for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){const px=ix+xx,py=iy+yy;if(px<0||px>=w||py<0||py>=h)continue;const j=(py*w+px)*4,part=input[j+3]*(xx?fx:1-fx)*(yy?fy:1-fy);alpha+=part;r+=input[j]*part;g+=input[j+1]*part;b+=input[j+2]*part}
 return [alpha?r/alpha:0,alpha?g/alpha:0,alpha?b/alpha:0,alpha];
}
function labelAt(labels,w,h,p){const x=Math.floor(p.x*labels.width/w),y=Math.floor(p.y*labels.height/h);return x>=0&&x<labels.width&&y>=0&&y<labels.height?labels.data[y*labels.width+x]:0}
function validLabels(labels){return labels?.data instanceof Uint8Array&&labels.width>0&&labels.height>0&&labels.data.length===labels.width*labels.height}
function skinEdgeRow(pixels,w,h,f,expected,v,sign,labels){
 if(!validLabels(labels))return null;
 let edge=null,run=0;const step=Math.max(.75,f.eye/192),finish=expected+f.eye*.09;
 for(let r=Math.max(f.width*.25,expected-f.eye*.30);r<=finish;r+=step){const p=f.world(sign*r,v),rgba=pixel(pixels,w,h,p),cat=labelAt(labels,w,h,p);
  if(rgba?.[3]>=180&&(cat===2||cat===3)){run++;if(run>=2)edge=r}
  else if(edge!==null)break;else run=0;
 }
 return edge!==null&&edge<finish-step?edge:null;
}
function skinEdge(pixels,w,h,f,expected,v,sign,labels){
 if(!validLabels(labels))return null;
 // A small weighted band suppresses single-row spikes and alternating
 // segmentation steps; an odd-row median would keep one phase of that noise.
 const step=Math.max(1,Math.min(f.eye*.01,Math.max(w/labels.width,h/labels.height))),edges=[];
 for(const [offset,weight] of [[-2,1],[-1,2],[0,2],[1,2],[2,1]]){const edge=skinEdgeRow(pixels,w,h,f,expected,v+offset*step,sign,labels);if(edge!==null)edges.push({edge,weight})}
 if(edges.length<3||Math.max(...edges.map(p=>p.edge))-Math.min(...edges.map(p=>p.edge))>Math.max(3,f.eye*.12))return null;
 return edges.reduce((sum,p)=>sum+p.edge*p.weight,0)/edges.reduce((sum,p)=>sum+p.weight,0);
}
const curveCache=new WeakMap();
function curveTangents(rows,key){
 let curves=curveCache.get(rows);if(!curves){curves=new Map();curveCache.set(rows,curves)}if(curves.has(key))return curves.get(key);
 const tangent=new Float64Array(rows.length),h=[],slope=[];
 for(let i=1;i<rows.length;i++){h.push(rows[i].v-rows[i-1].v);slope.push((rows[i][key]-rows[i-1][key])/h.at(-1))}
 // Flat endpoints join the constant field outside the pins without a kink.
 // Interior harmonic tangents keep every segment within its observed range.
 for(let i=1;i<rows.length-1;i++)if(slope[i-1]*slope[i]>0){const a=2*h[i]+h[i-1],b=h[i]+2*h[i-1];tangent[i]=(a+b)/(a/slope[i-1]+b/slope[i])}
 curves.set(key,tangent);return tangent;
}
function interpolate(rows,v,key){
 if(v<=rows[0].v)return rows[0][key];if(v>=rows.at(-1).v)return rows.at(-1)[key];
 let i=0;while(i+1<rows.length&&rows[i+1].v<v)i++;
 const a=rows[i],b=rows[i+1],h=b.v-a.v,t=(v-a.v)/h,m=curveTangents(rows,key),t2=t*t,t3=t2*t;
 const value=(2*t3-3*t2+1)*a[key]+(t3-2*t2+t)*h*m[i]+(-2*t3+3*t2)*b[key]+(t3-t2)*h*m[i+1];
 return clamp(value,Math.min(a[key],b[key]),Math.max(a[key],b[key]));
}
function mapHeight(anatomy,face,f,sign,value){
 const ids=sign<0?[21,162,127,234,93]:[251,389,356,454,323];
 const pairs=ids.flatMap(id=>{const src=anatomy.find(p=>p.id===id);return src&&face[id]?[{v:src.v,target:f.p(id).v}]:[]}).sort((a,b)=>a.v-b.v);
 if(pairs.length<2)return null;
 let i=0;while(i+1<pairs.length-1&&pairs[i+1].v<value)i++;
 const a=pairs[i],b=pairs[i+1],ratio=(b.target-a.target)/(b.v-a.v);if(!Number.isFinite(ratio)||ratio<=0)return null;
 return a.target+(value-a.v)*ratio;
}
// One rotation/translation and a small uniform scale for the COMPLETE strand.
// Never follow each noisy skin-boundary row with a separate bend.
export function fitSideburnSimilarity(rows){
 if(!rows||rows.length<3)return null;
 let sr=0,sv=0,tr=0,tv=0;
 for(const p of rows){if(![p.sourceR,p.sourceV,p.r,p.v].every(Number.isFinite))return null;sr+=p.sourceR;sv+=p.sourceV;tr+=p.r;tv+=p.v}
 sr/=rows.length;sv/=rows.length;tr/=rows.length;tv/=rows.length;
 let dot=0,cross=0,variance=0;
 for(const p of rows){const x=p.sourceR-sr,y=p.sourceV-sv,u=p.r-tr,z=p.v-tv;dot+=x*u+y*z;cross+=x*z-y*u;variance+=x*x+y*y}
 if(variance<1)return null;
 const angle=clamp(Math.atan2(cross,dot),-Math.PI/18,Math.PI/18),scale=clamp(Math.hypot(dot,cross)/variance,.92,1.08);
 const a=scale*Math.cos(angle),b=scale*Math.sin(angle),tx=tr-a*sr+b*sv,ty=tv-b*sr-a*sv;
 const error=Math.sqrt(rows.reduce((n,p)=>n+(a*p.sourceR-b*p.sourceV+tx-p.r)**2+(b*p.sourceR+a*p.sourceV+ty-p.v)**2,0)/rows.length);
 return {a,b,tx,ty,error};
}
function inverse(profile,r,v){
 if(v<=profile.top||v>=profile.bottom||r<=profile.minR||r>=profile.maxR)return {r,v};
 const inner=interpolate(profile.rows,v,'r'),outer=interpolate(profile.rows,v,'outer'),dr=interpolate(profile.rows,v,'dr'),dv=interpolate(profile.rows,v,'dv');
 const left=inner-profile.padding,right=outer+profile.padding;if(r<=left||r>=right)return {r,v};
 const radial=r<inner?smooth((r-left)/profile.padding):r>outer?smooth((right-r)/profile.padding):1;
 const vertical=smooth((v-profile.top)/(profile.rows[0].v-profile.top))*smooth((profile.bottom-v)/(profile.bottom-profile.rows.at(-1).v));
 // The real protected centre boundary must be pinned too; clipping a
 // nonzero displacement there creates the sharp join beside the ear.
 const centre=r<profile.pinInner?smooth((r-profile.minR)/(profile.pinInner-profile.minR)):1;
 const outside=r>profile.pinOuter?smooth((profile.maxR-r)/(profile.maxR-profile.pinOuter)):1;
 const weight=radial*vertical*centre*outside;
 if(profile.similarity){
  const {a,b,tx,ty}=profile.similarity,den=a*a+b*b,x=r-tx,y=v-ty;
  const sourceR=(a*x+b*y)/den,sourceV=(-b*x+a*y)/den;
  return {r:r+(sourceR-r)*weight,v:v+(sourceV-v)*weight};
 }
 return {r:r-dr*weight,v:v-dv*weight};
}
function sampleWarp(original,w,h,f,sign,profile,x,y,sourcePoint,displacement){
 let alpha=0,r=0,g=0,b=0;
 // Subpixel coverage follows the bent edge, rather than blurring or erasing
 // the finished PNG. Premultiplication protects transparent edge colours.
 for(const dy of [-.25,.25])for(const dx of [-.25,.25]){const q=f.local(x+dx,y+dy),p=inverse(profile,sign*q.u,q.v),world=f.world(sign*p.r,p.v),rgba=sample(original,w,h,world.x,world.y);alpha+=rgba[3];r+=rgba[0]*rgba[3];g+=rgba[1]*rgba[3];b+=rgba[2]*rgba[3]}
 // Filtering fades with the deformation, so even the subpixel coverage has
 // no seam where the local cage joins the untouched PNG.
 const centre=f.world(sign*sourcePoint.r,sourcePoint.v),base=sample(original,w,h,centre.x,centre.y),weight=smooth(displacement/.75),a=alpha/4*weight,baseAlpha=base[3]*(1-weight),total=a+baseAlpha;
 return [total?(r/4*weight+base[0]*baseAlpha)/total:0,total?(g/4*weight+base[1]*baseAlpha)/total:0,total?(b/4*weight+base[2]*baseAlpha)/total:0,total];
}
function pointError(pixels,w,h,f,sign,target,colour){
 let best=Infinity;
 for(let dy=-3;dy<=3;dy+=.5)for(let dx=-3;dx<=3;dx+=.5){const p=pixel(pixels,w,h,f.world(sign*(target.r+dx),target.v+dy));if(!p||p[3]<96||p[0]+p[1]+p[2]>colour.luma*2)continue;best=Math.min(best,Math.hypot(dx,dy))}
 return best;
}
// Whole-strand similarity within a broad smooth transition: correspondence follows the reference temple
// and cheek landmarks, then the actual photographed hair/skin boundary. No
// portrait pixel is written. The crown and the middle forehead remain pinned.
export function fitMaleSideburns(original,portrait,w,h,face,labels,guide,matrix){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||original?.length!==w*h*4||portrait?.length!==w*h*4)throw Error('พิกเซลจอนผมไม่ตรงกับภาพ');
 const out=new Uint8ClampedArray(original),f=frame(face,w,h),colour=f&&skinReference(portrait,w,h,f),report={adjusted:false,sides:[],unavailable:false};
 const fail=()=>{report.unavailable=true;return {pixels:out,report}};
 if(!f||!colour||!validLabels(labels)||!guide?.sides||!guide.anatomy||!matrix||!['a','b','c','d','e','f'].every(k=>Number.isFinite(matrix[k])))return fail();
 const scale=Math.hypot(matrix.a,matrix.b);if(scale<=0||matrix.a*matrix.d-matrix.b*matrix.c<=0||Math.abs(matrix.a*matrix.c+matrix.b*matrix.d)>1e-5||Math.abs(scale-Math.hypot(matrix.c,matrix.d))>1e-5)return fail();
 // Segmentation, not a colour threshold, establishes that this is a face.
 if(!labels.data.some(cat=>cat===2||cat===3))return fail();
 const apply=p=>({x:matrix.a*p.x+matrix.c*p.y+matrix.e,y:matrix.b*p.x+matrix.d*p.y+matrix.f});
 for(let index=0;index<2;index++){
  const sign=index?1:-1,source=guide.sides[index],side={sign,adjusted:false,reason:null,before:null,after:null,pins:[]};report.sides.push(side);
  if(!source?.rows?.length){side.reason='template-unclear';continue}
  const targetContour=contour(f,face,sign,w,h),rf=guide.referenceFrame,rows=[];
  for(const [sourceIndex,item] of source.rows.entries()){
   const base=apply(item.point),bp=f.local(base.x,base.y),op=apply(item.outerPoint),outer=f.local(op.x,op.y),ref=item.ref||{r:sign*rf.local(item.point.x,item.point.y).u,v:rf.local(item.point.x,item.point.y).v};
   const targetV=mapHeight(guide.anatomy,face,f,sign,ref.v);if(targetV===null)continue;
   const expected=targetContour(targetV);if(expected===null)continue;
   const referenceContour=contour(rf,Object.fromEntries(guide.anatomy.map(p=>{const point=rf.world(p.u,p.v);return [p.id,{x:point.x/guide.referenceWidth,y:point.y/guide.referenceHeight}]})),sign,guide.referenceWidth,guide.referenceHeight);
   const refExpected=referenceContour(ref.v);if(refExpected===null)continue;
   const refEdge=skinEdge(guide.reference,guide.referenceWidth,guide.referenceHeight,rf,refExpected,ref.v,sign,guide.referenceLabels);
   const edge=skinEdge(portrait,w,h,f,expected,targetV,sign,labels);
   // The photographed boundary refines the anatomical correspondence. When
   // an ear shares a skin region with the face, use the landmark curve rather
   // than following skin out over that ear.
   const r=edge!==null?(edge+(ref.r-(refEdge??ref.r))*f.eye/guide.eye):expected+(ref.r-refExpected)*f.eye/guide.eye;
   const dr=r-sign*bp.u,dv=targetV-bp.v;
   if(Math.hypot(dr,dv)>f.eye*.42)continue;
   let evidence=0;for(const delta of [-.12,-.08,-.04]){const p=f.world(sign*(expected+f.eye*delta),targetV),rgba=pixel(portrait,w,h,p),cat=labelAt(labels,w,h,p);if(rgba?.[3]>=180&&[1,2,3].includes(cat))evidence++}
   if(!evidence)continue;
   const materialWidth=sign*(outer.u-bp.u);
   rows.push({sourceIndex,v:targetV,r,outer:r+Math.max(2,materialWidth),materialWidth,dr,dv,sourceV:bp.v,sourceR:sign*bp.u});
  }
  if(rows.length<3||rows.length<source.rows.length*.7||rows[0].sourceIndex!==0||rows.at(-1).sourceIndex!==source.rows.length-1){side.reason='attachment-unclear';continue}
  rows.sort((a,b)=>a.v-b.v);
  if(rows.some((r,i)=>i&&(r.sourceV<=rows[i-1].sourceV||r.v<=rows[i-1].v))){side.reason='unordered-pins';continue}
  // Move the full root/middle/tip coherently. The previous pinned-root
  // branch forced a long displacement into the narrow tip and kinked it.
  const similarity=fitSideburnSimilarity(rows);
  if(!similarity||similarity.error>Math.max(2,f.eye*.07)){side.reason='coherent-fit-unclear';continue}
  side.mode='whole-sideburn-similarity';side.fitError=similarity.error;side.similarity={...similarity};
  for(const row of rows){
   row.r=similarity.a*row.sourceR-similarity.b*row.sourceV+similarity.tx;
   row.v=similarity.b*row.sourceR+similarity.a*row.sourceV+similarity.ty;
   row.outer=row.r+Math.max(2,similarity.a*row.materialWidth);
   row.dr=row.r-row.sourceR;row.dv=row.v-row.sourceV;
  }
  if(rows.some((r,i)=>i&&r.v<=rows[i-1].v)){side.reason='unordered-pins';continue}
  const pins=[rows[0],rows[Math.floor(rows.length/2)],rows.at(-1)];side.before=pins.reduce((n,p)=>n+Math.hypot(p.dr,p.dv),0)/pins.length;
  side.pins=pins.map(p=>({source:{r:p.sourceR,v:p.sourceV},target:{r:p.r,v:p.v}}));
  if(side.before<Math.max(1.5,f.eye*.015)){side.after=side.before;side.reason='already-aligned';continue}
  let accepted=false;
  for(const expand of [1,1.5,2]){
   const maximum=Math.max(...rows.map(p=>Math.hypot(p.dr,p.dv))),padding=Math.max(f.eye*.16,maximum*3.5)*expand,verticalPadding=Math.max(f.eye*.08,...rows.map(p=>Math.abs(p.dv)*3.5))*expand;
   const profile={rows,padding,similarity,top:Math.min(rows[0].v,rows[0].sourceV)-verticalPadding,bottom:Math.max(rows.at(-1).v,rows.at(-1).sourceV)+verticalPadding};
   // Pin everything at and above the forehead, including the top silhouette.
   profile.top=Math.max(profile.top,f.p(10).v+f.eye*.08);
   if(profile.top>=rows[0].v||profile.bottom<=rows.at(-1).v)continue;
   const minR=Math.max(f.width*.34,Math.min(...rows.map(p=>p.r))-padding),maxR=Math.max(...rows.map(p=>p.outer))+padding;
   Object.assign(profile,{minR,maxR,pinInner:Math.min(...rows.map(p=>p.r)),pinOuter:Math.max(...rows.map(p=>p.outer))});
   if(profile.pinInner<=minR||profile.pinOuter>=maxR)continue;
   const corners=[f.world(sign*minR,profile.top),f.world(sign*maxR,profile.top),f.world(sign*minR,profile.bottom),f.world(sign*maxR,profile.bottom)];
   const x0=clamp(Math.floor(Math.min(...corners.map(p=>p.x)))-2,0,w-1),x1=clamp(Math.ceil(Math.max(...corners.map(p=>p.x)))+2,0,w-1),y0=clamp(Math.floor(Math.min(...corners.map(p=>p.y)))-2,0,h-1),y1=clamp(Math.ceil(Math.max(...corners.map(p=>p.y)))+2,0,h-1);
   let safe=true;
   for(let v=profile.top;v<profile.bottom&&safe;v+=2)for(let r=minR;r<maxR;r+=2){const a=inverse(profile,r,v),b=inverse(profile,r+1,v),c=inverse(profile,r,v+1),det=(b.r-a.r)*(c.v-a.v)-(b.v-a.v)*(c.r-a.r);if(det<.35||det>2.8){safe=false;break}}
   if(!safe)continue;
   const trial=new Uint8ClampedArray(out);
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const q=f.local(x,y),r=sign*q.u;if(r<minR||r>maxR)continue;const p=inverse(profile,r,q.v),displacement=Math.hypot(p.r-r,p.v-q.v);if(displacement<.001)continue;trial.set(sampleWarp(original,w,h,f,sign,profile,x,y,p,displacement),(y*w+x)*4)}
   // Validate ROOT / MIDDLE / TIP in two dimensions, including inverse pin
   // correspondence. A successful horizontal edge alone is insufficient.
   const errors=pins.map(p=>{const mapped=inverse(profile,p.r,p.v),geometry=Math.hypot(mapped.r-p.sourceR,mapped.v-p.sourceV),material=pointError(trial,w,h,f,sign,p,colour);return Math.max(geometry,material)});
   side.after=Math.max(...errors);
   if(!Number.isFinite(side.after)||side.after>Math.max(1.5,Math.min(3,f.eye*.008))||side.after>=side.before)continue;
   for(let y=y0;y<=y1;y++)out.set(trial.subarray((y*w+x0)*4,(y*w+x1+1)*4),(y*w+x0)*4);
   side.adjusted=true;report.adjusted=true;accepted=true;break;
  }
  if(!accepted)side.reason='two-dimensional-check-failed';
 }
 report.unavailable=report.sides.some(side=>side.reason&&side.reason!=='already-aligned');return {pixels:out,report};
}
