import {softHairEraser} from './soft-hair-eraser.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=n=>{const t=clamp(n,0,1);return t*t*(3-2*t)};
function upperFrame(face,w,h){
 if([33,263,10,127,356,234,454].some(i=>!face?.[i]||![face[i].x,face[i].y].every(Number.isFinite)))throw Error('ไม่พบแนวขมับสำหรับเก็บขอบผมยาว');
 const l=face[33],r=face[263],dx=(r.x-l.x)*w,dy=(r.y-l.y)*h,eye=Math.hypot(dx,dy);
 if(eye<5)throw Error('แนวใบหน้าไม่ชัดพอสำหรับเก็บขอบผมยาว');
 const c=dx/eye,s=dy/eye,cx=(l.x+r.x)*w/2,cy=(l.y+r.y)*h/2;
 const local=(x,y)=>({u:(x-cx)*c+(y-cy)*s,v:-(x-cx)*s+(y-cy)*c});
 const p=i=>local(face[i].x*w,face[i].y*h),ears=[p(127),p(356)],forehead=p(10),width=Math.abs(p(454).u-p(234).u);
 const ovalIds=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
 const oval=ovalIds.every(i=>face[i]&&[face[i].x,face[i].y].every(Number.isFinite))?ovalIds.map(p):null;
 const insideFace=(u,v)=>{
  if(!oval)return false;let yes=false;
  for(let i=0,j=oval.length-1;i<oval.length;j=i++){const a=oval[i],b=oval[j];if((a.v>v)!==(b.v>v)&&u<(b.u-a.u)*(v-a.v)/(b.v-a.v)+a.u)yes=!yes}return yes;
 };
 return {eye,local,ears,forehead,width,insideFace};
}

// Restore the selected front hair throughout the upper temple band. Erase
// only a narrow strip at the outer edge of actual ear skin, never the face
// oval or the whole temple. Lower face/neck behaviour remains unchanged.
export function eraseLongUpperFront(front,original,skin,w,h,face,portrait=null){
 if([front,original,skin].some(p=>p.length!==w*h*4)||portrait&&portrait.length!==w*h*4)throw Error('ข้อมูลขอบผมยาวไม่ตรงกับภาพ');
 const f=upperFrame(face,w,h),strength=new Float32Array(w*h),limit=new Float32Array(w*h),out=new Uint8ClampedArray(front),edge=[new Map(),new Map()],feather=Math.max(1.5,Math.min(5,f.eye*.025));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,q=f.local(x,y),side=q.u<0?0:1,ear=f.ears[side];
  if(skin[n*4+3]<128||portrait&&portrait[n*4+3]<248||q.v<ear.v-f.eye*.16||q.v>ear.v+f.eye*.40||Math.abs(Math.abs(q.u)-Math.abs(ear.u))>f.eye*.32)continue;
  const row=Math.floor(q.v),outer=Math.abs(q.u);edge[side].set(row,Math.max(edge[side].get(row)||0,outer));
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,q=f.local(x,y),side=q.u<0?0:1,ear=f.ears[side];
  if(Math.abs(q.u)<f.width*.28||q.v<f.forehead.v-f.eye*.06||q.v>ear.v+f.eye*.32)continue;
  // Undo the former wide face/temple cut before applying the ear-edge eraser.
  out[n*4+3]=original[n*4+3];
  if(q.v<ear.v-f.eye*.08||skin[n*4+3]<128||portrait&&portrait[n*4+3]<248)continue;
  let total=0,count=0;for(let v=Math.floor(q.v)-1;v<=Math.floor(q.v)+1;v++)if(edge[side].has(v)){total+=edge[side].get(v);count++}
  if(!count)continue;const depth=total/count-Math.abs(q.u);
  if(depth<-.5||depth>feather)continue;
  strength[n]=1-smooth(Math.max(0,depth)/feather);limit[n]=1;
 }
 const erased=softHairEraser(original,w,h,strength,Math.max(.5,Math.min(1.5,f.eye*.008)),limit);
 for(let n=0;n<w*h;n++)if(limit[n])out[n*4+3]=erased[n*4+3];
 return out;
}

