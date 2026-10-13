// Male-only cleanup of the processed portrait behind the selected PNG.
// Keep RGB and the replacement PNG intact; erase only confirmed old hair.
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const smooth=value=>{const t=clamp(value,0,1);return t*t*(3-2*t)};

function faceFrame(face,w,h){
 if([33,263,10,127,356,234,454].some(id=>!face?.[id]||![face[id].x,face[id].y].every(Number.isFinite)))return null;
 const dx=(face[263].x-face[33].x)*w,dy=(face[263].y-face[33].y)*h,eye=Math.hypot(dx,dy);
 if(eye<8)return null;
 const c=dx/eye,s=dy/eye,cx=(face[33].x+face[263].x)*w/2,cy=(face[33].y+face[263].y)*h/2;
 const local=(x,y)=>({u:(x-cx)*c+(y-cy)*s,v:-(x-cx)*s+(y-cy)*c});
 const world=(u,v)=>({x:cx+u*c-v*s,y:cy+u*s+v*c});
 const point=id=>local(face[id].x*w,face[id].y*h),width=Math.abs(point(454).u-point(234).u);
 if(width<eye||width>eye*2.5)return null;
 return {eye,width,local,world,point};
}

export function eraseMaleTempleExcess(original,front,w,h,face,labels){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||original?.length!==w*h*4)throw Error('พิกเซลผมเดิมไม่ตรงกับภาพ');
 const out=new Uint8ClampedArray(original),f=faceFrame(face,w,h),data=labels?.data,mw=labels?.width,mh=labels?.height;
 if(!f||front?.length!==original.length||!(data instanceof Uint8Array)||!Number.isInteger(mw)||!Number.isInteger(mh)||mw<1||mh<1||data.length!==mw*mh)return out;
 // A mask too coarse to distinguish the upper ear from hair is not evidence
 // for removing a pixel. Preserve the portrait instead of cutting its ear.
 if(Math.max(w/mw,h/mh)>Math.max(2,f.eye*.12))return out;
 const labelIndex=(x,y)=>x<0||y<0||x>=w||y>=h?-1:Math.min(mh-1,Math.floor((y+.5)*mh/h))*mw+Math.min(mw-1,Math.floor((x+.5)*mw/w));
 const protectedSkin=new Uint8Array(data.length);
 for(let y=0;y<mh;y++)for(let x=0;x<mw;x++)if(data[y*mw+x]===2||data[y*mw+x]===3){
  for(let yy=Math.max(0,y-1);yy<=Math.min(mh-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(mw-1,x+1);xx++)protectedSkin[yy*mw+xx]=1;
 }
 const feather=clamp(f.eye*.02,1.5,2);
 const corners=[[0,0],[w-1,0],[0,h-1],[w-1,h-1]].map(([x,y])=>f.local(x,y));
 // Extend the exterior eraser to the top of the actual image, including tilt.
 const top=Math.floor(Math.min(...corners.map(p=>p.v)))-2;
 const skinSamples=[];
 for(let v=f.eye*.1;v<f.eye*.6;v+=Math.max(1,f.eye*.06))for(let u=-f.eye*.25;u<=f.eye*.25;u+=Math.max(1,f.eye*.06)){
  const p=f.world(u,v),x=Math.round(p.x),y=Math.round(p.y),label=labelIndex(x,y);
  if(label<0||![2,3].includes(data[label]))continue;const j=(y*w+x)*4;
  if(original[j+3]>=180)skinSamples.push((original[j]+original[j+1]+original[j+2])/3);
 }
 if(skinSamples.length<8)return out;
 skinSamples.sort((a,b)=>a-b);const hairLuma=skinSamples[Math.floor(skinSamples.length/2)]*.62;
 for(const sign of [-1,1]){
  const maximumR=Math.max(...corners.map(p=>sign*p.u))+1;
  const temple=f.point(sign<0?127:356),cheek=f.point(sign<0?234:454);
  // Exterior only: never extend the eraser into the inner face/ear side.
  const minimumR=Math.max(f.width*.43,sign*temple.u,sign*cheek.u)+f.eye*.025;
  let earTop=null;
  for(let v=temple.v-f.eye*.3;v<=temple.v+f.eye*.15;v+=Math.max(1,f.eye*.015)){
   let run=0;
   for(let r=minimumR;r<=Math.min(maximumR,minimumR+f.eye*.28);r+=Math.max(1,f.eye*.015)){
    const p=f.world(sign*r,v),x=Math.round(p.x),y=Math.round(p.y),label=labelIndex(x,y);
    if(label<0)continue;const j=(y*w+x)*4;
    if([2,3].includes(data[label])&&original[j+3]>=180){if(++run>=2){earTop=v;break}}else run=0;
   }
   if(earTop!==null)break;
  }
  // Stop ABOVE the observed upper ear. Uncertain anatomy uses a larger guard.
  const bottom=Math.min(temple.v,earTop??temple.v-f.eye*.20)-Math.max(feather,f.eye*.025);
  if(bottom-top<f.eye*.12)continue;
  // Confirm the photographed face just inside this temple before using its
  // mask. This also makes an all-hair or empty/uncertain mask fail closed.
  let skin=0;
  const step=Math.max(1,f.eye*.05);
  for(let v=temple.v-f.eye*.12;v<=temple.v+f.eye*.08;v+=step)for(let r=f.width*.25;r<=f.width*.40;r+=step){
   const p=f.world(sign*r,v),index=labelIndex(p.x,p.y);
   if(index>=0&&(data[index]===2||data[index]===3))skin++;
  }
  if(skin<4)continue;
  const origin=Math.floor(top)-2,count=Math.ceil(bottom-origin)+3,outer=new Float32Array(count),inner=new Float32Array(count),hits=new Uint16Array(count),maximumAlpha=new Uint8Array(count);
  outer.fill(-Infinity);inner.fill(Infinity);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const alpha=front[(y*w+x)*4+3];if(alpha<96)continue;
   const q=f.local(x,y),r=sign*q.u;
   if(q.v<top||q.v>bottom||r<minimumR||r>maximumR)continue;
   const row=Math.round(q.v-origin);maximumAlpha[row]=Math.max(maximumAlpha[row],alpha);
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const alpha=front[(y*w+x)*4+3];if(alpha<96)continue;
   const q=f.local(x,y),r=sign*q.u;
   if(q.v<top||q.v>bottom||r<minimumR||r>maximumR)continue;
   const row=Math.round(q.v-origin);
   // Supplied tips may fade throughout the whole row. Measure their material
   // relative to that row's strongest alpha, while excluding the outer fringe.
   if(alpha<Math.min(224,Math.max(96,maximumAlpha[row]*.85)))continue;
   outer[row]=Math.max(outer[row],r);inner[row]=Math.min(inner[row],r);hits[row]++;
  }
  let valid=0,first=null,last=null;
  for(let i=0;i<count;i++){
   if(hits[i]<2||outer[i]-inner[i]<1){outer[i]=-Infinity;continue}
   valid++;if(first===null)first=i;last=i;
  }
  if(valid<4||last-first<f.eye*.08)continue;
  // Average neighbouring material contour samples, rather than carrying the
  // photographed cap's jagged outline into the eraser. Extend only UPWARD
  // from the first verified material row; never extend down into the ear.
  const contour=new Float32Array(outer);
  for(let i=0;i<count;i++)if(Number.isFinite(outer[i])){
   let sum=0,weight=0;
   for(let k=Math.max(0,i-1);k<=Math.min(count-1,i+1);k++)if(Number.isFinite(outer[k])&&Math.abs(outer[k]-outer[i])<=f.eye*.10){const part=2-Math.abs(k-i);sum+=outer[k]*part;weight+=part}
   contour[i]=sum/weight;
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const n=y*w+x,j=n*4;if(!original[j+3]||front[j+3]>=248)continue;
   const index=labelIndex(x,y);if(index<0||data[index]!==1||protectedSkin[index])continue;
   // Skin-coloured upper-ear pixels stay intact even if labelled as hair.
   if((original[j]+original[j+1]+original[j+2])/3>=hairLuma)continue;
   const q=f.local(x,y),r=sign*q.u;if(q.v<=top||q.v>=bottom||r<minimumR||r>maximumR)continue;
   const row=Math.round(q.v-origin),edge=row<first?contour[first]:contour[row];if(!Number.isFinite(edge))continue;
   // Start the short fade beneath the translucent exterior fringe so old
   // dark cap pixels cannot make that fringe look like a solid painted rim.
   const strength=smooth((r-edge+feather*.5)/feather)*smooth((bottom-q.v)/feather);
   if(strength>0)out[j+3]=Math.round(original[j+3]*(1-strength));
  }
 }
 return out;
}
