// A separate Thai policy leaves English anatomy/framing and old open clients
// unchanged. Preparing a complete backing is part of the existing AI request.
export const THAI_NECK_BACKING_VERSION='thai-complete-neck-backing-v1';
export const usesCompleteThaiNeckBacking=fields=>fields?.thaiNeckBackingVersion===THAI_NECK_BACKING_VERSION&&fields?.interfaceLanguage!=='en'&&fields?.portraitMode==='female'&&['studio-original-ai-v5','studio-original-ai-v5-clear-gathered-v1'].includes(fields?.studioSkinVersion);

export function planThaiNeckCanvas(width,height,faceBox){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2)return null;
 const valid=Array.isArray(faceBox)&&faceBox.length===4&&faceBox.every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&faceBox[2]>faceBox[0]&&faceBox[3]>faceBox[1];
 if(!valid)return {left:Math.ceil(width*.35),right:Math.ceil(width*.35),top:0,bottom:Math.ceil(height*.75)};
 const faceWidth=(faceBox[2]-faceBox[0])*width,cx=(faceBox[0]+faceBox[2])*width/2,chin=faceBox[3]*height;
 const eyeSpan=faceWidth*.68,margin=Math.max(8,faceWidth*.08),half=eyeSpan*1.44+margin;
 return {left:Math.max(0,Math.ceil(half-cx)),right:Math.max(0,Math.ceil(cx+half-width)),top:0,bottom:Math.max(0,Math.ceil(chin+eyeSpan*1.62+margin-height))};
}

export const THAI_COMPLETE_BACKING_TASK=`COMPLETE THAI HEAD / NECK ASSET — ONE CONTINUOUS FULL U BACKING:
The prepared input canvas includes room below and beside the original photograph. Keep the same face, jaw, expression and selected hair. Use this expanded canvas to GENERATE the entire missing neck backing now. The original photo border and source shirt collar are not skin cut lines. Keep the full hair crown and the complete lower backing inside the returned frame, with temporary blue background visible below its rounded bottom and beside both sides.
Build continuous opaque matching skin from beneath the unchanged jaw, down the full upright supporting neck, through BOTH complete clavicles, then into a WIDE, DEEP rounded U-shaped backing below the clavicles. This lower material will sit BEHIND the separately placed outfit. Extend the centre and both lateral sides far enough to overlap the entire selected collar opening, including deep/wide collars. Do not stop at the upper neck, neck root, collar edge, image border or clavicle line. No horizontal cropped neck, short stump, narrow tongue, V-shaped tip, cut-out collar notch, blue/transparent hole or missing side wedge.
The one complete U guide supplies the WHOLE connected skin silhouette. Its upper entry joins under the person's jaw; its broad lower U is required output, not optional background. Keep the upper visible neck straight, balanced and proportional to the preserved face, then spread into the full lower backing beneath the outfit. Preserve every part of that lower U. The garment reference locates the collar only: do not generate its cloth and do not cut the backing to its neckline. This is flat editing overlap, with gentle continuous skin shading; no breasts, cleavage, arms, rounded outer shoulders or separate torso.
Retain the established Thai anatomy and camera target: an upright, moderately fuller supporting neck, approximately 10–15% fuller than a thin portrait neck, with near-parallel visible sides and no S-curve or pinched waist. Keep the head level over the neck without changing facial proportions or enlarging the skull. Use full-frame 50 mm portrait perspective, about 1.5–2 metres from the subject at eye level; no close-selfie wide-angle distortion. The new lower canvas space is for the hidden backing, not a longer visible neck.`;

export function completeThaiNeckPrompt(prompt){
 // Replace the old neck-only/two-guide section as a unit. Keep released hair,
 // identity and skin instructions, with a single complete backing authority.
 return prompt.replace(/NECK BACKING:[\s\S]*?(?=PREPARED SKIN:)/,THAI_COMPLETE_BACKING_TASK+'\n');
}
export function completeThaiNeckGuideInstruction(index){return `\nCOMPLETE NECK AND U-BACKING GUIDE — IMAGE ${index}: Render the entire connected shape in this one reference, from its upper neck entry through both clavicles to the full wide, deep rounded U bottom. Fit the upper entry naturally beneath the same person's jaw. Keep the lower base fully opaque and continuously joined to both neck sides, with a small hidden overlap behind the separate selected garment. The blue area is temporary background; leave blue around the completed U instead of cropping it at the frame edge. Never copy diagram colours, a rectangle, garment-shaped holes or an upper-neck-only crop. No separate neck-only rectangle limits this backing.`}
