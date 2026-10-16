// Semantic skin is a search guide only. Trace native pixels rather than using
// the 256px segmentation outline as the final cut. Never alter portrait RGB.
export function lowerPortraitOutline(rgba,w,h,skin,clothes,{startY,faceWidth,chinY=h}={}){
 if(rgba.length!==w*h*4||skin?.length!==rgba.length||clothes?.length!==rgba.length||!Number.isFinite(startY)||!Number.isFinite(faceWidth)||faceWidth<12)return null;
 const rows=new Array(h),start=Math.max(0,Math.floor(startY)),search=Math.max(8,Math.ceil(faceWidth*.055));
 for(let y=start;y<h;y++){
  let bestL=-1,bestR=-1,l=-1;
  for(let x=0;x<=w;x++){
   const k=(y*w+x)*4,on=x<w&&skin[k+3]>=128&&rgba[k+3]>=32&&clothes[k+3]<128;
   if(on&&l<0)l=x;
   if(!on&&l>=0){
    // Join skin runs across mouth/nose shadows. Never mistake one cheek for
    // the entire face and cut through inner facial features.
    if(x-l>=Math.max(3,faceWidth*.02)){if(bestL<0)bestL=l;bestR=x-1;}
    l=-1;
   }
  }
  const minimumWidth=faceWidth*(y<chinY?.45:.18);
  if(bestR-bestL<minimumWidth)continue;
  const middle=(bestL+bestR)/2,half=(bestR-bestL)*.18;
  let r=0,g=0,b=0,n=0;
  for(let x=Math.ceil(middle-half);x<=Math.floor(middle+half);x++){
   const k=(y*w+x)*4;if(rgba[k+3]<192)continue;
   r+=rgba[k];g+=rgba[k+1];b+=rgba[k+2];n++;
  }
  if(n<3)continue;r/=n;g/=n;b/=n;
  const tone=.2126*r+.7152*g+.0722*b;
  const nativeSkin=x=>{
   if(x<0||x>=w)return false;const k=(y*w+x)*4;if(rgba[k+3]<24||clothes[k+3]>=128)return false;
   const dr=rgba[k]-r,dg=rgba[k+1]-g,db=rgba[k+2]-b;
   const light=.2126*rgba[k]+.7152*rgba[k+1]+.0722*rgba[k+2];
   // Ambiguous heavy shadows/beard are not forcibly converted to an outline.
   return dr*dr+dg*dg+db*db<3*65*65&&light>tone*.52;
  };
  const edge=(seed,step)=>{
   let x=seed;
   // Locate the native transition within a bounded band around semantic skin.
   if(!nativeSkin(x)){
    let found=false;
    for(let d=1;d<=search;d++){const xx=seed-step*d;if(nativeSkin(xx)){x=xx;found=true;break;}}
    if(!found)return null;
   }
   for(let d=0;d<=search*2;d++){
    const next=x+step;if(!nativeSkin(next))return step<0?x-.5:x+.5;
    x=next;
   }
   return null;
  };
  const left=edge(bestL,-1),right=edge(bestR,1);
  if(left===null||right===null||right-left<minimumWidth||Math.abs(left-bestL)>search||Math.abs(right-bestR)>search)continue;
  rows[y]={left,right};
 }
 const out=new Uint8ClampedArray(rgba);let changed=0;
 for(let y=start;y<h;y++){
  const row=rows[y];if(!row)continue;
  const smooth=side=>{
   const values=[];for(let dy=-2;dy<=2;dy++)if(rows[y+dy])values.push(rows[y+dy][side]);
   values.sort((a,b)=>a-b);const median=values[Math.floor(values.length/2)];
   // Subpixel contour smoothing; never replace the real jaw/neck with a template.
   return row[side]+Math.max(-.75,Math.min(.75,median-row[side]));
  };
  const left=smooth('left'),right=smooth('right');
  // Clear the complete exterior, not a bounded strip that leaves detached hair panels.
  for(let x=0;x<w;x++){
   const k=(y*w+x)*4;if(!rgba[k+3])continue;
   // Keep confidently classified opaque skin, including dark natural shadows.
   // Uncertain hairs overlapping skin need a separate local repair, not erosion.
   if(skin[k+3]>=128&&rgba[k+3]>=192)continue;
   // A one-native-pixel coverage transition, with every inner pixel unchanged.
   const coverage=Math.max(0,Math.min(1,Math.min(x+.5-left,right-x+.5)+.5));
   if(coverage>=1)continue;
   const alpha=Math.round(rgba[k+3]*coverage);
   if(alpha!==out[k+3]){out[k+3]=alpha;changed++;}
  }
 }
 return changed?out:null;
}
