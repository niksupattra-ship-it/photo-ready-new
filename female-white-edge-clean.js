// Undo white-background colour mixing only in the exterior partial-alpha band.
// Opaque portrait pixels (including white uniforms) and the matte stay intact.
export function cleanFemaleWhiteEdge(src,w,h){
 if(src.length!==w*h*4)throw Error('Invalid portrait edge dimensions');
 const out=Buffer.from(src),at=(x,y)=>(y*w+x)*4;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=at(x,y),a=src[i+3];if(a<8||a>245)continue;
  let exterior=false;
  for(let d=1;d<=3&&!exterior;d++)for(const [xx,yy]of [[x-d,y],[x+d,y],[x,y-d],[x,y+d]])if(xx>=0&&xx<w&&yy>=0&&yy<h&&src[at(xx,yy)+3]<8){exterior=true;break}
  if(!exterior)continue;
  // Do not de-matte arbitrary interior transparency or translucent accessories.
  let candidate=-1,score=Infinity;
  for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){
   const xx=x+dx,yy=y+dy;if(xx<0||xx>=w||yy<0||yy>=h)continue;
   const q=at(xx,yy);if(src[q+3]<250)continue;
   const distance=dx*dx+dy*dy;if(distance<score){candidate=q;score=distance}
  }
  if(candidate<0)continue;
  const alpha=a/255;
  // White spill must be brighter than its nearby solid foreground; retain white fabric.
  const delta=(src[i]+src[i+1]+src[i+2]-src[candidate]-src[candidate+1]-src[candidate+2])/3;
  if(delta<8)continue;
  for(let c=0;c<3;c++)out[i+c]=Math.round(Math.max(0,Math.min(255,(src[i+c]-255*(1-alpha))/alpha)));
 }
 return out;
}
