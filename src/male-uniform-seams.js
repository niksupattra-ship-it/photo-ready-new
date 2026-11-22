// Read-only seam evidence from the actual garment, excluding skin and gold.
function sampler(image,span){
 const {data,width:w,height:h}=image,d=Math.max(1,Math.round(span*.003));
 const light=(x,y)=>{
  x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=w||y>=h)return null;
  const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2];
  return data[i+3]>190&&Math.min(r,g,b)>145&&Math.max(r,g,b)-Math.min(r,g,b)<60?(r+g+b)/3:null;
 };
 const ridge=(x,y,allowSingle=false)=>{
  const c=light(x,y),a=light(x,y-d*2),b=light(x,y+d*2);
  return allowSingle?(c===null?0:Math.max(0,Math.max(a??c,b??c)-c)):(c===null||a===null||b===null?0:Math.max(0,(a+b)/2-c));
 };
 return {light,ridge,d};
}
export function measureStandingCollarSeams(image,standing,shoulders){
 const span=shoulders.width,{ridge,d}=sampler(image,span),result={};
 for(const side of ['left','right']){
  const x=standing[side].x,top=standing.top[side],limit=standing.bottom;
  let best=null;
  for(let y=Math.ceil(top+span*.025);y<limit;y++){
   const hits=[];
   for(const dx of [-.020,-.010,0,.010,.020]){
    let local=0,at=y;
    for(let dy=-d;dy<=d;dy++){const score=ridge(x+dx*span,y+dy,true);if(score>local){local=score;at=y+dy}}
    if(local>=2)hits.push({score:local,y:at});
   }
   if(hits.length<4)continue;
   const score=(y-top)/(limit-top)+hits.length*.01;
   if(!best||score>best.score)best={y:hits.map(p=>p.y).sort((a,b)=>a-b)[Math.floor(hits.length/2)],score};
  }
  if(!best||best.y-top<span*.025)return null;
  result[side]={x,top,bottom:best.y,score:best.score};
 }
 if(Math.abs(result.left.bottom-result.right.bottom)>span*.035||Math.min(result.left.bottom,result.right.bottom)-Math.max(result.left.top,result.right.top)<span*.025)return null;
 return result;
}
export function measureMalePockets(image,standing,breast,shoulders){
 if(!standing||!breast)return null;
 // One analysis resolution keeps thin stitch lines stable across preview DPR
 // and native image sizes. Only this temporary evidence buffer is resampled.
 if(image.width>500){
  const factor=500/image.width,width=500,height=Math.round(image.height*factor),data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const sx=Math.max(0,Math.min(image.width-1,(x+.5)/factor-.5)),sy=Math.max(0,Math.min(image.height-1,(y+.5)/factor-.5)),x0=Math.floor(sx),y0=Math.floor(sy),dx=sx-x0,dy=sy-y0;
   for(let c=0;c<4;c++){
    const at=(xx,yy)=>image.data[(Math.min(image.height-1,yy)*image.width+Math.min(image.width-1,xx))*4+c];
    data[(y*width+x)*4+c]=(at(x0,y0)*(1-dx)+at(x0+1,y0)*dx)*(1-dy)+(at(x0,y0+1)*(1-dx)+at(x0+1,y0+1)*dx)*dy;
   }
  }
  const found=measureMalePockets({data,width,height},standing,{first:breast.first*factor,second:breast.second*factor},{left:shoulders.left*factor,width:shoulders.width*factor});
  if(!found)return null;
  const unscale=p=>({...p,left:p.left/factor,right:p.right/factor,top:p.top/factor,width:p.width/factor,x:p.x/factor});
  return {left:unscale(found.left),right:unscale(found.right),confidence:found.confidence};
 }
 const span=shoulders.width,{ridge,d}=sampler(image,span),gap=breast.second-breast.first,candidates={};
 const y0=Math.ceil(breast.first+gap*.55),y1=Math.floor(breast.first+gap*1.10);
 for(const [side,lo,hi] of [['left',.06,.46],['right',.54,.94]]){
  const x0=Math.round(shoulders.left+span*lo),x1=Math.round(shoulders.left+span*hi),step=Math.max(1,Math.round(span/450));
  const choices=[];
  for(let y=y0;y<=y1;y+=Math.max(1,d)){
   const points=[];
   for(let x=x0;x<=x1;x+=step){
    let strength=0,at=y;
    for(let dy=-d*2;dy<=d*2;dy++){const score=ridge(x,y+dy);if(score>strength){strength=score;at=y+dy}}
    if(strength>=1.8)points.push({x,y:at,strength});
   }
   // A pocket top must have continuous horizontal support, not a few folds.
   let run=[],runs=[];
   for(const p of points){if(run.length&&p.x-run.at(-1).x>span*.018){runs.push(run);run=[]}run.push(p)}runs.push(run);
   for(const pts of runs){
    if(pts.length<8)continue;
    const left=pts[0].x,right=pts.at(-1).x,width=right-left;
    if(width<span*.17||width>span*.30||pts.length*step/width<.62)continue;
    const top=pts.map(p=>p.y).sort((a,b)=>a-b)[Math.floor(pts.length/2)];
    const score=width/span+Math.min(12,pts.reduce((n,p)=>n+p.strength,0)/pts.length)*.035;
    choices.push({left,right,top,width,x:(left+right)/2,score});
   }
  }
  if(!choices.length)return null;candidates[side]=choices;
 }
 let best=null;
 for(const left of candidates.left)for(const right of candidates.right){
  if(Math.min(left.width,right.width)/Math.max(left.width,right.width)<.82||Math.abs(left.top-right.top)>span*.025)continue;
  const score=left.score+right.score-3*Math.abs(left.width-right.width)/span-2*Math.abs(left.top-right.top)/span;
  if(!best||score>best.score)best={left,right,score};
 }
 return best?{left:best.left,right:best.right,confidence:'measured-pocket-top-seams'}:null;
}
