// Only the generated image is aligned. The native original face is never
// resized, warped, sharpened, recoloured or sent through another beauty pass.
export function fitYoucamToNative(original,generated,w,h,gw,gh){
 const ids=[33,133,362,263,168,6,197];
 if(ids.some(i=>![original?.[i]?.x,original?.[i]?.y,generated?.[i]?.x,generated?.[i]?.y].every(Number.isFinite)))throw Error('ตรวจตำแหน่งใบหน้าสำหรับประกอบผมไม่ครบ · เก็บภาพเดิมไว้');
 const p=ids.map(i=>({x:generated[i].x*gw,y:generated[i].y*gh})),q=ids.map(i=>({x:original[i].x*w,y:original[i].y*h}));
 const mean=a=>a.reduce((m,v)=>({x:m.x+v.x/a.length,y:m.y+v.y/a.length}),{x:0,y:0}),pc=mean(p),qc=mean(q);
 let dot=0,cross=0,den=0;
 for(let i=0;i<p.length;i++){const x=p[i].x-pc.x,y=p[i].y-pc.y,u=q[i].x-qc.x,v=q[i].y-qc.y;dot+=x*u+y*v;cross+=x*v-y*u;den+=x*x+y*y;}
 if(den<1)throw Error('ตำแหน่งใบหน้าไม่ชัด · เก็บภาพเดิมไว้');
 const a=dot/den,b=cross/den,tx=qc.x-a*pc.x+b*pc.y,ty=qc.y-b*pc.x-a*pc.y;
 const scale=Math.hypot(a,b),expected=Math.min(w/gw,h/gh),eye=Math.hypot((original[263].x-original[33].x)*w,(original[263].y-original[33].y)*h);
 let error=0;for(let i=0;i<p.length;i++)error+=(a*p[i].x-b*p[i].y+tx-q[i].x)**2+(b*p[i].x+a*p[i].y+ty-q[i].y)**2;
 const rms=Math.sqrt(error/p.length);
 if(eye<20||scale/expected<.85||scale/expected>1.15||Math.abs(Math.atan2(b,a))>.15||rms>Math.max(1.5,eye*.025))throw Error('ใบหน้าจาก YouCam เคลื่อนหรือผิดสัดส่วนเกินกว่าจะประกอบได้เนียน · เก็บภาพเดิมไว้');
 return {a,b,c:-b,d:a,e:tx,f:ty,rms};
}

// Original skin is restored at native pixel coordinates. Generated bangs and
// side hair may occlude it; inner eyes/brows/nose/lips are explicitly protected.
export function compositeNativeFace(original,generated,skin,oldHair,newHair,faceArea,core,w,h){
 const size=w*h*4;
 if([original,generated,skin,oldHair,newHair,faceArea,core].some(a=>a?.length!==size))throw Error('ข้อมูลประกอบผมไม่ครบ · เก็บภาพเดิมไว้');
 const out=new Uint8ClampedArray(generated);
 for(let k=0;k<size;k+=4){
  if(!original[k+3])continue;
  const strongCore=core[k+3]>=250;
  const region=Math.max(skin[k+3],faceArea[k+3])/255;
  // Brows may be labelled as hair. The anatomical face oval keeps those
  // original pixels unless genuinely occluded by the new hairstyle.
  const source=region*(1-oldHair[k+3]/255*(1-faceArea[k+3]/255)),occlusion=strongCore?0:newHair[k+3]/255;
  const weight=strongCore?1:source*(1-occlusion);
  if(weight<=0)continue;
  if(weight>=.999){out.set(original.subarray(k,k+4),k);continue;}
  const alpha=original[k+3]/255*weight,back=generated[k+3]/255*(1-weight),sum=alpha+back;
  if(sum<=0){out[k+3]=0;continue;}
  for(let c=0;c<3;c++)out[k+c]=Math.round((original[k+c]*alpha+generated[k+c]*back)/sum);
  out[k+3]=Math.round(sum*255);
 }
 return out;
}
