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

// Strict geometry check for NEW Thai V12 full-outfit jobs only.
// Ratios are normalized by interpupillary scale so uniform head
// resizing/translation cannot itself be mistaken for slimming.
export function compareThaiFaceShape(original,generated){
 if(!original||!generated)return {ok:false,reason:'unmeasurable'};
 const limits={faceWidth:.065,jawWidth:.065,eyeToChin:.065,eyeToNose:.085,eyeToMouth:.085};
 const changes={};
 for(const [name,limit] of Object.entries(limits)){
  const a=original[name],b=generated[name];
  if(![a,b].every(v=>Number.isFinite(v)&&v>.05))return {ok:false,reason:'unmeasurable'};
  changes[name]=Math.abs(b/a-1);
 }
 const initialAspect=original.eyeToChin/original.faceWidth,finalAspect=generated.eyeToChin/generated.faceWidth;
 const originalJaw=original.jawWidth/original.faceWidth,finalJaw=generated.jawWidth/generated.faceWidth;
 const aspectDelta=Math.abs(finalAspect/initialAspect-1),jawRatioDelta=Math.abs(finalJaw/originalJaw-1);
 if(![aspectDelta,jawRatioDelta].every(Number.isFinite))return {ok:false,reason:'unmeasurable'};
 const ok=Object.entries(limits).every(([name,limit])=>changes[name]<=limit)&&aspectDelta<=.065&&jawRatioDelta<=.065;
 return {ok,reason:ok?'preserved':'face_geometry_changed',changes,aspectDelta,jawRatioDelta};
}
