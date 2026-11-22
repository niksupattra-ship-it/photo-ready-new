// Actual standing-collar fabric and first placket button, never face landmarks.
// Read-only measurement; white/gold source pixels are not edited.
export function measureMaleStandingCollar(image,shoulders){
 const {width:w,height:h,data}=image||{},g=shoulders;
 if(!g||!data||data.length!==w*h*4||g.width<100)return null;
 const span=g.width,cx=(g.left+g.right)/2;
 const x0=Math.max(0,Math.floor(cx-span*.075)),x1=Math.min(w,Math.ceil(cx+span*.075));
 const y0=Math.max(0,Math.floor(g.top+span*.04)),y1=Math.min(h,Math.ceil(g.top+span*.32));
 const rw=x1-x0,rh=y1-y0;if(rw<4||rh<4)return null;
 const mask=new Uint8Array(rw*rh),dilated=new Uint8Array(mask.length);
 for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){
  const i=((y+y0)*w+x+x0)*4,r=data[i],gg=data[i+1],b=data[i+2];
  if(data[i+3]>190&&r>120&&gg>80&&r>b+28&&gg>b+12)mask[y*rw+x]=1;
 }
 for(let y=1;y<rh-1;y++)for(let x=1;x<rw-1;x++)if(mask[y*rw+x])for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)dilated[(y+dy)*rw+x+dx]=1;
 const candidates=[],queue=new Uint32Array(mask.length);
 for(let seed=0;seed<dilated.length;seed++)if(dilated[seed]){
  let head=0,tail=1,minX=rw,maxX=0,minY=rh,maxY=0,gold=0;queue[0]=seed;dilated[seed]=0;
  while(head<tail){const p=queue[head++],x=p%rw,y=Math.floor(p/rw);if(mask[p]){gold++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}
   for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||xx>=rw||yy<0||yy>=rh)continue;const n=yy*rw+xx;if(dilated[n]){dilated[n]=0;queue[tail++]=n}}
  }
  const bw=maxX-minX+1,bh=maxY-minY+1,x=x0+(minX+maxX)/2,y=y0+(minY+maxY)/2;
  if(bw>=span*.014&&bh>=span*.014&&bw<=span*.075&&bh<=span*.075&&bw/bh>.65&&bw/bh<1.5&&gold>bw*bh*.23&&Math.abs(x-cx)<span*.035)candidates.push({x,y,w:bw,h:bh});
 }
 candidates.sort((a,b)=>a.y-b.y);const button=candidates[0];if(!button)return null;
 const fabric=(x,y)=>{x=Math.round(x);y=Math.round(y);if(x<0||x>=w||y<0||y>=h)return false;const i=(y*w+x)*4,r=data[i],gg=data[i+1],b=data[i+2];return data[i+3]>190&&r>166&&gg>166&&b>175&&b>=r-16&&gg>=r-20&&Math.max(r,gg,b)-Math.min(r,gg,b)<55};
 const topAt=x=>{
  for(let y=Math.max(0,Math.floor(g.top-span*.18));y<button.y-button.h*.55;y++){
   let hits=0;for(const dx of [-span*.006,0,span*.006])for(const dy of [0,2,4])if(fabric(x+dx,y+dy))hits++;
   if(hits>=7)return y+2;
  }
  return null;
 };
 const leftX=button.x-span*.060,rightX=button.x+span*.060;
 const leftTop=topAt(leftX),rightTop=topAt(rightX),bottom=button.y-button.h*.55;
 if(leftTop===null||rightTop===null||Math.abs(leftTop-rightTop)>span*.04)return null;
 if([leftTop,rightTop].some(top=>bottom-top<span*.035||bottom-top>span*.22))return null;
 const leftY=leftTop+(bottom-leftTop)*.45,rightY=rightTop+(bottom-rightTop)*.45;
 return {left:{x:leftX,y:leftY},right:{x:rightX,y:rightY},y:(leftY+rightY)/2,button,top:{left:leftTop,right:rightTop},confidence:'standing-collar-fabric-button'};
}
