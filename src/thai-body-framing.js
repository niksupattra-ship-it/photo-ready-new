// Placement only: one uniform transform of the untouched native portrait.
// Measure supported opaque rows, ignoring isolated matte noise below the coat.
export function planThaiBodyFrame(pixels,width,height,{W=900,H=1200}={}){
 if(![width,height,W,H].every(n=>Number.isInteger(n)&&n>0))return {scale:1,x:0,y:0,applied:false,reason:'unmeasurable'};
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
 // Preserve the crown. If the native torso is impossibly narrow, retain a
 // safe whole-person crop rather than stretching the face independently.
 const crownLimit=(H+bleed)/(bottom+1-crown),scale=Math.min(Math.max(W/width,(H+bleed)/(bottom+1),fill),crownLimit);
 const y=H+bleed-(bottom+1)*scale,center=coat?(coat.left+coat.right+1)/2:width/2,x=W/2-center*scale;
 return {scale,x,y,applied:Math.abs(scale-contain)>.000001||Math.abs(y-fallback.y)>.001||Math.abs(x-fallback.x)>.001,reason:'bottom_anchored',bottom,crown,coat};
}

// Upgrade untouched stored placements, including every linked native detail,
// without rewriting a source image or carrying zoom into future hair swaps.
export function fitThaiBodyScene(layers,head,plan,width,height){
 if(!head?.sourceFrame||!plan?.coat)return layers;
 const subject=layers.filter(l=>l.kind!=='background'&&l.kind!=='source-photo');
 if(subject.some(l=>l.locked||l.mask||l.warpSource||l.eraseRestoreSource||Math.abs(l.x||0)>.001||Math.abs(l.y||0)>.001||Math.abs((l.scale??1)-1)>.000001||Math.abs(l.rotation||0)>.001||Math.abs((l.squeezeX??1)-1)>.000001||Math.abs((l.squeezeY??1)-1)>.000001))return layers;
 const f=head.sourceFrame,q=plan.scale/(f.w/width),tx=plan.x-q*f.x,ty=plan.y-q*f.y;
 if(Math.abs(q-1)<.000001&&Math.abs(tx)<.001&&Math.abs(ty)<.001)return layers;
 const frame=f=>({x:q*f.x+tx,y:q*f.y+ty,w:q*f.w,h:q*f.h});
 return layers.map(l=>subject.includes(l)?{...l,sourceFrame:frame(l.sourceFrame||{x:0,y:0,w:900,h:1200}),...(l.collarFrame?{collarFrame:frame(l.collarFrame)}:{})}:l);
}
