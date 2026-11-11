const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
const keys={leftEye:33,rightEye:263,forehead:10,leftTemple:127,rightTemple:356,leftFace:234,rightFace:454,chin:152};
// No existing hairline is required. Face anchors also work for a bald scalp.
export function englishHairFitEvidence(face,width,height,labels=null){
 if(![width,height].every(v=>Number.isInteger(v)&&v>0&&v<=8192)||Object.values(keys).some(id=>!valid(face?.[id])))return null;
 const points=Object.fromEntries(Object.entries(keys).map(([key,id])=>[key,{x:face[id].x,y:face[id].y}]));
 const result={width,height,points};
 if(!labels?.data||!labels.width||!labels.height)return result;
 const w=labels.width,h=labels.height,fw=Math.abs(points.rightFace.x-points.leftFace.x),cx=(points.leftEye.x+points.rightEye.x)/2,eyeY=(points.leftEye.y+points.rightEye.y)/2;
 const left=Math.max(0,Math.floor((cx-fw*.72)*w)),right=Math.min(w-1,Math.ceil((cx+fw*.72)*w)),top=Math.max(0,Math.floor((points.forehead.y-fw*.85)*h)),bottom=Math.min(h-1,Math.floor(eyeY*h));
 const allowed=i=>[1,2,3].includes(labels.data[i]);let seed=-1;
 const sx=Math.round(cx*w),sy=Math.round((points.forehead.y+eyeY)/2*h);
 for(let r=0;r<8&&seed<0;r++)for(let y=Math.max(top,sy-r);y<=Math.min(bottom,sy+r)&&seed<0;y++)for(let x=Math.max(left,sx-r);x<=Math.min(right,sx+r);x++)if(allowed(y*w+x)){seed=y*w+x;break}
 if(seed<0||bottom<=top)return result;
 const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=1,hair=0,total=0;queue[0]=seed;seen[seed]=1;
 const cap=new Int32Array(w).fill(h);
 const add=(x,y)=>{if(x<left||x>right||y<top||y>bottom)return;const i=y*w+x;if(!seen[i]&&allowed(i)){seen[i]=1;queue[tail++]=i}};
 while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);cap[x]=Math.min(cap[x],y);total++;if(labels.data[i]===1)hair++;add(x-1,y);add(x+1,y);add(x,y-1);add(x,y+1)}
 // Existing voluminous hair is not an observed skull contour. Use the scalp
 // boundary only when the connected upper head is predominantly bare skin.
 if(total<20||hair/total>.08)return result;
 const outline=[];for(let x=left;x<=right;x+=Math.max(1,Math.floor((right-left)/24)))if(cap[x]<h)outline.push({x:(x+.5)/w,y:(cap[x]+.5)/h});
 if(outline.length>=5&&outline.every(p=>p.y>1/h)){result.bareScalp=true;result.scalpOutline=outline}
 return result;
}
