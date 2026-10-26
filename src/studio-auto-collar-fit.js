// Bounded analysis only. This module never writes portrait or template pixels.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const validPixels=(pixels,w,h)=>pixels?.length===w*h*4&&Number.isInteger(w)&&Number.isInteger(h)&&w>1&&h>1&&w<=1024&&h<=1024;
const colour=(r,g,b)=>({y:.299*r+.587*g+.114*b,cb:-.168736*r-.331264*g+.5*b,cr:.5*r-.418688*g-.081312*b});

export function measureCollarOpeningProfile({pixels,width,height,centerX=width*.5,minY=0,maxY=height*.55}){
 if(!validPixels(pixels,width,height)||!Number.isFinite(centerX))return [];
 const result=[],cx=Math.round(centerX),run=Math.max(2,Math.round(width*.004)),step=Math.max(1,Math.floor(Math.max(width,height)/256));
 const opaque=(x,y)=>x>=0&&x<width&&pixels[(y*width+x)*4+3]>96;
 for(let y=Math.max(0,Math.ceil(minY));y<=Math.min(height-1,Math.floor(maxY));y+=step){
  if(cx<0||cx>=width||opaque(cx,y))continue;
  const edge=direction=>{let count=0;for(let offset=0;offset<=width*.32;offset++){const x=cx+direction*offset;if(x<0||x>=width)return null;if(opaque(x,y)){if(++count>=run)return x-direction*(run-1)}else count=0}return null};
  const left=edge(-1),right=edge(1);if(left===null||right===null||right-left<width*.025||right-left>width*.55)continue;
  result.push({y,left,right,width:right-left,centerX:(left+right)/2});
 }
 return result;
}

export function measureSkinNeckProfile({pixels,width,height,face}){
 if(!validPixels(pixels,width,height)||[10,152,234,454].some(i=>!face?.[i]||![face[i].x,face[i].y].every(Number.isFinite)))return {rows:[],confidence:0};
 const point=i=>({x:face[i].x*width,y:face[i].y*height});
 const left=point(234),right=point(454),chin=point(152),top=point(10),fw=Math.hypot(right.x-left.x,right.y-left.y),fh=Math.hypot(chin.x-top.x,chin.y-top.y),cx=(left.x+right.x)/2;
 if(fw<12||fh<12||fh>height*.95||fw>width*.95)return {rows:[],confidence:0};
 const samples=[];
 for(const [dx,dy] of [[-.22,-.30],[.22,-.30],[0,-.72]]){
  const radius=Math.max(1,Math.round(fw*.018)),x=Math.round(cx+dx*fw),y=Math.round(chin.y+dy*fh);
  for(let yy=y-radius;yy<=y+radius;yy++)for(let xx=x-radius;xx<=x+radius;xx++){
   if(xx<0||xx>=width||yy<0||yy>=height)continue;const j=(yy*width+xx)*4;
   if(pixels[j+3]<160)continue;const c=colour(pixels[j],pixels[j+1],pixels[j+2]);if(c.y>12&&c.y<252)samples.push(c);
  }
 }
 if(samples.length<6)return {rows:[],confidence:0};
 const reference={y:median(samples.map(c=>c.y)),cb:median(samples.map(c=>c.cb)),cr:median(samples.map(c=>c.cr))};
 // Achromatic fabric/background cannot establish a neck skin reference.
 if(Math.hypot(reference.cb,reference.cr)<5)return {rows:[],confidence:0};
 const skin=(x,y)=>{
  if(x<0||x>=width||y<0||y>=height)return false;const j=(y*width+x)*4;if(pixels[j+3]<128)return false;
  const c=colour(pixels[j],pixels[j+1],pixels[j+2]);
  return c.y>Math.max(8,reference.y*.46)&&c.y<Math.min(255,reference.y*1.45+15)&&Math.hypot(c.cb-reference.cb,c.cr-reference.cr)<25;
 };
 const rows=[],step=Math.max(1,Math.round(fh*.018)),start=Math.max(0,Math.round(chin.y+fh*.045)),end=Math.min(height-1,Math.round(chin.y+fh*1.5));
 let misses=0,complete=false;
 for(let y=start;y<=end;y+=step){
  // Search a small central neighbourhood so a shadow on the centreline does
  // not mistake detached hair at either side for the person's neck.
  let seed=null;for(let dx=0;dx<=Math.max(1,fw*.07)&&seed===null;dx++)for(const sign of [1,-1]){const x=Math.round(chin.x+dx*sign);if(skin(x,y)){seed=x;break}}
  if(seed===null){if(rows.length&&++misses>=3){complete=true;break}continue}
  const edge=direction=>{let last=seed,miss=0;for(let d=1;d<=fw*.55;d++){const x=seed+direction*d;if(skin(x,y)){last=x;miss=0}else if(++miss>Math.max(1,Math.round(fw*.012)))break}return last};
  const l=edge(-1),r=edge(1),span=r-l;
  if(span<fw*.18||span>fw*1.2||Math.abs((l+r)/2-chin.x)>fw*.18){if(rows.length&&++misses>=3){complete=true;break}continue}
  misses=0;
  rows.push({y,left:l,right:r});
 }
 if(rows.length&&end>=height-step-1)complete=true;
 return {rows,confidence:clamp(rows.length/8,0,1),faceWidth:fw,faceHeight:fh,chin,reference,topY:rows[0]?.y??null,bottomY:rows[rows.length-1]?.y??null,complete};
}

