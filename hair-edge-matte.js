// V234: Correct light matte contamination on dark hair, without altering face,
// opaque hair, skin, clothing or the original person alpha silhouette.
// Operates on raw, straight-alpha RGBA after MODNet; no extra AI/API call.
export function cleanDarkHairFringe(rgba, alpha, width, height) {
  const W=width,H=height;
  const lum=(r,g,b)=>(r*54+g*183+b*19)/256;
  const maxY=Math.floor(H*.77);
  // A short inward search only; avoid transferring colour across large gaps.
  const offsets=[[0,-2],[0,2],[-2,0],[2,0],[0,-4],[0,4],[-4,0],[4,0],[0,-6],[0,6],[-6,0],[6,0]];
  for(let y=0;y<maxY;y++)for(let x=0;x<W;x++){
    const p=y*W+x,a=alpha[p];
    if(a<12||a>242)continue;
    const k=p*4,originalL=lum(rgba[k],rgba[k+1],rgba[k+2]);
    let best=-1,bestA=0;
    for(const [dx,dy] of offsets){
      const nx=x+dx,ny=y+dy;
      if(nx<0||nx>=W||ny<0||ny>=H)continue;
      const q=ny*W+nx,qa=alpha[q];
      if(qa<220||qa<=bestA)continue;
      const t=q*4,innerL=lum(rgba[t],rgba[t+1],rgba[t+2]);
      // Require confidently dark, neutral hair inside the matte. Never use skin.
      if(innerL>105||Math.max(rgba[t],rgba[t+1],rgba[t+2])-Math.min(rgba[t],rgba[t+1],rgba[t+2])>64)continue;
      best=q;bestA=qa;
    }
    if(best<0)continue;
    const j=best*4,insideL=lum(rgba[j],rgba[j+1],rgba[j+2]);
    if(originalL<insideL+23)continue; // preserve normal natural highlights
    // Strength grows with the unwanted bright rim, not with the hair silhouette.
    const strength=Math.min(.95,Math.max(0,(originalL-insideL-19)/75))*(1-Math.max(0,a-210)/90);
    for(let c=0;c<3;c++)rgba[k+c]=Math.round(rgba[k+c]*(1-strength)+rgba[j+c]*strength);
  }
  return rgba;
}
