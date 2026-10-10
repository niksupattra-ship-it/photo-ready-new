// Immutable pixels always come from one fixed processed portrait, never from AI.
export function mergeLockedHairPixels(base,generated,allowed){
 if(base.length!==generated.length||base.length!==allowed.length*4)throw Error('Hair pixel dimensions differ');
 const out=new Uint8ClampedArray(base);
 for(let i=0;i<allowed.length;i++)if(allowed[i])out.set(generated.subarray(i*4,i*4+4),i*4);
 return out;
}
export function hairWarpPlan(hair,W,H,{cx,browY,rootY,faceWidth,crownRatio=.28}){
 let top=H,left=W,right=0;const roots=[];
 for(let y=0;y<Math.floor(browY);y++){
  let n=0;for(let x=Math.max(0,Math.floor(cx-faceWidth*.7));x<Math.min(W,Math.ceil(cx+faceWidth*.7));x++)if(hair[(y*W+x)*4+3]>160){n++;left=Math.min(left,x);right=Math.max(right,x)}
  if(n>faceWidth*.08)top=Math.min(top,y);
 }
 if(top===H||right<=left)throw Error('ตรวจขอบทรงผมไม่สำเร็จ — คงภาพเดิม');
 for(let x=Math.floor(cx-faceWidth*.06);x<=Math.ceil(cx+faceWidth*.06);x++){
  let last=-1;for(let y=top;y<Math.min(H,Math.floor(browY));y++)if(x>=0&&x<W&&hair[(y*W+x)*4+3]>160)last=y;
  if(last>=0)roots.push(last);
 }
 roots.sort((a,b)=>a-b);const candidate=roots.length?roots[Math.floor(roots.length/2)]:rootY;
 // Fringe reaching the brow is not a visible scalp-root line.
 const visibleRoot=candidate<browY-faceWidth*.1&&candidate>top+faceWidth*.08;
 const oldRoot=visibleRoot?candidate:Math.max(top+1,rootY),newRoot=visibleRoot?rootY:oldRoot;
 const newTop=Math.max(0,Math.max(top+(newRoot-oldRoot),newRoot-faceWidth*crownRatio));
 return {top,newTop,oldRoot,newRoot,browY,scaleX:Math.min(1,faceWidth*1.18/Math.max(faceWidth,right-left)),cx};
}
export function sourceHairY(y,p){
 if(y<p.newTop)return null;
 if(y<=p.newRoot)return p.top+(y-p.newTop)*(p.oldRoot-p.top)/Math.max(1,p.newRoot-p.newTop);
 if(y<p.browY)return p.oldRoot+(y-p.newRoot)*(p.browY-p.oldRoot)/Math.max(1,p.browY-p.newRoot);
 return y;
}
