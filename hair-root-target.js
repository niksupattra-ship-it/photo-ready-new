// Coordinates are normalized to the exact portrait uploaded to the provider.
export function calculateHairRootTarget({brow,nose,chin}){
 const points=[brow,nose,chin];
 if(points.some(p=>!p||![p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('Invalid hair-root landmarks');
 if(!(brow.y<nose.y&&nose.y<chin.y))throw Error('Invalid face landmark order');
 // Lower the former full nose-to-chin root estimate by one third toward the brows.
 // Keep two thirds of that measured brow-to-root distance above the eyebrow line.
 const rootOffset=2/3;
 const target={x:brow.x-(chin.x-nose.x)*rootOffset,y:brow.y-(chin.y-nose.y)*rootOffset};
 if(target.x<0||target.x>1||target.y<0||target.y>1)throw Error('Hair-root target outside portrait');
 return {brow,nose,chin,target};
}
export function hairRootTargetInstruction(raw){
 if(!raw)return '';
 let data;try{data=calculateHairRootTarget(typeof raw==='string'?JSON.parse(raw):raw)}catch{return ''}
 const pos=p=>`(${(p.x*100).toFixed(2)}% width, ${(p.y*100).toFixed(2)}% height)`;
 return `MEASURED CENTRAL HAIR ROOT — OVERRIDES ALL SOFT HAIRLINE ESTIMATES: Coordinates refer to Image 1, origin top-left. Below-nose/alar-base point ${pos(data.nose)}; chin tip ${pos(data.chin)}; eyebrow midpoint ${pos(data.brow)}. The central root/scalp junction MUST begin at ${pos(data.target)}. Compared with the previous estimate one full nose-base-to-chin distance above the brow midpoint, this root target is lowered by exactly one third toward the eyebrow line; the final brow-to-root distance is two thirds of that measured vector. Keep the root on the forehead above the brows. Do not use the old receding hairline, reference-model hairline or a discretionary higher root position. This is the actual root attachment, NOT the top of the hair or fringe endpoint. Curve the lateral root line naturally toward the unchanged temples and ears. Fit hair volume above these roots without a tall floating cap. Keep all facial landmarks, skull, skin finish below the root transition, ears and neck unchanged; do not resize or move the face to meet the target. Generate hair on the upper forehead when needed to reach this measured root target, preserving realistic fine root integration.`;
}