function widthCoefficient(x,y,frame,smoothTop){
 const cx=frame.x+frame.w*.5,roiL=Math.floor(frame.x+frame.w*.285),roiR=Math.ceil(frame.x+frame.w*.715),originalTop=Math.floor(frame.y+frame.h*.015),roiT=smoothTop?Math.min(0,originalTop)-Math.ceil(frame.h*.12):originalTop,roiB=Math.ceil(frame.y+frame.h*.36),half=(roiR-roiL)/2;
 if(x<=roiL||x>=roiR||y<roiT||y>=roiB)return 0;
 let yf=Math.pow(Math.max(0,1-Math.max(0,y-originalTop)/(roiB-originalTop)),1.35);
 if(smoothTop){const t=clamp((y-roiT)/Math.max(1,originalTop-roiT),0,1);yf*=t*t*(3-2*t)}
 const xn=(x-cx)/half;
 return Math.sign(xn||1)*frame.w*.075*Math.pow(Math.max(0,1-Math.abs(xn)),1.8)*yf;
}

export function solveAutoCollarWidth({pixels,width,height,neckProfile,headToUniform,frame={x:0,y:0,w:width,h:height},smoothTop=false}){
 const empty={neckWidth:0,confidence:0,rows:[],residual:0};
 if(!validPixels(pixels,width,height)||!Array.isArray(neckProfile?.rows)||neckProfile.rows.length<3||!Array.isArray(headToUniform)||headToUniform.length!==6||!headToUniform.every(Number.isFinite)||!['x','y','w','h'].every(k=>Number.isFinite(frame[k]))||frame.w<=0||frame.h<=0)return empty;
 const [a,b,c,d,e,f]=headToUniform,apply=(x,y)=>({x:a*x+c*y+e,y:b*x+d*y+f});
 if(a*d-b*c<=0)return empty;
 const rows=[],opaque=(x,y)=>x>=0&&x<width&&y>=0&&y<height&&pixels[(y*width+x)*4+3]>96;
 for(const row of neckProfile.rows){
  if(![row.y,row.left,row.right].every(Number.isFinite)||row.right<=row.left)continue;
  const p=apply(row.left,row.y),q=apply(row.right,row.y),center=apply((row.left+row.right)/2,row.y),y=Math.round(center.y),cx=Math.round(center.x),neckW=q.x-p.x;
  // An upright neck is required; do not push a collar through a steeply
  // rotated portrait or through a closed tie/standing collar.
  if(y<0||y>=height||cx<0||cx>=width||neckW<width*.025||Math.abs(p.y-q.y)>neckW*.28||opaque(cx,y))continue;
  const run=Math.max(2,Math.round(width*.004));
  const edge=direction=>{let n=0;for(let offset=0;offset<=width*.32;offset++){const x=cx+direction*offset;if(x<0||x>=width)return null;if(opaque(x,y)){if(++n>=run)return x-direction*(run-1)}else n=0}return null};
  const l=edge(-1),r=edge(1);if(l===null||r===null||r-l<width*.025||r-l>width*.55)continue;
  const kl=widthCoefficient(l,y,frame,smoothTop),kr=widthCoefficient(r,y,frame,smoothTop);
  if(kl>=-.15||kr<=.15)continue;
  const overlap=Math.max(.5,Math.min(2,width*.0015)),targetLeft=p.x+overlap,targetRight=q.x-overlap;
  if(targetRight<=targetLeft||Math.abs((targetLeft+targetRight-l-r)/2)>width*.035)continue;
  const amount=((targetLeft-l)*kl+(targetRight-r)*kr)/(kl*kl+kr*kr);
  if(!Number.isFinite(amount)||Math.abs(amount)>6)continue;
  rows.push({y,left:l,right:r,targetLeft,targetRight,kl,kr,amount});
 }
 if(rows.length<3)return empty;
 // A robust row estimate stops a shadow/stray alpha fringe at one collar
 // height from making a large, unstable adjustment to the whole collar.
 const centre=median(rows.map(row=>row.amount)),consistent=rows.filter(row=>Math.abs(row.amount-centre)<Math.max(.35,Math.abs(centre)*.55));
 if(consistent.length<3)return empty;
 let numerator=0,denominator=0;
 for(const row of consistent){numerator+=(row.targetLeft-row.left)*row.kl+(row.targetRight-row.right)*row.kr;denominator+=row.kl*row.kl+row.kr*row.kr}
 const amount=clamp(numerator/denominator,-1.5,1.5),neckWidth=Math.round(amount*100);
 const residual=Math.sqrt(consistent.reduce((sum,row)=>sum+(row.left+row.kl*amount-row.targetLeft)**2+(row.right+row.kr*amount-row.targetRight)**2,0)/(consistent.length*2));
 return {neckWidth,confidence:clamp(consistent.length/8,0,1)*(neckProfile.confidence||0),rows:consistent,residual};
}
