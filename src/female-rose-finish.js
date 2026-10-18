// Female initial portraits only. Local pigment correction; preserve Lab lightness,
// alpha and geometry. No resampling, face generation, skin exposure or pore filter.
const LIP=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const HOLE=[78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95];
const EYES=[{edge:[33,246,161,160,159,158,157,173,133],brow:52},{edge:[362,398,384,385,386,387,388,466,263],brow:282}];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const median=a=>{a.sort((x,y)=>x-y);return a[Math.floor(a.length/2)]};
const inside=(x,y,p)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i].y>y)!==(p[j].y>y)&&x<(p[j].x-p[i].x)*(y-p[i].y)/(p[j].y-p[i].y)+p[i].x)yes=!yes;return yes};
function distance(x,y,p){let best=Infinity;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);best=Math.min(best,Math.hypot(x-a.x-dx*t,y-a.y-dy*t))}return best}
const linear=v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const gamma=v=>255*(v<=.0031308?12.92*v:1.055*Math.max(0,v)**(1/2.4)-.055);
function lab(r,g,b){r=linear(r);g=linear(g);b=linear(b);const f=v=>v>.008856?Math.cbrt(v):7.787*v+16/116;const x=f((.4124564*r+.3575761*g+.1804375*b)/.95047),y=f(.2126729*r+.7151522*g+.072175*b),z=f((.0193339*r+.119192*g+.9503041*b)/1.08883);return [116*y-16,500*(x-y),200*(y-z)]}
function rgb(L,a,b){const y=(L+16)/116,x=y+a/500,z=y-b/200,f=v=>v**3>.008856?v**3:(v-16/116)/7.787;const X=.95047*f(x),Y=f(y),Z=1.08883*f(z);return [gamma(3.2404542*X-1.5371385*Y-.4985314*Z),gamma(-.969266*X+1.8760108*Y+.041556*Z),gamma(.0556434*X-.2040259*Y+1.0572252*Z)]}
export function finishFemaleRosePigment({pixels,width:w,height:h,face,skin,hair}){
 if(!pixels||pixels.length!==w*h*4||!face||skin?.length!==w*h)return {pixels,changed:false,status:'unmeasurable'};
 const ids=[234,454,...LIP,...HOLE,...EYES.flatMap(e=>[...e.edge,e.brow])];
 if(ids.some(i=>!Number.isFinite(face[i]?.x)||!Number.isFinite(face[i]?.y)))return {pixels,changed:false,status:'unmeasurable'};
 const point=i=>({x:face[i].x*w,y:face[i].y*h}),fw=Math.hypot((face[454].x-face[234].x)*w,(face[454].y-face[234].y)*h);
 if(fw<64)return {pixels,changed:false,status:'unmeasurable'};
 const regions=EYES.map(e=>{const edge=e.edge.map(point),brow=point(e.brow),mid=edge[4];const depth=clamp((mid.y-brow.y)*.23,fw*.008,fw*.025);const top=edge.map((p,i)=>({...p,y:p.y-depth*Math.sin(Math.PI*i/(edge.length-1))}));return {outer:point(e.edge[0]===33?33:263),inner:point(e.edge[0]===33?133:362),poly:[...edge,...top.reverse()],hole:null,target:[12,2],limit:8,feather:Math.max(1,fw*.006),kind:'eye'}});
 regions.push({poly:LIP.map(point),hole:HOLE.map(point),target:[23,5],limit:12,feather:Math.max(1,fw*.008),kind:'lip'});
 const out=new Uint8ClampedArray(pixels);let changed=false,measured=0;
 for(const region of regions){const {poly,hole}=region,x0=clamp(Math.floor(Math.min(...poly.map(p=>p.x))),0,w),x1=clamp(Math.ceil(Math.max(...poly.map(p=>p.x))),0,w),y0=clamp(Math.floor(Math.min(...poly.map(p=>p.y))),0,h),y1=clamp(Math.ceil(Math.max(...poly.map(p=>p.y))),0,h);const samples=[];
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const n=y*w+x,k=n*4;if(pixels[k+3]<248||!Number.isFinite(skin[n])||region.kind==='eye'&&skin[n]<.5||hair&&(!Number.isFinite(hair[n])||hair[n]>.25)||!inside(x+.5,y+.5,poly)||hole&&inside(x+.5,y+.5,hole))continue;const value=lab(pixels[k],pixels[k+1],pixels[k+2]);if(value[0]<22||value[0]>92)continue;samples.push({k,x,y,value})}
  if(samples.length<12)continue;measured++;
  const a=median(samples.map(p=>p.value[1])),b=median(samples.map(p=>p.value[2]));
  const da=clamp(region.target[0]-a,-region.limit,region.limit),db=clamp(region.target[1]-b,-region.limit,region.limit);
  if(Math.abs(da)+Math.abs(db)<1)continue;
  for(const p of samples){const edge=Math.min(distance(p.x+.5,p.y+.5,poly),hole?distance(p.x+.5,p.y+.5,hole):Infinity),t=clamp(edge/region.feather,0,1);let weight=t*t*(3-2*t);let outerWeight=1;if(region.kind==='eye'){const dx=region.inner.x-region.outer.x,dy=region.inner.y-region.outer.y,along=((p.x-region.outer.x)*dx+(p.y-region.outer.y)*dy)/(dx*dx+dy*dy||1),fade=clamp((.38-along)/.25,0,1);outerWeight=fade*fade*(3-2*fade)}weight*=outerWeight;if(weight===0)continue;
   const [L,A,B]=p.value,color=rgb(L,A+da*weight,B+db*weight);
   // If the requested pigment is outside sRGB, reduce chroma rather than clipping highlights.
   let amount=1;while(amount>.125&&color.some(v=>v<0||v>255)){amount*=.5;color.splice(0,3,...rgb(L,A+da*weight*amount,B+db*weight*amount))}
   if(color.some(v=>v<0||v>255))continue;
   for(let k=0;k<3;k++){const v=Math.round(color[k]);if(v!==out[p.k+k])changed=true;out[p.k+k]=v}
  }
 }
 return {pixels:changed?out:pixels,changed,status:measured?'measured':'unmeasurable'};
}
