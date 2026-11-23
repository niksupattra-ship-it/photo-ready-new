import {detailHull} from './real-uniform-details.js';
// Grow only connected neutral-dark remnants immediately beside an old board.
// Blue background, gold embroidery, buttons and distant seams are excluded.
export function extendShoulderCleanup(mask,{data,width,height},board,region){
 const c=Math.cos(board.angle),s=Math.sin(board.angle),reach=board.h*.8;
 const radius=board.w/2+reach+board.h;
 const left=Math.max(0,Math.floor(board.cx-radius)),right=Math.min(width-1,Math.ceil(board.cx+radius));
 const top=Math.max(0,Math.floor(board.cy-radius)),bottom=Math.min(height-1,Math.ceil(board.cy+radius));
 const queue=[],points=[];
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)if(mask[y*width+x])queue.push(y*width+x);
 for(let at=0;at<queue.length;at++){
  const n=queue[at],x=n%width,y=Math.floor(n/width);
  for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
   const xx=x+dx,yy=y+dy;if(xx<left||xx>right||yy<top||yy>bottom)continue;
   const next=yy*width+xx;if(mask[next])continue;
   const u=(xx-board.cx)*c+(yy-board.cy)*s,v=-(xx-board.cx)*s+(yy-board.cy)*c;
   if(Math.abs(u)>board.w/2+reach||v<0||v>board.h*.65)continue;
   const inward=board.cx<width/2?1:-1;
   if(u*inward<board.w/2-board.h*.1)continue;
   const i=next*4,r=data[i],g=data[i+1],b=data[i+2];
   if(data[i+3]<190||Math.max(r,g,b)>125||Math.max(r,g,b)-Math.min(r,g,b)>45)continue;
   mask[next]=1;queue.push(next);points.push({x:xx,y:yy},{x:xx+1,y:yy+1});
  }
 }
 return points.length?detailHull([...region,...points]):region;
}
