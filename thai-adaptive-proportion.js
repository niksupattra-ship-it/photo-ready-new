// Thai V11: derive a conservative head guide from the actual face shape.
// Geometry only. No identity recognition, image warping, extra model call,
// imported portrait, or modification of the selected native garment.
export const THAI_ADAPTIVE_FACE_VERSION=1;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const round=(value,digits=4)=>Number(value.toFixed(digits));
const invalid=()=>Error('วัดสัดส่วนใบหน้าต้นฉบับไม่ครบ กรุณาใช้รูปหน้าตรงที่เห็นใบหน้าชัดเจน');

export function measureThaiAdaptiveFace(landmarks,width,height){
 if(!landmarks||![width,height].every(v=>Number.isFinite(v)&&v>=32))throw invalid();
 const pixel=id=>{
  const p=landmarks[id];
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))throw invalid();
  return {x:p.x*width,y:p.y*height};
 };
 const leftEye=pixel(33),rightEye=pixel(263),leftCheek=pixel(234),rightCheek=pixel(454);
 const leftJaw=pixel(172),rightJaw=pixel(397),forehead=pixel(10),chin=pixel(152);
 const dx=rightEye.x-leftEye.x,dy=rightEye.y-leftEye.y;
 const eyeDistance=Math.hypot(dx,dy);
 if(eyeDistance<10)throw invalid();
 const ux=dx/eyeDistance,uy=dy/eyeDistance;
 const horizontal=(left,right)=>Math.abs((right.x-left.x)*ux+(right.y-left.y)*uy);
 const vertical=(top,bottom)=>Math.abs((bottom.y-top.y)*ux-(bottom.x-top.x)*uy);
 const faceWidth=horizontal(leftCheek,rightCheek),faceHeight=vertical(forehead,chin);
 if(faceWidth<18||faceHeight<22)throw invalid();
 const evidence={
  version:THAI_ADAPTIVE_FACE_VERSION,
  faceAspect:round(faceHeight/faceWidth),
  jawRatio:round(horizontal(leftJaw,rightJaw)/faceWidth),
  eyeRatio:round(eyeDistance/faceWidth)
 };
 return parseThaiAdaptiveFace(evidence,{required:true});
}

export function parseThaiAdaptiveFace(value,{required=false}={}){
 if(value===undefined||value===null||value===''){
  if(required)throw invalid();
  return null;
 }
 let info=value;
 if(typeof value==='string'){
  if(value.length>512)throw invalid();
  try{info=JSON.parse(value)}catch{throw invalid()}
 }
 if(!info||typeof info!=='object'||Array.isArray(info)||info.version!==THAI_ADAPTIVE_FACE_VERSION)throw invalid();
 const ranges={faceAspect:[1.0,2.15],jawRatio:[.43,1.02],eyeRatio:[.30,.83]};
 for(const [key,[min,max]] of Object.entries(ranges)){
  if(typeof info[key]!=='number'||!Number.isFinite(info[key])||info[key]<min||info[key]>max)throw invalid();
 }
 return Object.freeze({
  version:THAI_ADAPTIVE_FACE_VERSION,
  faceAspect:round(info.faceAspect),
  jawRatio:round(info.jawRatio),
  eyeRatio:round(info.eyeRatio)
 });
}

// Returned values are safe, tightly bounded composition-guide dimensions,
// not assertions of real-world body size. The selected garment still defines
// shoulders/collar. The normalized face outline adjusts this one person's head
// guide rather than forcing every face into V9/V10's fixed physical rectangle.
export function thaiAdaptiveHeadProfile(gender,evidence,cropAspect){
 if(!['male','female'].includes(gender))throw invalid();
 const shape=parseThaiAdaptiveFace(evidence,{required:true});
 if(!Number.isFinite(cropAspect)||cropAspect<.95||cropAspect>2.5)throw invalid();
 const longness=clamp((shape.faceAspect-1.43)/.35,-1,1);
 const jaw=clamp((shape.jawRatio-.75)/.19,-1,1);
 const eyes=clamp((shape.eyeRatio-.53)/.14,-1,1);
 const target=clamp((gender==='male'?.337:.343)+jaw*.011-longness*.007+eyes*.004,
  gender==='male'?.314:.320,gender==='male'?.362:.370);
 const identityHeadScale=.94;
 const guideWidth=target/identityHeadScale;
 // The source face box was measured from facial landmarks (not image edges).
 // Match its native crop aspect with an allowance for the skull outline.
 // fit:'inside' must no longer silently shrink unusually long faces.
 const guideAspect=clamp(cropAspect+.025,1.02,2.32);
 return Object.freeze({
  identityHeadScale,
  headWidthToShoulder:round(guideWidth),
  headHeightToShoulder:round(guideWidth*guideAspect),
  chinToCollar:.020,neckToShoulder:.25,chestToShoulder:.46
 });
}

export function thaiAdaptiveProportionInstruction(profile,shape){
 const checked=parseThaiAdaptiveFace(shape,{required:true});
 const actual=round(profile.identityHeadScale*profile.headWidthToShoulder*100,1);
 return `
THAI V11 ADAPTIVE REAL-FACE / FIXED-GARMENT COMPOSITION:
The customer's REAL face geometry was measured in the original photo before AI generation. Use the exact original face visible inside Image 1 for the eye spacing, jaw contour, cheek shape, face height/width ratio and expression. These natural ratios vary between people. A narrow or long face must remain narrow or long; a broad face must remain broad. Do not homogenize, beautify or resize individual features. The detected face height/width ratio was ${checked.faceAspect}; this number describes the original geometry, NOT a demand to reshape it.
Image 1 is already a FULL coherent garment-anchored layout. Its face was placed with a uniform aspect-preserving transform. The composition's individual head-to-shoulder reference target is approximately ${actual}% of the unchanged suit shoulder span. This is a conservative guide for this input/garment pair, NOT a universal fixed head percentage and NOT an instruction to synthesize the facial proportions again. Preserve the real person's distinctive identity and original asymmetry from Image 1.
The selected outfit's full native shoulder width, collar, lapels, fabric, insignia and lower edge are fixed. Never scale the suit narrower or wider, shrink the whole body, inflate the head or add extra hair bulk. Seat the original-size chin naturally at the upper collar using a short, anatomically connected neck. Keep frontal eye line level. The original upload's camera zoom, selfie crop and background do not control the final shot. Generate one photorealistic portrait in a SINGLE AI call; no pasted face, no double neck, no second shirt collar, no post-render warp.
`;
}
