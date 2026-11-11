// English close-up master + one native garment. Browser-safe protocol/geometry.
export const ENGLISH_HEAD_PORTRAIT_VERSION='en-head-template-v1';
export const ENGLISH_HEAD_FINISH_VERSION='en-reference-head-detail-v2';
export const ENGLISH_HEAD_PLACEMENT_VERSION='native-head-one-garment-v1';
export const isEnglishHeadPortrait=fields=>fields?.interfaceLanguage==='en'&&fields.portraitComposition===ENGLISH_HEAD_PORTRAIT_VERSION;
export function fitEnglishHeadTemplate({uniform,face,width,height,crownY=0,W=900,H=1200}){
 const ids=[10,152,234,454];
 if(!uniform||ids.some(id=>![face?.[id]?.x,face?.[id]?.y].every(Number.isFinite)))throw Error('Could not measure the portrait.');
 const fw=Math.hypot((face[454].x-face[234].x)*width,(face[454].y-face[234].y)*height),fh=(face[152].y-face[10].y)*height;
 if(fw<12||fh<20)throw Error('The face is too small to fit.');
 // The entire native garment keeps its aspect ratio and lower edge. Unlike
 // overlaying a generated torso, there is exactly one collar and one body.
 const gs=(W+4)/uniform.bounds.w;
 const garment={x:-2-uniform.bounds.l*gs,y:H-(uniform.bounds.b+1)*gs,w:uniform.width*gs,h:uniform.height*gs};
 const shoulders=uniform.shoulderWidth*gs,cx=garment.x+uniform.centerX*gs;
 const collarY=garment.y+uniform.collarTopY*gs,chin=face[152].y*height;
 let scale=shoulders*.30/fw;
 const room=collarY-H*.045,headAndGap=chin-crownY+fh*.18;
 if(headAndGap>0&&room>0)scale=Math.min(scale,room/headAndGap);
 if(!(scale>0&&collarY>H*.20))throw Error('The outfit has insufficient room for the portrait.');
 const chinY=collarY-fh*scale*.18,sourceCX=(face[234].x+face[454].x)*width/2;
 return {garment,head:{x:cx-sourceCX*scale,y:chinY-chin*scale,w:width*scale,h:height*scale},scale,shoulderSpan:shoulders,faceRatio:fw*scale/shoulders,chinY,collarY,version:ENGLISH_HEAD_PLACEMENT_VERSION};
}
