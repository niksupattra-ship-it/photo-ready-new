// One continuous correction field on the finished portrait. Native high-frequency
// skin samples remain in place; no tiled retouch, polygon cutoffs or spot patches.
export const STUDIO_SKIN_SURFACE_VERSION='continuous-satin-v1';
const OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const EYES=[[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],[263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249]];
const BROWS=[[70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285]],LIPS=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)},Y=(r,g,b)=>.2126*r+.7152*g+.0722*b;
function poly(out,ids,face,w,h){const p=ids.map(i=>[face[i].x*w,face[i].y*h]);for(let y=clamp(Math.floor(Math.min(...p.map(q=>q[1]))),0,h);y<clamp(Math.ceil(Math.max(...p.map(q=>q[1]))),0,h);y++){const hits=[],v=y+.5;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>v)!==(p[j][1]>v))hits.push(p[j][0]+(v-p[j][1])*(p[i][0]-p[j][0])/(p[i][1]-p[j][1]));hits.sort((a,b)=>a-b);for(let i=0;i+1<hits.length;i+=2)out.fill(1,y*w+clamp(Math.ceil(hits[i]-.5),0,w),y*w+clamp(Math.ceil(hits[i+1]-.5),0,w));}}
function mean(a,w,h,r){r=Math.max(1,Math.round(r));const tmp=new Float32Array(a.length),out=new Float32Array(a.length),d=2*r+1;for(let y=0;y<h;y++){let s=0;for(let x=-r;x<=r;x++)s+=a[y*w+clamp(x,0,w-1)];for(let x=0;x<w;x++){tmp[y*w+x]=s/d;s+=a[y*w+Math.min(w-1,x+r+1)]-a[y*w+Math.max(0,x-r)];}}for(let x=0;x<w;x++){let s=0;for(let y=-r;y<=r;y++)s+=tmp[clamp(y,0,h-1)*w+x];for(let y=0;y<h;y++){out[y*w+x]=s/d;s+=tmp[Math.min(h-1,y+r+1)*w+x]-tmp[Math.max(0,y-r)*w+x];}}return out;}
function sample(a,w,h,x,y){x=clamp(x,0,w-1);y=clamp(y,0,h-1);const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,k=Math.min(w-1,i+1),l=Math.min(h-1,j+1);return (a[j*w+i]*(1-u)+a[j*w+k]*u)*(1-v)+(a[l*w+i]*(1-u)+a[l*w+k]*u)*v;}
const quantile=(a,q)=>{a.sort((x,y)=>x-y);return a[Math.floor((a.length-1)*q)]||0};
export function finishStudioSkinSurface({pixels,width:W,height:H,face,semantic}={}){
 const invalid=()=>{throw Object.assign(Error('ตรวจพื้นที่ผิวไม่ครบ กรุณาใช้รูปหน้าตรงที่เห็นใบหน้าชัดเจน'),{code:'studio_skin_evidence_invalid'})};
 if(!Number.isSafeInteger(W)||!Number.isSafeInteger(H)||W<1||H<1||W*H>33554432||!(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==W*H*4||!face||![...OVAL,...EYES.flat(),...BROWS.flat(),...LIPS].every(i=>Number.isFinite(face[i]?.x)&&Number.isFinite(face[i]?.y)&&face[i].x>=-.25&&face[i].x<=1.25&&face[i].y>=-.25&&face[i].y<=1.25)||!semantic||!Number.isSafeInteger(semantic.width)||!Number.isSafeInteger(semantic.height)||semantic.width<1||semantic.height<1||semantic.width*semantic.height!==semantic.values?.length)invalid();
 const scale=Math.min(1,384/Math.max(W,H)),w=Math.max(1,Math.round(W*scale)),h=Math.max(1,Math.round(H*scale)),n=w*h,fw=Math.hypot((face[454].x-face[234].x)*w,(face[454].y-face[234].y)*h);
 const report={version:STUDIO_SKIN_SURFACE_VERSION,status:'unchanged',analysisWidth:w,analysisHeight:h,changedPixels:0,highlightPixels:0,maxHighlightReduction:0,maxChannelDelta:0,referenceLuma:0};
 if(fw<18)return {pixels,changed:false,report:{...report,reason:'small-face'}};
 const oval=new Float32Array(n),eyes=new Float32Array(n),pigment=new Float32Array(n),skin=new Float32Array(n),hair=new Float32Array(n),donor=new Float32Array(n),lum=new Float32Array(n),red=new Float32Array(n),blue=new Float32Array(n),refs=[[],[],[]];poly(oval,OVAL,face,w,h);for(const ids of EYES)poly(eyes,ids,face,w,h);for(const ids of [...BROWS,LIPS])poly(pigment,ids,face,w,h);
 const label=(x,y)=>semantic.values[clamp(Math.floor(y*semantic.height/H),0,semantic.height-1)*semantic.width+clamp(Math.floor(x*semantic.width/W),0,semantic.width-1)];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,nx=clamp(Math.floor((x+.5)*W/w),0,W-1),ny=clamp(Math.floor((y+.5)*H/h),0,H-1),k=(ny*W+nx)*4,c=label(nx,ny),a=pixels[k+3]/255,L=Y(pixels[k],pixels[k+1],pixels[k+2]);lum[i]=L;red[i]=pixels[k]-L;blue[i]=pixels[k+2]-L;skin[i]=Math.max(c===2||c===3?1:0,oval[i]*.98)*a;hair[i]=c===1?1:0;donor[i]=(c===2||c===3?a:0)*(1-eyes[i])*(1-pigment[i])*smooth(5,20,L)*(1-smooth(240,254,L));if(oval[i]&&donor[i]>.8){refs[0].push(L);refs[1].push(red[i]);refs[2].push(blue[i]);}}
 if(refs[0].length<32)return {pixels,changed:false,report:{...report,reason:'insufficient-skin'}};
 const target=quantile(refs[0],.60),reference=[quantile(refs[1],.5),quantile(refs[2],.5)];
 // Semantic holes are measurement gaps, not holes in the correction. Admit
 // plausible facial skin there, while rejecting pigment/background samples.
 for(let i=0;i<n;i++){const distance=Math.hypot(red[i]-reference[0],blue[i]-reference[1]),plausible=(1-smooth(30,65,Math.abs(lum[i]-target)))*(1-smooth(25,55,distance));if(oval[i]&&!eyes[i]&&!pigment[i])donor[i]=Math.max(donor[i],skin[i]*plausible);donor[i]*=plausible;}
 const r=Math.max(1,fw*.02),broadR=Math.max(r+2,fw*.15),mediumWeight=mean(donor,w,h,r),broadWeight=mean(donor,w,h,broadR),softSkin=mean(mean(skin,w,h,Math.max(1,fw*.012)),w,h,Math.max(1,fw*.012)),softHair=mean(hair,w,h,Math.max(1,fw*.008)),softEye=mean(eyes,w,h,Math.max(1,fw*.004)),softPigment=mean(pigment,w,h,Math.max(1,fw*.005));report.referenceLuma=target;
 const planes=[lum,red,blue],medium=[],broad=[];
 for(let channel=0;channel<planes.length;channel++){const plane=planes[channel],prior=channel?reference[channel-1]:target,weighted=Float32Array.from(plane,(v,i)=>v*donor[i]),m=mean(weighted,w,h,r),b=mean(weighted,w,h,broadR);for(let i=0;i<n;i++){m[i]=prior+(m[i]/Math.max(.00001,mediumWeight[i])-prior)*smooth(.005,.03,mediumWeight[i]);b[i]=prior+(b[i]/Math.max(.00001,broadWeight[i])-prior)*smooth(.005,.03,broadWeight[i]);}medium.push(m);broad.push(b);}
 const fields=[new Float32Array(n),new Float32Array(n),new Float32Array(n)];
 for(let i=0;i<n;i++){const local=medium[0][i],wide=broad[0][i];fields[0][i]=clamp((wide-local)*.62+(target-wide)*.30,-18,14);for(let c=1;c<3;c++)fields[c][i]=clamp((reference[c-1]*.85+broad[c][i]*.15-medium[c][i])*.95,-14,14);}
 let out=null;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const k=(y*W+x)*4;if(!pixels[k+3])continue;const ax=(x+.5)*w/W-.5,ay=(y+.5)*h/H-.5,local=sample(medium[0],w,h,ax,ay),R=pixels[k],G=pixels[k+1],B=pixels[k+2],L=Y(R,G,B),chromaDist=Math.hypot((R-L)-reference[0],(B-L)-reference[1]);
  const edge=sample(softSkin,w,h,ax,ay),hairWeight=1-smooth(.08,.75,sample(softHair,w,h,ax,ay))*Math.max(smooth(12,40,local-L),smooth(12,30,chromaDist)),eye=sample(softEye,w,h,ax,ay),pig=sample(softPigment,w,h,ax,ay),feature=smooth(7,24,local-L)+smooth(19,43,L-local)+smooth(8,25,chromaDist),dark=smooth(25,52,local-L);
  const weight=clamp(edge)*hairWeight*(1-smooth(.06,.72,eye))*(1-clamp(pig*feature))*(1-dark)*smooth(0,25,L)*(pixels[k+3]/255);
  if(weight<.0001)continue;
  const excess=Math.max(0,L-(target+13)),matte=Math.min(28,excess*excess/(excess+18)*.75),dL=(sample(fields[0],w,h,ax,ay)-matte)*weight,dR=sample(fields[1],w,h,ax,ay)*weight,dB=sample(fields[2],w,h,ax,ay)*weight,dG=-(.2126*dR+.0722*dB)/.7152,delta=[dL+dR,dL+dG,dL+dB];let changed=false;
  for(let c=0;c<3;c++){const value=Math.round(clamp(pixels[k+c]+delta[c],0,255));if(value!==pixels[k+c]){if(!out)out=new Uint8ClampedArray(pixels);out[k+c]=value;changed=true;report.maxChannelDelta=Math.max(report.maxChannelDelta,Math.abs(value-pixels[k+c]));}}
  if(changed){report.changedPixels++;if(matte*weight>.5){report.highlightPixels++;report.maxHighlightReduction=Math.max(report.maxHighlightReduction,-dL);}}
 }
 report.status=out?'applied':'unchanged';return {pixels:out||pixels,changed:Boolean(out),report};
}
