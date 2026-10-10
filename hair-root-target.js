// Coordinates are normalized to the exact portrait uploaded to the provider.
// The forehead ratio is applied to each portrait's measured brow-to-hairline span.
export function measureCentralForeheadHairline(mask,width,height,brow,eyeDistance){
 if(!(mask instanceof Uint8Array||mask instanceof Uint8ClampedArray)||mask.length!==width*height)throw Error('Invalid hair segmentation mask');
 if(!brow||![brow.x,brow.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid eyebrow landmark');
 if(!Number.isFinite(eyeDistance)||eyeDistance<=0)throw Error('Invalid eye distance');
 const cx=brow.x*width,by=brow.y*height;
 const halfBand=Math.max(3,eyeDistance*.18),topY=Math.max(0,Math.floor(by-eyeDistance*1.8)),bottomY=Math.min(height-1,Math.ceil(by-eyeDistance*.12));
 const left=Math.max(0,Math.floor(cx-halfBand)),right=Math.min(width-1,Math.ceil(cx+halfBand));
 const edgeYs=[];
 // Read the lower edge of the hair mask across a narrow central band. The median
 // ignores a center-part gap and isolated stray strands while following the face.
 for(let x=left;x<=right;x+=Math.max(1,Math.floor(eyeDistance*.012))){
  let last=-1;
  for(let y=topY;y<=bottomY;y++)if(mask[y*width+x]>=200)last=y;
  if(last>=0)edgeYs.push(last);
 }
 if(edgeYs.length<Math.max(6,Math.ceil((right-left+1)/(Math.max(1,Math.floor(eyeDistance*.012)))*.35)))throw Error('Could not measure the forehead hairline');
 edgeYs.sort((a,b)=>a-b);
 // The segmentation's last foreground pixel is immediately above the boundary.
 const hairlineY=edgeYs[Math.floor(edgeYs.length/2)]+1;
 const foreheadTop={x:brow.x,y:hairlineY/height};
 if(!(foreheadTop.y<brow.y))throw Error('Measured hairline is not above the eyebrows');
 return foreheadTop;
}

export function calculateHairRootTarget({brow,foreheadTop}){
 const points=[brow,foreheadTop];
 if(points.some(p=>!p||![p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('Invalid forehead landmarks');
 if(!(foreheadTop.y<brow.y))throw Error('Invalid forehead landmark order');
 // In the supplied proportion guide the red line is 3/4 of the way up
 // from the eyebrow line toward the subject's own upper forehead/hairline.
 const foreheadOffset=3/4;
 const target={x:brow.x-(brow.x-foreheadTop.x)*foreheadOffset,y:brow.y-(brow.y-foreheadTop.y)*foreheadOffset};
 if(target.x<0||target.x>1||target.y<0||target.y>1)throw Error('Hair-root target outside portrait');
 return {brow,foreheadTop,target,foreheadOffset};
}

export function hairRootTargetInstruction(raw){
 if(!raw)return '';
 let data;try{data=calculateHairRootTarget(typeof raw==='string'?JSON.parse(raw):raw)}catch{return ''}
 const pos=p=>`(${(p.x*100).toFixed(2)}% width, ${(p.y*100).toFixed(2)}% height)`;
 return `MEASURED CENTRAL HAIR ROOT — REQUIRED POSITION: Coordinates refer to Image 1, origin top-left. The subject-specific eyebrow midpoint is ${pos(data.brow)} and the subject-specific upper forehead/hairline boundary is ${pos(data.foreheadTop)}. Put the central scalp-to-forehead root junction at ${pos(data.target)}: exactly 75% of the measured eyebrow-to-hairline distance upward from the eyebrows (equivalently, 25% down from the upper forehead boundary). The attached proportion example defines this ratio only; its pixel coordinates do not apply to this subject. The target coordinate above is measured from THIS portrait. Keep the actual roots at this position; do not place only the fringe tips there or leave the scalp junction higher. Do not substitute the reference model's hairline, Image 1's old hairline, or a generic high hairline. Curve the lateral root line naturally toward the unchanged temples and ears. Fit hair volume above the measured roots without a tall floating cap. Keep facial landmarks, skull, visible skin, ears and neck unchanged; do not resize or move the face to meet the target. Reconstruct matching natural forehead skin below the target where needed, and integrate fine roots exactly at the target with realistic strands and contact shadows.`;
}
