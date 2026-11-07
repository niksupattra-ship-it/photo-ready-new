// Geometry check, not an identity recognizer. Excludes hairline/forehead landmarks
// because selected hairstyles legitimately expose different forehead areas.
export function faceProportions(face,w,h){
 if(!face||![w,h].every(v=>Number.isFinite(v)&&v>0))return null;
 const point=id=>{const p=face[id];return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?{x:p.x*w,y:p.y*h}:null};
 const a=point(33),b=point(263);if(!a||!b)return null;
 const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<10)return null;
 const cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
 const local=id=>{const p=point(id);if(!p)return null;return {x:((p.x-cx)*dx+(p.y-cy)*dy)/(d*d),y:((p.y-cy)*dx-(p.x-cx)*dy)/(d*d)}};
 const chin=local(152),left=local(234),right=local(454),jl=local(172),jr=local(397),nose=local(1),mouth=local(13);
 if(![chin,left,right,jl,jr,nose,mouth].every(Boolean))return null;
 const metrics={faceWidth:Math.abs(right.x-left.x),jawWidth:Math.abs(jr.x-jl.x),eyeToChin:chin.y,eyeToNose:nose.y,eyeToMouth:mouth.y};
 if(Object.values(metrics).some(v=>!Number.isFinite(v)||v<=.05))return null;
 return metrics;
}
export function compareFaceProportions(original,generated){
 if(!original||!generated)return {ok:false,reason:'unmeasurable'};
 const limits={faceWidth:.12,jawWidth:.12,eyeToChin:.10,eyeToNose:.12,eyeToMouth:.10};
 const changes={};
 for(const key of Object.keys(limits)){
  changes[key]=Math.abs(generated[key]/original[key]-1);
  if(!Number.isFinite(changes[key]))return {ok:false,reason:'unmeasurable'};
 }
 return {ok:Object.keys(limits).every(key=>changes[key]<=limits[key]),reason:'proportions',changes};
}
