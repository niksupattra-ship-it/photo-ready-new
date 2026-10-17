// Only the generated image is aligned. The native original face is never
// resized, warped, sharpened, recoloured or sent through another beauty pass.
export function fitYoucamToNative(original,generated,w,h,gw,gh){
 const ids=[33,133,362,263,168,6,197];
 const valid=v=>Number.isFinite(v)&&v>=0&&v<=1;
 if(![w,h,gw,gh].every(v=>Number.isFinite(v)&&v>0)||ids.some(i=>![original?.[i]?.x,original?.[i]?.y,generated?.[i]?.x,generated?.[i]?.y].every(valid)))throw Error('ตรวจตำแหน่งใบหน้าสำหรับประกอบผมไม่ครบ · เก็บภาพเดิมไว้');
 const p=ids.map(i=>({x:generated[i].x*gw,y:generated[i].y*gh})),q=ids.map(i=>({x:original[i].x*w,y:original[i].y*h}));
 const eye=Math.hypot(q[3].x-q[0].x,q[3].y-q[0].y),generatedEye=Math.hypot(p[3].x-p[0].x,p[3].y-p[0].y);
 const failure=()=>Error('สัดส่วนตำแหน่งตาและสันจมูกจาก YouCam ต่างจากภาพเดิม · เก็บภาพเดิมไว้');
 if(eye<20||generatedEye<12)throw Error('ตำแหน่งใบหน้าไม่ชัด · เก็บภาพเดิมไว้');
 const fit=indices=>{
  const mean=(points,key)=>indices.reduce((sum,i)=>sum+points[i][key],0)/indices.length;
  const px=mean(p,'x'),py=mean(p,'y'),qx=mean(q,'x'),qy=mean(q,'y');
  let dot=0,cross=0,den=0;
  for(const i of indices){const x=p[i].x-px,y=p[i].y-py,u=q[i].x-qx,v=q[i].y-qy;dot+=x*u+y*v;cross+=x*v-y*u;den+=x*x+y*y}
  if(den<1)return null;
  const a=dot/den,b=cross/den;
  if(!Number.isFinite(a)||!Number.isFinite(b)||Math.hypot(a,b)<1e-8)return null;
  return {a,b,e:qx-a*px+b*py,f:qy-b*px-a*py};
 };
 const residual=(m,i)=>Math.hypot(m.a*p[i].x-m.b*p[i].y+m.e-q[i].x,m.b*p[i].x+m.a*p[i].y+m.f-q[i].y);
 const tolerance=Math.max(2,eye*.055);
 let best=null;
 // Hair can make one landmark unreliable. Consensus across both eyes and the
 // nose bridge corrects that point without accepting a reshaped face. Canvas
 // crop, padding, resize and roll are removable transforms, not anatomy changes.
 for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
  if(Math.hypot(p[j].x-p[i].x,p[j].y-p[i].y)<generatedEye*.2)continue;
  const matrix=fit([i,j]);if(!matrix)continue;
  const inliers=ids.map((_,k)=>k).filter(k=>residual(matrix,k)<=tolerance);
  if(inliers.length<6||inliers.filter(k=>k<4).length<3||inliers.filter(k=>k>=4).length<2)continue;
  const error=inliers.reduce((sum,k)=>sum+residual(matrix,k)**2,0);
  if(!best||inliers.length>best.inliers.length||(inliers.length===best.inliers.length&&error<best.error))best={inliers,error};
 }
 if(!best)throw failure();
 const matrix=fit(best.inliers);if(!matrix)throw failure();
 const errors=best.inliers.map(i=>residual(matrix,i)),rms=Math.sqrt(errors.reduce((sum,v)=>sum+v*v,0)/errors.length);
 if(rms>Math.max(1.5,eye*.03)||errors.some(v=>v>tolerance))throw failure();
 // Keep a broad image-quality bound after fitting: ordinary provider crops
 // and roll are correctable, but an almost thumbnail-sized or upside-down
 // face cannot supply usable hair at the original portrait's resolution.
 const relativeScale=Math.hypot(matrix.a,matrix.b)/Math.min(w/gw,h/gh);
 if(relativeScale<.2||relativeScale>5||Math.abs(Math.atan2(matrix.b,matrix.a))>Math.PI/3)throw Error('ภาพใบหน้าจาก YouCam เล็กหรือหมุนมากเกินกว่าจะประกอบได้คมชัด · เก็บภาพเดิมไว้');
 return {...matrix,c:-matrix.b,d:matrix.a,rms};
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
