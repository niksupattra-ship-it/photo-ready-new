// Geometry evidence only. No face pixels, iris textures or catchlights are edited.
export function eyeIdentityMetrics(face,width,height){
 if(!face||![width,height].every(v=>Number.isFinite(v)&&v>0))return null;
 const point=id=>{const p=face[id];return p&&[p.x,p.y].every(Number.isFinite)?{x:p.x*width,y:p.y*height}:null};
 const eyes=[];
 for(const [outer,inner,upper,lower,iris,ring] of [[33,133,159,145,468,[469,470,471,472]],[362,263,386,374,473,[474,475,476,477]]]){
  const [a,b,u,l,c,...r]=[outer,inner,upper,lower,iris,...ring].map(point);
  if(![a,b,u,l,c,...r].every(Boolean))return null;
  const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<8)return null;
  const local=p=>({x:((p.x-a.x)*dx+(p.y-a.y)*dy)/(d*d),y:((p.y-a.y)*dx-(p.x-a.x)*dy)/(d*d)});
  const irisPosition=local(c),opening=Math.abs(local(l).y-local(u).y),radius=r.reduce((s,p)=>s+Math.hypot(p.x-c.x,p.y-c.y),0)/r.length/d;
  if(opening<.04||opening>.7||radius<.04||radius>.4||irisPosition.x<.15||irisPosition.x>.85||Math.abs(irisPosition.y)>.4)return null;
  eyes.push({gazeX:irisPosition.x,gazeY:irisPosition.y,opening,radius});
 }
 return eyes;
}
export function compareThaiEyeIdentity(original,generated){
 if(!original||!generated||original.length!==2||generated.length!==2)return {action:'review',reason:'unmeasurable'};
 if([...original,...generated].some(e=>!e||!['gazeX','gazeY','opening','radius'].every(k=>Number.isFinite(e[k]))||e.opening<=0||e.radius<=0))return {action:'review',reason:'unmeasurable'};
 const changes=original.map((a,i)=>{const b=generated[i];return {gaze:Math.hypot(b.gazeX-a.gazeX,b.gazeY-a.gazeY),opening:Math.abs(b.opening/a.opening-1),iris:Math.abs(b.radius/a.radius-1)}});
 if(changes.some(c=>Object.values(c).some(v=>!Number.isFinite(v))))return {action:'review',reason:'unmeasurable'};
 const changed=changes.some(c=>c.gaze>.14||c.opening>.35||c.iris>.25);
 return {action:changed?'reject':'accept',reason:changed?'eye_geometry_changed':'preserved',changes};
}
