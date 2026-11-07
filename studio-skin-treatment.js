// Native skin RGB is retained. Only a smooth, bounded lighting/colour field is
// added; analysis samples never replace the uploaded image or its texture.
export const STUDIO_SKIN_WORKFLOW_VERSION='studio-skin-stages-v3';
export const STUDIO_SKIN_SOFT_VERSION='studio-skin-stages-v2';
export const STUDIO_SKIN_PREVIOUS_VERSION='studio-skin-stages-v1';
export const isStudioSkinWorkflowVersion=value=>value===STUDIO_SKIN_WORKFLOW_VERSION||value===STUDIO_SKIN_SOFT_VERSION||value===STUDIO_SKIN_PREVIOUS_VERSION;
const MAX_PIXELS=33554432,MAX_EVIDENCE=300*1024;
const OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const FEATURES=[
 [33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],
 [263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249],
 [70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285],
 [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146],
];
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)};
const Y=(r,g,b)=>.2126*r+.7152*g+.0722*b;
const invalid=()=>Object.assign(Error('ข้อมูลพื้นที่ผิวไม่ตรงกับรูปต้นฉบับ กรุณาลองใหม่'),{code:'studio_skin_evidence_invalid',status:400});
export function parseStudioSkinEvidence(value){
 let raw=value;
 if(typeof raw==='string'){
  if(!raw.length||raw.length>MAX_EVIDENCE)throw invalid();
  try{raw=JSON.parse(raw)}catch{throw invalid()}
 }
 if(!raw||typeof raw!=='object'||!isStudioSkinWorkflowVersion(raw.version))throw invalid();
 const {width,height,maskWidth,maskHeight,face,labels}=raw;
 if(![width,height,maskWidth,maskHeight].every(n=>Number.isSafeInteger(n)&&n>0)||width*height>MAX_PIXELS||maskWidth>256||maskHeight>256||!Array.isArray(face)||![468,478].includes(face.length)||!((Array.isArray(labels)||labels instanceof Uint8Array)&&labels.length===maskWidth*maskHeight))throw invalid();
 const points=Array.from(face,p=>{if(!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<-.25||v>1.25))throw invalid();return [p[0],p[1]]});
 if(Array.from(labels).some(n=>!Number.isInteger(n)||n<0||n>5))throw invalid();
 const fw=Math.hypot((points[454][0]-points[234][0])*width,(points[454][1]-points[234][1])*height);
 if(fw<32||fw>Math.hypot(width,height)||points[152][1]<=points[10][1])throw invalid();
 return {version:raw.version,width,height,maskWidth,maskHeight,face:points,labels:new Uint8Array(labels)};
}
function polygon(plane,points,w,h,value=1){
 const top=clamp(Math.floor(Math.min(...points.map(p=>p[1]))),0,h),bottom=clamp(Math.ceil(Math.max(...points.map(p=>p[1]))),0,h);
 for(let y=top;y<bottom;y++){
  const hits=[],scan=y+.5;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
   const a=points[j],b=points[i];if((a[1]>scan)!==(b[1]>scan))hits.push(a[0]+(scan-a[1])*(b[0]-a[0])/(b[1]-a[1]));
  }
  hits.sort((a,b)=>a-b);
  for(let i=0;i+1<hits.length;i+=2)plane.fill(value,y*w+clamp(Math.ceil(hits[i]-.5),0,w),y*w+clamp(Math.ceil(hits[i+1]-.5),0,w));
 }
}
function mean(input,w,h,r){
 r=Math.max(1,Math.round(r));const tmp=new Float32Array(input.length),out=new Float32Array(input.length),n=2*r+1;
 for(let y=0;y<h;y++){
  const row=y*w;let sum=0;for(let dx=-r;dx<=r;dx++)sum+=input[row+clamp(dx,0,w-1)];
  for(let x=0;x<w;x++){tmp[row+x]=sum/n;sum+=input[row+Math.min(w-1,x+r+1)]-input[row+Math.max(0,x-r)]}
 }
 for(let x=0;x<w;x++){
  let sum=0;for(let dy=-r;dy<=r;dy++)sum+=tmp[clamp(dy,0,h-1)*w+x];
  for(let y=0;y<h;y++){out[y*w+x]=sum/n;sum+=tmp[Math.min(h-1,y+r+1)*w+x]-tmp[Math.max(0,y-r)*w+x]}
 }
 return out;
}
const quantile=(values,q)=>{if(!values.length)return 0;values.sort((a,b)=>a-b);return values[Math.min(values.length-1,Math.floor((values.length-1)*q))]};
function sample(plane,w,h,x,y){
 x=clamp(x,0,w-1);y=clamp(y,0,h-1);const a=Math.floor(x),b=Math.floor(y),dx=x-a,dy=y-b,c=Math.min(w-1,a+1),d=Math.min(h-1,b+1);
 return (plane[b*w+a]*(1-dx)+plane[b*w+c]*dx)*(1-dy)+(plane[d*w+a]*(1-dx)+plane[d*w+c]*dx)*dy;
}
export function applyStudioSkinBase({pixels,width:W,height:H,evidence}={}){
 const e=parseStudioSkinEvidence(evidence);
 if(W!==e.width||H!==e.height||!(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==W*H*4)throw invalid();
 const report={version:e.version,status:'unchanged',changedPixels:0,neutralReference:false,analysisWidth:0,analysisHeight:0,maxChannelDelta:0};
 const scale=Math.min(1,512/Math.max(W,H)),w=Math.max(1,Math.round(W*scale)),h=Math.max(1,Math.round(H*scale)),n=w*h;
 report.analysisWidth=w;report.analysisHeight=h;
 const point=id=>[e.face[id][0]*w,e.face[id][1]*h],fw=Math.hypot(...point(454).map((v,i)=>v-point(234)[i])),chin=point(152),left=point(234),right=point(454),cx=(left[0]+right[0])/2;
 const allowed=new Float32Array(n),protectedMask=new Float32Array(n),oval=new Float32Array(n);
 polygon(oval,OVAL.map(point),w,h);
 for(const feature of FEATURES)polygon(protectedMask,feature.map(point),w,h);
 // Nostril openings are photographed features, not shadows to be filled.
 for(const id of [98,327]){const p=point(id),rx=Math.max(1.5,fw*.024),ry=Math.max(1.5,fw*.019);for(let y=clamp(Math.floor(p[1]-ry),0,h);y<Math.min(h,p[1]+ry+1);y++)for(let x=clamp(Math.floor(p[0]-rx),0,w);x<Math.min(w,p[0]+rx+1);x++)if(((x+.5-p[0])/rx)**2+((y+.5-p[1])/ry)**2<=1)protectedMask[y*w+x]=1}
 const guard=mean(protectedMask,w,h,Math.max(2,fw*.018)),faceFeather=mean(oval,w,h,Math.max(2,fw*.018));
 const channels=[new Float32Array(n),new Float32Array(n),new Float32Array(n)],lum=new Float32Array(n),coverage=new Float32Array(n),lights=[];
 const refs=[[],[]],skinValues=[[],[],[]];
 const labelAt=(x,y)=>e.labels[Math.min(e.maskHeight-1,Math.floor(y*e.maskHeight/H))*e.maskWidth+Math.min(e.maskWidth-1,Math.floor(x*e.maskWidth/W))];
 let support=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,nx=Math.min(W-1,Math.floor((x+.5)*W/w)),ny=Math.min(H-1,Math.floor((y+.5)*H/h)),k=(ny*W+nx)*4,label=labelAt(nx,ny),r=pixels[k],g=pixels[k+1],b=pixels[k+2],light=Y(r,g,b);
  lum[i]=light;channels[0][i]=r;channels[1][i]=g;channels[2][i]=b;
  if((label===0||label===4)&&pixels[k+3]===255&&light>=145&&light<=242&&Math.max(r,g,b)-Math.min(r,g,b)<=32){refs[label===4?1:0].push([r/g,b/g])}
  const neck=y>=chin[1]-fw*.06&&y<=chin[1]+fw*.85&&Math.abs(x-cx)<=fw*.46;
  const ears=y>=Math.min(left[1],right[1])-fw*.3&&y<=chin[1]&&Math.abs(x-cx)<=fw*.66;
  const region=oval[i]?smooth(.05,.65,faceFeather[i]):((neck||ears) ? .8 : 0);
  allowed[i]=(label===2||label===3)&&pixels[k+3]===255&&region?region:0;
  const c=allowed[i]*(1-protectedMask[i])*(1-smooth(0,.045,guard[i]));coverage[i]=c;
  if(c>.5&&light>35&&light<228&&Math.max(r,g,b)<246){lights.push(light);support++}
 }
 if(support<64){report.reason='insufficient_skin_evidence';return {pixels,changed:false,report}}
 const lightTarget=quantile(lights,.75),low=quantile(lights,.28),high=quantile(lights,.85);
 for(let i=0;i<n;i++)if(coverage[i]>.5&&lum[i]>=low&&lum[i]<=high&&lum[i]>35&&lum[i]<228){for(let c=0;c<3;c++)skinValues[c].push(channels[c][i]-lum[i])}
 const reference=skinValues.map(v=>quantile(v,.5));
 // No gray-world skin assumption: global colour casts are estimated only when
 // BOTH a near-neutral background and clothing independently agree.
 const gains=[1,1,1];
 if(refs.every(group=>group.length>=32)){
  const medians=refs.map(group=>[quantile(group.map(v=>v[0]),.5),quantile(group.map(v=>v[1]),.5)]);
  if(Math.abs(medians[0][0]-medians[1][0])<.022&&Math.abs(medians[0][1]-medians[1][1])<.022){
   const rg=(medians[0][0]+medians[1][0])/2,bg=(medians[0][1]+medians[1][1])/2;
   if(Math.max(Math.abs(rg-1),Math.abs(bg-1))>.018){gains[0]=clamp(1+(1/rg-1)*.65,.94,1.06);gains[2]=clamp(1+(1/bg-1)*.65,.94,1.06);report.neutralReference=true}
  }
 }
 const radius=Math.max(3,Math.round(fw*.065)),weights=mean(coverage,w,h,radius),local=channels.map(channel=>{const weighted=new Float32Array(n);for(let i=0;i<n;i++)weighted[i]=channel[i]*coverage[i];return mean(weighted,w,h,radius)});
 const fields=[new Float32Array(n),new Float32Array(n),new Float32Array(n)],localLight=new Float32Array(n);
 for(let i=0;i<n;i++){
  if(weights[i]<.08)continue;
  const rgb=local.map(v=>v[i]/weights[i]),light=Y(...rgb);localLight[i]=light;
  const lift=clamp((lightTarget-light-4)*.48,0,22)*(1-smooth(lightTarget+5,235,light));
  const chroma=rgb.map(v=>v-light),raw=reference.map((v,c)=>clamp(v-chroma[c],-14,14)*.36*smooth(3,12,Math.abs(v-chroma[c]))),grey=Y(...raw);
  for(let c=0;c<3;c++)fields[c][i]=clamp(lift+raw[c]-grey+rgb[c]*(gains[c]-1),-18,24);
 }
 // Smooth correction fields, not skin RGB: native pores/grain stay in place.
 const finalFields=fields.map(field=>mean(field,w,h,Math.max(2,fw*.025)));
 const softCoverage=mean(coverage,w,h,Math.max(1,fw*.008));
 let out=null;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const label=labelAt(x,y);if(label!==2&&label!==3)continue;
  const k=(y*W+x)*4;if(pixels[k+3]!==255)continue;
  const ax=(x+.5)*w/W-.5,ay=(y+.5)*h/H-.5,ix=clamp(Math.round(ax),0,w-1),iy=clamp(Math.round(ay),0,h-1),i=iy*w+ix;
  if(!allowed[i]||protectedMask[i]||guard[i]>.0001)continue;
  const light=Y(pixels[k],pixels[k+1],pixels[k+2]),peak=Math.max(pixels[k],pixels[k+1],pixels[k+2]),near=sample(localLight,w,h,ax,ay);
  // Strong dark marks/folds and true highlights are retained sample-for-sample.
  if(light<32||light>=228||peak>=248||near&&light<near-20)continue;
  const a=sample(softCoverage,w,h,ax,ay);if(a<.01)continue;
  let changed=false;
  for(let c=0;c<3;c++){
   const delta=sample(finalFields[c],w,h,ax,ay)*a,next=Math.round(clamp(pixels[k+c]+delta,0,255));
   if(next!==pixels[k+c]){if(!out)out=new Uint8ClampedArray(pixels);out[k+c]=next;changed=true;report.maxChannelDelta=Math.max(report.maxChannelDelta,Math.abs(next-pixels[k+c]))}
  }
  if(changed)report.changedPixels++;
 }
 report.status=out?'applied':'unchanged';return {pixels:out||pixels,changed:Boolean(out),report};
}
