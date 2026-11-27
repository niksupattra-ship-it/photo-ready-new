import {pr143ReferenceHead} from '../thai-female-head-size.js';
// Placement only: one uniform transform of the untouched native portrait.
// Measure supported opaque rows, ignoring isolated matte noise below the coat.
export function planThaiBodyFrame(pixels,width,height,{W=900,H=1200,head=null,headScale=1,fullBodyFrame=false,crownFromAlpha=false}={}){
 if(![width,height,W,H].every(n=>Number.isInteger(n)&&n>0))return {scale:1,x:0,y:0,applied:false,reason:'unmeasurable'};
 if(!fullBodyFrame)head=pr143ReferenceHead(head,headScale);
 const contain=Math.min(W/width,H/height),fallback={scale:contain,x:(W-width*contain)/2,y:(H-height*contain)/2,applied:false};
 if(pixels?.length!==width*height*4)return {...fallback,reason:'unmeasurable'};
 let crown=-1,bottom=-1;
 const support=Math.max(4,Math.ceil(width*.08));
 for(let y=0;y<height;y++){
  let count=0,body=0;for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>=160){count++;if(x>=width*.3&&x<=width*.7)body++}
  if(crown<0&&count>=Math.max(2,Math.ceil(width*.002)))crown=y;
  if(body>=support)bottom=y;
 }
 if(crown<0||bottom<height*.55||bottom-crown<height*.45)return {...fallback,reason:'insufficient_body'};
 // Use the coat silhouette, not the PNG rectangle: transparent padding must
 // not survive at either side. Sample several lower rows so a noisy last row
 // or a sloping hem cannot determine the crop on its own.
 const rows=[];
 for(let yy=Math.max(crown,Math.floor(bottom-height*.12));yy<=bottom;yy++){
  let left=width,right=-1;
  for(let xx=0;xx<width;xx++)if(pixels[(yy*width+xx)*4+3]>=160){left=Math.min(left,xx);right=xx}
  if(right-left>=width*.3)rows.push({left,right,width:right-left+1});
 }
 rows.sort((a,b)=>a.width-b.width);
 const coat=rows[Math.floor(rows.length*.1)];
 const bleed=2,fill=coat?(W+bleed*2)/coat.width:W/width;
 const top=crownFromAlpha?crown:head?.top??crown;
 // Anchor the supported coat hem first. A smaller head can sit lower in
 // the frame; no forced top margin may lift the hem off the bottom edge.
 const headLimit=head?Math.min(H*.42/head.height,W*.44/head.width):Infinity;
 // New head-only generations use coat width as the sole scale authority.
 // A large detected head or tall source must never shrink the whole person.
 const desired=fullBodyFrame?fill:Math.min(fill,headLimit);
 // Keep the existing uniform scale and horizontal placement. Translate the
 // complete subject down only when its crown violates the minimum clearance.
 // Lower cloth may bleed outside the frame; never shrink the portrait to fit.
 const heightLimit=(H+bleed)/(bottom+1-top);
 const scale=!fullBodyFrame&&desired>heightLimit?(H+bleed-H*.02)/(bottom+1-top):desired;
 const minimumHeadroom=H*.09;
 const bottomY=H+bleed-(bottom+1)*scale;
 const y=Math.max(bottomY,minimumHeadroom-top*scale);
 const crownLimited=y>bottomY+.001;
 const center=fullBodyFrame&&coat?(coat.left+coat.right+1)/2:head?.centerX??(coat?(coat.left+coat.right+1)/2:width/2),x=W/2-center*scale;
 return {scale,x,y,applied:Math.abs(scale-contain)>.000001||Math.abs(y-fallback.y)>.001||Math.abs(x-fallback.x)>.001,reason:'bottom_anchored',bottom,crown:top,coat,headroom:y+top*scale,headFitLimited:!fullBodyFrame&&fill>headLimit,crownLimited};
}

// Upgrade untouched stored placements, including every linked native detail,
// without rewriting a source image or carrying zoom into future hair swaps.
export function fitThaiBodyScene(layers,head,plan,width,height,{opaqueMaskIds=new Set()}={}){
 if(!head?.sourceFrame||!plan?.coat)return layers;
 const subject=layers.filter(l=>l.kind!=='background'&&l.kind!=='source-photo');
 if(head.locked||(head.mask&&!opaqueMaskIds.has(head.id))||head.warpSource||head.eraseRestoreSource||Math.abs(head.x||0)>.001||Math.abs(head.y||0)>.001||Math.abs((head.scale??1)-1)>.000001||Math.abs(head.rotation||0)>.001||Math.abs((head.squeezeX??1)-1)>.000001||Math.abs((head.squeezeY??1)-1)>.000001||head.neckWidth||head.neckHeight)return layers;
 const f=head.sourceFrame,q=plan.scale/(f.w/width),tx=plan.x-q*f.x,ty=plan.y-q*f.y;
 if(Math.abs(q-1)<.000001&&Math.abs(tx)<.001&&Math.abs(ty)<.001)return layers;
 const frame=f=>({x:q*f.x+tx,y:q*f.y+ty,w:q*f.w,h:q*f.h});
 return layers.map(l=>{
  if(!subject.includes(l))return l;
  // Conjugate each accessory pose by the same global portrait transform.
  // This preserves manual offsets, rotation and masks instead of resetting them.
  const vx=tx+(q-1)*450,vy=ty+(q-1)*600,r=(l.rotation||0)*Math.PI/180,sx=(l.scale??1)*(l.squeezeX??1),sy=(l.scale??1)*(l.squeezeY??1);
  const x=q*(l.x||0)+vx-(Math.cos(r)*sx*vx-Math.sin(r)*sy*vy),y=q*(l.y||0)+vy-(Math.sin(r)*sx*vx+Math.cos(r)*sy*vy),pins={};
  for(const key of ['collarLeftX','collarLeftY','collarRightX','collarRightY'])if(Number.isFinite(l[key]))pins[key]=l[key]*q;
  return {...l,x,y,...pins,sourceFrame:frame(l.sourceFrame||{x:0,y:0,w:900,h:1200}),...(l.collarFrame?{collarFrame:frame(l.collarFrame)}:{})};
 });
}
