export async function currentPortraitPolicy(fetcher=fetch){
 const response=await fetcher('/api/portrait-finish-policy',{cache:'no-store'});
 if(!response.ok)throw Error('ตรวจรุ่นประมวลผลไม่สำเร็จ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง');
 const data=await response.json();
 if(!/^[a-f0-9]{24}$/.test(data.revision||''))throw Error('รุ่นประมวลผลไม่ถูกต้อง กรุณาอัปเดตเซิร์ฟเวอร์และโหลดหน้าใหม่');
 return data.revision;
}

const inPoly=(x,y,p)=>{let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i].y>y)!==(p[j].y>y)&&x<(p[j].x-p[i].x)*(y-p[i].y)/(p[j].y-p[i].y)+p[i].x)inside=!inside;return inside;};
const segmentDistance=(x,y,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);};

// Keep the generated cosmetic pixels, not the uploaded source person's pixels.
// All opaque eye/lip interiors are restored exactly. A narrow outer feather
// joins the unchanged AI cosmetics to the existing post-AI skin finish.
export function retainAiCosmetics(ai,finished,w,h,face){
 if(ai?.length!==w*h*4||finished?.length!==ai.length||!face)throw Error('ข้อมูลภาพสำหรับรักษาสีตาและปากไม่ครบ');
 const eyeGroups=[[[33,246,161,160,159,158,157,173,133], [133,155,154,153,145,144,163,7,33],[70,63,105,66,107]],[[362,398,384,385,386,387,388,466,263],[263,249,390,373,374,380,381,382,362],[336,296,334,293,300]]];
 const lipIds=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
 const required=[234,454,...lipIds,...eyeGroups.flat(2)];
 if(required.some(id=>!Number.isFinite(face[id]?.x)||!Number.isFinite(face[id]?.y)))throw Error('ตรวจตำแหน่งตาหรือปากไม่ครบ');
 const point=id=>({x:face[id].x*w,y:face[id].y*h});
 const fw=Math.abs(face[454].x-face[234].x)*w;if(fw<20)throw Error('ใบหน้าเล็กเกินไปสำหรับรักษาสีแต่งหน้า');
 const regions=eyeGroups.map(([upper,lower,brow])=>{
  const top=upper.map((id,i)=>{const p=point(id),q=point(brow[Math.round(i*(brow.length-1)/(upper.length-1))]);return {x:p.x,y:p.y+(q.y-p.y)*.80};});
  const bottom=lower.map(id=>{const p=point(id);return {x:p.x,y:p.y+fw*.018};});
  return [...top,...bottom];
 });
 regions.push(lipIds.map(point));
 const out=new Uint8ClampedArray(finished),feather=Math.max(1,fw*.012);
 for(const poly of regions){
  const x0=Math.max(0,Math.floor(Math.min(...poly.map(p=>p.x))-feather)),x1=Math.min(w-1,Math.ceil(Math.max(...poly.map(p=>p.x))+feather));
  const y0=Math.max(0,Math.floor(Math.min(...poly.map(p=>p.y))-feather)),y1=Math.min(h-1,Math.ceil(Math.max(...poly.map(p=>p.y))+feather));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const k=(y*w+x)*4;if(ai[k+3]!==finished[k+3]||ai[k+3]<240)continue;
   let weight=1;
   if(!inPoly(x+.5,y+.5,poly)){
    let d=Infinity;for(let i=0;i<poly.length;i++)d=Math.min(d,segmentDistance(x+.5,y+.5,poly[i],poly[(i+1)%poly.length]));
    const t=Math.max(0,1-d/feather);weight=t*t*(3-2*t);
   }
   if(!weight)continue;
   for(let c=0;c<3;c++)out[k+c]=Math.round(ai[k+c]*weight+out[k+c]*(1-weight));
  }
 }
 return out;
}
