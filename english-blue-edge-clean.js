/**
 * English-only RGB repair of blue spill from the temporary AI background.
 * MODNet's alpha is never changed. No retouching of the face or intact outfit.
 */
// Exclude strongly saturated actual blue clothing; only mild blue spill is corrected.
const blue=(r,g,b)=>b>=82&&b-r>=23&&b-g>=11&&b-r<=105&&b-g<=65;
export function decontaminateEnglishBlueEdgeRgba(src,w,h){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||src?.length!==w*h*4)throw Error('Invalid English matte');
 const out=Buffer.from(src),offset=(x,y)=>(y*w+x)*4;
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const i=offset(x,y),alpha=src[i+3];
  if(alpha<5||!blue(src[i],src[i+1],src[i+2]))continue;
  // Process only the narrow external alpha boundary, not blue clothing.
  let edge=false;
  for(let d=1;d<=4;d++)if((x-d>=0&&src[offset(x-d,y)+3]<120)||
   (x+d<w&&src[offset(x+d,y)+3]<120)||
   (y-d>=0&&src[offset(x,y-d)+3]<120)||
   (y+d<h&&src[offset(x,y+d)+3]<120)){edge=true;break}
  if(!edge)continue;
  let candidate=-1,score=Infinity;
  const v=src[i]*.2126+src[i+1]*.7152+src[i+2]*.0722;
  for(let dy=-7;dy<=7;dy++){
   const yy=y+dy;if(yy<0||yy>=h)continue;
   for(let dx=-7;dx<=7;dx++){
    const xx=x+dx;if(xx<0||xx>=w||(!dx&&!dy))continue;
    const q=offset(xx,yy);
    if(src[q+3]<245||blue(src[q],src[q+1],src[q+2]))continue;
    const l=src[q]*.2126+src[q+1]*.7152+src[q+2]*.0722;
    const cost=dx*dx+dy*dy+((v-l)/35)**2;
    if(cost<score){score=cost;candidate=q}
   }
  }
  if(candidate<0)continue;
  const spill=Math.min(src[i+2]-src[i],src[i+2]-src[i+1]);
  const weight=Math.min(.93,(alpha<210?.72:.55)+Math.min(.25,spill/180));
  for(let c=0;c<3;c++)out[i+c]=Math.round(src[i+c]*(1-weight)+src[candidate+c]*weight);
 }
 return out;
}
