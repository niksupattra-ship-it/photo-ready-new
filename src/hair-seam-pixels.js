// Transparent HAIR-only overlay. Portrait pixels are never replaced or masked.
export function hairSeamOverlay(ai,coverage,skin,w,h,face){
 const out=new Uint8ClampedArray(w*h*4),dx=(face[263].x-face[33].x)*w,dy=(face[263].y-face[33].y)*h;
 const eye=Math.hypot(dx,dy),chinX=face[152].x*w,chinY=face[152].y*h;
 const radius=Math.max(4,Math.min(32,eye*.12)),guard=Math.max(2,eye*.015),cap=radius+guard+2;
 const distance=new Float32Array(w*h);
 for(let i=0;i<distance.length;i++)distance[i]=skin[i*4+3]>0?0:cap;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;let d=distance[i];if(x)d=Math.min(d,distance[i-1]+1);if(y){d=Math.min(d,distance[i-w]+1);if(x)d=Math.min(d,distance[i-w-1]+Math.SQRT2);if(x+1<w)d=Math.min(d,distance[i-w+1]+Math.SQRT2)}distance[i]=d;}
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;let d=distance[i];if(x+1<w)d=Math.min(d,distance[i+1]+1);if(y+1<h){d=Math.min(d,distance[i+w]+1);if(x)d=Math.min(d,distance[i+w-1]+Math.SQRT2);if(x+1<w)d=Math.min(d,distance[i+w+1]+Math.SQRT2)}distance[i]=d;}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,j=i*4,d=distance[i];
  if(!coverage[j+3]||d<=guard||d>=radius+guard||-(x-chinX)*dy+(y-chinY)*dx>=0)continue;
  const t=(d-guard)/radius,fade=1-t*t*(3-2*t),inner=Math.min(1,(d-guard)/Math.max(2,guard));
  out[j]=ai[j];out[j+1]=ai[j+1];out[j+2]=ai[j+2];out[j+3]=Math.round(coverage[j+3]*fade*inner*.75);
 }
 return out;
}
