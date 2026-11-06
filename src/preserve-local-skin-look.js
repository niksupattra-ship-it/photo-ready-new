import {makeupLook} from '../makeup-presets.js';
import {portraitFinishChoice} from './portrait-finish-choice.js';
// Reapply only the explicit local skin recipe to the NEW native portrait.
// Never reuse the previous hair's face pixels, mask, or skin-colour profile.
export async function preserveLocalSkinLook(previous,replacement,{render,mix,toSource}){
 const look=previous.makeupStyles?.look;
 if(makeupLook(look)?.ai||!makeupLook(look)||previous.portraitMode!==replacement.portraitMode||portraitFinishChoice(previous.femaleEyeStyle,previous.initialFemaleEyeStyle)!==portraitFinishChoice(replacement.femaleEyeStyle,replacement.initialFemaleEyeStyle))return replacement;
 if(typeof render!=='function')throw Error('ยังคืนค่าปรับผิวเดิมไม่ได้ · เก็บภาพเดิมไว้');
 const value=Number(previous.makeupIntensity??100),intensity=Number.isFinite(value)?Math.max(0,Math.min(100,value)):100;
 const base=toSource(replacement.source),full=await render(base,{look});
 if(!full)throw Error('ยังปรับผิวเดิมบนทรงใหม่ไม่ได้ · เก็บภาพเดิมไว้');
 const source=intensity===100?full:await mix(base,full,intensity);
 return {...replacement,source,processedOriginalSource:replacement.source,makeupBaseSource:base,makeupCleanBaseSource:base,makeupFullSource:intensity===100?null:full,makeupStyles:{look},makeupIntensity:intensity,makeupRenderVersion:'skin-current-layer-v2'};
}
