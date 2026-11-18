import {fileURLToPath} from 'node:url';
import {loadStudioSkinLightReference} from './studio-skin-light-reference.js';

// Reuse the existing identity-free six-swatch studio-light guide. It carries
// no reference face; use illumination/material only, never a target skin tone.
export async function loadMakeupStudioReference(root=fileURLToPath(new URL('.',import.meta.url))){
 try{return await loadStudioSkinLightReference(root)}catch{return null}
}
export function makeupStudioReferenceInstruction(index){
 if(!Number.isInteger(index)||index<2)throw Error('Invalid Makeup reference index');
 return '\nMAKEUP LIGHT GUIDE — IMAGE '+index+': This identity-free swatch board is for broad soft-light gradients, restrained highlight rolloff and subtle photographic surface response only. Preserve the input person’s own complexion depth, undertone, identifying marks and facial anatomy. Do not copy swatch RGB, grids, borders, texture dots, or use it as a target skin colour. Keep the garment, hair, canvas and all earlier indexed reference roles unchanged. The swatch board is not a portrait or a makeup palette. Use the existing final Makeup authority for the cosmetic finish and balanced application. Output one photographic portrait, not the guide or a collage.\n';
}
