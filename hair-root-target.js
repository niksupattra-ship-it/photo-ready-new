// Coordinates are normalized to the exact portrait uploaded to the provider.
// The forehead landmark supplies a per-person guard band so a generic face
// proportion cannot push the new hairline too high or too low.
export function calculateHairRootTarget({brow,nose,chin,forehead}){
 const points=[brow,nose,chin];
 if(points.some(p=>!p||![p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('Invalid hair-root landmarks');
 if(!(brow.y<nose.y&&nose.y<chin.y))throw Error('Invalid face landmark order');
 const rawTarget={x:brow.x-(chin.x-nose.x),y:brow.y-(chin.y-nose.y)};
 let target=rawTarget,bounds=null;
 if(forehead&&[forehead.x,forehead.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)){
  const faceUnit=Math.hypot(chin.x-nose.x,chin.y-nose.y);
  // Landmark 10 estimates the upper forehead. Keep roots close to that
  // subject-specific boundary while retaining the nose-to-chin construction
  // as the central target. The band scales with the subject's own face.
  const minY=Math.max(0,forehead.y+faceUnit*.04);
  const maxY=Math.min(1,forehead.y+faceUnit*.16,brow.y-faceUnit*.35);
  if(maxY>=minY){
   bounds={minY,maxY};
   target={x:rawTarget.x,y:Math.max(minY,Math.min(maxY,rawTarget.y))};
  }
 }
 if(target.x<0||target.x>1||target.y<0||target.y>1)throw Error('Hair-root target outside portrait');
 return {brow,nose,chin,forehead:bounds?forehead:null,target,bounds};
}
export function hairRootTargetInstruction(raw){
 if(!raw)return '';
 let data;try{data=calculateHairRootTarget(typeof raw==='string'?JSON.parse(raw):raw)}catch{return ''}
 const pos=p=>`(${(p.x*100).toFixed(2)}% width, ${(p.y*100).toFixed(2)}% height)`;
 const foreheadRule=data.bounds&&data.forehead?` The detected upper-forehead point is ${pos(data.forehead)}; keep the central roots within the measured vertical band from ${pos({x:data.target.x,y:data.bounds.minY})} to ${pos({x:data.target.x,y:data.bounds.maxY})}.`:' If a usable upper-forehead landmark is unavailable, use the measured central target without guessing a different forehead height.';
 return `MEASURED CENTRAL HAIR ROOT — OVERRIDES ALL SOFT HAIRLINE ESTIMATES: Coordinates refer to Image 1, origin top-left. Below-nose/alar-base point ${pos(data.nose)}; chin tip ${pos(data.chin)}; midpoint between the inner eyebrows ${pos(data.brow)}.${data.forehead?` Upper-forehead reference ${pos(data.forehead)}.`:''} The central root/scalp junction MUST begin at ${pos(data.target)}.${foreheadRule} This target starts from the brow midpoint minus the nose-base-to-chin vector, then is constrained to this person's detected forehead band. Do not use the old receding hairline, reference-model hairline or a discretionary higher/lower root position. This is the actual root attachment, NOT the top of the hair or fringe endpoint. Curve the lateral root line naturally toward the unchanged temples and ears. Fit hair volume above these roots to the existing skull, with no tall floating cap. Keep all facial landmarks, skull, skin finish below the root transition, ears and neck unchanged; do not resize or move the face to meet the target. Generate hair on the upper forehead only as needed to reach this measured root target, preserving realistic fine root integration.`;
}
