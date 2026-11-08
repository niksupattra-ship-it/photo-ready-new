import {portraitProtectedFeatures} from './portrait-feature-check.js';

// Match the detector's face scale and eye-line alignment for the comparison.
// This offscreen measurement never changes the source or delivered pixels.
export function measurePortraitProtectedFeatures(image,model,face){
 const a=face?.[33],b=face?.[263],W=image.naturalWidth||image.width,H=image.naturalHeight||image.height;
 if(!a||!b||!W||!H)return null;
 const dx=(b.x-a.x)*W,dy=(b.y-a.y)*H,span=Math.hypot(dx,dy);
 if(!Number.isFinite(span)||span<20)return null;
 const target=220,canvas=document.createElement('canvas');canvas.width=target*3;canvas.height=target*4;
 const context=canvas.getContext('2d');if(!context)return null;
 context.fillStyle='#aaa';context.fillRect(0,0,canvas.width,canvas.height);
 context.translate(canvas.width/2,target*1.3);context.rotate(-Math.atan2(dy,dx));context.scale(target/span,target/span);
 context.drawImage(image,-(a.x+b.x)*W/2,-(a.y+b.y)*H/2);
 const measured=model.detect(canvas).faceLandmarks?.[0];
 return portraitProtectedFeatures(measured,canvas.width,canvas.height);
}
