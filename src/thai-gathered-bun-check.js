// Conservative hair-label evidence on the existing eye-aligned 256x320 grid.
// Unlike head-only cleanup, do not classify dark ties/epaulettes by colour.
export function inspectThaiGatheredBun(evidence){
 const {pixels,hair,chinY}=evidence||{},W=256,H=320;
 if(pixels?.length!==W*H*4||hair?.length!==pixels.length||!Number.isFinite(chinY)||chinY<170||chinY>285)return {measurable:false};
 let crown=0;for(let y=0;y<Math.floor(chinY-24);y++)for(let x=26;x<230;x++){const i=(y*W+x)*4+3;if(pixels[i]>=224&&hair[i]>=240)crown++}
 if(crown<64)return {measurable:false};
 const selected=new Uint8Array(W*H),start=Math.max(0,Math.ceil(chinY-64*.38)),end=Math.min(H,Math.floor(chinY+64*.10));
 for(let y=start;y<end;y++)for(let x=42;x<214;x++){
  const offset=Math.abs(x-128),i=(y*W+x)*4+3;
  if(offset>=64*.38&&offset<=64*1.25&&pixels[i]>=224&&hair[i]>=240)selected[y*W+x]=1;
 }
 let largest=0;const queue=new Uint32Array(W*H);
 for(let i=start*W;i<end*W;i++)if(selected[i]){
  let head=0,tail=1,count=0,minY=H,maxY=0;queue[0]=i;selected[i]=0;
  while(head<tail){const p=queue[head++],x=p%W,y=Math.floor(p/W);count++;minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||xx>=W||yy<start||yy>=end)continue;const n=yy*W+xx;if(selected[n]){selected[n]=0;queue[tail++]=n}}
  }
  if(maxY-minY>=8)largest=Math.max(largest,count);
 }
 return {measurable:true,retained:largest>=90,largest};
}
