import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import boundaries from './english-hair-boundaries.json' with {type:'json'};
import {selectedHairDesign} from './hairstyle-catalog.js';

// The photographic picker includes the neck-side absence of hair. The earlier
// isolated cutout alone did not show that context, particularly for 66–78.
// Retain both pieces of evidence in the SAME reference slot / generation.
export async function englishSelectedHairReference({selected,hair,root}){
 const entry=boundaries[selected?.id];
 if(selected?.interfaceLanguage!=='en'||!hair)return hair;
 if(!entry)throw Error('Selected hairstyle boundary reference is unavailable. Please refresh and try again.');
 const preview=await readFile(path.join(root,'public',entry.preview.slice(1)));
 if(createHash('sha256').update(preview).digest('hex')!==entry.previewSha256)throw Error('Hairstyle boundary reference changed. Please refresh and try again.');
 const {width,height}=await sharp(preview).metadata();
 const xs=entry.faceOval.map(p=>p.x*width),ys=entry.faceOval.map(p=>p.y*height),pad=width*.02;
 const faceMask=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="${Math.min(...xs)-pad}" y="${Math.min(...ys)-pad}" width="${Math.max(...xs)-Math.min(...xs)+pad*2}" height="${Math.max(...ys)-Math.min(...ys)+pad*2}" fill="#bdc3cb"/></svg>`);
 const context=await sharp(preview).composite([{input:faceMask}]).resize({width:480,height:704,fit:'inside',withoutEnlargement:false}).png().toBuffer();
 const design=await sharp(hair).flatten({background:'#356bd8'}).resize({width:480,height:704,fit:'inside',withoutEnlargement:false}).png().toBuffer();
 const [d,c]=await Promise.all([sharp(design).metadata(),sharp(context).metadata()]);
 const labels=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><g fill="white" font-family="sans-serif" font-size="17"><text x="32" y="27">EXACT SELECTED HAIR</text><text x="544" y="27">SELECTED LENGTH / NECK BOUNDARY</text></g></svg>');
 const board=await sharp({create:{width:1024,height:768,channels:3,background:'#356bd8'}}).composite([
  {input:design,left:Math.round((512-d.width)/2),top:48},
  {input:context,left:512+Math.round((512-c.width)/2),top:48},
  {input:labels,left:0,top:0}
 ]).png().toBuffer();
 return sharp(board).removeAlpha().png().toBuffer();
}

export function englishSelectedHairBoundaryInstruction(selected){
 const design=selectedHairDesign(selected);if(!design)return '';
 const contract=design.kind==='long'
  ?'LONG SELECTED DESIGN: retain its actual connected long sections and complete ends, including any intended shoulder-side lengths. Do not shorten it to a bob, gather it, or erase genuine long hair to expose the neck. Equally, add NO extra underlayer, nape tail, rear curtain, thickness or length absent from the selected design.'
  :design.kind==='bob'
  ?'BOB SELECTED DESIGN: match the actual jaw/neck/shoulder endpoint on each side. Preserve its continuous bob edge, deliberate fringe and any reference flicks. Add NO second layer below that edge, back curtain, mullet or neck tail; do not replace this bob with a pixie or updo.'
  :design.kind==='gathered'
  ?'GATHERED SELECTED DESIGN: preserve the exact gathering, braid and intentional wisps shown. Hair absent beside the neck stays absent; do not generate loose back lengths, a ponytail extension or a second rear hairstyle.'
  :'SHORT SELECTED DESIGN: keep the chosen top, fringe, curls, colour and side taper exactly. The neck-side spaces below the reference ends must remain hair-free. No invented rear hair behind either ear, wispy nape spikes, mullet, neck tufts or locks touching the collar. Preserve the natural short nape and reference sideburns without shaving them away.';
 return `FINAL SELECTED HAIR BOUNDARY AUTHORITY — ${selected.id}: ${contract}
${selected.interfaceLanguage==='en'?'Image 2 is ONE two-panel reference board: LEFT is the exact selected hair; RIGHT is its actual picker photograph with donor facial features blanked, showing where that cut ends relative to the ears, jaw and neck. These are two views of ONE hairstyle, never two hairstyles or two people to generate. Use right-panel neck-side negative space as evidence of ABSENT hair, not a region to complete with more strands. Use the left panel for complete intended strands and lengths, including long ends beyond a context-photo crop. Copy neither donor skin/ears/neck, reference clothes, grey face patch, blue panels nor text.':''}
The uploaded person and all earlier generated results have ZERO authority over the replacement hair length. Replace conflicting source hair completely; do not retain old hair behind the new crown. Keep the customer's own face, ears, jaw, neck and outfit. Before returning inspect BOTH neck sides and the nape: every visible hair section must belong to this selected design. These reference-specific endpoints override generic clean-ear, rear-placement, maximum-length and style-completion wording. Apply within this same generation.`;
}
