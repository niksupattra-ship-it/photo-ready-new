export const isSingleFemaleHair=id=>id==='hair-18'||/^hair-2[1-9]$/.test(id);

// Fit actual PNG inner edges to visible upper-ear skin, rather than only
// matching landmark positions. The outer outline and crown stay pinned.
export function fitUpperEarGaps(placed,skin,face,w,h,makeCanvas){
 const p=i=>({x:face[i].x*w,y:face[i].y*h}),l=p(33),r=p(263);
 const angle=Math.atan2(r.y-l.y,r.x-l.x),cs=Math.cos(angle),sn=Math.sin(angle),eye=Math.hypot(r.x-l.x,r.y-l.y),center={x:(l.x+r.x)/2,y:(l.y+r.y)/2};
 if(!skin||!Number.isFinite(eye)||eye<5||!face[127]||!face[356])throw Error('ตรวจช่องว่างเหนือหูไม่สำเร็จ');
 const local=q=>({x:(q.x-center.x)*cs+(q.y-center.y)*sn,y:-(q.x-center.x)*sn+(q.y-center.y)*cs});
 const world=(x,y)=>({x:center.x+x*cs-y*sn,y:center.y+x*sn+y*cs});
 const width=Math.abs(local(p(454)).x-local(p(234)).x),pd=placed.getContext('2d').getImageData(0,0,w,h).data,sd=skin.getContext('2d').getImageData(0,0,w,h).data;
 const at=(data,x,y)=>{const q=world(x,y),ix=Math.round(q.x),iy=Math.round(q.y);return ix<0||iy<0||ix>=w||iy>=h?0:data[(iy*w+ix)*4+3]};
 const profiles={};
 for(const sign of [-1,1]){
  const ear=local(p(sign<0?127:356)),top=ear.y-eye*.4,bottom=ear.y+eye*.55,count=Math.ceil(bottom-top),rows=[];
  for(let i=0;i<=count;i++){
   const y=top+(bottom-top)*i/count;let edge=0,inner=null,outer=0;
   for(let radius=width*.2;radius<=width*.5+eye*.25;radius++)if(at(sd,sign*radius,y)>180)edge=radius;
   if(edge>0)for(let radius=Math.max(width*.25,edge-eye*.05);radius<=edge+eye*.45;radius++)if(at(pd,sign*radius,y)>80){if(inner===null)inner=radius;outer=radius}
   const distance=Math.abs((y-ear.y)/eye),t=Math.max(0,Math.min(1,(distance-.18)/.32)),weight=1-t*t*(3-2*t);
   const gap=inner===null?0:Math.max(0,inner-edge);
   rows.push({inner,outer,push:gap>0&&outer>inner+1?Math.min(eye*.35,gap+Math.max(1,eye*.02))*weight:0});
  }
  profiles[sign]={top,bottom,count,rows};
 }
 const out=makeCanvas(w,h),ctx=out.getContext('2d'),d=ctx.createImageData(w,h);d.data.set(pd);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const q=local({x,y}),sign=q.x<0?-1:1,profile=profiles[sign];if(q.y<profile.top||q.y>profile.bottom)continue;
  const index=(q.y-profile.top)/(profile.bottom-profile.top)*profile.count,i=Math.min(profile.count,Math.floor(index)),next=profile.rows[Math.min(profile.count,i+1)],row=profile.rows[i],t=index-i;
  if(row.inner===null||next.inner===null)continue;
  const inner=row.inner*(1-t)+next.inner*t,outer=row.outer*(1-t)+next.outer*t,push=row.push*(1-t)+next.push*t,radius=Math.abs(q.x),targetInner=inner-push;
  if(push<=.1||radius<targetInner||radius>=outer)continue;
  // One continuous stretch of existing hair; no second copy or borrowed rows.
  const sourceRadius=inner+(radius-targetInner)/(outer-targetInner)*(outer-inner),point=world(sign*sourceRadius,q.y),ix=Math.floor(point.x),iy=Math.floor(point.y),dx=point.x-ix,dy=point.y-iy;
  let alpha=0,red=0,green=0,blue=0;
  for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
   const sx=ix+xx,sy=iy+yy;if(sx<0||sx>=w||sy<0||sy>=h)continue;
   const j=(sy*w+sx)*4,part=pd[j+3]*(xx?dx:1-dx)*(yy?dy:1-dy);alpha+=part;red+=pd[j]*part;green+=pd[j+1]*part;blue+=pd[j+2]*part;
  }
  const j=(y*w+x)*4;d.data[j]=alpha?red/alpha:0;d.data[j+1]=alpha?green/alpha:0;d.data[j+2]=alpha?blue/alpha:0;d.data[j+3]=alpha;
 }
 ctx.putImageData(d,0,0);return out;
}

// Erase ONLY original portrait hair visible outside the fitted PNG.
// This changes its reversible eraser mask, never portrait or hairstyle RGB.
export function originalHairExcessMask(originalHair,coverage,skin,w,h,makeCanvas){
 if(!originalHair||!coverage||!skin)throw Error('ตรวจผมส่วนเกินไม่สำเร็จ · เก็บภาพเดิมไว้');
 const hair=originalHair.getContext('2d').getImageData(0,0,w,h).data;
 const fitted=coverage.getContext('2d').getImageData(0,0,w,h).data;
 const protectedSkin=skin.getContext('2d').getImageData(0,0,w,h).data;
 const excess=makeCanvas(w,h),ec=excess.getContext('2d'),ed=ec.createImageData(w,h);
 for(let i=0;i<w*h;i++){const j=i*4;ed.data[j]=ed.data[j+1]=ed.data[j+2]=255;ed.data[j+3]=Math.round(hair[j+3]*(1-fitted[j+3]/255)*(1-protectedSkin[j+3]/255))}
 ec.putImageData(ed,0,0);
 const soft=makeCanvas(w,h),sx=soft.getContext('2d');sx.filter='blur(1px)';sx.drawImage(excess,0,0);
 const sd=sx.getImageData(0,0,w,h).data,out=makeCanvas(w,h),ctx=out.getContext('2d'),mask=ctx.createImageData(w,h);
 for(let i=0;i<w*h;i++){const j=i*4;mask.data[j]=mask.data[j+1]=mask.data[j+2]=255;mask.data[j+3]=Math.round(255-Math.max(sd[j+3],ed.data[j+3])*(1-fitted[j+3]/255)*(1-protectedSkin[j+3]/255))}
 ctx.putImageData(mask,0,0);return out;
}
