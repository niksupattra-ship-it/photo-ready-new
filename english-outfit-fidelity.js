import sharp from 'sharp';

export {ENGLISH_OUTFIT_FIDELITY_VERSION} from './english-outfit-fidelity-version.js';

// Two additional views of the SAME selected asset. Never enhance, recolour,
// sharpen, invent swatches or replace the full garment/layout reference.
export async function createEnglishOutfitDetailReference(outfit){
 const {data,info}=await sharp(outfit).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let left=info.width,top=info.height,right=-1,bottom=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>16){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)}
 if(right<left)throw Error('Selected outfit reference is empty.');
 const width=right-left+1,height=bottom-top+1;
 const upper={left,top,width,height:Math.max(1,Math.ceil(height*.55))};
 const centre={left:left+Math.floor(width*.2),top:top+Math.floor(height*.12),width:Math.max(1,Math.floor(width*.6)),height:Math.max(1,Math.floor(height*.7))};
 const panels=await Promise.all([upper,centre].map(region=>sharp(outfit).extract(region).resize({width:768,height:768,fit:'contain',background:{r:0,g:0,b:0,alpha:0},withoutEnlargement:true}).png().toBuffer()));
 return sharp({create:{width:1536,height:768,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(panels.map((input,i)=>({input,left:i*768,top:0}))).png().toBuffer();
}

export function englishOutfitFidelityInstruction(outfitIndex,detailIndex){return `
FINAL SELECTED OUTFIT COLOUR AND DETAIL AUTHORITY — ENGLISH ONLY:
Image ${outfitIndex} is the complete selected garment and the sole authority for garment colour, construction and material. Image ${detailIndex} contains two crops of that EXACT same asset: LEFT shows the upper garment/collar/shoulders; RIGHT shows the central placket, inner layers and visible fasteners. These are inspection details only, never a second outfit, a collage to return, a new silhouette or a scale/placement guide. Image 1 and the existing full composition retain their geometry authority.
Reproduce the selected garment's actual hue, saturation, lightness, fabric weave, texture, sheen and pattern scale. Keep each differently coloured jacket, inner shirt/blouse, tie, ribbon and trim distinct. Do not substitute a similar-looking garment or neutralise navy into black, cream/ivory into white, or muted colours into vivid colours. Preserve the reference's fabric exposure and white balance; adapt face/neck lighting to the outfit rather than relighting, bleaching or recolouring the clothing.
Match the exact visible collar/lapel shape and notch, neckline depth, overlapping layers, seams, stitching, pockets, button count and spacing, button material, piping, bows and embroidery. Preserve visible insignia, ribbons and badges in their original position and orientation; do not invent, mirror, remove or redesign them. Only reproduce markings actually visible; do not fabricate hidden text or accessories. Preserve the full shoulder/torso silhouette and existing outfit scale. Hair, skin-light and Makeup references supply NO garment colours, fabric, jewellery or clothing details.
Before returning, compare the garment against the full reference and both detail views: colour of each material, collar edges, inner layers, fastener count/spacing, pocket locations, trim and insignia. Resolve differences within this SAME generation. Return one coherent portrait, never panels or reference labels. Makeup/skin correction applies to skin only and must not change the selected garment. This rule does not change facial identity, selected hair, approved head/body proportions, output dimensions or cutout requirements.
`;}
