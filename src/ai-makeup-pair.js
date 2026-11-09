// Apply only AI-produced cosmetic pixels to the natural portrait. Hair, neck,
// eyes, alpha and the canvas geometry always come from the natural master.
const OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const EYES=[[33,160,158,133,153,144],[362,385,387,263,373,380]];
function inside(x,y,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++)if((poly[i].y>y)!==(poly[j].y>y)&&x<(poly[j].x-poly[i].x)*(y-poly[i].y)/(poly[j].y-poly[i].y)+poly[i].x)hit=!hit;return hit}
export function mergeAiMakeupPixels({natural,makeup,width,height,face,hair}){
 const n=width*height;
 if(natural.length!==n*4||makeup.length!==natural.length||hair.length!==natural.length||!OVAL.concat(EYES.flat()).every(i=>Number.isFinite(face?.[i]?.x)&&Number.isFinite(face?.[i]?.y)))throw Error('ตรวจตำแหน่งใบหน้าสำหรับภาพแต่งหน้าไม่สำเร็จ');
 const points=ids=>ids.map(i=>({x:face[i].x*width,y:face[i].y*height})),oval=points(OVAL),eyes=EYES.map(points),out=new Uint8ClampedArray(natural);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;
  if(!natural[i+3]||hair[i+3]>32||!inside(x+.5,y+.5,oval)||eyes.some(p=>inside(x+.5,y+.5,p)))continue;
  // Feather the facial boundary to avoid a pasted-on face edge.
  let distance=Infinity;
  for(let j=0;j<oval.length;j++){const a=oval[j],b=oval[(j+1)%oval.length],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));distance=Math.min(distance,Math.hypot(x-a.x-t*dx,y-a.y-t*dy))}
  const weight=Math.min(1,distance/Math.max(2,width*.012));
  for(let c=0;c<3;c++)out[i+c]=natural[i+c]+(makeup[i+c]-natural[i+c])*weight;
 }
 return out;
}
