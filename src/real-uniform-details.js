// Pure image geometry. Never infer details from face landmarks or fixed output coordinates.
export const REAL_UNIFORM_DETAILS_VERSION='real-uniform-details-v5-alpha-safe-cleanup';
export const REAL_UNIFORM_DETAIL_TEMPLATES=new Set(['female-operational','female-academic','female-senior','female-government-employee','male-government-employee','interior-01','interior-02','interior-03'].map(name=>'/assets/government-uniforms/'+name+'.png'));
export function realUniformDetailsVersionFor(template=''){return /\/(?:male-government-employee|interior-0[123])\.png$/.test(template)?'real-uniform-details-v4-male-reference-overlay':REAL_UNIFORM_DETAILS_VERSION}
const gold=(r,g,b,a)=>a>100&&r>115&&g>75&&r>b+28&&g>b+12&&r>g*.82;
const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
export function detailHull(points){
 const sorted=[...points].sort((a,b)=>a.x-b.x||a.y-b.y),lower=[],upper=[];
 for(const p of sorted){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p)}
 for(const p of sorted.reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p)}
 return lower.slice(0,-1).concat(upper.slice(0,-1));
}
export function insideDetail(x,y,hull){let yes=false;for(let i=0,j=hull.length-1;i<hull.length;j=i++){const a=hull[i],b=hull[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)yes=!yes}return yes}
function geometry(points,angleOverride){
 const cx=points.reduce((n,p)=>n+p.x,0)/points.length,cy=points.reduce((n,p)=>n+p.y,0)/points.length;
 let xx=0,yy=0,xy=0;for(const p of points){xx+=(p.x-cx)**2;yy+=(p.y-cy)**2;xy+=(p.x-cx)*(p.y-cy)}
 const angle=angleOverride??.5*Math.atan2(2*xy,xx-yy),c=Math.cos(angle),s=Math.sin(angle);
 let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
 for(const p of points){const u=(p.x-cx)*c+(p.y-cy)*s,v=-(p.x-cx)*s+(p.y-cy)*c;minU=Math.min(minU,u);maxU=Math.max(maxU,u);minV=Math.min(minV,v);maxV=Math.max(maxV,v)}
 const loU=minU-1,hiU=maxU+1,loV=minV-1,hiV=maxV+1;
 return {cx:cx+(loU+hiU)/2*c-(loV+hiV)/2*s,cy:cy+(loU+hiU)/2*s+(loV+hiV)/2*c,w:hiU-loU,h:hiV-loV,angle,hull:detailHull(points)};
}
function boardGeometry(group,data,width){
 const columns=new Map();for(const p of group.points){const old=columns.get(p.x)||{x:p.x,lo:Infinity,hi:-Infinity};old.lo=Math.min(old.lo,p.y);old.hi=Math.max(old.hi,p.y);columns.set(p.x,old)}
 const middle=[...columns.values()].filter(p=>p.x>group.left+group.w*.22&&p.x<group.right-group.w*.22);
 if(middle.length<group.w*.25)return null;
 const fit=key=>{let pts=middle;let line;for(let pass=0;pass<3;pass++){const cx=pts.reduce((n,p)=>n+p.x,0)/pts.length,cy=pts.reduce((n,p)=>n+p[key],0)/pts.length;let xx=0,xy=0;for(const p of pts){xx+=(p.x-cx)**2;xy+=(p.x-cx)*(p[key]-cy)}const slope=xy/xx;line={slope,intercept:cy-slope*cx};const kept=pts.filter(p=>Math.abs(p[key]-line.slope*p.x-line.intercept)<3);if(kept.length<6)break;pts=kept}return line};
 const top=fit('lo'),bottom=fit('hi');if(!top||!bottom||Math.abs(top.slope-bottom.slope)>.2)return null;
 const angle=Math.atan((top.slope+bottom.slope)/2);if(Math.abs(angle)>.7)return null;
 const points=group.points.filter(p=>p.y>=top.slope*p.x+top.intercept-2&&p.y<=bottom.slope*p.x+bottom.intercept+2);
 if(points.length<20)return null;
 const result=geometry(points,angle);if(result.h>result.w*.48||result.h<result.w*.08)return null;
 let dark=0,total=0;for(const p of points){const y=Math.round((top.slope*p.x+top.intercept+bottom.slope*p.x+bottom.intercept)/2),i=(y*width+p.x)*4;if(data[i+3]>100){total++;if(Math.max(data[i],data[i+1],data[i+2])<145)dark++}}
 return dark>total*.08?result:null;
}
export function detectUniformDetails({data,width:w,height:h}={}){
 if(!data||!Number.isInteger(w)||!Number.isInteger(h)||w<160||h<160||w>1200||h>2000||data.length!==w*h*4)return null;
 const mask=new Uint8Array(w*h),dilated=new Uint8Array(w*h),seen=new Uint8Array(w*h),queue=new Int32Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const n=y*w+x,i=n*4;if(gold(data[i],data[i+1],data[i+2],data[i+3])){mask[n]=1;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)dilated[(y+dy)*w+x+dx]=1}}}
 const groups=[];
 for(let n=0;n<mask.length;n++){
  if(!dilated[n]||seen[n])continue;
  let start=0,end=1;queue[0]=n;seen[n]=1;const points=[];let left=w,right=0,top=h,bottom=0;
  while(start<end){const at=queue[start++],x=at%w,y=Math.floor(at/w);if(mask[at]){points.push({x,y});left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}for(const next of [x?at-1:-1,x+1<w?at+1:-1,y?at-w:-1,y+1<h?at+w:-1])if(next>=0&&!seen[next]&&dilated[next]){seen[next]=1;queue[end++]=next}}
  if(points.length<8)continue;
  groups.push({points,left,right,top,bottom,cx:(left+right)/2,cy:(top+bottom)/2,w:right-left+1,h:bottom-top+1});
 }
 const candidates=groups.filter(g=>g.w>w*.095&&g.w<w*.40&&g.h>h*.012&&g.h<h*.25&&g.w/g.h>1.5&&g.cy<h*.78);
 let pair=null;
 for(const a of candidates.filter(g=>g.cx<w*.43))for(const b of candidates.filter(g=>g.cx>w*.57)){
  if(Math.abs(a.cy-b.cy)>h*.085||Math.min(a.w,b.w)/Math.max(a.w,b.w)<.5||b.cx-a.cx<w*.25)continue;
  const score=a.points.length+b.points.length-Math.abs(a.cy-b.cy)*10;
  if(!pair||score>pair.score)pair={a,b,score};
 }
 if(!pair)return null;
 const shapes=[pair.a,pair.b].map(g=>boardGeometry(g,data,w));
 if(shapes.some(g=>!g))return null;
 const boards=shapes.map(g=>({...g,kind:'shoulder'}));
 if(boards.some(g=>g.w/g.h<2||g.w/g.h>12||Math.abs(g.angle)>.8))return null;
 const center=(pair.a.cx+pair.b.cx)/2,shoulderY=(pair.a.cy+pair.b.cy)/2;
 const buttons=groups.filter(g=>Math.abs(g.cx-center)<w*.04&&g.cy>shoulderY+h*.015&&g.w>w*.009&&g.w<w*.065&&g.h>h*.006&&g.h<h*.065&&g.w/g.h>.6&&g.w/g.h<1.5).sort((a,b)=>a.cy-b.cy).slice(0,6).map(g=>({kind:'button',cx:g.cx,cy:g.cy,w:g.w+2,h:g.h+2,angle:0,hull:detailHull(g.points)}));
 return {boards,buttons,width:w,height:h};
}
// Match only actual detected buttons. Never invent a row from a fixed template.
// Male reference mode preserves the native board aspect instead of stretching
// its insignia to the generated board height. Female placement is unchanged.
export function matchUniformDetails(reference,portrait,{maleReference=false}={}){
 if(!reference||!portrait)return [];
 if(reference.boards.some((g,i)=>{const target=portrait.boards[i];if(!target)return true;const ratio=(target.w/target.h)/(g.w/g.h);return ratio<.6||ratio>1.65}))return [];
 const parts=reference.boards.map((source,i)=>({source,target:portrait.boards[i],name:i?'อินทรธนูขวา':'อินทรธนูซ้าย'}));
 if(reference.buttons.length)for(const [i,target]of portrait.buttons.entries()){
  const source=reference.buttons[Math.min(i,reference.buttons.length-1)];
  parts.push({source,target,name:'กระดุม '+(i+1)});
 }
 if(maleReference){
  const xs=portrait.boards.flatMap(b=>b.hull.map(p=>p.x)),span=Math.max(...xs)-Math.min(...xs);
  return parts.map(p=>({...p,target:{...p.target,...(p.source.kind==='button'?{w:span*.053,h:span*.053}:{h:p.target.w*p.source.h/p.source.w})}}));
 }
 return parts;
}

// A revision upgrade must not reset a user's individually moved/hidden detail.
export function hasAdjustedRealUniformDetails(layers,head){
 const defaults={x:0,y:0,scale:1,rotation:0,squeezeX:1,squeezeY:1};
 return layers.some(part=>{
  if(!part.realUniformDetail||part.hairHeadId!==head.id)return false;
  if(part.locked||part.visible===false||part.warpSource||part.eraseRestoreSource||part.mask||(part.opacity??1)!==1)return true;
  const original=part.hairHeadPose||head;
  return Object.entries(defaults).some(([key,value])=>Math.abs((part[key]??value)-(original[key]??value))>.000001);
 });
}
