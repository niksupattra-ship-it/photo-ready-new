// Checks geometric consistency, not a person's identity. Measurements ignore
// translation, image scale and whole-head roll; no photo pixels are changed.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function portraitProtectedFeatures(face,width,height){
 if(!face||![width,height].every(v=>Number.isFinite(v)&&v>0))return null;
 const ids=[33,133,263,362,159,145,160,144,158,153,386,374,385,380,387,373,98,327,61,291,13,14,468,469,470,471,472,473,474,475,476,477];
 if(ids.some(id=>!Number.isFinite(face[id]?.x)||!Number.isFinite(face[id]?.y)))return null;
 const point=id=>({x:face[id].x*width,y:face[id].y*height});
 const a=point(33),b=point(263),span=distance(a,b);if(span<20)return null;
 const angle=Math.atan2(b.y-a.y,b.x-a.x),result={noseWidth:distance(point(98),point(327))/span,mouthWidth:distance(point(61),point(291))/span};
 const mouthWidth=distance(point(61),point(291));if(mouthWidth<4)return null;
 result.mouthOpening=distance(point(13),point(14))/mouthWidth;
 for(const [side,corners,lids,iris,rim]of [
  ['left',[33,133],[[159,145],[160,144],[158,153]],468,[469,470,471,472]],
  ['right',[362,263],[[386,374],[385,380],[387,373]],473,[474,475,476,477]],
 ]){
  const l=point(corners[0]),r=point(corners[1]),w=distance(l,r);if(w<6)return null;
  const ux=(r.x-l.x)/w,uy=(r.y-l.y)/w,c=point(iris);
  const diameter=rim.reduce((sum,id)=>sum+distance(point(id),c)*2,0)/rim.length/w;
  if(diameter<.08||diameter>.9)return null;
  const opening=lids.reduce((sum,[top,bottom])=>sum+Math.abs((point(bottom).x-point(top).x)*-uy+(point(bottom).y-point(top).y)*ux),0)/lids.length/w;
  result[side]={width:w/span,opening,tilt:Math.atan2(Math.sin(Math.atan2(r.y-l.y,r.x-l.x)-angle),Math.cos(Math.atan2(r.y-l.y,r.x-l.x)-angle)),gazeX:((c.x-l.x)*ux+(c.y-l.y)*uy)/w,gazeY:((c.x-l.x)*-uy+(c.y-l.y)*ux)/w,irisDiameter:diameter};
 }
 return result;
}

export function comparePortraitProtectedFeatures(original,generated){
 if(!original||!generated)return {ok:false,reason:'unmeasurable',changes:[]};
 const changes=[];
 const check=(region,key,a,b,limit)=>{
  if(!Number.isFinite(a)||!Number.isFinite(b))changes.push({region,key,unmeasurable:true});
  else if(Math.abs(a-b)>limit)changes.push({region,key,difference:Math.abs(a-b),limit});
 };
 // Landmark detectors vary by a few pixels between the untouched upload and a
 // generated image, even when the visible feature is effectively unchanged.
 // Allow that small measurement jitter but keep meaningful geometry/gaze drift
 // rejected. These are comparison tolerances only; no pixels are modified.
 for(const [key,limit]of [['noseWidth',.045],['mouthWidth',.055],['mouthOpening',.07]])check('face',key,original[key],generated[key],limit);
 for(const side of ['left','right']){
  const a=original[side],b=generated[side];if(!a||!b)return {ok:false,reason:'unmeasurable',changes:[]};
  for(const [key,limit]of [['width',.05],['opening',.07],['gazeX',.075],['gazeY',.06],['irisDiameter',.07]])check(side,key,a[key],b[key],limit);
  const tilt=Math.atan2(Math.sin(b.tilt-a.tilt),Math.cos(b.tilt-a.tilt));check(side,'tilt',0,tilt,Math.PI/36);
 }
 return {ok:changes.length===0,reason:changes.some(c=>c.unmeasurable)?'unmeasurable':'features',changes};
}
