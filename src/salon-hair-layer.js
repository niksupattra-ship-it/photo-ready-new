// Straight-alpha hair compositing. No skin stencil is pasted over the face.
function over(out,j,src,alpha){
 const a=alpha/255,ba=out[j+3]/255,oa=a+ba*(1-a);
 for(let c=0;c<3;c++)out[j+c]=oa?(src[j+c]*a+out[j+c]*ba*(1-a))/oa:0;
 out[j+3]=oa*255;
}
export function assembleSalonHair({base,scalp,hair,oldHair,newHair,protectedSkin,visibleSkin=protectedSkin}){
 const size=base.length;if([scalp,hair,oldHair,newHair,protectedSkin,visibleSkin].some(a=>a.length!==size)||size%4)throw Error('Salon image dimensions differ');
 const out=new Uint8ClampedArray(base);
 for(let j=0;j<size;j+=4){
  if(protectedSkin[j+3]>0)continue;
  // Recover only pixels covered by old hair. Original visible skin stays original.
  const erase=visibleSkin[j+3]>128?0:oldHair[j+3]/255;
  if(erase){
   for(let c=0;c<4;c++)out[j+c]=base[j+c]*(1-erase)+scalp[j+c]*erase;
  }
  const alpha=Math.round(newHair[j+3]*hair[j+3]/255);
  if(alpha)over(out,j,hair,alpha);
 }
 return out;
}
export function checkSalonFit(mask,W,H,{cx,browY,rootY,faceWidth},fringe=false){
 let top=H,left=W,right=-1;const roots=[];
 for(let y=0;y<Math.min(H,browY);y++){
  let count=0;for(let x=Math.max(0,Math.floor(cx-faceWidth*.85));x<Math.min(W,cx+faceWidth*.85);x++)if(mask[(y*W+x)*4+3]>200){count++;left=Math.min(left,x);right=Math.max(right,x)}
  if(count>faceWidth*.1)top=Math.min(top,y);
 }
 if(top===H)throw Error('ตรวจชั้นผมไม่สำเร็จ — คงภาพเดิม');
 for(let x=Math.max(0,Math.floor(cx-faceWidth*.04));x<Math.min(W,cx+faceWidth*.04);x++){
  let bottom=-1;for(let y=top;y<browY&&y<H;y++)if(mask[(y*W+x)*4+3]>200)bottom=y;
  if(bottom>=0)roots.push(bottom);
 }
 roots.sort((a,b)=>a-b);const root=roots[Math.floor(roots.length/2)];
 // Validate; never warp hair or skin to hide a failed generation.
 if(!fringe&&(!Number.isFinite(root)||Math.abs(root-rootY)>faceWidth*.10))throw Error('แนวรากผมยังไม่พอดี — ไม่ใช้ภาพนี้');
 if(top<rootY-faceWidth*.34||right-left>faceWidth*1.32)throw Error('ผมยังสูงหรือพองเกินกรอบ — ไม่ใช้ภาพนี้');
 return {top,root,width:right-left};
}
