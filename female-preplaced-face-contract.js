export const FEMALE_PREPLACED_FACE_VERSION='female-preplaced-face-v1';
export const FEMALE_FACE_OUTLINE=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const ids=[...new Set([...FEMALE_FACE_OUTLINE,33,263,1,152,234,454])];
export function captureFemaleFaceEvidence(landmarks,width,height){
 return parseFemaleFaceEvidence({version:FEMALE_PREPLACED_FACE_VERSION,width,height,points:Object.fromEntries(ids.map(id=>[id,{x:landmarks?.[id]?.x,y:landmarks?.[id]?.y}]))});
}
export function parseFemaleFaceEvidence(raw){
 let v;try{v=typeof raw==='string'?JSON.parse(raw):raw;}catch{}
 if(!v||v.version!==FEMALE_PREPLACED_FACE_VERSION||![v.width,v.height].every(n=>Number.isInteger(n)&&n>=32&&n<=32768)||v.width*v.height>33554432||ids.some(id=>!['x','y'].every(axis=>Number.isFinite(v.points?.[id]?.[axis])&&v.points[id][axis]>=0&&v.points[id][axis]<=1)))throw Error('กรุณาตรวจใบหน้าจากรูปต้นฉบับใหม่');
 const p=Object.fromEntries(ids.map(id=>[id,{x:v.points[id].x*v.width,y:v.points[id].y*v.height}]));
 const left=p[33],right=p[263],angle=Math.atan2(right.y-left.y,right.x-left.x),mid={x:(left.x+right.x)/2,y:(left.y+right.y)/2},c=Math.cos(-angle),s=Math.sin(-angle);
 const rotate=q=>({x:c*(q.x-mid.x)-s*(q.y-mid.y),y:s*(q.x-mid.x)+c*(q.y-mid.y)});
 const a=rotate(p[234]),b=rotate(p[454]),nose=rotate(p[1]),chin=rotate(p[152]),span=b.x-a.x;
 if(span<80||Math.abs(nose.x-(a.x+b.x)/2)>span*.18||nose.y/Math.max(1,chin.y)<.23||nose.y/Math.max(1,chin.y)>.70)throw Error('กรุณาใช้รูปหน้าตรง ไม่หัน ก้ม หรือเงยมากเกินไป');
 return {version:v.version,width:v.width,height:v.height,points:Object.fromEntries(ids.map(id=>[id,{x:v.points[id].x,y:v.points[id].y}]))};
}
export function femaleFaceCropGeometry(raw){
 const v=parseFemaleFaceEvidence(raw),p=id=>({x:v.points[id].x*v.width,y:v.points[id].y*v.height}),left=p(33),right=p(263),angle=Math.atan2(right.y-left.y,right.x-left.x),mid={x:(left.x+right.x)/2,y:(left.y+right.y)/2},c=Math.cos(-angle),s=Math.sin(-angle);
 const polygon=FEMALE_FACE_OUTLINE.map(id=>{const q=p(id);return {x:c*(q.x-mid.x)-s*(q.y-mid.y),y:s*(q.x-mid.x)+c*(q.y-mid.y)};});
 const xs=polygon.map(p=>p.x),ys=polygon.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),q=Math.min(1,1200/(maxX-minX),1500/(maxY-minY));
 return {sourceWidth:v.width,sourceHeight:v.height,angle,mid,polygon,minX,minY,q,width:Math.ceil((maxX-minX)*q)+6,height:Math.ceil((maxY-minY)*q)+6};
}
