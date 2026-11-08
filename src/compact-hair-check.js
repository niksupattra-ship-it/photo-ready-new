// Eye-aligned 256x320 evidence uses a 64 px outer-eye span. Detect only a
// substantial lower curtain on a fully gathered selection, not isolated wisps.
export function inspectGatheredPortraitHair(evidence,{strict=false}={}){
 const width=evidence?.width??256,height=evidence?.height??320;
 const {pixels,hair,chinY}=evidence||{};
 if(width!==256||height!==320||pixels?.length!==width*height*4||hair?.length!==pixels.length||!Number.isFinite(chinY)||chinY<144||chinY>=height-8)return {measurable:false,retained:false};
 const span=64,start=Math.max(0,Math.ceil(chinY+span*(strict ? .08 : .18)));
 const seed=(x0,x1,y0,y1,condition)=>{
  const sum=[0,0,0];let n=0;
  for(let y=Math.max(0,Math.ceil(y0));y<Math.min(height,y1);y++)for(let x=x0;x<x1;x++){
   const i=(y*width+x)*4;if(pixels[i+3]<192||!condition(i))continue;
   for(let k=0;k<3;k++)sum[k]+=pixels[i+k];n++;
  }
  return n>=24?sum.map(v=>v/n):null;
 };
 const hairColour=seed(26,230,24,chinY-8,i=>hair[i+3]>=192);
 const neckColour=seed(112,144,chinY+span*.08,chinY+span*.50,()=>true);
 const distance=(i,colour)=>Math.hypot(pixels[i]-colour[0],pixels[i+1]-colour[1],pixels[i+2]-colour[2]);
 const candidates=strict?new Uint8Array(width*height):null;
 let lower=0,deep=0,left=0,right=0;
 for(let y=start;y<height;y++)for(let x=26;x<230;x++){
  const offset=Math.abs(x-128)/span;
  if(offset>1.6||(!strict&&offset<.28))continue;
  const i=(y*width+x)*4;
  if(pixels[i+3]<192)continue;
  // Dark rear hair on transparent pixels can be labelled as background or
  // clothing. Accept a strong same-portrait colour match as additional evidence,
  // only when it is clearly different from this person's own neck skin.
  if(hair[i+3]<192&&!(hairColour&&neckColour&&(!strict||offset>=.55)&&distance(i,hairColour)<=80&&distance(i,hairColour)+24<distance(i,neckColour)))continue;
  if(candidates)candidates[y*width+x]=1;
  lower++;if(x<128)left++;else right++;
  if(y>chinY+span*.35)deep++;
 }
 // The refined gathered policy rejects a narrow connected strand too,
 // while isolated mask noise cannot satisfy the vertical-run requirement.
 if(strict){
  const queue=new Int32Array(width*height);let largest=0,tallest=0,retained=false;
  for(let n=0;n<candidates.length;n++){
   if(!candidates[n])continue;
   let head=0,tail=1,count=0,minY=height,maxY=0;queue[0]=n;candidates[n]=0;
   const add=k=>{if(candidates[k]){candidates[k]=0;queue[tail++]=k}};
   while(head<tail){const k=queue[head++],x=k%width,y=Math.floor(k/width);count++;minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&x+dx>=0&&x+dx<width&&y+dy>=start&&y+dy<height)add(k+dy*width+dx);
   }
   largest=Math.max(largest,count);tallest=Math.max(tallest,maxY-minY+1);
   if(count>=8&&maxY-minY+1>=8&&maxY>chinY+span*.18)retained=true;
  }
  return {measurable:true,retained,lower,deep,left,right,largest,tallest};
 }
 return {measurable:true,retained:lower>=span*span*.025&&deep>=span*span*.004,lower,deep,left,right};
}
