// Automatic old-hair cleanup is replaceable. Manual erasing is an additional
// alpha factor, kept separately when moving to the next YouCam hairstyle.
export function composeYoucamHeadMasks({original,cleanedHead,width,height,previousMask=null,previousAutomaticMask=null,nativeEarProtection=null,nativeInnerHairProtection=null}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>32*1024*1024)throw Error('ขนาดมาสก์ใบหน้าไม่ถูกต้อง · เก็บภาพเดิมไว้');
 const n=width*height,size=n*4,rgba=a=>(a instanceof Uint8Array||a instanceof Uint8ClampedArray)&&a.length===size;
 const guard=a=>a===null||(a instanceof Uint8Array&&a.length===n);
 if(!rgba(original)||!rgba(cleanedHead)||(previousMask!==null&&!rgba(previousMask))||(previousAutomaticMask!==null&&!rgba(previousAutomaticMask))||!guard(nativeEarProtection)||!guard(nativeInnerHairProtection))throw Error('ข้อมูลมาสก์ใบหน้าไม่ครบ · เก็บภาพเดิมไว้');
 const headMask=new Uint8ClampedArray(size),automaticHeadMask=new Uint8ClampedArray(size),combinedHead=new Uint8ClampedArray(cleanedHead);
 for(let i=0;i<n;i++){
  const k=i*4,alpha=original[k+3],automatic=alpha?Math.min(255,Math.round(cleanedHead[k+3]*255/alpha)):255;
  let manual=1;
  if(previousMask){
   if(previousAutomaticMask){
    const previousAutomatic=previousAutomaticMask[k+3];
    // A completely hidden automatic pixel contains no evidence of a manual
    // erasure. A restore stroke cannot amplify the new automatic alpha.
    manual=previousAutomatic?Math.min(1,previousMask[k+3]/previousAutomatic):1;
   }else{
    // Older projects mixed both masks. Keep every other existing edit, and
    // repair only native ear/temple attachment and actual inner-crown hair
    // identified upstream. This never resets the whole face or exterior hair.
    manual=nativeEarProtection?.[i]===1||nativeInnerHairProtection?.[i]===1?1:previousMask[k+3]/255;
   }
  }
  headMask[k]=headMask[k+1]=headMask[k+2]=255;headMask[k+3]=Math.round(automatic*manual);
  automaticHeadMask[k]=automaticHeadMask[k+1]=automaticHeadMask[k+2]=255;automaticHeadMask[k+3]=automatic;
  combinedHead[k+3]=Math.round(alpha*headMask[k+3]/255);
 }
 return {headMask,automaticHeadMask,cleanedHead:combinedHead};
}