// Feather the VISIBLE stacked crown, not each PNG in isolation. Two alpha
// ramps stacked independently make the edge too opaque again. A shared loss
// factor gives their composition the requested ramp, changing only alpha in
// the upper contour band. Rear lengths, gap filling and all RGB stay exact.
export function featherLongCrown(front,back,w,h,face){
 if(front.length!==w*h*4||back.length!==w*h*4)throw Error('เลเยอร์ผมยาวไม่พร้อมสำหรับเก็บขอบบน');
 const f=upperFrame(face,w,h),corners=[[0,0],[w,0],[0,h],[w,h]].map(([x,y])=>f.local(x,y).u),origin=Math.floor(Math.min(...corners))-1,count=Math.ceil(Math.max(...corners))-origin+2;
 const top=new Float32Array(count);top.fill(Infinity);
 const combined=new Uint8ClampedArray(w*h*4),crownLimit=f.forehead.v-f.eye*.035;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4,a=front[j+3]/255,b=back[j+3]/255,q=f.local(x,y),alpha=Math.round((a+b*(1-a))*255);combined[j+3]=alpha;
  if(alpha>=192&&q.v<crownLimit)top[Math.floor(q.u-origin)]=Math.min(top[Math.floor(q.u-origin)],q.v);
 }
 const contour=new Float32Array(count);contour.fill(Infinity);
 const radius=Math.max(1,Math.min(4,Math.round(f.eye*.007))),reach=Math.max(2,Math.ceil(f.eye*.06));
 for(let i=0;i<count;i++){
  let sum=0,total=0;
  for(let k=Math.max(0,i-radius);k<=Math.min(count-1,i+radius);k++)if(Number.isFinite(top[k])){const weight=radius+1-Math.abs(k-i);sum+=top[k]*weight;total+=weight}
  if(total)contour[i]=sum/total;
  else for(let d=1;d<=reach;d++){const neighbours=[top[i-d],top[i+d]].filter(Number.isFinite);if(neighbours.length){contour[i]=Math.min(...neighbours);break}}
 }
 const feather=Math.max(1.25,Math.min(5,f.eye*.009)),strength=new Float32Array(w*h),limit=new Float32Array(w*h),headStrength=new Float32Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,q=f.local(x,y),edge=contour[Math.floor(q.u-origin)];if(!Number.isFinite(edge)||q.v>=crownLimit)continue;
  strength[n]=smooth((edge+feather-q.v)/(2*feather));limit[n]=smooth((crownLimit-q.v)/(feather*3));
  // The original crown must not reappear below the PNG's feather. Its eraser
  // extends slightly under opaque new hair; the graded inner edge is hidden.
  headStrength[n]=smooth((edge+f.eye*.035+feather*3-q.v)/(2*feather))*limit[n];
 }
 const desired=softHairEraser(combined,w,h,strength,Math.max(.75,Math.min(2,f.eye*.005)),limit),outFront=new Uint8ClampedArray(front),outBack=new Uint8ClampedArray(back);
 for(let n=0;n<w*h;n++){
  const j=n*4;if(desired[j+3]===combined[j+3])continue;
  const a=front[j+3]/255,b=back[j+3]/255,total=a+b,target=desired[j+3]/255;
  if(!total)continue;
  // Stable smaller root of (a+b)k-ab*k² = desired combined alpha.
  const factor=clamp(2*target/(total+Math.sqrt(Math.max(0,total*total-4*a*b*target))),0,1);
  outFront[j+3]=Math.round(front[j+3]*factor);outBack[j+3]=Math.round(back[j+3]*factor);
 }
 return {front:outFront,back:outBack,headStrength};
}

// Direct soft erasure of original upper hair only. The portrait's skin, ears,
// brows/eyes and every pixel below the forehead are protected, including when
// a model calls them hair. This never samples or blurs photographed colours.
export function eraseLongUpperPortrait(portrait,w,h,face,labels,strength){
 const {data,width:mw,height:mh}=labels||{};
 if(portrait.length!==w*h*4||strength.length!==w*h||!(data instanceof Uint8Array)||mw<1||mh<1||data.length!==mw*mh)throw Error('ตรวจผมเดิมเหนือหน้าผากไม่สำเร็จ');
 const f=upperFrame(face,w,h),guard=new Uint8Array(data.length),limit=new Float32Array(w*h),field=new Float32Array(w*h);
 for(let y=0;y<mh;y++)for(let x=0;x<mw;x++)if([2,3,4].includes(data[y*mw+x])){
  for(let yy=Math.max(0,y-2);yy<=Math.min(mh-1,y+2);yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(mw-1,x+2);xx++)guard[yy*mw+xx]=1;
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,q=f.local(x,y),label=Math.min(mh-1,Math.floor((y+.5)*mh/h))*mw+Math.min(mw-1,Math.floor((x+.5)*mw/w));
  if(q.v>=f.forehead.v-f.eye*.035||data[label]!==1||guard[label])continue;
  field[n]=strength[n];limit[n]=1;
 }
 return softHairEraser(portrait,w,h,field,Math.max(1,Math.min(3,f.eye*.009)),limit);
}
