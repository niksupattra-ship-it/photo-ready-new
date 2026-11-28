// Read-only placement estimates relative to the SAME guide, never beauty targets
// or an identity recognizer. Classification/cropping uncertainty stays visible.
export function labLayoutMetrics({face,width,height,labels,labelWidth,labelHeight}){
 if(![width,height,labelWidth,labelHeight].every(n=>Number.isInteger(n)&&n>0)||labels?.length!==labelWidth*labelHeight)return null;
 const ids=[33,263,152,234,454];if(ids.some(id=>![face?.[id]?.x,face?.[id]?.y].every(Number.isFinite)))return null;
 const point=id=>({x:face[id].x*width,y:face[id].y*height}),a=point(234),b=point(454),l=point(33),r=point(263),chin=point(152);
 const fw=Math.hypot(b.x-a.x,b.y-a.y),cx=(a.x+b.x)/2;
 if(fw<20||Math.abs(l.y-r.y)>fw*.2)return null;
 const clothes=(x,y)=>x>=0&&x<width&&y>=0&&y<height&&labels[Math.floor(y*labelHeight/height)*labelWidth+Math.floor(x*labelWidth/width)]===4;
 const band=(from,to,y)=>{let hit=0,total=0;for(let x=Math.max(0,Math.ceil(from));x<Math.min(width,to);x++){total++;if(clothes(x,y))hit++;}return total>=3&&hit>=Math.max(2,total*.25);};
 let contact=null,run=0;
 for(let y=Math.max(0,Math.ceil(chin.y-fw*.1));y<Math.min(height,chin.y+fw*.9);y++){
  run=band(cx-fw*.45,cx-fw*.15,y)&&band(cx+fw*.15,cx+fw*.45,y)?run+1:0;
  if(run>=3){contact=y-2;break;}
 }
 if(contact===null)return null;
 const spans=[];
 for(let y=Math.ceil(contact+fw*.1);y<Math.min(height,contact+fw*.5);y+=2){
  let left=width,right=-1,count=0;for(let x=0;x<width;x++)if(clothes(x,y)){left=Math.min(left,x);right=x;count++;}
  // Cropped shoulders cannot establish a trustworthy full garment width.
  if(left>2&&right<width-3&&right-left>fw*1.5&&count>fw)spans.push(right-left+1);
 }
 if(spans.length<3)return null;
 spans.sort((x,y)=>x-y);const garmentWidth=spans[Math.floor((spans.length-1)*.75)];
 return {faceToGarment:fw/garmentWidth,neckToGarment:(contact-chin.y)/garmentWidth};
}

export function compareLabLayout(guide,result){
 if(!guide||!result||![guide.faceToGarment,result.faceToGarment,guide.neckToGarment,result.neckToGarment].every(Number.isFinite)||guide.faceToGarment<=0||result.faceToGarment<=0)return {status:'unmeasurable'};
 const faceScaleDelta=result.faceToGarment/guide.faceToGarment-1,neckGapDelta=result.neckToGarment-guide.neckToGarment;
 // Conservative advisory tolerances for the 256px clothing classifier.
 return {status:Math.abs(faceScaleDelta)>.1||Math.abs(neckGapDelta)>.04?'review':'within_tolerance',faceScaleDelta,neckGapDelta};
}
