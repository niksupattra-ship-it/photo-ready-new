// Female initial portraits only: a small local pigment correction after the
// established skin/light finish. Never change lightness, alpha or geometry.
const LIP=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const HOLE=[78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95];
const EYES=[{edge:[33,246,161,160,159,158,157,173,133],brow:52},{edge:[362,398,384,385,386,387,388,466,263],brow:282}];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v,0,1);return v*v*(3-2*v)};
const median=a=>{a.sort((x,y)=>x-y);return a[Math.floor(a.length/2)]};
const inside=(x,y,p)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i].y>y)!==(p[j].y>y)&&x<(p[j].x-p[i].x)*(y-p[i].y)/(p[j].y-p[i].y)+p[i].x)yes=!yes;return yes};
function distance(x,y,p){let best=Infinity;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);best=Math.min(best,Math.hypot(x-a.x-dx*t,y-a.y-dy*t))}return best}
const linear=v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const gamma=v=>255*(v<=.0031308?12.92*v:1.055*Math.max(0,v)**(1/2.4)-.055);
function lab(r,g,b){r=linear(r);g=linear(g);b=linear(b);const f=v=>v>.008856?Math.cbrt(v):7.787*v+16/116;const x=f((.4124564*r+.3575761*g+.1804375*b)/.95047),y=f(.2126729*r+.7151522*g+.072175*b),z=f((.0193339*r+.119192*g+.9503041*b)/1.08883);return [116*y-16,500*(x-y),200*(y-z)]}
function rgb(L,a,b){const y=(L+16)/116,x=y+a/500,z=y-b/200,f=v=>v**3>.008856?v**3:(v-16/116)/7.787;const X=.95047*f(x),Y=f(y),Z=1.08883*f(z);return [gamma(3.2404542*X-1.5371385*Y-.4985314*Z),gamma(-.969266*X+1.8760108*Y+.041556*Z),gamma(.0556434*X-.2040259*Y+1.0572252*Z)]}

export function finishFemaleRosePigment({pixels,width:w,height:h,face,skin,hair}={}){
 const unchanged=()=>({pixels,changed:false,status:'unmeasurable'});
 if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<=0||h<=0||w*h>33554432||!(pixels instanceof Uint8ClampedArray||pixels instanceof Uint8Array)||pixels.length!==w*h*4||!face||skin?.length!==w*h||hair?.length!==w*h)return unchanged();
 const ids=[234,454,...LIP,...HOLE,...EYES.flatMap(e=>[...e.edge,e.brow])];
 if(ids.some(i=>!Number.isFinite(face[i]?.x)||!Number.isFinite(face[i]?.y)||face[i].x<0||face[i].x>1||face[i].y<0||face[i].y>1))return unchanged();
 const point=i=>({x:face[i].x*w,y:face[i].y*h}),fw=Math.hypot((face[454].x-face[234].x)*w,(face[454].y-face[234].y)*h);
 if(fw<64)return unchanged();
 const regions=EYES.map(e=>{
  const edge=e.edge.map(point),brow=point(e.brow),mid=edge[4],depth=clamp((mid.y-brow.y)*.10,fw*.003,fw*.010);
  const top=edge.map((p,i)=>({...p,y:p.y-depth*Math.sin(Math.PI*i/(edge.length-1))}));
  return {poly:[...edge,...top.reverse()],hole:null,target:[12,2],limit:4,feather:Math.max(.65,fw*.004),kind:'eye'};
 });
 const lip=LIP.map(point),lipWidth=Math.max(...lip.map(p=>p.x))-Math.min(...lip.map(p=>p.x)),lipHeight=Math.max(...lip.map(p=>p.y))-Math.min(...lip.map(p=>p.y));
 if(lipWidth<fw*.12||lipWidth>fw*.65||lipHeight<fw*.015||lipHeight>fw*.25)return unchanged();
 regions.push({poly:lip,hole:HOLE.map(point),limit:10,feather:Math.max(.75,fw*.003),kind:'lip'});
 const out=new Uint8ClampedArray(pixels);let changed=false,measured=0;
 for(const region of regions){
  const {poly,hole}=region,x0=clamp(Math.floor(Math.min(...poly.map(p=>p.x))),0,w),x1=clamp(Math.ceil(Math.max(...poly.map(p=>p.x))),0,w),y0=clamp(Math.floor(Math.min(...poly.map(p=>p.y))),0,h),y1=clamp(Math.ceil(Math.max(...poly.map(p=>p.y))),0,h),samples=[];
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
   if(!inside(x+.5,y+.5,poly)||hole&&inside(x+.5,y+.5,hole))continue;
   const n=y*w+x,k=n*4,s=skin[n],hairValue=hair[n];
   // Missing or malformed local evidence must never turn into paint on hair.
   if(!Number.isFinite(s)||s<0||s>1||!Number.isFinite(hairValue)||hairValue<0||hairValue>1)return unchanged();
   if(pixels[k+3]<250||hairValue>.15||region.kind==='eye'&&s<.55)continue;
   const value=lab(pixels[k],pixels[k+1],pixels[k+2]);
   // Keep black lash roots, deep mouth creases and bright gloss/specular pixels.
   if(value[0]<22||value[0]>88||value[0]>70&&Math.hypot(value[1],value[2])<5)continue;
   samples.push({k,x,y,value});
  }
  if(samples.length<12)continue;
  measured++;
  const a=median(samples.map(p=>p.value[1])),b=median(samples.map(p=>p.value[2])),medianL=median(samples.map(p=>p.value[0]));
  // Retain person-specific lip depth/chroma. Move only a bounded distance toward
  // muted rose with a little natural red; do not force every lip to one colour.
  const chroma=clamp(Math.hypot(a,b),14,32),target=region.kind==='lip'?[chroma*.914,chroma*.406]:region.target;
  let da=target[0]-a,db=target[1]-b;
  const scale=Math.min(1,region.limit/Math.max(.001,Math.hypot(da,db)));da*=scale;db*=scale;
  if(Math.hypot(da,db)<.5)continue;
  for(const p of samples){
   if(region.kind==='eye'&&p.value[0]<medianL-12)continue;
   const edge=Math.min(distance(p.x+.5,p.y+.5,poly),hole?distance(p.x+.5,p.y+.5,hole):Infinity),weight=smooth(edge/region.feather);
   if(!weight)continue;
   const [L,A,B]=p.value;
   let amount=weight,color=rgb(L,A+da*amount,B+db*amount);
   // Preserve L* even at gamut limits by reducing the pigment shift, never by
   // clipping channels or lifting dark lips. Luminance detail stays intact.
   while(amount>.0625&&color.some(v=>v<0||v>255)){amount*=.5;color=rgb(L,A+da*amount,B+db*amount)}
   if(color.some(v=>v<0||v>255))continue;
   for(let k=0;k<3;k++){const v=Math.round(color[k]);if(v!==out[p.k+k])changed=true;out[p.k+k]=v}
  }
 }
 return {pixels:changed?out:pixels,changed,status:measured?'measured':'unmeasurable'};
}
