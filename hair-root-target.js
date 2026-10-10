// Coordinates are normalized to the exact portrait uploaded to the provider.
export function calculateHairRootTarget({brow,nose,chin}){
 const points=[brow,nose,chin];
 if(points.some(p=>!p||![p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('Invalid hair-root landmarks');
 if(!(brow.y<nose.y&&nose.y<chin.y))throw Error('Invalid face landmark order');
 const target={x:brow.x-(chin.x-nose.x),y:brow.y-(chin.y-nose.y)};
 if(target.x<0||target.x>1||target.y<0||target.y>1)throw Error('Hair-root target outside portrait');
 return {brow,nose,chin,target};
}
export function hairRootTargetInstruction(raw){
 if(!raw)return '';
 let data;try{data=calculateHairRootTarget(typeof raw==='string'?JSON.parse(raw):raw)}catch{return ''}
 const pos=p=>`(${(p.x*100).toFixed(2)}% width, ${(p.y*100).toFixed(2)}% height)`;
 return `MEASURED CENTRAL HAIR ROOT — OVERRIDES ALL SOFT HAIRLINE ESTIMATES: Coordinates refer to Image 1, origin top-left. Below-nose/alar-base point ${pos(data.nose)}; chin tip ${pos(data.chin)}; midpoint between the inner eyebrows ${pos(data.brow)}. The central root/scalp junction MUST begin at ${pos(data.target)}. This target is the brow midpoint minus the exact nose-base-to-chin vector: brow-to-central-root distance equals nose-base-to-chin distance along the same face axis. Do not use the old receding hairline, reference-model hairline or a discretionary higher root position. This is the actual root attachment, NOT the top of the hair or fringe endpoint. Curve the lateral root line naturally toward the unchanged temples and ears. Fit hair volume above these roots without a tall floating cap. Keep all facial landmarks, skull, skin finish below the root transition, ears and neck unchanged; do not resize or move the face to meet the target. Generate hair on the upper forehead when needed to reach this measured root target, preserving realistic fine root integration.`;
}
