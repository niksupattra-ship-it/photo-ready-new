import {faceProportions} from './face-proportion-check.js';

// Measure at matched face scales, not at unrelated upload/output resolutions.
export function measurePortraitAspect(image,model,face){
 const W=image.naturalWidth||image.width,H=image.naturalHeight||image.height,a=face?.[33],b=face?.[263];
 if(!a||!b)return null;
 const dx=(b.x-a.x)*W,dy=(b.y-a.y)*H,span=Math.hypot(dx,dy);
 if(!Number.isFinite(span)||span<20)return null;
 const values=[];
 for(const target of [180,220,280]){
  const c=Object.assign(document.createElement('canvas'),{width:target*3,height:target*4}),x=c.getContext('2d');
  x.fillStyle='#aaa';x.fillRect(0,0,c.width,c.height);x.translate(c.width/2,target*1.3);x.rotate(-Math.atan2(dy,dx));x.scale(target/span,target/span);x.drawImage(image,-(a.x+b.x)*W/2,-(a.y+b.y)*H/2);
  const p=faceProportions(model.detect(c).faceLandmarks?.[0],c.width,c.height);if(p)values.push(p.eyeToChin/p.faceWidth);c.width=c.height=1;
 }
 return values.length>=2?values.sort((a,b)=>a-b)[Math.floor(values.length/2)]:null;
}

// Restore the measured source face aspect along its eye-line normal. The whole
// native cutout follows one affine transform; no pasted face or local seams.
export function portraitAspectRepair(sourceAspect,resultAspect,face,width,height){
 if(![sourceAspect,resultAspect].every(v=>Number.isFinite(v)&&v>0))return null;
 const requested=sourceAspect/resultAspect;
 if(Math.abs(requested-1)<=.015)return null;
 const factor=Math.max(.85,Math.min(1.15,requested)),a=face?.[33],b=face?.[263];if(!a||!b)return null;
 const dx=(b.x-a.x)*width,dy=(b.y-a.y)*height,span=Math.hypot(dx,dy);if(!Number.isFinite(span)||span<20)return null;
 const ux=dx/span,uy=dy/span,A=ux*ux+factor*uy*uy,B=ux*uy*(1-factor),D=uy*uy+factor*ux*ux;
 const points=[[0,0],[width,0],[width,height],[0,height]].map(([x,y])=>({x:A*x+B*y,y:B*x+D*y}));
 const left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y));
 return {factor,width:Math.ceil(Math.max(...points.map(p=>p.x))-left),height:Math.ceil(Math.max(...points.map(p=>p.y))-top),matrix:[A,B,B,D,-left,-top]};
}
